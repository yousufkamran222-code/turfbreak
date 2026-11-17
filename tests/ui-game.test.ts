import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Synth } from '../src/audio/synth';
import { defaultSave, parseSave, SAVE_KEY } from '../src/meta/save';
import type { Platform } from '../src/platform';
import { fx } from '../src/render/fx';
import { matchConfig, type RunState } from '../src/run/run';
import { Game } from '../src/ui/game';
import { clock } from '../src/ui/Hud';
import { bestMoment } from '../src/ui/moment';

function fakePlatform(): Platform & { store: Map<string, string>; buzz: string[] } {
  const store = new Map<string, string>();
  const buzz: string[] = [];
  return {
    store,
    buzz,
    id: 'web',
    canShareFiles: true,
    init: async () => {},
    loadingFinished() {},
    gameplayStart() {},
    gameplayStop() {},
    happyMoment() {},
    canShowRewarded: () => false,
    showRewarded: async () => 'unavailable',
    showInterstitial: async () => {},
    storageGet: async (k) => store.get(k) ?? null,
    storageSet: async (k, v) => void store.set(k, v),
    haptic: (k) => void buzz.push(k),
    share: async () => false,
    copy: async () => true,
    onPause: () => () => {},
    onResume: () => () => {},
    onBack: () => () => {},
  };
}

const synth = { setVolumes: vi.fn(), setMuted: vi.fn() } as unknown as Synth;

beforeEach(() => {
  vi.stubGlobal('document', {
    documentElement: { classList: { toggle: () => {} } },
  });
});

/** Play a run to its end with every match won by `margin`. */
function winAll(game: Game, margin: number): void {
  for (let i = 0; i < 40 && game.save.value.run && game.save.value.run.phase !== 'summary'; i++) {
    const run = game.save.value.run;
    if (run.phase === 'draft') {
      // A full build cannot take a new Mod without choosing a slot: skip instead.
      const id = run.offer.find((o) => run.build.some((e) => e.id === o) || run.build.length < 6);
      game.pick(id ?? null);
    }
    else if (run.phase === 'match') game.finish({ winner: 0, margin, wipeout: false });
  }
}

describe('clock', () => {
  it('formats seconds as m:ss', () => {
    expect([40, 16, 9, 0, 75].map(clock)).toEqual(['0:40', '0:16', '0:09', '0:00', '1:15']);
  });
});

describe('Game', () => {
  it('saves the run after every change and parses it back', () => {
    const p = fakePlatform();
    const game = new Game(p, synth, defaultSave());
    game.begin('ricochet', 0);
    expect(parseSave(p.store.get(SAVE_KEY) ?? null).run?.phase).toBe('draft');
    game.pick(game.save.value.run!.offer[0]!);
    const saved = parseSave(p.store.get(SAVE_KEY) ?? null).run as RunState;
    expect(saved.phase).toBe('match');
    expect(() => matchConfig(saved)).not.toThrow();
    expect(game.save.value.stats.runsStarted).toBe(1);
  });

  it('a won run unlocks the next Ascension for that Core only, and counts the win once', () => {
    const game = new Game(fakePlatform(), synth, defaultSave());
    game.begin('ricochet', 0);
    winAll(game, 30);
    const s = game.save.value;
    expect(s.run?.outcome).toBe('won');
    expect(s.bestAscension).toEqual({ ricochet: 1 });
    expect(s.stats.runsWon).toBe(1);
    expect(s.stats.matchesWon).toBe(10);
    expect(s.stats.bestRound.ricochet).toBe(10);
    expect(game.unlocked.value).toBe(1);
    game.endless();
    expect(game.save.value.run?.endless).toBe(true);
    // Losing out in Endless does not count a second win.
    for (let i = 0; i < 40 && game.save.value.run?.phase !== 'summary'; i++) {
      const run = game.save.value.run!;
      if (run.phase === 'draft') game.pick(null);
      else game.finish({ winner: 1, margin: 5, wipeout: false });
    }
    expect(game.save.value.stats.runsWon).toBe(1);
    expect(game.save.value.run?.outcome).toBe('lost');
    expect(game.save.value.stats.matchesLost).toBe(3);
  });

  it('the draft hint is remembered once seen, and survives a Core change and a reload', async () => {
    const p = fakePlatform();
    const game = new Game(p, synth, defaultSave());
    expect(game.prefs.value.draftHintSeen).toBeFalsy();
    game.markDraftHintSeen();
    game.setPrefs({ coreId: 'splitter', ascension: 0 });
    expect(game.prefs.value.draftHintSeen).toBe(true);
    const again = new Game(p, synth, defaultSave());
    await again.loadPrefs();
    expect(again.prefs.value.draftHintSeen).toBe(true);
  });

  it('clamps the chosen Ascension to what the Core has earned', () => {
    const save = defaultSave();
    save.bestAscension = { ricochet: 2 };
    const game = new Game(fakePlatform(), synth, save);
    game.setPrefs({ coreId: 'ricochet', ascension: 7 });
    expect(game.prefs.value.ascension).toBe(2);
    game.setPrefs({ coreId: 'splitter', ascension: 3 });
    expect(game.prefs.value).toEqual({ coreId: 'splitter', ascension: 0 });
    game.setPrefs({ coreId: 'locked-core', ascension: 0 });
    expect(['ricochet', 'splitter']).toContain(game.prefs.value.coreId);
  });

  it('settings apply at once: reduce motion zeroes juice, haptics gate the platform', () => {
    const p = fakePlatform();
    const game = new Game(p, synth, defaultSave());
    game.setSettings({ reduceMotion: true, highContrast: true });
    expect(fx.intensity).toBe(0);
    expect(fx.highContrast).toBe(true);
    game.haptic('light');
    expect(p.buzz).toEqual(['light']);
    game.setSettings({ haptics: false, reduceMotion: false, highContrast: false });
    game.haptic('heavy');
    expect(p.buzz).toEqual(['light']);
    expect(fx.intensity).toBe(1);
    expect(parseSave(p.store.get(SAVE_KEY) ?? null).settings.haptics).toBe(false);
  });
});

describe('bestMoment', () => {
  it('prefers a Wipeout, then the biggest win', () => {
    const h = (round: number, won: boolean, margin: number, wipeout = false) => ({ round, won, margin, wipeout, rivalName: 'X' });
    expect(bestMoment([])).toBeNull();
    expect(bestMoment([h(1, false, 9)])).toBeNull();
    expect(bestMoment([h(1, true, 10), h(2, true, 30)])).toContain('won by 30');
    expect(bestMoment([h(1, true, 10, true), h(2, true, 30)])).toContain('WIPEOUT in round 1');
  });
});
