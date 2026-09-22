import { auth, ensureAnonymousUser, watchFirebaseConnection } from './firebase.js';
import { cleanupRoom, createRoom, sendCandidate, watchCandidates, watchDescription, writeDescription } from './signaling.js';
import { createDiagnostics, rtcConfig } from './webrtc.js';

const remoteVideo = document.getElementById('remote-video'); const codeElement = document.getElementById('pairing-code'); const diagnostics = createDiagnostics(document.getElementById('status'), document.getElementById('debug')); let peer; let room;
watchFirebaseConnection(function (connected) { diagnostics.firebase(connected); });
document.getElementById('play-video').addEventListener('click', async function () { try { await remoteVideo.play(); diagnostics.status('Reproducción activada.'); } catch (error) { diagnostics.error(error); } });
document.getElementById('end-test').addEventListener('click', async function () { try { if (peer) { peer.close(); } if (room) { await cleanupRoom(room.sessionId, room.code); } diagnostics.status('Prueba cerrada y sala eliminada.'); } catch (error) { diagnostics.error(error); } });
function addRemoteCandidate(candidate) { peer.addIceCandidate(new RTCIceCandidate(candidate)).then(function () { diagnostics.remoteCandidate(); }).catch(diagnostics.error); }
async function startRoom() {
  try {
    if (typeof window.RTCPeerConnection !== 'function') { throw new Error('Este TV no dispone de RTCPeerConnection.'); }
    diagnostics.stage('auth-anonymous');
    const user = await ensureAnonymousUser();
    if (!auth.currentUser || auth.currentUser.uid !== user.uid) { throw new Error('La autenticación anónima no quedó disponible.'); }
    diagnostics.stage('create-room');
    diagnostics.status('Creando sala temporal…'); room = await createRoom(user.uid, diagnostics.stage); codeElement.textContent = room.code; diagnostics.status('Introduce este código en el celular. La sala vence en 15 minutos.');
    diagnostics.stage('listen-offer');
    watchDescription(room.sessionId, 'offer', async function (offer) {
      if (peer) { return; }
      try {
        peer = new RTCPeerConnection(rtcConfig); diagnostics.observe(peer);
        peer.addEventListener('icecandidate', function (event) { if (event.candidate) { diagnostics.localCandidate(); sendCandidate(room.sessionId, 'tv', event.candidate).catch(diagnostics.error); } });
        peer.addEventListener('track', function (event) { remoteVideo.srcObject = event.streams[0]; diagnostics.remoteTrack(event.track, peer); remoteVideo.play().catch(function () { diagnostics.status('Vídeo recibido. Pulsa “Activar reproducción”.'); }); });
        await peer.setRemoteDescription(new RTCSessionDescription(offer)); watchCandidates(room.sessionId, 'phone', addRemoteCandidate); await peer.setLocalDescription(await peer.createAnswer()); await writeDescription(room.sessionId, 'answer', peer.localDescription); diagnostics.status('Respuesta enviada. Esperando vídeo…');
      } catch (error) { diagnostics.error(error); }
    }, function (error) { diagnostics.error(error, 'listen-offer'); });
  } catch (error) { diagnostics.error(error); }
}
startRoom();
