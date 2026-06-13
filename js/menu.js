import { G } from './state.js';
import { ac } from './audio.js';
import { refreshHUD } from './hud.js';
import { startGame, closeMenu } from './match.js';

document.querySelectorAll('#diffRow .pill').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('#diffRow .pill').forEach(x => x.classList.remove('sel'));
    b.classList.add('sel');
    G.diffKey = b.dataset.d;
    refreshHUD();
  });
});

document.getElementById('matchBtn').addEventListener('click', () => { ac(); startGame('match'); });
document.getElementById('rallyBtn').addEventListener('click', () => { ac(); startGame('rally'); });
document.getElementById('resumeBtn').addEventListener('click', () => { closeMenu(); });
