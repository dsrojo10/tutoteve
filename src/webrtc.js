import { pollStats } from './rtc-stats.js';
import { observeVideo } from './video-diagnostics.js';
export const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
export function sanitizedError(error) { const name = error && error.name ? error.name : 'Error'; const message = error && error.message ? String(error.message).replace(/[\r\n]+/g, ' ').slice(0, 180) : 'Operación no completada.'; return name + ': ' + message; }
export function canUseWebRTC() { return typeof RTCPeerConnection === 'function' && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia); }
export function createDiagnostics(statusElement, debugElement, role) {
  const enabled = new URLSearchParams(location.search).get('debug') === '1';
  const details = { role, firebaseConnected: false, webRTCSupported: typeof RTCPeerConnection === 'function', links: {} };
  const cleanups = [];
  const videoObservers = new Map();
  function render() {
    if (enabled) { debugElement.hidden = false; debugElement.textContent = JSON.stringify(details, null, 2); }
  }
  function link(name) {
    if (!details.links[name]) details.links[name] = { localCandidates: 0, remoteCandidates: 0, receivedTracks: 0 };
    return details.links[name];
  }
  function observe(peer, name) {
    const state = link(name);
    const started = Date.now();
    function update() {
      ['signalingState', 'iceGatheringState', 'iceConnectionState', 'connectionState'].forEach(key => {
        state[key] = peer[key] || 'no disponible';
      });
      const current = [state.signalingState, state.iceGatheringState, state.iceConnectionState, state.connectionState].join('/');
      state.transitions = state.transitions || [];
      if (state.transitions[state.transitions.length - 1]?.state !== current) {
        state.transitions.push({ seconds: Math.round((Date.now() - started) / 1000), state: current });
        state.transitions = state.transitions.slice(-8);
      }
      render();
      if (peer.signalingState === 'closed') stopStats();
    }
    const stopStats = pollStats(peer, role === 'tv' ? 'inbound' : 'outbound', stats => {
      state.sample = (state.sample || 0) + 1;
      state.stats = stats;
      const video = videoObservers.get(name);
      if (video) {
        state.playback = video.sample();
        state.playbackSamples = state.playbackSamples || [];
        state.playbackSamples.push({
          sample: state.sample, seconds: state.playback.seconds,
          currentTime: state.playback.currentTime,
          framesDecoded: stats.video ? stats.video.map(item => item.framesDecoded) : [],
          bytesReceived: stats.video ? stats.video.map(item => item.bytesReceived) : [],
        });
        state.playbackSamples = state.playbackSamples.slice(-6);
      }
      state.tracks = [...peer.getSenders(), ...peer.getReceivers()].filter(item => item.track).map(item => ({
        kind: item.track.kind, readyState: item.track.readyState,
        enabled: item.track.enabled, muted: item.track.muted,
      }));
      render();
    }, enabled && name === 'guestTv');
    const events = ['signalingstatechange', 'icegatheringstatechange', 'iceconnectionstatechange', 'connectionstatechange'];
    events.forEach(event => peer.addEventListener(event, update));
    cleanups.push(() => { stopStats(); events.forEach(event => peer.removeEventListener(event, update)); });
    update();
  }
  function dispose() { cleanups.splice(0).forEach(cleanup => cleanup()); videoObservers.clear(); }
  window.addEventListener('pagehide', dispose);
  render();
  return {
    dispose,
    status: message => { statusElement.textContent = message; },
    firebase: connected => { details.firebaseConnected = connected; render(); },
    observe,
    observeVideo: (video, name) => {
      const observer = observeVideo(video, enabled, snapshot => { link(name).playback = snapshot; render(); });
      if (enabled) { videoObservers.set(name, observer); cleanups.push(observer.dispose); }
      return observer;
    },
    localCandidate: name => { link(name).localCandidates += 1; render(); },
    remoteCandidate: name => { link(name).remoteCandidates += 1; render(); },
    remoteTrack: name => { link(name).receivedTracks += 1; render(); },
    error: () => { details.error = 'Operación no completada.'; render(); statusElement.textContent = details.error; },
  };
}
export function wirePeer(peer, sessionId, link, localSide, remoteSide, diagnostics, signaling) {
  const queued = []; function add(candidate) { peer.addIceCandidate(new RTCIceCandidate(candidate)).then(function () { diagnostics.remoteCandidate(link); }).catch(diagnostics.error); }
  peer.addEventListener('icecandidate', function (event) { if (event.candidate) { diagnostics.localCandidate(link); signaling.sendCandidate(sessionId, link, localSide, event.candidate).catch(diagnostics.error); } });
  signaling.watchCandidates(sessionId, link, remoteSide, function (candidate) { if (peer.remoteDescription) { add(candidate); } else { queued.push(candidate); } });
  return function setRemote(description) { return peer.setRemoteDescription(new RTCSessionDescription(description)).then(function () { queued.splice(0).forEach(add); }); };
}
