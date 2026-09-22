import test from 'node:test';
import assert from 'node:assert/strict';
import { createTvPlayback } from './tv-playback.js';

function fixture() {
  const tracks = [];
  const stream = {
    getTracks: () => tracks,
    addTrack: track => tracks.push(track),
  };
  const listeners = new Map();
  const video = {
    srcObject: null, paused: true, playCalls: 0,
    play() { this.playCalls++; return Promise.resolve(); },
    addEventListener: (event, callback) => listeners.set(event, callback),
    removeEventListener: event => listeners.delete(event),
  };
  const statuses = [];
  const remoteTracks = [];
  const events = [];
  const diagnostics = {
    status: value => statuses.push(value),
    remoteTrack: value => remoteTracks.push(value),
  };
  const videoDiagnostics = { record: value => events.push(value) };
  return { stream, tracks, video, statuses, remoteTracks, events, listeners,
    playback: createTvPlayback(video, stream, diagnostics, videoDiagnostics) };
}

test('audio and video tracks share one MediaStream and assign srcObject once', async () => {
  const f = fixture();
  const audio = { kind: 'audio' };
  const video = { kind: 'video' };
  assert.equal(f.video.srcObject, f.stream);
  f.playback.addTrack(audio);
  f.playback.addTrack(video);
  f.playback.addTrack(audio);
  f.playback.addTrack(video);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(f.tracks, [audio, video]);
  assert.equal(f.video.srcObject, f.stream);
  assert.equal(f.events.filter(event => event === 'srcObject:assigned').length, 1);
  assert.equal(f.video.playCalls, 1);
  assert.deepEqual(f.remoteTracks, ['guestTv', 'guestTv']);
  f.listeners.get('playing')();
  assert.equal(f.statuses.at(-1), 'Llamada activa');
});

test('autoplay failure leaves manual playback available without repeated track calls', async () => {
  const f = fixture();
  f.video.play = function () { this.playCalls++; return Promise.reject(new Error('blocked')); };
  f.playback.addTrack({ kind: 'video' });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(f.statuses.at(-1), 'Vídeo recibido. Pulsa “Activar reproducción”.');
  f.playback.play();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(f.video.playCalls, 2);
  f.playback.stop();
  f.playback.play();
  await Promise.resolve();
  assert.equal(f.video.playCalls, 2);
});
