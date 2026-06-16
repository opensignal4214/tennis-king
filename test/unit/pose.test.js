import { describe, it, expect } from 'vitest';
import { armDrawOrder } from '../../js/pose.js';

// Spec for armDrawOrder — the avatar's back-to-front arm/torso paint order.
//
// The renderer paints with the painter's algorithm: a token BEFORE 'body' is occluded by the
// torso; a token AFTER 'body' is visible on top. So "hidden behind the torso" == appears before
// 'body' in the returned array, "visible" == appears after.
//
// An arm crosses in front of the chest when its shoulder and the grip are on opposite sides of the
// spine. The crossing arm is on the side the avatar faces: hidden for near-side avatars (isHuman,
// who face away from the camera) and visible for far-side ones (NPCs, who face the camera).
//
// The dominant arm crosses when the grip is on the side opposite the dominant shoulder:
// handLat * dom < 0. Otherwise the off arm crosses.

const idx = (arr, t) => arr.indexOf(t);
const before = (arr, a, b) => idx(arr, a) < idx(arr, b);

describe('armDrawOrder — two-handed backhand (bhTwo)', () => {
  // Human, grip on the OFF side (take-back / contact): dominant arm crosses → hidden.
  it('human take-back/contact: dominant arm hidden, off arm + racket visible', () => {
    const o = armDrawOrder({ kind: 'bhTwo', isHuman: true, dom: 1, handLat: -0.4 });
    expect(before(o, 'domArm', 'body')).toBe(true);   // crossing arm behind torso
    expect(before(o, 'body', 'offArm')).toBe(true);    // off arm in front (visible)
    expect(idx(o, 'racket')).toBe(o.length - 1);       // racket reads on top
  });

  // Human, grip wraps to the DOMINANT side (follow-through): off arm now crosses → hidden.
  // This is the regression guard for the "finish looks like a forehand" bug.
  it('human follow-through: off arm hidden, dominant arm visible', () => {
    const o = armDrawOrder({ kind: 'bhTwo', isHuman: true, dom: 1, handLat: 0.3 });
    expect(before(o, 'offArm', 'body')).toBe(true);    // crossing arm behind torso
    expect(before(o, 'body', 'domArm')).toBe(true);    // dominant arm in front (visible)
  });

  // NPC faces the camera → the crossing arm is visible (mirror of the human).
  it('NPC take-back/contact: crossing (dominant) arm visible', () => {
    const o = armDrawOrder({ kind: 'bhTwo', isHuman: false, dom: -1, handLat: 0.4 });
    // dom shoulder at sign(dom) = -1; grip at +0.4 → dominant arm crosses
    expect(before(o, 'body', 'domArm')).toBe(true);    // crossing arm in front (faces camera)
    expect(before(o, 'offArm', 'body')).toBe(true);    // non-crossing arm behind
  });

  it('invariant: crossing arm is hidden iff near-side, across dom signs and grip positions', () => {
    for (const dom of [1, -1]) {
      for (const isHuman of [true, false]) {
        for (const handLat of [-0.5, -0.2, 0.2, 0.5]) {
          const o = armDrawOrder({ kind: 'bhTwo', isHuman, dom, handLat });
          const domCrosses = handLat * dom < 0;
          const crossing = domCrosses ? 'domArm' : 'offArm';
          // near side hides the crossing arm; far side shows it
          expect(before(o, crossing, 'body')).toBe(isHuman);
          expect(o.filter(t => t === 'body').length).toBe(1);
        }
      }
    }
  });
});

describe('armDrawOrder — one-handed backhand volley (bhOne)', () => {
  it('human: dominant arm + racket hidden, balance arm visible', () => {
    const o = armDrawOrder({ kind: 'bhOne', isHuman: true, dom: 1, handLat: -0.4 });
    expect(o).toEqual(['domArm', 'grip', 'racket', 'body', 'offBal']);
  });

  it('NPC: balance arm hidden, dominant arm + racket visible', () => {
    const o = armDrawOrder({ kind: 'bhOne', isHuman: false, dom: -1, handLat: 0.4 });
    expect(o).toEqual(['offBal', 'body', 'domArm', 'grip', 'racket']);
  });
});

describe('armDrawOrder — forehand ground stroke (fhOne) [locks current behaviour]', () => {
  const fh = (handZ, offZ) => armDrawOrder({ kind: 'fhOne', isHuman: true, dom: 1, handLat: 0.4, handZ, offZ });

  it('both camera side: body first, then dom arm, racket, off balance', () => {
    expect(fh(0.3, 0.3)).toEqual(['body', 'domArm', 'grip', 'racket', 'offBal']);
  });
  it('dom camera / off net: off hidden, body, dom visible', () => {
    expect(fh(0.3, -0.3)).toEqual(['offBal', 'body', 'domArm', 'grip', 'racket']);
  });
  it('dom net / off camera: dom hidden, body, off visible', () => {
    expect(fh(-0.3, 0.3)).toEqual(['domArm', 'grip', 'racket', 'body', 'offBal']);
  });
  it('both net side: both arms before body', () => {
    expect(fh(-0.3, -0.3)).toEqual(['domArm', 'grip', 'racket', 'offBal', 'body']);
  });
});

describe('armDrawOrder — generic (serve / smash / volley / idle) [locks current behaviour]', () => {
  const gen = (two, handZ, offZ) => armDrawOrder({ kind: 'generic', isHuman: true, dom: 1, handLat: 0.1, handZ, offZ, two });

  it('single-grip leads with domArm', () => {
    expect(gen(false, 0.3, 0.3)).toEqual(['body', 'domArm', 'grip', 'racket', 'offBal']);
    expect(gen(false, -0.3, -0.3)).toEqual(['domArm', 'grip', 'racket', 'offBal', 'body']);
  });

  it('two-handed leads with bothArms', () => {
    expect(gen(true, 0.3, -0.3)).toEqual(['offBal', 'body', 'bothArms', 'grip', 'racket']);
    expect(gen(true, -0.3, 0.3)).toEqual(['bothArms', 'grip', 'racket', 'body', 'offBal']);
  });

  it('null offZ (no balance arm) is treated as net side; offBal token still placed (no-op in render)', () => {
    const o = gen(false, 0.3, null);
    expect(o).toContain('offBal');
    expect(o.filter(t => t === 'body').length).toBe(1);
  });
});

describe('armDrawOrder — cross-cutting invariants', () => {
  const samples = [
    { kind: 'bhTwo', isHuman: true, dom: 1, handLat: -0.4 },
    { kind: 'bhTwo', isHuman: true, dom: 1, handLat: 0.3 },
    { kind: 'bhOne', isHuman: false, dom: -1, handLat: 0.4 },
    { kind: 'fhOne', isHuman: true, dom: 1, handLat: 0.4, handZ: -0.3, offZ: 0.3 },
    { kind: 'generic', isHuman: true, dom: 1, handLat: 0.1, handZ: 0.3, offZ: -0.3, two: true },
  ];

  it('exactly one body, and the racket immediately follows the grip on the same layer', () => {
    for (const s of samples) {
      const o = armDrawOrder(s);
      expect(o.filter(t => t === 'body').length).toBe(1);
      // grip + racket are always adjacent and on the same side of the body (racket draws from the
      // grip), so they read as one unit whether that unit is hidden or visible
      expect(idx(o, 'racket') - idx(o, 'grip')).toBe(1);
    }
  });
});
