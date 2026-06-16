import { describe, it, expect } from 'vitest';
import {
  vecToMoveKeys, wedgeForVector, serveTypeForTap, clientToLogical,
} from '../../js/touch.js';
import { TOUCH } from '../../js/constants.js';

describe('vecToMoveKeys — joystick vector → WASD', () => {
  it('inside the deadzone engages nothing', () => {
    expect(vecToMoveKeys(0, 0)).toEqual({ KeyW: false, KeyA: false, KeyS: false, KeyD: false });
    expect(vecToMoveKeys(TOUCH.DEAD - 1, 0)).toEqual({ KeyW: false, KeyA: false, KeyS: false, KeyD: false });
  });
  it('right → KeyD only', () => {
    const k = vecToMoveKeys(80, 0);
    expect(k.KeyD).toBe(true);
    expect(k.KeyA || k.KeyW || k.KeyS).toBe(false);
  });
  it('up (screen -y) → KeyW only', () => {
    const k = vecToMoveKeys(0, -80);
    expect(k.KeyW).toBe(true);
    expect(k.KeyS || k.KeyA || k.KeyD).toBe(false);
  });
  it('down → KeyS only', () => {
    const k = vecToMoveKeys(0, 80);
    expect(k.KeyS).toBe(true);
    expect(k.KeyW).toBe(false);
  });
  it('up-left diagonal → KeyW + KeyA', () => {
    const k = vecToMoveKeys(-80, -80);
    expect(k.KeyW).toBe(true);
    expect(k.KeyA).toBe(true);
    expect(k.KeyD || k.KeyS).toBe(false);
  });
});

describe('wedgeForVector — swing flick → stroke key', () => {
  it('inside the deadzone returns the default shot', () => {
    expect(wedgeForVector(0, 0)).toBe(TOUCH.DEFAULT_KEY);
    expect(wedgeForVector(5, 5)).toBe('KeyJ');
  });
  it('up → lob (KeyI)', () => {
    expect(wedgeForVector(0, -90)).toBe('KeyI');
  });
  it('up-left → topspin (KeyJ)', () => {
    expect(wedgeForVector(-64, -64)).toBe('KeyJ');
  });
  it('left → slice (KeyK)', () => {
    expect(wedgeForVector(-90, 0)).toBe('KeyK');
  });
  it('down-left → flat (KeyL)', () => {
    expect(wedgeForVector(-64, 64)).toBe('KeyL');
  });
  it('down → drop (Semicolon)', () => {
    expect(wedgeForVector(0, 90)).toBe('Semicolon');
  });
});

describe('serveTypeForTap — tap height → serve spin', () => {
  it('top third → kick', () => expect(serveTypeForTap(100, 600)).toBe('kick'));
  it('middle band → slice', () => expect(serveTypeForTap(330, 600)).toBe('slice'));
  it('bottom → flat', () => expect(serveTypeForTap(560, 600)).toBe('flat'));
});

describe('clientToLogical — client px → logical W×H', () => {
  it('maps through the canvas rect', () => {
    const rect = { left: 0, top: 0, width: 480, height: 300 };
    expect(clientToLogical(240, 150, rect, 960, 600)).toEqual({ x: 480, y: 300 });
  });
  it('accounts for rect offset', () => {
    const rect = { left: 100, top: 50, width: 960, height: 600 };
    expect(clientToLogical(100, 50, rect, 960, 600)).toEqual({ x: 0, y: 0 });
  });
});
