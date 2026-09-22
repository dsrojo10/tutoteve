import { get, onChildAdded, onValue, onDisconnect, push, ref, remove, runTransaction, serverTimestamp, set } from 'firebase/database';
import { db } from './firebase.js';

export const SESSION_LIFETIME_MS = 15 * 60 * 1000;
function bytes(length) { const value = new Uint8Array(length); crypto.getRandomValues(value); return value; }
function randomHex(length) { return Array.from(bytes(length), function (item) { return item.toString(16).padStart(2, '0'); }).join(''); }
function randomCode() { const value = new Uint32Array(1); crypto.getRandomValues(value); return String(value[0] % 1000000).padStart(6, '0'); }
function sessionRef(sessionId) { return ref(db, 'sessions/' + sessionId); }
function codeRef(code) { return ref(db, 'pairingCodes/' + code); }
function inviteRef(token) { return ref(db, 'invites/' + token); }
function roleRef(sessionId, role) { return ref(db, 'sessions/' + sessionId + '/roles/' + role); }
async function claimRole(sessionId, role, uid) { await set(roleRef(sessionId, role), uid); }

export async function createSession(ownerUid) {
  const sessionId = randomHex(24); const expiresAt = Date.now() + SESSION_LIFETIME_MS;
  await set(sessionRef(sessionId), { ownerUid: ownerUid, expiresAt: expiresAt, roles: {}, signals: {} });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = randomCode();
    const result = await runTransaction(codeRef(code), function (current) { return current === null ? { sessionId: sessionId, ownerUid: ownerUid, expiresAt: expiresAt } : undefined; });
    if (result.committed) { await Promise.all([onDisconnect(sessionRef(sessionId)).remove(), onDisconnect(codeRef(code)).remove()]); return { sessionId: sessionId, code: code, expiresAt: expiresAt }; }
  }
  await remove(sessionRef(sessionId)); throw new Error('No se pudo crear un código temporal.');
}
export async function claimTutoPhone(code, uid) {
  if (!/^\d{6}$/.test(code)) { throw new Error('Introduce los seis dígitos del TV.'); }
  const pairing = (await get(codeRef(code))).val();
  if (!pairing || pairing.expiresAt <= Date.now()) { throw new Error('El código no existe o venció.'); }
  try { await claimRole(pairing.sessionId, 'tutoPhoneUid', uid); } catch (error) { throw new Error('Ese TV ya está vinculado a otro celular.'); }
  return pairing.sessionId;
}
export async function createInvite(sessionId) {
  const session = (await get(sessionRef(sessionId))).val();
  if (!session || session.expiresAt <= Date.now() || session.endedBy) { throw new Error('La sesión terminó.'); }
  const token = session.inviteToken || randomHex(24);
  if (!session.inviteToken) { await set(ref(db, 'sessions/' + sessionId + '/inviteToken'), token); }
  const existing = (await get(inviteRef(token))).val();
  if (!existing) { await set(inviteRef(token), { sessionId: sessionId, expiresAt: session.expiresAt }); }
  return { token: token, expiresAt: session.expiresAt };
}
export async function claimGuest(token, uid) {
  if (!/^[a-f0-9]{48}$/.test(token)) { throw new Error('La invitación no es válida.'); }
  const invitation = (await get(inviteRef(token))).val();
  if (!invitation || invitation.expiresAt <= Date.now()) { throw new Error('La invitación venció o no existe.'); }
  try { await set(ref(db, 'invites/' + token + '/guestPhoneUid'), uid); }
  catch (error) { throw new Error('La invitación venció o ya fue usada.'); }
  try { await claimRole(invitation.sessionId, 'guestPhoneUid', uid); } catch (error) { throw new Error('La sesión ya tiene un familiar conectado.'); }
  return invitation.sessionId;
}
export function writeDescription(sessionId, link, side, description) { return set(ref(db, 'sessions/' + sessionId + '/signals/' + link + '/' + side + '/description'), { type: description.type, sdp: description.sdp }); }
export function watchDescription(sessionId, link, side, callback, onError) { return onValue(ref(db, 'sessions/' + sessionId + '/signals/' + link + '/' + side + '/description'), function (snapshot) { const value = snapshot.val(); if (value && typeof value.type === 'string' && typeof value.sdp === 'string') { callback(value); } }, onError); }
export function sendCandidate(sessionId, link, side, candidate) { return set(push(ref(db, 'sessions/' + sessionId + '/signals/' + link + '/' + side + '/candidates')), candidate.toJSON ? candidate.toJSON() : candidate); }
export function watchCandidates(sessionId, link, side, callback) { return onChildAdded(ref(db, 'sessions/' + sessionId + '/signals/' + link + '/' + side + '/candidates'), function (snapshot) { const value = snapshot.val(); if (value && typeof value.candidate === 'string') { callback(value); } }); }
export function watchRole(sessionId, role, callback) { return onValue(ref(db, 'sessions/' + sessionId + '/roles/' + role), function (snapshot) { callback(snapshot.val()); }); }
export function endSession(sessionId, uid) { return set(ref(db, 'sessions/' + sessionId + '/endedBy'), uid); }
export function watchEnd(sessionId, callback) { return onValue(ref(db, 'sessions/' + sessionId + '/endedBy'), function (snapshot) { callback(snapshot.val()); }); }
export function watchSessionRemoved(sessionId, callback) { return onValue(ref(db, 'sessions/' + sessionId + '/ownerUid'), function (snapshot) { if (!snapshot.exists()) callback(); }); }
export function writeCaption(sessionId, text) { return set(ref(db, 'sessions/' + sessionId + '/captions/current'), text ? { text: text, updatedAt: serverTimestamp() } : null); }
export function watchCaption(sessionId, callback, onError) { return onValue(ref(db, 'sessions/' + sessionId + '/captions/current'), function (snapshot) { callback(snapshot.val()); }, onError); }
export async function cleanupSession(sessionId, code) { await Promise.all([remove(sessionRef(sessionId)), code ? remove(codeRef(code)) : Promise.resolve()]); }
