/**
 * Headless balance lab (MASTER_PROMPT 7.6).
 *
 *   npm run lab -- [--a ricochet --b splitter | --matrix] [--seeds 500] [--start 1]
 *                  [--control none:none] [--variant redirect|none]
 *                  [--no-underdog] [--smoke]
 *                  [--redirect-value] [--tension] [--report docs/balance/name.md]
 *
 * Every seed is played twice with the sides swapped, so side bias cancels out
 * (once for a mirror match with identical controllers, where swapping changes nothing).
 *
 * --control A:B   controllers for side A and side B: none, rival, assist or random.
 * --smoke         checks invariants on every step and exits non-zero on any failure.
 * --redirect-value  side A plays with no input, random input (redirect only) and the rival
 *                 heuristic against side B with none, on the same seeds.
 * --tension       compares the underdog boost on and off, with both sides using the rival heuristic.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { coreById, cores } from '../src/content/cores';
import { inputVariantById, type InputVariant } from '../src/content/inputs';
import { tuning } from '../src/content/tuning';
import type { ControllerSpec } from '../src/sim/input';
import { checkInvariants } from '../src/sim/invariants';
import { runMatch } from '../src/sim/match';
import type { World } from '../src/sim/world';

type ControlName = 'none' | 'rival' | 'assist' | 'random';

interface Args {
  a: string;
  b: string;
  seeds: number;
  start: number;
  report: string | null;
  smoke: boolean;
  matrix: boolean;
  control: [ControlName, ControlName];
  variant: InputVariant;
  underdog: boolean;
  redirectValue: boolean;
  tension: boolean;
}

function parseControl(v: string): [ControlName, ControlName] {
  const names = ['none', 'rival', 'assist', 'random'];
  const [a, b] = v.split(':');
  if (!a || !b || !names.includes(a) || !names.includes(b)) throw new Error(`--control expects A:B from ${names.join(', ')}`);
  return [a as ControlName, b as ControlName];
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    a: 'ricochet',
    b: 'splitter',
    seeds: 500,
    start: 1,
    report: null,
    smoke: false,
    matrix: false,
    control: ['none', 'none'],
    variant: inputVariantById('redirect'),
    underdog: true,
    redirectValue: false,
    tension: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === '--smoke') args.smoke = true;
    else if (k === '--matrix') args.matrix = true;
    else if (k === '--no-underdog') args.underdog = false;
    else if (k === '--redirect-value') args.redirectValue = true;
    else if (k === '--tension') args.tension = true;
    else if (v !== undefined) {
      if (k === '--a') args.a = v;
      else if (k === '--b') args.b = v;
      else if (k === '--seeds') args.seeds = Number(v);
      else if (k === '--start') args.start = Number(v);
      else if (k === '--report') args.report = v;
      else if (k === '--control') args.control = parseControl(v);
      else if (k === '--variant') args.variant = inputVariantById(v);
      else continue;
      i++;
    }
  }
  return args;
}

function controller(name: ControlName): ControllerSpec | null {
  if (name === 'rival') return { kind: 'heuristic', ...tuning.ai.rival };
  if (name === 'assist') return { kind: 'heuristic', ...tuning.ai.assist };
  if (name === 'random') return { kind: 'random' };
  return null;
}

/** The lab may switch the underdog boost off; tuning is read-only everywhere else. */
const defaultUnderdogMax = tuning.tension.underdogMax;
function setUnderdog(on: boolean): void {
  (tuning.tension as { underdogMax: number }).underdogMax = on ? defaultUnderdogMax : 0;
}

interface Stats {
  label: string;
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
  redirectsA: number[];
  pickupsA: number[];
  pickupsB: number[];
  /** Games where one side got more pickups, and how many of those it won. */
  pickupLeadGames: number;
  pickupLeadWins: number;
  ms: number;
}

const sps = tuning.sim.stepsPerSecond;

