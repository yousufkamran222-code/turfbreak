/**
 * Unlocks (MASTER_PROMPT 6.7). Data only: a starting roster and one feat per
 * locked Core or Mod. A feat is a function of what a finished match or run can
 * tell us (a `MatchSummary` counted by the UI layer, the run state) and the
 * lifetime stats. Nothing here touches the sim.
 */
import type { RunState } from '../run/run';
import type { Stats } from '../meta/save';

/** What one finished match says about the player's side (side 0). Counted from events and the final world. */
export interface MatchSummary {
  /** Player's Core and the rival's. */
  coreId: string;
  rivalCoreId: string;
  won: boolean;
  /** Final cell difference, always >= 0. */
  margin: number;
  wipeout: boolean;
  /** Match length in seconds of match time. */
  seconds: number;
  leadChanges: number;
  /** Most runners the player's side had at once, and how many of them were not main runners. */
  maxRunners: number;
  maxSplits: number;
  /** Most cells the player ever trailed by. */
  peakDeficit: number;
  /** Capture attempts the player's shields absorbed. */
  shieldAbsorbed: number;
  /** Pickups grabbed by the player's runners. */
  pickups: number;
  /** Ultimates the player fired (echoes do not count). */
  ultimates: number;
  /** Seconds of match time left when the player last fired an ultimate, or null if never. */
  lastUltimateLeft: number | null;
  /** The player took the lead in the final 10 s. */
  leadLate: boolean;
  /** Times the player's Core signature fired. */
  triggers: number;
  /** Longest beam the player's side had (Ricochet), in arena units. */
  longestBeam: number;
  /** Mods in the player's build. */
  mods: number;
}

export interface FeatContext {
  /** Set when a match has just ended. */
  match: MatchSummary | null;
  /** The run after the match was recorded (so `round` and `outcome` are current). */
  run: RunState | null;
  /** Lifetime stats including this match. */
  stats: Stats;
}

export interface Feat {
  readonly kind: 'core' | 'mod';
  readonly id: string;
  /** Imperative, short: "Win a run." */
  readonly hint: string;
  check(c: FeatContext): boolean;
}

export const startingCores: readonly string[] = ['ricochet', 'splitter', 'pulse'];

/** Fourteen Mods covering every group but Pickup (one, Shockwave) and keeping the strong rares back. */
export const startingMods: readonly string[] = [
  'overclock',
  'growth-spurt',
  'chain-reaction',
  'shockwave',
  'head-start',
  'clash-engine',
  'wall-hugger',
  'scorched-trail',
  'ramparts',
  'underdog',
  'front-runner',
  'scavenger',
  'echo',
  'decoy',
];

const any = (c: FeatContext): MatchSummary | null => c.match;
const won = (c: FeatContext): MatchSummary | null => (c.match?.won ? c.match : null);

export const feats: readonly Feat[] = [
  // Cores
  { kind: 'core', id: 'bloom', hint: 'Win 3 matches.', check: (c) => c.stats.matchesWon >= 3 },
  { kind: 'core', id: 'fortress', hint: 'Reach round 5 in a run.', check: (c) => (c.run?.round ?? 0) >= 5 },
  { kind: 'core', id: 'phantom', hint: 'Grab 4 pickups in one match.', check: (c) => (any(c)?.pickups ?? 0) >= 4 },
  { kind: 'core', id: 'juggernaut', hint: 'Win a run with any Core.', check: (c) => c.run?.outcome === 'won' },
  { kind: 'core', id: 'leech', hint: 'Win a match by Wipeout.', check: (c) => !!won(c)?.wipeout },
  // Mods
  { kind: 'mod', id: 'afterburner', hint: 'Win a match by 30 or more cells.', check: (c) => (won(c)?.margin ?? 0) >= 30 },
  { kind: 'mod', id: 'magnet', hint: 'Grab 3 pickups in one match.', check: (c) => (any(c)?.pickups ?? 0) >= 3 },
  { kind: 'mod', id: 'bulwark', hint: 'Win a match while your shields absorb 30 attacks.', check: (c) => (won(c)?.shieldAbsorbed ?? 0) >= 30 },
  { kind: 'mod', id: 'hoarder', hint: 'Grab 30 pickups across all your matches.', check: (c) => c.stats.pickups >= 30 },
  { kind: 'mod', id: 'encore', hint: 'Fire 10 ultimates across all your matches.', check: (c) => c.stats.ultimates >= 10 },
  { kind: 'mod', id: 'compound', hint: 'Win 8 matches.', check: (c) => c.stats.matchesWon >= 8 },
  { kind: 'mod', id: 'hair-trigger', hint: 'Win a match with your Core triggering 8 times.', check: (c) => (won(c)?.triggers ?? 0) >= 8 },
  { kind: 'mod', id: 'encircle', hint: 'Win a match with 5 or more lead changes.', check: (c) => !!won(c) && (any(c)?.leadChanges ?? 0) >= 5 },
  { kind: 'mod', id: 'landmines', hint: 'Reach round 7 in a run.', check: (c) => (c.run?.round ?? 0) >= 7 },
  { kind: 'mod', id: 'critical-mass', hint: 'Win a match with 6 or more splits alive.', check: (c) => (won(c)?.maxSplits ?? 0) >= 6 },
  { kind: 'mod', id: 'buzzer-beater', hint: 'Take the lead in the last 10 seconds and win.', check: (c) => !!won(c)?.leadLate },
  { kind: 'mod', id: 'comeback', hint: 'Win a match after trailing by 40 or more cells.', check: (c) => (won(c)?.peakDeficit ?? 0) >= 40 },
  { kind: 'mod', id: 'collector', hint: 'Win a match with 4 Mods in your build.', check: (c) => (won(c)?.mods ?? 0) >= 4 },
  { kind: 'mod', id: 'glass-cannon', hint: 'Win a match by 70 or more cells.', check: (c) => (won(c)?.margin ?? 0) >= 70 },
  {
    kind: 'mod',
    id: 'second-wind',
    hint: 'Win a match on your last heart.',
    check: (c) => !!won(c) && c.run !== null && c.run.hearts === 1,
  },
  {
    kind: 'mod',
    id: 'quick-hands',
    hint: 'Win a match after firing your ultimate in the last 15 seconds.',
    check: (c) => {
      const x = won(c);
      return !!x && x.lastUltimateLeft !== null && x.lastUltimateLeft <= 15;
    },
  },
];

/** The feat that unlocks a Core or Mod, or undefined for starting content. */
export function featFor(kind: 'core' | 'mod', id: string): Feat | undefined {
  return feats.find((f) => f.kind === kind && f.id === id);
}

/** Feats met by `c` whose reward is not yet in `have`. */
export function newlyMet(have: { cores: readonly string[]; mods: readonly string[] }, c: FeatContext): Feat[] {
  return feats.filter((f) => !(f.kind === 'core' ? have.cores : have.mods).includes(f.id) && f.check(c));
}
