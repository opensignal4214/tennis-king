import { describe, it, expect } from 'vitest';
import { clamp, lerp, netHeight, name, bodyContactPenalty } from '../../js/utils.js';

describe('clamp', () => {
  it('passes through value within range', () => expect(clamp(5, 0, 10)).toBe(5));
  it('clamps to minimum', () => expect(clamp(-1, 0, 10)).toBe(0));
  it('clamps to maximum', () => expect(clamp(11, 0, 10)).toBe(10));
  it('handles exact lower boundary', () => expect(clamp(0, 0, 10)).toBe(0));
  it('handles exact upper boundary', () => expect(clamp(10, 0, 10)).toBe(10));
});

describe('netHeight', () => {
  it('is 0.92 at center (x=0) — lowest point', () => expect(netHeight(0)).toBe(0.92));
  it('is higher away from center', () => expect(netHeight(5.2)).toBeCloseTo(1.08));
  it('center is lower than sides', () => expect(netHeight(0)).toBeLessThan(netHeight(5.2)));
  it('is symmetric for positive and negative x', () => expect(netHeight(-3)).toBeCloseTo(netHeight(3)));
  it('plateaus at and beyond NETX (5.2)', () => expect(netHeight(6)).toBeCloseTo(netHeight(5.2)));
  it('returns values between 0.92 and 1.08', () => {
    for (const x of [0, 1, 2, 3, 4, 5.2, 8]) {
      expect(netHeight(x)).toBeGreaterThanOrEqual(0.92);
      expect(netHeight(x)).toBeLessThanOrEqual(1.08 + 0.001);
    }
  });
});

describe('lerp', () => {
  it('returns start at t=0', () => expect(lerp(0, 10, 0)).toBe(0));
  it('returns end at t=1', () => expect(lerp(0, 10, 1)).toBe(10));
  it('returns midpoint at t=0.5', () => expect(lerp(0, 10, 0.5)).toBe(5));
  it('works with negative values', () => expect(lerp(-10, 10, 0.5)).toBe(0));
});

describe('name', () => {
  it('player 0 → "You"', () => expect(name(0)).toBe('You'));
  it('player 1 → "CPU"', () => expect(name(1)).toBe('CPU'));
});

describe('bodyContactPenalty', () => {
  // Player forehand: isNpc=false, isForehand=true → idealX = +0.45
  it('returns 1.0 at sweet spot (player forehand, contact=0.45)', () => {
    expect(bodyContactPenalty(0.45, true, false)).toBeCloseTo(1.0);
  });

  // NPC forehand: isNpc=true, isForehand=true → idealX = -0.45
  it('returns 1.0 at sweet spot (NPC forehand, contact=-0.45)', () => {
    expect(bodyContactPenalty(-0.45, true, true)).toBeCloseTo(1.0);
  });

  it('no penalty within 0.25 radius of sweet spot', () => {
    // idealX=0.45, contact=0.6 → bodyErr=0.15 < 0.25 → penalty=1
    expect(bodyContactPenalty(0.6, true, false)).toBeCloseTo(1.0);
  });

  it('penalty grows beyond 0.25 radius', () => {
    // idealX=0.45, contact=1.45 → bodyErr=1.0 → 1 + (1.0-0.25)*0.7 = 1.525
    expect(bodyContactPenalty(1.45, true, false)).toBeCloseTo(1.525);
  });

  it('larger deviation means larger penalty', () => {
    const near = bodyContactPenalty(1.0, true, false);
    const far = bodyContactPenalty(2.0, true, false);
    expect(far).toBeGreaterThan(near);
  });

  it('penalty is never less than 1.0', () => {
    for (const x of [0, 0.45, 0.5, 1.0, 2.0]) {
      expect(bodyContactPenalty(x, true, false)).toBeGreaterThanOrEqual(1.0);
    }
  });
});
