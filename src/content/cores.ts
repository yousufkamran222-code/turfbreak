import type { AbilityContext, CoreDef } from '../sim/abilities';
import { primaryOf } from '../sim/input';
import { statValue, type SideIndex, type World } from '../sim/world';
import { enemyCellsWithin, frontierCells, loneliestEnemyCell, nearestEnemyCells } from './helpers';
import { tuning } from './tuning';

/** A Core's "every N" threshold after Hair Trigger style discounts, never below 1. */
function threshold(ctx: AbilityContext, n: number): number {
  return Math.max(1, n - statValue(ctx.world.sides[ctx.side], 'triggerDiscount'));
}

/** Set the HUD counter to `v`. */
function setStacks(ctx: AbilityContext, v: number): void {
  ctx.addStacks(v - ctx.stacks());
}

/** Count one more toward an "every N" threshold in counter `slot`; true (and reset) when it is reached. */
function tick(ctx: AbilityContext, slot: number, every: number): boolean {
  const n = ctx.counter(slot) + 1;
  if (n < threshold(ctx, every)) {
    ctx.setCounter(slot, n);
    return false;
  }
  ctx.setCounter(slot, 0);
  return true;
}

/** Enemy cells whose centre lies within `radius` of the side's primary runner. */
function enemyCellsNear(world: Readonly<World>, side: SideIndex, radius: number): number {
  const r = primaryOf(world as World, side);
  if (!r) return 0;
  const c = world.arena.centroids;
  let n = 0;
  for (let i = 0; i < world.arena.cellCount; i++) {
    if (world.owner[i] === side) continue;
    const dx = c[i * 2]! - r.x;
    const dy = c[i * 2 + 1]! - r.y;
    if (dx * dx + dy * dy <= radius * radius) n++;
  }
  return n;
}

const ricochetValues = {
  /** Beam length at match start. */
  startBeam: 60,
  /** Beam length gained per hit. */
  beamPerHit: 11,
  /** 1 = after every hit the beam swings back to trailing, sweeping the turn. 0 = it snaps. */
  swingOnHit: 1,
  /** Full turns the beam spins on the ultimate, and its reach while spinning. */
  spinTurns: 1,
  spinReach: 300,
};

/**
 * Trails a beam that captures every cell it covers. After each hit the beam swings back to
 * trail behind, sweeping the turn. Its ultimate, Spin, sweeps full circles.
 */
export const ricochet: CoreDef = {
  id: 'ricochet',
  name: 'Ricochet',
  colorName: 'CRIMSON',
  color: '#ff3355',
  altColorName: 'LEMON',
  altColor: '#f2ee5a',
  shape: 'diamond',
  signature: `Trails a beam that sweeps cells as it swings after each bounce. The beam grows ${ricochetValues.beamPerHit} per hit.`,
  stackLabel: 'Beam',
  values: ricochetValues,
  ultimate: {
    name: 'Spin',
    description: `Your beam spins a full circle (up to ${ricochetValues.spinReach} long), capturing everything it sweeps.`,
    // Worth it when many enemy cells sit inside the circle the beam would sweep.
    value: (world, side) => enemyCellsNear(world, side, Math.min(ricochetValues.spinReach, statValue(world.sides[side], 'beamLength'))),
    threshold: 22,
  },
  hooks: {
    onUltimate(ctx) {
      ctx.spinBeam(ricochetValues.spinTurns, ricochetValues.spinReach);
      ctx.triggered();
    },
    onMatchStart(ctx) {
      ctx.addStacks(ricochetValues.startBeam);
      ctx.addStat('beamLength', ricochetValues.startBeam);
    },
    onBoost(ctx, f) {
      const extra = statValue(ctx.world.sides[ctx.side], 'beamLength') * (f - 1);
      ctx.addStacks(extra);
      ctx.addStat('beamLength', extra);
    },
    onHit(ctx) {
      ctx.addStacks(ricochetValues.beamPerHit);
      ctx.addStat('beamLength', ricochetValues.beamPerHit);
      if (ricochetValues.swingOnHit) ctx.swingBeam();
      ctx.triggered();
    },
  },
};

