// Spendly — Firebase Authentication Only (Modular SDK v10.14.1)
// Database storage is handled by PostgreSQL via /api/* endpoints.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  sendPasswordResetEmail,
  signOut,
  updateProfile,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

const DEFAULT_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCG6kE_B8Gb_snQbTbRBM6PXDlkPWtc2Ek',
  authDomain: 'spendy-6a620.firebaseapp.com',
  projectId: 'spendy-6a620',
  storageBucket: 'spendy-6a620.firebasestorage.app',
  messagingSenderId: '80073212515',
  appId: '1:80073212515:web:3abae2e2e38b3c4de0ee56',
  measurementId: 'G-0HC9479RBF'
};

function getStoredFirebaseConfig() {
  try {
    const raw = localStorage.getItem('spendly_firebase_config');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.apiKey && parsed?.projectId ? parsed : null;
  } catch {
    return null;
  }
}

export const firebaseConfig = getStoredFirebaseConfig() || DEFAULT_FIREBASE_CONFIG;

export function isFirebaseConfigured() {
  return Boolean(
    firebaseConfig.apiKey &&
    !firebaseConfig.apiKey.startsWith('YOUR_') &&
    firebaseConfig.projectId &&
    !firebaseConfig.projectId.startsWith('YOUR_')
  );
}

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export async function getAuthToken() {
  if (!auth.currentUser) throw new Error('Not authenticated');
  return auth.currentUser.getIdToken();
}

export {
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  sendPasswordResetEmail,
  signOut,
  updateProfile,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential
};
