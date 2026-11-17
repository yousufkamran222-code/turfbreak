import { signal } from '@preact/signals';
import type { Synth } from '../audio/synth';
import { cores } from '../content/cores';
import { mods } from '../content/mods';
import type { Platform } from '../platform';
import { setHighContrast, setReduceMotion } from '../render/fx';
import { dailyCoreId, dailySeed, utcDay } from '../content/daily';
import { featFor, type Feat, type MatchSummary } from '../content/unlocks';
import { applyMatch } from '../meta/progress';
import { adReroll, canAdReroll, canRevive, continueEndless, MAX_ASCENSION, pickMod, replaceMod, revive, rerollOffer, startRun, type RunState } from '../run/run';
import { showAdReroll, showInterstitial, showRevive, withDevFakeAds } from './ads';
import { defaultCoreStats, SAVE_KEY, serializeSave, type Save, type Settings } from '../meta/save';

const PREFS_KEY = 'turfbreak.ui';

/** What the player last picked on the home screen. Not part of the save document. */
export interface Prefs {
  coreId: string;
  ascension: number;
  /** The one-line draft hint has been shown once. */
  draftHintSeen?: boolean;
}

export interface MatchOutcome {
  winner: 0 | 1;
  margin: number;
  wipeout: boolean;
  /** What the match counted for unlock feats and records. */
  summary?: MatchSummary | undefined;
}

/** A fresh seed for a run. UI-side randomness only; every run is reproducible from it. */
export function newSeed(): number {
  return Math.floor(Math.random() * 2_147_483_647);
}

/** Highest Ascension tier the player may start for a Core. */
export function maxTier(save: Save, coreId: string): number {
  return Math.max(0, Math.min(MAX_ASCENSION, save.bestAscension[coreId] ?? 0));
}

/** The Versus Lab opens after the first completed run, won or lost. */
export function labUnlocked(save: Save): boolean {
  return save.stats.runsCompleted > 0 || save.stats.runsWon > 0;
}

/** Unlocked Core ids that still exist in content. */
export function unlockedCores(save: Save): string[] {
  return save.unlocks.cores.filter((id) => cores.some((c) => c.id === id));
}

/**
 * The app's state: the save document in a signal, plus every change to it. Each
 * change is written through the platform adapter at once, so a run survives a
 * reload or a killed app at any moment.
 */
export class Game {
  readonly save = signal<Save>(undefined as unknown as Save);
  readonly prefs = signal<Prefs>({ coreId: 'ricochet', ascension: 0 });
  /** The Ascension tier a just-won run unlocked, for the summary. Not saved. */
  readonly unlocked = signal<number | null>(null);
  /** Feats just met, for the "UNLOCKED" banner. Not saved. */
  readonly newFeats = signal<Feat[]>([]);
  readonly platform: Platform;

  constructor(
    platform: Platform,
    readonly synth: Synth,
    initial: Save,
  ) {
    this.platform = withDevFakeAds(platform);
    this.save.value = initial;
    this.applySettings();
  }

  async loadPrefs(): Promise<void> {
    try {
      const raw = await this.platform.storageGet(PREFS_KEY);
      const doc: unknown = raw ? JSON.parse(raw) : null;
      if (typeof doc === 'object' && doc !== null) {
        const d = doc as Record<string, unknown>;
        const coreId = typeof d.coreId === 'string' ? d.coreId : this.prefs.value.coreId;
        const ascension = typeof d.ascension === 'number' && Number.isFinite(d.ascension) ? Math.floor(d.ascension) : 0;
        this.setPrefs({ coreId, ascension, draftHintSeen: d.draftHintSeen === true }, false);
      }
    } catch {
      // Corrupt preferences fall back to the defaults.
    }
    if (this.save.value.run) this.setPrefs({ coreId: this.save.value.run.coreId, ascension: this.save.value.run.ascension }, false);
  }

  /** Keep the chosen Core unlocked and the tier within what that Core has earned. */
  setPrefs(p: Prefs, persist = true): void {
    const s = this.save.value;
    const open = unlockedCores(s);
    const coreId = open.includes(p.coreId) ? p.coreId : (open[0] ?? p.coreId);
    const ascension = Math.max(0, Math.min(maxTier(s, coreId), Math.floor(p.ascension)));
    const seen = p.draftHintSeen ?? this.prefs.value.draftHintSeen ?? false;
    this.prefs.value = seen ? { coreId, ascension, draftHintSeen: true } : { coreId, ascension };
    if (persist) void this.platform.storageSet(PREFS_KEY, JSON.stringify(this.prefs.value));
  }

  /** Remember that the first-draft hint was shown, so it never shows again. */
  markDraftHintSeen(): void {
    if (this.prefs.value.draftHintSeen) return;
    this.setPrefs({ ...this.prefs.value, draftHintSeen: true });
  }

  get settings(): Settings {
    return this.save.value.settings;
  }

  commit(next: Save): void {
    this.save.value = next;
    void this.platform.storageSet(SAVE_KEY, serializeSave(next));
  }

  /** Push the settings into the audio buses, the renderer and the page. */
  applySettings(): void {
    const s = this.settings;
    this.synth.setVolumes(s.musicVolume, s.sfxVolume);
    setReduceMotion(s.reduceMotion);
    setHighContrast(s.highContrast);
    const cls = document.documentElement.classList;
    cls.toggle('reduce-motion', s.reduceMotion);
    cls.toggle('high-contrast', s.highContrast);
  }

  setSettings(patch: Partial<Settings>): void {
    this.commit({ ...this.save.value, settings: { ...this.settings, ...patch } });
    this.applySettings();
  }

