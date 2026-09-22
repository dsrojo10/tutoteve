import { ensureAnonymousUser, watchFirebaseConnection } from './firebase.js';
import { claimRoom, sendCandidate, watchCandidates, watchDescription, writeDescription } from './signaling.js';
import { createDiagnostics, rtcConfig } from './webrtc.js';

const startButton = document.getElementById('start-camera'); const codeInput = document.getElementById('pairing-code'); const localVideo = document.getElementById('local-video'); const diagnostics = createDiagnostics(document.getElementById('status'), document.getElementById('debug')); let peer; let pendingCandidates = [];
watchFirebaseConnection(function (connected) { diagnostics.firebase(connected); });
function canUseWebRTC() { return typeof window.RTCPeerConnection === 'function' && navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function'; }
function addRemoteCandidate(candidate) { peer.addIceCandidate(new RTCIceCandidate(candidate)).then(function () { diagnostics.remoteCandidate(); }).catch(diagnostics.error); }
function receiveCandidate(candidate) { if (!peer.currentRemoteDescription) { pendingCandidates.push(candidate); return; } addRemoteCandidate(candidate); }
startButton.addEventListener('click', async function () {
  if (!canUseWebRTC()) { diagnostics.error(new Error('Este navegador no dispone de las APIs WebRTC necesarias.')); return; }
  startButton.disabled = true;
  try {
    diagnostics.status('Conectando con la sala…'); const user = await ensureAnonymousUser(); const sessionId = await claimRoom(codeInput.value.trim(), user.uid);
    diagnostics.status('Solicitando cámara y micrófono…'); const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 15, max: 24 } }, audio: true }); localVideo.srcObject = stream;
    peer = new RTCPeerConnection(rtcConfig); diagnostics.observe(peer); stream.getTracks().forEach(function (track) { peer.addTrack(track, stream); });
    peer.addEventListener('icecandidate', function (event) { if (event.candidate) { diagnostics.localCandidate(); sendCandidate(sessionId, 'phone', event.candidate).catch(diagnostics.error); } });
    watchCandidates(sessionId, 'tv', receiveCandidate);
    watchDescription(sessionId, 'answer', function (answer) { if (!peer.currentRemoteDescription) { peer.setRemoteDescription(new RTCSessionDescription(answer)).then(function () { pendingCandidates.forEach(addRemoteCandidate); pendingCandidates = []; diagnostics.status('Conectando vídeo con el TV…'); }).catch(diagnostics.error); } });
    await peer.setLocalDescription(await peer.createOffer()); await writeDescription(sessionId, 'offer', peer.localDescription); diagnostics.status('Conectando con el TV…');
  } catch (error) { diagnostics.error(error); startButton.disabled = false; }
});
