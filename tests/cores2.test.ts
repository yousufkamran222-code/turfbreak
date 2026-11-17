import { describe, expect, it } from 'vitest';
import { bloom, cores, fortress, juggernaut, leech, phantom, pulse, ricochet, splitter } from '../src/content/cores';
import { frontierCells } from '../src/content/helpers';
import { tuning } from '../src/content/tuning';
import type { CoreDef } from '../src/sim/abilities';
import { applyUltimate, primaryOf } from '../src/sim/input';
import { checkInvariants } from '../src/sim/invariants';
import { runMatch } from '../src/sim/match';
import { stepWorld } from '../src/sim/step';
import { createWorld, statValue, type World } from '../src/sim/world';
import { blank } from './helpers';

const sps = tuning.sim.stepsPerSecond;
const rival = { kind: 'heuristic' as const, ...tuning.ai.rival };

function make(core: CoreDef, seed = 1, enemy: CoreDef = blank): World {
  return createWorld({ seed, cores: [core, enemy], pickups: [] });
}
function hits(w: World, n: number, kind: 'wall' | 'clash' = 'wall'): void {
  const r = primaryOf(w, 0)!;
  for (let i = 0; i < n; i++) w.sides[0].core.hooks.onHit?.(w.contexts[0], { runner: r, kind });
}
function steps(w: World, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * sps); i++) stepWorld(w);
}
/** Park the primary mid-map so blasts reach both territories. */
function centre(w: World): void {
  const r = primaryOf(w, 0)!;
  r.x = 500;
  r.y = 500;
}
const hue = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};

describe('Core roster', () => {
  it('has eight Cores with unique ids, colours, alt colours and shapes', () => {
    expect(cores).toHaveLength(8);
    for (const key of ['id', 'color', 'altColor', 'shape', 'colorName', 'altColorName'] as const) {
      expect(new Set(cores.map((c) => c[key])).size, key).toBe(8);
    }
    expect(new Set([...cores.map((c) => c.color), ...cores.map((c) => c.altColor)]).size).toBe(16);
  });

  it('keeps each Core colour at least 15 degrees of hue from every other', () => {
    for (const a of cores) {
      for (const b of cores) {
        if (a === b) continue;
        const d = Math.abs(hue(a.color) - hue(b.color));
        expect(Math.min(d, 360 - d), `${a.id} vs ${b.id}`).toBeGreaterThanOrEqual(15);
      }
    }
  });

  it('fills in every field the HUD and UI read', () => {
    for (const c of cores) {
      expect(c.colorName, c.id).toBe(c.colorName.toUpperCase());
      expect(c.altColorName, c.id).toBe(c.altColorName.toUpperCase());
      expect(c.signature.length, c.id).toBeGreaterThan(10);
      expect(c.stackLabel.length, c.id).toBeGreaterThan(0);
      expect(Object.keys(c.values).length, c.id).toBeGreaterThan(0);
      expect(c.ultimate.name.length, c.id).toBeGreaterThan(0);
      expect(c.ultimate.threshold, c.id).toBeGreaterThan(0);
      expect(c.hooks.onBoost, c.id).toBeTypeOf('function');
      expect(c.hooks.onUltimate, c.id).toBeTypeOf('function');
      const w = make(c);
      expect(Number.isFinite(c.ultimate.value(w, 0)), c.id).toBe(true);
    }
  });

  it('honours Hair Trigger style discounts on every "every N" Core', () => {
    const cases: [CoreDef, number, (w: World, n: number) => void][] = [
      [splitter, splitter.values.splitEvery!, (w, n) => hits(w, n)],
      [pulse, pulse.values.pulseEvery!, (w, n) => hits(w, n)],
    ];
    for (const [core, every, drive] of cases) {
      const w = make(core);
      w.contexts[0].addStat('triggerDiscount', every - 1);
      drive(w, 1);
      expect(w.sides[0].triggers, core.id).toBe(1);
    }
    const f = make(fortress);
    f.contexts[0].addStat('triggerDiscount', 1000);
    fortress.hooks.onCapture?.(f.contexts[0], 0);
    expect(f.sides[0].triggers).toBe(1);
    const j = make(juggernaut);
    j.contexts[0].addStat('triggerDiscount', 1000);
    const before = statValue(j.sides[0], 'captureRadius');
    juggernaut.hooks.onCapture?.(j.contexts[0], 0);
    expect(statValue(j.sides[0], 'captureRadius')).toBeGreaterThan(before);
  });
});

