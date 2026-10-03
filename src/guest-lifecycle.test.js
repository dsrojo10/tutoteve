import assert from 'node:assert/strict';
import test from 'node:test';
import { createGuestCallLifecycle, signalingErrorCategory } from './guest-lifecycle.js';

function fixture() {
  const calls = { starts: 0, stops: 0 };
  const states = [];
  const lifecycle = createGuestCallLifecycle({
    start() { calls.starts += 1; },
    stop() { calls.stops += 1; },
  }, state => states.push(state));
  return { calls, states, lifecycle };
}

test('guest requests captions once while the session remains active', () => {
  const { calls, states, lifecycle } = fixture();
  lifecycle.captions({ supported: true, recognitionAttempt: 0 });
  lifecycle.startCaptions();
  lifecycle.startCaptions();
  assert.equal(calls.starts, 1);
  assert.equal(states.at(-1).captionsStartRequested, true);
  assert.equal(states.at(-1).callEnded, false);
  assert.equal(states.at(-1).recognitionAttempt, 0);
});

test('explicit end stops active captions and blocks another start', () => {
  const { calls, states, lifecycle } = fixture();
  lifecycle.startCaptions();
  lifecycle.endedBy('tv');
  lifecycle.startCaptions();
  assert.equal(calls.starts, 1);
  assert.equal(calls.stops, 1);
  assert.equal(states.at(-1).callEndedReason, 'explicit-end');
  assert.equal(states.at(-1).endedBySeen, true);
});

test('a removed session is diagnosed without a UID and cannot start captions', () => {
  const { calls, states, lifecycle } = fixture();
  lifecycle.sessionRemoved();
  lifecycle.startCaptions();
  assert.equal(calls.starts, 0);
  assert.equal(calls.stops, 1);
  assert.equal(states.at(-1).sessionRemovedSeen, true);
  assert.equal(states.at(-1).callEndedReason, 'session-removed');
  assert.equal(states.at(-1).errorCategory, 'session-removed');
});

test('signaling failures expose only a safe technical category', () => {
  assert.equal(signalingErrorCategory({ code: 'PERMISSION_DENIED', message: 'private path' }), 'permission-denied');
  assert.equal(signalingErrorCategory(new Error('private path')), 'signaling-error');
});
