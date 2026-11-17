/**
 * Run rules and Ascension (MASTER_PROMPT 5.8 rules 1-4 and 7).
 *
 * `baseRules` is Ascension 0. Each tier adds one change on top of every tier
 * below it. In a change, numbers are added to the base and everything else
 * replaces it.
 */
export interface RunRules {
  readonly rounds: number;
  readonly hearts: number;
  /** Rerolls at the start of a run. */
  readonly rerolls: number;
  /** Rerolls gained by skipping a pick. */
  readonly skipRerolls: number;
  /** Rerolls gained by winning with a Wipeout. */
  readonly wipeoutRerolls: number;
  /** Mods on offer in a draft. */
  readonly offerSize: number;
  readonly bossRounds: readonly number[];
  /** In Endless, a boss every this many rounds (round 15, 20, ...). */
  readonly endlessBossEvery: number;
  /** Picks added to every rival and boss. */
  readonly rivalPicks: number;
  /** Levels added to every rival and boss Mod (cap 3). */
  readonly rivalLevels: number;
  /** Rivals aim and fire their ultimate in every round, not only from round 3. */
  readonly rivalsAlwaysControlled: boolean;
  /** Overrides on the rival heuristic (`tuning.ai.rival`), or null for none. */
  readonly rivalController: { readonly aimError: number; readonly patience: number } | null;
}

export const baseRules: RunRules = {
  rounds: 10,
  hearts: 3,
  rerolls: 1,
  skipRerolls: 1,
  wipeoutRerolls: 1,
  offerSize: 3,
  bossRounds: [5, 10],
  endlessBossEvery: 5,
  rivalPicks: 0,
  rivalLevels: 0,
  rivalsAlwaysControlled: false,
  rivalController: null,
};

export interface AscensionTier {
  readonly tier: number;
  /** One line for the UI. */
  readonly description: string;
  readonly change: Partial<RunRules>;
}

export const MAX_ASCENSION = 8;

export const ascensionTiers: readonly AscensionTier[] = [
  { tier: 1, description: 'Rivals carry one more Mod.', change: { rivalPicks: 1 } },
  { tier: 2, description: 'Start with no rerolls.', change: { rerolls: -1 } },
  { tier: 3, description: 'Bosses on rounds 4, 7 and 10.', change: { bossRounds: [4, 7, 10] } },
  { tier: 4, description: 'Rivals aim and use their ultimate from round 1.', change: { rivalsAlwaysControlled: true } },
  { tier: 5, description: "Rivals' Mods are one level higher.", change: { rivalLevels: 1 } },
  { tier: 6, description: 'Rivals aim sharper and save their ultimate for better moments.', change: { rivalController: { aimError: 0.05, patience: 1.25 } } },
  { tier: 7, description: 'Drafts offer one fewer Mod.', change: { offerSize: -1 } },
  { tier: 8, description: 'Start with 2 hearts.', change: { hearts: -1 } },
];

/** The rules for an Ascension tier (clamped to 0..8). */
export function rulesFor(ascension: number): RunRules {
  const t = Math.max(0, Math.min(MAX_ASCENSION, Math.floor(Number.isFinite(ascension) ? ascension : 0)));
  let rules: RunRules = baseRules;
  for (const tier of ascensionTiers) {
    if (tier.tier > t) break;
    const next: Record<string, unknown> = { ...rules };
    for (const [k, v] of Object.entries(tier.change)) {
      const cur = next[k];
      next[k] = typeof v === 'number' && typeof cur === 'number' ? cur + v : v;
    }
    rules = next as unknown as RunRules;
  }
  return rules;
}
