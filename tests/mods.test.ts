import { describe, expect, it } from 'vitest';
import { modById, mods } from '../src/content/mods';
import { tuning } from '../src/content/tuning';
import { offerMods, rivalBuild, takeMod, MAX_LEVEL, MAX_MODS } from '../src/run/draft';
import type { ModPick } from '../src/sim/abilities';
import { applyUltimate } from '../src/sim/input';
import { checkInvariants } from '../src/sim/invariants';
import { runMatch } from '../src/sim/match';
import { Rng } from '../src/sim/rng';
import { stepWorld } from '../src/sim/step';
import { createWorld } from '../src/sim/world';
import { blank, ricochet, splitter } from './helpers';

const rival = { kind: 'heuristic' as const, ...tuning.ai.rival };

describe('content matrix', () => {
  it('every Mod at every level runs a full match with each Core, and its trigger fires', () => {
    for (const m of mods) {
      for (const core of [ricochet, splitter]) {
        for (const level of [1, 2, 3]) {
          let fired = 0;
          const pick: ModPick[] = [{ mod: m, level }];
          runMatch({ seed: level, cores: [core, splitter], mods: [pick, []], controllers: [rival, rival], recordEvents: true }, (w) => {
            checkInvariants(w);
            for (const e of w.events) if (e.type === 'ModTriggered' && e.side === 0) fired++;
          });
          // Magnet changes reach silently; every other Mod announces itself.
          if (m.id !== 'magnet') expect(fired, `${m.id} L${level} with ${core.id}`).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('Mods', () => {
  it('fire in slot order after the Core', () => {
    const w = createWorld({
      seed: 1,
      cores: [ricochet, blank],
      mods: [[{ mod: modById('overclock'), level: 1 }, { mod: modById('head-start'), level: 1 }], []],
      recordEvents: true,
    });
    // Head Start's hits fired Ricochet first, then Overclock, on each hit.
    expect(w.sides[0].hits).toBe(3);
    expect(w.sides[0].stats.speed.add).toBeCloseTo(3 * 0.01 * tuning.runner.speed, 9);
  });

  it('Encore repeats the ultimate', () => {
    const w = createWorld({ seed: 1, cores: [splitter, blank], mods: [[{ mod: modById('encore'), level: 2 }], []], pickups: [] });
    applyUltimate(w, 0);
    for (let i = 0; i < 4 * 60; i++) stepWorld(w);
    // Three Bursts from a side with no splits: one split each.
    expect(w.sides[0].runnerCount).toBe(4);
  });

  it('interval Mods fire on schedule', () => {
    const w = createWorld({ seed: 1, cores: [blank, blank], mods: [[{ mod: modById('bulwark'), level: 1 }], []], recordEvents: true });
    let fired = 0;
    for (let i = 0; i < 21 * 60; i++) {
      stepWorld(w);
      fired += w.events.filter((e) => e.type === 'ModTriggered').length;
    }
    expect(fired).toBe(2);
  });
});

describe('draft', () => {
  it('offers distinct Mods and levels up owned ones up to the max', () => {
    const rng = new Rng(5);
    const offer = offerMods([], 1, 3, rng);
    expect(new Set(offer.map((m) => m.id)).size).toBe(3);
    let build: ModPick[] = [];
    const m = offer[0]!;
    for (let i = 0; i < 5; i++) build = takeMod(build, m);
    expect(build).toEqual([{ mod: m, level: MAX_LEVEL }]);
    expect(offerMods(build, 1, mods.length, rng).some((x) => x.id === m.id)).toBe(false);
  });

  it('only offers upgrades once the build is full', () => {
    const rng = new Rng(9);
    let build: ModPick[] = [];
    for (const m of mods.slice(0, MAX_MODS)) build = takeMod(build, m);
    for (const m of offerMods(build, 3, 3, rng)) expect(build.some((p) => p.mod.id === m.id)).toBe(true);
  });

  it('builds rivals with the asked number of picks', () => {
    const b = rivalBuild(4, 3, new Rng(2));
    expect(b.reduce((n, p) => n + p.level, 0)).toBe(4);
  });
});

describe('match-start events', () => {
  it('survive into the first step, so the HUD sees match-start Mods fire', () => {
    const w = createWorld({ seed: 1, cores: [ricochet, blank], mods: [[{ mod: modById('head-start'), level: 1 }], []], recordEvents: true });
    stepWorld(w);
    expect(w.events.some((e) => e.type === 'ModTriggered')).toBe(true);
  });
});
