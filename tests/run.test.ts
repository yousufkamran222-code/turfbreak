import { afterEach, describe, expect, it } from 'vitest';
import { ascensionTiers, baseRules, rulesFor } from '../src/content/ascension';
import { bosses } from '../src/content/bosses';
import { cores } from '../src/content/cores';
import { mods } from '../src/content/mods';
import { archetypes, rivalTier } from '../src/content/rivals';
import {
  buildFromList,
  buildPicks,
  continueEndless,
  finishMatch,
  matchConfig,
  pickMod,
  replaceMod,
  rerollOffer,
  startRun,
  type RunState,
} from '../src/run/run';
import type { ModDef } from '../src/sim/abilities';

const win = { won: true, margin: 10, wipeout: false };
const loss = { won: false, margin: 10, wipeout: false };
/** Take the first offer, or skip when it needs a replace. */
function firstOffer(run: RunState): RunState {
  const picked = pickMod(run, run.offer[0] ?? null);
  return picked === run ? pickMod(run, null) : picked;
}
const sum = (b: { level: number }[]): number => b.reduce((s, e) => s + e.level, 0);

/** Play a run by always taking the first offer. `results` gives each match outcome, repeating the last. */
function play(run: RunState, results: (typeof win)[], until: (r: RunState) => boolean = () => false): RunState {
  let i = 0;
  while (run.phase !== 'summary' && !until(run)) {
    if (run.phase === 'draft') run = firstOffer(run);
    else run = finishMatch(run, results[Math.min(i++, results.length - 1)]!);
  }
  return run;
}

const fakes: ModDef[] = [];
function addFake(id: string, run: NonNullable<ModDef['run']>): void {
  const fake: ModDef = { id, name: id, glyph: '#' + id, rarity: 'common', group: 'Economy', text: () => id, run, hooks: {} };
  (mods as ModDef[]).push(fake);
  fakes.push(fake);
}
afterEach(() => {
  for (const f of fakes.splice(0)) (mods as ModDef[]).splice((mods as ModDef[]).indexOf(f), 1);
});

describe('run basics', () => {
  it('starts in a draft with 3 offers, 3 hearts and 1 reroll', () => {
    const run = startRun({ seed: 1, coreId: 'ricochet' });
    expect(run).toMatchObject({ phase: 'draft', round: 1, hearts: 3, rerolls: 1, outcome: null, endless: false });
    expect(run.offer).toHaveLength(3);
    expect(new Set(run.offer).size).toBe(3);
  });

  it('is reproducible from the seed and the choices', () => {
    const a = play(startRun({ seed: 42, coreId: 'ricochet' }), [win, loss, win, win, loss]);
    const b = play(startRun({ seed: 42, coreId: 'ricochet' }), [win, loss, win, win, loss]);
    expect(b).toEqual(a);
    expect(play(startRun({ seed: 43, coreId: 'ricochet' }), [win, loss, win, win, loss])).not.toEqual(a);
  });

  it('does not mutate its input and survives a JSON round trip mid-run', () => {
    let run = startRun({ seed: 7, coreId: 'splitter' });
    run = pickMod(run, run.offer[0]!);
    const frozen = JSON.stringify(run);
    const rt = JSON.parse(frozen) as RunState;
    const next = finishMatch(run, win);
    expect(JSON.stringify(run)).toBe(frozen);
    expect(finishMatch(rt, win)).toEqual(next);
    const nextRt = JSON.parse(JSON.stringify(next)) as RunState;
    expect(pickMod(nextRt, nextRt.offer[1]!)).toEqual(pickMod(next, next.offer[1]!));
  });

  it('builds a match with the player on side 0', () => {
    const run = pickMod(startRun({ seed: 3, coreId: 'ricochet' }), null);
    const cfg = matchConfig(run);
    expect(cfg.cores[0].id).toBe('ricochet');
    expect(cfg.cores[1].id).toBe(run.rival!.coreId);
    expect(cfg.seed).toBe(run.rival!.seed);
    expect(cfg.controllers![0]).toBeNull();
    expect(() => matchConfig(startRun({ seed: 3, coreId: 'ricochet' }))).toThrow();
  });

  it('ignores calls in the wrong phase or with ids that are not on offer', () => {
    const run = startRun({ seed: 4, coreId: 'ricochet' });
    expect(pickMod(run, 'not-a-mod')).toBe(run);
    expect(finishMatch(run, win)).toBe(run);
    expect(continueEndless(run)).toBe(run);
    const m = pickMod(run, null);
    expect(pickMod(m, null)).toBe(m);
    expect(rerollOffer(m)).toBe(m);
  });

  it('names rivals by colour and Core, using the alt colour for the same Core', () => {
    for (let seed = 1; seed < 40; seed++) {
      const run = pickMod(startRun({ seed, coreId: 'ricochet' }), null);
      const rival = run.rival!;
      if (rival.bossId) continue;
      const core = cores.find((c) => c.id === rival.coreId)!;
      const colour = core.id === 'ricochet' ? core.altColorName : core.colorName;
      expect(rival.name).toBe(`${colour} ${core.name}`.toUpperCase());
    }
  });
});

