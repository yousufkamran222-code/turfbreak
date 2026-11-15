import { tuning } from '../content/tuning';
import type { AbilityContext, CoreDef, HitInfo, SpawnOptions } from './abilities';
import { generateArena, findCell, type Arena } from './arena';
import type { EndReason, SimEvent } from './events';
import type { ControllerSpec, InputMode, InputRecord, RedirectRules } from './input';
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
  /** Unit direction of the beam. It trails straight behind, and swings (sweeping) only after a redirect. */
  bx: number;
  by: number;
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
  /** Redirect charges ready now, and steps until the next one returns. */
  charges: number;
  chargeSteps: number;
  redirects: number;
  /** Steps of post-redirect dash left, and redirects waiting to count as hits. */
  dashSteps: number;
  pendingRedirectHits: number;
  /** Combined speed factor from underdog boost, redirect dash and Surge, recomputed each step. */
  speedFactor: number;
  /** Controller bookkeeping: step at which it may act next, or -1 when waiting for a charge. */
  aiReadyStep: number;
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
  /** Which player input the match uses. Defaults to redirect. */
  inputMode?: InputMode;
  /** A built-in controller per side, or null for none (a human, a replay or no input). */
  controllers?: readonly [ControllerSpec | null, ControllerSpec | null];
  /** Pre-recorded inputs, for replays. */
  inputs?: readonly InputRecord[];
  /** Overrides for the redirect rules (Phase 2 compares variants). */
  redirect?: Partial<RedirectRules>;
  /** Pickup definitions in play; an empty list turns pickups off. Defaults to the full set. */
  pickups?: readonly PickupDef[];
  /** False in headless lab runs, so no event objects are created. */
  recordEvents?: boolean;
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
  readonly inputMode: InputMode;
  readonly redirectRules: RedirectRules;
  readonly controllers: readonly [ControllerSpec | null, ControllerSpec | null];
  readonly aiRngs: [Rng, Rng];
  /** Inputs waiting for their step, in step order. */
  readonly pendingInputs: InputRecord[];
  /** Every input applied, in order: everything a replay needs besides seed and builds. */
  readonly inputLog: InputRecord[];
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
  /** Largest share of the map either side held before half time (lab tension metric). */
  maxShareFirstHalf: number;
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
    bx: -dx,
    by: -dy,
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
    spawnRunner(from, opts) {
      const w = world();
      const s = st();
      if (s.runnerCount >= tuning.runner.maxPerSide) {
        s.overflow++;
        s.stats.speed.mul *= 1 + tuning.runner.overflowSpeed;
        emit(w, { type: 'RunnerOverflow', step: w.step, side, overflow: s.overflow });
        return null;
      }
      const dir = w.rng.unitVector();
      return addRunner(w, side, false, from.x, from.y, dir.x, dir.y, opts);
    },
    triggered() {
      const w = world();
      const s = st();
      s.triggers++;
      emit(w, { type: 'CoreTriggered', step: w.step, side, stacks: s.stacks });
    },
  };
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
    charges: { ...tuning.input.redirect, ...cfg.redirect }.maxCharges,
    chargeSteps: 0,
    redirects: 0,
    dashSteps: 0,
    pendingRedirectHits: 0,
    speedFactor: 1,
    aiReadyStep: -1,
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
    matchSteps: Math.round(tuning.match.durationSeconds * tuning.sim.stepsPerSecond),
    recordEvents: cfg.recordEvents ?? true,
    inputMode: cfg.inputMode ?? 'redirect',
    redirectRules: { ...tuning.input.redirect, ...cfg.redirect },
    controllers: cfg.controllers ?? [null, null],
    aiRngs: [new Rng(cfg.seed, Stream.ai0), new Rng(cfg.seed, Stream.ai1)],
    pendingInputs: [...(cfg.inputs ?? [])].sort((a, b) => a.step - b.step),
    inputLog: [],
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
    events: [],
    nextRunnerId: 0,
    contexts: [makeContext(get, 0), makeContext(get, 1)],
    hitScratch: { runner: null as unknown as Runner, kind: 'wall' },
  };
  worldRef = world;

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
  }

  for (const s of [0, 1] as const) world.sides[s].core.hooks.onMatchStart?.(world.contexts[s]);
  return world;
}
