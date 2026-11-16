import { tuning } from '../content/tuning';
import type { AbilityContext, CoreDef, HitInfo, ModPick, SpawnOptions } from './abilities';
import { generateArena, findCell, type Arena } from './arena';
import type { EndReason, SimEvent } from './events';
import { primaryOf, runUltimate, type ControllerSpec, type InputRecord } from './input';
import { capture, hit } from './step';
import { pickups as allPickups, type PickupDef } from '../content/pickups';
import { Rng, Stream } from './rng';
import { rotateSmall } from './vec';

export type SideIndex = 0 | 1;
export const NEUTRAL = 255;

export interface Runner {
  readonly id: number;
  readonly side: SideIndex;
  readonly primary: boolean;
  x: number;
  y: number;
  /** Unit heading. Speed comes from stats every step. */
  dx: number;
  dy: number;
  radiusMul: number;
  speedMul: number;
  /** Last cell under the runner, used as the lookup hint. */
  cell: number;
  /** Position at the start of this step, so a fast runner captures along its whole path. */
  lastX: number;
  lastY: number;
  /** Unit direction of the beam. It trails straight behind, except while an ultimate spins it. */
  bx: number;
  by: number;
  /** Radians of beam spin left (Ricochet's ultimate), and the beam's reach while spinning. */
  spinLeft: number;
  spinReach: number;
  /** The beam is swinging back to trailing at the swing rate, sweeping as it goes. */
  swinging: boolean;
}

export const STAT_NAMES = ['speed', 'bodyRadius', 'captureRadius', 'beamLength'] as const;
export type StatName = (typeof STAT_NAMES)[number];

export interface Stat {
  base: number;
  add: number;
  mul: number;
}

export interface SideState {
  readonly core: CoreDef;
  readonly stats: Record<StatName, Stat>;
  hits: number;
  captures: number;
  stacks: number;
  counters: number[];
  runnerCount: number;
  overflow: number;
  /** Times the Core's signature fired this match. */
  triggers: number;
  /** Mods in slot order; hooks fire Core first, then these in order. */
  readonly mods: readonly ModPick[];
  /** Whether the launch has been aimed, and ultimates ready and used. */
  launched: boolean;
  ultimates: number;
  ultimatesUsed: number;
  /** Combined speed factor from underdog boost and Surge, recomputed each step. */
  speedFactor: number;
  /** Pickup grab distance multiplier (Magnet). */
  pickupReachMul: number;
  /** Random controller: the step it picked to fire its ultimate, or -1. */
  aiUltimateStep: number;
  /** Slow applied by the enemy: steps left and the speed multiplier. */
  slowSteps: number;
  slowMul: number;
  /** Pickup effects: steps left of each, and the surge speed multiplier. */
  surgeSteps: number;
  surgeMul: number;
  shieldSteps: number;
  pickups: number;
}

export interface Pickup {
  readonly id: number;
  /** Index into the pickup definitions in the match config. */
  readonly def: number;
  readonly x: number;
  readonly y: number;
  readonly expiresStep: number;
}

export interface MatchConfig {
  seed: number;
  cores: readonly [CoreDef, CoreDef];
  /** A built-in controller per side, or null for none (a human, a replay or no input). */
  controllers?: readonly [ControllerSpec | null, ControllerSpec | null];
  /** Pre-recorded inputs, for replays. */
  inputs?: readonly InputRecord[];
  /** Mods per side, in slot order. */
  mods?: readonly [readonly ModPick[], readonly ModPick[]];
  /** Boss arena twists and other match rule changes. */
  twist?: MatchTwist;
  /** Pickup definitions in play; an empty list turns pickups off. Defaults to the full set. */
  pickups?: readonly PickupDef[];
  /** False in headless lab runs, so no event objects are created. */
  recordEvents?: boolean;
}

export interface MatchTwist {
  /** Extra primary runners per side at match start. */
  extraPrimaries?: readonly [number, number];
  /** Side 0's share of the map at match start (default 0.5). */
  startShare?: number;
  /** Shield points on every starting cell, per side. */
  startShields?: readonly [number, number];
  durationSeconds?: number;
  /** Seconds between pickup spawns. */
  pickupEverySeconds?: number;
}

