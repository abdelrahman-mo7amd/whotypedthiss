import { DB } from './db.js';
import { Auth } from './auth.js';

export const Leaderboard = {
  async load(type, btnEl) {
    if (!type) {
      type = 'alltime';
    }

    document.querySelectorAll('.lb-tab').forEach(b => b.classList.remove('active'));

    if (btnEl) {
      btnEl.classList.add('active');
    }

    const list = document.getElementById('leaderboard-list');
    if (!list) {
      return;
    }

    list.innerHTML = '<div class="loading-spinner"></div>';

    try {
      const entries = await DB.getLeaderboard(type);
      const myUid = Auth.getCurrentUser()?.uid;

      if (!entries.length) {
        list.innerHTML = '<div class="notice">No scores yet, be the first! 🏆</div>';
        return;
      }

      let html = '';

      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const rank = i + 1;

        let rankClass = '';
        if (rank === 1) {
          rankClass = 'r1';
        } else if (rank === 2) {
          rankClass = 'r2';
        } else if (rank === 3) {
          rankClass = 'r3';
        }

        let rankLabel = rank + 'TH';
        if (rank === 1) {
          rankLabel = '1ST 🥇';
        } else if (rank === 2) {
          rankLabel = '2ND 🥈';
        } else if (rank === 3) {
          rankLabel = '3RD 🥉';
        }

        let field = e.totalPoints;
        if (type === 'weekly') {
          field = e.weeklyPoints;
        } else if (type === 'games') {
          field = e.gamesPlayed;
        }

        const isMe = e.uid === myUid;
        const youLabel = isMe ? '<span class="lb-you">You</span>' : '';

        html += '<div class="lb-item" style="animation-delay:' + (i * .05) + 's">';
        html += '<div class="lb-rank ' + rankClass + '">' + rankLabel + '</div>';
        html += '<div style="font-size:26px">' + (e.avatar || '🐸') + '</div>';
        html += '<div class="lb-name">' + esc(e.displayName) + ' ' + youLabel + '</div>';
        html += '<div class="lb-score">' + (field || 0) + '</div>';
        html += '</div>';
      }

      list.innerHTML = html;

    } catch (e) {
      list.innerHTML = '<div class="notice" style="color:var(--red)">Failed to load leaderboard</div>';
    }
  },
};

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

window.Leaderboard = Leaderboard;
