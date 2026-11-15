import { describe, expect, it } from 'vitest';
import { tuning } from '../src/content/tuning';
import { applyUltimate } from '../src/sim/input';
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
    // A fresh beam trails back into home territory; aim it at the enemy and spin it a little.
    const r = w.runners[0]!;
    r.bx = r.dx;
    r.by = r.dy;
    r.spinLeft = 0.2;
    r.spinReach = 600;
    const before = w.counts[0];
    stepWorld(w);
    const beamCaptures = w.events.filter((e) => e.type === 'CellCaptured' && e.cause === 'beam').length;
    expect(beamCaptures).toBeGreaterThan(0);
    expect(w.counts[0]).toBeGreaterThan(before);
  });

});

describe('beam', () => {
  it('snaps straight behind when nothing makes it swing', () => {
    const w = createWorld({ seed: 3, cores: [blank, blank], pickups: [] });
    const r = w.runners[0]!;
    w.sides[0].stats.beamLength.add = 300;
    r.bx = 1;
    r.by = 0;
    stepWorld(w);
    expect(r.bx).toBeCloseTo(-r.dx, 9);
    expect(r.by).toBeCloseTo(-r.dy, 9);
  });

  it('swings over several steps after a Ricochet hit, then trails', () => {
    const w = createWorld({ seed: 3, cores: [ricochet, blank], pickups: [] });
    const r = w.runners[0]!;
    r.bx = r.dx;
    r.by = r.dy;
    ricochet.hooks.onHit?.(w.contexts[0], { runner: r, kind: 'wall' });
    stepWorld(w);
    expect(r.swinging).toBe(true);
    for (let i = 0; i < 60 && r.swinging; i++) stepWorld(w);
    expect(r.swinging).toBe(false);
  });
});

describe('ultimates', () => {
  it('Ricochet Spin turns the beam through full circles', () => {
    const w = createWorld({ seed: 3, cores: [ricochet, blank], pickups: [] });
    const r = w.runners[0]!;
    applyUltimate(w, 0);
    expect(r.spinLeft).toBeCloseTo(ricochet.values.spinTurns! * 2 * Math.PI, 9);
    for (let i = 0; i < 600 && r.spinLeft > 0; i++) stepWorld(w);
    expect(r.spinLeft).toBe(0);
  });

  it('Splitter Burst spawns one split per few owned, at least one', () => {
    const per = splitter.values.burstPer!;
    const w = createWorld({ seed: 3, cores: [splitter, blank], pickups: [] });
    applyUltimate(w, 0);
    expect(w.sides[0].runnerCount).toBe(2);
    const big = createWorld({ seed: 3, cores: [splitter, blank], pickups: [] });
    const r = big.runners[0]!;
    for (let i = 0; i < per * 3; i++) big.contexts[0].spawnRunner(r, { radiusMul: 0.7, speedMul: 0.7 });
    applyUltimate(big, 0);
    expect(big.sides[0].runnerCount).toBe(1 + per * 3 + 3);
  });

  it('fire once per match', () => {
    const w = createWorld({ seed: 3, cores: [splitter, blank], pickups: [] });
    expect(applyUltimate(w, 0)).toBe(true);
    expect(applyUltimate(w, 0)).toBe(false);
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
    expect(w.sides[0].stats.speed.add).toBeCloseTo(5 * tuning.runner.speed * tuning.runner.overflowSpeed, 9);
  });
});