function play(a: string, b: string, control: [ControlName, ControlName], args: Args, label: string): Stats {
  const st: Stats = {
    label,
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
    redirectsA: [],
    pickupsA: [],
    pickupsB: [],
    pickupLeadGames: 0,
    pickupLeadWins: 0,
    ms: 0,
  };
  const check = args.smoke ? (w: World) => checkInvariants(w) : undefined;
  const mirror = a === b && control[0] === control[1];
  const t0 = performance.now();
  for (let seed = args.start; seed < args.start + args.seeds; seed++) {
    for (const swap of mirror ? [false] : [false, true]) {
      const cs = swap ? ([coreById(b), coreById(a)] as const) : ([coreById(a), coreById(b)] as const);
      const ctrl = swap ? ([controller(control[1]), controller(control[0])] as const) : ([controller(control[0]), controller(control[1])] as const);
      const r = runMatch({ seed, cores: cs, controllers: ctrl, inputMode: args.variant.mode }, check);
      const sideA = swap ? 1 : 0;
      st.games++;
      if (r.winner === sideA) st.winsA++;
      if (r.winner === 0) st.side0Wins++;
      st.leadChanges.push(r.leadChanges);
      st.lastLeadChange.push(r.lastLeadChangeStep / sps);
      if (r.maxShareFirstHalf >= tuning.match.decidedShare) st.decidedEarly++;
      st.margins.push(Math.abs(r.counts[0] - r.counts[1]));
      if (r.reason === 'wipeout') st.wipeouts++;
      if (r.reason === 'suddenDeath') st.suddenDeaths++;
      st.stacksA.push(r.stacks[sideA]);
      st.stacksB.push(r.stacks[1 - sideA]!);
      st.redirectsA.push(r.redirects[sideA]);
      st.pickupsA.push(r.pickups[sideA]);
      st.pickupsB.push(r.pickups[1 - sideA]!);
      if (r.pickups[0] !== r.pickups[1]) {
        st.pickupLeadGames++;
        if (r.winner === (r.pickups[0] > r.pickups[1] ? 0 : 1)) st.pickupLeadWins++;
      }
    }
  }
  st.ms = performance.now() - t0;
  return st;
}

const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
const pct = (n: number, d: number): string => `${((100 * n) / Math.max(1, d)).toFixed(1)}%`;
function quantile(xs: number[], q: number): number {
  const s = [...xs].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0;
}

function describe(a: string, b: string, st: Stats, mirror: boolean): string {
  const edges = [0, 5, 10, 20, 40, 80, Infinity];
  const buckets = edges.slice(0, -1).map((lo, i) => {
    const hi = edges[i + 1]!;
    const n = st.margins.filter((m) => m >= lo && m < hi).length;
    return `| ${lo}–${hi === Infinity ? '∞' : hi - 1} | ${n} | ${pct(n, st.games)} |`;
  });
  return [
    `## ${a} vs ${b}${st.label ? ` (${st.label})` : ''}`,
    '',
    `| Metric | Value | Target |`,
    `| --- | --- | --- |`,
    `| Games | ${st.games} | |`,
    mirror
      ? `| Side 0 win rate (mirror) | ${pct(st.side0Wins, st.games)} | 48–52% |`
      : `| ${a} win rate | ${pct(st.winsA, st.games)} | 40–60% |`,
    ...(mirror ? [] : [`| Side 0 win rate (bias check) | ${pct(st.side0Wins, st.games)} | ~50% |`]),
    `| Mean lead changes (hysteresis ${tuning.tension.leadHysteresis}) | ${mean(st.leadChanges).toFixed(2)} | ≥ 2 |`,
    `| Median time of final lead change | ${quantile(st.lastLeadChange, 0.5).toFixed(1)} s | late |`,
    `| Decided before half time (one side ≥ ${tuning.match.decidedShare * 100}%) | ${pct(st.decidedEarly, st.games)} | < 15% |`,
    `| Mean margin (cells) | ${mean(st.margins).toFixed(1)} | |`,
    `| Wipeouts | ${pct(st.wipeouts, st.games)} | |`,
    `| Sudden deaths | ${pct(st.suddenDeaths, st.games)} | |`,
    `| Mean final stacks, ${a} / ${b} | ${mean(st.stacksA).toFixed(1)} / ${mean(st.stacksB).toFixed(1)} | |`,
    `| Mean pickups, ${a} / ${b} | ${mean(st.pickupsA).toFixed(2)} / ${mean(st.pickupsB).toFixed(2)} | |`,
    `| Side with more pickups wins | ${pct(st.pickupLeadWins, st.pickupLeadGames)} of ${st.pickupLeadGames} games | |`,
    `| Sim time per match | ${(st.ms / st.games).toFixed(2)} ms | |`,
    '',
    '| Margin | Games | Share |',
    '| --- | --- | --- |',
    ...buckets,
    '',
  ].join('\n');
}

