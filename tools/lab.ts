/**
 * Headless balance lab (MASTER_PROMPT 7.6).
 *
 *   npm run lab -- [--a ricochet --b splitter | --matrix] [--seeds 500] [--start 1]
 *                  [--control rival:rival] [--no-underdog] [--no-pickups] [--smoke]
 *                  [--input-value] [--mod-impact] [--tension] [--report docs/balance/name.md]
 *
 * Every seed is played twice with the sides swapped, so side bias cancels out
 * (once for a mirror match with identical controllers, where swapping changes nothing).
 *
 * --control A:B   controllers for side A and side B: none, rival, assist or random.
 *                 A controller aims the launch and times the ultimate; none does neither.
 * --smoke         checks invariants on every step and exits non-zero on any failure.
 * --input-value   side A with no input, random input and the rival heuristic against
 *                 side B with the rival heuristic, on the same seeds.
 * --mod-impact    each Mod at level 1 and 3 added to side A, against the same Core with no
 *                 Mods; both sides on the rival heuristic. Reports the win-rate change.
 *                 --cores a,b,c limits the Cores, --mods x,y the Mods, --levels 1,2,3 the levels.
 * --tension       the underdog boost on and off, both sides on the rival heuristic.
 * --runs          whole runs headlessly: a random drafter and a synergy drafter (levels owned Mods,
 *                 then Mods sharing a group), the player on the rival heuristic. --seeds is runs per
 *                 Core and drafter (default 60), --ascension T the tier (default 0), --core id|all.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { coreById, cores } from '../src/content/cores';
import { bosses } from '../src/content/bosses';
import { mods } from '../src/content/mods';
import { tuning } from '../src/content/tuning';
import type { ModPick } from '../src/sim/abilities';
import type { ControllerSpec } from '../src/sim/input';
import { checkInvariants } from '../src/sim/invariants';
import { runMatch } from '../src/sim/match';
import type { World } from '../src/sim/world';
import { Rng } from '../src/sim/rng';
import { finishMatch, matchConfig, pickMod, rerollOffer, replaceMod, startRun, type RunState } from '../src/run/run';

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
  underdog: boolean;
  pickups: boolean;
  inputValue: boolean;
  modImpact: boolean;
  tension: boolean;
  runs: boolean;
  ascension: number;
  core: string;
  cores: string[] | null;
  mods: string[] | null;
  levels: number[];
  seedsGiven: boolean;
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
    control: ['rival', 'rival'],
    underdog: true,
    pickups: true,
    inputValue: false,
    modImpact: false,
    tension: false,
    runs: false,
    ascension: 0,
    core: 'all',
    cores: null,
    mods: null,
    levels: [1, 3],
    seedsGiven: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === '--smoke') args.smoke = true;
    else if (k === '--matrix') args.matrix = true;
    else if (k === '--no-underdog') args.underdog = false;
    else if (k === '--no-pickups') args.pickups = false;
    else if (k === '--input-value') args.inputValue = true;
    else if (k === '--mod-impact') args.modImpact = true;
    else if (k === '--tension') args.tension = true;
    else if (k === '--runs') args.runs = true;
    else if (v !== undefined) {
      if (k === '--a') args.a = v;
      else if (k === '--b') args.b = v;
      else if (k === '--seeds') {
        args.seeds = Number(v);
        args.seedsGiven = true;
      } else if (k === '--ascension') args.ascension = Number(v);
      else if (k === '--core') args.core = v;
      else if (k === '--cores') args.cores = v.split(',');
      else if (k === '--mods') args.mods = v.split(',');
      else if (k === '--levels') args.levels = v.split(',').map(Number);
      else if (k === '--start') args.start = Number(v);
      else if (k === '--report') args.report = v;
      else if (k === '--control') args.control = parseControl(v);
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

interface Side {
  core: string;
  control: ControlName;
  mods: readonly ModPick[];
}

interface Stats {
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
  pickupsA: number[];
  pickupsB: number[];
  pickupLeadGames: number;
  pickupLeadWins: number;
  ms: number;
}

const sps = tuning.sim.stepsPerSecond;

function play(A: Side, B: Side, args: Args): Stats {
  const st: Stats = {
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
    pickupsA: [],
    pickupsB: [],
    pickupLeadGames: 0,
    pickupLeadWins: 0,
    ms: 0,
  };
  const check = args.smoke ? (w: World) => checkInvariants(w) : undefined;
  const mirror = A.core === B.core && A.control === B.control && A.mods.length === 0 && B.mods.length === 0;
  const t0 = performance.now();
  for (let seed = args.start; seed < args.start + args.seeds; seed++) {
    for (const swap of mirror ? [false] : [false, true]) {
      const [s0, s1] = swap ? [B, A] : [A, B];
      const r = runMatch(
        {
          seed,
          cores: [coreById(s0.core), coreById(s1.core)],
          controllers: [controller(s0.control), controller(s1.control)],
          mods: [s0.mods, s1.mods],
          ...(args.pickups ? {} : { pickups: [] }),
        },
        check,
      );
      const sideA = swap ? 1 : 0;
      st.games++;
      if (r.winner === sideA) st.winsA++;
      if (r.winner === 0) st.side0Wins++;
      st.leadChanges.push(r.leadChanges);
      st.lastLeadChange.push(r.lastLeadChangeStep / sps);
      // Decided early: a side passed the share before half time and went on to win.
      if (r.maxShareFirstHalf >= tuning.match.decidedShare && r.winner === r.maxShareFirstHalfSide) st.decidedEarly++;
      st.margins.push(Math.abs(r.counts[0] - r.counts[1]));
      if (r.reason === 'wipeout') st.wipeouts++;
      if (r.reason === 'suddenDeath') st.suddenDeaths++;
      st.stacksA.push(r.stacks[sideA]);
      st.stacksB.push(r.stacks[1 - sideA]!);
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
const pts = (x: number): string => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)} pts`;
function quantile(xs: number[], q: number): number {
  const s = [...xs].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0;
}

function describe(a: string, b: string, label: string, st: Stats, mirror: boolean): string {
  const edges = [0, 5, 10, 20, 40, 80, Infinity];
  const buckets = edges.slice(0, -1).map((lo, i) => {
    const hi = edges[i + 1]!;
    const n = st.margins.filter((m) => m >= lo && m < hi).length;
    return `| ${lo}–${hi === Infinity ? '∞' : hi - 1} | ${n} | ${pct(n, st.games)} |`;
  });
  return [
    `## ${a} vs ${b} (${label})`,
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
    `| Decided before half time (passed ${tuning.match.decidedShare * 100}% before half time and won) | ${pct(st.decidedEarly, st.games)} | < 15% |`,
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

/** What launch aim plus ultimate timing are worth: side A's controller varies, side B is the rival. */
function inputValue(args: Args): string {
  const rows: string[] = [
    '## Input value (launch aim + ultimate)',
    '',
    'Side A uses the controller shown; side B is the rival heuristic. "None" never aims or fires its ultimate.',
    '',
    '| Pairing | None | Random | Heuristic | Heuristic vs none | Heuristic vs random |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (const [a, b] of pairings(args)) {
    const rate = (c: ControlName): number => {
      const st = play({ core: a, control: c, mods: [] }, { core: b, control: 'rival', mods: [] }, args);
      return st.winsA / st.games;
    };
    const none = rate('none');
    const random = rate('random');
    const heur = rate('rival');
    rows.push(`| ${a} vs ${b} | ${(none * 100).toFixed(1)}% | ${(random * 100).toFixed(1)}% | ${(heur * 100).toFixed(1)}% | ${pts(heur - none)} | ${pts(heur - random)} |`);
  }
  rows.push('');
  return rows.join('\n');
}

