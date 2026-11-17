/**
 * Rival archetypes and rival scaling (MASTER_PROMPT 5.8 rule 6).
 *
 * A rival is a Core plus an ordered list of Mod ids. A rival with k picks takes
 * the first k usable entries along its list: a repeat levels that Mod up (to 3),
 * and an id that does not exist (content still being added) is skipped. Lists
 * name at most six distinct Mods, so every prefix is a legal build. When a list
 * runs out it is walked again, so extra picks keep levelling the same build.
 *
 * Economy Mods (Scavenger, Collector) do nothing for a rival and never appear.
 */
export interface RivalArchetype {
  /** Short flavour name for the build, for the VS card ("Swarm"). */
  readonly hint: string;
  readonly mods: readonly string[];
}

export const archetypes: Readonly<Record<string, readonly RivalArchetype[]>> = {
  ricochet: [
    { hint: 'Sweeper', mods: ['head-start', 'growth-spurt', 'overclock', 'compound', 'head-start', 'growth-spurt', 'encore', 'chain-reaction', 'compound', 'overclock'] },
    { hint: 'Duelist', mods: ['overclock', 'clash-engine', 'shockwave', 'hair-trigger', 'overclock', 'quick-hands', 'clash-engine', 'encore', 'shockwave', 'hair-trigger'] },
    { hint: 'Fortifier', mods: ['bulwark', 'head-start', 'scorched-trail', 'ramparts', 'bulwark', 'front-runner', 'growth-spurt', 'scorched-trail', 'head-start', 'ramparts'] },
  ],
  splitter: [
    { hint: 'Swarm', mods: ['head-start', 'overclock', 'afterburner', 'magnet', 'head-start', 'encore', 'overclock', 'hoarder', 'afterburner', 'head-start'] },
    { hint: 'Hair Trigger', mods: ['hair-trigger', 'head-start', 'echo', 'chain-reaction', 'hair-trigger', 'compound', 'head-start', 'echo', 'chain-reaction', 'compound'] },
    { hint: 'Blitz', mods: ['afterburner', 'shockwave', 'buzzer-beater', 'overclock', 'shockwave', 'encore', 'afterburner', 'buzzer-beater', 'overclock', 'encore'] },
  ],
  pulse: [
    { hint: 'Resonance', mods: ['hair-trigger', 'growth-spurt', 'echo', 'compound', 'hair-trigger', 'encore', 'echo', 'growth-spurt', 'compound', 'encore'] },
    { hint: 'Wall Drummer', mods: ['wall-hugger', 'head-start', 'clash-engine', 'shockwave', 'wall-hugger', 'overclock', 'head-start', 'clash-engine', 'shockwave', 'overclock'] },
  ],
  bloom: [
    { hint: 'Overgrowth', mods: ['chain-reaction', 'encircle', 'growth-spurt', 'compound', 'chain-reaction', 'encore', 'encircle', 'growth-spurt', 'compound', 'chain-reaction'] },
    { hint: 'Garden Wall', mods: ['bulwark', 'scorched-trail', 'chain-reaction', 'ramparts', 'bulwark', 'front-runner', 'scorched-trail', 'chain-reaction', 'ramparts', 'front-runner'] },
  ],
  fortress: [
    { hint: 'Citadel', mods: ['bulwark', 'ramparts', 'front-runner', 'compound', 'bulwark', 'scorched-trail', 'ramparts', 'front-runner', 'compound', 'scorched-trail'] },
    { hint: 'Siege', mods: ['growth-spurt', 'shockwave', 'landmines', 'overclock', 'growth-spurt', 'critical-mass', 'shockwave', 'landmines', 'overclock', 'critical-mass'] },
  ],
  phantom: [
    { hint: 'Blinker', mods: ['hair-trigger', 'echo', 'shockwave', 'quick-hands', 'hair-trigger', 'encore', 'echo', 'shockwave', 'quick-hands', 'encore'] },
    { hint: 'Raider', mods: ['underdog', 'comeback', 'afterburner', 'second-wind', 'underdog', 'magnet', 'comeback', 'afterburner', 'second-wind', 'magnet'] },
    { hint: 'Minelayer', mods: ['landmines', 'scorched-trail', 'shockwave', 'encircle', 'landmines', 'compound', 'scorched-trail', 'shockwave', 'encircle', 'compound'] },
  ],
  juggernaut: [
    { hint: 'Stampede', mods: ['growth-spurt', 'overclock', 'afterburner', 'compound', 'growth-spurt', 'encore', 'overclock', 'afterburner', 'compound', 'encore'] },
    { hint: 'Bulldozer', mods: ['glass-cannon', 'growth-spurt', 'chain-reaction', 'critical-mass', 'glass-cannon', 'shockwave', 'growth-spurt', 'chain-reaction', 'critical-mass', 'shockwave'] },
  ],
  leech: [
    { hint: 'Hunter', mods: ['clash-engine', 'overclock', 'underdog', 'afterburner', 'clash-engine', 'encore', 'overclock', 'underdog', 'afterburner', 'encore'] },
    { hint: 'Parasite', mods: ['decoy', 'second-wind', 'comeback', 'bulwark', 'decoy', 'clash-engine', 'second-wind', 'comeback', 'bulwark', 'clash-engine'] },
  ],
};

