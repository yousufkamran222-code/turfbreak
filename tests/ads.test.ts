import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Synth } from '../src/audio/synth';
import { defaultSave } from '../src/meta/save';
import type { Platform } from '../src/platform';
import type { RewardedResult } from '../src/platform/types';
import { Game } from '../src/ui/game';
import { showAdReroll, showInterstitial, showRevive } from '../src/ui/ads';

interface Fake extends Platform {
  rewardedCalls: number;
  interstitials: number;
  result: RewardedResult;
  ads: boolean;
}

function fakePlatform(ads = true): Fake {
  const store = new Map<string, string>();
  const p: Fake = {
    rewardedCalls: 0,
    interstitials: 0,
    result: 'rewarded',
    ads,
    id: 'crazygames',
    canShareFiles: true,
    init: async () => {},
    loadingFinished() {},
    gameplayStart() {},
    gameplayStop() {},
    happyMoment() {},
    canShowRewarded: () => p.ads,
    showRewarded: async () => {
      p.rewardedCalls++;
      return p.result;
    },
    showInterstitial: async () => {
      p.interstitials++;
    },
    storageGet: async (k) => store.get(k) ?? null,
    storageSet: async (k, v) => void store.set(k, v),
    haptic: () => {},
    share: async () => false,
    copy: async () => true,
    onPause: () => () => {},
    onResume: () => () => {},
    onBack: () => () => {},
  };
  return p;
}

const synth = { setVolumes: vi.fn(), setMuted: vi.fn() } as unknown as Synth;

beforeEach(() => {
  vi.stubGlobal('document', { documentElement: { classList: { toggle: () => {} } } });
});

/** Lose every match until the run reaches its summary. */
function loseOut(game: Game): void {
  for (let i = 0; i < 60 && game.save.value.run?.phase !== 'summary'; i++) {
    const run = game.save.value.run!;
    if (run.phase === 'draft') game.pick(null);
    else game.finish({ winner: 1, margin: 5, wipeout: false });
  }
}

/** A game whose player has finished `n` lost runs and sits in the draft of the next one. */
function gameAfterRuns(p: Platform, n: number): Game {
  const game = new Game(p, synth, defaultSave());
  for (let i = 0; i < n; i++) {
    game.begin('ricochet', 0);
    loseOut(game);
  }
  game.begin('ricochet', 0);
  return game;
}

describe('ad visibility (pure rules)', () => {
  it('shows nothing on a platform without rewarded ads (web, Android)', () => {
    const p = fakePlatform(false);
    const game = gameAfterRuns(p, 1);
    expect(showAdReroll(p, game.save.value, game.save.value.run!)).toBe(false);
    loseOut(game);
    expect(showRevive(p, game.save.value, game.save.value.run!)).toBe(false);
    expect(game.adRerollVisible).toBe(false);
    expect(game.reviveVisible).toBe(false);
  });

  it('shows neither rewarded button during the first run', () => {
    const p = fakePlatform();
    const game = new Game(p, synth, defaultSave());
    game.begin('ricochet', 0);
    expect(showAdReroll(p, game.save.value, game.save.value.run!)).toBe(false);
    loseOut(game);
    expect(game.save.value.run?.phase).toBe('summary');
    expect(showRevive(p, game.save.value, game.save.value.run!)).toBe(false);
  });

  it('shows the reroll from the second run, once per draft', async () => {
    const p = fakePlatform();
    const game = gameAfterRuns(p, 1);
    expect(game.adRerollVisible).toBe(true);
    const before = game.save.value.run!.rerolls;
    await game.adReroll();
    expect(game.save.value.run!.rerolls).toBe(before + 1);
    expect(game.adRerollVisible).toBe(false);
  });

  it('does nothing, silently, when the ad is dismissed or unavailable', async () => {
    const p = fakePlatform();
    const game = gameAfterRuns(p, 1);
    const before = game.save.value.run;
    for (const r of ['dismissed', 'unavailable'] as const) {
      p.result = r;
      await game.adReroll();
    }
    expect(p.rewardedCalls).toBe(2);
    expect(game.save.value.run).toBe(before);
    expect(game.adRerollVisible).toBe(true);
  });

  it('never offers either in the Daily Clash', () => {
    const p = fakePlatform();
    const game = gameAfterRuns(p, 1);
    game.clearRun();
    game.beginDaily(Date.UTC(2026, 10, 17));
    expect(game.save.value.run?.mode).toBe('daily');
    expect(game.adRerollVisible).toBe(false);
    loseOut(game);
    expect(game.reviveVisible).toBe(false);
  });
});

describe('revive', () => {
  it('goes straight to the draft with one heart, and does not double-count the loss', async () => {
    const p = fakePlatform();
    const game = gameAfterRuns(p, 1);
    loseOut(game);
    const lost = game.save.value;
    expect(lost.stats.runsCompleted).toBe(2);
    expect(game.reviveVisible).toBe(true);
    await game.revive();
    const s = game.save.value;
    expect(s.run?.phase).toBe('draft');
    expect(s.run?.hearts).toBe(1);
    expect(s.stats.runsCompleted).toBe(1);
    expect(game.reviveVisible).toBe(false);
    // Losing again ends the run and counts it once.
    loseOut(game);
    expect(game.save.value.stats.runsCompleted).toBe(2);
    expect(game.save.value.stats.runsStarted).toBe(2);
  });

  it('leaves everything alone when the ad is not completed', async () => {
    const p = fakePlatform();
    const game = gameAfterRuns(p, 1);
    loseOut(game);
    const before = game.save.value;
    p.result = 'dismissed';
    await game.revive();
    expect(game.save.value).toBe(before);
  });
});

describe('between-run interstitial', () => {
  it('is skipped after the first completed run', async () => {
    const p = fakePlatform(false);
    const game = new Game(p, synth, defaultSave());
    game.begin('ricochet', 0);
    loseOut(game);
    const next = vi.fn();
    await game.leaveSummary(next);
    expect(p.interstitials).toBe(0);
    expect(next).toHaveBeenCalledOnce();
  });

  it('plays after a later run, once, then continues', async () => {
    const p = fakePlatform(false);
    const game = gameAfterRuns(p, 1);
    loseOut(game);
    const order: string[] = [];
    await game.leaveSummary(() => order.push('next'));
    await game.leaveSummary(() => order.push('next2'));
    expect(p.interstitials).toBe(1);
    expect(order).toEqual(['next', 'next2']);
  });

  it('never shares a break with a revive offer', async () => {
    const p = fakePlatform(true);
    const game = gameAfterRuns(p, 1);
    loseOut(game);
    expect(game.reviveVisible).toBe(true);
    await game.leaveSummary(() => {});
    expect(p.interstitials).toBe(0);
  });

  it('shows after a revived run that is lost again', async () => {
    const p = fakePlatform(true);
    const game = gameAfterRuns(p, 1);
    loseOut(game);
    await game.revive();
    loseOut(game);
    await game.leaveSummary(() => {});
    expect(p.interstitials).toBe(1);
  });

  it('pure rule: needs a summary, two completed runs, no revive offer and no earlier ad', () => {
    const game = gameAfterRuns(fakePlatform(false), 1);
    loseOut(game);
    const { stats } = game.save.value;
    const run = game.save.value.run!;
    expect(showInterstitial({ stats }, run, false, null)).toBe(true);
    expect(showInterstitial({ stats }, run, true, null)).toBe(false);
    expect(showInterstitial({ stats }, run, false, run.seed)).toBe(false);
    expect(showInterstitial({ stats: { ...stats, runsCompleted: 1 } }, run, false, null)).toBe(false);
  });
});