describe('hearts and the end of a run', () => {
  it('a loss costs a heart and three losses end the run', () => {
    let run = startRun({ seed: 5, coreId: 'ricochet' });
    run = play(run, [loss], (r) => r.hearts === 2 && r.phase === 'draft');
    expect(run.round).toBe(2);
    run = play(run, [loss]);
    expect(run).toMatchObject({ phase: 'summary', outcome: 'lost', hearts: 0 });
    expect(run.history).toHaveLength(3);
  });

  it('winning round 10 wins the run; losing it ends the run', () => {
    const won = play(startRun({ seed: 6, coreId: 'ricochet' }), [win]);
    expect(won).toMatchObject({ phase: 'summary', outcome: 'won', hearts: 3 });
    expect(won.history).toHaveLength(10);
    const lost = play(startRun({ seed: 6, coreId: 'ricochet' }), [win, win, win, win, win, win, win, win, win, loss]);
    expect(lost).toMatchObject({ phase: 'summary', outcome: 'lost', hearts: 2 });
  });
});

describe('drafting', () => {
  it('rerolling spends a reroll and shows a different offer; skipping gains one', () => {
    const run = startRun({ seed: 8, coreId: 'ricochet' });
    const again = rerollOffer(run);
    expect(again.rerolls).toBe(0);
    expect(again.offer).toHaveLength(3);
    expect(again.offer.some((id) => !run.offer.includes(id))).toBe(true);
    expect(rerollOffer(again)).toBe(again);
    const skipped = pickMod(run, null);
    expect(skipped.rerolls).toBe(2);
    expect(skipped.phase).toBe('match');
    expect(skipped.build).toEqual([]);
  });

  it('levels an owned Mod up to 3 and never offers a maxed one', () => {
    let run = startRun({ seed: 9, coreId: 'ricochet' });
    const id = run.offer[0]!;
    run = pickMod(run, id);
    for (let i = 0; i < 4; i++) {
      run = finishMatch(run, win);
      run = pickMod({ ...run, offer: [id, ...run.offer] }, id);
    }
    expect(run.build).toEqual([{ id, level: 3 }]);
    run = finishMatch(run, win);
    expect(run.offer).not.toContain(id);
  });

  it('caps the build at 6 and replaces a slot only through replaceMod', () => {
    let run = startRun({ seed: 10, coreId: 'ricochet' });
    const ids = mods.map((m) => m.id);
    run = { ...run, build: ids.slice(0, 6).map((id) => ({ id, level: 1 })), offer: [ids[6]!] };
    expect(pickMod(run, ids[6]!)).toBe(run);
    expect(replaceMod(run, ids[6]!, 6)).toBe(run);
    expect(replaceMod(run, ids[0]!, 0)).toBe(run);
    const r = replaceMod(run, ids[6]!, 2);
    expect(r.build).toHaveLength(6);
    expect(r.build[2]).toEqual({ id: ids[6], level: 1 });
    expect(r.build.map((e) => e.id)).not.toContain(ids[2]);
    expect(r.phase).toBe('match');
  });

  it('later rounds offer more rares', () => {
    const rares = (round: number): number => {
      let n = 0;
      for (let seed = 1; seed <= 300; seed++) {
        const run = { ...startRun({ seed, coreId: 'ricochet' }), round };
        const again = rerollOffer(run);
        n += again.offer.filter((id) => mods.find((m) => m.id === id)?.rarity === 'rare').length;
      }
      return n;
    };
    expect(rares(10)).toBeGreaterThan(rares(1));
  });

  it('restricts the pool to unlockedMods', () => {
    const allowed = mods.slice(0, 4).map((m) => m.id);
    let run = startRun({ seed: 11, coreId: 'ricochet', unlockedMods: allowed });
    run = play(run, [win], (r) => r.round === 6);
    expect(run.offer.every((id) => allowed.includes(id))).toBe(true);
    expect(startRun({ seed: 11, coreId: 'ricochet', unlockedMods: [] }).offer).toEqual([]);
  });
});

