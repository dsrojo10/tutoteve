import assert from 'node:assert/strict';
import test from 'node:test';
import { createWhisperChunker, resampleTo16k } from './whisper-chunks.js';

test('continuous microphone samples become 2.5-second chunks with voice-end estimates', () => {
  const chunks = [];
  const chunker = createWhisperChunker(16000, chunk => chunks.push(chunk));
  for (let index = 0; index < 5; index += 1) chunker.push(new Float32Array(16000).fill(0.1));
  assert.equal(chunks.length, 2);
  assert.deepEqual(chunks.map(chunk => chunk.audio.length), [40000, 40000]);
  assert.deepEqual(chunks.map(chunk => chunk.endedAtMs), [2500, 5000]);
  assert.deepEqual(chunks.map(chunk => chunk.speechEndedAtMs), [2500, 5000]);
  assert.equal(chunker.seconds, 5);
});

test('a partial final chunk is flushed and silence has no false voice-end time', () => {
  const chunks = [];
  const chunker = createWhisperChunker(16000, chunk => chunks.push(chunk));
  chunker.push(new Float32Array(16000));
  chunker.flush();
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].speechEndedAtMs, null);
  assert.equal(chunks[0].durationSeconds, 1);
});

test('one minute of capture produces 24 ordered chunks without losing audio', () => {
  const chunks = [];
  const chunker = createWhisperChunker(48000, chunk => chunks.push(chunk));
  for (let second = 0; second < 60; second += 1) chunker.push(new Float32Array(48000));
  assert.equal(chunker.seconds, 60);
  assert.equal(chunks.length, 24);
  assert.equal(chunks.at(-1).number, 24);
  assert.equal(chunks.at(-1).endedAtMs, 60000);
});

test('audio is resampled to the 16 kHz input expected by Whisper', () => {
  const input = new Float32Array(48000).fill(0.25);
  const output = resampleTo16k(input, 48000);
  assert.equal(output.length, 16000);
  assert.equal(output[100], 0.25);
  assert.equal(resampleTo16k(output, 16000), output);
});