describe('Ricochet and Splitter boosts', () => {
  it('Ricochet onBoost multiplies the beam and keeps stacks in step', () => {
    const w = make(ricochet);
    const before = statValue(w.sides[0], 'beamLength');
    w.contexts[0].boostCore(1.5);
    expect(statValue(w.sides[0], 'beamLength')).toBeCloseTo(before * 1.5, 9);
    expect(w.sides[0].stacks).toBeCloseTo(statValue(w.sides[0], 'beamLength'), 9);
  });

  it('Splitter onBoost spawns max(1, floor(splits x (f - 1))) splits', () => {
    const w = make(splitter);
    w.contexts[0].boostCore(1.2);
    expect(w.sides[0].runnerCount).toBe(2);
    const r = primaryOf(w, 0)!;
    for (let i = 0; i < 9; i++) w.contexts[0].spawnRunner(r, { radiusMul: 0.7, speedMul: 0.7 });
    const had = w.sides[0].runnerCount - 1;
    w.contexts[0].boostCore(1.5);
    expect(w.sides[0].runnerCount - 1).toBe(had + Math.floor(had * 0.5));
  });
});

describe('Pulse', () => {
  it('fires a shockwave every N hits and the radius grows each pulse', () => {
    const v = pulse.values;
    const w = make(pulse);
    centre(w);
    expect(w.sides[0].stacks).toBe(v.startRadius);
    hits(w, v.pulseEvery! - 1);
    expect(w.sides[0].triggers).toBe(0);
    const before = w.counts[0];
    hits(w, 1);
    expect(w.sides[0].triggers).toBe(1);
    expect(w.counts[0]).toBeGreaterThan(before);
    expect(w.sides[0].stacks).toBe(v.startRadius! + v.radiusPerPulse!);
  });

  it('caps the pulse radius', () => {
    const v = pulse.values;
    const w = make(pulse);
    hits(w, v.pulseEvery! * 100);
    expect(w.sides[0].stacks).toBe(v.maxRadius);
  });

  it('Nova captures more than a pulse', () => {
    const a = make(pulse);
    centre(a);
    hits(a, pulse.values.pulseEvery!);
    const b = make(pulse);
    centre(b);
    applyUltimate(b, 0);
    expect(b.counts[0]).toBeGreaterThanOrEqual(a.counts[0]);
    expect(b.sides[0].triggers).toBe(1);
  });

  it('onBoost multiplies the radius', () => {
    const w = make(pulse);
    w.contexts[0].boostCore(1.2);
    expect(w.sides[0].stacks).toBe(Math.round(pulse.values.startRadius! * 1.2));
  });
});

describe('Bloom', () => {
  function frontier(w: World): number {
    const f = frontierCells(w, 0);
    expect(f.length).toBeGreaterThan(0);
    return f[0]!;
  }

  it('spreads a captured cell into an adjacent enemy cell after the delay', () => {
    const w = make(bloom);
    w.contexts[0].setCounter(0, 1);
    const cell = frontier(w);
    bloom.hooks.onCapture?.(w.contexts[0], cell);
    steps(w, bloom.values.spreadDelay! - 0.5);
    expect(w.sides[0].triggers).toBe(0);
    steps(w, 1);
    expect(w.sides[0].triggers).toBe(1);
  });

  it('the chance grows per capture and stops at the cap', () => {
    const w = make(bloom);
    const start = w.contexts[0].counter(0);
    expect(start).toBeCloseTo(bloom.values.startChance!, 9);
    for (let i = 0; i < 2000; i++) bloom.hooks.onCapture?.(w.contexts[0], 0);
    expect(w.contexts[0].counter(0)).toBeCloseTo(bloom.values.maxChance!, 9);
    expect(w.sides[0].stacks).toBe(Math.round(bloom.values.maxChance! * 100));
  });

  it('Overgrowth spreads every frontier cell at once', () => {
    const w = make(bloom);
    const n = frontierCells(w, 0).length;
    const before = w.counts[0];
    applyUltimate(w, 0);
    expect(w.counts[0]).toBeGreaterThanOrEqual(before + Math.floor(n / 2));
    expect(w.sides[0].triggers).toBe(1);
  });

  it('onBoost scales the chance but not past the boost cap', () => {
    const w = make(bloom);
    w.contexts[0].boostCore(1.5);
    expect(w.contexts[0].counter(0)).toBeCloseTo(bloom.values.startChance! * 1.5, 9);
    w.contexts[0].boostCore(100);
    expect(w.contexts[0].counter(0)).toBeCloseTo(bloom.values.boostCap!, 9);
  });
});

