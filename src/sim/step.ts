import { tuning } from '../content/tuning';
import { findCell } from './arena';
import type { CaptureCause, EndReason } from './events';
import { rotateSmall } from './vec';
import { emit, statValue, type Runner, type SideIndex, type World } from './world';

function other(side: SideIndex): SideIndex {
  return side === 0 ? 1 : 0;
}

function endMatch(world: World, winner: SideIndex, reason: EndReason): void {
  if (world.phase === 'ended') return;
  world.phase = 'ended';
  world.winner = winner;
  world.endReason = reason;
  emit(world, { type: 'MatchEnded', step: world.step, winner, reason });
}

function capture(world: World, cell: number, side: SideIndex, cause: CaptureCause): void {
  const prev = world.owner[cell]!;
  if (prev === side || world.phase === 'ended') return;
  world.owner[cell] = side;
  world.counts[side]++;
  if (prev === 0 || prev === 1) world.counts[prev]--;
  const st = world.sides[side];
  st.captures++;
  emit(world, { type: 'CellCaptured', step: world.step, cell, side, cause });
  st.core.hooks.onCapture?.(world.contexts[side], cell);
  if (world.phase === 'suddenDeath') endMatch(world, side, 'suddenDeath');
}

function hit(world: World, runner: Runner, kind: 'wall' | 'clash'): void {
  const st = world.sides[runner.side];
  st.hits++;
  const info = world.hitScratch;
  info.runner = runner;
  info.kind = kind;
  st.core.hooks.onHit?.(world.contexts[runner.side], info);
}

function radiusOf(world: World, r: Runner): number {
  return statValue(world.sides[r.side], 'bodyRadius') * r.radiusMul;
}

function moveRunner(world: World, r: Runner): void {
  const st = world.sides[r.side];
  const speed = statValue(st, 'speed') * r.speedMul;
  r.x += r.dx * speed * world.dt;
  r.y += r.dy * speed * world.dt;
  const rad = radiusOf(world, r);
  const min = rad;
  const max = world.arena.size - rad;
  let bounced = false;
  if (r.x < min) {
    r.x = Math.min(2 * min - r.x, max);
    r.dx = Math.abs(r.dx);
    bounced = true;
  } else if (r.x > max) {
    r.x = Math.max(2 * max - r.x, min);
    r.dx = -Math.abs(r.dx);
    bounced = true;
  }
  if (r.y < min) {
    r.y = Math.min(2 * min - r.y, max);
    r.dy = Math.abs(r.dy);
    bounced = true;
  } else if (r.y > max) {
    r.y = Math.max(2 * max - r.y, min);
    r.dy = -Math.abs(r.dy);
    bounced = true;
  }
  if (!bounced) return;
  // Jitter the heading so paths never settle into a loop, but never back into the wall.
  rotateSmall(r, world.rng.range(-tuning.runner.wallJitter, tuning.runner.wallJitter));
  if (r.x <= min) r.dx = Math.abs(r.dx);
  if (r.x >= max) r.dx = -Math.abs(r.dx);
  if (r.y <= min) r.dy = Math.abs(r.dy);
  if (r.y >= max) r.dy = -Math.abs(r.dy);
  emit(world, { type: 'WallBounce', step: world.step, runner: r.id, side: r.side, x: r.x, y: r.y });
  hit(world, r, 'wall');
}

function clampInside(world: World, r: Runner): void {
  const rad = radiusOf(world, r);
  r.x = Math.min(Math.max(r.x, rad), world.arena.size - rad);
  r.y = Math.min(Math.max(r.y, rad), world.arena.size - rad);
}

