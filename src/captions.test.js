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
  assert.equal(captions.supported, false);
  captions.start(); captions.stop();
});

test('finals and interim publish rolling text; restart backs off and stop cancels it', async () => {
  const timers = fakeTimers(); const published = []; const states = [];
  let recognition;
  class FakeRecognition {
    constructor() { recognition = this; this.starts = 0; }
    start() { this.starts += 1; this.onstart(); }
    stop() { this.onend(); }
  }
  const captions = createSpeechCaptions(FakeRecognition, value => published.push(value), state => states.push(state), timers);
  captions.start();
  assert.equal(recognition.lang, 'es-CO');
  assert.equal(recognition.continuous, true);
  assert.equal(recognition.interimResults, true);
  recognition.onresult({ results: [{ 0: { transcript: 'Hola. ' }, isFinal: true }, { 0: { transcript: 'Cómo es' }, isFinal: false }] });
  timers.run(); await Promise.resolve();
  assert.deepEqual(published, ['Hola. Cómo es']);
  recognition.onresult({ results: [{ 0: { transcript: 'Hola. ' }, isFinal: true }, { 0: { transcript: 'Cómo estás?' }, isFinal: true }] });
  timers.run(); await Promise.resolve();
  assert.deepEqual(published, ['Hola. Cómo es', 'Hola. Cómo estás?']);
  recognition.onend();
  assert.equal(states.at(-1).running, false);
  timers.run(); await Promise.resolve();
  assert.equal(timers.run(), 1000);
  assert.equal(recognition.starts, 2);
  recognition.onend();
  assert.equal(states.at(-1).restartCount, 2);
  captions.stop();
  assert.equal(timers.pending.size, 0);
});

test('permission error stops automatic restart', () => {
  const timers = fakeTimers(); let recognition;
  class FakeRecognition { constructor() { recognition = this; } start() { this.onstart(); } stop() { this.onend(); } }
  const captions = createSpeechCaptions(FakeRecognition, () => {}, () => {}, timers);
  captions.start();
  recognition.onerror({ error: 'not-allowed' });
  recognition.onend();
  assert.equal(timers.pending.size, 0);
});
