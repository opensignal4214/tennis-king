import { describe, it, expect } from 'vitest';
import { lateralOffset, stanceFeet, FACE_MAX, STANCE_HALF, FOOT_STEP } from '../../js/facing.js';

// Spec for the body-rotation geometry that the facing angle drives.
//
// lateralOffset(lat, face) -> {dx, dz}: where a body point sitting `lat` metres to the
//   side of the spine ends up once the torso is rotated by `face` about the vertical axis.
//   - face = 0  -> square to camera: offset is purely lateral (dx = lat, dz = 0).
//   - face grows -> the offset rotates into DEPTH (dz grows, dx shrinks). This is what
//     makes the two shoulders separate front-to-back and the torso read side-on.
//   - the body is rigid: the offset's length is always |lat|.
//
// stanceFeet(face, fwd) -> { fa, fb, frontIsA }: resting-stance foot offsets from the
//   entity centre. `fwd` is the entity's net direction in z (-1 human, +1 NPC).
//   - feet straddle STANCE_HALF either side along the facing axis,
//   - the net-side (front) foot steps toward the net by up to FOOT_STEP, scaled by |face|,
//   - frontIsA reports whether foot A (the left-hip foot) is the front foot.

describe('lateralOffset', () => {
  it('is purely lateral when square to camera (face = 0)', () => {
    const o = lateralOffset(0.2, 0);
    expect(o.dx).toBeCloseTo(0.2);
    expect(o.dz).toBeCloseTo(0);
  });
  it('rotates fully into depth at a 90° turn', () => {
    const o = lateralOffset(0.2, Math.PI / 2);
    expect(o.dx).toBeCloseTo(0);
    expect(o.dz).toBeCloseTo(0.2);
  });
  it('mirrors for the opposite side', () => {
    const r = lateralOffset(0.2, 0.5), l = lateralOffset(-0.2, 0.5);
    expect(l.dx).toBeCloseTo(-r.dx);
    expect(l.dz).toBeCloseTo(-r.dz);
  });
  it('preserves length (rigid body) for any face', () => {
    for (const f of [0, 0.3, 0.7, 1.2, Math.PI / 2]) {
      const o = lateralOffset(0.2, f);
      expect(Math.hypot(o.dx, o.dz)).toBeCloseTo(0.2);
    }
  });
  it('separates shoulders deeper as the turn increases', () => {
    const depths = [0, 0.2, 0.4, 0.6, 0.8].map(f => Math.abs(lateralOffset(0.2, f).dz));
    for (let i = 1; i < depths.length; i++) expect(depths[i]).toBeGreaterThan(depths[i - 1]);
  });
});

describe('stanceFeet — resting (square) stance', () => {
  it('feet straddle symmetrically with no forward step at face = 0', () => {
    const { fa, fb } = stanceFeet(0, -1);
    expect(fa.dx).toBeCloseTo(-STANCE_HALF);
    expect(fb.dx).toBeCloseTo(STANCE_HALF);
    expect(fa.dz).toBeCloseTo(0);
    expect(fb.dz).toBeCloseTo(0);
  });
  it('reduces to the original ∓0.16 straddle (no regression at rest)', () => {
    expect(STANCE_HALF).toBeCloseTo(0.16);
    const { fa, fb } = stanceFeet(0, -1);
    expect(fa.dx).toBeCloseTo(-0.16);
    expect(fb.dx).toBeCloseTo(0.16);
  });
});

describe('stanceFeet — front foot steps toward the net', () => {
  it('human forehand: foot A is in front and steps toward the net (−z)', () => {
    const st = stanceFeet(FACE_MAX, -1);
    expect(st.frontIsA).toBe(true);
    // back foot keeps its straddle position; front foot adds exactly fwd * FOOT_STEP
    expect(st.fb.dz).toBeCloseTo(lateralOffset(STANCE_HALF, FACE_MAX).dz);
    expect(st.fa.dz).toBeCloseTo(lateralOffset(-STANCE_HALF, FACE_MAX).dz + (-1) * FOOT_STEP);
  });
  it('human backhand: foot B is in front instead', () => {
    const st = stanceFeet(-FACE_MAX, -1);
    expect(st.frontIsA).toBe(false);
  });
  it('NPC mirrors the human — its front foot steps toward its own net (+z)', () => {
    const st = stanceFeet(FACE_MAX, 1); // NPC, isHuman=false already folded into a positive face
    const front = st.frontIsA ? st.fa : st.fb;
    const back = st.frontIsA ? st.fb : st.fa;
    expect(front.dz * 1).toBeGreaterThan(back.dz * 1); // front is further toward +z
  });
  it('front foot is always at least as far toward the net as the back foot', () => {
    for (const fwd of [-1, 1]) {
      for (let face = -FACE_MAX; face <= FACE_MAX + 1e-9; face += 0.1) {
        const st = stanceFeet(face, fwd);
        const front = st.frontIsA ? st.fa : st.fb;
        const back = st.frontIsA ? st.fb : st.fa;
        expect(front.dz * fwd).toBeGreaterThanOrEqual(back.dz * fwd - 1e-9);
      }
    }
  });
  it('the forward step never exceeds FOOT_STEP', () => {
    for (const fwd of [-1, 1]) {
      for (let face = -FACE_MAX; face <= FACE_MAX + 1e-9; face += 0.05) {
        const st = stanceFeet(face, fwd);
        const front = st.frontIsA ? st.fa : st.fb;
        const baseDz = lateralOffset(st.frontIsA ? -STANCE_HALF : STANCE_HALF, face).dz;
        const stepComponent = (front.dz - baseDz) * fwd;
        expect(stepComponent).toBeGreaterThanOrEqual(-1e-9);
        expect(stepComponent).toBeLessThanOrEqual(FOOT_STEP + 1e-9);
      }
    }
  });
  it('steps further forward the more the body turns', () => {
    const lead = f => { const st = stanceFeet(f, -1); const front = st.frontIsA ? st.fa : st.fb;
      return (front.dz - lateralOffset(st.frontIsA ? -STANCE_HALF : STANCE_HALF, f).dz) * -1; };
    expect(lead(FACE_MAX)).toBeGreaterThan(lead(FACE_MAX / 2));
    expect(lead(FACE_MAX / 2)).toBeGreaterThan(lead(0.01));
  });
});
