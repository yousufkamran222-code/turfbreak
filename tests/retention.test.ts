import { describe, expect, it } from 'vitest';
import { cores } from '../src/content/cores';
import { dailyCoreId, dailySeed, dailyShareText, gridEmoji, previousDay, utcDay } from '../src/content/daily';
import { mods } from '../src/content/mods';
import { feats, featFor, newlyMet, startingCores, startingMods, type MatchSummary } from '../src/content/unlocks';
import { applyMatch } from '../src/meta/progress';
import { defaultSave, defaultStats, parseSave, type Save } from '../src/meta/save';
import { finishMatch, pickMod, startRun } from '../src/run/run';
import { collectionProgress, coreRecords } from '../src/ui/CollectionScreen';
import { cycleMod, LAB_MAX_MODS } from '../src/ui/LabScreen';
import { MatchStats } from '../src/ui/matchStats';
import { stepWorld } from '../src/sim/step';
import { createWorld } from '../src/sim/world';

const summary = (o: Partial<MatchSummary> = {}): MatchSummary => ({
  coreId: 'ricochet',
  rivalCoreId: 'splitter',
  won: true,
  margin: 10,
  wipeout: false,
  seconds: 40,
  leadChanges: 1,
  maxRunners: 1,
  maxSplits: 0,
  peakDeficit: 0,
  shieldAbsorbed: 0,
  pickups: 0,
  ultimates: 0,
  lastUltimateLeft: null,
  leadLate: false,
  triggers: 0,
  longestBeam: 0,
  mods: 0,
  ...o,
});

describe('unlock data', () => {
  it('gives every non-starting Core and Mod exactly one feat, and starters none', () => {
    for (const c of cores) expect(!!featFor('core', c.id)).toBe(!startingCores.includes(c.id));
    for (const m of mods) expect(!!featFor('mod', m.id)).toBe(!startingMods.includes(m.id));
    expect(feats.length).toBe(cores.length - startingCores.length + mods.length - startingMods.length);
    for (const id of [...startingCores]) expect(cores.some((c) => c.id === id)).toBe(true);
    for (const id of startingMods) expect(mods.some((m) => m.id === id)).toBe(true);
  });

  it('starts with 3 Cores, about 14 Mods and only one pickup Mod', () => {
    expect(startingCores.length).toBe(3);
    expect(startingMods.length).toBe(14);
    const pickupMods = ['afterburner', 'shockwave', 'bulwark', 'magnet'];
    expect(startingMods.filter((id) => pickupMods.includes(id))).toHaveLength(1);
  });
});

