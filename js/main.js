import { Auth } from './auth.js';
import { DB } from './db.js';
import { UI } from './ui.js';
import { Notifications } from './notifications.js';
import { Leaderboard } from './leaderboard.js';
import { Friends } from './friends.js';
import { Game } from './game.js';

const AVATARS = ['🐸','🦊','🐙','🦋','🦁','🐼','🐨','🦄','🦀','🐬','🦔','🐲','🦝','🦩','🐯','🦖'];

window.addEventListener('user-ready', async (event) => {
  const user = event.detail.user;
  const profile = event.detail.profile;

  UI.setConn('online');

  const bell = document.getElementById('notif-bell');
  if (bell) {
    if (user.isGuest) {
      bell.style.display = 'none';
    } else {
      bell.style.display = 'flex';
    }
  }

  Notifications.start(user.uid);

  const homeAvatar = document.getElementById('home-avatar');
  const homeUsername = document.getElementById('home-username');
  const homeStats = document.getElementById('home-stats');

  if (homeAvatar) {
    homeAvatar.textContent = profile.avatar || '🐸';
  }
  if (homeUsername) {
    homeUsername.textContent = profile.displayName || user.displayName || 'Player';
  }
  if (homeStats) {
    homeStats.textContent = (profile.gamesPlayed || 0) + ' games, ' + (profile.totalPoints || 0) + ' pts';
  }

  const createName = document.getElementById('create-name');
  const joinName = document.getElementById('join-name');

  if (createName && !createName.value) {
    createName.value = profile.displayName || '';
  }
  if (joinName && !joinName.value) {
    joinName.value = profile.displayName || '';
  }

  try {
    const count = await DB.getLiveRoomCount();
    const el = document.getElementById('live-rooms-count');
    if (el) {
      if (count > 0) {
        let txt = count + ' live room';
        if (count !== 1) {
          txt += 's';
        }
        txt += ' right now 🔴';
        el.textContent = txt;
      } else {
        el.textContent = 'Be the first to play today!';
      }
    }
  } catch (err) {
  }

  const params = new URLSearchParams(location.search);
  const joinCode = params.get('join');

  if (joinCode) {
    history.replaceState({}, '', location.pathname);
    const joinNameEl = document.getElementById('join-name');
    const joinCodeEl = document.getElementById('join-code');
    if (joinNameEl) {
      joinNameEl.value = profile.displayName || '';
    }
    if (joinCodeEl) {
      joinCodeEl.value = joinCode.toUpperCase();
    }
    UI.showScreen('screen-join');
    return;
  }

  UI.showScreen('screen-home');
});

window.addEventListener('user-signed-out', () => {
  Notifications.stop();
  const bell = document.getElementById('notif-bell');
  if (bell) {
    bell.style.display = 'none';
  }
  UI.showScreen('screen-auth');
});

window.addEventListener('user-ready', async (event) => {
  const user = event.detail.user;
  const profile = event.detail.profile;

  const bigAvatar = document.getElementById('profile-big-avatar');
  const name = document.getElementById('profile-display-name');
  const email = document.getElementById('profile-email');

  if (bigAvatar) {
    bigAvatar.textContent = profile.avatar || '🐸';
  }
  if (name) {
    name.textContent = profile.displayName || 'Player';
  }
  if (email) {
    if (user.isGuest) {
      email.textContent = 'Guest session';
    } else {
      email.textContent = profile.email || '';
    }
  }

  UI.renderProfileStats(profile);

  UI.renderAvatarPicker(profile.avatar || '🐸', async (av) => {
    if (user.isGuest) {
      profile.avatar = av;
      return;
    }
    try {
      await DB.updateUser(user.uid, { avatar: av });
      profile.avatar = av;
      if (bigAvatar) {
        bigAvatar.textContent = av;
      }
      const homeAv = document.getElementById('home-avatar');
      if (homeAv) {
        homeAv.textContent = av;
      }
      UI.toast('Avatar updated! ' + av, 'good');
    } catch (err) {
      UI.toast('Failed to update avatar', 'bad');
    }
  });

  if (!user.isGuest) {
    const games = await DB.getRecentGames(user.uid);
    UI.renderRecentGames(games);
  }
});

const friendsScreen = document.getElementById('screen-friends');
if (friendsScreen) {
  friendsScreen.addEventListener('animationend', () => {
    const uid = Auth.getCurrentUser()?.uid;
    if (!uid) {
      return;
    }
    Friends.showTab('friends');
    DB.getPendingRequests(uid).then(reqs => {
      const badge = document.getElementById('req-badge');
      if (badge) {
        if (reqs.length > 0) {
          badge.style.display = 'inline-block';
        } else {
          badge.style.display = 'none';
        }
      }
    });
  });
}

const lbScreen = document.getElementById('screen-leaderboard');
if (lbScreen) {
  lbScreen.addEventListener('animationend', () => {
    Leaderboard.load('alltime');
  });
}

UI.switchAuthTab('login');

const params = new URLSearchParams(location.search);
if (params.get('join')) {
  console.log('Invite link found, waiting for login...');
}
