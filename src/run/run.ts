/**
 * The run: one JSON-serialisable state and pure functions over it (STAGE_PLAN "The run").
 *
 * Every function returns a new state and never mutates its input. All randomness
 * comes from `run.rng`, so the same seed and the same choices reproduce a run
 * exactly. Unknown Core and Mod ids (content still being added, or removed since
 * a save was written) are skipped, never thrown on.
 *
 * Calls made in the wrong phase, with an id that is not on offer, or without a
 * reroll to spend return the state unchanged.
 */
import { ascensionTiers, MAX_ASCENSION, rulesFor, type RunRules } from '../content/ascension';
import { bosses } from '../content/bosses';
import { cores } from '../content/cores';
import { mods } from '../content/mods';
import { archetypes, rivalScaling, rivalTier } from '../content/rivals';
import { tuning } from '../content/tuning';
import type { CoreDef, ModDef, ModPick } from '../sim/abilities';
import type { ControllerSpec } from '../sim/input';
import { Rng, type RngState } from '../sim/rng';
import type { MatchConfig, MatchTwist } from '../sim/world';
import { MAX_LEVEL, MAX_MODS, rarityWeight } from './draft';

export { MAX_ASCENSION, MAX_LEVEL, MAX_MODS };

export interface BuildEntry {
  id: string;
  level: number;
}

export interface RivalSpec {
  /** "CYAN PULSE", or a boss name. */
  name: string;
  coreId: string;
  mods: BuildEntry[];
  /** Match seed. */
  seed: number;
  bossId: string | null;
  twist: MatchTwist | null;
  controller: ControllerSpec | null;
  /** Extra main runners on top of the twist (Endless scaling). */
  extraPrimaries: number;
}

export interface RoundResult {
  round: number;
  won: boolean;
  margin: number;
  wipeout: boolean;
  rivalName: string;
}

export interface RunState {
  version: 1;
  seed: number;
  rng: RngState;
  mode: 'standard' | 'daily';
  /** 0..8 */
  ascension: number;
  coreId: string;
  /** Slot order. */
  build: BuildEntry[];
  /** 1-based: the round about to be drafted for or played. */
  round: number;
  hearts: number;
  rerolls: number;
  phase: 'draft' | 'match' | 'summary';
  /** Mod ids on offer while phase is 'draft'. */
  offer: string[];
  /** Set while phase is 'match'. */
  rival: RivalSpec | null;
  history: RoundResult[];
  /** Continuing past round 10. */
  endless: boolean;
  outcome: 'won' | 'lost' | null;
  /** Mod ids the pool is restricted to, or null for every Mod. */
  unlockedMods: string[] | null;
  /** Extra Mods the next draft offers (Collector). */
  bonusOffers: number;
  /** Boss ids met so far in this rotation, so none repeats. */
  bossesMet: string[];
}

const RNG_STREAM = 77;

function modDef(id: string): ModDef | undefined {
  return mods.find((m) => m.id === id);
}

function coreDef(id: string): CoreDef | undefined {
  return cores.find((c) => c.id === id);
}

/** Run `fn` with the state's rng and return its result with the advanced rng state. */
function draw<T>(state: RngState, fn: (rng: Rng) => T): [T, RngState] {
  const rng = new Rng(0, RNG_STREAM);
  rng.setState(state);
  const out = fn(rng);
  return [out, rng.getState()];
}

/** Mods of a build that exist, as picks. Unknown ids are skipped. */
export function buildPicks(build: readonly BuildEntry[]): ModPick[] {
  const out: ModPick[] = [];
  for (const e of build) {
    const mod = modDef(e.id);
    if (mod) out.push({ mod, level: Math.max(1, Math.min(MAX_LEVEL, Math.floor(e.level) || 1)) });
  }
  return out;
}

/** Whether a Mod of this run may be offered at all. */
function inPool(run: Pick<RunState, 'unlockedMods'>, id: string): boolean {
  return run.unlockedMods === null || run.unlockedMods.includes(id);
}

function drawOffer(
  run: Pick<RunState, 'build' | 'unlockedMods' | 'round'>,
  count: number,
  avoid: readonly string[],
  rng: Rng,
): string[] {
  const owned = (id: string): BuildEntry | undefined => run.build.find((e) => e.id === id);
  const pool = mods.filter((m) => inPool(run, m.id) && (owned(m.id)?.level ?? 0) < MAX_LEVEL);
  const fresh = pool.filter((m) => !avoid.includes(m.id));
  const offer: string[] = [];
  const take = (from: ModDef[]): void => {
    while (offer.length < count && from.length > 0) {
      const weights = from.map((m) => rarityWeight(m.rarity, Math.min(run.round, 12)));
      let roll = rng.next() * weights.reduce((a, b) => a + b, 0);
      let i = 0;
      while (i < from.length - 1 && roll >= weights[i]!) roll -= weights[i++]!;
      offer.push(from.splice(i, 1)[0]!.id);
    }
  };
  take(fresh);
  // Too few new Mods to fill the offer (a reroll in a small pool): top up with the ones it had.
  take(pool.filter((m) => !offer.includes(m.id)));
  return offer;
}

