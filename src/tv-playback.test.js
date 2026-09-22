import test from 'node:test';
import assert from 'node:assert/strict';
import { createTvPlayback } from './tv-playback.js';

function fixture(playImplementation = null) {
  const tracks = [];
  const stream = { getTracks: () => tracks, addTrack: track => tracks.push(track) };
  const listeners = new Map();
  const video = {
    srcObject: null, paused: true, muted: false, playCalls: 0,
    play() {
      this.playCalls++;
      if (playImplementation) return playImplementation(this);
      this.paused = false;
      return Promise.resolve();
    },
    addEventListener: (event, callback) => listeners.set(event, callback),
    removeEventListener: event => listeners.delete(event),
  };
  const statuses = [];
  const fallback = { hidden: true };
  const playback = createTvPlayback(video, stream,
    { status: value => statuses.push(value), remoteTrack() {} },
    { record() {} }, fallback);
  return { stream, tracks, video, statuses, fallback, listeners, playback };
}

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test('initial user activation primes muted playback before a remote stream exists', async () => {
  const f = fixture();
  f.playback.prime();
  await tick();
  assert.equal(f.video.playCalls, 1);
  assert.equal(f.video.muted, true);
  assert.equal(f.fallback.hidden, true);
});

test('a later video track starts playback automatically on the primed element', async () => {
  const f = fixture();
  f.playback.prime();
  await tick();
  f.playback.addTrack({ kind: 'audio' });
  f.playback.addTrack({ kind: 'video' });
  await tick();
  assert.equal(f.video.playCalls, 2);
  assert.equal(f.video.srcObject, f.stream);
  assert.equal(f.fallback.hidden, true);
  assert.equal(f.video.muted, false);
});

test('rejected automatic playback reveals the manual OK fallback', async () => {
  const f = fixture(video => { video.paused = true; return Promise.reject(new Error('autoplay')); });
  f.playback.prime();
  await tick();
  f.playback.addTrack({ kind: 'video' });
  await tick();
  assert.equal(f.fallback.hidden, false);
  assert.equal(f.statuses.at(-1), 'Pulsa OK para ver y escuchar');
});

test('successful fallback playback hides the button again', async () => {
  let reject = true;
  const f = fixture(video => {
    if (reject) { video.paused = true; return Promise.reject(new Error('autoplay')); }
    video.paused = false;
    return Promise.resolve();
  });
  f.playback.prime();
  await tick();
  f.playback.addTrack({ kind: 'video' });
  await tick();
  assert.equal(f.fallback.hidden, false);
  reject = false;
  f.playback.play();
  await tick();
  assert.equal(f.fallback.hidden, true);
  assert.equal(f.video.muted, false);
});
