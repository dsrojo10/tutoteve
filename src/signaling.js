import { get, onChildAdded, onValue, onDisconnect, push, ref, remove, runTransaction, set } from 'firebase/database';
import { db } from './firebase.js';

const ROOM_LIFETIME_MS = 15 * 60 * 1000;
function randomBytes(length) { const bytes = new Uint8Array(length); window.crypto.getRandomValues(bytes); return bytes; }
function randomSessionId() { return Array.prototype.map.call(randomBytes(18), function (byte) { return ('0' + byte.toString(16)).slice(-2); }).join(''); }
function randomCode() { const values = new Uint32Array(1); window.crypto.getRandomValues(values); return String(values[0] % 1000000).padStart(6, '0'); }
function roomRef(sessionId) { return ref(db, 'rooms/' + sessionId); }
function codeRef(code) { return ref(db, 'pairingCodes/' + code); }

export async function createRoom(ownerUid, stage) {
  const sessionId = randomSessionId(); const expiresAt = Date.now() + ROOM_LIFETIME_MS;
  stage('create-room-atomic');
  await set(roomRef(sessionId), { ownerUid: ownerUid, expiresAt: expiresAt });
  for (let attempts = 0; attempts < 5; attempts += 1) {
    const code = randomCode();
    stage('create-pairing-code');
    const result = await runTransaction(codeRef(code), function (current) { return current === null ? { sessionId: sessionId, ownerUid: ownerUid, expiresAt: expiresAt } : undefined; });
    if (result.committed) {
      stage('register-cleanup');
      await Promise.all([onDisconnect(codeRef(code)).remove(), onDisconnect(roomRef(sessionId)).remove()]);
      return { sessionId: sessionId, code: code, expiresAt: expiresAt };
    }
  }
  await remove(roomRef(sessionId)); throw new Error('No se pudo crear un código temporal. Inténtalo otra vez.');
}
export async function claimRoom(code, phoneUid) {
  if (!/^\d{6}$/.test(code)) { throw new Error('Introduce los seis dígitos que muestra el TV.'); }
  const pairing = (await get(codeRef(code))).val();
  if (!pairing || pairing.expiresAt <= Date.now()) { throw new Error('El código no existe o ya venció.'); }
  const claim = await runTransaction(ref(db, 'rooms/' + pairing.sessionId + '/phoneUid'), function (current) { return current === null || current === phoneUid ? phoneUid : undefined; });
  if (!claim.committed) { throw new Error('La sala ya está conectada a otro celular.'); }
  return pairing.sessionId;
}
export function writeDescription(sessionId, side, description) { return set(ref(db, 'rooms/' + sessionId + '/' + side), { type: description.type, sdp: description.sdp }); }
export function watchDescription(sessionId, side, callback, onError) { return onValue(ref(db, 'rooms/' + sessionId + '/' + side), function (snapshot) { const value = snapshot.val(); if (value && typeof value.type === 'string' && typeof value.sdp === 'string') { callback(value); } }, onError); }
export function sendCandidate(sessionId, side, candidate) { return set(push(ref(db, 'rooms/' + sessionId + '/candidates/' + side)), candidate.toJSON ? candidate.toJSON() : candidate); }
export function watchCandidates(sessionId, side, callback) { return onChildAdded(ref(db, 'rooms/' + sessionId + '/candidates/' + side), function (snapshot) { const candidate = snapshot.val(); if (candidate && typeof candidate.candidate === 'string') { callback(candidate); } }); }
export async function cleanupRoom(sessionId, code) { await Promise.all([remove(roomRef(sessionId)), remove(codeRef(code))]); }