export interface Timer {
  step: number;
  side: SideIndex;
  /** Mod slot whose hook set the timer, or -1 for the Core. */
  mod: number;
  fn: (ctx: AbilityContext) => void;
}

export type Phase = 'running' | 'suddenDeath' | 'ended';

export interface World {
  readonly arena: Arena;
  readonly owner: Uint8Array;
  readonly counts: [number, number];
  readonly runners: Runner[];
  readonly sides: [SideState, SideState];
  readonly rng: Rng;
  readonly dt: number;
  readonly matchSteps: number;
  readonly recordEvents: boolean;
  readonly controllers: readonly [ControllerSpec | null, ControllerSpec | null];
  readonly aiRngs: [Rng, Rng];
  /** Inputs waiting for their step, in step order. */
  readonly pendingInputs: InputRecord[];
  /** Every input applied, in order: everything a replay needs besides seed and builds. */
  readonly inputLog: InputRecord[];
  /** Pending `ctx.after` callbacks, in firing order. */
  readonly timers: Timer[];
  /** Shield points per cell, the step each last absorbed a capture, and the step until which each is locked. */
  readonly cellShield: Uint8Array;
  readonly cellShieldStep: Int32Array;
  readonly cellLockUntil: Int32Array;
  readonly pickupEverySteps: number;
  /** Index of the Mod whose hook is running, or -1 for the Core (routes `triggered`). */
  currentMod: number;
  readonly pickupDefs: readonly PickupDef[];
  /** Pickups on the map, oldest first. */
  readonly pickups: Pickup[];
  nextPickupId: number;
  nextPickupStep: number;
  step: number;
  phase: Phase;
  suddenDeathStep: number;
  winner: SideIndex | -1;
  endReason: EndReason | null;
  /** Side currently ahead, or -1 before anyone has led. */
  leader: SideIndex | -1;
  leadChanges: number;
  lastLeadChangeStep: number;
  /** Largest share of the map either side held before half time, and which side (lab tension metric). */
  maxShareFirstHalf: number;
  maxShareFirstHalfSide: SideIndex | -1;
  events: SimEvent[];
  nextRunnerId: number;
  readonly contexts: [AbilityContext, AbilityContext];
  readonly hitScratch: HitInfo;
}

export function statValue(side: SideState, name: StatName): number {
  const s = side.stats[name];
  return (s.base + s.add) * s.mul;
}

export function emit(world: World, ev: SimEvent): void {
  if (world.recordEvents) world.events.push(ev);
}

function makeStats(): Record<StatName, Stat> {
  return {
    speed: { base: tuning.runner.speed, add: 0, mul: 1 },
    bodyRadius: { base: tuning.runner.bodyRadius, add: 0, mul: 1 },
    captureRadius: { base: tuning.runner.captureRadius, add: 0, mul: 1 },
    beamLength: { base: 0, add: 0, mul: 1 },
  };
}

export function addRunner(
  world: World,
  side: SideIndex,
  primary: boolean,
  x: number,
  y: number,
  dx: number,
  dy: number,
  opts: SpawnOptions,
): Runner {
  const r: Runner = {
    id: world.nextRunnerId++,
    side,
    primary,
    x,
    y,
    dx,
    dy,
    radiusMul: opts.radiusMul,
    speedMul: opts.speedMul,
    cell: findCell(world.arena, x, y, 0),
    lastX: x,
    lastY: y,
    bx: -dx,
    by: -dy,
    spinLeft: 0,
    spinReach: 0,
    swinging: false,
  };
  world.runners.push(r);
  world.sides[side].runnerCount++;
  emit(world, { type: 'RunnerSpawned', step: world.step, side, runner: r.id });
  return r;
}