describe('Fortress', () => {
  const shields = (w: World): number => {
    let n = 0;
    for (let i = 0; i < w.arena.cellCount; i++) if (w.owner[i] === 0) n += w.cellShield[i]!;
    return n;
  };

  it('shields the whole territory every N captures, up to the cap per cell', () => {
    const w = make(fortress);
    const every = fortress.values.shieldEvery!;
    for (let i = 0; i < every - 1; i++) fortress.hooks.onCapture?.(w.contexts[0], 0);
    expect(shields(w)).toBe(0);
    fortress.hooks.onCapture?.(w.contexts[0], 0);
    expect(shields(w)).toBe(w.counts[0]);
    expect(w.sides[0].triggers).toBe(1);
    for (let i = 0; i < every * 6; i++) fortress.hooks.onCapture?.(w.contexts[0], 0);
    expect(shields(w)).toBe(w.counts[0] * fortress.values.cellCap!);
  });

  it('Bastion adds shields and locks every cell', () => {
    const w = make(fortress);
    applyUltimate(w, 0);
    expect(shields(w)).toBe(w.counts[0] * fortress.values.bastionPoints!);
    const owned = w.owner.findIndex((o) => o === 0);
    expect(w.cellLockUntil[owned]!).toBeGreaterThan(w.step);
    expect(w.sides[0].triggers).toBe(1);
  });

  it('onBoost grants a shield wave now', () => {
    const w = make(fortress);
    w.contexts[0].boostCore(1.2);
    expect(shields(w)).toBe(w.counts[0]);
  });
});

describe('Phantom', () => {
  it('jumps to the enemy cell furthest from any runner and blasts it', () => {
    const w = make(phantom);
    const r = primaryOf(w, 0)!;
    const before = w.counts[0];
    steps(w, phantom.values.startInterval! + 0.5);
    expect(w.sides[0].triggers).toBeGreaterThanOrEqual(1);
    expect(w.sides[0].stacks).toBeGreaterThanOrEqual(1);
    expect(w.counts[0]).toBeGreaterThan(before - 5);
    expect(r.x).toBeGreaterThan(0);
  });

  it('jumps come sooner each time and never below the floor', () => {
    const w = make(phantom);
    steps(w, 60);
    const jumps = w.sides[0].stacks;
    expect(jumps).toBeGreaterThan(Math.floor(60 / phantom.values.startInterval!));
    expect(w.contexts[0].counter(0)).toBeGreaterThanOrEqual(phantom.values.minInterval!);
  });

  it('Blink Storm makes several quick jumps', () => {
    const w = make(phantom);
    applyUltimate(w, 0);
    steps(w, phantom.values.stormJumps! * phantom.values.stormGap! + 0.2);
    expect(w.sides[0].stacks).toBeGreaterThanOrEqual(phantom.values.stormJumps!);
  });

  it('onBoost divides the interval, with a floor', () => {
    const w = make(phantom);
    w.contexts[0].boostCore(2);
    expect(w.contexts[0].counter(0)).toBeCloseTo(phantom.values.startInterval! / 2, 9);
    w.contexts[0].boostCore(1000);
    expect(w.contexts[0].counter(0)).toBeCloseTo(phantom.values.boostFloor!, 9);
  });
});