function pairings(args: Args): [string, string][] {
  return args.matrix ? cores.flatMap((x, i) => cores.slice(i).map((y) => [x.id, y.id] as [string, string])) : [[args.a, args.b]];
}

/** Win rate of side A with each redirect controller against side B with none. */
function redirectValue(args: Args): string {
  const rows: string[] = [
    `## Input value: ${args.variant.name}`,
    '',
    'Side A uses the controller shown; side B never uses the input. Same seeds, both sides played.',
    '',
    '| Pairing | No input | Random aim | Heuristic | Heuristic gain | Target gain |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (const [a, b] of pairings(args)) {
    const rate = (c: ControlName): number => {
      const st = play(a, b, [c, 'none'], args, '');
      return st.winsA / st.games;
    };
    const none = rate('none');
    const random = args.variant.mode === 'redirect' ? rate('random') : NaN;
    const rival = rate('rival');
    const gain = (rival - none) * 100;
    rows.push(
      `| ${a} vs ${b} | ${(none * 100).toFixed(1)}% | ${Number.isNaN(random) ? '–' : `${(random * 100).toFixed(1)}%`} | ${(rival * 100).toFixed(1)}% | ${gain >= 0 ? '+' : ''}${gain.toFixed(1)} pts | +10 to +20 pts |`,
    );
  }
  rows.push('');
  return rows.join('\n');
}

/** The tension metrics with the underdog boost on and off, both sides on the rival heuristic. */
function tension(args: Args): string {
  const variants: [string, boolean][] = [
    ['underdog off', false],
    ['underdog on', true],
  ];
  const rows: string[] = [
    '## Tension tools',
    '',
    'Both sides use the rival heuristic. Same seeds for every variant.',
    '',
    '| Pairing | Tools | Win rate A | Lead changes | Final lead change (median) | Decided early | Mean margin |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const [a, b] of pairings(args)) {
    for (const [name, u] of variants) {
      setUnderdog(u);
      const st = play(a, b, ['rival', 'rival'], args, name);
      const mirror = a === b;
      rows.push(
        `| ${a} vs ${b} | ${name} | ${mirror ? '–' : pct(st.winsA, st.games)} | ${mean(st.leadChanges).toFixed(2)} | ${quantile(st.lastLeadChange, 0.5).toFixed(1)} s | ${pct(st.decidedEarly, st.games)} | ${mean(st.margins).toFixed(1)} |`,
      );
    }
  }
  setUnderdog(args.underdog);
  rows.push('');
  return rows.join('\n');
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  setUnderdog(args.underdog);
  const sections: string[] = [];
  if (args.redirectValue) sections.push(redirectValue(args));
  if (args.tension) sections.push(tension(args));
  if (!args.redirectValue && !args.tension) {
    for (const [a, b] of pairings(args)) {
      const st = play(a, b, args.control, args, args.control.join(':') === 'none:none' ? '' : `controls ${args.control.join(':')}`);
      sections.push(describe(a, b, st, a === b && args.control[0] === args.control[1]));
    }
  }
  for (const s of sections) console.log(s);
  if (args.report) {
    const header = [
      '# Balance report',
      '',
      `Seeds ${args.start}–${args.start + args.seeds - 1}. Input ${args.variant.name}. Underdog boost ${args.underdog ? 'on' : 'off'}. Generated by \`npm run lab\`.`,
      '',
    ].join('\n');
    mkdirSync(dirname(args.report), { recursive: true });
    writeFileSync(args.report, header + sections.join('\n'));
    console.log(`Report written to ${args.report}`);
  }
}

main();