/** Each Mod's effect on win rate when added to a Core facing the same Core without Mods. */
function modImpact(args: Args): string {
  const coreList = args.cores ? args.cores.map((id) => coreById(id)) : cores;
  const modList = args.mods ? args.mods.map((id) => mods.find((m) => m.id === id) ?? coreFail(id)) : mods;
  const rows: string[] = [
    '## Mod impact',
    '',
    'Side A has the Mod; side B is the same Core with none. Both use the rival heuristic. 50% means no effect.',
    '',
    `| Mod | Rarity | ${coreList.map((c) => args.levels.map((l) => `${c.name} L${l}`).join(' | ')).join(' | ')} |`,
    `| --- | --- | ${coreList.map(() => args.levels.map(() => '---').join(' | ')).join(' | ')} |`,
  ];
  for (const m of modList) {
    const cells: string[] = [];
    for (const c of coreList) {
      for (const level of args.levels) {
        const st = play({ core: c.id, control: 'rival', mods: [{ mod: m, level }] }, { core: c.id, control: 'rival', mods: [] }, args);
        cells.push(pct(st.winsA, st.games));
      }
    }
    rows.push(`| ${m.name} | ${m.rarity} | ${cells.join(' | ')} |`);
  }
  rows.push('');
  return rows.join('\n');
}

