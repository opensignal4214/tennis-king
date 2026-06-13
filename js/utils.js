import { NETX } from './constants.js';

export const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
export const lerp  = (a, b, t) => a + (b - a) * t;
export const rnd   = (a, b) => a + Math.random() * (b - a);
export const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 0.667;
export const netHeight = x => 0.92 + 0.16 * Math.min(1, Math.abs(x) / NETX);
export const name  = i => i === 0 ? 'You' : 'CPU';
export const tossY = t => 1.35 + 5.6 * t - 4.905 * t * t;

// Returns a penalty multiplier > 1.0 when contact is away from the sweet spot.
// contactOffsetX = ball.x - hitter.x (signed).
// isForehand: player forehand = ball on their right = contactOffsetX >= 0.
//             NPC forehand    = ball on their right = contactOffsetX <= 0 (NPC faces +z).
// isNpc flips the ideal offset sign to match each entity's facing direction.
export const SWEET_X = 0.45;
export function bodyContactPenalty(contactOffsetX, isForehand, isNpc) {
  const handSign = isNpc ? -1 : 1;
  const idealX = (isForehand ? 1 : -1) * handSign * SWEET_X;
  const bodyErr = Math.abs(contactOffsetX - idealX);
  return 1 + Math.max(0, bodyErr - 0.25) * 0.7;
}