describe('feat evaluation', () => {
  const have = { cores: [...startingCores], mods: [...startingMods] };
  const ctx = (match: MatchSummary | null, extra = {}) => ({ match, run: null, stats: defaultStats(), ...extra });
  const ids = (c: ReturnType<typeof ctx>) => newlyMet(have, c).map((f) => f.id);

  it('checks match feats from the summary, and only on wins where it says so', () => {
    expect(ids(ctx(summary({ wipeout: true })))).toContain('leech');
    expect(ids(ctx(summary({ won: false, wipeout: false, margin: 99 })))).not.toContain('afterburner');
    expect(ids(ctx(summary({ margin: 31 })))).toContain('afterburner');
    expect(ids(ctx(summary({ maxSplits: 6 })))).toContain('critical-mass');
    expect(ids(ctx(summary({ shieldAbsorbed: 30 })))).toContain('bulwark');
    expect(ids(ctx(summary({ lastUltimateLeft: 10 })))).toContain('quick-hands');
    expect(ids(ctx(summary({ pickups: 3 })))).toContain('magnet');
  });

  it('checks run and lifetime feats', () => {
    const run = { ...startRun({ seed: 1, coreId: 'ricochet' }), round: 7, outcome: 'won' as const };
    expect(ids(ctx(null, { run }))).toEqual(expect.arrayContaining(['fortress', 'landmines', 'juggernaut']));
    expect(ids(ctx(null, { stats: { ...defaultStats(), matchesWon: 8 } }))).toEqual(expect.arrayContaining(['bloom', 'compound']));
  });

  it('never reports what is already unlocked', () => {
    const all = { cores: cores.map((c) => c.id), mods: mods.map((m) => m.id) };
    expect(newlyMet(all, ctx(summary({ wipeout: true, margin: 99 })))).toEqual([]);
  });

  it('applyMatch records stats and unlocks into the save', () => {
    let run = startRun({ seed: 3, coreId: 'ricochet' });
    run = pickMod(run, run.offer[0]!);
    const save = { ...defaultSave(), run };
    const done = applyMatch(save, { winner: 0, margin: 35, wipeout: true, summary: summary({ margin: 35, wipeout: true, seconds: 31.4, longestBeam: 500, pickups: 2, ultimates: 1 }) });
    expect(done.unlocked.map((f) => f.id)).toEqual(expect.arrayContaining(['leech', 'afterburner']));
    expect(done.save.unlocks.cores).toContain('leech');
    expect(done.save.unlocks.mods).toContain('afterburner');
    const c = done.save.stats.byCore.ricochet!;
    expect([c.bestMargin, c.longestBeam, c.fastestWipeout]).toEqual([35, 500, 31]);
    expect(done.save.stats.pickups).toBe(2);
    expect(done.save.stats.wipeouts).toBe(1);
    // Applying again with no run in the match phase changes nothing.
    expect(applyMatch(done.save, { winner: 0, margin: 1, wipeout: false }).unlocked).toEqual([]);
  });

  it('counts a finished run once, and Daily results and streaks', () => {
    let run = startRun({ seed: 3, coreId: 'pulse', mode: 'daily' });
    let save: Save = { ...defaultSave(), daily: { day: '2026-11-17', result: null }, streak: { last: '2026-11-16', count: 2, best: 2 } };
    for (let i = 0; i < 40 && run.phase !== 'summary'; i++) {
      if (run.phase === 'draft') run = pickMod(run, null);
      else {
        save = { ...save, run };
        const a = applyMatch(save, { winner: 0, margin: 5, wipeout: false });
        save = a.save;
        run = save.run!;
      }
    }
    expect(save.stats.runsCompleted).toBe(1);
    expect(save.daily?.result?.won).toBe(true);
    expect(save.daily?.result?.grid).toBe('W'.repeat(10));
    expect(save.streak).toEqual({ last: '2026-11-17', count: 3, best: 3 });
    expect(save.bestAscension).toEqual({}); // Daily never raises Ascension
    expect(finishMatch).toBeTypeOf('function');
  });
});

describe('match stats collector', () => {
  it('counts a real match', () => {
    const [a, b] = [cores[1]!, cores[0]!];
    const w = createWorld({ seed: 11, cores: [a, b] });
    const st = new MatchStats(w, 0, b.id);
    while (w.phase !== 'ended') {
      stepWorld(w);
      st.observe(w);
    }
    const s = st.summary(w);
    expect(s.coreId).toBe('splitter');
    expect(s.margin).toBe(Math.abs(w.counts[0] - w.counts[1]));
    expect(s.won).toBe(w.winner === 0);
    expect(s.maxRunners).toBeGreaterThanOrEqual(1);
    expect(s.seconds).toBeCloseTo(w.step / 60);
  });
});

describe('save migration', () => {
  it('merges the new starting roster into an old save without losing anything', () => {
    const old = {
      version: 2,
      launches: 4,
      unlocks: { cores: ['ricochet', 'splitter'], mods: ['overclock', 'afterburner', 'bulwark', 'magnet', 'encore', 'head-start', 'shockwave', 'chain-reaction', 'growth-spurt'] },
      stats: { runsStarted: 2, runsWon: 1, matchesWon: 3, matchesLost: 1, bestRound: { ricochet: 4 } },
    };
    const s = parseSave(JSON.stringify(old));
    for (const id of old.unlocks.mods) expect(s.unlocks.mods).toContain(id);
    for (const id of startingMods) expect(s.unlocks.mods).toContain(id);
    expect(s.unlocks.cores).toEqual(expect.arrayContaining(['ricochet', 'splitter', 'pulse']));
    expect(s.unlocks.cores).toHaveLength(3);
    expect(s.stats.runsCompleted).toBe(1);
    expect(s.stats.byCore).toEqual({});
    expect(s.daily).toBeNull();
  });

  it('round-trips the new fields and ignores garbage in them', () => {
    const s = defaultSave();
    s.daily = { day: '2026-11-17', result: { coreId: 'pulse', won: false, round: 4, rounds: 10, grid: 'WWWL', hearts: 0 } };
    s.streak = { last: '2026-11-17', count: 2, best: 5 };
    expect(parseSave(JSON.stringify(s))).toEqual(s);
    const bad = parseSave(JSON.stringify({ ...s, daily: { day: 'x' }, streak: 7, stats: { byCore: { ricochet: 'no' } } }));
    expect(bad.daily).toBeNull();
    expect(bad.streak.count).toBe(0);
  });
});

