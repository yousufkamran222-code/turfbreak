import { describe, expect, it } from 'vitest';
import { FixedStepper } from '../src/loop';

describe('FixedStepper', () => {
  it('runs a whole number of fixed steps and carries the remainder', () => {
    const s = new FixedStepper(60, 8);
    let steps = 0;
    const alpha = s.advance(2.5 / 60, 1, () => steps++);
    expect(steps).toBe(2);
    expect(alpha).toBeCloseTo(0.5, 6);
    s.advance(0.6 / 60, 1, () => steps++);
    expect(steps).toBe(3);
  });

  it('runs twice as many steps at 2x speed', () => {
    const s = new FixedStepper(60, 8);
    let steps = 0;
    for (let i = 0; i < 60; i++) s.advance(1 / 60, 2, () => steps++);
    expect(steps).toBeGreaterThanOrEqual(119);
    expect(steps).toBeLessThanOrEqual(120);
  });

  it('drops the backlog after a long stall instead of spiralling', () => {
    const s = new FixedStepper(60, 8);
    let steps = 0;
    s.advance(10, 1, () => steps++);
    expect(steps).toBe(8);
    steps = 0;
    s.advance(0, 1, () => steps++);
    expect(steps).toBe(0);
  });
});