/** Turn an ordered archetype list into a build: the first `picks` usable entries, repeats level up. */
export function buildFromList(ids: readonly string[], picks: number, levelBonus = 0): BuildEntry[] {
  const build: BuildEntry[] = [];
  let taken = 0;
  const limit = ids.length * (Math.max(0, picks) + 1);
  for (let i = 0; i < limit && taken < picks && ids.length > 0; i++) {
    const id = ids[i % ids.length]!;
    if (!modDef(id)) continue;
    const at = build.find((e) => e.id === id);
    if (at) {
      if (at.level >= MAX_LEVEL) continue;
      at.level++;
    } else if (build.length < MAX_MODS) build.push({ id, level: 1 });
    else continue;
    taken++;
  }
  return build.map((e) => ({ id: e.id, level: Math.min(MAX_LEVEL, e.level + levelBonus) }));
}

function isBossRound(rules: RunRules, round: number): boolean {
  if (round <= rules.rounds) return rules.bossRounds.includes(round);
  return rules.endlessBossEvery > 0 && round % rules.endlessBossEvery === 0;
}

function controllerFor(rules: RunRules, on: boolean): ControllerSpec | null {
  if (!on) return null;
  return { kind: 'heuristic', ...tuning.ai.rival, ...(rules.rivalController ?? {}) };
}

/** Rival strength: archetype picks and controller for a round (rivals.ts table plus Ascension rules). */
function makeRival(run: RunState, rng: Rng): { rival: RivalSpec; bossesMet: string[] } {
  const rules = rulesFor(run.ascension);
  const tier = rivalTier(run.round);
  const seed = rng.int(2_147_483_647);
  let bossesMet = run.bossesMet;
  if (isBossRound(rules, run.round)) {
    const available = bosses.filter((b) => coreDef(b.coreId));
    let fresh = available.filter((b) => !bossesMet.includes(b.id));
    if (fresh.length === 0) {
      bossesMet = [];
      fresh = available;
    }
    const boss = fresh[rng.int(fresh.length)];
    if (boss) {
      const picks = tier.picks + rules.rivalPicks + rivalScaling.bossPicks;
      return {
        bossesMet: [...bossesMet, boss.id],
        rival: {
          name: boss.name,
          coreId: boss.coreId,
          mods: buildFromList(boss.mods, picks, rules.rivalLevels + tier.levelBonus),
          seed,
          bossId: boss.id,
          twist: boss.twist,
          controller: controllerFor(rules, true),
          extraPrimaries: tier.extraPrimaries,
        },
      };
    }
  }
  const core = cores[rng.int(cores.length)]!;
  const list = archetypes[core.id] ?? [];
  const arche = list.length > 0 ? list[rng.int(list.length)]! : null;
  let ids: readonly string[];
  if (arche) ids = arche.mods;
  else {
    // No archetype for this Core: a shuffled list of the Mods that exist.
    const pool = mods.filter((m) => !m.run).map((m) => m.id);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    ids = pool.slice(0, MAX_MODS);
  }
  const colour = core.id === run.coreId ? core.altColorName : core.colorName;
  return {
    bossesMet,
    rival: {
      name: `${colour} ${core.name}`.toUpperCase(),
      coreId: core.id,
      mods: buildFromList(ids, tier.picks + rules.rivalPicks, rules.rivalLevels + tier.levelBonus),
      seed,
      bossId: null,
      twist: null,
      controller: controllerFor(rules, tier.controller || rules.rivalsAlwaysControlled),
      extraPrimaries: tier.extraPrimaries,
    },
  };
}

function toDraft(run: RunState): RunState {
  const rules = rulesFor(run.ascension);
  const count = rules.offerSize + run.bonusOffers;
  const [offer, rng] = draw(run.rng, (r) => drawOffer(run, count, [], r));
  return { ...run, rng, phase: 'draft', offer, rival: null, bonusOffers: 0 };
}

