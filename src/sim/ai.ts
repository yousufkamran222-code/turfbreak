import { tuning } from '../content/tuning';
import { findCell } from './arena';
import { applyRedirect, primaryOf } from './input';
import { beamLength, runnerSpeed } from './step';
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

const sweepStep = tuning.ai.sweepStep;
const cosSweep = 1 - (sweepStep * sweepStep) / 2 + sweepStep ** 4 / 24;

/**
 * Enemy cells a beam would pass over while swinging from its current direction to
 * trail behind heading (hx, hy). Zero for runners without a beam.
 */
export function scoreSweep(world: World, r: Runner, hx: number, hy: number): number {
  const length = beamLength(world, r);
  if (length <= 0) return 0;
  const size = world.arena.size;
  const tx = -hx;
  const ty = -hy;
  const b = { dx: r.bx, dy: r.by };
  let score = 0;
  let hint = r.cell;
  for (let guard = 0; guard < 16; guard++) {
    const dot = b.dx * tx + b.dy * ty;
    if (dot >= cosSweep) break;
    rotateSmall(b, b.dx * ty - b.dy * tx >= 0 ? sweepStep : -sweepStep);
    for (let d = tuning.ai.sweepSpacing; d <= length; d += tuning.ai.sweepSpacing) {
      const x = r.x + b.dx * d;
      const y = r.y + b.dy * d;
      if (x < 0 || y < 0 || x > size || y > size) break;
      hint = findCell(world.arena, x, y, hint);
      if (world.owner[hint] !== r.side) score++;
    }
  }
  return score * tuning.ai.sweepWeight;
}

function thinkRedirect(world: World, side: SideIndex): void {
  const spec = world.controllers[side];
  const st = world.sides[side];
  if (!spec || st.charges <= 0) {
    st.aiReadyStep = -1;
    return;
  }
  const sps = tuning.sim.stepsPerSecond;
  if (st.aiReadyStep < 0) {
    const reaction = spec.kind === 'heuristic' ? spec.reactionSeconds : 0.5;
    st.aiReadyStep = world.step + Math.round(reaction * sps);
    return;
  }
  if (world.step < st.aiReadyStep) return;
  const r = primaryOf(world, side);
  if (!r) return;
  const rng = world.aiRngs[side];

  if (spec.kind === 'random') {
    applyRedirect(world, side, rng.range(0, world.arena.size), rng.range(0, world.arena.size));
    st.aiReadyStep = -1;
    return;
  }

  const current = scoreHeading(world, r, r.dx, r.dy);
  let best = current;
  let bx = r.dx;
  let by = r.dy;
  for (const [hx, hy] of HEADINGS) {
    const s = scoreHeading(world, r, hx, hy) + scoreSweep(world, r, hx, hy);
    if (s > best) {
      best = s;
      bx = hx;
      by = hy;
    }
  }
  // Race for a pickup when it is worth more than the best open heading and reachable in time.
  const speed = runnerSpeed(world, r);
  for (const p of world.pickups) {
    const dx = p.x - r.x;
    const dy = p.y - r.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1e-6) continue;
    if (world.step + (dist / speed) * tuning.sim.stepsPerSecond >= p.expiresStep) continue;
    const hx = dx / dist;
    const hy = dy / dist;
    const s = tuning.ai.pickupValue - dist / tuning.ai.pickupDistanceCost + scoreHeading(world, r, hx, hy) + scoreSweep(world, r, hx, hy);
    if (s > best) {
      best = s;
      bx = hx;
      by = hy;
    }
  }
  if (best - current < spec.minGain) {
    st.aiReadyStep = world.step + Math.round(tuning.ai.recheckSeconds * sps);
    return;
  }
  const aim = { dx: bx, dy: by };
  rotateSmall(aim, rng.range(-spec.aimError, spec.aimError));
  const reach = tuning.ai.rayLength;
  applyRedirect(world, side, r.x + aim.dx * reach, r.y + aim.dy * reach);
  st.aiReadyStep = -1;
}

/** Let built-in controllers act. Runs inside the step, so it is deterministic. */
export function runControllers(world: World): void {
  if (world.phase === 'ended') return;
  for (const s of [0, 1] as const) {
    if (!world.controllers[s]) continue;
    if (world.inputMode === 'redirect') thinkRedirect(world, s);
  }
}
