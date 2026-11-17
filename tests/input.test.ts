import { describe, expect, it } from 'vitest';
import { tuning } from '../src/content/tuning';
import { hashReplayState } from '../src/sim/hash';
import { applyLaunch, queueInput, type ControllerSpec } from '../src/sim/input';
import { stepWorld } from '../src/sim/step';
import { createWorld, type MatchConfig } from '../src/sim/world';
import { blank, blankWorld, ricochet, splitter } from './helpers';

const rival: ControllerSpec = { kind: 'heuristic', ...tuning.ai.rival };

describe('launch', () => {
  it('sets the primary heading before the match starts', () => {
    const w = blankWorld();
    const r = w.runners[0]!;
    queueInput(w, { side: 0, type: 'launch', dx: 0, dy: -2 });
    stepWorld(w);
    expect(r.dx).toBeCloseTo(0, 9);
    expect(r.dy).toBeLessThan(0);
    expect(w.sides[0].launched).toBe(true);
  });

  it('is refused once the match is under way', () => {
    const w = blankWorld();
    for (let i = 0; i < 5; i++) stepWorld(w);
    expect(applyLaunch(w, 0, 1, 0)).toBe(false);
  });
});

describe('ultimate input', () => {
  it('fires once from a queued input and is logged', () => {
    const w = createWorld({ seed: 1, cores: [splitter, blank], pickups: [] });
    queueInput(w, { side: 0, type: 'ultimate' });
    stepWorld(w);
    expect(w.sides[0].ultimatesUsed).toBe(1);
    expect(w.inputLog.some((i) => i.type === 'ultimate')).toBe(true);
  });
});

describe('underdog boost', () => {
  it('speeds up only the trailing side, capped', () => {
    const w = blankWorld();
    for (let i = 0; i < w.owner.length; i++) {
      if (w.owner[i] === 1 && w.counts[1] > 20) {
        w.owner[i] = 0;
        w.counts[0]++;
        w.counts[1]--;
      }
    }
    stepWorld(w);
    expect(w.sides[0].speedFactor).toBe(1);
    expect(w.sides[1].speedFactor).toBeCloseTo(1 + tuning.tension.underdogMax, 9);
  });
});

describe('replays', () => {
  it('reproduce a match exactly from seed, builds and the input log', () => {
    const cfg: MatchConfig = { seed: 11, cores: [ricochet, splitter], controllers: [rival, rival] };
    const live = createWorld(cfg);
    while (live.phase !== 'ended') stepWorld(live);
    const mine = live.inputLog.filter((i) => i.side === 0);
    // The launch comes first; a Charge pickup can grant extra ultimates later.
    expect(mine[0]!.type).toBe('launch');
    expect(mine.filter((i) => i.type === 'ultimate').length).toBeGreaterThanOrEqual(1);
    // Replace side 0's controller with its recorded inputs; side 1 keeps its own controller and stream.
    const replay = createWorld({ ...cfg, controllers: [null, rival], inputs: mine });
    while (replay.phase !== 'ended') stepWorld(replay);
    expect(hashReplayState(replay)).toBe(hashReplayState(live));
  });

  it('give the same result for inputs queued live and the same inputs pre-recorded', () => {
    const a = createWorld({ seed: 3, cores: [ricochet, splitter] });
    queueInput(a, { side: 0, type: 'launch', dx: 1, dy: 1 });
    for (let i = 0; i < 300; i++) stepWorld(a);
    queueInput(a, { side: 0, type: 'ultimate' });
    while (a.phase !== 'ended') stepWorld(a);
    const b = createWorld({ seed: 3, cores: [ricochet, splitter], inputs: a.inputLog });
    while (b.phase !== 'ended') stepWorld(b);
    expect(hashReplayState(b)).toBe(hashReplayState(a));
  });
});

describe('rival controller', () => {
  it('aims its launch and fires its ultimate before the deadline', () => {
    for (const seed of [4, 5, 6]) {
      const w = createWorld({ seed, cores: [ricochet, splitter], controllers: [rival, rival] });
      const firedAt = [-1, -1];
      while (w.phase !== 'ended') {
        stepWorld(w);
        // The first ultimate; a Charge pickup can grant another later, which may fire at any time.
        for (const e of w.events) if (e.type === 'UltimateFired' && !e.echo && firedAt[e.side] === -1) firedAt[e.side] = w.step;
      }
      expect(w.sides[0].launched && w.sides[1].launched).toBe(true);
      const deadline = w.matchSteps - (tuning.ai.ultimateDeadlineSeconds - 1) * tuning.sim.stepsPerSecond;
      for (const s of [0, 1]) {
        expect(firedAt[s]).toBeGreaterThan(0);
        expect(firedAt[s]).toBeLessThanOrEqual(deadline);
      }
    }
  });
});
