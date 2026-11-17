/**
 * Meta progression: what a finished match does to the save. Pure, so the
 * records, feats, Daily result and Ascension unlock are all testable without a
 * UI. `Game.finish` calls `applyMatch` and commits the result.
 */
import { previousDay, roundLetter, type DailyResult } from '../content/daily';
import { newlyMet, type Feat, type MatchSummary } from '../content/unlocks';
import { MAX_ASCENSION, finishMatch, type RunState } from '../run/run';
import { rulesFor } from '../content/ascension';
import { defaultCoreStats, type CoreStats, type Save } from './save';

export interface MatchResult {
  winner: 0 | 1;
  margin: number;
  wipeout: boolean;
  /** Counted during the match; absent in tests that only care about the run. */
  summary?: MatchSummary | undefined;
}

export interface Applied {
  save: Save;
  /** Feats met by this match, already merged into `save.unlocks`. */
  unlocked: Feat[];
  /** The Ascension tier a just-won run unlocked, if any. */
  ascension: number | null;
}

/** Update one Core's lifetime records from a match. */
function recordCore(prev: CoreStats | undefined, s: MatchSummary | undefined, o: { endless: boolean; round: number }): CoreStats {
  const c = { ...(prev ?? defaultCoreStats()) };
  if (o.endless) c.bestEndless = Math.max(c.bestEndless, o.round);
  if (!s) return c;
  if (s.won) c.bestMargin = Math.max(c.bestMargin, s.margin);
  if (s.coreId === 'ricochet') c.longestBeam = Math.max(c.longestBeam, s.longestBeam);
  if (s.coreId === 'splitter') c.mostSplits = Math.max(c.mostSplits, s.maxSplits);
  if (s.wipeout && s.seconds > 0) {
    const t = Math.max(1, Math.round(s.seconds));
    c.fastestWipeout = c.fastestWipeout === 0 ? t : Math.min(c.fastestWipeout, t);
  }
  return c;
}

/** Record a match played in the run on `save`. Returns the same save unchanged when there is no match to finish. */
export function applyMatch(save: Save, r: MatchResult): Applied {
  const run = save.run;
  if (!run || run.phase !== 'match') return { save, unlocked: [], ascension: null };
  const won = r.winner === 0;
  const next: RunState = finishMatch(run, { won, margin: r.margin, wipeout: r.wipeout });
  const s = save.stats;
  const sum = r.summary;
  const completed = next.phase === 'summary' && !run.endless;
  const runWon = completed && next.outcome === 'won';

  const prevCore = s.byCore[run.coreId];
  const core = recordCore(prevCore, sum, { endless: run.endless, round: next.round });
  if (runWon) core.runWins++;
  const stats = {
    ...s,
    matchesWon: s.matchesWon + (won ? 1 : 0),
    matchesLost: s.matchesLost + (won ? 0 : 1),
    runsCompleted: s.runsCompleted + (completed ? 1 : 0),
    runsWon: s.runsWon + (runWon ? 1 : 0),
    ultimates: s.ultimates + (sum?.ultimates ?? 0),
    pickups: s.pickups + (sum?.pickups ?? 0),
    wipeouts: s.wipeouts + (won && r.wipeout ? 1 : 0),
    bestRound: { ...s.bestRound, [run.coreId]: Math.max(s.bestRound[run.coreId] ?? 0, next.round) },
    byCore: { ...s.byCore, [run.coreId]: core },
  };

  let bestAscension = save.bestAscension;
  let ascension: number | null = null;
  if (runWon && run.mode === 'standard') {
    const earned = Math.min(MAX_ASCENSION, run.ascension + 1);
    if (earned > (bestAscension[run.coreId] ?? 0)) {
      bestAscension = { ...bestAscension, [run.coreId]: earned };
      ascension = earned;
    }
  }

  let out: Save = { ...save, run: next, stats, bestAscension };

  // Daily Clash: the first finished run of the day is the scored one.
  if (run.mode === 'daily' && next.phase === 'summary' && out.daily && out.daily.result === null) {
    const result: DailyResult = {
      coreId: run.coreId,
      won: next.outcome === 'won',
      round: next.round,
      rounds: rulesFor(run.ascension).rounds,
      grid: next.history.map(roundLetter).join(''),
      hearts: Math.max(0, next.hearts),
    };
    const day = out.daily.day;
    const streak = out.streak;
    const count = streak.last === day ? streak.count : streak.last === previousDay(day) ? streak.count + 1 : 1;
    out = {
      ...out,
      daily: { day, result },
      streak: { last: day, count, best: Math.max(streak.best, count) },
    };
  }

  const unlocked = newlyMet(out.unlocks, { match: sum ?? null, run: next, stats });
  if (unlocked.length > 0) {
    out = {
      ...out,
      unlocks: {
        cores: [...out.unlocks.cores, ...unlocked.filter((f) => f.kind === 'core').map((f) => f.id)],
        mods: [...out.unlocks.mods, ...unlocked.filter((f) => f.kind === 'mod').map((f) => f.id)],
      },
    };
  }
  return { save: out, unlocked, ascension };
}
