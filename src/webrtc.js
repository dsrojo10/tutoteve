export const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

export function sanitizedError(error) {
  const name = error && error.name ? error.name : 'Error';
  const message = error && error.message ? String(error.message).slice(0, 180) : 'Operación no completada.';
  return name + ': ' + message.replace(/[\r\n]+/g, ' ');
}

export function createDiagnostics(statusElement, debugElement) {
  const enabled = new URLSearchParams(window.location.search).get('debug') === '1';
  const details = { userAgent: navigator.userAgent, RTCPeerConnection: typeof window.RTCPeerConnection === 'function', getUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia), firebase: 'inicializando', stage: 'inicializando', firebaseErrorCode: '—', iceGatheringState: '—', signalingState: '—', connectionState: '—', iceConnectionState: '—', localIceCandidates: 0, remoteIceCandidates: 0, remoteVideoTrack: '—', videoCodec: '—', error: '—' };
  function render() { if (enabled) { debugElement.hidden = false; debugElement.textContent = JSON.stringify(details, null, 2); } }
  function status(message) { statusElement.textContent = message; }
  function observe(peer) {
    function update() { details.iceGatheringState = peer.iceGatheringState || 'no disponible'; details.signalingState = peer.signalingState || 'no disponible'; details.connectionState = peer.connectionState || 'no disponible'; details.iceConnectionState = peer.iceConnectionState || 'no disponible'; render(); }
    peer.addEventListener('icegatheringstatechange', update); peer.addEventListener('signalingstatechange', update); peer.addEventListener('connectionstatechange', update); peer.addEventListener('iceconnectionstatechange', update); update();
  }
  function localCandidate() { details.localIceCandidates += 1; render(); }
  function remoteCandidate() { details.remoteIceCandidates += 1; render(); }
  function remoteTrack(track, peer) {
    details.remoteVideoTrack = track.kind;
    try { const receiver = peer.getReceivers().filter(function (item) { return item.track && item.track.kind === 'video'; })[0]; const codecs = receiver && receiver.getParameters ? receiver.getParameters().codecs : []; details.videoCodec = codecs && codecs[0] ? codecs[0].mimeType : 'no disponible'; } catch (error) { details.videoCodec = 'no disponible'; }
    render();
  }
  function firebase(connected) { details.firebase = connected ? 'conectado' : 'no conectado'; render(); }
  function stage(name) { details.stage = name; details.firebaseErrorCode = '—'; render(); }
  function error(error, failedStage) { if (failedStage) { stage(failedStage); } details.firebaseErrorCode = error && error.code ? String(error.code).slice(0, 80) : 'sin-codigo'; details.error = sanitizedError(error); render(); status('Error: ' + details.error); }
  render(); return { status, observe, localCandidate, remoteCandidate, remoteTrack, firebase, stage, error };
}