export function startRun(o: {
  seed: number;
  coreId: string;
  ascension?: number;
  mode?: 'standard' | 'daily';
  unlockedMods?: string[];
}): RunState {
  const ascension = Math.max(0, Math.min(MAX_ASCENSION, Math.floor(o.ascension ?? 0)));
  const rules = rulesFor(ascension);
  const rng = new Rng(o.seed, RNG_STREAM);
  const base: RunState = {
    version: 1,
    seed: o.seed,
    rng: rng.getState(),
    mode: o.mode ?? 'standard',
    ascension,
    coreId: o.coreId,
    build: [],
    round: 1,
    hearts: rules.hearts,
    rerolls: Math.max(0, rules.rerolls),
    phase: 'draft',
    offer: [],
    rival: null,
    history: [],
    endless: false,
    outcome: null,
    unlockedMods: o.unlockedMods ? [...o.unlockedMods] : null,
    bonusOffers: 0,
    bossesMet: [],
  };
  return toDraft(base);
}

function toMatch(run: RunState): RunState {
  const [made, rng] = draw(run.rng, (r) => makeRival(run, r));
  return { ...run, rng, phase: 'match', offer: [], rival: made.rival, bossesMet: made.bossesMet };
}

/** Pick an offered Mod (a new one in a free slot, or a level-up), or null to skip for +1 reroll. */
export function pickMod(run: RunState, modId: string | null): RunState {
  if (run.phase !== 'draft') return run;
  const rules = rulesFor(run.ascension);
  if (modId === null) return toMatch({ ...run, rerolls: run.rerolls + rules.skipRerolls });
  if (!run.offer.includes(modId)) return run;
  const i = run.build.findIndex((e) => e.id === modId);
  if (i < 0 && run.build.length >= MAX_MODS) return run; // needs replaceMod
  const build =
    i < 0
      ? [...run.build, { id: modId, level: 1 }]
      : run.build.map((e, k) => (k === i ? { id: e.id, level: Math.min(MAX_LEVEL, e.level + 1) } : { ...e }));
  return toMatch({ ...run, build });
}

/** Spend a reroll on a fresh offer, avoiding the Mods just shown where the pool allows. */
export function rerollOffer(run: RunState): RunState {
  if (run.phase !== 'draft' || run.rerolls <= 0) return run;
  const count = Math.max(run.offer.length, 1);
  const [offer, rng] = draw(run.rng, (r) => drawOffer(run, count, run.offer, r));
  return { ...run, rng, offer, rerolls: run.rerolls - 1 };
}

/** Take an offered new Mod into a full build, replacing the Mod in `slot`. */
export function replaceMod(run: RunState, modId: string, slot: number): RunState {
  if (run.phase !== 'draft' || !run.offer.includes(modId)) return run;
  if (!Number.isInteger(slot) || slot < 0 || slot >= run.build.length) return run;
  if (run.build.some((e) => e.id === modId)) return run; // an owned Mod levels up through pickMod
  const build = run.build.map((e, k) => (k === slot ? { id: modId, level: 1 } : { ...e }));
  return toMatch({ ...run, build });
}

/** The match for the current round; the player is side 0. Throws if the player's Core does not exist. */
export function matchConfig(run: RunState): MatchConfig {
  const rival = run.rival;
  if (run.phase !== 'match' || !rival) throw new Error('No match is set up');
  const mine = coreDef(run.coreId);
  const theirs = coreDef(rival.coreId);
  if (!mine || !theirs) throw new Error(`Unknown core ${mine ? rival.coreId : run.coreId}`);
  let twist: MatchTwist | undefined = rival.twist ?? undefined;
  if (rival.extraPrimaries > 0) {
    const ex = twist?.extraPrimaries ?? [0, 0];
    twist = { ...twist, extraPrimaries: [ex[0], ex[1] + rival.extraPrimaries] };
  }
  return {
    seed: rival.seed,
    cores: [mine, theirs],
    controllers: [null, rival.controller],
    mods: [buildPicks(run.build), buildPicks(rival.mods)],
    ...(twist ? { twist } : {}),
  };
}

/** Record a match result. A loss costs a heart; economy Mods pay out after a win. */
export function finishMatch(run: RunState, r: { won: boolean; margin: number; wipeout: boolean }): RunState {
  if (run.phase !== 'match' || !run.rival) return run;
  const rules = rulesFor(run.ascension);
  const history = [
    ...run.history,
    { round: run.round, won: r.won, margin: r.margin, wipeout: r.won && r.wipeout, rivalName: run.rival.name },
  ];
  let rerolls = run.rerolls;
  let bonusOffers = run.bonusOffers;
  let hearts = run.hearts;
  if (r.won) {
    if (r.wipeout) rerolls += rules.wipeoutRerolls;
    for (const p of buildPicks(run.build)) {
      const fx = p.mod.run?.(p.level);
      if (!fx) continue;
      rerolls += fx.rerollsPerWin ?? 0;
      if (fx.extraOffers && r.margin >= (fx.bigWinMargin ?? 0)) bonusOffers += fx.extraOffers;
    }
  } else hearts--;
  const next: RunState = { ...run, history, rerolls, bonusOffers, hearts, rival: null, offer: [] };
  if (hearts <= 0) return { ...next, phase: 'summary', outcome: 'lost' };
  if (!run.endless && run.round >= rules.rounds) {
    // Beating the last round wins the run; losing it ends the run.
    return { ...next, phase: 'summary', outcome: r.won ? 'won' : 'lost' };
  }
  return toDraft({ ...next, round: run.round + 1 });
}