export interface RivalTier {
  /** Mod picks the rival takes along its archetype list. */
  readonly picks: number;
  /** Levels added to every rival Mod after picking (cap 3). */
  readonly levelBonus: number;
  /** Whether the rival aims its launch and times its ultimate. */
  readonly controller: boolean;
}

/**
 * Rival strength per round at Ascension 0. Index 0 is round 1. The player has
 * drafted `round` times by the time a round is played (skips aside).
 * Tuned with `npm run lab -- --runs` (docs/balance/stageA-runs.md).
 */
export const rivalScaling: {
  readonly rounds: readonly RivalTier[];
  /** Past the table (Endless): picks gained per round, and +1 level every `levelEvery` rounds. */
  readonly endless: { readonly picksPerRound: number; readonly levelEvery: number; readonly extraPrimaryEvery: number };
  /** Extra picks a boss takes over a rival of the same round. */
  readonly bossPicks: number;
} = {
  rounds: [
    { picks: 0, levelBonus: 0, controller: false },
    { picks: 0, levelBonus: 0, controller: false },
    { picks: 0, levelBonus: 0, controller: false },
    { picks: 0, levelBonus: 0, controller: true },
    { picks: 1, levelBonus: 0, controller: true },
    { picks: 1, levelBonus: 0, controller: true },
    { picks: 1, levelBonus: 0, controller: true },
    { picks: 2, levelBonus: 0, controller: true },
    { picks: 2, levelBonus: 0, controller: true },
    { picks: 3, levelBonus: 0, controller: true },
  ],
  endless: { picksPerRound: 1, levelEvery: 4, extraPrimaryEvery: 5 },
  bossPicks: 0,
};

export interface ScaledTier extends RivalTier {
  /** Extra primary runners for the rival (Endless only). */
  readonly extraPrimaries: number;
}

/** Rival strength at any round, 1-based, including Endless rounds past the table. */
export function rivalTier(round: number): ScaledTier {
  const table = rivalScaling.rounds;
  const r = Math.max(1, Math.floor(round));
  if (r <= table.length) return { ...table[r - 1]!, extraPrimaries: 0 };
  const last = table[table.length - 1]!;
  const past = r - table.length;
  const e = rivalScaling.endless;
  return {
    picks: last.picks + past * e.picksPerRound,
    levelBonus: last.levelBonus + Math.floor(past / e.levelEvery),
    controller: true,
    extraPrimaries: Math.floor(past / e.extraPrimaryEvery),
  };
}
