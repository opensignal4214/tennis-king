import { G } from './state.js';

let AC = null, unlocked = false, keepAlive = null;

export function ac() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {} }
  if (!AC) return AC;
  if (AC.state !== 'running') AC.resume(); // covers Safari 'suspended' AND 'interrupted'
  // Safari/iOS only unlock audio output when a node is *started* inside a user
  // gesture; resume() alone is not enough. Fire a 1-sample silent buffer the
  // first time we're called (always from a keydown/click handler).
  if (!unlocked) {
    try {
      const buf = AC.createBuffer(1, 1, AC.sampleRate); // match context rate — Safari is picky
      const src = AC.createBufferSource();
      src.buffer = buf; src.connect(AC.destination); src.start(0);
      unlocked = true;
    } catch(e) {}
    startKeepAlive();
  }
  return AC;
}

// A continuously looping silent source keeps Safari's audio output session alive.
// Without it, Safari drops the page's WebAudio output after a stretch of quiet
// and later sounds go silent until the browser is relaunched.
function startKeepAlive() {
  if (keepAlive || !AC) return;
  try {
    const buf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate); // 1s of zeros
    const src = AC.createBufferSource();
    src.buffer = buf; src.loop = true;
    const g = AC.createGain(); g.gain.value = 0;
    src.connect(g).connect(AC.destination); src.start(0);
    keepAlive = src;
  } catch(e) {}
}

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

export const sHit    = p => { noiseBurst(0.045, 420 + p * 7, 0.5, 'bandpass', 0.7); tone(230 + p * 1.5, 0.07, 'sine', 0.08, 95); };
export const sBounce = ()  => { noiseBurst(0.03, 350, 0.18, 'lowpass', 0.8); tone(110, 0.05, 'sine', 0.045, 70); };
export const sNet    = ()  => { noiseBurst(0.1, 240, 0.25, 'lowpass', 0.7); tone(75, 0.13, 'sine', 0.05, 45); };
export const sPoint  = w  => tone(w === 0 ? 520 : 230, 0.22, 'triangle', 0.05, w === 0 ? 780 : 150);
export const sFault  = ()  => tone(200, 0.16, 'sawtooth', 0.035, 120);

// Unlock/resume on any first gesture (Safari may not honor every gesture type),
// and resume when returning to the tab (Safari interrupts backgrounded contexts).
['pointerdown', 'touchend', 'click', 'keydown'].forEach(ev =>
  window.addEventListener(ev, () => ac(), { passive: true }));
window.addEventListener('visibilitychange', () => { if (AC && AC.state !== 'running') AC.resume(); });
