import { CX, CY, FOC } from './constants.js';
import { G } from './state.js';
import { lerp } from './utils.js';

let FV = [0, -0.36, -0.93];
let UV = [0,  0.93, -0.36];

export function updateCamera(dt) {
  const back = Math.max(0, G.player.z - 11.5);
  const k = Math.min(1, dt * 3.2);
  G.cam.x = lerp(G.cam.x, G.player.x * 0.32, k);
  G.cam.y = lerp(G.cam.y, 8.6 + back * 0.30, k);
  G.cam.z = lerp(G.cam.z, 19.0 + back * 0.90, k);
  const fy = 0 - G.cam.y, fz = -3 - G.cam.z, l = Math.hypot(fy, fz);
  FV = [0, fy / l, fz / l]; UV = [0, -FV[2], FV[1]];
}

export function proj(x, y, z) {
  const dx = x - G.cam.x, dy = y - G.cam.y, dz = z - G.cam.z;
  const zv = dy * FV[1] + dz * FV[2];
  if (zv < 0.55) return null;
  const yv = dy * UV[1] + dz * UV[2];
  return { x: CX + dx / zv * FOC, y: CY - yv / zv * FOC, s: FOC / zv };
}
