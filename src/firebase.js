import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getDatabase, onValue, ref } from 'firebase/database';

const config = { apiKey: import.meta.env.VITE_FIREBASE_API_KEY, authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN, databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL, projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID, appId: import.meta.env.VITE_FIREBASE_APP_ID };
const required = ['apiKey', 'authDomain', 'databaseURL', 'projectId', 'appId'];
if (required.some(function (key) { return !config[key]; })) { throw new Error('Faltan variables VITE_FIREBASE_ de Firebase. Revisa .env.example.'); }
const app = initializeApp(config);
export const auth = getAuth(app);
export const db = getDatabase(app);
export async function ensureAnonymousUser() { if (auth.currentUser) { return auth.currentUser; } return (await signInAnonymously(auth)).user; }
export function watchFirebaseConnection(callback) { return onValue(ref(db, '.info/connected'), function (snapshot) { callback(snapshot.val() === true); }); }
