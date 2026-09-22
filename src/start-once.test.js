import assert from 'node:assert/strict';
import test from 'node:test';
import { createSingleStart } from './start-once.js';

test('startup callback runs once even when invoked repeatedly', function () {
  let calls = 0;
  const startOnce = createSingleStart(() => { calls++; });
  assert.equal(startOnce(), true);
  assert.equal(startOnce(), false);
  assert.equal(startOnce(), false);
  assert.equal(calls, 1);
});
