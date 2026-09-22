import { auth, ensureAnonymousUser, watchFirebaseConnection } from './firebase.js';
import * as signaling from './signaling.js';
import { createDiagnostics, rtcConfig, wirePeer } from './webrtc.js';
import { createTvPlayback } from './tv-playback.js';
const remoteVideo = document.getElementById('remote-video'); const diagnostics = createDiagnostics(document.getElementById('status'), document.getElementById('debug'), 'tv'); let room; let peer;
const videoDiagnostics = diagnostics.observeVideo(remoteVideo, 'guestTv');
const remoteStream = new MediaStream();
const fallbackButton = document.getElementById('play-video');
const playback = createTvPlayback(remoteVideo, remoteStream, diagnostics, videoDiagnostics, fallbackButton);
watchFirebaseConnection(function (connected) { diagnostics.firebase(connected); });
fallbackButton.addEventListener('click', function () { playback.play(); });
async function receiveGuest(offer) { if (peer) { return; } diagnostics.status('Conectando con el familiar…'); peer = new RTCPeerConnection(rtcConfig); diagnostics.observe(peer, 'guestTv'); peer.addTransceiver('audio', { direction: 'recvonly' }); peer.addTransceiver('video', { direction: 'recvonly' }); peer.addEventListener('track', function (event) { playback.addTrack(event.track); }); const setRemote = wirePeer(peer, room.sessionId, 'guestTv', 'tv', 'guest', diagnostics, signaling); await setRemote(offer); await peer.setLocalDescription(await peer.createAnswer()); await signaling.writeDescription(room.sessionId, 'guestTv', 'tv', peer.localDescription); if (!playback.isActive()) diagnostics.status('Conectando con el familiar…'); }
async function start() { try { const user = await ensureAnonymousUser(); if (!auth.currentUser || auth.currentUser.uid !== user.uid) { throw new Error('No se pudo iniciar la sesión temporal.'); } room = await signaling.createSession(user.uid); document.getElementById('pairing-code').textContent = room.code; diagnostics.status('Esperando celular de Tuto.'); signaling.watchRole(room.sessionId, 'tutoPhoneUid', function (value) { if (value) { diagnostics.status('Esperando familiar…'); } }); signaling.watchDescription(room.sessionId, 'guestTv', 'guest', function (offer) { receiveGuest(offer).catch(diagnostics.error); }, diagnostics.error); signaling.watchEnd(room.sessionId, function (endedBy) { if (endedBy) { playback.stop(); if (peer) { peer.close(); } signaling.cleanupSession(room.sessionId, room.code).catch(diagnostics.error); diagnostics.dispose(); diagnostics.status('Llamada terminada.'); } }); } catch (error) { diagnostics.error(error); } }
document.getElementById('start-tv').addEventListener('click', function () {
  document.getElementById('startup-panel').hidden = true;
  playback.prime();
  start();
});
document.getElementById('end-call').addEventListener('click', async function () { try { playback.stop(); if (peer) { peer.close(); } if (room) { await signaling.cleanupSession(room.sessionId, room.code); } diagnostics.dispose(); diagnostics.status('Llamada terminada.'); } catch (error) { diagnostics.error(error); } }); start();
