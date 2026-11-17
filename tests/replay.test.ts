import { describe, expect, it } from 'vitest';
import { cores } from '../src/content/cores';
import { tuning } from '../src/content/tuning';
import { decodeReplay, encodeReplay, majorMinor, replayConfig, replayParam, type ReplayData } from '../src/meta/replay';
import { buildPicks, type BuildEntry } from '../src/run/run';
import { hashReplayState } from '../src/sim/hash';
import { queueInput } from '../src/sim/input';
import { stepWorld } from '../src/sim/step';
import { createWorld, type MatchTwist, type World } from '../src/sim/world';

const heuristic = { kind: 'heuristic' as const, ...tuning.ai.rival };

function finish(w: World): number {
  let guard = 0;
  while (w.phase !== 'ended' && guard++ < 100_000) stepWorld(w);
  return hashReplayState(w);
}

/** Play a match the way the UI does (a human side 0 who aims and fires, a controller on side 1) and record it. */
function original(seed: number, a: string, b: string, builds: [BuildEntry[], BuildEntry[]], twist: MatchTwist | null) {
  const ca = cores.find((c) => c.id === a)!;
  const cb = cores.find((c) => c.id === b)!;
  const w = createWorld({
    seed,
    cores: [ca, cb],
    mods: [buildPicks(builds[0]), buildPicks(builds[1])],
    controllers: [null, heuristic],
    ...(twist ? { twist } : {}),
  });
  queueInput(w, { side: 0, type: 'launch', dx: 0.3, dy: -0.7 });
  while (w.phase !== 'ended' && w.step < 100_000) {
    if (w.step === 900) queueInput(w, { side: 0, type: 'ultimate' });
    stepWorld(w);
  }
  const data: ReplayData = { version: '0.3.0', seed, cores: [a, b], builds, twist, inputs: [...w.inputLog] };
  return { w, data, hash: hashReplayState(w) };
}

const cases: [number, string, string, [BuildEntry[], BuildEntry[]], MatchTwist | null][] = [
  [7, 'ricochet', 'splitter', [[], []], null],
  [123, 'splitter', 'pulse', [[{ id: 'overclock', level: 2 }, { id: 'echo', level: 3 }], [{ id: 'decoy', level: 1 }]], null],
  [99, 'fortress', 'leech', [[{ id: 'ramparts', level: 1 }], [{ id: 'underdog', level: 2 }]], { extraPrimaries: [0, 1], startShare: 0.4, durationSeconds: 70 }],
];

describe('replay codes', () => {
  it.each(cases)('round-trips and replays seed %i to the same final state hash', (seed, a, b, builds, twist) => {
    const { data, hash, w } = original(seed, a, b, builds, twist);
    expect(w.inputLog.length).toBeGreaterThanOrEqual(2); // the launch of each side at least

    const code = encodeReplay(data);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(code.length).toBeLessThan(400);
    const back = decodeReplay(code, '0.3.7');
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.data.seed).toBe(seed);
    expect(back.data.cores).toEqual([a, b]);
    expect(back.data.builds).toEqual(builds);
    expect(back.data.twist).toEqual(twist);
    expect(back.data.inputs).toEqual(data.inputs);

    const cfg = replayConfig(back.data)!;
    expect(cfg.controllers).toEqual([null, null]);
    const replayed = createWorld(cfg);
    expect(finish(replayed)).toBe(hash);
    expect(replayed.winner).toBe(w.winner);
    expect(replayed.inputLog).toEqual(w.inputLog);
  });

  it('refuses a code from another major.minor version, and accepts another patch', () => {
    const { data } = original(7, 'ricochet', 'splitter', [[], []], null);
    const code = encodeReplay({ ...data, version: '0.3.0' });
    const other = decodeReplay(code, '0.4.0');
    expect(other.ok).toBe(false);
    if (!other.ok) expect(other.error).toContain('0.3');
    expect(decodeReplay(code, '1.3.0').ok).toBe(false);
    expect(decodeReplay(code, '0.3.9').ok).toBe(true);
  });

  it.each(['', 'abc', '!!!!', 'A'.repeat(40)])('rejects garbage %#', (code) => {
    expect(decodeReplay(code, '0.3.0').ok).toBe(false);
  });

  it('rejects a corrupted code instead of throwing', () => {
    const { data } = original(7, 'ricochet', 'splitter', [[], []], null);
    const code = encodeReplay(data);
    const flipped = code.slice(0, 10) + (code[10] === 'A' ? 'B' : 'A') + code.slice(11);
    expect(decodeReplay(flipped, '0.3.0').ok).toBe(false);
    expect(decodeReplay(code.slice(0, -5), '0.3.0').ok).toBe(false);
  });

  it('reads versions and the URL parameter', () => {
    expect(majorMinor('1.2.3')).toEqual([1, 2]);
    expect(majorMinor('test')).toEqual([0, 0]);
    expect(replayParam('?a=1&replay=AbC-_9')).toBe('AbC-_9');
    expect(replayParam('?x=1')).toBeNull();
  });
});