function coreFail(id: string): never {
  throw new Error(`Unknown mod ${id}`);
}

/** The tension metrics with the underdog boost on and off, both sides on the rival heuristic. */
function tension(args: Args): string {
  const rows: string[] = [
    '## Tension tools',
    '',
    'Both sides use the rival heuristic. Same seeds for every variant.',
    '',
    '| Pairing | Underdog | Win rate A | Lead changes | Final lead change (median) | Decided early | Mean margin |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const [a, b] of pairings(args)) {
    for (const on of [false, true]) {
      setUnderdog(on);
      const st = play({ core: a, control: 'rival', mods: [] }, { core: b, control: 'rival', mods: [] }, args);
      rows.push(
        `| ${a} vs ${b} | ${on ? 'on' : 'off'} | ${a === b ? '–' : pct(st.winsA, st.games)} | ${mean(st.leadChanges).toFixed(2)} | ${quantile(st.lastLeadChange, 0.5).toFixed(1)} s | ${pct(st.decidedEarly, st.games)} | ${mean(st.margins).toFixed(1)} |`,
      );
    }
  }
  setUnderdog(args.underdog);
  rows.push('');
  return rows.join('\n');
}

type DrafterName = 'random' | 'synergy';

/**
 * What an informed player knows: how well each Mod (at level 2) does on a Core, measured against the
 * same Core with no Mods. Computed once per Core and cached, so a synergy drafter picks Mods that suit
 * its Core instead of guessing from group names.
 */
const affinityCache = new Map<string, Map<string, number>>();
const AFFINITY_SEEDS = 40;
function affinity(coreId: string): Map<string, number> {
  let table = affinityCache.get(coreId);
  if (table) return table;
  table = new Map();
  const args = parseArgs([]);
  args.seeds = AFFINITY_SEEDS;
  for (const m of mods) {
    if (m.run) {
      table.set(m.id, 0.5);
      continue;
    }
    const st = play({ core: coreId, control: 'rival', mods: [{ mod: m, level: 2 }] }, { core: coreId, control: 'rival', mods: [] }, args);
    table.set(m.id, st.winsA / st.games);
  }
  affinityCache.set(coreId, table);
  return table;
}

