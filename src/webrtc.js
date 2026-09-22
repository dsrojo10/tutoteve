export const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
export function sanitizedError(error) { const name = error && error.name ? error.name : 'Error'; const message = error && error.message ? String(error.message).replace(/[\r\n]+/g, ' ').slice(0, 180) : 'Operación no completada.'; return name + ': ' + message; }
export function canUseWebRTC() { return typeof RTCPeerConnection === 'function' && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia); }
export function createDiagnostics(statusElement, debugElement, role) {
  const enabled = new URLSearchParams(location.search).get('debug') === '1'; const details = { role: role, firebaseConnected: false, webRTCSupported: canUseWebRTC(), signalingState: '—', iceConnectionState: '—', connectionState: '—', localCandidates: 0, remoteCandidates: 0, receivedTracks: 0, error: '—' };
  function render() { if (enabled) { debugElement.hidden = false; debugElement.textContent = JSON.stringify(details, null, 2); } }
  function observe(peer) { function update() { details.signalingState = peer.signalingState || 'no disponible'; details.iceConnectionState = peer.iceConnectionState || 'no disponible'; details.connectionState = peer.connectionState || 'no disponible'; render(); } ['signalingstatechange', 'iceconnectionstatechange', 'connectionstatechange'].forEach(function (event) { peer.addEventListener(event, update); }); update(); }
  render(); return { status: function (message) { statusElement.textContent = message; }, firebase: function (connected) { details.firebaseConnected = connected; render(); }, observe: observe, localCandidate: function () { details.localCandidates += 1; render(); }, remoteCandidate: function () { details.remoteCandidates += 1; render(); }, remoteTrack: function () { details.receivedTracks += 1; render(); }, error: function (error) { details.error = sanitizedError(error); render(); statusElement.textContent = 'Error: ' + details.error; } };
}
export function wirePeer(peer, sessionId, link, localSide, remoteSide, diagnostics, signaling) {
  const queued = []; function add(candidate) { peer.addIceCandidate(new RTCIceCandidate(candidate)).then(function () { diagnostics.remoteCandidate(); }).catch(diagnostics.error); }
  peer.addEventListener('icecandidate', function (event) { if (event.candidate) { diagnostics.localCandidate(); signaling.sendCandidate(sessionId, link, localSide, event.candidate).catch(diagnostics.error); } });
  signaling.watchCandidates(sessionId, link, remoteSide, function (candidate) { if (peer.remoteDescription) { add(candidate); } else { queued.push(candidate); } });
  return function setRemote(description) { return peer.setRemoteDescription(new RTCSessionDescription(description)).then(function () { queued.splice(0).forEach(add); }); };
}
