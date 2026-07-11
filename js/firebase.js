import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getAnalytics } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDkMLNMjxHtHdQ56X9HdIjB7fWODO5cHe4',
  authDomain: 'whotypedthis-f9704.firebaseapp.com',
  projectId: 'whotypedthis-f9704',
  storageBucket: 'whotypedthis-f9704.firebasestorage.app',
  messagingSenderId: '551223527770',
  appId: '1:551223527770:web:a001d4534bbd8c249c8b63',
  measurementId: 'G-NY3S0JSFXE',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const analytics = getAnalytics(app);
