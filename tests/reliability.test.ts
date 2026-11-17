import { describe, expect, it, vi } from 'vitest';
import { coreById } from '../src/content/cores';
import { rivalTier } from '../src/content/rivals';
import { Persistence } from '../src/meta/persistence';
import { decodeReplay, encodeReplay, type ReplayData } from '../src/meta/replay';
import { defaultSave, parseSave } from '../src/meta/save';
import { parseRun, pickMod, startRun } from '../src/run/run';
import { hashWorld } from '../src/sim/hash';
import { validBuild, validController, validInputs, validTwist } from '../src/sim/validation';
import { createWorld } from '../src/sim/world';
import { blankWorld } from './helpers';

const data: ReplayData = { version: '0.7.0', seed: 7, cores: ['ricochet', 'splitter'], builds: [[], []], twist: null, inputs: [] };

describe('untrusted match data', () => {
  it.each([{ extraPrimaries: [1e12, 0] }, { extraPrimaries: [1] }, { durationSeconds: -1 }, { durationSeconds: Infinity }, { pickupEverySeconds: 0 }, { startShare: NaN }, { startShields: [256, 0] }, { unknown: true }])('rejects bad twist %j', (twist) => {
    expect(validTwist(twist)).toBe(false);
  });
  it('accepts safe bounds and refuses oversized or duplicated builds', () => {
    expect(validTwist({ extraPrimaries: [31, 31], durationSeconds: 120, pickupEverySeconds: 1, startShields: [255, 0] })).toBe(true);
    expect(validBuild([{ id: 'x', level: 1 }, { id: 'x', level: 2 }], ['x'])).toBe(false);
    expect(validBuild([{ id: 'removed', level: 1 }], ['x'])).toBe(false);
    expect(validController({ kind: 'heuristic', aimError: 99, patience: 1 })).toBe(false);
    expect(validInputs([{ step: Number.MAX_SAFE_INTEGER, type: 'ultimate', side: 0 }], 40)).toBe(false);
    expect(validInputs([{ step: 1, type: 'launch', side: 0, dx: 0, dy: 0 }], 40)).toBe(false);
  });
  it('rejects checksum-valid dangerous replay values and oversized text', () => {
    for (const twist of [{ extraPrimaries: [1e10, 0] as const }, { durationSeconds: -1 }, { pickupEverySeconds: 0 }]) {
      expect(decodeReplay(encodeReplay({ ...data, twist }), '0.7.0').ok).toBe(false);
    }
    expect(decodeReplay('A'.repeat(16385), '0.7.0').ok).toBe(false);
    expect(decodeReplay(encodeReplay({ ...data, builds: [[{ id: 'overclock', level: 1 }, { id: 'overclock', level: 2 }], []] }), '0.7.0').ok).toBe(false);
  });
  it('rejects dangerous direct world construction and caps Endless setup', () => {
    expect(() => createWorld({ seed: 1, cores: [coreById('pulse'), coreById('bloom')], twist: { extraPrimaries: [1000000, 0] } })).toThrow('Invalid match');
    expect(rivalTier(100000).extraPrimaries).toBe(31);
    const w = createWorld({ seed: 1, cores: [coreById('pulse'), coreById('pulse')], twist: { extraPrimaries: [31, 31] } });
    expect(w.runners.length).toBe(64);
  });
  it('drops only an invalid active run, preserving valid player progress', () => {
    const save = defaultSave();
    save.settings.sfxVolume = 0.25;
    save.stats.runsWon = 4;
    const run = startRun({ seed: 3, coreId: 'ricochet' });
    const match = pickMod(run, run.offer[0]!);
    expect(parseRun(match)).not.toBeNull();
    const bad = { ...match, rival: { ...match.rival, controller: { kind: 'heuristic', aimError: 'bad', patience: 1 } } };
    const recovered = parseSave(JSON.stringify({ ...save, run: bad }));
    expect(recovered.run).toBeNull();
    expect(recovered.settings.sfxVolume).toBe(0.25);
    expect(recovered.stats.runsWon).toBe(4);
    expect(recovered.unlocks).toEqual(save.unlocks);
  });
});

