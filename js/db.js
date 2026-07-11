import { db } from './firebase.js';
import {
  doc, collection, getDoc, setDoc, updateDoc, onSnapshot,
  query, where, orderBy, limit, getDocs, increment,
  arrayUnion, arrayRemove, serverTimestamp, deleteDoc,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

export const DB = {
  async createRoom(code, data) {
    const ref = doc(db, 'rooms', code);
    data.createdAt = serverTimestamp();
    data.updatedAt = serverTimestamp();
    await setDoc(ref, data);
    return true;
  },

  async getRoom(code) {
    const snap = await getDoc(doc(db, 'rooms', code));
    return snap.exists() ? snap.data() : null;
  },

  async updateRoom(code, data) {
    data.updatedAt = serverTimestamp();
    await updateDoc(doc(db, 'rooms', code), data);
  },

  listenRoom(code, callback) {
    return onSnapshot(doc(db, 'rooms', code), snap => {
      if (snap.exists()) callback(snap.data());
    });
  },

  async deleteRoom(code) {
    await deleteDoc(doc(db, 'rooms', code));
  },

  async getUser(uid) {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? snap.data() : null;
  },

  async updateUser(uid, data) {
    await updateDoc(doc(db, 'users', uid), data);
  },

  async incrementUserStats(uid, opts) {
    if (!uid || uid.startsWith('guest_')) return;
    const weekKey = weekStart();
    await updateDoc(doc(db, 'users', uid), {
      totalPoints: increment(opts.points || 0),
      correctGuesses: increment(opts.correct || 0),
      gamesPlayed: increment(opts.games || 0),
      weeklyPoints: increment(opts.points || 0),
      weekStart: weekKey,
      lastPlayed: serverTimestamp(),
    });
  },

  async saveGameResult(uid, gameData) {
    if (!uid || uid.startsWith('guest_')) return;
    const ref = doc(collection(db, 'users', uid, 'games'));
    gameData.playedAt = serverTimestamp();
    await setDoc(ref, gameData);
  },

  async getRecentGames(uid, count = 5) {
    if (!uid || uid.startsWith('guest_')) return [];
    const q = query(collection(db, 'users', uid, 'games'), orderBy('playedAt', 'desc'), limit(count));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data());
  },

  async getLeaderboard(type = 'alltime', count = 20) {
    const field = type === 'weekly' ? 'weeklyPoints' : type === 'games' ? 'gamesPlayed' : 'totalPoints';
    const q = query(collection(db, 'users'), where(field, '>', 0), orderBy(field, 'desc'), limit(count));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data());
  },

  async sendFriendRequest(fromUid, toUid) {
    const ref = doc(db, 'friendRequests', fromUid + '_' + toUid);
    await setDoc(ref, { from: fromUid, to: toUid, status: 'pending', createdAt: serverTimestamp() });
  },

  async acceptFriendRequest(fromUid, toUid) {
    console.log('[DB.accept] fromUid:', fromUid, 'toUid:', toUid);

    const addFriend = async (uid, friendUid) => {
      console.log('[DB.accept] adding friend', friendUid, 'to user', uid);
      try {
        await updateDoc(doc(db, 'users', uid), { friends: arrayUnion(friendUid) });
        console.log('[DB.accept] updateDoc succeeded for', uid);
      } catch (e1) {
        console.warn('[DB.accept] updateDoc failed, trying setDoc:', e1?.code, e1?.message);
        await setDoc(doc(db, 'users', uid), { friends: [friendUid] }, { merge: true });
        console.log('[DB.accept] setDoc succeeded for', uid);
      }
    };

    await addFriend(toUid, fromUid);

    console.log('[DB.accept] sending notification to', fromUid);
    await DB.addNotification(fromUid, {
      type: 'friend_accepted',
      message: 'accepted your friend request',
      fromUid: toUid,
      addFriend: toUid,
    });
    console.log('[DB.accept] notification sent');

    const tryDelete = async (key) => {
      try {
        await deleteDoc(doc(db, 'friendRequests', key));
        console.log('[DB.accept] deleted request doc:', key);
      } catch (e) {
        console.log('[DB.accept] could not delete key:', key, e?.code);
      }
    };
    await tryDelete(fromUid + '_' + toUid);
    await tryDelete(toUid + '_' + fromUid);
    console.log('[DB.accept] done');
  },

  async rejectFriendRequest(fromUid, toUid) {
    await deleteDoc(doc(db, 'friendRequests', fromUid + '_' + toUid));
  },

  async removeFriend(currentUid, friendUid) {
    // Only update the current user's own doc (Firestore rules block writing to other users)
    await updateDoc(doc(db, 'users', currentUid), { friends: arrayRemove(friendUid) });
  },

  async getPendingRequests(uid) {
    const q = query(collection(db, 'friendRequests'), where('to', '==', uid), where('status', '==', 'pending'));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data());
  },

  async getSentRequests(uid) {
    const q = query(collection(db, 'friendRequests'), where('from', '==', uid), where('status', '==', 'pending'));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data());
  },

  async searchUsers(term) {
    const q = query(collection(db, 'users'), where('displayName', '>=', term), where('displayName', '<=', term + '\uf8ff'), limit(10));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data());
  },

  async addNotification(uid, data) {
    if (!uid || uid.startsWith('guest_')) return;
    const ref = doc(collection(db, 'users', uid, 'notifications'));
    data.read = false;
    data.createdAt = serverTimestamp();
    await setDoc(ref, data);
  },

  async getNotifications(uid, count = 20) {
    if (!uid || uid.startsWith('guest_')) return [];
    const q = query(collection(db, 'users', uid, 'notifications'), orderBy('createdAt', 'desc'), limit(count));
    const snap = await getDocs(q);
    return snap.docs.map(d => { const d2 = d.data(); d2.id = d.id; return d2; });
  },

  async markNotificationRead(uid, notifId) {
    await updateDoc(doc(db, 'users', uid, 'notifications', notifId), { read: true });
  },

  listenNotifications(uid, callback) {
    if (!uid || uid.startsWith('guest_')) return () => {};
    const q = query(collection(db, 'users', uid, 'notifications'), orderBy('createdAt', 'desc'), limit(20));
    return onSnapshot(q, snap => {
      callback(snap.docs.map(d => { const d2 = d.data(); d2.id = d.id; return d2; }));
    });
  },

  async getLiveRoomCount() {
    try {
      const q = query(collection(db, 'rooms'), where('phase', 'in', ['lobby', 'prompting', 'guessing']), limit(100));
      return (await getDocs(q)).size;
    } catch { return 0; }
  },
};

function weekStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString();
}

window.DB = DB;
