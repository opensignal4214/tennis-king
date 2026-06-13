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
  hit:          'sounds/hit.wav',
  hit_flat:     'sounds/hit_flat.wav',
  hit_topspin:  'sounds/hit_topspin.wav',
  hit_slice:    'sounds/hit_slice.wav',
  hit_soft:     'sounds/hit_soft.wav',
  hit_smash:    'sounds/hit_smash.wav',
  bounce:       'sounds/bounce.wav',
  net:          'sounds/net.wav',
  point_win:    'sounds/point_win.wav',
  point_lose:   'sounds/point_lose.wav',
  fault:        'sounds/fault.wav',
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

// shotType: 'flat' | 'topspin' | 'slice' | 'soft' | 'smash' | null (generic)
export const sHit = (shotType, speed = 20) => {
  if (G.mute) return;
  const key = shotType ? `hit_${shotType}` : 'hit';
  const gain = 0.65 + speed * 0.003;
  if (!playBuffer(key, gain) && !playBuffer('hit', gain)) {
    noiseBurst(0.045, 420 + speed * 7, 0.5, 'bandpass', 0.7);
    tone(230 + speed * 1.5, 0.07, 'sine', 0.08, 95);
  }
};

export const sBounce = () => {
  if (G.mute) return;
  if (!playBuffer('bounce', 0.65)) {
    noiseBurst(0.03, 350, 0.18, 'lowpass', 0.8);
    tone(110, 0.05, 'sine', 0.045, 70);
  }
};

export const sNet    = () => {
  if (G.mute) return;
  if (!playBuffer('net', 0.7)) {
    noiseBurst(0.1, 240, 0.25, 'lowpass', 0.7);
    tone(75, 0.13, 'sine', 0.05, 45);
  }
};

export const sPoint  = w => {
  if (G.mute) return;
  const key = w === 0 ? 'point_win' : 'point_lose';
  if (!playBuffer(key, 0.6)) {
    tone(w === 0 ? 520 : 230, 0.22, 'triangle', 0.05, w === 0 ? 780 : 150);
  }
};

export const sFault  = () => {
  if (G.mute) return;
  if (!playBuffer('fault', 0.55)) {
    tone(200, 0.16, 'sawtooth', 0.035, 120);
  }
};

['pointerdown', 'touchend', 'click', 'keydown'].forEach(ev =>
  window.addEventListener(ev, () => ac(), { passive: true }));
window.addEventListener('visibilitychange', () => { if (AC && AC.state !== 'running') AC.resume(); });