describe('Daily Clash', () => {
  it('is deterministic per date and differs between dates', () => {
    expect(dailySeed('2026-11-17')).toBe(dailySeed('2026-11-17'));
    expect(dailySeed('2026-11-17')).not.toBe(dailySeed('2026-11-18'));
    expect(dailySeed('2026-11-17')).toBeGreaterThanOrEqual(0);
    expect(dailyCoreId('2026-11-17')).toBe(dailyCoreId('2026-11-17'));
    const seen = new Set(Array.from({ length: cores.length }, (_, i) => dailyCoreId(utcDay(Date.UTC(2026, 10, 17 + i)))));
    expect(seen.size).toBe(cores.length); // every Core comes round
  });

  it('uses UTC days', () => {
    expect(utcDay(Date.UTC(2026, 10, 17, 23, 59, 59))).toBe('2026-11-17');
    expect(utcDay(Date.UTC(2026, 10, 18, 0, 0, 0))).toBe('2026-11-18');
    expect(previousDay('2026-03-01')).toBe('2026-02-28');
    expect(previousDay('2024-03-01')).toBe('2024-02-29');
    expect(utcDay(0)).toBe('1970-01-01');
  });

  it('gives the same first offer for the same day and choices', () => {
    const mk = () => startRun({ seed: dailySeed('2026-11-17'), coreId: dailyCoreId('2026-11-17'), mode: 'daily' });
    expect(mk().offer).toEqual(mk().offer);
  });

  it('formats the share text', () => {
    const r = { coreId: 'pulse', won: false, round: 4, rounds: 10, grid: 'WSWL', hearts: 0 };
    expect(gridEmoji('WSWL')).toBe('🟩🟨🟩🟥');
    expect(dailyShareText('2026-11-17', 'CYAN PULSE', r)).toBe(
      'Turfbreak Daily Clash 2026-11-17\nCYAN PULSE · Out in round 4/10\n🟩🟨🟩🟥',
    );
    expect(dailyShareText('2026-11-17', 'CYAN PULSE', { ...r, won: true, round: 10, grid: 'W' })).toContain('Run won (10/10)');
  });
});

describe('collection and lab data', () => {
  it('counts found content and lists the records that apply to a Core', () => {
    const p = collectionProgress(defaultSave());
    expect(p).toMatchObject({ found: 17, total: cores.length + mods.length, cores: [3, cores.length], mods: [14, mods.length] });
    const keys = (id: string) => coreRecords(cores.find((c) => c.id === id)!, defaultSave().stats.byCore[id] ?? { runs: 0, runWins: 0, bestMargin: 0, longestBeam: 0, mostSplits: 0, fastestWipeout: 0, bestEndless: 0 }).map(([k]) => k);
    expect(keys('ricochet')).toContain('Longest beam');
    expect(keys('splitter')).toContain('Most splits alive');
    expect(keys('pulse')).not.toContain('Longest beam');
    expect(keys('pulse')).toContain('Fastest Wipeout');
  });

  it('cycles a lab Mod through levels and out, capped at six', () => {
    let b = cycleMod([], 'overclock');
    b = cycleMod(b, 'overclock');
    expect(b).toEqual([{ id: 'overclock', level: 2 }]);
    b = cycleMod(cycleMod(b, 'overclock'), 'overclock');
    expect(b).toEqual([]);
    const full = startingMods.slice(0, LAB_MAX_MODS).reduce((acc, id) => cycleMod(acc, id), [] as { id: string; level: number }[]);
    expect(cycleMod(full, 'decoy')).toHaveLength(LAB_MAX_MODS);
  });
});
