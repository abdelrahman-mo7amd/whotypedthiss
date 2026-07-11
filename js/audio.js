const AudioCtx = window.AudioContext || window.webkitAudioContext;
let ctx = null;
let muted = false;

function getCtx() {
  if (!ctx) ctx = new AudioCtx();
  return ctx;
}

function playTone(freq, dur, type = 'sine', vol = 0.2, detune = 0) {
  if (muted) return;
  try {
    const c = getCtx();
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    osc.connect(g);
    g.connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + dur);
  } catch (err) {}
}

function chord(freqs, dur, type, vol) {
  freqs.forEach((f, i) => setTimeout(() => playTone(f, dur, type, vol), i * 0));
}

export const Audio = {
  toggle() { muted = !muted; return muted; },
  isMuted() { return muted; },

  click() { playTone(600, .08, 'square', .10); },

  join() {
    playTone(880, .15, 'sine', .15);
    setTimeout(() => playTone(1100, .2, 'sine', .12), 100);
    setTimeout(() => playTone(1320, .25, 'sine', .10), 200);
  },

  submit() {
    playTone(440, .10, 'sine', .15);
    setTimeout(() => playTone(660, .2, 'sine', .12), 100);
  },

  correct() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => setTimeout(() => playTone(f, .18, 'triangle', .22), i * 70));
  },

  wrong() {
    playTone(200, .30, 'sawtooth', .15);
    setTimeout(() => playTone(150, .3, 'sawtooth', .10), 150);
  },

  timerTick() { playTone(800, .05, 'square', .06); },

  timerAlarm() {
    [400, 300].forEach((f, i) => setTimeout(() => playTone(f, .12, 'square', .22), i * 120));
  },

  reveal() {
    playTone(300, .08, 'sine', .10);
    setTimeout(() => playTone(600, .15, 'sine', .15), 80);
  },

  start() {
    [261, 329, 392, 523].forEach((f, i) => setTimeout(() => playTone(f, .2, 'triangle', .18), i * 100));
  },

  winner() {
    [523, 523, 523, 523, 415, 523, 659].forEach((f, i) => setTimeout(() => playTone(f, .2, 'triangle', .18), i * 120));
  },

  notif() {
    playTone(1000, .06, 'sine', .12);
    setTimeout(() => playTone(1200, .1, 'sine', .10), 80);
  },

  powerup() {
    [392, 523, 659, 784].forEach((f, i) => setTimeout(() => playTone(f, .12, 'triangle', .18), i * 60));
  },

  sabotage() {
    playTone(220, .08, 'sawtooth', .20);
    setTimeout(() => playTone(180, .15, 'sawtooth', .18), 80);
    setTimeout(() => playTone(140, .25, 'square', .15), 200);
  },

  streak() {
    [784, 1047, 1319].forEach((f, i) => setTimeout(() => playTone(f, .15, 'sine', .20), i * 80));
  },

  aiReveal() {
    // Futuristic scanning sound
    for (let i = 0; i < 6; i++) {
      setTimeout(() => playTone(200 + i * 80, .08, 'square', .08), i * 60);
    }
    setTimeout(() => playTone(880, .3, 'sine', .18), 400);
  },

  countdown() {
    playTone(440, .12, 'square', .12);
  },
};

window.Audio = Audio;