/** Take the next step of a draft with the named drafter. Returns the run in 'match' phase. */
function draft(run: RunState, who: DrafterName, rng: Rng): RunState {
  const byId = (id: string) => mods.find((m) => m.id === id);
  const full = run.build.length >= 6;
  const options = run.offer.filter((id) => run.build.some((e) => e.id === id) || !full);
  if (who === 'random') {
    const id = run.offer[rng.int(run.offer.length)];
    if (id === undefined) return pickMod(run, null);
    if (run.build.some((e) => e.id === id) || !full) return pickMod(run, id);
    return replaceMod(run, id, rng.int(run.build.length));
  }
  // Synergy: the Mods that measure best on this Core, with a bonus for levelling one it owns and a small
  // one for sharing a group with the build. Economy Mods (no match effect) come last.
  const table = affinity(run.coreId);
  const groups = run.build.map((e) => byId(e.id)?.group);
  const score = (id: string): number => {
    const m = byId(id);
    if (!m) return -1;
    if (m.run) return -5;
    const up = run.build.find((e) => e.id === id);
    return (table.get(id) ?? 0.5) * 100 + (up ? 4 + up.level * 2 : 0) + (groups.includes(m.group) ? 2 : 0);
  };
  const best = (ids: string[]): string | undefined => [...ids].sort((x, y) => score(y) - score(x))[0];
  let pick = best(options);
  if ((pick === undefined || score(pick) < 56) && run.rerolls > 0) {
    const again = rerollOffer(run);
    const opts = again.offer.filter((id) => again.build.some((e) => e.id === id) || !full);
    const p2 = best(opts);
    if (p2 !== undefined && score(p2) >= (pick === undefined ? -1 : score(pick))) return draft(again, who, rng);
    run = again;
    pick = p2;
  }
  return pick === undefined ? pickMod(run, null) : pickMod(run, pick);
}

interface RunStats {
  runs: number;
  won: number;
  roundReached: number[];
  matchesWon: number;
  matches: number;
  /** Per round (index 0 = round 1): matches played and won. */
  byRound: { played: number; won: number }[];
  /** By rival: a boss's name, or the rival's Core name. */
  byRival: Record<string, { played: number; won: number }>;
}

function playRun(seed: number, coreId: string, ascension: number, who: DrafterName): RunState {
  const rng = new Rng(seed, 91);
  let run = startRun({ seed, coreId, ascension });
  const me: ControllerSpec = { kind: 'heuristic', ...tuning.ai.rival };
  while (run.phase !== 'summary') {
    if (run.phase === 'draft') {
      run = draft(run, who, rng);
      continue;
    }
    const cfg = matchConfig(run);
    const r = runMatch({ ...cfg, controllers: [me, cfg.controllers?.[1] ?? null], recordEvents: false });
    run = finishMatch(run, { won: r.winner === 0, margin: Math.abs(r.counts[0] - r.counts[1]), wipeout: r.reason === 'wipeout' });
  }
  return run;
}

