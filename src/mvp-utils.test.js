import assert from 'node:assert/strict';
import test from 'node:test';
import { isInviteToken } from './mvp-utils.js';
test('accepts only a 24-byte hexadecimal invitation token', function () { assert.equal(isInviteToken('a'.repeat(48)), true); assert.equal(isInviteToken('a'.repeat(47)), false); assert.equal(isInviteToken('Z'.repeat(48)), false); });
