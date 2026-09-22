import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const rules = JSON.parse(readFileSync(new URL('../firebase.database.rules.json', import.meta.url), 'utf8'));
const pairing = rules.rules.pairingCodes.$code;
const expectedReadRule = "auth != null && (!data.exists() || data.child('expiresAt').val() > now)";

function canReadPairingCode(authenticated, code, now) {
  return authenticated && (!code || code.expiresAt > now);
}

test('pairing transaction can read and reserve a missing code only when authenticated', function () {
  assert.equal(pairing['.read'], expectedReadRule);
  assert.equal(canReadPairingCode(true, null, 1000), true);
  assert.equal(canReadPairingCode(false, null, 1000), false);
});

test('expired pairing codes stay unreadable and initial reservation keeps ownership validation', function () {
  assert.equal(canReadPairingCode(true, { expiresAt: 1000 }, 1000), false);
  assert.match(pairing['.write'], /!data\.exists\(\).*newData\.child\('ownerUid'\)\.val\(\) === auth\.uid/);
  assert.match(pairing['.validate'], /ownerUid.*expiresAt/);
});
