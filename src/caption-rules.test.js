import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const rules = JSON.parse(readFileSync(new URL('../firebase.database.rules.json', import.meta.url))).rules;
const current = rules.sessions.$sessionId.captions.current;
function snapshot(value) {
  return {
    val: () => value ?? null,
    exists: () => value != null,
    child: key => snapshot(value?.[key]),
    hasChildren: keys => keys.every(key => value?.[key] != null),
    isString: () => typeof value === 'string',
    isNumber: () => typeof value === 'number',
  };
}
function allowed(uid, session, proposed) {
  const root = snapshot({ sessions: { room: session } });
  const scope = { auth: uid && { uid }, root, now: 1000, $sessionId: 'room', newData: snapshot(proposed) };
  return runInNewContext(current['.write'], scope) && (!proposed || (
    runInNewContext(current['.validate'], scope)
    && Object.keys(proposed).every(key => key !== 'text' && key !== 'updatedAt' ? false : runInNewContext(current[key]['.validate'], { ...scope, newData: snapshot(proposed[key]) }))
  ));
}
test('only assigned guest may write bounded captions during live session', () => {
  const session = { ownerUid: 'tv', expiresAt: 2000, roles: { tutoPhoneUid: 'tuto', guestPhoneUid: 'guest' } };
  const caption = { text: 'Hola', updatedAt: 1000 };
  assert.equal(allowed('guest', session, caption), true);
  assert.equal(allowed('tv', session, caption), false);
  assert.equal(allowed('tuto', session, caption), false);
  assert.equal(allowed(null, session, caption), false);
  assert.equal(allowed('guest', { ...session, expiresAt: 1000 }, caption), false);
  assert.equal(allowed('guest', { ...session, endedBy: 'tv' }, caption), false);
  assert.equal(allowed('guest', session, { ...caption, text: 'x'.repeat(241) }), false);
  assert.equal(allowed('guest', session, { ...caption, extra: 'history' }), false);
  assert.equal(allowed('guest', session, null), true);
  assert.match(rules.sessions.$sessionId['.read'], /guestPhoneUid/);
});
