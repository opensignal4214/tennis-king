// Body facing for the side-on groundstroke stance.
//
// Groundstrokes rotate the avatar's torso about the vertical axis so the chest turns
// toward the sideline (¾ turn). The angle coils to full at take-back/contact and unwinds
// through the follow-through. Serves, smashes, volleys and idle stay front-facing (0).

export const FACE_MAX = 0.70;     // peak turn in radians (~40°, a ¾ turn)
export const STANCE_HALF = 0.16;  // half the resting foot spread (world m)
export const FOOT_STEP = 0.14;    // max forward step of the front foot (world m)

const CONTACT_HOLD = 0.10; // seconds the turn stays fully coiled (take-back + contact)
const UNWIND = 0.55;       // seconds to unwind from full back to square

// Returns the facing angle in radians. Sign follows the hitting side and the player
// (the NPC mirrors the human); magnitude follows the swing phase.
export function facingAngle(anim, isHuman) {
  if (!anim || anim.type !== 'ground') return 0;
  const side = Math.sign(anim.side || 0);
  if (side === 0) return 0;
  const phase = anim.charging ? 0 : anim.t;
  const mag = phase < CONTACT_HOLD ? 1 : Math.max(0, 1 - (phase - CONTACT_HOLD) / UNWIND);
  return side * (isHuman ? 1 : -1) * mag * FACE_MAX;
}

// Where a body point `lat` metres to the side of the spine lands once the torso is rotated
// by `face` about the vertical axis. At face=0 the offset is purely lateral (dx); as the
// turn grows it rotates into depth (dz), separating the shoulders front-to-back.
export function lateralOffset(lat, face) {
  return { dx: lat * Math.cos(face), dz: lat * Math.sin(face) };
}

// Every avatar joint in WORLD space for a given facing, so the whole body turns as one rig
// and drawChar never positions parts with drifting independent formulas. `e` supplies the
// entity centre {x, z}; heights are fixed body proportions; `fwd` is the net direction in z.
// Legs are meant to attach at hipBL/hipBR (the lower hips) so they stay joined to the shorts.
export function bodyAnchors(e, face, fwd) {
  const at = (lat, y) => { const o = lateralOffset(lat, face); return { x: e.x + o.dx, y, z: e.z + o.dz }; };
  const st = stanceFeet(face, fwd);
  return {
    shoulderL: at(-0.20, 1.45), shoulderR: at(0.20, 1.45),
    hipL:  at(-0.13, 0.97), hipR:  at(0.13, 0.97),
    hipBL: at(-0.11, 0.78), hipBR: at(0.11, 0.78),
    footA: { x: e.x + st.fa.dx, y: 0, z: e.z + st.fa.dz },
    footB: { x: e.x + st.fb.dx, y: 0, z: e.z + st.fb.dz },
    frontIsA: st.frontIsA,
  };
}

// Resting-stance foot offsets from the entity centre. Feet straddle STANCE_HALF either side
// along the facing axis; the net-side (front) foot steps toward the net by up to FOOT_STEP,
// scaled by how far the body has turned. `fwd` is the net direction in z (-1 human, +1 NPC).
export function stanceFeet(face, fwd) {
  const fa = lateralOffset(-STANCE_HALF, face);
  const fb = lateralOffset(STANCE_HALF, face);
  const step = FOOT_STEP * Math.min(1, Math.abs(face) / FACE_MAX);
  // the foot already nearer the net (its dz shares fwd's sign) is the one that steps in
  const frontIsA = fa.dz * fwd > 0;
  if (frontIsA) fa.dz += fwd * step; else fb.dz += fwd * step;
  return { fa, fb, frontIsA };
}
