import { DB } from './db.js';
import { Auth } from './auth.js';
import { AIEngine } from './ai.js';

const AVATARS = ['🐸','🦊','🐙','🦋','🦁','🐼','🐨','🦄','🦀','🐬','🦔','🐲','🦝','🦩','🐯','🦖'];
const COLORS = ['#ffe44d','#4dffa0','#4da6ff','#ff8c4d','#b44dff','#ff4dbf','#4dfff0','#ff4d6a'];

// ─── POWER-UP DEFINITIONS ─────────────────────────────────────────────────────
const POWERUPS = [
  {
    id: 'double_pts',
    icon: '⚡',
    name: 'Double Points',
    desc: 'Next correct guess = 200 pts',
    color: '#ffe44d',
  },
  {
    id: 'shield',
    icon: '🛡️',
    name: 'Style Shield',
    desc: 'Your writing style is hidden from AI analysis this round',
    color: '#4da6ff',
  },
  {
    id: 'ai_hint',
    icon: '🔮',
    name: 'Oracle Hint',
    desc: 'Get an AI hint about who wrote this',
    color: '#b44dff',
  },
  {
    id: 'swap',
    icon: '🔀',
    name: 'Swap & Bluff',
    desc: 'Secretly change your prompt topic (host only)',
    color: '#ff8c4d',
  },
];

