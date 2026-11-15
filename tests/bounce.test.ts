import { describe, expect, it } from 'vitest';
import { createDot, stepDot, type BounceConfig } from '../src/sim/bounce';
import { Rng } from '../src/sim/rng';

const cfg: BounceConfig = { arenaSize: 1000, speed: 420, radius: 14, jitterRad: (4 * Math.PI) / 180 };

function run(seed: number, steps: number) {
  const rng = new Rng(seed, 1);
  const dot = createDot(cfg, rng);
  for (let i = 0; i < steps; i++) {
    stepDot(dot, cfg, rng, 1 / 60);
    expect(dot.x).toBeGreaterThanOrEqual(cfg.radius);
    expect(dot.x).toBeLessThanOrEqual(cfg.arenaSize - cfg.radius);
    expect(dot.y).toBeGreaterThanOrEqual(cfg.radius);
    expect(dot.y).toBeLessThanOrEqual(cfg.arenaSize - cfg.radius);
    expect(Number.isFinite(dot.vx) && Number.isFinite(dot.vy)).toBe(true);
  }
  return dot;
}

describe('bouncing dot', () => {
  it('stays inside the arena and keeps its speed over a long run', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const dot = run(seed, 60 * 120);
      expect(Math.hypot(dot.vx, dot.vy)).toBeCloseTo(cfg.speed, 6);
      expect(dot.bounces).toBeGreaterThan(20);
    }
  });

  it('is deterministic for a seed', () => {
    expect(run(77, 3000)).toEqual(run(77, 3000));
  });
});