describe('economy', () => {
  it('a Wipeout win grants a reroll', () => {
    const run = pickMod(startRun({ seed: 12, coreId: 'ricochet' }), null);
    expect(finishMatch(run, { won: true, margin: 40, wipeout: true }).rerolls).toBe(run.rerolls + 1);
    expect(finishMatch(run, win).rerolls).toBe(run.rerolls);
    expect(finishMatch(run, { won: false, margin: 40, wipeout: true }).rerolls).toBe(run.rerolls);
  });

  it('rerollsPerWin pays out after wins only', () => {
    addFake('fake-scav', (l) => ({ rerollsPerWin: l }));
    let run = pickMod(startRun({ seed: 13, coreId: 'ricochet' }), null);
    run = { ...run, build: [{ id: 'fake-scav', level: 2 }] };
    expect(finishMatch(run, win).rerolls).toBe(run.rerolls + 2);
    expect(finishMatch(run, loss).rerolls).toBe(run.rerolls);
  });

  it('extraOffers widen the next draft after a big win only', () => {
    addFake('fake-collector', (l) => ({ extraOffers: l, bigWinMargin: 20 }));
    let run = pickMod(startRun({ seed: 14, coreId: 'ricochet' }), null);
    run = { ...run, build: [{ id: 'fake-collector', level: 1 }] };
    expect(finishMatch(run, { won: true, margin: 25, wipeout: false }).offer).toHaveLength(4);
    expect(finishMatch(run, { won: true, margin: 5, wipeout: false }).offer).toHaveLength(3);
    const big = finishMatch(run, { won: true, margin: 25, wipeout: false });
    expect(finishMatch(pickMod(big, null), win).offer).toHaveLength(3);
  });
});

