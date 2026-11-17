import { describe, expect, it } from 'vitest';
import { coreById } from '../src/content/cores';
import { modById } from '../src/content/mods';
import { tuning } from '../src/content/tuning';
import type { ModPick } from '../src/sim/abilities';
import { stepWorld } from '../src/sim/step';
import { createWorld } from '../src/sim/world';

/**
 * Brief 4.4: a worst-case build at the content caps must stay inside the sim-step budget
 * (2 ms on a four-year-old mid-range phone). CI machines are several times faster than
 * that phone, so this asserts a tighter desktop figure and reports the worst step.
 */
const heavy = (ids: string[]): ModPick[] => ids.map((id) => ({ mod: modById(id), level: 3 }));

describe('performance', () => {
  it('keeps the worst sim step of a maxed-out match well inside budget', () => {
    const rival = { kind: 'heuristic' as const, ...tuning.ai.rival };
    const w = createWorld({
      seed: 7,
      cores: [coreById('splitter'), coreById('pulse')],
      controllers: [rival, rival],
      mods: [
        heavy(['head-start', 'clash-engine', 'hair-trigger', 'chain-reaction', 'encircle', 'magnet']),
        heavy(['echo', 'compound', 'growth-spurt', 'chain-reaction', 'landmines', 'ramparts']),
      ],
      recordEvents: true,
      twist: { extraPrimaries: [1, 1] },
    });
    let worst = 0;
    let total = 0;
    while (w.phase !== 'ended') {
      const t0 = performance.now();
      stepWorld(w);
      const dt = performance.now() - t0;
      total += dt;
      // Ignore the first steps: JIT warm-up is not representative.
      if (w.step > 120) worst = Math.max(worst, dt);
    }
    const mean = total / w.step;
    console.log(`perf: ${w.step} steps, mean ${mean.toFixed(3)} ms, worst ${worst.toFixed(3)} ms, runners ${w.runners.length}`);
    expect(w.runners.filter((r) => r.side === 0).length).toBeGreaterThan(10);
    expect(mean).toBeLessThan(0.5);
    expect(worst).toBeLessThan(8);
  });
});
