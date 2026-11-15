import { describe, expect, it } from 'vitest';
import { tuning } from '../src/content/tuning';
import { hashWorld } from '../src/sim/hash';
import { applyRedirect, cooldownSteps, queueInput, type ControllerSpec } from '../src/sim/input';
import { stepWorld } from '../src/sim/step';
import { createWorld, type MatchConfig } from '../src/sim/world';
import { blank, blankWorld, ricochet, splitter } from './helpers';

const rival: ControllerSpec = { kind: 'heuristic', ...tuning.ai.rival };

describe('redirect', () => {
  it('turns the primary toward the tap, spends the charge and recharges after the cooldown', () => {
    const w = blankWorld();
    const r = w.runners[0]!;
    queueInput(w, { side: 0, type: 'redirect', x: r.x + 100, y: r.y });
    stepWorld(w);
    expect(r.dx).toBeCloseTo(1, 9);
    expect(r.dy).toBeCloseTo(0, 9);
    expect(w.sides[0].charges).toBe(0);
    expect(w.sides[0].redirects).toBe(1);
    // A second redirect while recharging does nothing.
    queueInput(w, { side: 0, type: 'redirect', x: r.x, y: r.y + 100 });
    stepWorld(w);
    expect(w.sides[0].redirects).toBe(1);
    for (let i = 0; i < cooldownSteps(w); i++) stepWorld(w);
    expect(w.sides[0].charges).toBe(1);
  });

  it('is ignored in other input modes', () => {
    const w = createWorld({ seed: 1, cores: [blank, blank], inputMode: 'none' });
    expect(applyRedirect(w, 0, 10, 10)).toBe(false);
  });

  it('counts as a hit when the rules say so', () => {
    const w = createWorld({ seed: 1, cores: [splitter, blank], redirect: { countsAsHit: true } });
    const r = w.runners[0]!;
    const hits = w.sides[0].hits;
    queueInput(w, { side: 0, type: 'redirect', x: 500, y: r.y > 500 ? 100 : 900 });
    stepWorld(w);
    expect(w.sides[0].hits).toBeGreaterThan(hits);
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
    expect(live.inputLog.filter((i) => i.side === 0).length).toBeGreaterThan(2);
    // Replace side 0's controller with its recorded inputs; side 1 keeps its own controller and stream.
    const replay = createWorld({ ...cfg, controllers: [null, rival], inputs: live.inputLog.filter((i) => i.side === 0) });
    while (replay.phase !== 'ended') stepWorld(replay);
    expect(hashWorld(replay)).toBe(hashWorld(live));
  });

  it('give the same result for inputs queued live and the same inputs pre-recorded', () => {
    const a = createWorld({ seed: 3, cores: [ricochet, splitter] });
    for (let i = 0; i < 90; i++) stepWorld(a);
    queueInput(a, { side: 0, type: 'redirect', x: 200, y: 800 });
    while (a.phase !== 'ended') stepWorld(a);
    const b = createWorld({ seed: 3, cores: [ricochet, splitter], inputs: a.inputLog });
    while (b.phase !== 'ended') stepWorld(b);
    expect(hashWorld(b)).toBe(hashWorld(a));
  });
});

describe('rival controller', () => {
  it('redirects during a match and only when it has a charge', () => {
    const w = createWorld({ seed: 4, cores: [ricochet, splitter], controllers: [null, rival] });
    while (w.phase !== 'ended') stepWorld(w);
    expect(w.sides[1].redirects).toBeGreaterThan(2);
    expect(w.sides[1].redirects).toBeLessThanOrEqual(Math.ceil(w.step / cooldownSteps(w)) + 1);
    expect(w.sides[0].redirects).toBe(0);
  });
});
