import { G } from './state.js';
import { updateCamera } from './camera.js';
import { tickHud, refreshHUD } from './hud.js';
import { simToPlane } from './physics.js';
import { updateBall } from './ball.js';
import { updateToss } from './serve.js';
import { updatePlayer } from './player.js';
import { updateNPC } from './npc.js';
import { render } from './render.js';
import { logTick, logFrame } from './logger.js';
import './menu.js';
import './input.js';

function update(dt) {
  updateCamera(dt);
  if (G.state === 'menu' || G.paused) return;
  logTick(dt);

  tickHud(dt);
  updateToss(dt);

  if (G.state === 'point') {
    G.pointT -= dt;
    if (G.pointT <= 0) { const f = G.next; G.next = null; if (f) f(); }
  }

  updatePlayer(dt);
  updateNPC(dt);
  updateBall(dt);

  if (G.state === 'live' && G.ball.lastHitter === 1) {
    G.strike = simToPlane(G.player.z - 0.35);
  } else G.strike = null;

  if (G.strike) {
    const dxa = G.strike.x - G.player.x;
    if (!G.player.antSide) G.player.antSide = dxa >= 0 ? 1 : -1;
    else if (G.player.antSide === 1 && dxa < -0.35) G.player.antSide = -1;
    else if (G.player.antSide === -1 && dxa > 0.35) G.player.antSide = 1;
  } else G.player.antSide = 0;

  if (G.state === 'live') logFrame();
}

let last = performance.now();
function frame(now) {
  let dt = (now - last) / 1000; last = now;
  dt = Math.min(dt, 0.034);
  update(dt);
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
refreshHUD();