describe('rivals and bosses', () => {
  it('has bosses on rounds 5 and 10 with no repeat in a run', () => {
    for (let seed = 1; seed <= 20; seed++) {
      let run = startRun({ seed, coreId: 'splitter' });
      const seen: Record<number, string | null> = {};
      while (run.phase !== 'summary') {
        if (run.phase === 'draft') run = firstOffer(run);
        else {
          seen[run.round] = run.rival!.bossId;
          run = finishMatch(run, win);
        }
      }
      for (let r = 1; r <= 10; r++) expect(seen[r] !== null).toBe(r === 5 || r === 10);
      expect(seen[5]).not.toBe(seen[10]);
    }
  });

  it('gives a boss its twist and Core', () => {
    const run = play(startRun({ seed: 2, coreId: 'ricochet' }), [win], (r) => r.round === 5 && r.phase === 'draft');
    const m = pickMod(run, null);
    const def = bosses.find((b) => b.id === m.rival!.bossId)!;
    expect(m.rival!.name).toBe(def.name);
    expect(m.rival!.coreId).toBe(def.coreId);
    expect(matchConfig(m).twist).toEqual(def.twist);
    expect(m.rival!.controller).not.toBeNull();
  });

  it('defines four bosses with capitalised names and one-line twists', () => {
    expect(bosses).toHaveLength(4);
    for (const b of bosses) {
      expect(b.name).toBe(b.name.toUpperCase());
      expect(b.description).not.toContain('\n');
      expect(Object.keys(b.twist).length).toBeGreaterThan(0);
    }
  });

  it('scales rivals monotonically with the round', () => {
    for (let r = 1; r < 30; r++) {
      const a = rivalTier(r);
      const b = rivalTier(r + 1);
      expect(b.picks).toBeGreaterThanOrEqual(a.picks);
      expect(b.levelBonus).toBeGreaterThanOrEqual(a.levelBonus);
      expect(b.extraPrimaries).toBeGreaterThanOrEqual(a.extraPrimaries);
      if (a.controller) expect(b.controller).toBe(true);
    }
    expect(rivalTier(1).controller).toBe(false);
    expect(rivalTier(2).controller).toBe(false);
    expect(rivalTier(1).picks).toBeLessThan(rivalTier(10).picks);
  });

  it('turns archetype lists into legal builds and skips unknown ids', () => {
    for (const list of Object.values(archetypes).flat()) {
      for (let k = 0; k <= 12; k++) {
        const b = buildFromList(list.mods, k);
        expect(b.length).toBeLessThanOrEqual(6);
        expect(b.every((e) => e.level >= 1 && e.level <= 3)).toBe(true);
        expect(sum(b)).toBeLessThanOrEqual(k);
      }
    }
    expect(buildFromList(['nope', 'overclock', 'nope', 'overclock'], 2)).toEqual([{ id: 'overclock', level: 2 }]);
    expect(buildFromList(['overclock'], 5, 1)).toEqual([{ id: 'overclock', level: 3 }]);
    expect(buildFromList([], 3)).toEqual([]);
  });

  it('rival builds grow over a run', () => {
    let run = startRun({ seed: 21, coreId: 'ricochet' });
    const strength: number[] = [];
    while (run.phase !== 'summary') {
      if (run.phase === 'draft') run = firstOffer(run);
      else {
        strength.push(sum(run.rival!.mods));
        run = finishMatch(run, win);
      }
    }
    expect(strength[9]!).toBeGreaterThan(strength[0]!);
  });
});

