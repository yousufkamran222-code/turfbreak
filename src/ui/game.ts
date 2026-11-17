import { signal } from '@preact/signals';
import type { Synth } from '../audio/synth';
import { cores } from '../content/cores';
import type { Platform } from '../platform';
import { setHighContrast, setReduceMotion } from '../render/fx';
import {
  continueEndless,
  finishMatch,
  MAX_ASCENSION,
  pickMod,
  replaceMod,
  rerollOffer,
  startRun,
  type RunState,
} from '../run/run';
import { SAVE_KEY, serializeSave, type Save, type Settings } from '../meta/save';

const PREFS_KEY = 'turfbreak.ui';

/** What the player last picked on the home screen. Not part of the save document. */
export interface Prefs {
  coreId: string;
  ascension: number;
}

export interface MatchOutcome {
  winner: 0 | 1;
  margin: number;
  wipeout: boolean;
}

/** A fresh seed for a run. UI-side randomness only; every run is reproducible from it. */
export function newSeed(): number {
  return Math.floor(Math.random() * 2_147_483_647);
}

/** Highest Ascension tier the player may start for a Core. */
export function maxTier(save: Save, coreId: string): number {
  return Math.max(0, Math.min(MAX_ASCENSION, save.bestAscension[coreId] ?? 0));
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

  constructor(
    readonly platform: Platform,
    readonly synth: Synth,
    initial: Save,
  ) {
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
        this.setPrefs({ coreId, ascension }, false);
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
    this.prefs.value = { coreId, ascension };
    if (persist) void this.platform.storageSet(PREFS_KEY, JSON.stringify(this.prefs.value));
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
    this.setRun(run, { ...s.stats, runsStarted: s.stats.runsStarted + 1 });
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

  /** Record a match: run state, stats, best round and, on a first win at a tier, the next Ascension. */
  finish(o: MatchOutcome): void {
    const s = this.save.value;
    const run = s.run;
    if (!run || run.phase !== 'match') return;
    const next = finishMatch(run, { won: o.winner === 0, margin: o.margin, wipeout: o.wipeout });
    const stats = {
      ...s.stats,
      matchesWon: s.stats.matchesWon + (o.winner === 0 ? 1 : 0),
      matchesLost: s.stats.matchesLost + (o.winner === 0 ? 0 : 1),
      bestRound: { ...s.stats.bestRound, [run.coreId]: Math.max(s.stats.bestRound[run.coreId] ?? 0, next.round) },
    };
    let bestAscension = s.bestAscension;
    if (next.phase === 'summary' && next.outcome === 'won' && !run.endless) {
      stats.runsWon++;
      const earned = Math.min(MAX_ASCENSION, run.ascension + 1);
      if (earned > (bestAscension[run.coreId] ?? 0)) {
        bestAscension = { ...bestAscension, [run.coreId]: earned };
        this.unlocked.value = earned;
      }
    }
    this.setRun(next, stats, bestAscension);
  }

  endless(): void {
    const run = this.save.value.run;
    if (run) this.setRun(continueEndless(run));
  }

  /** Drop the run in progress (quit, or a finished summary). */
  clearRun(): void {
    this.unlocked.value = null;
    this.setRun(null);
  }
}

export { MAX_ASCENSION };
