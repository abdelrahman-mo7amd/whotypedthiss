import { auth, db } from './firebase.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const AVATARS = ['🐸','🦊','🐙','🦋','🦁','🐼','🐨','🦄','🦀','🐬','🦔','🐲','🦝','🦩','🐯','🦖'];

export let currentUser = null;
export let userProfile = null;

async function ensureProfile(firebaseUser, overrides = {}) {
  const ref = doc(db, 'users', firebaseUser.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    const avatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];
    const profile = {
      uid: firebaseUser.uid,
      displayName: overrides.displayName || firebaseUser.displayName || 'Player',
      email: firebaseUser.email || '',
      avatar,
      totalPoints: 0,
      gamesPlayed: 0,
      correctGuesses: 0,
      weeklyPoints: 0,
      weekStart: weekStart(),
      friends: [],
      writingFingerprint: null, // AI-generated style profile
      createdAt: serverTimestamp(),
    };
    await setDoc(ref, profile);
    return profile;
  }
  return snap.data();
}

function weekStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString();
}

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    userProfile = await ensureProfile(user);
    window.dispatchEvent(new CustomEvent('user-ready', { detail: { user, profile: userProfile } }));
  } else {
    currentUser = null;
    userProfile = null;
    window.dispatchEvent(new CustomEvent('user-signed-out'));
  }
});

export const Auth = {
  async register() {
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const pass = document.getElementById('reg-password').value;
    if (!name) return window.UI?.toast('Enter your display name', 'bad');
    if (!email) return window.UI?.toast('Enter your email', 'bad');
    if (pass.length < 6) return window.UI?.toast('Password must be at least 6 characters', 'bad');
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      await updateProfile(cred.user, { displayName: name });
      await ensureProfile(cred.user, { displayName: name });
    } catch (e) { window.UI?.toast(friendlyError(e), 'bad'); }
  },

  async login() {
    const email = document.getElementById('login-email').value.trim();
    const pass = document.getElementById('login-password').value;
    if (!email || !pass) return window.UI?.toast('Fill in email and password', 'bad');
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (e) { window.UI?.toast(friendlyError(e), 'bad'); }
  },

  async loginGoogle() {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (e) { window.UI?.toast(friendlyError(e), 'bad'); }
  },

  async guestLogin() {
    const name = document.getElementById('guest-name').value.trim();
    if (!name) return window.UI?.toast('Enter a display name', 'bad');
    const guestId = 'guest_' + Date.now();
    currentUser = { uid: guestId, displayName: name, isGuest: true };
    userProfile = {
      uid: guestId,
      displayName: name,
      avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)],
      totalPoints: 0, gamesPlayed: 0, correctGuesses: 0, isGuest: true,
    };
    window.dispatchEvent(new CustomEvent('user-ready', { detail: { user: currentUser, profile: userProfile } }));
  },

  async logout() {
    if (currentUser?.isGuest) {
      currentUser = null; userProfile = null;
      window.dispatchEvent(new CustomEvent('user-signed-out'));
      return;
    }
    await signOut(auth);
  },

  getCurrentUser() { return currentUser; },
  getProfile() { return userProfile; },

  async refreshProfile() {
    if (!currentUser || currentUser.isGuest) return;
    const snap = await getDoc(doc(db, 'users', currentUser.uid));
    if (snap.exists()) userProfile = snap.data();
    return userProfile;
  },
};

function friendlyError(e) {
  const map = {
    'auth/email-already-in-use': 'Email already in use',
    'auth/invalid-email': 'Invalid email address',
    'auth/wrong-password': 'Wrong password',
    'auth/user-not-found': 'No account with that email',
    'auth/weak-password': 'Password too weak',
    'auth/popup-closed-by-user': 'Sign-in popup closed',
    'auth/network-request-failed': 'Network error, check your connection',
  };
  return map[e.code] || e.message || 'Something went wrong';
}

window.Auth = Auth;
