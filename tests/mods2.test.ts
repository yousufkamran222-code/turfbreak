import { describe, expect, it } from 'vitest';
import { mods, modById } from '../src/content/mods';
import { pickups } from '../src/content/pickups';
import { tuning } from '../src/content/tuning';
import type { CoreDef } from '../src/sim/abilities';
import { applyUltimate } from '../src/sim/input';
import { checkInvariants } from '../src/sim/invariants';
import { runMatch } from '../src/sim/match';
import { hit, stepWorld } from '../src/sim/step';
import { createWorld, statValue, type MatchConfig, type SideIndex, type World } from '../src/sim/world';
import { blank, clearRunners, place, ricochet, splitter } from './helpers';

const SPS = tuning.sim.stepsPerSecond;
const rival = { kind: 'heuristic' as const, ...tuning.ai.rival };
const slotOf = (id: string, bank = 0) => (bank === 0 ? 20 : 60) + mods.findIndex((m) => m.id === id);

/** A Core with no ability that records every boost it is asked for. */
function booster(log: number[]): CoreDef {
  return { ...blank, id: 'booster', hooks: { onBoost: (_ctx, f) => void log.push(f) } };
}

function world(id: string, level: number, extra: Partial<MatchConfig> = {}, core: CoreDef = blank): World {
  return createWorld({ seed: 4, cores: [core, blank], mods: [[{ mod: modById(id), level }], []], pickups: [], recordEvents: true, ...extra });
}

/** Give a cell to a side, keeping the counts right. */
function setOwner(w: World, cell: number, side: SideIndex): void {
  const prev = w.owner[cell] as SideIndex;
  if (prev === side) return;
  w.owner[cell] = side;
  w.counts[prev]--;
  w.counts[side]++;
}

function run(w: World, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * SPS) && w.phase !== 'ended'; i++) stepWorld(w);
}


describe('slots', () => {
  it('Mod ids and glyphs are unique, and rarities are spread', () => {
    expect(mods.length).toBe(30);
    expect(new Set(mods.map((m) => m.id)).size).toBe(30);
    expect(new Set(mods.map((m) => m.glyph)).size).toBe(30);
    for (const m of mods) expect([...m.glyph].length, m.id).toBe(1);
    const count = (r: string) => mods.filter((m) => m.rarity === r).length;
    expect(count('common')).toBeGreaterThanOrEqual(10);
    expect(count('uncommon')).toBeGreaterThanOrEqual(9);
    expect(count('rare')).toBeGreaterThanOrEqual(6);
  });

  it('every Mod has text at every level', () => {
    for (const m of mods) for (const l of [1, 2, 3]) expect(m.text(l).length, `${m.id} L${l}`).toBeGreaterThan(10);
  });
});