const splitterValues = {
  /** Hits needed per split. */
  splitEvery: 12,
  /** Split size relative to the primary. */
  splitRadius: 0.75,
  /** Split speed relative to the primary. */
  splitSpeed: 0.5,
  /** Burst spawns one split for every this many splits you already have (at least one). */
  burstPer: 3,
  /** Controllers fire Burst once you have this many splits. */
  burstAtSplits: 3,
};

/** Every few hits, spawns a smaller permanent split. Slow, then explosive. */
export const splitter: CoreDef = {
  id: 'splitter',
  name: 'Splitter',
  colorName: 'MAGENTA',
  color: '#d24dff',
  altColorName: 'SKY',
  altColor: '#5ab4ff',
  shape: 'hexagon',
  signature: `Every ${splitterValues.splitEvery} hits, spawns a smaller permanent split.`,
  stackLabel: 'Splits',
  values: splitterValues,
  ultimate: {
    name: 'Burst',
    description: `Instantly spawns one split for every ${splitterValues.burstPer} you have (at least one).`,
    // Burst scales with the splits already out, so it is worth waiting for.
    value: (world, side) => world.sides[side].runnerCount - 1,
    threshold: splitterValues.burstAtSplits,
  },
  hooks: {
    onUltimate(ctx) {
      const r = ctx.primary();
      if (!r) return;
      const n = Math.max(1, Math.floor((ctx.world.sides[ctx.side].runnerCount - 1) / splitterValues.burstPer));
      for (let i = 0; i < n; i++) {
        if (ctx.spawnRunner(r, { radiusMul: splitterValues.splitRadius, speedMul: splitterValues.splitSpeed })) ctx.addStacks(1);
      }
      ctx.triggered();
    },
    onBoost(ctx, f) {
      const r = ctx.primary();
      if (!r) return;
      // Fractional splits accumulate in counter 1, so small boosts are worth a small share of a split.
      const owed = ctx.counter(1) + Math.max(2, ctx.world.sides[ctx.side].runnerCount - 1) * (f - 1);
      const n = Math.floor(owed);
      ctx.setCounter(1, owed - n);
      for (let i = 0; i < n; i++) {
        if (ctx.spawnRunner(r, { radiusMul: splitterValues.splitRadius, speedMul: splitterValues.splitSpeed })) ctx.addStacks(1);
      }
    },
    onHit(ctx, hit) {
      if (!tick(ctx, 0, splitterValues.splitEvery)) return;
      ctx.spawnRunner(hit.runner, { radiusMul: splitterValues.splitRadius, speedMul: splitterValues.splitSpeed });
      ctx.addStacks(1);
      ctx.triggered();
    },
  },
};

const pulseValues = {
  /** Hits needed per shockwave. */
  pulseEvery: 5,
  /** Shockwave radius at match start, gained per pulse, and its cap (a boost may go past it up to `boostCap`). */
  startRadius: 420,
  radiusPerPulse: 80,
  maxRadius: 500,
  boostCap: 900,
  /** Nova is one shockwave at this multiple of the radius. */
  novaMul: 2.2,
  novaThreshold: 45,
};

/** Every few hits, a shockwave captures everything around the runner. The radius grows each pulse. */
export const pulse: CoreDef = {
  id: 'pulse',
  name: 'Pulse',
  colorName: 'CYAN',
  color: '#2fe0ff',
  altColorName: 'ROSE',
  altColor: '#ff7ab8',
  shape: 'circle',
  signature: `Every ${pulseValues.pulseEvery} hits, a shockwave captures everything within ${pulseValues.startRadius}. The radius grows ${pulseValues.radiusPerPulse} per pulse.`,
  stackLabel: 'Radius',
  values: pulseValues,
  ultimate: {
    name: 'Nova',
    description: `One shockwave at ${pulseValues.novaMul}× your pulse radius.`,
    value: (world, side) => enemyCellsNear(world, side, world.sides[side].stacks * pulseValues.novaMul),
    threshold: pulseValues.novaThreshold,
  },
  hooks: {
    onMatchStart(ctx) {
      setStacks(ctx, pulseValues.startRadius);
    },
    onHit(ctx, hit) {
      if (!tick(ctx, 0, pulseValues.pulseEvery)) return;
      ctx.blast(hit.runner.x, hit.runner.y, ctx.stacks());
      setStacks(ctx, Math.max(ctx.stacks(), Math.min(pulseValues.maxRadius, ctx.stacks() + pulseValues.radiusPerPulse)));
      ctx.triggered();
    },
    onUltimate(ctx) {
      const r = ctx.primary();
      if (!r) return;
      ctx.blast(r.x, r.y, ctx.stacks() * pulseValues.novaMul);
      ctx.triggered();
    },
    onBoost(ctx, f) {
      setStacks(ctx, Math.max(ctx.stacks(), Math.min(pulseValues.boostCap, Math.round(ctx.stacks() * f))));
    },
  },
};

