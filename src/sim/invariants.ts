import { tuning } from '../content/tuning';
import { statValue, type World } from './world';

/**
 * Checks that must hold after every step (MASTER_PROMPT 7.5). Throws with a
 * description of the first violation. Used by tests and the lab's smoke mode.
 */
export function checkInvariants(world: World): void {
  const n = world.arena.cellCount;
  let a = 0;
  let b = 0;
  for (let i = 0; i < n; i++) {
    const o = world.owner[i];
    if (o === 0) a++;
    else if (o === 1) b++;
    else throw new Error(`step ${world.step}: cell ${i} has invalid owner ${o}`);
  }
  if (a !== world.counts[0] || b !== world.counts[1]) {
    throw new Error(`step ${world.step}: counts ${world.counts.join('/')} but owners ${a}/${b}`);
  }
  if (a + b !== n) throw new Error(`step ${world.step}: counts do not sum to ${n}`);
  const per = [0, 0];
  for (const r of world.runners) {
    per[r.side]!++;
    const vals = [r.x, r.y, r.dx, r.dy];
    if (vals.some((v) => !Number.isFinite(v))) throw new Error(`step ${world.step}: runner ${r.id} has NaN state`);
    const rad = statValue(world.sides[r.side], 'bodyRadius') * r.radiusMul;
    const eps = 1e-6;
    if (r.x < rad - eps || r.y < rad - eps || r.x > world.arena.size - rad + eps || r.y > world.arena.size - rad + eps) {
      throw new Error(`step ${world.step}: runner ${r.id} is outside the arena at ${r.x}, ${r.y}`);
    }
    if (Math.abs(Math.hypot(r.dx, r.dy) - 1) > 1e-6) throw new Error(`step ${world.step}: runner ${r.id} heading is not unit`);
    // Movement is capped by maxSpeed; a clash can then push a runner apart by up to two body radii.
    const moved = Math.hypot(r.x - r.lastX, r.y - r.lastY);
    const limit = tuning.runner.maxSpeed * world.dt + 4 * statValue(world.sides[r.side], 'bodyRadius') + 1e-6;
    if (moved > limit) throw new Error(`step ${world.step}: runner ${r.id} moved ${moved} in one step`);
  }
  for (const s of [0, 1] as const) {
    if (per[s]! > tuning.runner.maxPerSide) throw new Error(`step ${world.step}: side ${s} has ${per[s]} runners`);
    if (per[s] !== world.sides[s].runnerCount) throw new Error(`step ${world.step}: side ${s} runner count is stale`);
  }
}
