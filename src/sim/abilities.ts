import type { Rng } from './rng';
import type { Runner, SideIndex, StatName, World } from './world';

export type RunnerShape = 'diamond' | 'hexagon' | 'circle' | 'triangle' | 'square' | 'star' | 'pentagon' | 'octagon';

export interface HitInfo {
  runner: Runner;
  kind: 'wall' | 'clash';
}

export interface SpawnOptions {
  radiusMul: number;
  speedMul: number;
}

/**
 * What a Core or Mod hook may do (MASTER_PROMPT 5.5). Reads go through
 * `world`; writes only through these methods.
 */
export interface AbilityContext {
  readonly side: SideIndex;
  readonly world: Readonly<World>;
  readonly rng: Rng;
  stacks(): number;
  addStacks(n: number): void;
  addStat(stat: StatName, n: number): void;
  mulStat(stat: StatName, f: number): void;
  /** A per-side scratch counter for the Core's own bookkeeping. */
  counter(i: number): number;
  setCounter(i: number, v: number): void;
  /** The side's primary runner, if it has one. */
  primary(): Runner | null;
  /** Spawn a runner beside `from`. Returns null when the side is at the cap (the spawn overflows into speed). */
  spawnRunner(from: Runner, opts: SpawnOptions): Runner | null;
  /** Capture one cell for this side (respects Shield). */
  captureCell(cell: number): void;
  /** Capture every cell whose centre is within `radius` of (x, y). */
  blast(x: number, y: number, radius: number): void;
  shield(seconds: number): void;
  surge(speedMul: number, seconds: number): void;
  /** Let this side's runners grab pickups from `mul` times as far away. */
  setPickupReach(mul: number): void;
  /** Count `n` hits on the primary, firing every on-hit hook as a real hit would. */
  addHits(n: number): void;
  /** Let the primary's beam swing back to trailing at the swing rate (sweeping) instead of snapping. */
  swingBeam(): void;
  /** Spin the primary's beam through `turns` full circles, sweeping as it goes, reaching at most `maxReach`. */
  spinBeam(turns: number, maxReach: number): void;
  /** Fire the Core's ultimate effect again in `seconds` (Encore). Does not use up a charge. */
  echoUltimate(seconds: number): void;
  /** Announce that the Core or the Mod running this hook just fired, so the HUD can flash it. */
  triggered(): void;
}

export interface CoreHooks {
  onMatchStart?(ctx: AbilityContext): void;
  onStep?(ctx: AbilityContext): void;
  onHit?(ctx: AbilityContext, hit: HitInfo): void;
  onCapture?(ctx: AbilityContext, cell: number): void;
  /** The Core's ultimate. Fires when the side uses it (once per match unless a pickup or Mod says otherwise). */
  onUltimate?(ctx: AbilityContext): void;
}

export interface UltimateDef {
  readonly name: string;
  readonly description: string;
  /**
   * How good a moment this is for the ultimate, for controllers. They fire when
   * it reaches `threshold`, or late in the match regardless.
   */
  value(world: Readonly<World>, side: SideIndex): number;
  readonly threshold: number;
}

export interface CoreDef {
  readonly id: string;
  readonly name: string;
  /** Colour word used in rival names, in capitals as the videos do. */
  readonly colorName: string;
  readonly color: string;
  /** Used for side B when both sides run the same Core. */
  readonly altColorName: string;
  readonly altColor: string;
  readonly shape: RunnerShape;
  readonly signature: string;
  readonly stackLabel: string;
  readonly values: Readonly<Record<string, number>>;
  readonly ultimate: UltimateDef;
  readonly hooks: CoreHooks;
}

export type Rarity = 'common' | 'uncommon' | 'rare';

/** Mod hooks receive the Mod's level (1 to 3). */
export interface ModHooks {
  onMatchStart?(ctx: AbilityContext, level: number): void;
  onHit?(ctx: AbilityContext, hit: HitInfo, level: number): void;
  onCapture?(ctx: AbilityContext, cell: number, level: number): void;
  onUltimate?(ctx: AbilityContext, level: number): void;
  /** Runs every `intervalSeconds(level)` seconds of match time. */
  onInterval?(ctx: AbilityContext, level: number): void;
}

export interface ModDef {
  readonly id: string;
  readonly name: string;
  /** One character for the Mod's icon. */
  readonly glyph: string;
  readonly rarity: Rarity;
  readonly group: string;
  /** Effect text at a level, with its numbers filled in. */
  text(level: number): string;
  intervalSeconds?(level: number): number;
  readonly hooks: ModHooks;
}

/** A Mod in a build: which one, at what level. */
export interface ModPick {
  readonly mod: ModDef;
  readonly level: number;
}
