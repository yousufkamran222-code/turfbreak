import { describe, expect, it } from 'vitest';
import { tuning } from '../src/content/tuning';
import { queueInput } from '../src/sim/input';
import { stepWorld } from '../src/sim/step';
import { createWorld, statValue } from '../src/sim/world';
import { blank, ricochet, splitter } from './helpers';

function hitPrimary(seed: number, cores: Parameters<typeof createWorld>[0]['cores'], hits: number) {
  const w = createWorld({ seed, cores });
  const r = w.runners[0]!;
  const ctx = w.contexts[0];
  for (let i = 0; i < hits; i++) cores[0].hooks.onHit?.(ctx, { runner: r, kind: 'wall' });
  return w;
}

describe('Ricochet', () => {
  it('starts with a beam and grows it per hit, keeping stacks and stat in step', () => {
    const v = ricochet.values;
    const w = hitPrimary(1, [ricochet, blank], 5);
    expect(w.sides[0].stacks).toBe(v.startBeam! + 5 * v.beamPerHit!);
    expect(statValue(w.sides[0], 'beamLength')).toBe(w.sides[0].stacks);
    expect(w.sides[0].triggers).toBe(5);
  });

  it('captures enemy cells along its beam', () => {
    const w = createWorld({ seed: 2, cores: [ricochet, blank] });
    w.sides[0].stats.beamLength.add = 600;
    // A fresh beam trails back into home territory; aim it at the enemy and mark it mid-swing.
    const r = w.runners[0]!;
    r.bx = r.dx;
    r.by = r.dy;
    r.swinging = true;
    const before = w.counts[0];
    stepWorld(w);
    const beamCaptures = w.events.filter((e) => e.type === 'CellCaptured' && e.cause === 'beam').length;
    expect(beamCaptures).toBeGreaterThan(0);
    expect(w.counts[0]).toBeGreaterThan(before);
  });

  it('swings its beam to trail behind after a turn', () => {
    const w = createWorld({ seed: 3, cores: [ricochet, blank] });
    const r = w.runners[0]!;
    r.dx = -r.dx;
    r.dy = -r.dy;
    for (let i = 0; i < 2 * tuning.sim.stepsPerSecond; i++) {
      stepWorld(w);
      if (w.phase === 'ended') break;
    }
    // Within two seconds the beam points straight back again, or has just been knocked off by a new hit.
    const dot = r.bx * -r.dx + r.by * -r.dy;
    expect(dot).toBeGreaterThan(-1);
    expect(Math.hypot(r.bx, r.by)).toBeCloseTo(1, 9);
  });
});

describe('beam swing', () => {
  it('snaps straight behind on a wall bounce, without sweeping', () => {
    const w = createWorld({ seed: 3, cores: [ricochet, blank], pickups: [] });
    const r = w.runners[0]!;
    r.x = 30;
    r.dx = -1;
    r.dy = 0;
    r.bx = 1;
    r.by = 0;
    for (let i = 0; i < 10; i++) stepWorld(w);
    expect(r.swinging).toBe(false);
    expect(r.bx).toBeCloseTo(-r.dx, 9);
    expect(r.by).toBeCloseTo(-r.dy, 9);
  });

  it('swings over several steps after a redirect, then trails', () => {
    const w = createWorld({ seed: 3, cores: [ricochet, blank], pickups: [] });
    const r = w.runners[0]!;
    queueInput(w, { side: 0, type: 'redirect', x: r.x - r.dx * 300, y: r.y - r.dy * 300 });
    stepWorld(w);
    expect(r.swinging).toBe(true);
    for (let i = 0; i < 60 && r.swinging; i++) stepWorld(w);
    expect(r.swinging).toBe(false);
  });
});

describe('Splitter', () => {
  it('spawns a split every N hits', () => {
    const every = splitter.values.splitEvery!;
    const w = hitPrimary(1, [splitter, blank], every * 3 - 1);
    expect(w.sides[0].runnerCount).toBe(3);
    expect(w.sides[0].stacks).toBe(2);
    const split = w.runners.find((r) => !r.primary && r.side === 0)!;
    expect(split.radiusMul).toBe(splitter.values.splitRadius);
  });

  it('overflows into speed at the runner cap', () => {
    const every = splitter.values.splitEvery!;
    const cap = tuning.runner.maxPerSide;
    const w = hitPrimary(1, [splitter, blank], every * (cap + 4));
    expect(w.sides[0].runnerCount).toBe(cap);
    expect(w.sides[0].overflow).toBe(5);
    expect(w.sides[0].stats.speed.mul).toBeCloseTo((1 + tuning.runner.overflowSpeed) ** 5, 9);
  });
});
