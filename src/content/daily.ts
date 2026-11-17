/**
 * Daily Clash: one seeded run per UTC day. Everything derives from the date
 * string, so every player gets the same Core, the same seed and (with the same
 * choices) the same offers and rivals. Pure functions; the clock is passed in.
 */
import { cores } from './cores';

const DAY_MS = 86_400_000;

const pad = (n: number, w: number): string => String(n).padStart(w, '0');

/** Days since 1970-01-01 to a civil date (Hinnant's algorithm; no Date, so this file stays clock-free). */
function civilFromDays(z0: number): [number, number, number] {
  const z = z0 + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return [yoe + era * 400 + (m <= 2 ? 1 : 0), m, d];
}

function daysFromCivil(y0: number, m: number, d: number): number {
  const y = m <= 2 ? y0 - 1 : y0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m > 2 ? m - 3 : m + 9) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function dayString(days: number): string {
  const [y, m, d] = civilFromDays(days);
  return `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`;
}

/** "YYYY-MM-DD" in UTC for a millisecond timestamp (the caller supplies the clock). */
export function utcDay(nowMs: number): string {
  return dayString(Math.floor(nowMs / DAY_MS));
}

/** Days since 1970-01-01 for a "YYYY-MM-DD" string, or NaN if it is not one. */
export function dayNumber(day: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return NaN;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return NaN;
  return daysFromCivil(y, mo, d);
}

/** The day before `day`. */
export function previousDay(day: string): string {
  const n = dayNumber(day);
  return Number.isFinite(n) ? dayString(n - 1) : day;
}

/** FNV-1a over the date string, folded to a positive 31-bit seed. */
export function dailySeed(day: string): number {
  let h = 0x811c9dc5;
  const s = `turfbreak-daily-${day}`;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0) % 2_147_483_647;
}

/** The Core of the day: every Core in turn, whether or not the player has unlocked it. */
export function dailyCoreId(day: string): string {
  const n = dayNumber(day);
  const i = Number.isFinite(n) ? ((n % cores.length) + cores.length) % cores.length : 0;
  return cores[i]!.id;
}

export interface DailyResult {
  coreId: string;
  won: boolean;
  /** Round the run ended on. */
  round: number;
  /** Rounds in a full run. */
  rounds: number;
  /** One letter per round played: W win, S win by Wipeout, L loss. */
  grid: string;
  hearts: number;
}

const EMOJI: Record<string, string> = { W: '🟩', S: '🟨', L: '🟥' };

/** The emoji row for a grid string. */
export function gridEmoji(grid: string): string {
  return [...grid].map((c) => EMOJI[c] ?? '⬜').join('');
}

/** Compact shareable text block. */
export function dailyShareText(day: string, coreName: string, r: DailyResult): string {
  return [
    `Turfbreak Daily Clash ${day}`,
    `${coreName} · ${r.won ? `Run won (${r.rounds}/${r.rounds})` : `Out in round ${r.round}/${r.rounds}`}`,
    gridEmoji(r.grid),
  ].join('\n');
}

/** Letter for one round of a run's history. */
export function roundLetter(h: { won: boolean; wipeout: boolean }): 'W' | 'S' | 'L' {
  return h.won ? (h.wipeout ? 'S' : 'W') : 'L';
}