const bloomValues = {
  /** Seconds before a captured cell spreads. */
  spreadDelay: 2,
  /** Spread chance at match start, gained per capture, and its cap (boosts may reach `boostCap`). */
  startChance: 0.56,
  chancePerCapture: 0.006,
  maxChance: 0.8,
  boostCap: 0.9,
  /** Controllers fire Overgrowth once the frontier is at least this many cells long. */
  overgrowthThreshold: 26,
  /** Overgrowth spreads the whole frontier this many times, this far apart. */
  overgrowthWaves: 2,
  overgrowthGap: 0.6,
};

/** Spread one captured cell into an adjacent enemy cell, if it is still ours. */
function bloomSpread(ctx: AbilityContext, cell: number): boolean {
  const w = ctx.world;
  if (w.owner[cell] !== ctx.side) return false;
  const ns = w.arena.neighbors[cell]!;
  let count = 0;
  for (let k = 0; k < ns.length; k++) if (w.owner[ns[k]!] === ctx.enemy) count++;
  if (count === 0) return false;
  let pick = ctx.rng.int(count);
  for (let k = 0; k < ns.length; k++) {
    const nb = ns[k]!;
    if (w.owner[nb] !== ctx.enemy) continue;
    if (pick-- > 0) continue;
    ctx.captureCell(nb);
    return w.owner[nb] === ctx.side;
  }
  return false;
}

function setBloomChance(ctx: AbilityContext, chance: number): void {
  ctx.setCounter(0, chance);
  setStacks(ctx, Math.round(chance * 100));
}

/** Captured cells may spread into a neighbouring enemy cell a moment later. The chance grows per capture. */
export const bloom: CoreDef = {
  id: 'bloom',
  name: 'Bloom',
  colorName: 'GREEN',
  color: '#4fe36a',
  altColorName: 'PEARL',
  altColor: '#e6e6f0',
  shape: 'pentagon',
  signature: `Cells you capture spread into one adjacent enemy cell after ${bloomValues.spreadDelay} s, with a ${Math.round(bloomValues.startChance * 100)}% chance that grows per capture (up to ${Math.round(bloomValues.maxChance * 100)}%).`,
  stackLabel: 'Spread %',
  values: bloomValues,
  ultimate: {
    name: 'Overgrowth',
    description: `Your whole frontier spreads into enemy neighbours, ${bloomValues.overgrowthWaves} times in quick succession.`,
    value: (world, side) => frontierCells(world, side).length,
    threshold: bloomValues.overgrowthThreshold,
  },
  hooks: {
    onMatchStart(ctx) {
      setBloomChance(ctx, bloomValues.startChance);
    },
    onCapture(ctx, cell) {
      const c = ctx.counter(0);
      if (c < bloomValues.maxChance) setBloomChance(ctx, Math.min(bloomValues.maxChance, c + bloomValues.chancePerCapture));
      if (ctx.rng.next() >= ctx.counter(0)) return;
      ctx.after(bloomValues.spreadDelay, (c2) => {
        if (bloomSpread(c2, cell)) c2.triggered();
      });
    },
    onUltimate(ctx) {
      const wave = (c: AbilityContext): void => {
        for (const cell of frontierCells(c.world, c.side)) bloomSpread(c, cell);
        c.triggered();
      };
      wave(ctx);
      for (let i = 1; i < bloomValues.overgrowthWaves; i++) ctx.after(bloomValues.overgrowthGap * i, wave);
    },
    onBoost(ctx, f) {
      setBloomChance(ctx, Math.max(ctx.counter(0), Math.min(bloomValues.boostCap, ctx.counter(0) * f)));
    },
  },
};

