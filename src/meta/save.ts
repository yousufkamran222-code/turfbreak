/**
 * Versioned save document (MASTER_PROMPT 4.3 rule 7). Version 2 adds settings, the
 * run in progress, stats, unlocks and best Ascension per Core. Every field falls
 * back to its default on its own, so one corrupt field never costs the rest.
 */
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

export interface Stats {
  runsStarted: number;
  runsWon: number;
  matchesWon: number;
  matchesLost: number;
  /** Highest round reached per Core id. */
  bestRound: Record<string, number>;
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

export const defaultStats = (): Stats => ({ runsStarted: 0, runsWon: 0, matchesWon: 0, matchesLost: 0, bestRound: {} });

/** What a new player has: the two first Cores and the nine first Mods. */
export const defaultUnlocks = (): Unlocks => ({
  cores: ['ricochet', 'splitter'],
  mods: [
    'overclock',
    'growth-spurt',
    'chain-reaction',
    'afterburner',
    'shockwave',
    'bulwark',
    'magnet',
    'encore',
    'head-start',
  ],
});

export function defaultSave(): Save {
  return {
    version: SAVE_VERSION,
    launches: 0,
    settings: defaultSettings(),
    run: null,
    stats: defaultStats(),
    unlocks: defaultUnlocks(),
    bestAscension: {},
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

function readSave(doc: Doc): Save {
  const d = defaultSave();
  const s = isObj(doc.settings) ? doc.settings : {};
  const st = isObj(doc.stats) ? doc.stats : {};
  const u = isObj(doc.unlocks) ? doc.unlocks : {};
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
      runsWon: count(st.runsWon, 0),
      matchesWon: count(st.matchesWon, 0),
      matchesLost: count(st.matchesLost, 0),
      bestRound: countMap(st.bestRound),
    },
    unlocks: { cores: strings(u.cores, d.unlocks.cores), mods: strings(u.mods, d.unlocks.mods) },
    bestAscension: countMap(doc.bestAscension),
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
