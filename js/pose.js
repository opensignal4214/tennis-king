// Pure resolution of the avatar's arm/torso paint order (back-to-front), kept out of the canvas
// code so it can be unit-tested — every avatar regression so far has been a layering mistake.
//
// The renderer uses the painter's algorithm (no z-buffer): anything drawn BEFORE 'body' is occluded
// by the torso, anything AFTER it is visible on top. An arm that crosses in front of the chest sits
// on the side the avatar faces: hidden for near-side avatars (player/partner, who face away from the
// camera) and visible for far-side ones (NPCs, who face the camera).
//
// Tokens (each maps to one draw call in render.js drawChar):
//   'body'     torso + head
//   'domArm'   dominant arm: dominant shoulder -> grip (dominant elbow)
//   'offArm'   off arm as 2nd hand on the grip: off shoulder -> grip (off elbow)
//   'offBal'   off arm as a free balance arm (drawOffArm); no-op when there is no balance arm
//   'bothArms' both shoulders -> grip (generic two-handed idle/ready stance)
//   'grip'     hands at the grip point
//   'racket'   racket from the grip outward
//
// `kind`: 'bhTwo' | 'bhOne' | 'fhOne' | 'generic'
// Crossing test: the dominant arm crosses the chest when the grip is on the side opposite the
// dominant shoulder, i.e. handLat * dom < 0. Front/back depth for the non-crossing single-grip
// cases uses the z sign already used by render (handZ/offZ > 0 == camera side == visible).
export function armDrawOrder({ kind, isHuman, dom, handLat, handZ, offZ, two }) {
  if (kind === 'bhTwo') {
    const domCrosses = handLat * dom < 0;
    const cross = domCrosses ? 'domArm' : 'offArm';
    const side  = domCrosses ? 'offArm' : 'domArm';
    return isHuman
      ? [cross, 'body', side, 'grip', 'racket']   // near side: crossing arm hidden
      : [side, 'body', cross, 'grip', 'racket'];  // far side: crossing arm visible
  }
  if (kind === 'bhOne') {
    return isHuman
      ? ['domArm', 'grip', 'racket', 'body', 'offBal']
      : ['offBal', 'body', 'domArm', 'grip', 'racket'];
  }
  const domCam = handZ > 0;
  const offCam = offZ != null && offZ > 0;
  const lead = (kind === 'generic' && two) ? 'bothArms' : 'domArm';
  if (domCam && offCam)  return ['body', lead, 'grip', 'racket', 'offBal'];
  if (domCam && !offCam) return ['offBal', 'body', lead, 'grip', 'racket'];
  if (!domCam && offCam) return [lead, 'grip', 'racket', 'body', 'offBal'];
  return [lead, 'grip', 'racket', 'offBal', 'body'];
}
