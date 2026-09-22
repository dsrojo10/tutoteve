import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const rules = JSON.parse(readFileSync(new URL('../firebase.database.rules.json', import.meta.url), 'utf8'));
const source = readFileSync(new URL('./signaling.js', import.meta.url), 'utf8');
const roles = rules.rules.sessions.$sessionId.roles;

function canClaim(authenticated, currentUid, proposedUid, authUid, expiresAt, now) {
  return authenticated && expiresAt > now && currentUid === null && proposedUid === authUid;
}

test('Tuto can claim an empty role and another Tuto cannot replace it', function () {
  assert.equal(canClaim(true, null, 'tuto-a', 'tuto-a', 2000, 1000), true);
  assert.equal(canClaim(true, 'tuto-a', 'tuto-b', 'tuto-b', 2000, 1000), false);
});

test('guest can claim an empty role and another guest cannot replace it', function () {
  assert.equal(canClaim(true, null, 'guest-a', 'guest-a', 2000, 1000), true);
  assert.equal(canClaim(true, 'guest-a', 'guest-b', 'guest-b', 2000, 1000), false);
});

test('unauthenticated, expired, and already claimed roles remain blocked', function () {
  assert.equal(canClaim(false, null, 'tuto-a', 'tuto-a', 2000, 1000), false);
  assert.equal(canClaim(true, null, 'guest-a', 'guest-a', 1000, 1000), false);
  assert.equal(canClaim(true, 'guest-a', 'guest-a', 'guest-a', 2000, 1000), false);
});

test('both role rules protect first claim and signaling uses direct writes', function () {
  ['tutoPhoneUid', 'guestPhoneUid'].forEach(function (role) {
    assert.match(roles[role]['.write'], /auth != null/);
    assert.match(roles[role]['.write'], /expiresAt/);
    assert.match(roles[role]['.write'], /data\.val\(\) === null/);
    assert.match(roles[role]['.write'], /newData\.val\(\) === auth\.uid/);
  });
  assert.match(source, /async function claimRole\([^)]*\) \{ await set\(roleRef/);
  assert.doesNotMatch(source, /runTransaction\(ref\(db, 'sessions\/' \+ .*roles/);
});
