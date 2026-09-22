import assert from 'node:assert/strict';
import test from 'node:test';
import { createCaptionContext, createSpeechCaptions } from './captions.js';

function fakeTimers() {
  const pending = new Map();
  let next = 0;
  return {
    setTimeout(callback, delay) { pending.set(++next, { callback, delay }); return next; },
    clearTimeout(id) { pending.delete(id); },
    run() { const [id, item] = pending.entries().next().value; pending.delete(id); item.callback(); return item.delay; },
    pending,
  };
}

test('rolling context keeps recent finals and current interim within limit', () => {
  const context = createCaptionContext(32, 2);
  context.addFinal('Primera frase.');
  context.addFinal('Segunda frase.');
  assert.equal(context.setInterim('Ahora hablo'), 'Primera frase. Segunda frase. Ahora hablo'.slice(-32).replace(/^\S*\s/, ''));
  context.addFinal('Tercera frase.');
  assert.doesNotMatch(context.text(), /Primera/);
  assert.match(context.text(), /Tercera frase/);
  context.setInterim('Una palabra muy larga que se va acumulando indefinidamente');
  assert.ok(context.text().length <= 32);
  context.clear();
  assert.equal(context.text(), '');
});

test('missing SpeechRecognition leaves call caption feature inert', () => {
  const states = []; const published = [];
  const captions = createSpeechCaptions(undefined, value => published.push(value), state => states.push(state));
  captions.start(); captions.stop();
  assert.equal(captions.supported, false);
  assert.equal(states.at(-1).running, false);
  assert.deepEqual(published, []);
});

test('recognition constructor failure also leaves captions inert', () => {
  class BrokenRecognition { constructor() { throw new Error('Unavailable'); } }
  const captions = createSpeechCaptions(BrokenRecognition, () => {}, () => {});
  captions.start();
  assert.equal(captions.supported, false);
  captions.stop();
});

test('short sessions create a new recognizer, publish finals, and restart after end', async () => {
  const timers = fakeTimers(); const published = []; const states = []; const recognitions = [];
  class FakeRecognition {
    constructor() { recognitions.push(this); this.starts = 0; }
    start() { this.starts += 1; this.onstart(); }
    abort() { this.onend(); }
  }
  const captions = createSpeechCaptions(FakeRecognition, value => published.push(value), state => states.push(state), timers);
  captions.start();
  assert.equal(recognitions[0].lang, 'es-CO');
  assert.equal(recognitions[0].continuous, false);
  assert.equal(recognitions[0].interimResults, false);
  recognitions[0].onresult({ resultIndex: 0, results: [{ 0: { transcript: 'Hola. ' }, isFinal: true }] });
  await Promise.resolve();
  assert.deepEqual(published, ['Hola.']);
  recognitions[0].onend();
  assert.equal(states.at(-1).running, false);
  assert.equal(timers.run(), 850);
  assert.equal(recognitions.length, 2);
  assert.notEqual(recognitions[0], recognitions[1]);
  assert.equal(states.at(-1).recognitionAttempt, 2);
  captions.stop();
  assert.equal(timers.pending.size, 0);
});

test('aborted retries with a longer delay and permission errors do not retry', () => {
  const timers = fakeTimers(); const recognitions = [];
  class FakeRecognition { constructor() { recognitions.push(this); } start() { this.onstart(); } abort() { this.onend(); } }
  const captions = createSpeechCaptions(FakeRecognition, () => {}, () => {}, timers);
  captions.start();
  recognitions[0].onerror({ error: 'aborted' });
  recognitions[0].onend();
  assert.equal(timers.run(), 1600);
  assert.equal(recognitions.length, 2);
  recognitions[1].onerror({ error: 'aborted' });
  recognitions[1].onend();
  assert.equal(timers.run(), 3200);
  assert.equal(recognitions.length, 3);
  recognitions[2].onerror({ error: 'not-allowed' });
  recognitions[2].onend();
  assert.equal(timers.pending.size, 0);
});

test('stop aborts the active session and prevents its end event from restarting', () => {
  const timers = fakeTimers(); const recognitions = [];
  class FakeRecognition { constructor() { recognitions.push(this); } start() { this.onstart(); } abort() { this.aborted = true; this.onend(); } }
  const captions = createSpeechCaptions(FakeRecognition, () => {}, () => {}, timers);
  captions.start();
  captions.stop();
  assert.equal(recognitions[0].aborted, true);
  assert.equal(timers.pending.size, 0);
  assert.equal(recognitions.length, 1);
});

test('published rolling context remains bounded to 240 characters', async () => {
  const timers = fakeTimers(); const published = []; const recognitions = [];
  class FakeRecognition { constructor() { recognitions.push(this); } start() { this.onstart(); } }
  const captions = createSpeechCaptions(FakeRecognition, value => published.push(value), () => {}, timers);
  captions.start();
  recognitions[0].onresult({ resultIndex: 0, results: [{ 0: { transcript: 'x'.repeat(300) }, isFinal: true }] });
  await Promise.resolve();
  assert.equal(published[0].length, 240);
});