// ─── STATE ────────────────────────────────────────────────────────────────────
export let S = {
  myId: null,
  myName: '',
  roomCode: '',
  roomName: '',
  isHost: false,
  rounds: 3,
  timerSec: 20,
  timerInterval: null,
  guessLocked: false,
  lastRound: -1,
  unsubRoom: null,
  myTexts: [],          // accumulate for AI analysis
  activePowerup: null,  // currently equipped powerup
  powerups: [],         // powerups earned this game
  streak: 0,            // consecutive correct guesses
  aiHintUsed: false,
  aiHintLoading: false,
  spectatorMode: false,
};
window.GameState = S;

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let r = '';
  for (let i = 0; i < 6; i++) r += chars[Math.floor(Math.random() * chars.length)];
  return r;
}

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── GAME ─────────────────────────────────────────────────────────────────────
export const Game = {

  // ── CREATE / JOIN ─────────────────────────────────────────────────────────

  async createRoom() {
    const name = document.getElementById('create-name')?.value.trim();
    const roomName = document.getElementById('create-room')?.value.trim();
    const timer = parseInt(document.getElementById('create-timer')?.value || 20);
    const gameMode = document.getElementById('create-mode')?.value || 'classic';

    if (!name) return window.UI?.toast('Enter your name first', 'bad');
    if (!roomName) return window.UI?.toast('Give the room a name', 'bad');

    const user = Auth.getCurrentUser();
    const profile = Auth.getProfile();
    const code = genCode();
    const myId = user?.uid || 'p_' + Date.now();
    const avatar = profile?.avatar || AVATARS[Math.floor(Math.random() * AVATARS.length)];

    Object.assign(S, {
      myId, myName: name, roomCode: code, roomName,
      isHost: true, timerSec: timer, myTexts: [],
      activePowerup: null, powerups: [], streak: 0,
    });

    const roomData = {
      code, name: roomName, timerSec: timer,
      gameMode,
      phase: 'lobby',
      players: [{ id: myId, name, avatar, color: COLORS[0], score: 0, uid: user?.uid || null, powerups: [], streak: 0 }],
      // prompts array is built at game start, not here
      prompts: [], currentRound: 0, promptsDone: [],
      guessesDone: [], roundGuesses: {}, roundHistory: [],
      reactions: {},
      playerTexts: {},
      aiHints: {},
    };

    try {
      await DB.createRoom(code, roomData);
      window.Audio?.start();
      Game._enterLobby();
    } catch (e) {
      window.UI?.toast('Failed to create room, check your connection', 'bad');
    }
  },

  async joinRoom(code) {
    const name = document.getElementById('join-name')?.value.trim();
    const roomCode = (code || document.getElementById('join-code')?.value.trim() || '').toUpperCase();

    if (!name) return window.UI?.toast('Enter your name first', 'bad');
    if (roomCode.length < 4) return window.UI?.toast('Enter a valid room code', 'bad');

    const room = await DB.getRoom(roomCode);
    if (!room) return window.UI?.toast('Room not found. Check the code.', 'bad');
    if (room.phase !== 'lobby') {
      if (room.phase !== 'final') {
        return window.UI?.toast('Game already started.', 'bad');
      }
      return window.UI?.toast('Game is over.', 'bad');
    }

    const user = Auth.getCurrentUser();
    const profile = Auth.getProfile();
    const idx = room.players.length;
    const myId = user?.uid || 'p_' + Date.now();
    const avatar = profile?.avatar || AVATARS[idx % AVATARS.length];

    // FIX: check for duplicate player ID
    if (room.players.find(p => p.id === myId)) {
      // Reconnecting — just re-enter
      Object.assign(S, {
        myId, myName: name, roomCode, roomName: room.name,
        isHost: room.players[0]?.id === myId,
        timerSec: room.timerSec || 20,
        myTexts: room.playerTexts?.[myId] || [],
        activePowerup: null, powerups: [], streak: 0,
      });
      window.Audio?.join();
      Game._enterLobby();
      return;
    }

    Object.assign(S, {
      myId, myName: name, roomCode, roomName: room.name,
      isHost: false, timerSec: room.timerSec || 20,
      myTexts: [], activePowerup: null, powerups: [], streak: 0,
    });

    room.players.push({
      id: myId, name, avatar, color: COLORS[idx % COLORS.length],
      score: 0, uid: user?.uid || null, powerups: [], streak: 0,
    });

    try {
      await DB.updateRoom(roomCode, { players: room.players });
      window.Audio?.join();
      Game._enterLobby();
    } catch (e) {
      window.UI?.toast('Failed to join, try again', 'bad');
    }
  },

  async joinByCode(code) {
    if (!Auth.getCurrentUser()) {
      window.UI?.showScreen('screen-auth');
      return;
    }
    const nameInput = document.getElementById('join-name');
    const codeInput = document.getElementById('join-code');
    if (nameInput) nameInput.value = Auth.getProfile()?.displayName || '';
    if (codeInput) codeInput.value = code;
    window.UI?.showScreen('screen-join');
    if (nameInput?.value) await Game.joinRoom(code);
  },

  async inviteFriend(friendUid) {
    if (!S.roomCode) return window.UI?.toast('Create a room first', 'bad');
    const profile = Auth.getProfile();
    await DB.addNotification(friendUid, {
      type: 'room_invite',
      message: (profile?.displayName || 'Someone') + ' invited you to a room',
      fromUid: Auth.getCurrentUser()?.uid,
      roomCode: S.roomCode,
    });
    window.UI?.toast('Invite sent! 🎮', 'good');
  },

  // ── LOBBY ─────────────────────────────────────────────────────────────────

  _enterLobby() {
    window.UI?.showScreen('screen-lobby');
    document.getElementById('lobby-code-text').textContent = S.roomCode;
    document.getElementById('lobby-code-big').textContent = S.roomCode;
    document.getElementById('lobby-code-nav').innerHTML = '<span id="lobby-code-text">' + S.roomCode + '</span> 📋';

    document.getElementById('lobby-host-zone').style.display = S.isHost ? 'block' : 'none';
    document.getElementById('lobby-guest-zone').style.display = S.isHost ? 'none' : 'block';

    Game._renderLobby();
    Game._startListening();
  },

  async _renderLobby(room) {
    if (!room) room = await DB.getRoom(S.roomCode);
    if (!room) return;

    document.getElementById('lobby-title').textContent = room.name + ' 🎮';

    let subText = room.players.length + ' player';
    if (room.players.length !== 1) subText += 's';
    subText += ' in the room';
    document.getElementById('lobby-sub').textContent = subText;

    const list = document.getElementById('lobby-players');
    list.innerHTML = '';
    for (let i = 0; i < room.players.length; i++) {
      const p = room.players[i];
      const el = document.createElement('div');
      el.className = 'player-item';
      el.style.animationDelay = (i * .08) + 's';
      const isMe = p.id === S.myId;
      let nameHtml = esc(p.name);
      if (isMe) nameHtml += ' <span style="color:var(--trans);font-size:12px">(you)</span>';
      let badgeHtml = i === 0 ? '<span class="player-badge">HOST</span>' : '';
      el.innerHTML = '<div class="player-avatar">' + p.avatar + '</div><div class="player-name">' + nameHtml + '</div>' + badgeHtml;
      list.appendChild(el);
    }

    const startBtn = document.getElementById('start-btn');
    if (startBtn && S.isHost) {
      const can = room.players.length >= 2;
      startBtn.disabled = !can;
      startBtn.textContent = can ? 'Start Game' : 'Need at least 2 players';
    }

    // Invite friends panel
    const profile = Auth.getProfile();
    if (S.isHost && profile?.friends?.length) {
      const invList = document.getElementById('invite-friends-list');
      const placeholder = document.getElementById('invite-placeholder');
      if (placeholder) placeholder.style.display = 'none';
      const friendProfiles = await Promise.all(profile.friends.slice(0, 8).map(id => DB.getUser(id)));
      if (invList) {
        invList.innerHTML = friendProfiles.filter(Boolean).map(f =>
          `<button class="hint-pill" onclick="Game.inviteFriend('${f.uid}')" title="Invite ${esc(f.displayName)}">${f.avatar || '🐸'} ${esc(f.displayName)}</button>`
        ).join('');
      }
    }
  },

  // ── START GAME ────────────────────────────────────────────────────────────

  async startGame() {
    if (!S.isHost) return;
    const room = await DB.getRoom(S.roomCode);
    if (!room || room.players.length < 2) return window.UI?.toast('Need at least 2 players', 'bad');

    const players = room.players;
    const prompts = [];

    // Each player writes one sentence about the next player (circular).
    // So if there are N players, there are exactly N prompts and N guessing rounds.
    // Player 0 writes about player 1, player 1 about player 2, ..., last about player 0.
    for (let i = 0; i < players.length; i++) {
      const aboutIdx = (i + 1) % players.length;
      prompts.push({
        authorId: players[i].id,
        aboutId: players[aboutIdx].id,
        text: null,
      });
    }

    await DB.updateRoom(S.roomCode, {
      phase: 'prompting',
      prompts,
      currentRound: 0,
      promptsDone: [],
      guessesDone: [],
      roundGuesses: {},
      roundHistory: [],
      reactions: {},
      playerTexts: {},
      aiHints: {},
    });
    window.Audio?.start();
  },

  // ── LISTENER ─────────────────────────────────────────────────────────────

  _startListening() {
    if (S.unsubRoom) S.unsubRoom();
    S.unsubRoom = DB.listenRoom(S.roomCode, room => Game._onRoomUpdate(room));
  },

  _stopListening() {
    if (S.unsubRoom) { S.unsubRoom(); S.unsubRoom = null; }
  },

  _onRoomUpdate(room) {
    const currentScreen = document.querySelector('.screen.active')?.id;

    if (room.phase === 'prompting' && currentScreen !== 'screen-prompt') {
      Game._enterPrompt(room);
    } else if (room.phase === 'guessing') {
      if (currentScreen !== 'screen-guess') {
        Game._enterGuess(room);
      } else if (room.currentRound !== S.lastRound) {
        S.lastRound = room.currentRound;
        S.guessLocked = false;
        S.aiHintUsed = false;
        Game._renderGuessRound(room);
      } else {
        // Sync reactions from other players
        Game._renderLiveReactions(room);
      }
    } else if (room.phase === 'final' && currentScreen !== 'screen-final') {
      Game._enterFinal(room);
    } else if (room.phase === 'lobby' && currentScreen !== 'screen-lobby') {
      Game._enterLobby();
    } else if (currentScreen === 'screen-lobby') {
      Game._renderLobby(room);
    } else if (currentScreen === 'screen-prompt') {
      Game._renderPromptWaiting(room);
    }
  },

  // ── PROMPT PHASE ─────────────────────────────────────────────────────────

  async _enterPrompt(room) {
    window.UI?.showScreen('screen-prompt');
    const navCode = document.getElementById('prompt-code-nav');
    if (navCode) navCode.textContent = S.roomCode;

    const myPrompt = room.prompts.find(p => p.authorId === S.myId && !p.text);
    if (myPrompt) {
      const about = room.players.find(p => p.id === myPrompt.aboutId);
      if (about) {
        document.getElementById('prompt-target-name').textContent = about.avatar + ' ' + about.name;
      }
    }

    const submitBtn = document.getElementById('submit-prompt-btn');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Anonymously 👻';
    }
    document.getElementById('prompt-input').value = '';
    window.UI?.updateCharCount();

    // ── AI-powered prompt ideas ──
    if (myPrompt) {
      const about = room.players.find(p => p.id === myPrompt.aboutId);
      Game._loadAIPromptIdeas(S.myName, about?.name || 'them');
    }

    Game._renderPromptWaiting(room);
  },

  async _loadAIPromptIdeas(authorName, targetName) {
    const pillsContainer = document.getElementById('hint-pills');
    if (!pillsContainer) return;

    // Show loading state
    pillsContainer.innerHTML = '<div class="hint-pill loading-pill">Loading ideas...</div>';

    try {
      const result = await AIEngine.generatePromptIdea(authorName, targetName);
      const ideas = result.ideas || [];
      pillsContainer.innerHTML = ideas.map(idea =>
        `<div class="hint-pill ai-pill" onclick="UI.useHint('${esc(idea)}')">${idea}</div>`
      ).join('') + `
        <div class="hint-pill" onclick="UI.useHint('Would 100% trip over nothing and blame the floor')">classic</div>
        <div class="hint-pill" onclick="UI.useHint('Their playlist is just 3 songs on repeat forever')">music</div>`;
    } catch {
      pillsContainer.innerHTML = `
        <div class="hint-pill" onclick="UI.useHint('Would survive anything just by talking too much')">talks a lot</div>
        <div class="hint-pill" onclick="UI.useHint('Always the last one to understand the joke')">slow on jokes</div>
        <div class="hint-pill" onclick="UI.useHint('Has a different reason every time they are late')">always late</div>
        <div class="hint-pill" onclick="UI.useHint('Googles something instead of just remembering it')">google addict</div>
        <div class="hint-pill" onclick="UI.useHint('Their phone has less than 5% battery at all times')">dead battery</div>`;
    }
  },

  _renderPromptWaiting(room) {
    const waitList = document.getElementById('prompt-waiting-list');
    if (!waitList) return;

    const submitted = new Set(room.promptsDone || []);
    waitList.innerHTML = room.players.map(p =>
      `<div class="waiting-item${submitted.has(p.id) ? ' done' : ''}">
        <span class="wname">${p.avatar} ${esc(p.name)}</span>
        <div class="waiting-dot"></div>
      </div>`
    ).join('');

    // Only move to guessing when every player has submitted
    const allSubmitted = room.players.every(p => submitted.has(p.id));
    if (S.isHost && allSubmitted && room.phase === 'prompting') {
      // Remove any prompts that have no text (safety guard)
      const filledPrompts = room.prompts.filter(p => p.text && p.text.trim().length > 0);
      DB.updateRoom(S.roomCode, {
        phase: 'guessing',
        prompts: filledPrompts,
        currentRound: 0,
        guessesDone: [],
        roundGuesses: {},
      });
    }
  },

  async submitPrompt() {
    const text = document.getElementById('prompt-input')?.value.trim();
    if (!text || text.length < 10) return window.UI?.toast('Write at least 10 characters', 'bad');
    if (text.length > 100) return window.UI?.toast('Too long. Max 100 characters.', 'bad');

    const btn = document.getElementById('submit-prompt-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Submitted'; }

    window.Audio?.submit();

    const room = await DB.getRoom(S.roomCode);
    if (!room) return;

    const idx = room.prompts.findIndex(p => p.authorId === S.myId && !p.text);
    if (idx === -1) return window.UI?.toast('Already submitted!', '');

    room.prompts[idx].text = text;
    const done = [...(room.promptsDone || [])];
    if (!done.includes(S.myId)) done.push(S.myId);

    // Store text for AI analysis
    const playerTexts = Object.assign({}, room.playerTexts || {});
    if (!playerTexts[S.myId]) playerTexts[S.myId] = [];
    playerTexts[S.myId] = [...playerTexts[S.myId], text];
    S.myTexts.push(text);

    await DB.updateRoom(S.roomCode, { prompts: room.prompts, promptsDone: done, playerTexts });
    window.UI?.toast('Done. Your answer is hidden.', 'good');
  },

  // ── GUESS PHASE ───────────────────────────────────────────────────────────

  _enterGuess(room) {
    window.UI?.showScreen('screen-guess');
    const navCode = document.getElementById('guess-code-nav');
    if (navCode) navCode.textContent = S.roomCode;
    S.lastRound = room.currentRound;
    S.guessLocked = false;
    S.aiHintUsed = false;
    Game._renderGuessRound(room);
  },

  _renderGuessRound(room) {
    const round = room.currentRound;
    const prompts = (room.prompts || []).filter(p => p.text && p.text.trim().length > 0);
    const prompt = prompts[round];

    // No text for this round — host auto-skips it
    if (!prompt || !prompt.text) {
      if (S.isHost) Game.nextRound();
      return;
    }

    const about = room.players.find(p => p.id === prompt.aboutId);
    const totalRounds = prompts.length;
    const gameMode = room.gameMode || 'classic';

    document.getElementById('guess-round-num').textContent = round + 1;
    document.getElementById('guess-round-total').textContent = totalRounds;

    const aboutLbl = document.getElementById('guess-about-label');
    if (aboutLbl) aboutLbl.textContent = 'written about ' + (about?.avatar || '') + ' ' + (about?.name || '?');

    // BLIND mode: hide text until 5 seconds in
    const promptTextEl = document.getElementById('guess-prompt-text');
    if (gameMode === 'blind' && !S.guessLocked) {
      promptTextEl.textContent = '???';
      promptTextEl.classList.add('blurred-text');
      setTimeout(() => {
        promptTextEl.textContent = prompt.text || '...';
        promptTextEl.classList.remove('blurred-text');
      }, 5000);
    } else {
      promptTextEl.textContent = prompt.text || '...';
      promptTextEl.classList.remove('blurred-text');
    }

    // Round progress dots
    const dotsEl = document.getElementById('round-dots');
    if (dotsEl) {
      dotsEl.innerHTML = prompts.map((_, i) =>
        `<div class="round-dot${i < round ? ' done' : i === round ? ' active' : ''}"></div>`
      ).join('');
    }

    // AI style meter (local, instant)
    const playerTexts = room.playerTexts || {};
    const playersWithTexts = room.players.map(p => ({
      id: p.id,
      name: p.name,
      texts: playerTexts[p.id] || [],
    }));
    // Exclude the current text being analyzed
    const otherTexts = playersWithTexts.map(p => ({
      ...p,
      texts: p.texts.filter(t => t !== prompt.text),
    }));
    const simScores = prompt.text ? AIEngine.getLocalSimilarityScores(prompt.text, otherTexts) : {};

    // Guess buttons
    const guessGrid = document.getElementById('guess-options');
    if (guessGrid) {
      guessGrid.innerHTML = room.players.map(p => {
        const matchScore = simScores[p.id] || 50;
        const nameLabel = esc(p.name) + (p.id === S.myId ? ' (you)' : '');
        const disabledAttr = S.guessLocked ? 'disabled' : '';
        return `<button class="guess-btn" onclick="Game._makeGuess('${p.id}', '${prompt.authorId}')" ${disabledAttr} data-id="${p.id}">
          <span class="gavatar">${p.avatar}</span>
          <span class="gname">${nameLabel}</span>
          <div class="style-meter">
            <div class="style-meter-fill" style="width:${matchScore}%"></div>
          </div>
          <span class="style-score">${matchScore}% match</span>
        </button>`;
      }).join('');
    }

    document.getElementById('reveal-area').innerHTML = '';
    document.getElementById('reaction-bar').style.display = 'none';
    document.getElementById('next-btn-wrap').style.display = 'none';
    document.getElementById('ai-hint-area').innerHTML = '';

    // AI Hint button (one per round, costs a power-up)
    const hintBtn = document.getElementById('ai-oracle-btn');
    if (hintBtn) {
      hintBtn.style.display = 'block';
      hintBtn.disabled = S.aiHintUsed || S.guessLocked;
      hintBtn.textContent = S.aiHintUsed ? 'Hint used' : 'Get a hint from AI';
    }

    // Timer
    if (room.timerSec > 0) {
      const timerSec = gameMode === 'speed' ? Math.max(8, room.timerSec - 10) : room.timerSec;
      Game._startTimer(timerSec, prompt.authorId);
    } else {
      document.getElementById('timer-wrap').style.display = 'none';
      document.getElementById('timer-label-wrap').style.display = 'none';
    }
  },

  async useAIHint() {
    if (S.aiHintUsed || S.aiHintLoading) return;
    S.aiHintLoading = true;

    const room = await DB.getRoom(S.roomCode);
    if (!room) return;
    const round = room.currentRound;
    const prompt = room.prompts[round];
    if (!prompt) return;

    const hintArea = document.getElementById('ai-hint-area');
    const hintBtn = document.getElementById('ai-oracle-btn');
    if (hintArea) hintArea.innerHTML = '<div class="ai-hint-loading">Analyzing writing style...</div>';
    if (hintBtn) { hintBtn.disabled = true; hintBtn.textContent = 'Analyzing...'; }

    window.Audio?.aiReveal();

    try {
      const playerTexts = room.playerTexts || {};
      const players = room.players.map(p => ({
        name: p.name,
        texts: (playerTexts[p.id] || []).filter(t => t !== prompt.text),
      }));

      // If already cached in room, use it
      if (room.aiHints?.[round]) {
        const { hint } = room.aiHints[round];
        Game._showAIHint(hint, hintArea, hintBtn);
      } else {
        const result = await AIEngine.getAIHint(prompt.text, players);
        const hint = result.hint || 'Could not get a hint. Trust your gut.';

        // Cache hint in room so all players see it
        const aiHints = Object.assign({}, room.aiHints || {});
        aiHints[round] = { hint, ts: Date.now() };
        await DB.updateRoom(S.roomCode, { aiHints });
        Game._showAIHint(hint, hintArea, hintBtn);
      }
    } catch {
      Game._showAIHint('AI is not available right now.', hintArea, hintBtn);
    }

    S.aiHintUsed = true;
    S.aiHintLoading = false;
  },

  _showAIHint(hint, hintArea, hintBtn) {
    if (hintArea) {
      hintArea.innerHTML = `<div class="ai-hint-card">
        <span class="ai-hint-icon">🔮</span>
        <span class="ai-hint-text">${esc(hint)}</span>
      </div>`;
    }
    if (hintBtn) { hintBtn.textContent = 'Hint used'; hintBtn.disabled = true; }
  },

  async _makeGuess(guessedId, actualAuthorId) {
    if (S.guessLocked) return;
    S.guessLocked = true;
    Game._stopTimer();

    const correct = guessedId === actualAuthorId;
    let pts = correct ? 100 : 0;

    // FIX: handle __nobody__ from timer expiry gracefully
    if (guessedId === '__nobody__') {
      pts = 0;
      // Still proceed to show reveal
    }

    // Apply double-points powerup
    if (correct && S.activePowerup === 'double_pts') {
      pts = 200;
      S.activePowerup = null;
      window.UI?.toast('Double points! +200', 'good');
    }

    // Update streak
    if (correct) {
      S.streak++;
      if (S.streak >= 3) {
        pts += 50;
        window.Audio?.streak();
        window.UI?.toast(S.streak + ' in a row! +50 bonus', 'good');
      } else {
        window.Audio?.correct();
      }
    } else {
      S.streak = 0;
      if (guessedId !== '__nobody__') window.Audio?.wrong();
    }

    // Reveal correct answer visually
    document.querySelectorAll('.guess-btn').forEach(btn => {
      btn.disabled = true;
      const btnId = btn.dataset.id;
      if (btnId === actualAuthorId) btn.classList.add('correct');
      else if (btnId === guessedId && !correct) btn.classList.add('wrong');
    });

    const roomData = await DB.getRoom(S.roomCode);
    const author = roomData?.players?.find(p => p.id === actualAuthorId);
    const area = document.getElementById('reveal-area');

    if (area) {
      const revealClass = 'reveal-card' + (correct ? ' correct-reveal' : ' wrong-reveal');
      const verdictText = correct ? 'Correct!' : (guessedId === '__nobody__' ? 'Time ran out!' : 'Wrong');
      const subText = `Written by ${author?.avatar || ''} ${esc(author?.name || '?')} ${correct ? '+' + pts + ' pts' : '0 pts'}`;

      area.innerHTML = `<div class="${revealClass}">
        <div class="reveal-verdict">${verdictText}</div>
        <div class="reveal-sub">${subText}</div>
        ${S.streak >= 2 && correct ? `<div class="streak-badge">${S.streak} in a row</div>` : ''}
      </div>`;

      if (correct) Game._spawnConfetti(area);
    }

    // Reaction bar
    const reactionBar = document.getElementById('reaction-bar');
    if (reactionBar) {
      reactionBar.style.display = 'flex';
      reactionBar.innerHTML = ['😂','🔥','💀','👀','🫡','🤣','😭','💯'].map(e =>
        `<button class="reaction-btn" onclick="Game._sendReaction('${e}', this)">${e}</button>`
      ).join('');
    }

    const room = await DB.getRoom(S.roomCode);
    if (!room) return;

    const roundGuesses = Object.assign({}, room.roundGuesses || {});
    roundGuesses[S.myId] = { guessedId, correct, pts };

    const guessesDone = [...(room.guessesDone || [])];
    if (!guessesDone.includes(S.myId)) guessesDone.push(S.myId);

    const players = room.players.map(p => {
      if (p.id === S.myId) {
        return { ...p, score: (p.score || 0) + pts, streak: S.streak };
      }
      return p;
    });

    await DB.updateRoom(S.roomCode, { roundGuesses, guessesDone, players });

    const filledCount = (room.prompts || []).filter(p => p.text && p.text.trim().length > 0).length;
    const isLastRound = (room.currentRound + 1) >= filledCount;
    const allGuessed = guessesDone.length >= room.players.length;

    // Show next button — host controls pacing
    const nextWrap = document.getElementById('next-btn-wrap');
    const nextBtn = document.getElementById('next-btn');
    if (nextWrap) nextWrap.style.display = 'block';

    if (S.isHost) {
      if (nextBtn) {
        nextBtn.style.display = 'block';
        nextBtn.textContent = isLastRound ? 'See results' : 'Next round';
      }
      // Auto-advance when everyone has guessed
      if (allGuessed) {
        if (isLastRound) {
          await DB.updateRoom(S.roomCode, { phase: 'final', roundGuesses: {} });
        } else {
          await DB.updateRoom(S.roomCode, {
            currentRound: room.currentRound + 1,
            roundGuesses: {},
            guessesDone: [],
          });
        }
      }
    } else {
      if (nextWrap) nextWrap.innerHTML = '<div class="notice">Waiting for the next round...</div>';
    }

    // Award powerup for streak
    if (S.streak > 0 && S.streak % 2 === 0) {
      Game._awardPowerup();
    }
  },

  _awardPowerup() {
    const pu = POWERUPS[Math.floor(Math.random() * POWERUPS.length)];
    S.powerups.push(pu);
    window.Audio?.powerup();
    window.UI?.toast('Power-up: ' + pu.name, 'good');
    Game._renderPowerupBar();
  },

  _renderPowerupBar() {
    const bar = document.getElementById('powerup-bar');
    if (!bar) return;
    if (S.powerups.length === 0) { bar.innerHTML = ''; return; }
    bar.innerHTML = S.powerups.map((pu, i) =>
      `<button class="powerup-btn ${S.activePowerup === pu.id ? 'active' : ''}"
        onclick="Game._activatePowerup(${i})"
        title="${pu.name}: ${pu.desc}">${pu.icon}</button>`
    ).join('');
  },

  _activatePowerup(idx) {
    const pu = S.powerups[idx];
    if (!pu) return;

    if (pu.id === 'ai_hint') {
      S.powerups.splice(idx, 1);
      Game._renderPowerupBar();
      Game.useAIHint();
      return;
    }

    S.activePowerup = pu.id === S.activePowerup ? null : pu.id;
    window.Audio?.powerup();
    window.UI?.toast(pu.name + (S.activePowerup ? ' is ready' : ' off'), 'good');
    Game._renderPowerupBar();
  },

  // FIX: Reactions now sync to all players via Firestore
  async _sendReaction(emoji, btn) {
    document.querySelectorAll('.reaction-btn').forEach(b => b.classList.remove('used'));
    btn.classList.add('used');

    const room = await DB.getRoom(S.roomCode);
    if (!room) return;

    const reactions = Object.assign({}, room.reactions || {});
    const roundKey = String(room.currentRound);
    if (!reactions[roundKey]) reactions[roundKey] = {};
    reactions[roundKey][S.myId] = emoji;

    await DB.updateRoom(S.roomCode, { reactions });
    Game._floatEmoji(emoji);
  },

  _renderLiveReactions(room) {
    if (!room.reactions) return;
    const roundKey = String(room.currentRound);
    const roundReactions = room.reactions[roundKey] || {};
    // Only float new ones (not my own which already floated)
    for (const [uid, emoji] of Object.entries(roundReactions)) {
      if (uid !== S.myId) {
        const player = room.players.find(p => p.id === uid);
        Game._floatEmoji(emoji, player?.name);
      }
    }
  },

  _floatEmoji(emoji, fromName) {
    const container = document.body;
    const el = document.createElement('div');
    el.className = 'floating-emoji';
    el.textContent = emoji;
    el.style.left = (10 + Math.random() * 80) + '%';
    el.style.bottom = '80px';
    if (fromName) {
      el.title = fromName;
    }
    container.appendChild(el);
    setTimeout(() => el.remove(), 1800);
  },

  // ── NEXT ROUND / RESULTS ─────────────────────────────────────────────────

  // Manual fallback — host can force-advance if a player disconnected
  async nextRound() {
    if (!S.isHost) return;
    Game._stopTimer();
    const room = await DB.getRoom(S.roomCode);
    const next = (room?.currentRound || 0) + 1;
    const filledCount = (room?.prompts || []).filter(p => p.text && p.text.trim().length > 0).length;

    if (next >= filledCount) {
      await DB.updateRoom(S.roomCode, { phase: 'final', roundGuesses: {} });
    } else {
      await DB.updateRoom(S.roomCode, {
        currentRound: next,
        roundGuesses: {},
        guessesDone: [],
      });
    }
  },

  // ── TIMER ─────────────────────────────────────────────────────────────────

  _startTimer(sec, authorId) {
    Game._stopTimer();
    let left = sec;
    const bar = document.getElementById('timer-bar');
    const lbl = document.getElementById('guess-timer-num');
    const wrap = document.getElementById('timer-label-wrap');
    const timerWrap = document.getElementById('timer-wrap');

    if (timerWrap) timerWrap.style.display = 'block';
    if (wrap) wrap.style.display = 'flex';
    if (bar) { bar.style.width = '100%'; bar.classList.remove('hurry'); }
    if (wrap) wrap.classList.remove('timer-hurry');

    S.timerInterval = setInterval(() => {
      left--;
      if (lbl) lbl.textContent = left;
      if (bar) bar.style.width = (left / sec * 100) + '%';

      if (left <= 5 && left > 0) {
        if (bar) bar.classList.add('hurry');
        if (wrap) wrap.classList.add('timer-hurry');
        window.Audio?.timerTick();
      }

      if (left <= 0) {
        Game._stopTimer();
        window.Audio?.timerAlarm();
        if (!S.guessLocked) {
          window.UI?.toast('Time ran out', 'bad');
          // FIX: pass authorId correctly to makeGuess with nobody
          Game._makeGuess('__nobody__', authorId);
        }
      }
    }, 1000);
  },

  _stopTimer() {
    if (S.timerInterval) { clearInterval(S.timerInterval); S.timerInterval = null; }
  },

  // ── FINAL SCREEN ──────────────────────────────────────────────────────────

  async _enterFinal(room) {
    Game._stopTimer();
    if (!room) room = await DB.getRoom(S.roomCode);
    if (!room) return;

    window.Audio?.winner();
    window.UI?.showScreen('screen-final');

    const sorted = [...room.players].sort((a, b) => b.score - a.score);
    const maxScore = sorted[0]?.score || 1;
    const myRank = sorted.findIndex(p => p.id === S.myId) + 1;

    const titles = [
      ['You won', 'You know your friends too well.'],
      ['Second place', 'Close, but not quite.'],
      ['Third place', 'Better luck next time.'],
      ['Last place', 'Your friends are strangers to you.'],
    ];
    const t = titles[Math.min(myRank - 1, 3)];
    document.getElementById('score-title').textContent = t[0];
    document.getElementById('score-subtitle').textContent = t[1];

    // Scoreboard
    const board = document.getElementById('final-scoreboard');
    board.innerHTML = '';
    sorted.forEach((p, i) => {
      const el = document.createElement('div');
      el.className = 'score-item';
      el.style.animationDelay = (i * .1) + 's';
      const rankClass = ['rank-1','rank-2','rank-3'][i] || '';
      const rankLabel = ['1ST','2ND','3RD'][i] || (i+1) + 'TH';
      const nameLabel = esc(p.name) + (p.id === S.myId ? ' (you)' : '');
      const widthPct = Math.round(p.score / maxScore * 100);
      const streakBadge = (p.streak || 0) >= 3 ? `<span class="mini-badge fire">🔥${p.streak}</span>` : '';
      el.innerHTML = `<div class="score-rank ${rankClass}">${rankLabel}</div>
        <div style="font-size:26px">${p.avatar}</div>
        <div class="score-bar-wrap">
          <div class="score-name">${nameLabel}${streakBadge}</div>
          <div class="score-bar-bg">
            <div class="score-bar-fill" style="width:0%" data-w="${widthPct}%"></div>
          </div>
        </div>
        <div class="score-pts">${p.score}</div>`;
      board.appendChild(el);
    });

    setTimeout(() => {
      document.querySelectorAll('.score-bar-fill').forEach(b => { b.style.width = b.dataset.w; });
    }, 200);

    // Round recap
    const recap = document.getElementById('recap-board');
    recap.innerHTML = (room.prompts || []).filter(pr => pr.text && pr.text.trim().length > 0).map(pr => {
      const author = room.players.find(p => p.id === pr.authorId);
      const about = room.players.find(p => p.id === pr.aboutId);
      return `<div class="recap-card">
        <div class="recap-about">About ${about?.avatar || ''} ${esc(about?.name || '?')}</div>
        <div class="recap-text">"${esc(pr.text || '...')}"</div>
        <div class="recap-author">Written by ${author?.avatar || ''} ${esc(author?.name || '?')}</div>
      </div>`;
    }).join('');

    // AI Writing Personality Analysis
    Game._loadAIPersonalityAnalysis(room);

    // Save stats
    const uid = Auth.getCurrentUser()?.uid;
    const me = sorted.find(p => p.id === S.myId);
    if (uid && me) {
      const correct = Object.values(room.roundGuesses || {}).filter(g => g?.correct).length;
      await DB.incrementUserStats(uid, { points: me.score || 0, correct, games: 1 });
      await DB.saveGameResult(uid, {
        roomName: room.name,
        roomCode: room.code,
        points: me.score || 0,
        rank: myRank,
        playerCount: room.players.length,
        correctGuesses: correct,
      });
    }
  },

  async _loadAIPersonalityAnalysis(room) {
    const container = document.getElementById('ai-analysis-section');
    if (!container) return;
    container.style.display = 'block';
    container.innerHTML = '<div class="ai-loading-msg">🔮 Oracle is analyzing everyone\'s writing style...</div>';

    try {
      const playerTexts = room.playerTexts || {};
      const players = room.players.map(p => ({
        name: p.name,
        texts: playerTexts[p.id] || [],
      })).filter(p => p.texts.length > 0);

      if (players.length === 0) {
        container.style.display = 'none';
        return;
      }

      const result = await AIEngine.analyzePlayerStyles(players);
      const analyses = result.players || [];

      container.innerHTML = `
        <div class="section-title-small">Writing style analysis</div>
        <div class="personality-grid">
          ${analyses.map(a => `
            <div class="personality-card">
              <div class="personality-badge">${a.badge || '👀'}</div>
              <div class="personality-name">${esc(a.name)}</div>
              <div class="personality-roast">${esc(a.roast)}</div>
            </div>
          `).join('')}
        </div>`;

      window.Audio?.aiReveal();
    } catch {
      container.style.display = 'none';
    }
  },

  // ── PLAY AGAIN / HOME ────────────────────────────────────────────────────

  async playAgain() {
    if (S.isHost) {
      const currentRoom = await DB.getRoom(S.roomCode);
      const resetPlayers = (currentRoom?.players || []).map(p => ({ ...p, score: 0, streak: 0 }));
      await DB.updateRoom(S.roomCode, {
        phase: 'lobby',
        prompts: [], promptsDone: [], currentRound: 0,
        guessesDone: [], roundGuesses: {}, roundHistory: [],
        reactions: {}, playerTexts: {}, aiHints: {},
        players: resetPlayers,
      });
      S.myTexts = [];
      S.streak = 0;
      S.powerups = [];
      S.activePowerup = null;
      Game._enterLobby();
    } else {
      window.UI?.toast('Waiting for the host to restart...', 'good');
    }
  },

  goHome() {
    Game._stopTimer();
    Game._stopListening();
    Object.assign(S, {
      myId: null, myName: '', roomCode: '', roomName: '',
      isHost: false, rounds: 3, timerSec: 20,
      timerInterval: null, guessLocked: false, lastRound: -1,
      unsubRoom: null, myTexts: [], activePowerup: null,
      powerups: [], streak: 0, aiHintUsed: false,
    });
    window.UI?.showScreen('screen-home');
  },

  // ── EFFECTS ───────────────────────────────────────────────────────────────

  _spawnConfetti(area) {
    const colors = ['#ffe44d','#4dffa0','#4da6ff','#b44dff','#ff4d6a','#ff8c4d'];
    for (let i = 0; i < 20; i++) {
      const d = document.createElement('div');
      d.className = 'confetti-dot';
      d.style.cssText = `left:${10 + Math.random() * 80}%;top:0;background:${colors[i % colors.length]};animation-delay:${Math.random() * .4}s;`;
      area.appendChild(d);
      setTimeout(() => d.remove(), 1600);
    }
  },
};

window.Game = Game;
