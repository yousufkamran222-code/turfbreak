import { describe, expect, it } from 'vitest';
import { defaultSave, parseSave, serializeSave } from '../src/meta/save';
import { startRun } from '../src/run/run';

describe('save', () => {
  it('round-trips', () => {
    const s = { ...defaultSave(), launches: 5 };
    expect(parseSave(serializeSave(s))).toEqual(s);
  });

  it.each([null, '', '{', 'null', '42', '"x"', '{"version":1}', '{"version":99,"launches":3}', '{"version":1,"launches":"3"}'])(
    'falls back to a fresh save for %s',
    (raw) => {
      expect(parseSave(raw)).toEqual(defaultSave());
    },
  );
});

describe('save v2', () => {
  it('migrates v1 and keeps the launch counter', () => {
    const s = parseSave('{"version":1,"launches":7}');
    expect(s).toEqual({ ...defaultSave(), launches: 7 });
    expect(s.version).toBe(2);
  });

  it('round-trips a save with a run in progress', () => {
    const run = startRun({ seed: 9, coreId: 'ricochet' });
    const s = {
      ...defaultSave(),
      launches: 3,
      run,
      stats: { ...defaultSave().stats, runsStarted: 2, bestRound: { ricochet: 6 } },
      bestAscension: { ricochet: 2 },
      settings: { ...defaultSave().settings, reduceMotion: true, musicVolume: 0.2 },
    };
    expect(parseSave(serializeSave(s))).toEqual(s);
  });

  it('falls back field by field', () => {
    const doc = {
      version: 2,
      launches: 4,
      settings: { musicVolume: 'loud', sfxVolume: 0.5, haptics: 'yes', reduceMotion: true },
      run: { version: 1, nonsense: true },
      stats: { runsStarted: -3, runsWon: 2, matchesWon: 'x', bestRound: { ricochet: 5, bad: 'x' } },
      unlocks: 'all',
      bestAscension: [1, 2],
    };
    const s = parseSave(JSON.stringify(doc));
    const d = defaultSave();
    expect(s.launches).toBe(4);
    expect(s.settings).toEqual({ ...d.settings, sfxVolume: 0.5, reduceMotion: true });
    expect(s.run).toBeNull();
    expect(s.stats).toEqual({ ...d.stats, runsWon: 2, runsCompleted: 2, bestRound: { ricochet: 5 } });
    expect(s.unlocks).toEqual(d.unlocks);
    expect(s.bestAscension).toEqual({});
  });

  it('drops a corrupt run alone', () => {
    const good = { ...defaultSave(), launches: 2, run: startRun({ seed: 1, coreId: 'ricochet' }) };
    const doc = JSON.parse(serializeSave(good)) as Record<string, unknown>;
    (doc.run as Record<string, unknown>).rng = 'broken';
    const s = parseSave(JSON.stringify(doc));
    expect(s.run).toBeNull();
    expect(s.launches).toBe(2);
    const unknownCore = JSON.parse(serializeSave(good)) as { run: { coreId: string } };
    unknownCore.run.coreId = 'gone';
    expect(parseSave(JSON.stringify(unknownCore)).run).toBeNull();
  });

  it('never throws on a version 2 document with wrong types', () => {
    for (const raw of ['{"version":2}', '{"version":2,"settings":null,"stats":5,"run":7}', '{"version":3,"launches":1}']) {
      expect(() => parseSave(raw)).not.toThrow();
    }
  });
});