describe('ascension', () => {
  it('has tiers 1 to 8 each with a one-line description', () => {
    expect(ascensionTiers.map((t) => t.tier)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    for (const t of ascensionTiers) expect(t.description).toMatch(/^[^\n]+$/);
    expect(rulesFor(0)).toEqual(baseRules);
    expect(rulesFor(99)).toEqual(rulesFor(8));
    expect(rulesFor(-3)).toEqual(baseRules);
  });

  it('applies start rules: no rerolls, 2 hearts', () => {
    expect(startRun({ seed: 1, coreId: 'ricochet', ascension: 1 }).rerolls).toBe(1);
    expect(startRun({ seed: 1, coreId: 'ricochet', ascension: 2 }).rerolls).toBe(0);
    expect(startRun({ seed: 1, coreId: 'ricochet', ascension: 7 }).hearts).toBe(3);
    expect(startRun({ seed: 1, coreId: 'ricochet', ascension: 8 }).hearts).toBe(2);
  });

  it('moves bosses at tier 3', () => {
    let run = startRun({ seed: 3, coreId: 'splitter', ascension: 3 });
    const bossRounds: number[] = [];
    while (run.phase !== 'summary') {
      if (run.phase === 'draft') run = firstOffer(run);
      else {
        if (run.rival!.bossId) bossRounds.push(run.round);
        run = finishMatch(run, win);
      }
    }
    expect(bossRounds).toEqual([4, 7, 10]);
  });

  it('makes rivals stronger and better controlled at higher tiers', () => {
    const at = (ascension: number, round: number): RunState =>
      play(startRun({ seed: 30, coreId: 'ricochet', ascension }), [win], (r) => r.round === round && r.phase === 'draft');
    const strength = (asc: number): number => sum(pickMod(at(asc, 8), null).rival!.mods);
    expect(strength(1)).toBeGreaterThanOrEqual(strength(0));
    expect(strength(5)).toBeGreaterThan(strength(1));
    expect(strength(8)).toBeGreaterThanOrEqual(strength(5));
    expect(pickMod(startRun({ seed: 30, coreId: 'ricochet', ascension: 3 }), null).rival!.controller).toBeNull();
    expect(pickMod(startRun({ seed: 30, coreId: 'ricochet', ascension: 4 }), null).rival!.controller).not.toBeNull();
    const sharp = pickMod(startRun({ seed: 30, coreId: 'ricochet', ascension: 6 }), null).rival!.controller;
    expect(sharp).toMatchObject({ kind: 'heuristic', aimError: 0.05, patience: 1.25 });
  });
});

describe('endless', () => {
  it('continues from a won run with scaling rivals until hearts run out', () => {
    const won = play(startRun({ seed: 50, coreId: 'ricochet' }), [win]);
    expect(won.outcome).toBe('won');
    const e = continueEndless(won);
    expect(e).toMatchObject({ phase: 'draft', round: 11, endless: true, outcome: null, hearts: 3 });
    expect(continueEndless(e)).toBe(e);
    let run = e;
    const bossRounds: number[] = [];
    const strength: number[] = [];
    while (run.phase !== 'summary' && run.round <= 16) {
      if (run.phase === 'draft') run = firstOffer(run);
      else {
        if (run.rival!.bossId) bossRounds.push(run.round);
        strength.push(sum(run.rival!.mods));
        run = finishMatch(run, win);
      }
    }
    expect(bossRounds).toEqual([15]);
    expect(run.phase).toBe('draft');
    expect(strength[strength.length - 1]!).toBeGreaterThanOrEqual(strength[0]!);
    const out = play(run, [loss]);
    expect(out).toMatchObject({ phase: 'summary', outcome: 'lost', hearts: 0, endless: true });
  });

  it('does not continue from a lost run', () => {
    const lost = play(startRun({ seed: 51, coreId: 'ricochet' }), [loss]);
    expect(continueEndless(lost)).toBe(lost);
  });
});

describe('unknown ids', () => {
  it('skips unknown Mods in builds and matches', () => {
    let run = pickMod(startRun({ seed: 60, coreId: 'ricochet' }), null);
    run = { ...run, build: [{ id: 'ghost', level: 2 }, { id: 'overclock', level: 1 }], rival: { ...run.rival!, mods: [{ id: 'phantom-mod', level: 3 }] } };
    expect(buildPicks(run.build).map((p) => p.mod.id)).toEqual(['overclock']);
    const cfg = matchConfig(run);
    expect(cfg.mods![0]).toHaveLength(1);
    expect(cfg.mods![1]).toHaveLength(0);
    expect(finishMatch(run, win).phase).toBe('draft');
  });

  it('never offers or picks ids outside the pool', () => {
    const run = startRun({ seed: 61, coreId: 'ricochet', unlockedMods: ['ghost', mods[0]!.id] });
    expect(run.offer).toEqual([mods[0]!.id]);
  });
});

describe('rewarded placements', () => {
  it('revive restores one heart once per run, and never in the Daily', async () => {
    const { canRevive, revive } = await import('../src/run/run');
    const lose = { won: false, margin: 10, wipeout: false };
    let run = startRun({ seed: 9, coreId: 'ricochet' });
    while (run.phase !== 'summary') run = run.phase === 'draft' ? pickMod(run, null) : finishMatch(run, lose);
    expect(run.outcome).toBe('lost');
    expect(canRevive(run)).toBe(true);
    const back = revive(run);
    expect(back.hearts).toBe(1);
    expect(back.phase).toBe('draft');
    expect(back.round).toBe(run.round + 1);
    let again = back;
    while (again.phase !== 'summary') again = again.phase === 'draft' ? pickMod(again, null) : finishMatch(again, lose);
    expect(canRevive(again)).toBe(false);
    let daily = startRun({ seed: 9, coreId: 'ricochet', mode: 'daily' });
    while (daily.phase !== 'summary') daily = daily.phase === 'draft' ? pickMod(daily, null) : finishMatch(daily, lose);
    expect(canRevive(daily)).toBe(false);
  });

  it('ad reroll adds one reroll once per draft', async () => {
    const { adReroll, canAdReroll } = await import('../src/run/run');
    const run = startRun({ seed: 9, coreId: 'ricochet' });
    const r1 = adReroll(run);
    expect(r1.rerolls).toBe(run.rerolls + 1);
    expect(canAdReroll(r1)).toBe(false);
    expect(adReroll(r1)).toBe(r1);
    const next = finishMatch(pickMod(r1, null), { won: true, margin: 5, wipeout: false });
    expect(canAdReroll(next)).toBe(true);
  });
});
