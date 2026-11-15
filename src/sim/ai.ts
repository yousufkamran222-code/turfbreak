import { tuning } from '../content/tuning';
import { findCell } from './arena';
import { applyLaunch, applyUltimate, canUltimate, primaryOf } from './input';
import { rotateSmall } from './vec';
import type { Runner, SideIndex, World } from './world';

// Sixteen evenly spaced unit headings, written as literals so no trigonometry runs in the sim.
const C1 = 0.9238795325112867;
const S1 = 0.3826834323650898;
const H = 0.7071067811865476;
const HEADINGS: readonly (readonly [number, number])[] = [
  [1, 0], [C1, S1], [H, H], [S1, C1], [0, 1], [-S1, C1], [-H, H], [-C1, S1],
  [-1, 0], [-C1, -S1], [-H, -H], [-S1, -C1], [0, -1], [S1, -C1], [H, -H], [C1, -S1],
];

/**
 * Count the enemy cells along a straight line from the runner, following wall
 * bounces, the way the runner would actually travel.
 */
export function scoreHeading(world: World, r: Runner, hx: number, hy: number): number {
  const size = world.arena.size;
  const spacing = tuning.ai.raySpacing;
  let x = r.x;
  let y = r.y;
  let dx = hx;
  let dy = hy;
  let hint = r.cell;
  let last = -1;
  let score = 0;
  for (let d = spacing; d <= tuning.ai.rayLength; d += spacing) {
    x += dx * spacing;
    y += dy * spacing;
    if (x < 0) {
      x = -x;
      dx = -dx;
    } else if (x > size) {
      x = 2 * size - x;
      dx = -dx;
    }
    if (y < 0) {
      y = -y;
      dy = -dy;
    } else if (y > size) {
      y = 2 * size - y;
      dy = -dy;
    }
    hint = findCell(world.arena, x, y, hint);
    if (hint !== last && world.owner[hint] !== r.side) score++;
    last = hint;
  }
  return score;
}

/** Pick the launch heading with the most enemy cells along its bouncing path. */
function thinkLaunch(world: World, side: SideIndex): void {
  const spec = world.controllers[side];
  const r = primaryOf(world, side);
  if (!spec || !r) return;
  const rng = world.aiRngs[side];
  if (spec.kind === 'random') {
    const d = rng.unitVector();
    applyLaunch(world, side, d.x, d.y);
    return;
  }
  let best = -1;
  let bx = r.dx;
  let by = r.dy;
  for (const [hx, hy] of HEADINGS) {
    const s = scoreHeading(world, r, hx, hy);
    if (s > best) {
      best = s;
      bx = hx;
      by = hy;
    }
  }
  const aim = { dx: bx, dy: by };
  rotateSmall(aim, rng.range(-spec.aimError, spec.aimError));
  applyLaunch(world, side, aim.dx, aim.dy);
}

/** Fire the ultimate when the Core says the moment is good, or before the deadline regardless. */
function thinkUltimate(world: World, side: SideIndex): void {
  const spec = world.controllers[side];
  if (!spec || !canUltimate(world, side)) return;
  const sps = tuning.sim.stepsPerSecond;
  const st = world.sides[side];
  if (spec.kind === 'random') {
    // Pick a moment once, from this side's stream, and fire then.
    if (st.aiUltimateStep < 0) st.aiUltimateStep = Math.round(world.aiRngs[side].range(2, 32) * sps);
    if (world.step >= st.aiUltimateStep) applyUltimate(world, side);
    return;
  }
  const check = Math.max(1, Math.round(tuning.ai.ultimateCheckSeconds * sps));
  if (world.step % check !== 0) return;
  const deadline = world.matchSteps - tuning.ai.ultimateDeadlineSeconds * sps;
  const u = st.core.ultimate;
  if (world.step >= deadline || world.phase === 'suddenDeath' || u.value(world, side) >= u.threshold * spec.patience) {
    applyUltimate(world, side);
  }
}

/** Let built-in controllers act. Runs inside the step, so it is deterministic. */
export function runControllers(world: World): void {
  if (world.phase === 'ended') return;
  for (const s of [0, 1] as const) {
    if (!world.controllers[s]) continue;
    if (world.step === 1 && !world.sides[s].launched) thinkLaunch(world, s);
    thinkUltimate(world, s);
  }
}