  haptic(kind: 'light' | 'medium' | 'heavy'): void {
    if (this.settings.haptics) this.platform.haptic(kind);
  }

  private setRun(run: RunState | null, stats?: Save['stats'], bestAscension?: Save['bestAscension']): void {
    const s = this.save.value;
    this.commit({ ...s, run, stats: stats ?? s.stats, bestAscension: bestAscension ?? s.bestAscension });
  }

  begin(coreId: string, ascension: number): void {
    const s = this.save.value;
    const tier = Math.min(ascension, maxTier(s, coreId));
    const run = startRun({ seed: newSeed(), coreId, ascension: tier, unlockedMods: s.unlocks.mods });
    this.unlocked.value = null;
    this.setPrefs({ coreId, ascension: tier });
    this.setRun(run, this.countRun(s.stats, coreId));
  }

  private countRun(stats: Save['stats'], coreId: string): Save['stats'] {
    const c = stats.byCore[coreId] ?? defaultCoreStats();
    return { ...stats, runsStarted: stats.runsStarted + 1, byCore: { ...stats.byCore, [coreId]: { ...c, runs: c.runs + 1 } } };
  }

  /** Today's Daily Clash, if it has not been finished yet: fixed Core and seed, every Mod in the pool. */
  beginDaily(nowMs: number = Date.now()): void {
    const s = this.save.value;
    const day = utcDay(nowMs);
    if (s.daily?.day === day && s.daily.result) return;
    const coreId = dailyCoreId(day);
    // The pool is every Mod, whatever the player has unlocked, so everyone sees the same offers.
    const run = startRun({ seed: dailySeed(day), coreId, ascension: 0, mode: 'daily' });
    this.unlocked.value = null;
    this.newFeats.value = [];
    this.commit({ ...s, run, daily: { day, result: null }, stats: this.countRun(s.stats, coreId) });
  }

  pick(modId: string | null): void {
    const run = this.save.value.run;
    if (run) this.setRun(pickMod(run, modId));
  }

  reroll(): void {
    const run = this.save.value.run;
    if (run) this.setRun(rerollOffer(run));
  }

  replace(modId: string, slot: number): void {
    const run = this.save.value.run;
    if (run) this.setRun(replaceMod(run, modId, slot));
  }

  /** Record a match: run state, stats, records, feats and, on a first win at a tier, the next Ascension. */
  finish(o: MatchOutcome): void {
    const done = applyMatch(this.save.value, o);
    if (done.save === this.save.value) return;
    if (done.ascension !== null) this.unlocked.value = done.ascension;
    this.newFeats.value = done.unlocked;
    this.commit(done.save);
  }

  /** Seed of the run whose between-run interstitial was already requested (at most one per run). */
  private interstitialFor: number | null = null;
  private adBusy = false;

  /** Whether the draft offers the rewarded reroll right now. */
  get adRerollVisible(): boolean {
    const run = this.save.value.run;
    return !!run && showAdReroll(this.platform, this.save.value, run);
  }

  /** Whether the summary offers the rewarded revive right now. */
  get reviveVisible(): boolean {
    const run = this.save.value.run;
    return !!run && showRevive(this.platform, this.save.value, run);
  }

  /** Watch a rewarded ad for one extra reroll. Anything but 'rewarded' changes nothing and says nothing. */
  async adReroll(): Promise<void> {
    if (this.adBusy || !this.adRerollVisible) return;
    this.adBusy = true;
    try {
      if ((await this.platform.showRewarded()) !== 'rewarded') return;
      const run = this.save.value.run;
      if (run && canAdReroll(run)) this.setRun(adReroll(run));
    } finally {
      this.adBusy = false;
    }
  }

  /**
   * Watch a rewarded ad to come back with one heart. Entering the summary had
   * counted the run as completed; a revived run is still in progress, so that
   * count is taken back and the run ends (and counts) again when it really ends.
   */
  async revive(): Promise<void> {
    if (this.adBusy || !this.reviveVisible) return;
    this.adBusy = true;
    try {
      if ((await this.platform.showRewarded()) !== 'rewarded') return;
      const run = this.save.value.run;
      if (!run || !canRevive(run)) return;
      const s = this.save.value.stats;
      const stats = run.endless ? s : { ...s, runsCompleted: Math.max(0, s.runsCompleted - 1) };
      this.unlocked.value = null;
      this.setRun(revive(run), stats);
    } finally {
      this.adBusy = false;
    }
  }

  /**
   * Leave a finished run's summary (Play again or Home): the between-run ad, if
   * one is due, then `next`. The ad never shows when this visit offered a revive.
   */
  async leaveSummary(next: () => void): Promise<void> {
    if (this.adBusy) return;
    const run = this.save.value.run;
    if (run && showInterstitial(this.save.value, run, this.reviveVisible, this.interstitialFor)) {
      this.interstitialFor = run.seed;
      this.adBusy = true;
      try {
        await this.platform.showInterstitial();
      } catch {
        // An ad failure never blocks the player.
      } finally {
        this.adBusy = false;
      }
    }
    next();
  }

  endless(): void {
    const run = this.save.value.run;
    if (run && run.mode === 'standard') this.setRun(continueEndless(run));
  }

  /** Drop the run in progress (quit, or a finished summary). */
  clearRun(): void {
    this.unlocked.value = null;
    this.setRun(null);
  }
}

/** "UNLOCKED: Bloom" lines for a set of feats. */
export function featName(f: Pick<Feat, 'kind' | 'id'>): string {
  const name = f.kind === 'core' ? cores.find((c) => c.id === f.id)?.name : mods.find((m) => m.id === f.id)?.name;
  return name ?? f.id;
}

export { MAX_ASCENSION, featFor };