function makeContext(world: () => World, side: SideIndex): AbilityContext {
  const st = (): SideState => world().sides[side];
  return {
    side,
    get world() {
      return world();
    },
    get rng() {
      return world().rng;
    },
    stacks: () => st().stacks,
    addStacks(n) {
      st().stacks += n;
    },
    addStat(stat, n) {
      st().stats[stat].add += n;
    },
    mulStat(stat, f) {
      st().stats[stat].mul *= f;
    },
    counter: (i) => st().counters[i] ?? 0,
    setCounter(i, v) {
      st().counters[i] = v;
    },
    enemy: side === 0 ? 1 : 0,
    primary: () => primaryOf(world(), side),
    after(seconds, fn) {
      const w = world();
      const t: Timer = { step: w.step + Math.max(1, Math.round(seconds * tuning.sim.stepsPerSecond)), side, mod: w.currentMod, fn };
      // Insert after every timer due at or before the same step, so equal-step timers fire in the order they were set.
      let i = w.timers.length;
      while (i > 0 && w.timers[i - 1]!.step > t.step) i--;
      w.timers.splice(i, 0, t);
    },
    shieldCells(cells, points) {
      const w = world();
      if (cells === 'all') {
        for (let i = 0; i < w.owner.length; i++) if (w.owner[i] === side) w.cellShield[i] = Math.min(255, w.cellShield[i]! + points);
        return;
      }
      for (const i of cells) if (w.owner[i] === side) w.cellShield[i] = Math.min(255, w.cellShield[i]! + points);
    },
    lockCells(cells, seconds) {
      const w = world();
      const until = w.step + Math.round(seconds * tuning.sim.stepsPerSecond);
      for (const i of cells) if (w.owner[i] === side) w.cellLockUntil[i] = Math.max(w.cellLockUntil[i]!, until);
    },
    teleport(runner, x, y) {
      const w = world();
      const rad = statValue(w.sides[runner.side], 'bodyRadius') * runner.radiusMul;
      const fromX = runner.x;
      const fromY = runner.y;
      runner.x = Math.min(Math.max(x, rad), w.arena.size - rad);
      runner.y = Math.min(Math.max(y, rad), w.arena.size - rad);
      runner.lastX = runner.x;
      runner.lastY = runner.y;
      runner.cell = findCell(w.arena, runner.x, runner.y, runner.cell);
      emit(w, { type: 'Teleport', step: w.step, side: runner.side, runner: runner.id, fromX, fromY, x: runner.x, y: runner.y });
    },
    steer(runner, tx, ty, maxRadians) {
      const dx = tx - runner.x;
      const dy = ty - runner.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1e-6) return;
      const ux = dx / len;
      const uy = dy / len;
      const max = Math.min(0.3, Math.max(0, maxRadians));
      const cross = runner.dx * uy - runner.dy * ux;
      const dot = runner.dx * ux + runner.dy * uy;
      // sin(angle) = cross: when the remaining turn is within reach, snap to the target heading.
      if (dot > 0 && Math.abs(cross) <= max) {
        runner.dx = ux;
        runner.dy = uy;
        return;
      }
      rotateSmall(runner, cross >= 0 ? max : -max);
    },
    slowEnemy(mul, seconds) {
      const e = world().sides[side === 0 ? 1 : 0];
      e.slowSteps = Math.max(e.slowSteps, Math.round(seconds * tuning.sim.stepsPerSecond));
      e.slowMul = Math.min(e.slowMul, mul);
    },
    cedeCells(n) {
      transferCells(world(), side, side === 0 ? 1 : 0, n);
    },
    secondsLeft() {
      const w = world();
      return Math.max(0, (w.matchSteps - w.step) / tuning.sim.stepsPerSecond);
    },
    lead() {
      const w = world();
      return w.counts[side] - w.counts[side === 0 ? 1 : 0];
    },
    captureCell(cell) {
      capture(world(), cell, side, 'ability');
    },
    blast(x, y, radius) {
      const w = world();
      const c = w.arena.centroids;
      const r2 = radius * radius;
      for (let i = 0; i < w.arena.cellCount; i++) {
        const dx = c[i * 2]! - x;
        const dy = c[i * 2 + 1]! - y;
        if (dx * dx + dy * dy <= r2) capture(w, i, side, 'ability');
      }
      emit(w, { type: 'Blast', step: w.step, side, x, y, radius });
    },
    shield(seconds) {
      const s = st();
      s.shieldSteps = Math.max(s.shieldSteps, Math.round(seconds * tuning.sim.stepsPerSecond));
    },
    surge(speedMul, seconds) {
      const s = st();
      s.surgeSteps = Math.max(s.surgeSteps, Math.round(seconds * tuning.sim.stepsPerSecond));
      s.surgeMul = Math.max(s.surgeMul, speedMul);
    },
    setPickupReach(mul) {
      const s = st();
      s.pickupReachMul = Math.max(s.pickupReachMul, mul);
    },
    addHits(n) {
      const r = primaryOf(world(), side);
      if (!r) return;
      const mod = world().currentMod;
      for (let i = 0; i < n; i++) hit(world(), r, 'wall');
      world().currentMod = mod;
    },
    swingBeam() {
      const r = primaryOf(world(), side);
      if (r) r.swinging = true;
    },
    spinBeam(turns, maxReach) {
      const r = primaryOf(world(), side);
      if (!r) return;
      r.spinLeft += turns * 2 * Math.PI;
      r.spinReach = maxReach;
    },
    echoUltimate(seconds) {
      this.after(seconds, () => runUltimate(world(), side, true));
    },
    spawnRunner(from, opts) {
      const w = world();
      const s = st();
      if (s.runnerCount >= tuning.runner.maxPerSide) {
        s.overflow++;
        s.stats.speed.add += tuning.runner.speed * tuning.runner.overflowSpeed;
        emit(w, { type: 'RunnerOverflow', step: w.step, side, overflow: s.overflow });
        return null;
      }
      const dir = w.rng.unitVector();
      return addRunner(w, side, false, from.x, from.y, dir.x, dir.y, opts);
    },
    triggered() {
      const w = world();
      const s = st();
      if (w.currentMod >= 0) {
        emit(w, { type: 'ModTriggered', step: w.step, side, slot: w.currentMod });
        return;
      }
      s.triggers++;
      emit(w, { type: 'CoreTriggered', step: w.step, side, stacks: s.stacks });
    },
  };
}

