import { describe, expect, it } from 'vitest';
import { coreById, cores } from '../src/content/cores';
import { modById } from '../src/content/mods';
import { tuning } from '../src/content/tuning';
import { encodeReplay, decodeReplay, replayConfig } from '../src/meta/replay';
import { hashReplayState } from '../src/sim/hash';
import { applyTactical, applyUltimate, canUltimate, needsTactical, queueInput } from '../src/sim/input';
import { runMatch } from '../src/sim/match';
import { checkInvariants } from '../src/sim/invariants';
import { stepWorld } from '../src/sim/step';
import { createWorld } from '../src/sim/world';
import { blank } from './helpers';

const ai = { kind: 'heuristic' as const, ...tuning.ai.rival };

describe('agency prototypes', () => {
  it('recharges after 12 sim seconds, with no stacking while ready', () => {
    const w = createWorld({ seed: 1, cores: [blank, blank], ruleset: 'recharge', pickups: [] });
    applyUltimate(w, 0);
    for (let i = 0; i < 719; i++) stepWorld(w);
    expect(canUltimate(w, 0)).toBe(false);
    stepWorld(w); expect(canUltimate(w, 0)).toBe(true);
    for (let i = 0; i < 100; i++) stepWorld(w);
    expect(w.sides[0].ultimates).toBe(1);
    applyUltimate(w, 0); expect(w.sides[0].rechargeAt).toBe(w.step + 720);
  });
  it('preserves Quick Hands and Charge without adding passive charges', () => {
    const w = createWorld({ seed: 1, cores: [blank, blank], ruleset: 'recharge', pickups: [], mods: [[{ mod: modById('quick-hands'), level: 3 }], []] });
    applyUltimate(w, 0);
    for (let i = 0; i < 660; i++) stepWorld(w);
    expect(w.sides[0].ultimates).toBe(1);
    w.contexts[0].grantUltimate();
    for (let i = 0; i < 100; i++) stepWorld(w);
    expect(w.sides[0].ultimates).toBe(1);
  });
  it('freezes time at halftime until both choices are recorded, then applies them together', () => {
    const w = createWorld({ seed: 1, cores: [blank, blank], ruleset: 'tactical', pickups: [] });
    while (w.step < 1200) stepWorld(w);
    for (let i = 0; i < 10; i++) stepWorld(w);
    expect(w.step).toBe(1200); expect(needsTactical(w)).toBe(true);
    w.pendingInputs.push({ step: w.step, side: 0, type: 'tactical', choice: 'speed' });
    stepWorld(w); expect(w.step).toBe(1200); expect(w.sides[0].surgeSteps).toBe(0);
    w.pendingInputs.push({ step: w.step, side: 1, type: 'tactical', choice: 'shield' });
    stepWorld(w); expect(w.step).toBe(1201); expect(w.sides[0].surgeSteps).toBeGreaterThan(0); expect(w.sides[1].shieldSteps).toBeGreaterThan(0);
    expect(w.inputLog.filter((i) => i.type === 'tactical')).toHaveLength(2);
  });
  it.each(['classic', 'recharge', 'tactical'] as const)('replays %s inputs to the same state', (ruleset) => {
    const w = createWorld({ seed: 7, cores: [coreById('phantom'), coreById('bloom')], ruleset, controllers: [ai, ai] });
    while (w.phase !== 'ended') stepWorld(w);
    const code = encodeReplay({ version: '0.7.0', seed: 7, ruleset, cores: ['phantom', 'bloom'], builds: [[], []], twist: null, inputs: w.inputLog });
    const decoded = decodeReplay(code, '0.7.0'); expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    const copy = createWorld(replayConfig(decoded.data)!);
    let guard = 0;
    while (copy.phase !== 'ended' && guard++ < 10000) stepWorld(copy);
    expect(copy.phase).toBe('ended'); expect(copy.inputLog).toEqual(w.inputLog);
    expect(hashReplayState(copy)).toBe(hashReplayState(w));
  });
  it('resolves direct tactical decisions once on the next step', () => {
    const w = createWorld({ seed: 1, cores: [blank, blank], ruleset: 'tactical', pickups: [] });
    while (w.step < 1200) stepWorld(w);
    expect(applyTactical(w, 0, 'shield')).toBe(true);
    expect(applyTactical(w, 1, 'speed')).toBe(true);
    expect(w.tacticalResolved).toBe(false);
    stepWorld(w); expect(w.tacticalResolved).toBe(true);
    const shield = w.sides[0].shieldSteps;
    stepWorld(w); expect(w.sides[0].shieldSteps).toBe(shield - 1);
    expect(applyTactical(w, 0, 'recharge')).toBe(false);
  });
  it('keeps classic once-per-match behavior', () => {
    const w = createWorld({ seed: 1, cores: [blank, blank], pickups: [] });
    queueInput(w, { type: 'ultimate', side: 0 });
    for (let i = 0; i < 1000; i++) stepWorld(w);
    expect(canUltimate(w, 0)).toBe(false);
  });
});


describe('prototype content invariants', () => {
  it.each(['recharge', 'tactical'] as const)('keeps all Core pairings valid in %s', (ruleset) => {
    for (const a of cores) for (const b of cores) {
      const result = runMatch({ seed: 19, cores: [a, b], controllers: [ai, ai], ruleset,
        mods: [[{ mod: modById('quick-hands'), level: 3 }, { mod: modById('encore'), level: 3 }], [{ mod: modById('echo'), level: 3 }]] }, checkInvariants);
      expect(result.steps).toBeLessThanOrEqual(3000);
    }
  }, 30000);
});