describe('Juggernaut', () => {
  it('starts with a capture radius, grows it every N captures by less each time, and slows', () => {
    const v = juggernaut.values;
    const w = make(juggernaut);
    const base = statValue(w.sides[0], 'captureRadius');
    expect(base).toBe(v.startRadius);
    const speed0 = statValue(w.sides[0], 'speed');
    for (let i = 0; i < v.growEvery!; i++) juggernaut.hooks.onCapture?.(w.contexts[0], 0);
    const one = statValue(w.sides[0], 'captureRadius');
    expect(one).toBeCloseTo(base + v.radiusGrow!, 9);
    for (let i = 0; i < v.growEvery!; i++) juggernaut.hooks.onCapture?.(w.contexts[0], 0);
    expect(statValue(w.sides[0], 'captureRadius') - one).toBeLessThan(v.radiusGrow!);
    expect(statValue(w.sides[0], 'speed')).toBeLessThan(speed0);
    expect(w.sides[0].stacks).toBe(Math.round(statValue(w.sides[0], 'captureRadius')));
  });

  it('never grows past its maximum or slows past its minimum', () => {
    const v = juggernaut.values;
    const w = make(juggernaut);
    for (let i = 0; i < v.growEvery! * 500; i++) juggernaut.hooks.onCapture?.(w.contexts[0], 0);
    expect(statValue(w.sides[0], 'captureRadius')).toBeLessThanOrEqual(v.maxRadius!);
    expect(statValue(w.sides[0], 'speed')).toBeGreaterThanOrEqual(tuning.runner.speed * v.minSpeedMul! - 1e-6);
  });

  it('Stampede boosts radius and speed, then wears off', () => {
    const v = juggernaut.values;
    const w = make(juggernaut);
    const base = statValue(w.sides[0], 'captureRadius');
    applyUltimate(w, 0);
    expect(statValue(w.sides[0], 'captureRadius')).toBeCloseTo(base * v.stampedeRadius!, 9);
    expect(w.sides[0].surgeSteps).toBeGreaterThan(0);
    steps(w, v.stampedeSeconds! + 0.5);
    expect(w.sides[0].stats.captureRadius.mul).toBeCloseTo(1, 9);
  });

  it('onBoost multiplies the capture radius', () => {
    const w = make(juggernaut);
    const base = statValue(w.sides[0], 'captureRadius');
    w.contexts[0].boostCore(1.3);
    expect(statValue(w.sides[0], 'captureRadius')).toBeCloseTo(base * 1.3, 9);
  });
});

describe('Leech', () => {
  it('steers the primary toward the enemy primary', () => {
    const w = make(leech);
    const r = primaryOf(w, 0)!;
    const e = primaryOf(w, 1)!;
    r.x = 300;
    r.y = 500;
    e.x = 700;
    e.y = 900;
    r.dx = 1;
    r.dy = 0;
    leech.hooks.onStep?.(w.contexts[0]);
    expect(r.dy).toBeGreaterThan(0);
    expect(Math.hypot(r.dx, r.dy)).toBeCloseTo(1, 6);
  });

  it('a clash gives permanent speed and slows the enemy; a wall bounce does nothing', () => {
    const w = make(leech);
    const speed0 = statValue(w.sides[0], 'speed');
    hits(w, 3, 'wall');
    expect(statValue(w.sides[0], 'speed')).toBe(speed0);
    hits(w, 1, 'clash');
    expect(statValue(w.sides[0], 'speed')).toBeCloseTo(speed0 + tuning.runner.speed * leech.values.speedPerClash!, 9);
    expect(w.sides[1].slowSteps).toBeGreaterThan(0);
    expect(w.sides[0].stacks).toBe(1);
    expect(w.sides[0].triggers).toBe(1);
  });

  it('Drain captures the cells nearest the enemy primary and slows the enemy', () => {
    const w = make(leech);
    const e = primaryOf(w, 1)!;
    e.x = 250;
    e.y = 500;
    const before = w.counts[0];
    applyUltimate(w, 0);
    expect(w.counts[0]).toBeGreaterThan(before);
    expect(w.counts[0] - before).toBeLessThanOrEqual(leech.values.drainCells!);
    expect(w.sides[1].slowSteps).toBeGreaterThan(0);
  });

  it('onBoost grows the speed stacks', () => {
    const w = make(leech);
    hits(w, 4, 'clash');
    const speed = statValue(w.sides[0], 'speed');
    const stacks = w.sides[0].stacks;
    w.contexts[0].boostCore(1.5);
    expect(w.sides[0].stacks).toBeCloseTo(stacks * 1.5, 9);
    expect(statValue(w.sides[0], 'speed')).toBeGreaterThan(speed);
  });
});

describe('every Core against every Core', () => {
  it('plays full matches with the invariants intact', () => {
    for (const a of cores) {
      for (const b of cores) {
        for (const seed of [1, 2]) {
          let n = 0;
          const r = runMatch({ seed, cores: [a, b], controllers: [rival, rival] }, (w) => {
            checkInvariants(w);
            n++;
          });
          expect(n, `${a.id} vs ${b.id}`).toBeGreaterThan(sps * 30);
          expect(r.winner === 0 || r.winner === 1).toBe(true);
        }
      }
    }
  });

  it('every Core announces its signature during a match', () => {
    for (const c of cores) {
      const r = runMatch({ seed: 5, cores: [c, ricochet === c ? splitter : ricochet], controllers: [rival, rival] });
      expect(r.hits[0] + r.ultimates[0]).toBeGreaterThan(0);
    }
  });
});
