import type { Save } from '../meta/save';
import type { Platform } from '../platform';
import { canAdReroll, canRevive, type RunState } from '../run/run';

/**
 * When the ad placements show (brief 7.1, 7.2). Pure, so the rules are tested
 * with a fake platform. Web and Android report `canShowRewarded() === false`,
 * so none of the rewarded placements is ever true there.
 */

/** No ads of any kind during a player's first run. */
export function isFirstRun(save: Pick<Save, 'stats'>): boolean {
  return save.stats.runsStarted <= 1;
}

/** "Free reroll (ad)" on the draft. */
export function showAdReroll(platform: Pick<Platform, 'canShowRewarded'>, save: Pick<Save, 'stats'>, run: RunState): boolean {
  return platform.canShowRewarded() && !isFirstRun(save) && canAdReroll(run);
}

/** "Revive: +1 heart (ad)" on the run summary. */
export function showRevive(platform: Pick<Platform, 'canShowRewarded'>, save: Pick<Save, 'stats'>, run: RunState): boolean {
  return platform.canShowRewarded() && !isFirstRun(save) && canRevive(run);
}

/**
 * The between-run interstitial, when the player leaves a finished run's summary.
 * Never after the first completed run, never when the same visit offered a revive
 * (CrazyGames: a midgame ad and a rewarded continue must not share a break), and
 * at most once per run (`shownFor` is the seed of the run that already had one).
 */
export function showInterstitial(save: Pick<Save, 'stats'>, run: RunState, reviveOffered: boolean, shownFor: number | null): boolean {
  if (run.phase !== 'summary') return false;
  if (save.stats.runsCompleted < 2) return false;
  if (reviveOffered) return false;
  return shownFor !== run.seed;
}

/**
 * Dev servers only (`npm run dev`, then add `?fakeads` to the URL): pretend the
 * platform has rewarded ads so the buttons can be seen. `import.meta.env.DEV` is
 * false in every build, so this is removed from shipped bundles.
 */
export function withDevFakeAds(p: Platform): Platform {
  if (!import.meta.env.DEV || typeof location === 'undefined' || !location.search.includes('fakeads')) return p;
  return { ...p, canShowRewarded: () => true, showRewarded: async () => 'rewarded' };
}