/**
 * Move up to `n` cells from one side to the other without firing capture hooks,
 * taking cells that border the receiver first, in index order (match setup only).
 */
export function transferCells(world: World, from: SideIndex, to: SideIndex, n: number): void {
  let left = Math.min(Math.floor(n), world.counts[from] - 1);
  while (left > 0) {
    const ring: number[] = [];
    for (let i = 0; i < world.owner.length; i++) {
      if (world.owner[i] !== from) continue;
      const ns = world.arena.neighbors[i]!;
      for (let k = 0; k < ns.length; k++) {
        if (world.owner[ns[k]!] === to) {
          ring.push(i);
          break;
        }
      }
    }
    if (ring.length === 0) return;
    for (const i of ring) {
      if (left === 0) break;
      world.owner[i] = to;
      world.counts[from]--;
      world.counts[to]++;
      left--;
    }
  }
}

export function createWorld(cfg: MatchConfig): World {
  const arena = generateArena(tuning.arena, new Rng(cfg.seed, Stream.arena));
  const rng = new Rng(cfg.seed, Stream.sim);
  const n = arena.cellCount;

  // Split the map in half along a seeded line through the centre.
  const normal = rng.unitVector();
  const centre = arena.size / 2;
  const order = Array.from({ length: n }, (_, i) => i);
  const dist = (i: number): number =>
    (arena.centroids[i * 2]! - centre) * normal.x + (arena.centroids[i * 2 + 1]! - centre) * normal.y;
  order.sort((a, b) => dist(a) - dist(b) || a - b);
  const owner = new Uint8Array(n);
  const half = Math.floor(n / 2);
  for (let k = 0; k < n; k++) owner[order[k]!] = k < half ? 0 : 1;

  let worldRef: World | null = null;
  const get = (): World => worldRef!;
  const side = (i: SideIndex): SideState => ({
    core: cfg.cores[i],
    stats: makeStats(),
    hits: 0,
    captures: 0,
    stacks: 0,
    counters: [],
    runnerCount: 0,
    overflow: 0,
    triggers: 0,
    mods: cfg.mods?.[i] ?? [],
    launched: false,
    ultimates: 1,
    ultimatesUsed: 0,
    speedFactor: 1,
    pickupReachMul: 1,
    aiUltimateStep: -1,
    slowSteps: 0,
    slowMul: 1,
    surgeSteps: 0,
    surgeMul: 1,
    shieldSteps: 0,
    pickups: 0,
  });

  const world: World = {
    arena,
    owner,
    counts: [half, n - half],
    runners: [],
    sides: [side(0), side(1)],
    rng,
    dt: 1 / tuning.sim.stepsPerSecond,
    matchSteps: Math.round((cfg.twist?.durationSeconds ?? tuning.match.durationSeconds) * tuning.sim.stepsPerSecond),
    recordEvents: cfg.recordEvents ?? true,
    controllers: cfg.controllers ?? [null, null],
    aiRngs: [new Rng(cfg.seed, Stream.ai0), new Rng(cfg.seed, Stream.ai1)],
    pendingInputs: [...(cfg.inputs ?? [])].sort((a, b) => a.step - b.step),
    inputLog: [],
    timers: [],
    cellShield: new Uint8Array(n),
    cellShieldStep: new Int32Array(n).fill(-1_000_000),
    cellLockUntil: new Int32Array(n),
    pickupEverySteps: Math.round((cfg.twist?.pickupEverySeconds ?? tuning.pickups.everySeconds) * tuning.sim.stepsPerSecond),
    currentMod: -1,
    pickupDefs: cfg.pickups ?? allPickups,
    pickups: [],
    nextPickupId: 0,
    nextPickupStep: Math.round(tuning.pickups.firstSeconds * tuning.sim.stepsPerSecond),
    step: 0,
    phase: 'running',
    suddenDeathStep: 0,
    winner: -1,
    endReason: null,
    leader: -1,
    leadChanges: 0,
    lastLeadChangeStep: 0,
    maxShareFirstHalf: 0.5,
    maxShareFirstHalfSide: -1,
    events: [],
    nextRunnerId: 0,
    contexts: [makeContext(get, 0), makeContext(get, 1)],
    hitScratch: { runner: null as unknown as Runner, kind: 'wall' },
  };
  worldRef = world;

  const twist = cfg.twist;
  if (twist?.startShare !== undefined) {
    const want = Math.round(Math.min(0.9, Math.max(0.1, twist.startShare)) * n);
    if (want > world.counts[0]) transferCells(world, 1, 0, want - world.counts[0]);
    else if (want < world.counts[0]) transferCells(world, 0, 1, world.counts[0] - want);
  }
  if (twist?.startShields) {
    for (let i = 0; i < n; i++) world.cellShield[i] = twist.startShields[owner[i] as SideIndex] ?? 0;
  }

  // Each primary starts at the centroid of its territory, heading at the enemy within a seeded spread.
  for (const s of [0, 1] as const) {
    let sx = 0;
    let sy = 0;
    let count = 0;
    for (let i = 0; i < n; i++) {
      if (owner[i] !== s) continue;
      sx += arena.centroids[i * 2]!;
      sy += arena.centroids[i * 2 + 1]!;
      count++;
    }
    const sign = s === 0 ? 1 : -1;
    const dir = { dx: normal.x * sign, dy: normal.y * sign };
    rotateSmall(dir, rng.range(-tuning.runner.startSpread, tuning.runner.startSpread));
    addRunner(world, s, true, sx / count, sy / count, dir.dx, dir.dy, { radiusMul: 1, speedMul: 1 });
    // Twist: extra primaries fan out from the same spot.
    for (let k = 0; k < (twist?.extraPrimaries?.[s] ?? 0); k++) {
      const d = { dx: dir.dx, dy: dir.dy };
      rotateSmall(d, (k % 2 === 0 ? 0.3 : -0.3) * (1 + Math.floor(k / 2)));
      addRunner(world, s, true, sx / count, sy / count, d.dx, d.dy, { radiusMul: 1, speedMul: 1 });
    }
  }

  for (const s of [0, 1] as const) {
    const sd = world.sides[s];
    world.currentMod = -1;
    sd.core.hooks.onMatchStart?.(world.contexts[s]);
    sd.mods.forEach((m, i) => {
      world.currentMod = i;
      m.mod.hooks.onMatchStart?.(world.contexts[s], m.level);
    });
    world.currentMod = -1;
  }
  return world;
}
