/**
 * Versioned save document (MASTER_PROMPT 4.3 rule 7). Version 2 adds settings, the
 * run in progress, stats, unlocks and best Ascension per Core. Every field falls
 * back to its default on its own, so one corrupt field never costs the rest.
 */
import type { DailyResult } from '../content/daily';
import { startingCores, startingMods } from '../content/unlocks';
import { parseRun, type RunState } from '../run/run';

export const SAVE_KEY = 'turfbreak.save';
export const SAVE_VERSION = 2;

export interface Settings {
  /** 0..1 */
  musicVolume: number;
  /** 0..1 */
  sfxVolume: number;
  haptics: boolean;
  reduceMotion: boolean;
  highContrast: boolean;
  /** Let the rival heuristic play the player's launch and ultimate. */
  autoPlay: boolean;
}

/** Lifetime records for one Core (MASTER_PROMPT 6.7). Zero means "none yet". */
export interface CoreStats {
  runs: number;
  runWins: number;
  /** Biggest winning margin, in cells. */
  bestMargin: number;
  /** Longest beam in a match (Ricochet), in arena units. */
  longestBeam: number;
  /** Most splits alive at once (Splitter). */
  mostSplits: number;
  /** Fastest Wipeout in seconds of match time; 0 = never. */
  fastestWipeout: number;
  /** Best round reached in Endless. */
  bestEndless: number;
}

export interface Stats {
  runsStarted: number;
  /** Runs that reached their summary (won or lost). Endless continuations do not count again. */
  runsCompleted: number;
  runsWon: number;
  matchesWon: number;
  matchesLost: number;
  /** Lifetime counts used by unlock feats. */
  ultimates: number;
  pickups: number;
  wipeouts: number;
  /** Highest round reached per Core id. */
  bestRound: Record<string, number>;
  byCore: Record<string, CoreStats>;
}

export interface Unlocks {
  cores: string[];
  mods: string[];
}

export interface SaveV2 {
  version: 2;
  launches: number;
  settings: Settings;
  run: RunState | null;
  stats: Stats;
  unlocks: Unlocks;
  /** Highest Ascension tier unlocked per Core id. */
  bestAscension: Record<string, number>;
  /** Daily Clash: the UTC day of the latest attempt and its result once the run is over. */
  daily: { day: string; result: DailyResult | null } | null;
  /** Consecutive days with a finished Daily Clash. Shown, never punished. */
  streak: { last: string; count: number; best: number };
}

export type Save = SaveV2;

export const defaultSettings = (): Settings => ({
  musicVolume: 0.7,
  sfxVolume: 0.8,
  haptics: true,
  reduceMotion: false,
  highContrast: false,
  autoPlay: false,
});

export const defaultCoreStats = (): CoreStats => ({
  runs: 0,
  runWins: 0,
  bestMargin: 0,
  longestBeam: 0,
  mostSplits: 0,
  fastestWipeout: 0,
  bestEndless: 0,
});

export const defaultStats = (): Stats => ({
  runsStarted: 0,
  runsCompleted: 0,
  runsWon: 0,
  matchesWon: 0,
  matchesLost: 0,
  ultimates: 0,
  pickups: 0,
  wipeouts: 0,
  bestRound: {},
  byCore: {},
});

/** What a new player has: the starting roster in `content/unlocks.ts`. */
export const defaultUnlocks = (): Unlocks => ({ cores: [...startingCores], mods: [...startingMods] });

/** `have` plus every id of `base` it lacks, in order. Saves never lose an unlock, and gain new starting content. */
function mergeIds(have: string[], base: readonly string[]): string[] {
  return [...have, ...base.filter((id) => !have.includes(id))];
}

export function defaultSave(): Save {
  return {
    version: SAVE_VERSION,
    launches: 0,
    settings: defaultSettings(),
    run: null,
    stats: defaultStats(),
    unlocks: defaultUnlocks(),
    bestAscension: {},
    daily: null,
    streak: { last: '', count: 0, best: 0 },
  };
}

type Doc = Record<string, unknown>;
type Migration = (doc: Doc) => Doc;

/** migrations[n] upgrades a version-n document to version n + 1. Append, never edit. */
const migrations: Record<number, Migration> = {
  // v1 held only the launch counter.
  1: (doc) => ({ launches: doc.launches, version: 2 }),
};

const isObj = (v: unknown): v is Doc => typeof v === 'object' && v !== null && !Array.isArray(v);
const count = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback);
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);
const unit = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback);
const strings = (v: unknown, fallback: string[]): string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string') ? [...(v as string[])] : fallback;