describe('new Mods', () => {
  it('Compound boosts the Core on a timer', () => {
    const log: number[] = [];
    const w = world('compound', 2, {}, booster(log));
    run(w, 25);
    expect(log).toEqual([1.3, 1.3]);
  });

  it('Echo boosts on every third Core trigger', () => {
    const log: number[] = [];
    const w = world('echo', 3, {}, booster(log));
    for (let i = 0; i < 7; i++) w.contexts[0].triggered();
    expect(log).toEqual([1.12, 1.12]);
  });

  it('Hair Trigger lowers trigger thresholds', () => {
    expect(statValue(world('hair-trigger', 3).sides[0], 'triggerDiscount')).toBe(3);
  });

  it('Clash Engine turns a clash into extra hits', () => {
    const w = world('clash-engine', 2);
    hit(w, w.runners[0]!, 'clash');
    expect(w.sides[0].hits).toBe(1 + 2);
    hit(w, w.runners[0]!, 'wall');
    expect(w.sides[0].hits).toBe(4);
  });

  it('Wall Hugger captures the nearest enemy cells on a wall bounce', () => {
    const w = world('wall-hugger', 3);
    const before = w.counts[0];
    hit(w, w.runners[0]!, 'wall');
    expect(w.counts[0]).toBe(before + 4);
    hit(w, w.runners[0]!, 'clash');
    expect(w.counts[0]).toBe(before + 4);
  });

  it('Scorched Trail locks captured cells', () => {
    const w = world('scorched-trail', 1);
    const cell = w.owner.findIndex((o) => o === 1);
    w.contexts[0].captureCell(cell);
    expect(w.cellLockUntil[cell]).toBe(w.step + Math.round(0.5 * SPS));
    w.contexts[1].captureCell(cell);
    expect(w.owner[cell]).toBe(0);
  });

  it('Ramparts shield interior cells and respect the cap', () => {
    const w = world('ramparts', 1);
    clearRunners(w);
    run(w, 8.1);
    let shielded = 0;
    for (let i = 0; i < w.owner.length; i++) {
      if (w.owner[i] === 0 && w.cellShield[i]! > 0) {
        shielded++;
        expect(w.cellShield[i]).toBeLessThanOrEqual(1);
      }
    }
    expect(shielded).toBeGreaterThan(5);
  });

  it('Encircle flips an enemy cell surrounded by your cells', () => {
    const w = world('encircle', 1);
    clearRunners(w);
    const n = w.owner.findIndex((o, i) => o === 1 && w.arena.neighbors[i]!.length >= 3);
    const ns = w.arena.neighbors[n]!;
    for (const k of ns) setOwner(w, k, 0);
    setOwner(w, ns[0]!, 1);
    // n has one enemy neighbour (ns[0]), which we now take: n is surrounded and flips.
    w.contexts[0].captureCell(ns[0]!);
    expect(w.owner[n]).toBe(0);
  });

  it('Encircle level 3 reaches two steps and tolerates one enemy neighbour', () => {
    const w = world('encircle', 3);
    clearRunners(w);
    const n = w.owner.findIndex((o, i) => o === 1 && w.arena.neighbors[i]!.length >= 3);
    const ns = w.arena.neighbors[n]!;
    for (const k of ns) setOwner(w, k, 0);
    // One enemy neighbour that is not the cell we capture.
    const far = w.arena.neighbors[ns[0]!]!.find((c) => c !== n && !ns.includes(c))!;
    setOwner(w, far, 1);
    setOwner(w, ns[1]!, 1);
    w.contexts[0].captureCell(ns[1]!);
    expect(w.owner[n]).toBe(0);
  });

  it('Landmines mine a frontier cell and blast when it is taken', () => {
    const w = world('landmines', 1);
    clearRunners(w);
    run(w, 8.1);
    let mined = -1;
    for (let k = 0; k < 6; k++) if (w.sides[0].counters[100 + k]) mined = w.sides[0].counters[100 + k]! - 1;
    expect(mined).toBeGreaterThanOrEqual(0);
    expect(w.owner[mined]).toBe(0);
    w.events.length = 0;
    const before = w.counts[0];
    w.contexts[1].captureCell(mined);
    expect(w.events.some((e) => e.type === 'Blast')).toBe(true);
    expect(w.owner[mined]).toBe(0);
    expect(w.counts[0]).toBeGreaterThan(before);
  });

  it('Critical Mass blasts once when you reach the share', () => {
    const w = world('critical-mass', 1);
    const n = w.arena.cellCount;
    for (let i = 0; i < n && w.counts[0] < Math.floor(n * 0.65); i++) setOwner(w, i, 0);
    const cell = w.owner.findIndex((o) => o === 1);
    w.events.length = 0;
    w.contexts[0].captureCell(cell);
    expect(w.events.filter((e) => e.type === 'Blast').length).toBe(1);
    expect(w.sides[0].counters[slotOf('critical-mass')]).toBe(1);
    w.events.length = 0;
    w.contexts[0].captureCell(w.owner.findIndex((o) => o === 1));
    expect(w.events.some((e) => e.type === 'Blast')).toBe(false);
  });

  it('Underdog adds speed once while behind and removes it once when ahead', () => {
    const w = world('underdog', 1);
    clearRunners(w);
    place(w, 0, 500, 500, 1, 0);
    place(w, 1, 100, 100, 1, 0);
    const base = statValue(w.sides[0], 'speed');
    for (let i = 0; i < w.owner.length && w.counts[1] < 100; i++) setOwner(w, i, 1);
    run(w, 0.2);
    expect(statValue(w.sides[0], 'speed')).toBeCloseTo(base * 1.1, 6);
    run(w, 0.5);
    expect(statValue(w.sides[0], 'speed')).toBeCloseTo(base * 1.1, 6);
    for (let i = 0; i < w.owner.length && w.counts[0] < 110; i++) setOwner(w, i, 0);
    run(w, 0.2);
    expect(statValue(w.sides[0], 'speed')).toBeCloseTo(base, 6);
  });

  it('Buzzer Beater boosts only in the final 8 seconds', () => {
    const log: number[] = [];
    const w = world('buzzer-beater', 3, { twist: { durationSeconds: 12 } }, booster(log));
    run(w, 3.9);
    expect(log.length).toBe(0);
    run(w, 7);
    expect(log.length).toBeGreaterThanOrEqual(6);
    expect(log.every((f) => f === 1.15)).toBe(true);
  });

  it('Front Runner shields frontier cells only while ahead', () => {
    const w = world('front-runner', 1);
    clearRunners(w);
    run(w, 9.1);
    expect(w.cellShield.some((s) => s > 0)).toBe(false);
    for (let i = 0; i < w.owner.length && w.counts[0] < 110; i++) setOwner(w, i, 0);
    run(w, 9);
    let shielded = 0;
    for (let i = 0; i < w.owner.length; i++) if (w.owner[i] === 0 && w.cellShield[i]! > 0) shielded++;
    expect(shielded).toBeGreaterThan(0);
  });

  it('Comeback surges when you lose a lead you held', () => {
    const w = world('comeback', 2);
    clearRunners(w);
    place(w, 0, 500, 500, 1, 0);
    place(w, 1, 100, 100, 1, 0);
    for (let i = 0; i < w.owner.length && w.counts[0] < 100; i++) setOwner(w, i, 0);
    run(w, 0.1);
    expect(w.sides[0].surgeSteps).toBe(0);
    for (let i = 0; i < w.owner.length && w.counts[1] < 100; i++) setOwner(w, i, 1);
    run(w, 0.1);
    expect(w.sides[0].surgeMul).toBeCloseTo(1.3, 9);
    expect(w.sides[0].surgeSteps).toBeGreaterThan(2.5 * SPS);
  });

  it('Scavenger and Collector describe run effects', () => {
    expect(modById('scavenger').run!(3)).toEqual({ rerollsPerWin: 3 });
    expect(modById('collector').run!(1)).toEqual({ extraOffers: 1, bigWinMargin: 20 });
    expect(modById('collector').run!(3).bigWinMargin).toBe(10);
    expect(Object.keys(modById('scavenger').hooks).length).toBe(0);
  });

  it('Glass Cannon is fast and starts at 40%', () => {
    const w = world('glass-cannon', 1);
    expect(w.counts[0]).toBe(Math.round(w.arena.cellCount * 0.4));
    expect(statValue(w.sides[0], 'speed')).toBeCloseTo(tuning.runner.speed * 1.2, 6);
  });

  it('Decoy starts extra runners', () => {
    const w = world('decoy', 3);
    expect(w.sides[0].runnerCount).toBe(4);
    expect(w.runners.filter((r) => r.side === 0 && !r.primary).length).toBe(3);
  });

  it('Second Wind shields and surges once when you fall under 30%', () => {
    const w = world('second-wind', 2);
    const n = w.arena.cellCount;
    for (let i = 0; i < n && w.counts[0] > Math.ceil(n * 0.3); i++) setOwner(w, i, 1);
    expect(w.sides[0].shieldSteps).toBe(0);
    w.contexts[1].captureCell(w.owner.findIndex((o) => o === 0));
    expect(w.sides[0].shieldSteps).toBe(3 * SPS);
    expect(w.sides[0].surgeSteps).toBe(3 * SPS);
    w.sides[0].shieldSteps = 0;
    w.contexts[1].captureCell(w.owner.findIndex((o) => o === 0));
    expect(w.sides[0].shieldSteps).toBe(0);
  });

  it('Quick Hands readies the ultimate again after the delay, once at level 1', () => {
    const w = world('quick-hands', 1);
    clearRunners(w);
    expect(applyUltimate(w, 0)).toBe(true);
    expect(w.sides[0].ultimates).toBe(0);
    run(w, 11.5);
    expect(w.sides[0].ultimates).toBe(0);
    run(w, 1);
    expect(w.sides[0].ultimates).toBe(1);
    applyUltimate(w, 0);
    run(w, 14);
    expect(w.sides[0].ultimates).toBe(0);
  });

  it('Quick Hands level 3 works twice', () => {
    const w = world('quick-hands', 3);
    clearRunners(w);
    for (let k = 0; k < 2; k++) {
      expect(applyUltimate(w, 0)).toBe(true);
      run(w, 5.2);
      expect(w.sides[0].ultimates).toBe(1);
    }
    applyUltimate(w, 0);
    run(w, 7);
    expect(w.sides[0].ultimates).toBe(0);
  });

  it('Hoarder adds speed for each pickup grabbed', () => {
    const surge = [pickups.find((p) => p.id === 'surge')!];
    const w = world('hoarder', 3, { pickups: surge });
    clearRunners(w);
    place(w, 0, 500, 500, 1, 0);
    place(w, 1, 100, 100, 1, 0);
    w.pickups.push({ id: 99, def: 0, x: 507, y: 500, expiresStep: 10_000 });
    stepWorld(w);
    expect(w.sides[0].pickups).toBe(1);
    expect(statValue(w.sides[0], 'speed')).toBeCloseTo(tuning.runner.speed * 1.09, 6);
  });

  it('Mods never share a counter slot', () => {
    const seen = new Set<number>();
    for (const m of mods) {
      for (const bank of [0, 1]) {
        const s = slotOf(m.id, bank);
        expect(seen.has(s), m.id).toBe(false);
        seen.add(s);
      }
    }
  });
});

/** Mods that only change numbers or the run, or whose condition may never occur in a given match. */
const SILENT = new Set(['magnet', 'scavenger', 'collector']);
/** Conditional Mods: they must fire in at least one of a few seeds. */
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

describe('content matrix', () => {
  it('every Mod at levels 1 and 3 runs full matches with Ricochet and Splitter, and its trigger fires', () => {
    for (const m of mods) {
      for (const core of [ricochet, splitter]) {
        for (const level of [1, 3]) {
          let fired = 0;
          for (const seed of SEEDS) {
            runMatch({ seed, cores: [core, splitter], mods: [[{ mod: m, level }], []], controllers: [rival, rival], recordEvents: true }, (w) => {
              try {
                checkInvariants(w);
              } catch (err) {
                throw new Error(`${m.id} L${level} ${core.id} seed ${seed}: ${(err as Error).message}`, { cause: err });
              }
              for (const e of w.events) if (e.type === 'ModTriggered' && e.side === 0) fired++;
            });
            if (fired > 0 || SILENT.has(m.id)) break;
          }
          if (!SILENT.has(m.id)) expect(fired, `${m.id} L${level} with ${core.id}`).toBeGreaterThan(0);
        }
      }
    }
  }, 120_000);
});
