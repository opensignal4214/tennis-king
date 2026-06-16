export const H=600, CY=212, FOC=560;
// W and CX are derived from the window aspect ratio so the canvas fills the
// screen without distortion: the court is drawn via proj() (FOC/CX/CY only),
// so widening W just reveals more stadium on the sides — the court stays put.
export let W=960, CX=480;
export function setViewport() {
  const aspect = (typeof window !== 'undefined' && window.innerHeight)
    ? window.innerWidth / window.innerHeight : 16/10;
  W = Math.round(H * Math.min(2.6, Math.max(1.3, aspect)));
  CX = W / 2;
}
export const COLORS={
  teal:  {shirt:'#2dd9c0',shirtHi:'#54f0d8',shirtLo:'#179f8c',shorts:'#0e5f54',shortsHi:'#15826f',shortsLo:'#073d36'},
  coral: {shirt:'#ff6b57',shirtHi:'#ff8f7e',shirtLo:'#d44a38',shorts:'#7e2c20',shortsHi:'#a13d2e',shortsLo:'#561a12'},
  cobalt:{shirt:'#4a90e2',shirtHi:'#6fa9ef',shirtLo:'#2f6bb5',shorts:'#1a3a6b',shortsHi:'#295089',shortsLo:'#0e2447'},
  amber: {shirt:'#f5a623',shirtHi:'#ffc04f',shirtLo:'#cc8410',shorts:'#7a4e00',shortsHi:'#9c6610',shortsLo:'#523300'},
  violet:{shirt:'#9b59b6',shirtHi:'#b97bd2',shirtLo:'#743f8c',shorts:'#4a235a',shortsHi:'#623278',shortsLo:'#32163f'},
};
export const COLOR_KEYS=['teal','coral','cobalt','amber','violet'];
export const HL=11.885, SW=4.115, DW=5.485, SVC=6.4, NETX=5.2;
export const GRAV=9.81;
export const PT_NAME=['0','15','30','40'];
export const DIFF={
  easy:  {label:'Easy',   speed:4.0, react:0.42, err:0.20, whiff:0.05,  pace:18.5, srv:24,   srvNoise:0.75, open:0.0, appr:0.06, tossErr:0.07, retDepth:0.2, aimMix:{wide:0.05, wrongFoot:0.00, deepMiddle:0.10, chasePlayer:0.70, random:0.15}},
  medium:{label:'Medium', speed:5.2, react:0.24, err:0.11, whiff:0.015, pace:23.5, srv:30,   srvNoise:0.55, open:0.5, appr:0.40, tossErr:0.04, retDepth:0.7, aimMix:{wide:0.35, wrongFoot:0.10, deepMiddle:0.15, chasePlayer:0.20, random:0.20}},
  hard:  {label:'Hard',   speed:6.0, react:0.10, err:0.05, whiff:0.0,   pace:28.5, srv:35.5, srvNoise:0.40, open:1.0, appr:0.75, tossErr:0.02, retDepth:1.0, aimMix:{wide:0.45, wrongFoot:0.25, deepMiddle:0.15, chasePlayer:0.00, random:0.15}},
};
export const QUAL={
  perfect:{pow:1.06, noise:0.55, clr:1.0,  shank:0,    label:'Perfect!', col:'#3df0a8', rec:0.22},
  good:   {pow:1.00, noise:1.00, clr:1.0,  shank:0.03, label:'Good',     col:'#cde35a', rec:0.30},
  ok:     {pow:0.90, noise:2.00, clr:0.68, shank:0.12, label:'OK',       col:'#e8b34d', rec:0.40},
  weak:   {pow:0.74, noise:3.20, clr:0.34, shank:0.30, label:'Mistimed', col:'#e0734d', rec:0.52},
};
export const SRV_SPEED={perfect:34.5, good:31, ok:28, weak:23.5};
export const PRESS_LEAD=0.10;
export const TOSS_APEX=0.57;
export const CHARGE_FULL=0.5;
export const CHARGE_MIN_POW=0.62;
export const CHARGE_MAX_POW=1.30;
// Touch controls (js/touch.js). All distances are in logical canvas units (W×H).
export const TOUCH={
  DEAD:38,          // deadzone radius: below this a drag counts as "no flick"
  MOVE_R:78,        // visual joystick radius / clamp for the knob and serve-aim
  ZONE_SPLIT:0.5,   // fraction of W: left of this = move pad, right = swing pad
  TOP_GUARD:0.26,   // fraction of H kept clear at the top (score/menu) — taps above ignored
  DEFAULT_KEY:'KeyJ', // shot fired when the swing is released with no flick (topspin)
  // Wedge anchors for the swing dial: angle measured with up = +90° (atan2(-dy,dx)).
  WEDGE:[
    { key:'KeyI',      a:90  }, // lob   — up
    { key:'KeyJ',      a:135 }, // topspin — up-left
    { key:'KeyK',      a:180 }, // slice — left
    { key:'KeyL',      a:225 }, // flat  — down-left
    { key:'Semicolon', a:270 }, // drop  — down
  ],
};
export const SERVE_TYPE={
  flat: {m:1.05, clr:0.05, spin:0,  curve:0,    label:'Flat Serve',     tol:0.5,  fault:{perfect:0, good:0.20, ok:0.55, weak:0.85}},
  kick: {m:0.75, clr:0.50, spin:1,  curve:-0.6, label:'Top Spin Serve', tol:1.15, fault:{perfect:0, good:0.00, ok:0.00, weak:0.25}},
  slice:{m:0.85, clr:0.18, spin:-1, curve:1.6,  label:'Slice Serve',    tol:1.0,  fault:{perfect:0, good:0.00, ok:0.05, weak:0.45}},
};