function countMap(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isObj(v)) return out;
  for (const [k, n] of Object.entries(v)) if (typeof n === 'number' && Number.isFinite(n) && n >= 0) out[k] = Math.floor(n);
  return out;
}

function readCoreStats(v: unknown): Record<string, CoreStats> {
  const out: Record<string, CoreStats> = {};
  if (!isObj(v)) return out;
  const d = defaultCoreStats();
  for (const [id, raw] of Object.entries(v)) {
    if (!isObj(raw)) continue;
    out[id] = {
      runs: count(raw.runs, d.runs),
      runWins: count(raw.runWins, d.runWins),
      bestMargin: count(raw.bestMargin, d.bestMargin),
      longestBeam: count(raw.longestBeam, d.longestBeam),
      mostSplits: count(raw.mostSplits, d.mostSplits),
      fastestWipeout: count(raw.fastestWipeout, d.fastestWipeout),
      bestEndless: count(raw.bestEndless, d.bestEndless),
    };
  }
  return out;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function readDaily(v: unknown): Save['daily'] {
  if (!isObj(v) || typeof v.day !== 'string' || !DAY.test(v.day)) return null;
  const r = v.result;
  if (!isObj(r)) return { day: v.day, result: null };
  if (typeof r.coreId !== 'string' || typeof r.won !== 'boolean' || typeof r.grid !== 'string') return { day: v.day, result: null };
  return {
    day: v.day,
    result: {
      coreId: r.coreId,
      won: r.won,
      round: Math.max(1, count(r.round, 1)),
      rounds: Math.max(1, count(r.rounds, 10)),
      grid: r.grid.slice(0, 64),
      hearts: count(r.hearts, 0),
    },
  };
}

function readSave(doc: Doc): Save {
  const d = defaultSave();
  const s = isObj(doc.settings) ? doc.settings : {};
  const st = isObj(doc.stats) ? doc.stats : {};
  const u = isObj(doc.unlocks) ? doc.unlocks : {};
  const sk = isObj(doc.streak) ? doc.streak : {};
  const runsWon = count(st.runsWon, 0);
  return {
    version: SAVE_VERSION,
    launches: count(doc.launches, 0),
    settings: {
      musicVolume: unit(s.musicVolume, d.settings.musicVolume),
      sfxVolume: unit(s.sfxVolume, d.settings.sfxVolume),
      haptics: bool(s.haptics, d.settings.haptics),
      reduceMotion: bool(s.reduceMotion, d.settings.reduceMotion),
      highContrast: bool(s.highContrast, d.settings.highContrast),
      autoPlay: bool(s.autoPlay, d.settings.autoPlay),
    },
    run: doc.run === null || doc.run === undefined ? null : parseRun(doc.run),
    stats: {
      runsStarted: count(st.runsStarted, 0),
      // A save from before this counter: a won run was certainly completed.
      runsCompleted: Math.max(count(st.runsCompleted, 0), runsWon),
      runsWon,
      matchesWon: count(st.matchesWon, 0),
      matchesLost: count(st.matchesLost, 0),
      ultimates: count(st.ultimates, 0),
      pickups: count(st.pickups, 0),
      wipeouts: count(st.wipeouts, 0),
      bestRound: countMap(st.bestRound),
      byCore: readCoreStats(st.byCore),
    },
    // Merge the starting roster in: older saves had fewer starters and must lose nothing.
    unlocks: {
      cores: mergeIds(strings(u.cores, []), startingCores),
      mods: mergeIds(strings(u.mods, []), startingMods),
    },
    bestAscension: countMap(doc.bestAscension),
    daily: readDaily(doc.daily),
    streak: {
      last: typeof sk.last === 'string' && DAY.test(sk.last) ? sk.last : '',
      count: count(sk.count, 0),
      best: count(sk.best, 0),
    },
  };
}

/** Parse a stored save. Anything unreadable falls back to defaults; it never throws. */
export function parseSave(raw: string | null): Save {
  if (raw === null) return defaultSave();
  try {
    const doc: unknown = JSON.parse(raw);
    if (!isObj(doc)) return defaultSave();
    let record = doc;
    let version = typeof record.version === 'number' ? record.version : 0;
    if (version > SAVE_VERSION) return defaultSave();
    while (version < SAVE_VERSION) {
      const migrate = migrations[version];
      if (!migrate) return defaultSave();
      record = migrate(record);
      version++;
    }
    // A v1 document without a usable counter was never valid; v2 fields recover on their own.
    if (doc.version === 1 && !(typeof doc.launches === 'number' && Number.isFinite(doc.launches))) return defaultSave();
    return readSave(record);
  } catch {
    return defaultSave();
  }
}

export function serializeSave(save: Save): string {
  return JSON.stringify(save);
}
