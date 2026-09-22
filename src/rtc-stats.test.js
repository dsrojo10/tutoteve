import test from 'node:test';
import assert from 'node:assert/strict';
import { safeVideoStats, pollStats } from './rtc-stats.js';
import { setMicrophoneMuted } from './microphone.js';
import { createDiagnostics } from './webrtc.js';

test('stats expose only safe video counters and candidate types', () => {
  const report = new Map([
    ['v', { type: 'outbound-rtp', kind: 'video', bytesSent: 100, framesEncoded: 4, codecId: 'c', qualityLimitationReason: 'cpu', secret: 'hidden' }],
    ['c', { mimeType: 'video/VP8', sdpFmtpLine: 'hidden' }],
    ['t', { type: 'transport', selectedCandidatePairId: 'p' }],
    ['p', { currentRoundTripTime: 0.1, localCandidateId: 'l', remoteCandidateId: 'r' }],
    ['l', { candidateType: 'host', protocol: 'udp', address: '192.168.1.1' }],
    ['r', { candidateType: 'srflx', protocol: 'udp', address: 'secret' }],
  ]);
  const stats = safeVideoStats(report, 'outbound');
  assert.equal(stats.video[0].bytesSent, 100);
  assert.equal(stats.video[0].framesSent, null);
  assert.equal(stats.video[0].codec, 'video/VP8');
  assert.equal(stats.currentRoundTripTime, 0.1);
  assert.equal(stats.selectedPair.local.type, 'host');
  assert.doesNotMatch(JSON.stringify(stats), /hidden|secret|192\.168/);
  report.set('v', { type: 'inbound-rtp', mediaType: 'video', bytesReceived: 200, framesDecoded: 3, framesDropped: 1, packetsLost: 2, jitter: 0.02 });
  assert.equal(safeVideoStats(report, 'inbound').video[0].framesDecoded, 3);
});

test('polling exists only in debug and stops without publishing an in-flight result', async () => {
  let reads = 0, schedules = 0, cancels = 0, publishes = 0, tick, resolve;
  const peer = { signalingState: 'stable', getStats: () => { reads++; return new Promise(r => { resolve = r; }); } };
  const schedule = callback => { schedules++; tick = callback; return 1; };
  const cancel = () => { cancels++; };
  pollStats(peer, 'outbound', () => publishes++, false, schedule, cancel)();
  assert.equal(reads, 0);
  assert.equal(schedules, 0);
  const stop = pollStats(peer, 'outbound', () => publishes++, true, schedule, cancel);
  assert.equal(reads, 1);
  await tick();
  assert.equal(reads, 1);
  stop();
  resolve(new Map());
  await Promise.resolve();
  await tick();
  assert.equal(publishes, 0);
  assert.equal(cancels, 1);
});

test('diagnostics keep independent connection states and candidate counts', () => {
  const oldLocation = globalThis.location, oldWindow = globalThis.window;
  globalThis.location = { search: '?debug=1' };
  globalThis.window = { addEventListener() {} };
  try {
    const debug = {};
    const diagnostics = createDiagnostics({}, debug, 'guestPhone');
    const peer = { signalingState: 'stable', iceConnectionState: 'connected', addEventListener() {}, removeEventListener() {} };
    diagnostics.observe(peer, 'tutoGuest');
    diagnostics.localCandidate('tutoGuest');
    diagnostics.remoteCandidate('guestTv');
    const value = JSON.parse(debug.textContent);
    assert.equal(value.links.tutoGuest.localCandidates, 1);
    assert.equal(value.links.guestTv.localCandidates, 0);
    assert.equal(value.links.guestTv.remoteCandidates, 1);
    diagnostics.dispose();
  } finally { globalThis.location = oldLocation; globalThis.window = oldWindow; }
});

test('muting shared audio affects both senders without stopping video or audio tracks', () => {
  const audio = { enabled: true };
  const video = { enabled: true };
  const stream = { getAudioTracks: () => [audio] };
  setMicrophoneMuted(stream, true);
  assert.equal(audio.enabled, false);
  assert.equal(video.enabled, true);
  setMicrophoneMuted(stream, false);
  assert.equal(audio.enabled, true);
});