const fortressValues = {
  /** Captures needed per shield wave. */
  shieldEvery: 155,
  /** A wave adds one shield point to each of your cells below this many. */
  cellCap: 1,
  /** Bastion: shield points on every cell, and seconds your cells cannot be taken. */
  bastionPoints: 2,
  bastionSeconds: 3,
  /** Controllers fire Bastion once ahead by this many cells. */
  bastionLead: 16,
};

/** One shield point on each own cell below the cap. */
function fortressWave(ctx: AbilityContext): void {
  const w = ctx.world;
  const cells: number[] = [];
  for (let i = 0; i < w.arena.cellCount; i++) if (w.owner[i] === ctx.side && w.cellShield[i]! < fortressValues.cellCap) cells.push(i);
  ctx.shieldCells(cells, 1);
  ctx.addStacks(1);
}

/** Every few captures, all its territory gains a shield point. Slow to take, slow to lose. */
export const fortress: CoreDef = {
  id: 'fortress',
  name: 'Fortress',
  colorName: 'GOLD',
  color: '#ffc53d',
  altColorName: 'COBALT',
  altColor: '#5a74ff',
  shape: 'square',
  signature: `Every ${fortressValues.shieldEvery} captures, every cell you own gains a shield point (up to ${fortressValues.cellCap} per cell).`,
  stackLabel: 'Shields',
  values: fortressValues,
  ultimate: {
    name: 'Bastion',
    description: `+${fortressValues.bastionPoints} shield on every cell you own, and none can be taken for ${fortressValues.bastionSeconds} s.`,
    value: (world, side) => world.counts[side] - world.counts[side === 0 ? 1 : 0],
    threshold: fortressValues.bastionLead,
  },
  hooks: {
    onCapture(ctx) {
      if (!tick(ctx, 0, fortressValues.shieldEvery)) return;
      fortressWave(ctx);
      ctx.triggered();
    },
    onUltimate(ctx) {
      const w = ctx.world;
      const own: number[] = [];
      for (let i = 0; i < w.arena.cellCount; i++) if (w.owner[i] === ctx.side) own.push(i);
      ctx.shieldCells(own, fortressValues.bastionPoints);
      ctx.lockCells(own, fortressValues.bastionSeconds);
      ctx.triggered();
    },
    onBoost(ctx) {
      fortressWave(ctx);
    },
  },
};

const phantomValues = {
  /** Seconds between jumps at match start, taken off per jump, and the floor (boosts may go to `boostFloor`). */
  startInterval: 5,
  intervalStep: 0.65,
  minInterval: 2,
  boostFloor: 1.5,
  /** Radius captured where it lands. */
  blastRadius: 200,
  /** Blink Storm: jumps and the seconds between them. */
  stormJumps: 4,
  stormGap: 0.4,
  /** Controllers fire Blink Storm once the enemy holds this many cells. */
  stormThreshold: 95,
};

/** Jump the primary to the loneliest enemy cell and blast around it. */
function phantomJump(ctx: AbilityContext): void {
  const r = ctx.primary();
  const cell = loneliestEnemyCell(ctx.world, ctx.side);
  if (!r || cell < 0) return;
  const c = ctx.world.arena.centroids;
  ctx.teleport(r, c[cell * 2]!, c[cell * 2 + 1]!);
  ctx.blast(r.x, r.y, phantomValues.blastRadius);
  ctx.addStacks(1);
  ctx.triggered();
}

/** Counter 0 holds the current interval. Each jump shortens it and schedules the next. */
function phantomSchedule(ctx: AbilityContext): void {
  ctx.after(ctx.counter(0), (c) => {
    phantomJump(c);
    c.setCounter(0, Math.min(c.counter(0), Math.max(phantomValues.minInterval, c.counter(0) - phantomValues.intervalStep)));
    phantomSchedule(c);
  });
}

