export const W=960, H=600, CX=480, CY=212, FOC=560;
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
export const SERVE_TYPE={
  flat: {m:1.05, clr:0.05, spin:0,  curve:0,    label:'Flat Serve',     tol:0.5,  fault:{perfect:0, good:0.20, ok:0.55, weak:0.85}},
  kick: {m:0.75, clr:0.50, spin:1,  curve:-0.6, label:'Top Spin Serve', tol:1.15, fault:{perfect:0, good:0.00, ok:0.08, weak:0.25}},
  slice:{m:0.85, clr:0.18, spin:-1, curve:1.6,  label:'Slice Serve',    tol:1.0,  fault:{perfect:0, good:0.05, ok:0.20, weak:0.45}},
};