function runsReport(args: Args): string {
  const n = args.seedsGiven ? args.seeds : 60;
  const targets = args.core === 'all' ? cores.map((c) => c.id) : [args.core];
  const rows: string[] = [
    `## Whole runs (Ascension ${args.ascension}, ${n} runs per Core and drafter)`,
    '',
    'Player on the rival heuristic. Round reached is the round of the last match played (10 = reached the final boss). Targets at tier 0: random 35-50%, synergy about 80%.',
    '',
    '| Core | Drafter | Run win rate | Mean round reached | Match win rate | Sim time |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  const total: Record<DrafterName, RunStats> = {
    random: { runs: 0, won: 0, roundReached: [], matchesWon: 0, matches: 0, byRound: [], byRival: {} },
    synergy: { runs: 0, won: 0, roundReached: [], matchesWon: 0, matches: 0, byRound: [], byRival: {} },
  };
  for (const core of targets) {
    for (const who of ['random', 'synergy'] as const) {
      const t0 = performance.now();
      const st = total[who];
      const own: RunStats = { runs: 0, won: 0, roundReached: [], matchesWon: 0, matches: 0, byRound: [], byRival: {} };
      for (let seed = args.start; seed < args.start + n; seed++) {
        const run = playRun(seed, core, args.ascension, who);
        for (const s of [own, st]) {
          s.runs++;
          if (run.outcome === 'won') s.won++;
          s.roundReached.push(run.history.length);
          s.matches += run.history.length;
          s.matchesWon += run.history.filter((h) => h.won).length;
          for (const h of run.history) {
            const cell = (s.byRound[h.round - 1] ??= { played: 0, won: 0 });
            cell.played++;
            if (h.won) cell.won++;
            const key = bosses.some((b) => b.name === h.rivalName) ? h.rivalName : (h.rivalName.split(' ').pop() ?? h.rivalName);
            const rv = (s.byRival[key] ??= { played: 0, won: 0 });
            rv.played++;
            if (h.won) rv.won++;
          }
        }
      }
      rows.push(
        `| ${core} | ${who} | ${pct(own.won, own.runs)} | ${mean(own.roundReached).toFixed(2)} | ${pct(own.matchesWon, own.matches)} | ${((performance.now() - t0) / 1000).toFixed(1)} s |`,
      );
    }
  }
  if (targets.length > 1) {
    for (const who of ['random', 'synergy'] as const) {
      const st = total[who];
      rows.push(`| **all** | ${who} | ${pct(st.won, st.runs)} | ${mean(st.roundReached).toFixed(2)} | ${pct(st.matchesWon, st.matches)} | |`);
    }
  }
  rows.push('', 'Match win rate by round (all Cores in this report):', '', `| Drafter | ${Array.from({ length: 10 }, (_, i) => `R${i + 1}`).join(' | ')} |`, `| --- | ${Array.from({ length: 10 }, () => '---').join(' | ')} |`);
  for (const who of ['random', 'synergy'] as const) {
    const cells = Array.from({ length: 10 }, (_, i) => {
      const c = total[who].byRound[i];
      return c ? pct(c.won, c.played) : '-';
    });
    rows.push(`| ${who} | ${cells.join(' | ')} |`);
  }
  const names = [...new Set(['random', 'synergy'].flatMap((w) => Object.keys(total[w as DrafterName].byRival)))].sort();
  rows.push('', 'Player match win rate by opponent (bosses by name, others by Core):', '', `| Drafter | ${names.join(' | ')} |`, `| --- | ${names.map(() => '---').join(' | ')} |`);
  for (const who of ['random', 'synergy'] as const) {
    rows.push(`| ${who} | ${names.map((n) => { const c = total[who].byRival[n]; return c ? pct(c.won, c.played) : '-'; }).join(' | ')} |`);
  }
  rows.push('');
  return rows.join('\n');
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  setUnderdog(args.underdog);
  const sections: string[] = [];
  if (args.inputValue) sections.push(inputValue(args));
  if (args.modImpact) sections.push(modImpact(args));
  if (args.tension) sections.push(tension(args));
  if (args.runs) sections.push(runsReport(args));
  if (!args.inputValue && !args.modImpact && !args.tension && !args.runs) {
    for (const [a, b] of pairings(args)) {
      const A: Side = { core: a, control: args.control[0], mods: [] };
      const B: Side = { core: b, control: args.control[1], mods: [] };
      sections.push(describe(a, b, `controls ${args.control.join(':')}`, play(A, B, args), a === b && args.control[0] === args.control[1]));
    }
  }
  for (const s of sections) console.log(s);
  if (args.report) {
    const header = [
      '# Balance report',
      '',
      `Seeds from ${args.start}, ${args.seeds} per case. Underdog boost ${args.underdog ? 'on' : 'off'}. Pickups ${args.pickups ? 'on' : 'off'}. Generated by \`npm run lab\`.`,
      '',
    ].join('\n');
    mkdirSync(dirname(args.report), { recursive: true });
    writeFileSync(args.report, header + sections.join('\n'));
    console.log(`Report written to ${args.report}`);
  }
}

main();