describe('ordered persistence', () => {
  it('serializes writes and coalesces pending values to the newest', async () => {
    const releases: (() => void)[] = [];
    const calls: string[] = [];
    const p = new Persistence(async (_key, value) => { calls.push(value); await new Promise<void>((resolve) => releases.push(resolve)); });
    p.set('save', 'first');
    await Promise.resolve();
    p.set('save', 'middle'); p.set('save', 'newest');
    expect(calls).toEqual(['first']);
    releases.shift()!();
    await vi.waitFor(() => expect(calls).toEqual(['first', 'newest']));
    releases.shift()!();
    await p.flush();
  });
  it('retains failures, reports them and retries the newest value', async () => {
    const status: boolean[] = [];
    const write = vi.fn<(_key: string, value: string) => Promise<void>>().mockRejectedValueOnce(new Error('full')).mockResolvedValue(undefined);
    const p = new Persistence(write, (failed) => status.push(failed));
    p.set('save', 'old'); await p.flush();
    expect(status.at(-1)).toBe(true);
    p.set('save', 'new'); await p.flush();
    expect(write.mock.calls.map((c) => c[1])).toEqual(['old', 'new']);
    expect(status.at(-1)).toBe(false);
  });
  it('flushes a new write queued while an earlier worker is settling', async () => {
    const calls: string[] = [];
    let again = true;
    const p = new Persistence(async (_key, value) => { calls.push(value); }, () => {
      if (again) { again = false; p.set('save', 'second'); }
    });
    p.set('save', 'first'); await p.flush();
    expect(calls).toEqual(['first', 'second']);
  });
  it('lets different keys complete independently', async () => {
    let release!: () => void;
    const done: string[] = [];
    const p = new Persistence(async (key) => { if (key === 'slow') await new Promise<void>((r) => { release = r; }); done.push(key); });
    p.set('slow', 'a'); p.set('fast', 'b');
    await vi.waitFor(() => expect(done).toEqual(['fast']));
    release(); await p.flush(); expect(done).toEqual(['fast', 'slow']);
  });
});

describe('complete state hashes', () => {
  it.each(['timer', 'counter', 'triggerDiscount', 'runnerMultiplier', 'shieldHistory', 'pickupSchedule', 'aiRandom', 'pending', 'winner'])('detects changes to %s', (field) => {
    const w = blankWorld();
    const before = hashWorld(w);
    if (field === 'timer') w.contexts[0].after(1, { kind: 'grant-ultimate' });
    if (field === 'counter') w.sides[0].counters[2] = 5;
    if (field === 'triggerDiscount') w.sides[0].stats.triggerDiscount.add = 1;
    if (field === 'runnerMultiplier') w.runners[0]!.speedMul = 2;
    if (field === 'shieldHistory') w.cellShieldStep[0] = 10;
    if (field === 'pickupSchedule') w.nextPickupStep++;
    if (field === 'aiRandom') w.aiRngs[1].next();
    if (field === 'pending') w.pendingInputs.push({ step: 2, type: 'ultimate', side: 0 });
    if (field === 'winner') w.winner = 1;
    expect(hashWorld(w)).not.toBe(before);
  });
  it('distinguishes equal timer counts with different payloads and deadlines', () => {
    const w = blankWorld();
    w.contexts[0].after(1, { kind: 'core', action: 'spread', cell: 3 });
    const a = hashWorld(w);
    w.timers[0]!.effect = { kind: 'core', action: 'spread', cell: 4 };
    expect(hashWorld(w)).not.toBe(a);
    const b = hashWorld(w); w.timers[0]!.step++; expect(hashWorld(w)).not.toBe(b);
  });
});
