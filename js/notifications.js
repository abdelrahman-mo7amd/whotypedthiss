import { DB } from './db.js';
import { Auth } from './auth.js';

let unsubscribe = null;

export const Notifications = {
  start(uid) {
    if (unsubscribe) {
      unsubscribe();
    }
    if (!uid || uid.startsWith('guest_')) {
      return;
    }

    unsubscribe = DB.listenNotifications(uid, async notifs => {
      const unread = notifs.filter(n => !n.read).length;

      const badge = document.getElementById('notif-count');
      if (badge) {
        badge.textContent = unread;
        badge.style.display = unread > 0 ? 'inline-block' : 'none';
      }

      if (unread > 0) {
        window.Audio?.notif?.();
      }

      window.UI?.renderNotifications(notifs);

      const freshReq = notifs.find(n => !n.read && n.type === 'friend_request');
      if (freshReq) {
        window.UI?.toast(freshReq.message, 'good');
        DB.markNotificationRead(uid, freshReq.id);
      }

      // When sender sees a friend_accepted notification, sync their own friends list
      const freshAccept = notifs.find(n => !n.read && n.type === 'friend_accepted' && n.addFriend);
      if (freshAccept) {
        try {
          const { doc, updateDoc, arrayUnion, setDoc } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
          const { db } = await import('./firebase.js');
          try {
            await updateDoc(doc(db, 'users', uid), { friends: arrayUnion(freshAccept.addFriend) });
          } catch {
            await setDoc(doc(db, 'users', uid), { friends: [freshAccept.addFriend] }, { merge: true });
          }
          await Auth.refreshProfile();
        } catch { /* ignore */ }
        DB.markNotificationRead(uid, freshAccept.id);
        window.UI?.toast('You are now friends with ' + (freshAccept.message?.split(' ')[0] || 'someone'), 'good');
      }
    });
  },

  stop() {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  },

  async reload() {
    const uid = Auth.getCurrentUser()?.uid;
    if (!uid) {
      return;
    }
    const notifs = await DB.getNotifications(uid);
    window.UI?.renderNotifications(notifs);
  },
};

window.Notifications = Notifications;
