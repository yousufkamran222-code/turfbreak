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
  /** Spawn a runner beside `from`. Returns null when the side is at the cap (the spawn overflows into speed). */
  spawnRunner(from: Runner, opts: SpawnOptions): Runner | null;
  /** Announce that the Core's signature just fired, so the HUD can flash it. */
  triggered(): void;
}

export interface CoreHooks {
  onMatchStart?(ctx: AbilityContext): void;
  onStep?(ctx: AbilityContext): void;
  onHit?(ctx: AbilityContext, hit: HitInfo): void;
  onCapture?(ctx: AbilityContext, cell: number): void;
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
  readonly hooks: CoreHooks;
}
