import { G } from './state.js';
import { ac } from './audio.js';
import { refreshHUD } from './hud.js';
import { startGame, closeMenu } from './match.js';
import { COLOR_KEYS, COLORS } from './constants.js';

const SCREENS = ['matchtype', 'colorpick', 'cointoss'];

function showScreen(id) {
  SCREENS.forEach(s => document.getElementById(s).style.display = 'none');
  if (id) document.getElementById(id).style.display = 'flex';
}

export function hideAllScreens() {
  SCREENS.forEach(s => document.getElementById(s).style.display = 'none');
}

function makePartner() {
  return {
    x: 2.0, z: 12.6, vx: 0, vz: 0,
    anim: null, cool: 0, swingCd: 0, recover: 0,
    pending: null, charge: null,
    antSide: 1, spd: 0, stride: 0, backT: 0,
    plan: null, tgt: { x: 2.0, z: 2.5 },
    netMode: true, netX: 2.0, recoverX: 2.0, lvx: 0,
  };
}

function makeNpc2() {
  return {
    x: 2.0, z: -12.3, vx: 0, vz: 0,
    anim: null, cool: 0, reactT: 0,
    plan: null, tgt: { x: 2.0, z: -2.5 },
    netMode: true, netX: 2.0, recoverX: 2.0,
    antSide: -1, spd: 0, lvx: 0, stride: 0,
  };
}

// Difficulty pills
document.querySelectorAll('#diffRow .pill').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('#diffRow .pill').forEach(x => x.classList.remove('sel'));
    b.classList.add('sel');
    G.diffKey = b.dataset.d;
    refreshHUD();
  });
});

// Main menu buttons
document.getElementById('matchBtn').addEventListener('click', () => { ac(); showScreen('matchtype'); });
document.getElementById('rallyBtn').addEventListener('click', () => {
  ac();
  G.matchType = 'singles';
  G.partner = null; G.npc2 = null;
  startGame('rally');
});
document.getElementById('resumeBtn').addEventListener('click', () => { closeMenu(); });

// Match type selection
document.getElementById('btn1v1').addEventListener('click', () => {
  ac();
  G.matchType = 'singles';
  G.partner = null; G.npc2 = null;
  showScreen(null);
  startGame('match');
});

document.getElementById('btn2v2').addEventListener('click', () => {
  ac();
  buildColorSwatches();
  showScreen('colorpick');
});

// Color picker
function buildColorSwatches() {
  const container = document.getElementById('colorswatches');
  container.innerHTML = '';
  COLOR_KEYS.forEach(key => {
    const btn = document.createElement('button');
    btn.className = 'colorswatch';
    btn.style.background = COLORS[key].shirt;
    btn.dataset.color = key;
    btn.title = key.charAt(0).toUpperCase() + key.slice(1);
    btn.addEventListener('click', () => {
      document.querySelectorAll('.colorswatch').forEach(s => s.classList.remove('sel'));
      btn.classList.add('sel');
      onColorPicked(key);
    });
    container.appendChild(btn);
  });
}

function onColorPicked(chosen) {
  G.playerColor = chosen;
  const remaining = COLOR_KEYS.filter(k => k !== chosen);
  // Shuffle remaining with Fisher-Yates
  for (let i = remaining.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
  }
  G.partnerColor = remaining[0];
  G.npcColors = [remaining[1], remaining[2]];
  // Brief pause so swatch selection is visible before transitioning
  setTimeout(() => {
    resetCoinTossUI();
    showScreen('cointoss');
  }, 280);
}

// Coin toss
function resetCoinTossUI() {
  document.getElementById('btnheads').disabled = false;
  document.getElementById('btntails').disabled = false;
  document.getElementById('ctresult').style.display = 'none';
  document.getElementById('ctresult').textContent = '';
  document.getElementById('ctwinner').style.display = 'none';
}

document.getElementById('btnheads').addEventListener('click', () => { ac(); runCoinToss('heads'); });
document.getElementById('btntails').addEventListener('click', () => { ac(); runCoinToss('tails'); });

function runCoinToss(pick) {
  document.getElementById('btnheads').disabled = true;
  document.getElementById('btntails').disabled = true;

  const flip = Math.random() < 0.5 ? 'heads' : 'tails';
  const won = flip === pick;

  const resultEl = document.getElementById('ctresult');
  resultEl.style.display = 'block';

  if (won) {
    resultEl.textContent = `It's ${flip.toUpperCase()}! You win the toss!`;
    resultEl.style.color = '#2dd9c0';
    setTimeout(() => { document.getElementById('ctwinner').style.display = 'block'; }, 900);
  } else {
    resultEl.textContent = `It's ${flip.toUpperCase()}! CPU wins the toss — they choose to serve.`;
    resultEl.style.color = '#ff6b57';
    setTimeout(() => startDoublesGame(false), 1900);
  }
}

document.getElementById('btnserve').addEventListener('click', () => { ac(); startDoublesGame(true); });
document.getElementById('btnreceive').addEventListener('click', () => { ac(); startDoublesGame(false); });

function startDoublesGame(humanServesFirst) {
  G.matchType = 'doubles';
  G.serveOrder = humanServesFirst ? [0, 2, 1, 3] : [2, 0, 3, 1];
  G.serveOrderIdx = 0;
  G.receiveHuman = 0;
  G.receiveCpu = 0;
  G.partner = makePartner();
  G.npc2 = makeNpc2();
  showScreen(null);
  startGame('match');
}
