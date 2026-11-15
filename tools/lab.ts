/**
 * Headless balance lab (MASTER_PROMPT 7.6).
 *
 *   npm run lab -- --a ricochet --b splitter --seeds 500 [--report docs/balance/name.md] [--smoke]
 *
 * Every seed is played twice with the sides swapped, so side bias cancels out
 * (once for a mirror match, where swapping changes nothing).
 * --smoke checks invariants on every step and exits non-zero on any failure.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { coreById, cores } from '../src/content/cores';
import { tuning } from '../src/content/tuning';
import { runMatch, type MatchResult } from '../src/sim/match';
import type { World } from '../src/sim/world';
import { checkInvariants } from '../src/sim/invariants';

interface Args {
  a: string;
  b: string;
  seeds: number;
  start: number;
  report: string | null;
  smoke: boolean;
  matrix: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { a: 'ricochet', b: 'splitter', seeds: 500, start: 1, report: null, smoke: false, matrix: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === '--smoke') args.smoke = true;
    else if (k === '--matrix') args.matrix = true;
    else if (v !== undefined) {
      if (k === '--a') args.a = v;
      else if (k === '--b') args.b = v;
      else if (k === '--seeds') args.seeds = Number(v);
      else if (k === '--start') args.start = Number(v);
      else if (k === '--report') args.report = v;
      else continue;
      i++;
    }
  }
  return args;
}

interface Pairing {
  a: string;
  b: string;
  games: number;
  winsA: number;
  side0Wins: number;
  leadChanges: number[];
  lastLeadChange: number[];
  decidedEarly: number;
  margins: number[];
  wipeouts: number;
  suddenDeaths: number;
  stacksA: number[];
  stacksB: number[];
  ms: number;
}

const stepsPerSecond = tuning.sim.stepsPerSecond;

function play(a: string, b: string, args: Args): Pairing {
  const p: Pairing = {
    a,
    b,
    games: 0,
    winsA: 0,
    side0Wins: 0,
    leadChanges: [],
    lastLeadChange: [],
    decidedEarly: 0,
    margins: [],
    wipeouts: 0,
    suddenDeaths: 0,
    stacksA: [],
    stacksB: [],
    ms: 0,
  };
  const check = args.smoke ? (w: World) => checkInvariants(w) : undefined;
  const t0 = performance.now();
  for (let seed = args.start; seed < args.start + args.seeds; seed++) {
    // In a mirror match the swapped game is the same game, so play it once.
    for (const swap of a === b ? [false] : [false, true]) {
      const pair = swap ? ([coreById(b), coreById(a)] as const) : ([coreById(a), coreById(b)] as const);
      const r: MatchResult = runMatch({ seed, cores: pair }, check);
      const sideA = swap ? 1 : 0;
      p.games++;
      if (r.winner === sideA) p.winsA++;
      if (r.winner === 0) p.side0Wins++;
      p.leadChanges.push(r.leadChanges);
      p.lastLeadChange.push(r.lastLeadChangeStep / stepsPerSecond);
      if (r.maxShareFirstHalf >= tuning.match.decidedShare) p.decidedEarly++;
      p.margins.push(Math.abs(r.counts[0] - r.counts[1]));
      if (r.reason === 'wipeout') p.wipeouts++;
      if (r.reason === 'suddenDeath') p.suddenDeaths++;
      p.stacksA.push(r.stacks[sideA]);
      p.stacksB.push(r.stacks[1 - sideA]!);
    }
  }
  p.ms = performance.now() - t0;
  return p;
}

const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
const pct = (n: number, d: number): string => `${((100 * n) / Math.max(1, d)).toFixed(1)}%`;
function quantile(xs: number[], q: number): number {
  const s = [...xs].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0;
}

function describe(p: Pairing): string {
  const marginBuckets = [0, 5, 10, 20, 40, 80, Infinity];
  const buckets = marginBuckets.slice(0, -1).map((lo, i) => {
    const hi = marginBuckets[i + 1]!;
    const n = p.margins.filter((m) => m >= lo && m < hi).length;
    return `| ${lo}–${hi === Infinity ? '∞' : hi - 1} | ${n} | ${pct(n, p.games)} |`;
  });
  return [
    `## ${p.a} vs ${p.b}`,
    '',
    `| Metric | Value | Target |`,
    `| --- | --- | --- |`,
    `| Games | ${p.games} | |`,
    p.a === p.b
      ? `| Side 0 win rate (mirror) | ${pct(p.side0Wins, p.games)} | 48–52% |`
      : `| ${p.a} win rate | ${pct(p.winsA, p.games)} | 40–60% |`,
    ...(p.a === p.b ? [] : [`| Side 0 win rate (bias check) | ${pct(p.side0Wins, p.games)} | ~50% |`]),
    `| Mean lead changes | ${mean(p.leadChanges).toFixed(2)} | ≥ 2 |`,
    `| Median time of final lead change | ${quantile(p.lastLeadChange, 0.5).toFixed(1)} s | late |`,
    `| Decided before half time (one side ≥ ${tuning.match.decidedShare * 100}%) | ${pct(p.decidedEarly, p.games)} | < 15% |`,
    `| Mean margin (cells) | ${mean(p.margins).toFixed(1)} | |`,
    `| Wipeouts | ${pct(p.wipeouts, p.games)} | |`,
    `| Sudden deaths | ${pct(p.suddenDeaths, p.games)} | |`,
    `| Mean final stacks, ${p.a} / ${p.b} | ${mean(p.stacksA).toFixed(1)} / ${mean(p.stacksB).toFixed(1)} | |`,
    `| Sim time per match | ${(p.ms / p.games).toFixed(2)} ms | |`,
    '',
    '| Margin | Games | Share |',
    '| --- | --- | --- |',
    ...buckets,
    '',
  ].join('\n');
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const pairs: [string, string][] = args.matrix
    ? cores.flatMap((x, i) => cores.slice(i).map((y) => [x.id, y.id] as [string, string]))
    : [[args.a, args.b]];
  const sections: string[] = [];
  for (const [a, b] of pairs) {
    const p = play(a, b, args);
    const text = describe(p);
    console.log(text);
    sections.push(text);
  }
  if (args.report) {
    const header = [
      `# Balance report`,
      '',
      `Seeds ${args.start}–${args.start + args.seeds - 1}. Each seed is played from both sides (once for mirror matches). Generated by \`npm run lab\`.`,
      '',
    ].join('\n');
    mkdirSync(dirname(args.report), { recursive: true });
    writeFileSync(args.report, header + sections.join('\n'));
    console.log(`Report written to ${args.report}`);
  }
}

main();
