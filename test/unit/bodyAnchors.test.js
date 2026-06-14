import { describe, it, expect } from 'vitest';
import { bodyAnchors, lateralOffset } from '../../js/facing.js';

// bodyAnchors(e, face, fwd) returns every avatar joint in WORLD space for a given facing,
// composed from the same rotation the torso uses. This is the contract drawChar must render
// from, so the upper and lower body can never drift onto different facings (the bug where the
// torso turned but the legs stayed planted front-on).

const E = { x: 2, z: 4 };

describe('bodyAnchors — square stance (face = 0) has no regression', () => {
  it('places shoulders/hips at the front-facing widths with no depth', () => {
    const A = bodyAnchors(E, 0, -1);
    expect(A.shoulderL.x).toBeCloseTo(E.x - 0.20);
    expect(A.shoulderR.x).toBeCloseTo(E.x + 0.20);
    expect(A.hipL.x).toBeCloseTo(E.x - 0.13);
    expect(A.hipR.x).toBeCloseTo(E.x + 0.13);
    for (const p of [A.shoulderL, A.shoulderR, A.hipL, A.hipR, A.hipBL, A.hipBR]) {
      expect(p.z).toBeCloseTo(E.z); // square to camera -> no front/back separation
    }
  });
});

describe('bodyAnchors — the WHOLE body turns together (the missed bug)', () => {
  it('shoulders, hips AND lower-hips all separate to the same side in depth when turned', () => {
    const A = bodyAnchors(E, 0.7, -1);
    const right = [A.shoulderR, A.hipR, A.hipBR].map(p => p.z - E.z);
    const left  = [A.shoulderL, A.hipL, A.hipBL].map(p => p.z - E.z);
    // every right-side joint is pushed into depth (none stuck at the front-facing z=0)
    for (const d of right) {
      expect(Math.abs(d)).toBeGreaterThan(0.01);
      expect(Math.sign(d)).toBe(Math.sign(right[0]));
    }
    // and the left side is mirrored to the opposite depth
    for (const d of left) expect(Math.sign(d)).toBe(-Math.sign(right[0]));
  });

  it('legs attach at the (rotated) lower-hips, which move with the turn — not a fixed point', () => {
    const square = bodyAnchors(E, 0, -1);
    const turned = bodyAnchors(E, 0.7, -1);
    // the lower-hip x narrows toward centre as the body turns (legs rotate with the body)
    expect(turned.hipBL.x).toBeGreaterThan(square.hipBL.x); // -0.16 -> less negative
    expect(turned.hipBR.x).toBeLessThan(square.hipBR.x);
    expect(turned.hipBL.x).not.toBeCloseTo(square.hipBL.x);
  });

  it('the torso narrows in world-x as the body turns side-on', () => {
    const wide = bodyAnchors(E, 0, -1);
    const slim = bodyAnchors(E, 0.7, -1);
    const span = A => Math.abs(A.shoulderR.x - A.shoulderL.x);
    expect(span(slim)).toBeLessThan(span(wide));
  });
});

describe('bodyAnchors — feet come from the tested stance', () => {
  it('feet match stanceFeet offsets and report the front foot', () => {
    const A = bodyAnchors(E, 0.7, -1);
    expect(A.footA.x).toBeCloseTo(E.x + lateralOffset(-0.16, 0.7).dx);
    expect(typeof A.frontIsA).toBe('boolean');
    expect(A.footA.y).toBe(0);
  });
  it('feet sit on the ground plane (y = 0)', () => {
    const A = bodyAnchors(E, 0.4, 1);
    expect(A.footA.y).toBe(0);
    expect(A.footB.y).toBe(0);
  });
});
