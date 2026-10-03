import { addMicrophoneButton } from './microphone.js';
import { ensureAnonymousUser, watchFirebaseConnection } from './firebase.js';
import * as signaling from './signaling.js';
import { canUseWebRTC, createDiagnostics, rtcConfig, wirePeer } from './webrtc.js';
import { isInviteToken } from './mvp-utils.js';
import { createSpeechCaptions } from './captions.js';
import { createGuestCallLifecycle, signalingErrorCategory } from './guest-lifecycle.js';
const diagnostics = createDiagnostics(document.getElementById('status'), document.getElementById('debug'), 'guestPhone'); const join = document.getElementById('join-call'); const localVideo = document.getElementById('local-video'); const tutoVideo = document.getElementById('tuto-video'); const token = new URLSearchParams(location.search).get('invite'); let stream; let sessionId; let uid; let tutoPeer; let tvPeer;
const captionNotice = document.getElementById('caption-notice');
const lifecycle = createGuestCallLifecycle({ start: () => captions.start(), stop: () => captions.stop() }, state => diagnostics.captions(state));
function reportGuestError(error) { lifecycle.error(signalingErrorCategory(error)); diagnostics.error(error); }
const guestDiagnostics = { ...diagnostics, error: reportGuestError };
const captions = createSpeechCaptions(window.SpeechRecognition || window.webkitSpeechRecognition,
  text => signaling.writeCaption(sessionId, text).catch(error => { reportGuestError(error); throw error; }),
  state => { lifecycle.captions(state); captionNotice.hidden = state.supported && (!state.error || state.error === 'no-speech'); captionNotice.textContent = state.supported ? 'Subtítulos no disponibles en este momento.' : 'Subtítulos no disponibles en este navegador.'; });
function stopCaptions() { captions.stop(); if (sessionId) signaling.writeCaption(sessionId, null).catch(function () {}); }
watchFirebaseConnection(function (connected) { diagnostics.firebase(connected); });
function attach(peer, video) { peer.addEventListener('track', function (event) { video.srcObject = event.streams[0]; diagnostics.remoteTrack('tutoGuest'); video.play().catch(function () {}); }); }
async function connectTuto() { tutoPeer = new RTCPeerConnection(rtcConfig); diagnostics.observe(tutoPeer, 'tutoGuest'); attach(tutoPeer, tutoVideo); stream.getTracks().forEach(function (track) { tutoPeer.addTrack(track, stream); }); const setRemote = wirePeer(tutoPeer, sessionId, 'tutoGuest', 'guest', 'tuto', guestDiagnostics, signaling); signaling.watchDescription(sessionId, 'tutoGuest', 'tuto', async function (offer) { if (tutoPeer.currentRemoteDescription) { return; } try { await setRemote(offer); await tutoPeer.setLocalDescription(await tutoPeer.createAnswer()); await signaling.writeDescription(sessionId, 'tutoGuest', 'guest', tutoPeer.localDescription); diagnostics.status('Conectando con Tuto…'); } catch (error) { reportGuestError(error); } }, reportGuestError); }
async function connectTv() { tvPeer = new RTCPeerConnection(rtcConfig); diagnostics.observe(tvPeer, 'guestTv'); stream.getTracks().forEach(function (track) { tvPeer.addTrack(track, stream); }); const setRemote = wirePeer(tvPeer, sessionId, 'guestTv', 'guest', 'tv', guestDiagnostics, signaling); signaling.watchDescription(sessionId, 'guestTv', 'tv', function (answer) { if (!tvPeer.currentRemoteDescription) { setRemote(answer).catch(reportGuestError); } }, reportGuestError); await tvPeer.setLocalDescription(await tvPeer.createOffer()); await signaling.writeDescription(sessionId, 'guestTv', 'guest', tvPeer.localDescription); }
join.addEventListener('click', async function () {
  if (!canUseWebRTC() || !isInviteToken(token)) { lifecycle.error('signaling-error'); diagnostics.error(new Error('Esta invitación o navegador no es compatible.')); return; }
  join.disabled = true;
  try {
    uid = (await ensureAnonymousUser()).uid;
    sessionId = await signaling.claimGuest(token, uid);
    signaling.watchEnd(sessionId, function (endedBy) { if (endedBy) { lifecycle.endedBy(endedBy); diagnostics.dispose(); } }, reportGuestError);
    signaling.watchSessionRemoved(sessionId, function () { lifecycle.sessionRemoved(); }, reportGuestError);
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 15, max: 24 } }, audio: true });
    localVideo.srcObject = stream;
    addMicrophoneButton(localVideo, stream);
    await Promise.all([connectTuto(), connectTv()]);
    document.getElementById('end-call').hidden = false;
    diagnostics.status('Entrando a la llamada…');
    lifecycle.startCaptions();
  } catch (error) { captions.stop(); reportGuestError(error); join.disabled = false; }
});
document.getElementById('end-call').addEventListener('click', async function () { lifecycle.end('local-end'); stopCaptions(); try { await signaling.endSession(sessionId, uid); [tutoPeer, tvPeer].forEach(function (peer) { if (peer) { peer.close(); } }); stream.getTracks().forEach(function (track) { track.stop(); }); diagnostics.dispose(); diagnostics.status('Llamada terminada.'); } catch (error) { reportGuestError(error); } });
window.addEventListener('pagehide', stopCaptions);
