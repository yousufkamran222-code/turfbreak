import { describe, expect, it } from 'vitest';
import { tuning } from '../src/content/tuning';
import { stepWorld } from '../src/sim/step';
import { createWorld } from '../src/sim/world';
import { blank, clearRunners, place } from './helpers';

const SPS = tuning.sim.stepsPerSecond;
const bare = (twist = {}) => createWorld({ seed: 4, cores: [blank, blank], pickups: [], twist });

describe('ability API', () => {
  it('after() fires once at the right time, in the order timers were set', () => {
    const order: number[] = [];
    const core = { ...blank, hooks: { onScheduled: (_ctx: unknown, effect: { kind: string; cell?: number }) => { order.push(effect.cell!); } } };
    const w = createWorld({ seed: 4, cores: [core, core], pickups: [] });
    w.contexts[0].after(1, { kind: 'core', action: 'spread', cell: 1 });
    w.contexts[1].after(1, { kind: 'core', action: 'spread', cell: 2 });
    w.contexts[0].after(0.5, { kind: 'core', action: 'spread', cell: 0 });
    for (let i = 0; i < SPS; i++) stepWorld(w);
    expect(order).toEqual([0, 1, 2]);
    for (let i = 0; i < SPS; i++) stepWorld(w);
    expect(order.length).toBe(3);
  });

  it('cell shields absorb one attempt per point, with a pause between attempts', () => {
    const w = bare();
    clearRunners(w);
    const cell = w.owner.findIndex((o) => o === 1);
    w.contexts[1].shieldCells([cell], 1);
    place(w, 0, w.arena.sites[cell * 2]!, w.arena.sites[cell * 2 + 1]!, 0, 0.0001).dy = 1;
    w.sides[0].stats.speed.mul = 0;
    stepWorld(w);
    expect(w.owner[cell]).toBe(1);
    expect(w.cellShield[cell]).toBe(0);
    stepWorld(w);
    expect(w.owner[cell]).toBe(1);
    for (let i = 0; i < tuning.shield.absorbSeconds * SPS; i++) stepWorld(w);
    expect(w.owner[cell]).toBe(0);
  });

  it('locked cells cannot be taken until the lock ends', () => {
    const w = bare();
    clearRunners(w);
    const cell = w.owner.findIndex((o) => o === 1);
    w.contexts[1].lockCells([cell], 1);
    place(w, 0, w.arena.sites[cell * 2]!, w.arena.sites[cell * 2 + 1]!, 0, 1);
    w.sides[0].stats.speed.mul = 0;
    for (let i = 0; i < SPS - 2; i++) stepWorld(w);
    expect(w.owner[cell]).toBe(1);
    for (let i = 0; i < 4; i++) stepWorld(w);
    expect(w.owner[cell]).toBe(0);
  });

  it('teleport, steer and slowEnemy do what they say', () => {
    const w = bare();
    const r = w.runners[0]!;
    w.contexts[0].teleport(r, 5000, -20);
    expect(r.x).toBeLessThanOrEqual(w.arena.size);
    expect(r.y).toBeGreaterThanOrEqual(0);
    r.dx = 1;
    r.dy = 0;
    w.contexts[0].steer(r, r.x, r.y + 100, 0.1);
    expect(r.dy).toBeGreaterThan(0.05);
    expect(Math.hypot(r.dx, r.dy)).toBeCloseTo(1, 9);
    for (let i = 0; i < 40; i++) w.contexts[0].steer(r, r.x, r.y + 100, 0.1);
    expect(r.dy).toBeCloseTo(1, 6);
    w.contexts[0].slowEnemy(0.5, 1);
    stepWorld(w);
    expect(w.sides[1].speedFactor).toBeCloseTo(0.5, 9);
    for (let i = 0; i < SPS + 1; i++) stepWorld(w);
    // Back to normal (the underdog boost may add a little).
    expect(w.sides[1].speedFactor).toBeGreaterThanOrEqual(1);
  });

  it('cedeCells hands frontier cells over and keeps counts right', () => {
    const w = bare();
    const before = w.counts[0];
    w.contexts[0].cedeCells(20);
    expect(w.counts[0]).toBe(before - 20);
    expect(w.owner.filter((o) => o === 0).length).toBe(w.counts[0]);
  });
});

describe('match twists', () => {
  it('apply start share, shields, extra primaries and duration', () => {
    const w = bare({ startShare: 0.4, startShields: [0, 1], extraPrimaries: [0, 1], durationSeconds: 60 });
    const n = w.arena.cellCount;
    expect(w.counts[0]).toBe(Math.round(0.4 * n));
    expect(w.runners.filter((r) => r.side === 1 && r.primary).length).toBe(2);
    expect(w.matchSteps).toBe(60 * SPS);
    for (let i = 0; i < n; i++) expect(w.cellShield[i]).toBe(w.owner[i] === 1 ? 1 : 0);
  });
});
