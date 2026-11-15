import { describe, expect, it } from 'vitest';
import { tuning } from '../src/content/tuning';
import { findCell } from '../src/sim/arena';
import { stepWorld } from '../src/sim/step';
import { blankWorld, clearRunners, place } from './helpers';

describe('runners', () => {
  it('reflect off walls, stay inside and count a hit', () => {
    const w = blankWorld();
    clearRunners(w);
    const r = place(w, 0, 30, 500, -1, 0);
    for (let i = 0; i < 10; i++) stepWorld(w);
    expect(r.dx).toBeGreaterThan(0);
    expect(r.x).toBeGreaterThanOrEqual(tuning.runner.bodyRadius);
    expect(w.sides[0].hits).toBe(1);
    expect(Math.hypot(r.dx, r.dy)).toBeCloseTo(1, 9);
  });

  it('enemy runners clash, bounce apart and both count a hit', () => {
    const w = blankWorld();
    clearRunners(w);
    const a = place(w, 0, 480, 500, 1, 0);
    const b = place(w, 1, 520, 500, -1, 0);
    for (let i = 0; i < 6; i++) stepWorld(w);
    expect(a.dx).toBeLessThan(0);
    expect(b.dx).toBeGreaterThan(0);
    expect(w.sides[0].hits).toBe(1);
    expect(w.sides[1].hits).toBe(1);
    expect(b.x - a.x).toBeGreaterThanOrEqual(2 * tuning.runner.bodyRadius - 1e-6);
  });

  it('same-side runners pass through each other', () => {
    const w = blankWorld();
    clearRunners(w);
    const a = place(w, 0, 480, 500, 1, 0);
    const b = place(w, 0, 520, 500, -1, 0);
    for (let i = 0; i < 6; i++) stepWorld(w);
    expect(a.dx).toBe(1);
    expect(b.dx).toBe(-1);
    expect(w.sides[0].hits).toBe(0);
  });

  it('capture the enemy cell under their centre', () => {
    const w = blankWorld();
    clearRunners(w);
    const cell = w.owner.findIndex((o) => o === 1);
    const x = w.arena.sites[cell * 2]!;
    const y = w.arena.sites[cell * 2 + 1]!;
    expect(findCell(w.arena, x, y)).toBe(cell);
    place(w, 0, x, y, 0, 1);
    const before = w.counts[0];
    stepWorld(w);
    expect(w.owner[cell]).toBe(0);
    expect(w.counts[0]).toBeGreaterThan(before);
  });

  it('capture every enemy cell whose centroid is inside the capture radius', () => {
    const w = blankWorld();
    clearRunners(w);
    w.sides[0].stats.captureRadius.add = 150;
    const r = place(w, 0, 500, 500, 1, 0);
    stepWorld(w);
    const c = w.arena.centroids;
    for (let i = 0; i < w.arena.cellCount; i++) {
      if (Math.hypot(c[i * 2]! - r.x, c[i * 2 + 1]! - r.y) <= 150) expect(w.owner[i]).toBe(0);
    }
  });
});

describe('win rules', () => {
  it('a side that holds every cell wins by wipeout at once', () => {
    const w = blankWorld();
    clearRunners(w);
    for (let i = 0; i < w.owner.length; i++) w.owner[i] = 0;
    w.counts[0] = w.owner.length;
    w.counts[1] = 0;
    stepWorld(w);
    expect(w.phase).toBe('ended');
    expect(w.winner).toBe(0);
    expect(w.endReason).toBe('wipeout');
  });

  it('a tie at the buzzer goes to sudden death, which the next capture wins', () => {
    const w = blankWorld();
    clearRunners(w);
    w.step = w.matchSteps - 1;
    // The starting split is exactly even when the cell count is even.
    expect(w.owner.length % 2).toBe(0);
    stepWorld(w);
    expect(w.counts[0]).toBe(w.counts[1]);
    expect(w.phase).toBe('suddenDeath');
    const cell = w.owner.findIndex((o) => o === 1);
    place(w, 0, w.arena.sites[cell * 2]!, w.arena.sites[cell * 2 + 1]!, 0, 1);
    stepWorld(w);
    expect(w.phase).toBe('ended');
    expect(w.winner).toBe(0);
    expect(w.endReason).toBe('suddenDeath');
  });

  it('more cells at the buzzer wins on time', () => {
    const w = blankWorld();
    clearRunners(w);
    const cell = w.owner.findIndex((o) => o === 0);
    w.owner[cell] = 1;
    w.counts[0]--;
    w.counts[1]++;
    w.step = w.matchSteps - 1;
    stepWorld(w);
    expect(w.winner).toBe(1);
    expect(w.endReason).toBe('time');
  });
});

describe('lead changes', () => {
  it('need the hysteresis margin, so near-ties do not count', () => {
    const w = blankWorld();
    clearRunners(w);
    const flip = (from: 0 | 1, n: number) => {
      for (let i = 0, done = 0; i < w.owner.length && done < n; i++) {
        if (w.owner[i] !== from) continue;
        w.owner[i] = from === 0 ? 1 : 0;
        w.counts[from]--;
        w.counts[from === 0 ? 1 : 0]++;
        done++;
      }
    };
    flip(1, 2);
    stepWorld(w);
    expect(w.leader).toBe(0);
    flip(0, 3);
    stepWorld(w);
    // Side 1 is ahead by 2, below the margin: side 0 keeps the lead.
    expect(w.leader).toBe(0);
    expect(w.leadChanges).toBe(0);
    flip(0, 1);
    stepWorld(w);
    expect(w.leader).toBe(1);
    expect(w.leadChanges).toBe(1);
  });
});
