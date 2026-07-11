import { DB } from './db.js';
import { Auth } from './auth.js';

let currentTab = 'friends';

export const Friends = {

  async search() {
    const uid = Auth.getCurrentUser()?.uid;
    const term = document.getElementById('friend-search')?.value.trim();
    const box = document.getElementById('friend-search-results');

    if (!box) {
      return;
    }
    if (!term) {
      box.innerHTML = '';
      return;
    }
    if (!uid) {
      window.UI?.toast('Sign in to add friends', 'bad');
      return;
    }

    box.innerHTML = '<div class="loading-spinner"></div>';

    try {
      const users = await DB.searchUsers(term);
      const profile = Auth.getProfile();
      const myFriends = profile?.friends || [];

      if (!users.length) {
        box.innerHTML = '<div style="color:var(--trans);font-size:13px;padding:8px">No users found</div>';
        return;
      }

      let html = '';

      for (let i = 0; i < users.length; i++) {
        const u = users[i];
        if (u.uid === uid) {
          continue;
        }
        const isFriend = myFriends.includes(u.uid);

        let actionHtml = '';
        if (isFriend) {
          actionHtml = '<span class="badge badge-green">Friends checkmark</span>';
        } else {
          actionHtml = '<button class="btn btn-primary btn-sm" onclick="Friends.sendRequest(\'' + u.uid + '\')">Add +</button>';
        }

        html += '<div class="friend-item" style="margin-bottom:8px">';
        html += '<div class="friend-avatar">' + (u.avatar || '🐸') + '</div>';
        html += '<div class="friend-info">';
        html += '<div class="friend-name">' + esc(u.displayName) + '</div>';
        html += '<div class="friend-sub">' + (u.gamesPlayed || 0) + ' games, ' + (u.totalPoints || 0) + ' pts</div>';
        html += '</div>';
        html += '<div class="friend-actions">' + actionHtml + '</div>';
        html += '</div>';
      }

      box.innerHTML = html;

    } catch (e) {
      box.innerHTML = '<div style="color:var(--red);font-size:13px;padding:8px">Search failed</div>';
    }
  },

  async sendRequest(toUid) {
    const uid = Auth.getCurrentUser()?.uid;
    if (!uid) {
      return window.UI?.toast('Sign in first', 'bad');
    }
    if (uid.startsWith('guest_')) {
      return window.UI?.toast("Guests can't add friends", 'bad');
    }

    try {
      await DB.sendFriendRequest(uid, toUid);
      const profile = Auth.getProfile();
      await DB.addNotification(toUid, {
        type: 'friend_request',
        message: (profile?.displayName || 'Someone') + ' sent you a friend request',
        fromUid: uid,
      });
      window.UI?.toast('Friend request sent! 👥', 'good');
      window.Audio?.notif();
    } catch (e) {
      window.UI?.toast('Failed to send request', 'bad');
    }
  },

  async acceptRequest(fromUid) {
    console.log('[accept] clicked, fromUid:', fromUid);
    const uid = Auth.getCurrentUser()?.uid;
    console.log('[accept] current user uid:', uid);
    if (!uid) {
      console.log('[accept] no uid, aborting');
      return;
    }
    try {
      console.log('[accept] calling DB.acceptFriendRequest...');
      await DB.acceptFriendRequest(fromUid, uid);
      console.log('[accept] DB call done, refreshing profile...');
      await Auth.refreshProfile();
      console.log('[accept] all done');
      window.UI?.toast('Friend added', 'good');
      window.Audio?.correct();
      Friends.showTab('friends');
      window.Notifications?.reload();
    } catch (e) {
      console.error('[accept] FAILED:', e);
      console.error('[accept] code:', e?.code);
      console.error('[accept] message:', e?.message);
      window.UI?.toast('Failed: ' + (e?.code || e?.message || 'unknown'), 'bad');
    }
  },

  async rejectRequest(fromUid) {
    const uid = Auth.getCurrentUser()?.uid;
    if (!uid) {
      return;
    }
    try {
      await DB.rejectFriendRequest(fromUid, uid);
      window.UI?.toast('Request ignored', '');
      Friends.showTab('requests');
    } catch (e) {
    }
  },

  async removeFriend(friendUid) {
    const uid = Auth.getCurrentUser()?.uid;
    if (!uid) {
      return;
    }
    if (!confirm('Remove this friend?')) {
      return;
    }
    try {
      await DB.removeFriend(uid, friendUid);
      await Auth.refreshProfile();
      window.UI?.toast('Friend removed', '');
      Friends.showTab('friends');
    } catch (e) {
      window.UI?.toast('Failed to remove', 'bad');
    }
  },

  async showTab(tab, btnEl) {
    currentTab = tab;

    document.querySelectorAll('.friend-tab').forEach(b => b.classList.remove('active'));

    if (btnEl) {
      btnEl.classList.add('active');
    } else {
      const tabs = document.querySelectorAll('.friend-tab');
      const idx = ['friends', 'requests', 'sent'].indexOf(tab);
      if (tabs[idx]) {
        tabs[idx].classList.add('active');
      }
    }

    const list = document.getElementById('friends-list');
    if (!list) {
      return;
    }

    list.innerHTML = '<div class="loading-spinner"></div>';

    const uid = Auth.getCurrentUser()?.uid;
    const profile = Auth.getProfile();

    if (tab === 'friends') {
      const friendIds = profile?.friends || [];

      if (!friendIds.length) {
        list.innerHTML = '<div class="notice">No friends yet, search above to add some! 👥</div>';
        return;
      }

      const friendProfiles = await Promise.all(friendIds.map(id => DB.getUser(id)));
      let html = '';

      for (let i = 0; i < friendProfiles.length; i++) {
        const f = friendProfiles[i];
        if (!f) {
          continue;
        }
        html += '<div class="friend-item">';
        html += '<div class="friend-avatar">' + (f.avatar || '🐸') + '</div>';
        html += '<div class="friend-info">';
        html += '<div class="friend-name">' + esc(f.displayName) + '</div>';
        html += '<div class="friend-sub">' + (f.gamesPlayed || 0) + ' games, ' + (f.totalPoints || 0) + ' pts</div>';
        html += '</div>';
        html += '<div class="friend-actions">';
        html += '<button class="btn btn-ghost btn-sm" onclick="Friends.removeFriend(\'' + f.uid + '\')">Remove</button>';
        html += '<button class="btn btn-primary btn-sm" onclick="Game.inviteFriend(\'' + f.uid + '\')">Invite 🎮</button>';
        html += '</div>';
        html += '</div>';
      }

      if (!html) {
        html = '<div class="notice">No friends yet</div>';
      }

      list.innerHTML = html;

    } else if (tab === 'requests') {
      if (!uid) {
        list.innerHTML = '<div class="notice">Sign in to see requests</div>';
        return;
      }

      const reqs = await DB.getPendingRequests(uid);
      const badge = document.getElementById('req-badge');

      if (badge) {
        if (reqs.length > 0) {
          badge.style.display = 'inline-block';
        } else {
          badge.style.display = 'none';
        }
      }

      if (!reqs.length) {
        list.innerHTML = '<div class="notice">No pending requests</div>';
        return;
      }

      const profiles = await Promise.all(reqs.map(r => DB.getUser(r.from)));
      let html = '';

      for (let i = 0; i < profiles.length; i++) {
        const p = profiles[i];
        if (!p) {
          continue;
        }
        html += '<div class="friend-item">';
        html += '<div class="friend-avatar">' + (p.avatar || '🐸') + '</div>';
        html += '<div class="friend-info">';
        html += '<div class="friend-name">' + esc(p.displayName) + '</div>';
        html += '<div class="friend-sub">' + (p.gamesPlayed || 0) + ' games played</div>';
        html += '</div>';
        html += '<div class="friend-actions">';
        html += '<button class="btn btn-green btn-sm" onclick="Friends.acceptRequest(\'' + p.uid + '\')">Accept</button>';
        html += '<button class="btn btn-ghost btn-sm" onclick="Friends.rejectRequest(\'' + p.uid + '\')">Ignore</button>';
        html += '</div>';
        html += '</div>';
      }

      list.innerHTML = html;

    } else if (tab === 'sent') {
      if (!uid) {
        list.innerHTML = '<div class="notice">Sign in first</div>';
        return;
      }

      const sent = await DB.getSentRequests(uid);

      if (!sent.length) {
        list.innerHTML = '<div class="notice">No pending sent requests</div>';
        return;
      }

      const profiles = await Promise.all(sent.map(r => DB.getUser(r.to)));
      let html = '';

      for (let i = 0; i < profiles.length; i++) {
        const p = profiles[i];
        if (!p) {
          continue;
        }
        html += '<div class="friend-item">';
        html += '<div class="friend-avatar">' + (p.avatar || '🐸') + '</div>';
        html += '<div class="friend-info">';
        html += '<div class="friend-name">' + esc(p.displayName) + '</div>';
        html += '<div class="friend-sub">Waiting for response...</div>';
        html += '</div>';
        html += '<span style="font-size:12px;color:var(--trans)">Pending ⏳</span>';
        html += '</div>';
      }

      list.innerHTML = html;
    }
  },
};

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

window.Friends = Friends;
