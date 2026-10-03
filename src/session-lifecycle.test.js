import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createGuestCallLifecycle } from './guest-lifecycle.js';

const rules = JSON.parse(readFileSync(new URL('../firebase.database.rules.json', import.meta.url))).rules;

test('TV Firebase disconnect preserves the active session and pairing code; explicit cleanup removes both', async () => {
  const source = readFileSync(new URL('./signaling.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  const records = new Map();
  const disconnectRemovals = [];
  const removed = [];
  const scope = {
    db: {},
    Date: { now: () => 1000 },
    crypto: { getRandomValues(value) { value.fill(1); return value; } },
    Uint8Array, Uint32Array, Array, String, Promise,
    ref: (_db, path) => path,
    async set(path, value) { records.set(path, value); },
    async remove(path) { records.delete(path); removed.push(path); },
    async runTransaction(path, update) {
      const value = update(records.get(path) ?? null);
      if (value === undefined) return { committed: false };
      records.set(path, value);
      return { committed: true };
    },
    onDisconnect(path) { return { remove() { disconnectRemovals.push(path); return Promise.resolve(); } }; },
  };
  const { createSession, cleanupSession } = runInNewContext(source + '\n({ createSession, cleanupSession })', scope);
  const room = await createSession('tv');
  assert.equal(disconnectRemovals.length, 0);
  assert.equal(records.get('sessions/' + room.sessionId).ownerUid, 'tv');
  assert.equal(records.get('pairingCodes/' + room.code).sessionId, room.sessionId);
  // A Firebase disconnect runs only registered onDisconnect operations.
  for (const path of disconnectRemovals) await scope.remove(path);
  assert.equal(records.has('sessions/' + room.sessionId), true);
  assert.equal(records.has('pairingCodes/' + room.code), true);
  const captions = { starts: 0, stops: 0 };
  const guest = createGuestCallLifecycle({
    start() { captions.starts += 1; },
    stop() { captions.stops += 1; },
  }, () => {});
  guest.startCaptions();
  assert.deepEqual(captions, { starts: 1, stops: 0 });
  await cleanupSession(room.sessionId, room.code);
  assert.deepEqual(removed.sort(), ['pairingCodes/' + room.code, 'sessions/' + room.sessionId].sort());
});

test('expired physical records cannot be read or used by new participants', () => {
  const sessionRead = rules.sessions.$sessionId['.read'];
  const pairingRead = rules.pairingCodes.$code['.read'];
  const inviteRead = rules.invites.$token['.read'];
  const signalWrites = rules.sessions.$sessionId.signals;
  function snapshot(value) { return { exists: () => value != null, val: () => value ?? null, child: key => snapshot(value?.[key]) }; }
  const session = { ownerUid: 'tv', expiresAt: 2000, roles: { guestPhoneUid: 'guest' } };
  const code = { expiresAt: 2000 };
  const invite = { expiresAt: 2000 };
  for (const now of [1000, 2000]) {
    assert.equal(runInNewContext(sessionRead, { auth: { uid: 'guest' }, data: snapshot(session), now }), now < 2000);
    assert.equal(runInNewContext(pairingRead, { auth: { uid: 'guest' }, data: snapshot(code), now }), now < 2000);
    assert.equal(runInNewContext(inviteRead, { auth: { uid: 'guest' }, data: snapshot(invite), now }), now < 2000);
    for (const [rule, uid] of [
      [signalWrites.tutoGuest.tuto['.write'], 'tuto'],
      [signalWrites.tutoGuest.guest['.write'], 'guest'],
      [signalWrites.guestTv.guest['.write'], 'guest'],
      [signalWrites.guestTv.tv['.write'], 'tv'],
    ]) {
      const root = snapshot({ sessions: { session: { ...session, roles: { ...session.roles, tutoPhoneUid: 'tuto' } } } });
      assert.equal(runInNewContext(rule, { auth: { uid }, root, now, $sessionId: 'session' }), now < 2000);
    }
  }
});
