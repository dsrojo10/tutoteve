import test from 'node:test';
import assert from 'node:assert/strict';
import { videoSnapshot, observeVideo } from './video-diagnostics.js';

function fakeVideo() {
  const listeners = new Map();
  return {
    paused: false, ended: false, readyState: 4, networkState: 2,
    currentTime: 10, duration: Infinity, videoWidth: 640, videoHeight: 360,
    playbackRate: 1, muted: false, volume: 1,
    srcObject: { id: 'private-stream', getTracks: () => [
      { id: 'private-track', label: 'private-device', kind: 'video', readyState: 'live', muted: false, enabled: true },
    ] },
    listeners,
    addEventListener: (event, listener) => listeners.set(event, listener),
    removeEventListener: event => listeners.delete(event),
  };
}

test('video snapshot reports safe playback and track state, handles infinite duration', () => {
  const video = fakeVideo();
  const snapshot = videoSnapshot(video);
  assert.equal(snapshot.duration, null);
  assert.equal(snapshot.currentTime, 10);
  assert.equal(snapshot.srcObjectPresent, true);
  assert.equal(snapshot.trackCount, 1);
  assert.equal(snapshot.tracks[0].readyState, 'live');
  assert.doesNotMatch(JSON.stringify(snapshot), /private/);
  video.srcObject = null;
  video.error = { code: 3, message: 'private-url' };
  assert.equal(videoSnapshot(video).trackCount, 0);
  assert.equal(videoSnapshot(video).errorCode, 3);
});

test('short event history records relative time, samples reflect frozen and advancing playback', () => {
  const video = fakeVideo();
  let time = 1000, published;
  const observer = observeVideo(video, true, value => { published = value; }, () => time);
  assert.equal(video.listeners.size, 11);
  time = 4000;
  video.listeners.get('waiting')();
  assert.deepEqual(published.events[0], { seconds: 3, event: 'waiting', currentTime: 10 });
  assert.equal(observer.sample().currentTime, 10);
  video.currentTime = 13;
  assert.equal(observer.sample().currentTime, 13);
  for (let i = 0; i < 20; i++) video.listeners.get('playing')();
  assert.equal(observer.sample().events.length, 16);
  observer.dispose();
  assert.equal(video.listeners.size, 0);
  const before = published;
  observer.record('pause');
  assert.equal(published, before);
});

test('without debug no listeners, publications or reads are installed', () => {
  let published = false;
  const observer = observeVideo(null, false, () => { published = true; });
  assert.equal(observer.sample(), null);
  observer.record('play');
  observer.dispose();
  assert.equal(published, false);
});