/** Enemy runners that overlap while closing bounce off each other along the collision normal. */
function resolveClashes(world: World, count: number): void {
  const rs = world.runners;
  for (let i = 0; i < count; i++) {
    const a = rs[i]!;
    for (let j = i + 1; j < count; j++) {
      const b = rs[j]!;
      if (a.side === b.side) continue;
      const nx0 = b.x - a.x;
      const ny0 = b.y - a.y;
      const reach = radiusOf(world, a) + radiusOf(world, b);
      const d2 = nx0 * nx0 + ny0 * ny0;
      if (d2 >= reach * reach) continue;
      const d = Math.sqrt(d2);
      // Coincident centres: separate along a fixed axis so the result stays deterministic.
      const nx = d > 1e-9 ? nx0 / d : 1;
      const ny = d > 1e-9 ? ny0 / d : 0;
      const va = statValue(world.sides[a.side], 'speed') * a.speedMul;
      const vb = statValue(world.sides[b.side], 'speed') * b.speedMul;
      const closing = (a.dx * va - b.dx * vb) * nx + (a.dy * va - b.dy * vb) * ny;
      // Push apart either way so runners never stay embedded.
      const push = (reach - d) / 2;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
      clampInside(world, a);
      clampInside(world, b);
      if (closing <= 0) continue;
      const da = a.dx * nx + a.dy * ny;
      if (da > 0) {
        a.dx -= 2 * da * nx;
        a.dy -= 2 * da * ny;
      }
      const db = b.dx * nx + b.dy * ny;
      if (db < 0) {
        b.dx -= 2 * db * nx;
        b.dy -= 2 * db * ny;
      }
      emit(world, { type: 'Clash', step: world.step, a: a.id, b: b.id, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      hit(world, a, 'clash');
      hit(world, b, 'clash');
    }
  }
}

function captureUnder(world: World, r: Runner): void {
  r.cell = findCell(world.arena, r.x, r.y, r.cell);
  if (world.owner[r.cell] !== r.side) capture(world, r.cell, r.side, 'runner');

  const radius = statValue(world.sides[r.side], 'captureRadius') * r.radiusMul;
  if (radius > 0) {
    const c = world.arena.centroids;
    const r2 = radius * radius;
    for (let i = 0; i < world.arena.cellCount; i++) {
      if (world.owner[i] === r.side) continue;
      const dx = c[i * 2]! - r.x;
      const dy = c[i * 2 + 1]! - r.y;
      if (dx * dx + dy * dy <= r2) capture(world, i, r.side, 'radius');
    }
  }
}

const swingStep = tuning.beam.swingRate / tuning.sim.stepsPerSecond;
// cos(swingStep) by Taylor series, so no engine-specific Math.cos result enters the sim.
const cosSwing = 1 - (swingStep * swingStep) / 2 + swingStep ** 4 / 24;

/** Swing the beam toward the trailing direction (straight behind the runner) at a fixed rate. */
function swingBeam(r: Runner): void {
  const tx = -r.dx;
  const ty = -r.dy;
  const dot = r.bx * tx + r.by * ty;
  if (dot >= cosSwing) {
    r.bx = tx;
    r.by = ty;
    return;
  }
  const cross = r.bx * ty - r.by * tx;
  const dir = { dx: r.bx, dy: r.by };
  rotateSmall(dir, cross >= 0 ? swingStep : -swingStep);
  r.bx = dir.dx;
  r.by = dir.dy;
}

/** Sample along the beam from the runner outward and capture every enemy cell it covers. */
function captureBeam(world: World, r: Runner): void {
  const length = statValue(world.sides[r.side], 'beamLength');
  if (length <= 0) return;
  swingBeam(r);
  const spacing = tuning.beam.sampleSpacing;
  const size = world.arena.size;
  let hint = r.cell;
  for (let d = spacing; d <= length; d += spacing) {
    const x = r.x + r.bx * d;
    const y = r.y + r.by * d;
    if (x < 0 || y < 0 || x > size || y > size) break;
    hint = findCell(world.arena, x, y, hint);
    if (world.owner[hint] !== r.side) capture(world, hint, r.side, 'beam');
  }
}

function updateLead(world: World): void {
  const [a, b] = world.counts;
  const leader: SideIndex | -1 = a > b ? 0 : b > a ? 1 : world.leader;
  if (leader !== world.leader) {
    if (world.leader !== -1) {
      world.leadChanges++;
      world.lastLeadChangeStep = world.step;
    }
    world.leader = leader;
    if (leader !== -1) emit(world, { type: 'LeadChange', step: world.step, leader });
  }
  if (world.step <= world.matchSteps / 2) {
    const n = world.arena.cellCount;
    world.maxShareFirstHalf = Math.max(world.maxShareFirstHalf, a / n, b / n);
  }
}

/** Advance the world by one fixed step of 1/60 s. */
export function stepWorld(world: World): void {
  if (world.phase === 'ended') return;
  world.events.length = 0;
  world.step++;

  for (const s of [0, 1] as const) world.sides[s].core.hooks.onStep?.(world.contexts[s]);

  // Runners spawned by hooks during this step start moving next step.
  const count = world.runners.length;
  for (let i = 0; i < count; i++) moveRunner(world, world.runners[i]!);
  resolveClashes(world, count);
  // Alternate the capture order each step so neither side always gets the last word on a contested cell.
  const n = world.runners.length;
  for (let k = 0; k < n; k++) {
    const r = world.runners[world.step % 2 === 0 ? k : n - 1 - k]!;
    captureUnder(world, r);
    if (r.primary) captureBeam(world, r);
  }

  for (const s of [0, 1] as const) {
    if (world.counts[other(s)] === 0) endMatch(world, s, 'wipeout');
  }
  updateLead(world);

  if (world.phase === 'running' && world.step >= world.matchSteps) {
    const [a, b] = world.counts;
    if (a !== b) endMatch(world, a > b ? 0 : 1, 'time');
    else {
      world.phase = 'suddenDeath';
      world.suddenDeathStep = world.step;
      emit(world, { type: 'SuddenDeath', step: world.step });
    }
  } else if (
    world.phase === 'suddenDeath' &&
    world.step - world.suddenDeathStep >= tuning.match.suddenDeathMaxSeconds * tuning.sim.stepsPerSecond
  ) {
    const [ha, hb] = [world.sides[0].hits, world.sides[1].hits];
    endMatch(world, ha !== hb ? (ha > hb ? 0 : 1) : world.rng.next() < 0.5 ? 0 : 1, 'suddenDeath');
  }
}
