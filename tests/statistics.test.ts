import { describe, expect, it } from 'vitest';
import { wilson } from '../tools/statistics';

describe('balance uncertainty', () => {
  it('handles no observations and endpoints', () => {
    expect(wilson(0, 0)).toEqual([0, 1]);
    expect(wilson(0, 100)[0]).toBeCloseTo(0, 12);
    expect(wilson(100, 100)[1]).toBeCloseTo(1, 12);
  });
  it('narrows with independent seeds and contains the estimate', () => {
    const small = wilson(40, 80); const large = wilson(250, 500);
    expect(small[0]).toBeLessThan(0.5); expect(small[1]).toBeGreaterThan(0.5);
    expect(large[1] - large[0]).toBeLessThan(small[1] - small[0]);
  });
});