/** Every few seconds, teleports to the enemy cell furthest from any runner and blasts it. Jumps come faster each time. */
export const phantom: CoreDef = {
  id: 'phantom',
  name: 'Phantom',
  colorName: 'VIOLET',
  color: '#9a6bff',
  altColorName: 'MINT',
  altColor: '#a8ffcf',
  shape: 'triangle',
  signature: `Every ${phantomValues.startInterval} s, teleports to the enemy cell furthest from any runner and captures within ${phantomValues.blastRadius}. Each jump comes ${phantomValues.intervalStep} s sooner (down to ${phantomValues.minInterval} s).`,
  stackLabel: 'Jumps',
  values: phantomValues,
  ultimate: {
    name: 'Blink Storm',
    description: `${phantomValues.stormJumps} jumps in quick succession.`,
    value: (world, side) => world.counts[side === 0 ? 1 : 0],
    threshold: phantomValues.stormThreshold,
  },
  hooks: {
    onMatchStart(ctx) {
      ctx.setCounter(0, phantomValues.startInterval);
      phantomSchedule(ctx);
    },
    onUltimate(ctx) {
      phantomJump(ctx);
      for (let k = 1; k < phantomValues.stormJumps; k++) ctx.after(k * phantomValues.stormGap, phantomJump);
    },
    onBoost(ctx, f) {
      ctx.setCounter(0, Math.min(ctx.counter(0), Math.max(phantomValues.boostFloor, ctx.counter(0) / f)));
    },
  },
};

const juggernautValues = {
  /** Capture radius at match start. */
  startRadius: 20,
  /** Captures per growth; the first growth adds `radiusGrow`, each later one `growDecay` times the last. */
  growEvery: 8,
  radiusGrow: 10,
  growDecay: 0.91,
  /** Hard cap on capture radius, boosts included. */
  maxRadius: 220,
  /** Speed multiplier per growth, down to `minSpeedMul` of base. */
  speedPerGrow: 0.98,
  minSpeedMul: 0.7,
  /** Stampede: speed multiplier, capture radius multiplier and seconds. */
  stampedeSpeed: 2,
  stampedeRadius: 1.5,
  stampedeSeconds: 4.5,
  /** Controllers fire Stampede when this many enemy cells lie within `stampedeReach`. */
  stampedeReach: 260,
  stampedeThreshold: 30,
};

function syncJuggernaut(ctx: AbilityContext): void {
  setStacks(ctx, Math.round(statValue(ctx.world.sides[ctx.side], 'captureRadius')));
}

/** Grows its capture radius as it eats; slows a little as it grows. */
export const juggernaut: CoreDef = {
  id: 'juggernaut',
  name: 'Juggernaut',
  colorName: 'ORANGE',
  color: '#ff7a1f',
  altColorName: 'LIME',
  altColor: '#a6e22d',
  shape: 'octagon',
  signature: `Captures everything within ${juggernautValues.startRadius}. Every ${juggernautValues.growEvery} captures the radius grows (by less each time) and it slows slightly.`,
  stackLabel: 'Size',
  values: juggernautValues,
  ultimate: {
    name: 'Stampede',
    description: `Double speed and +${Math.round((juggernautValues.stampedeRadius - 1) * 100)}% capture radius for ${juggernautValues.stampedeSeconds} s.`,
    value: (world, side) => enemyCellsNear(world, side, juggernautValues.stampedeReach),
    threshold: juggernautValues.stampedeThreshold,
  },
  hooks: {
    onMatchStart(ctx) {
      ctx.addStat('captureRadius', juggernautValues.startRadius);
      // Counter 1: next growth amount. Counter 2: speed multiplier applied so far.
      ctx.setCounter(1, juggernautValues.radiusGrow);
      ctx.setCounter(2, 1);
      syncJuggernaut(ctx);
    },
    onCapture(ctx) {
      if (!tick(ctx, 0, juggernautValues.growEvery)) return;
      const now = statValue(ctx.world.sides[ctx.side], 'captureRadius');
      const grow = Math.min(ctx.counter(1), Math.max(0, juggernautValues.maxRadius - now));
      ctx.setCounter(1, ctx.counter(1) * juggernautValues.growDecay);
      if (grow <= 0) return;
      ctx.addStat('captureRadius', grow);
      if (ctx.counter(2) * juggernautValues.speedPerGrow >= juggernautValues.minSpeedMul) {
        ctx.mulStat('speed', juggernautValues.speedPerGrow);
        ctx.setCounter(2, ctx.counter(2) * juggernautValues.speedPerGrow);
      }
      syncJuggernaut(ctx);
      ctx.triggered();
    },
    onUltimate(ctx) {
      const v = juggernautValues;
      ctx.surge(v.stampedeSpeed, v.stampedeSeconds);
      ctx.mulStat('captureRadius', v.stampedeRadius);
      syncJuggernaut(ctx);
      ctx.after(v.stampedeSeconds, (c) => {
        c.mulStat('captureRadius', 1 / v.stampedeRadius);
        syncJuggernaut(c);
      });
      ctx.triggered();
    },
    onBoost(ctx, f) {
      const now = statValue(ctx.world.sides[ctx.side], 'captureRadius');
      if (now <= 0) return;
      ctx.mulStat('captureRadius', Math.max(1, Math.min(f, juggernautValues.maxRadius / now)));
      syncJuggernaut(ctx);
    },
  },
};