/** From a won summary: keep going against rivals that scale until the hearts run out. */
export function continueEndless(run: RunState): RunState {
  if (run.phase !== 'summary' || run.outcome !== 'won') return run;
  return toDraft({ ...run, endless: true, outcome: null, round: run.round + 1 });
}

/** Ascension tier descriptions, for the UI. */
export const ascensionDescriptions: readonly string[] = ascensionTiers.map((t) => t.description);

// ---- Validation, for saves -------------------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

function parseBuild(v: unknown): BuildEntry[] | null {
  if (!Array.isArray(v)) return null;
  const out: BuildEntry[] = [];
  for (const e of v) {
    if (!isObj(e) || typeof e.id !== 'string' || !isNum(e.level)) return null;
    out.push({ id: e.id, level: Math.max(1, Math.min(MAX_LEVEL, Math.floor(e.level))) });
  }
  return out;
}

/** A stored run, checked field by field; null when it cannot be trusted or its Core no longer exists. */
export function parseRun(v: unknown): RunState | null {
  if (!isObj(v) || v.version !== 1) return null;
  const rng = v.rng;
  if (!isObj(rng) || !(['a', 'b', 'c', 'd'] as const).every((k) => isNum(rng[k]))) return null;
  const build = parseBuild(v.build);
  if (!build || typeof v.coreId !== 'string' || !coreDef(v.coreId)) return null;
  if (!isNum(v.seed) || !isNum(v.ascension) || !isNum(v.round) || !isNum(v.hearts) || !isNum(v.rerolls)) return null;
  if (v.phase !== 'draft' && v.phase !== 'match' && v.phase !== 'summary') return null;
  if (!isStrArr(v.offer) || !Array.isArray(v.history) || typeof v.endless !== 'boolean') return null;
  if (v.outcome !== null && v.outcome !== 'won' && v.outcome !== 'lost') return null;
  if (v.mode !== 'standard' && v.mode !== 'daily') return null;
  let rival: RivalSpec | null = null;
  if (v.rival !== null) {
    const r = v.rival;
    const rm = isObj(r) ? parseBuild(r.mods) : null;
    if (!isObj(r) || !rm || typeof r.name !== 'string' || typeof r.coreId !== 'string' || !isNum(r.seed)) return null;
    if (!coreDef(r.coreId)) return null;
    rival = {
      name: r.name,
      coreId: r.coreId,
      mods: rm,
      seed: r.seed,
      bossId: typeof r.bossId === 'string' ? r.bossId : null,
      twist: isObj(r.twist) ? (r.twist as MatchTwist) : null,
      controller: isObj(r.controller) && r.controller.kind === 'heuristic' ? (r.controller as ControllerSpec) : null,
      extraPrimaries: isNum(r.extraPrimaries) ? r.extraPrimaries : 0,
    };
  }
  if (v.phase === 'match' && !rival) return null;
  const history: RoundResult[] = [];
  for (const h of v.history) {
    if (!isObj(h) || !isNum(h.round) || typeof h.won !== 'boolean' || !isNum(h.margin)) return null;
    history.push({
      round: h.round,
      won: h.won,
      margin: h.margin,
      wipeout: h.wipeout === true,
      rivalName: typeof h.rivalName === 'string' ? h.rivalName : '',
    });
  }
  return {
    version: 1,
    seed: v.seed,
    rng: { a: rng.a as number, b: rng.b as number, c: rng.c as number, d: rng.d as number },
    mode: v.mode,
    ascension: Math.max(0, Math.min(MAX_ASCENSION, Math.floor(v.ascension))),
    coreId: v.coreId,
    build,
    round: Math.max(1, Math.floor(v.round)),
    hearts: Math.floor(v.hearts),
    rerolls: Math.max(0, Math.floor(v.rerolls)),
    phase: v.phase,
    offer: v.offer,
    rival,
    history,
    endless: v.endless,
    outcome: v.outcome,
    unlockedMods: isStrArr(v.unlockedMods) ? v.unlockedMods : null,
    bonusOffers: isNum(v.bonusOffers) ? Math.max(0, Math.floor(v.bonusOffers)) : 0,
    bossesMet: isStrArr(v.bossesMet) ? v.bossesMet : [],
  };
}
