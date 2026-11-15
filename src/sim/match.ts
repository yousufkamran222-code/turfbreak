import type { EndReason } from './events';
import { stepWorld } from './step';
import { createWorld, type MatchConfig, type SideIndex, type World } from './world';

export interface MatchResult {
  winner: SideIndex;
  reason: EndReason;
  steps: number;
  counts: [number, number];
  leadChanges: number;
  lastLeadChangeStep: number;
  maxShareFirstHalf: number;
  stacks: [number, number];
  runners: [number, number];
  hits: [number, number];
  redirects: [number, number];
  pickups: [number, number];
}

export function summarize(world: World): MatchResult {
  if (world.winner === -1 || world.endReason === null) throw new Error('Match has not ended');
  return {
    winner: world.winner,
    reason: world.endReason,
    steps: world.step,
    counts: [world.counts[0], world.counts[1]],
    leadChanges: world.leadChanges,
    lastLeadChangeStep: world.lastLeadChangeStep,
    maxShareFirstHalf: world.maxShareFirstHalf,
    stacks: [world.sides[0].stacks, world.sides[1].stacks],
    runners: [world.sides[0].runnerCount, world.sides[1].runnerCount],
    hits: [world.sides[0].hits, world.sides[1].hits],
    redirects: [world.sides[0].redirects, world.sides[1].redirects],
    pickups: [world.sides[0].pickups, world.sides[1].pickups],
  };
}

/** Run a whole match headlessly. `onStep` lets tests inspect every step. */
export function runMatch(cfg: MatchConfig, onStep?: (world: World) => void): MatchResult {
  const world = createWorld({ recordEvents: false, ...cfg });
  while (world.phase !== 'ended') {
    stepWorld(world);
    onStep?.(world);
  }
  return summarize(world);
}