const leechValues = {
  /** Radians per second it turns toward the enemy primary. */
  steerPerSecond: 1.6,
  /** Permanent speed per clash, as a share of base speed. */
  speedPerClash: 0.11,
  /** On a clash the enemy moves at this speed for this long. */
  slowMul: 0.75,
  slowSeconds: 0.8,
  /** Drain: enemy cells taken nearest the enemy primary, and the slow it applies. */
  drainCells: 32,
  drainSlowMul: 0.5,
  drainSlowSeconds: 2,
  /** Controllers fire Drain when this many enemy cells lie within `drainReach` of the enemy primary. */
  drainReach: 200,
  drainThreshold: 25,
};

const enemyPrimary = (world: Readonly<World>, side: SideIndex) => primaryOf(world as World, side === 0 ? 1 : 0);

/** Homes in on the enemy runner. Every clash makes it faster for good and slows the enemy for a moment. */
export const leech: CoreDef = {
  id: 'leech',
  name: 'Leech',
  colorName: 'TEAL',
  color: '#19c9a0',
  altColorName: 'LILAC',
  altColor: '#dcaaff',
  shape: 'star',
  signature: `Steers toward the enemy runner. Each clash gives it +${Math.round(leechValues.speedPerClash * 100)}% speed for good and slows the enemy to ${Math.round(leechValues.slowMul * 100)}% for ${leechValues.slowSeconds} s.`,
  stackLabel: 'Speed',
  values: leechValues,
  ultimate: {
    name: 'Drain',
    description: `Captures the ${leechValues.drainCells} enemy cells nearest the enemy runner and slows the enemy to ${Math.round(leechValues.drainSlowMul * 100)}% for ${leechValues.drainSlowSeconds} s.`,
    value: (world, side) => {
      const e = enemyPrimary(world, side);
      return e ? enemyCellsWithin(world, side, e.x, e.y, leechValues.drainReach).length : 0;
    },
    threshold: leechValues.drainThreshold,
  },
  hooks: {
    onStep(ctx) {
      const r = ctx.primary();
      const e = enemyPrimary(ctx.world, ctx.side);
      if (r && e) ctx.steer(r, e.x, e.y, leechValues.steerPerSecond / tuning.sim.stepsPerSecond);
    },
    onHit(ctx, hit) {
      if (hit.kind !== 'clash') return;
      ctx.addStat('speed', tuning.runner.speed * leechValues.speedPerClash);
      ctx.addStacks(1);
      ctx.slowEnemy(leechValues.slowMul, leechValues.slowSeconds);
      ctx.triggered();
    },
    onUltimate(ctx) {
      const e = enemyPrimary(ctx.world, ctx.side);
      if (!e) return;
      for (const cell of nearestEnemyCells(ctx.world, ctx.side, e.x, e.y, leechValues.drainCells)) ctx.captureCell(cell);
      ctx.slowEnemy(leechValues.drainSlowMul, leechValues.drainSlowSeconds);
      ctx.triggered();
    },
    onBoost(ctx, f) {
      // At least one stack's worth, so a boost before the first clash still does something.
      const extra = Math.max(1, ctx.stacks()) * (f - 1);
      ctx.addStat('speed', tuning.runner.speed * leechValues.speedPerClash * extra);
      ctx.addStacks(extra);
    },
  },
};

export const cores: readonly CoreDef[] = [ricochet, splitter, pulse, bloom, fortress, phantom, juggernaut, leech];

export function coreById(id: string): CoreDef {
  const c = cores.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown core ${id}`);
  return c;
}
