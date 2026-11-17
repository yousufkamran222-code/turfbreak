import type { RoundResult } from '../run/run';

/** The best moment of a run: a Wipeout if there was one, else the biggest win. */
export function bestMoment(history: readonly RoundResult[]): string | null {
  const wins = history.filter((h) => h.won);
  const w = wins.filter((h) => h.wipeout).sort((a, b) => b.margin - a.margin)[0];
  if (w) return `WIPEOUT in round ${w.round} vs ${w.rivalName}`;
  const big = [...wins].sort((a, b) => b.margin - a.margin)[0];
  if (big) return `Round ${big.round}: won by ${big.margin} cells vs ${big.rivalName}`;
  return null;
}
