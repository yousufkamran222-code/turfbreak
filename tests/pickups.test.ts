import { describe, expect, it } from 'vitest';
import { pickups } from '../src/content/pickups';
import { tuning } from '../src/content/tuning';
import { stepWorld } from '../src/sim/step';
import { createWorld, type World } from '../src/sim/world';
import { blank, clearRunners, place } from './helpers';

const SPS = tuning.sim.stepsPerSecond;
const only = (id: string) => [pickups.find((p) => p.id === id)!];

/** A world with one pickup of the given kind placed right on side 0's runner. */
function grab(id: string): World {
  const w = createWorld({ seed: 2, cores: [blank, blank], pickups: only(id) });
  clearRunners(w);
  place(w, 0, 500, 500, 1, 0);
  place(w, 1, 100, 100, 1, 0);
  w.pickups.push({ id: 99, def: 0, x: 507, y: 500, expiresStep: 10_000 });
  stepWorld(w);
  return w;
}

describe('pickups', () => {
  it('spawn on schedule, cap at the maximum on the map and expire', () => {
    const w = createWorld({ seed: 5, cores: [blank, blank] });
    clearRunners(w);
    for (let i = 0; i < tuning.pickups.firstSeconds * SPS; i++) stepWorld(w);
    expect(w.pickups.length).toBe(1);
    let max = 0;
    for (let i = 0; i < 30 * SPS && w.phase !== 'ended'; i++) {
      stepWorld(w);
      max = Math.max(max, w.pickups.length);
      for (const p of w.pickups) expect(p.expiresStep).toBeGreaterThan(w.step);
    }
    expect(max).toBe(tuning.pickups.maxOnMap);
  });

  it('are the same for the same seed', () => {
    const run = () => {
      const w = createWorld({ seed: 8, cores: [blank, blank] });
      for (let i = 0; i < 20 * SPS; i++) stepWorld(w);
      return w.pickups.map((p) => [p.def, p.x, p.y]);
    };
    expect(run()).toEqual(run());
  });

  it('are off when the match has none', () => {
    const w = createWorld({ seed: 5, cores: [blank, blank], pickups: [] });
    for (let i = 0; i < 20 * SPS; i++) stepWorld(w);
    expect(w.pickups.length).toBe(0);
  });

  it('Surge speeds the side up for its duration', () => {
    const w = grab('surge');
    expect(w.sides[0].pickups).toBe(1);
    expect(w.pickups.length).toBe(0);
    expect(w.sides[0].surgeSteps).toBeGreaterThan(0);
    stepWorld(w);
    expect(w.sides[0].speedFactor).toBeGreaterThan(1.4);
  });

  it('Blast captures every cell within its radius', () => {
    const w = grab('blast');
    const e = pickups.find((p) => p.id === 'blast')!.effect;
    if (e.kind !== 'blast') throw new Error('wrong effect');
    const c = w.arena.centroids;
    for (let i = 0; i < w.arena.cellCount; i++) {
      if (Math.hypot(c[i * 2]! - 507, c[i * 2 + 1]! - 500) <= e.radius) expect(w.owner[i]).toBe(0);
    }
  });

  it('Charge makes the redirect ready again', () => {
    const w = createWorld({ seed: 2, cores: [blank, blank], pickups: only('charge') });
    w.sides[0].charges = 0;
    w.sides[0].chargeSteps = 200;
    const r = w.runners[0]!;
    w.pickups.push({ id: 99, def: 0, x: r.x + r.dx * 5, y: r.y + r.dy * 5, expiresStep: 10_000 });
    stepWorld(w);
    expect(w.sides[0].charges).toBe(1);
  });

  it('Shield stops the enemy taking your cells', () => {
    const w = grab('shield');
    const cell = w.owner.findIndex((o) => o === 0);
    clearRunners(w);
    place(w, 1, w.arena.sites[cell * 2]!, w.arena.sites[cell * 2 + 1]!, 0, 1);
    stepWorld(w);
    expect(w.owner[cell]).toBe(0);
  });
});
