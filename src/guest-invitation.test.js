import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { inviteUrl, isGuestRoute } from './mvp-utils.js';

const rules = JSON.parse(readFileSync(new URL('../firebase.database.rules.json', import.meta.url))).rules;
const token = 'a'.repeat(48);
// Evaluate the actual rule expressions with snapshots, not a duplicated predicate.
// These unit tests do not replace Firebase Emulator integration tests.
function snapshot(tree, path = []) {
  const value = path.reduce((node, key) => node?.[key], tree) ?? null;
  return {
    val: () => value,
    exists: () => value !== null,
    child: key => snapshot(tree, [...path, key]),
    parent: () => snapshot(tree, path.slice(0, -1)),
  };
}
function fixture() {
  return {
    sessions: { session: { expiresAt: 2000, inviteToken: token, roles: {} } },
    invites: { [token]: { sessionId: 'session', expiresAt: 2000 } },
  };
}
function allows(expression, tree, path, uid, proposed = uid) {
  return runInNewContext(expression, {
    auth: uid === null ? null : { uid }, now: 1000,
    root: snapshot(tree), data: snapshot(tree, path),
    newData: snapshot(proposed), $token: token, $sessionId: 'session',
  });
}
const inviteWrite = rules.invites.$token.guestPhoneUid['.write'];
const guestWrite = rules.sessions.$sessionId.roles.guestPhoneUid['.write'];
const invitePath = ['invites', token, 'guestPhoneUid'];
const guestPath = ['sessions', 'session', 'roles', 'guestPhoneUid'];

test('first guest claims invitation then role; same guest can continue; competitor cannot replace either', () => {
  const tree = fixture();
  assert.equal(allows(guestWrite, tree, guestPath, 'guest'), false);
  assert.equal(allows(inviteWrite, tree, invitePath, 'guest'), true);
  tree.invites[token].guestPhoneUid = 'guest';
  assert.equal(allows(guestWrite, tree, guestPath, 'guest'), true);
  tree.sessions.session.roles.guestPhoneUid = 'guest';
  for (const [rule, path] of [[inviteWrite, invitePath], [guestWrite, guestPath]]) {
    assert.equal(allows(rule, tree, path, 'guest'), true);
    assert.equal(allows(rule, tree, path, 'other'), false);
    assert.equal(allows(rule, tree, path, 'guest', null), false);
  }
});

test('missing or expired invitation, unauthenticated and forged UID claims are blocked', () => {
  const tree = fixture();
  assert.equal(allows(inviteWrite, tree, invitePath, null, 'guest'), false);
  assert.equal(allows(inviteWrite, tree, invitePath, 'guest', 'other'), false);
  tree.invites[token].expiresAt = 1000;
  assert.equal(allows(inviteWrite, tree, invitePath, 'guest'), false);
  delete tree.invites[token];
  assert.equal(allows(inviteWrite, tree, invitePath, 'guest'), false);
});

test('session claim requires matching invitation ownership and live session', () => {
  const tree = fixture();
  tree.invites[token].guestPhoneUid = 'guest';
  assert.equal(allows(guestWrite, tree, guestPath, null, 'guest'), false);
  tree.invites[token].sessionId = 'another-session';
  assert.equal(allows(guestWrite, tree, guestPath, 'guest'), false);
  tree.invites[token].sessionId = 'session';
  tree.sessions.session.expiresAt = 1000;
  assert.equal(allows(guestWrite, tree, guestPath, 'guest'), false);
  assert.equal(allows(inviteWrite, tree, invitePath, 'guest'), false);
});

test('shared URL retains Pages path and token, removing old search/hash', () => {
  const expected = 'https://dsrojo10.github.io/tutoteve/?invite=' + token;
  for (const path of ['/tutoteve/', '/tutoteve/index.html?debug=1#old']) {
    assert.equal(inviteUrl(token, 'https://dsrojo10.github.io' + path), expected);
  }
});

test('invite parameter selects guest flow even when invalid; no invite selects Tuto', () => {
  assert.equal(isGuestRoute('?invite=' + token), true);
  assert.equal(isGuestRoute('?debug=1&invite='), true);
  assert.equal(isGuestRoute(''), false);
  assert.equal(isGuestRoute('?debug=1'), false);
});

test('existing invitation cannot be overwritten through its parent write permission', () => {
  const tree = fixture();
  tree.invites[token].guestPhoneUid = 'guest';
  assert.equal(allows(rules.invites.$token['.write'], tree, ['invites', token], 'guest', {
    sessionId: 'another-session', expiresAt: 2000, guestPhoneUid: 'other',
  }), false);
});

test('app routing hides Tuto controls and loads guest module for an invitation', () => {
  const app = readFileSync(new URL('./app.js', import.meta.url), 'utf8')
    .replace("import { isGuestRoute } from './mvp-utils.js';", '')
    .replaceAll('import(', 'loadModule(');
  for (const search of ['?invite=' + token, '']) {
    const nodes = Object.fromEntries(['tuto-screen', 'guest-screen', 'status', 'debug',
      'local-video', 'end-call', 'guest-status', 'guest-debug', 'guest-local-video',
      'guest-end-call'].map(id => [id, { id, hidden: true }]));
    const loaded = [];
    runInNewContext(app, {
      location: { search }, isGuestRoute,
      document: { getElementById: id => nodes[id] },
      loadModule: name => loaded.push(name),
    });
    const guest = isGuestRoute(search);
    assert.equal(nodes['tuto-screen'].hidden, guest);
    assert.equal(nodes['guest-screen'].hidden, !guest);
    assert.deepEqual(loaded, [guest ? './guest.js' : './sender.js']);
  }
});
