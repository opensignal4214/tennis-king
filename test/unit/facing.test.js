import { describe, it, expect } from 'vitest';
import { facingAngle, FACE_MAX } from '../../js/facing.js';

// Spec (agreed behaviour for the side-on groundstroke stance):
//
// facingAngle(anim, isHuman) -> rotation about the vertical axis, in radians.
//   0 = chest square to the camera (front-facing).
//
// 1. Only GROUNDSTROKES turn the body. No anim, or a serve/smash/volley/toss, returns 0.
// 2. Magnitude follows the swing phase:
//      - full turn (FACE_MAX) while charging and through contact (phase < 0.10s),
//      - then unwinds linearly to 0 over the follow-through (phase 0.10 -> 0.65s),
//      - stays at 0 afterwards (never negative magnitude / never overshoots).
//    `phase` is anim.t, or 0 while anim.charging is true.
// 3. Sign: a human turns one way for a forehand (side > 0) and the other for a
//    backhand (side < 0); the NPC mirrors the human. So:
//      sign = sign(side) * (isHuman ? +1 : -1)
// 4. Peak magnitude is exactly FACE_MAX (a ¾ turn).
// 5. An undefined / zero hitting side means no defined stroke side, so no turn.

const ground = (over = {}) => ({ type: 'ground', side: 1, t: 0, charging: false, ...over });

describe('FACE_MAX', () => {
  it('is the agreed ¾ turn of 0.70 rad', () => expect(FACE_MAX).toBeCloseTo(0.70));
});

describe('facingAngle — when the body should NOT turn', () => {
  it('returns 0 with no anim', () => expect(facingAngle(null, true)).toBe(0));
  it('returns 0 with undefined anim', () => expect(facingAngle(undefined, true)).toBe(0));
  it('returns 0 for a serve', () => expect(facingAngle({ type: 'serve', side: 1, t: 0.05 }, true)).toBe(0));
  it('returns 0 for a smash', () => expect(facingAngle({ type: 'smash', side: 1, t: 0.05 }, true)).toBe(0));
  it('returns 0 for a volley', () => expect(facingAngle({ type: 'volley', side: 1, t: 0.02 }, true)).toBe(0));
  it('returns 0 when the hitting side is 0', () => expect(facingAngle(ground({ side: 0 }), true)).toBe(0));
  it('returns 0 when the hitting side is missing', () => expect(facingAngle(ground({ side: undefined }), true)).toBe(0));
});

describe('facingAngle — magnitude over the swing phase', () => {
  it('is full (FACE_MAX) while charging, regardless of t', () => {
    expect(facingAngle(ground({ charging: true, t: 0.4 }), true)).toBeCloseTo(FACE_MAX);
  });
  it('is full just after contact (t < 0.10)', () => {
    expect(facingAngle(ground({ t: 0.05 }), true)).toBeCloseTo(FACE_MAX);
  });
  it('is still full at the 0.10 boundary', () => {
    expect(facingAngle(ground({ t: 0.10 }), true)).toBeCloseTo(FACE_MAX);
  });
  it('is half-turned at the unwind midpoint (t = 0.375)', () => {
    expect(facingAngle(ground({ t: 0.375 }), true)).toBeCloseTo(FACE_MAX * 0.5);
  });
  it('has fully unwound to 0 at the end of follow-through (t = 0.65)', () => {
    expect(facingAngle(ground({ t: 0.65 }), true)).toBeCloseTo(0);
  });
  it('stays at 0 after follow-through (does not go negative)', () => {
    expect(facingAngle(ground({ t: 1.0 }), true)).toBe(0);
  });
  it('decreases monotonically through the unwind window', () => {
    const samples = [0.10, 0.2, 0.3, 0.4, 0.5, 0.6, 0.65].map(t => facingAngle(ground({ t }), true));
    for (let i = 1; i < samples.length; i++) expect(samples[i]).toBeLessThanOrEqual(samples[i - 1]);
  });
  it('never exceeds FACE_MAX in magnitude across the whole swing', () => {
    for (let t = 0; t <= 1; t += 0.02) {
      expect(Math.abs(facingAngle(ground({ t }), true))).toBeLessThanOrEqual(FACE_MAX + 1e-9);
    }
  });
});

describe('facingAngle — sign (which way the body turns)', () => {
  it('human forehand (side > 0) turns positive', () => {
    expect(facingAngle(ground({ side: 1, t: 0 }), true)).toBeGreaterThan(0);
  });
  it('human backhand (side < 0) turns negative', () => {
    expect(facingAngle(ground({ side: -1, t: 0 }), true)).toBeLessThan(0);
  });
  it('NPC mirrors the human for the same shot side', () => {
    const human = facingAngle(ground({ side: 1, t: 0 }), true);
    const npc   = facingAngle(ground({ side: 1, t: 0 }), false);
    expect(npc).toBeCloseTo(-human);
  });
  it('forehand and backhand are opposite for the same player', () => {
    const fh = facingAngle(ground({ side: 1, t: 0 }), true);
    const bh = facingAngle(ground({ side: -1, t: 0 }), true);
    expect(fh).toBeCloseTo(-bh);
  });
  it('peak human forehand is exactly +FACE_MAX', () => {
    expect(facingAngle(ground({ side: 1, t: 0 }), true)).toBeCloseTo(FACE_MAX);
  });
});
