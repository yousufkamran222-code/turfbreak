import { describe, expect, it } from 'vitest';
import { Rng, Stream } from '../src/sim/rng';

describe('Rng', () => {
  it('produces the same sequence for the same seed and stream', () => {
    const a = new Rng(1234, Stream.sim);
    const b = new Rng(1234, Stream.sim);
    for (let i = 0; i < 1000; i++) expect(a.nextUint32()).toBe(b.nextUint32());
  });

  it('separates streams that share a seed', () => {
    const sim = new Rng(1234, Stream.sim);
    const cosmetic = new Rng(1234, Stream.cosmetic);
    const same = Array.from({ length: 100 }, () => sim.nextUint32() === cosmetic.nextUint32());
    expect(same.filter(Boolean).length).toBeLessThan(3);
  });

  it('matches a golden sequence, so a PRNG change cannot slip in unnoticed', () => {
    const r = new Rng(42, 0);
    expect(Array.from({ length: 4 }, () => r.nextUint32())).toMatchSnapshot();
  });

  it('stays in range and is roughly uniform', () => {
    const r = new Rng(7);
    const buckets = new Array<number>(10).fill(0);
    for (let i = 0; i < 100_000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      const i = Math.floor(v * 10);
      buckets[i] = (buckets[i] ?? 0) + 1;
    }
    for (const b of buckets) expect(Math.abs(b - 10_000)).toBeLessThan(500);
  });

  it('restores state exactly', () => {
    const r = new Rng(99);
    r.next();
    const saved = r.getState();
    const first = [r.next(), r.next()];
    r.setState(saved);
    expect([r.next(), r.next()]).toEqual(first);
  });
});
