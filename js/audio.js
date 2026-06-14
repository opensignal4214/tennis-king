import { G } from './state.js';

let AC = null, unlocked = false, keepAlive = null;

export function ac() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {} }
  if (!AC) return AC;
  if (AC.state !== 'running') AC.resume();
  if (!unlocked) {
    try {
      const buf = AC.createBuffer(1, 1, AC.sampleRate);
      const src = AC.createBufferSource();
      src.buffer = buf; src.connect(AC.destination); src.start(0);
      unlocked = true;
    } catch(e) {}
    startKeepAlive();
    loadSounds();
  }
  return AC;
}

function startKeepAlive() {
  if (keepAlive || !AC) return;
  try {
    const buf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
    const src = AC.createBufferSource();
    src.buffer = buf; src.loop = true;
    const g = AC.createGain(); g.gain.value = 0;
    src.connect(g).connect(AC.destination); src.start(0);
    keepAlive = src;
  } catch(e) {}
}

// ---------------------------------------------------------------------------
// WAV preloading
// ---------------------------------------------------------------------------

const SOUND_FILES = {
  bounce:            'sounds/bounce.wav',
  crowd_cheering:    'sounds/crowd_cheering.wav',
  net:               'sounds/ball_hitting_net.wav',
  opponent_side_hit: 'sounds/opponent_side_hit.wav',
  player_side_hit:   'sounds/player_side_hit.wav',
  ref_fault:         'sounds/ref_shouting_fault.wav',
  ref_out:           'sounds/ref_shouting_out.wav',
  serving:           'sounds/serving.wav',
};

const buffers = {};
let loadStarted = false;

function loadSounds() {
  if (loadStarted || !AC) return;
  loadStarted = true;
  for (const [key, path] of Object.entries(SOUND_FILES)) {
    fetch(path)
      .then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(ab => AC.decodeAudioData(ab))
      .then(decoded => { buffers[key] = decoded; })
      .catch(() => {}); // silently fall back to synthesis
  }
}

function playBuffer(key, gainVal = 1.0) {
  if (!buffers[key] || !ac()) return false;
  const src = AC.createBufferSource();
  src.buffer = buffers[key];
  const g = AC.createGain();
  g.gain.value = gainVal;
  src.connect(g).connect(AC.destination);
  src.start(0);
  src.onended = () => { try { src.disconnect(); g.disconnect(); } catch(e) {} };
  return true;
}

// ---------------------------------------------------------------------------
// Synthesis fallbacks (used when WAV files haven't loaded yet)
// ---------------------------------------------------------------------------

export function tone(freq, dur, type, gain, slide) {
  if (G.mute || !ac()) return;
  const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
  o.type = type || 'square'; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  g.gain.setValueAtTime(gain || 0.05, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(AC.destination); o.start(t); o.stop(t + dur + 0.02);
  o.onended = () => { try { o.disconnect(); g.disconnect(); } catch(e) {} };
}

export function noiseBurst(dur, freq, gain, type, q) {
  if (G.mute || !ac()) return;
  const t = AC.currentTime, len = Math.max(1, Math.floor(AC.sampleRate * dur));
  const buf = AC.createBuffer(1, len, AC.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = AC.createBufferSource(); src.buffer = buf;
  const f = AC.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1.1;
  const g2 = AC.createGain(); g2.gain.setValueAtTime(gain, t);
  src.connect(f); f.connect(g2); g2.connect(AC.destination); src.start(t);
  src.onended = () => { try { src.disconnect(); f.disconnect(); g2.disconnect(); } catch(e) {} };
}

// ---------------------------------------------------------------------------
// Public sound API
// ---------------------------------------------------------------------------

// opts.hitter: 0 = human team (player/partner), 1 = CPU team (npc/npc2)
// opts.isServe: true when called from the serve state machine
export const sHit = (shotType, speed = 20, opts = {}) => {
  if (G.mute) return;
  const { hitter = null, isServe = false } = opts;
  const gain = 0.65 + speed * 0.003;
  if (isServe) {
    if (playBuffer('serving', gain)) return;
  } else if (hitter === 0) {
    if (playBuffer('player_side_hit', gain)) return;
  } else if (hitter !== null) {
    if (playBuffer('opponent_side_hit', gain)) return;
  }
  // synthesis fallback
  noiseBurst(0.045, 420 + speed * 7, 0.5, 'bandpass', 0.7);
  tone(230 + speed * 1.5, 0.07, 'sine', 0.08, 95);
};

export const sBounce = () => {
  if (G.mute) return;
  if (!playBuffer('bounce', 0.65)) {
    noiseBurst(0.03, 350, 0.18, 'lowpass', 0.8);
    tone(110, 0.05, 'sine', 0.045, 70);
  }
};

export const sNet = () => {
  if (G.mute) return;
  if (!playBuffer('net', 0.7)) {
    noiseBurst(0.1, 240, 0.25, 'lowpass', 0.7);
    tone(75, 0.13, 'sine', 0.05, 45);
  }
};

export const sPoint  = w => {
  if (G.mute) return;
  const buf = buffers['crowd_cheering'];
  if (!buf || !ac()) {
    tone(w === 0 ? 520 : 230, 0.22, 'triangle', 0.05, w === 0 ? 780 : 150);
    return;
  }
  // w===0: player wins point (full crowd), w===1: opponent wins (quieter crowd)
  const gain = w === 0 ? 0.65 : 0.28;
  const src = AC.createBufferSource();
  src.buffer = buf;
  const g = AC.createGain();
  const dur = buf.duration;
  const fadeAt = Math.max(0, dur - 0.18);
  g.gain.setValueAtTime(gain, AC.currentTime);
  g.gain.setValueAtTime(gain, AC.currentTime + fadeAt);
  g.gain.linearRampToValueAtTime(0, AC.currentTime + dur);
  src.connect(g).connect(AC.destination);
  src.start(0);
  src.onended = () => { try { src.disconnect(); g.disconnect(); } catch(e) {} };
};

export const crowdDuration = () => buffers['crowd_cheering']?.duration ?? 2.1;

export const sFault = () => {
  if (G.mute) return;
  if (!playBuffer('ref_fault', 0.55)) {
    tone(200, 0.16, 'sawtooth', 0.035, 120);
  }
};

export const sOut = () => {
  if (G.mute) return;
  playBuffer('ref_out', 0.7);
};

['pointerdown', 'touchend', 'click', 'keydown'].forEach(ev =>
  window.addEventListener(ev, () => ac(), { passive: true }));
window.addEventListener('visibilitychange', () => { if (AC && AC.state !== 'running') AC.resume(); });
