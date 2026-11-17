import { tuning } from '../content/tuning';
import { runControllers } from './ai';
import { findCell } from './arena';
import { applyPendingInputs, applyTactical, needsTactical, resolveTactical, tacticalDefault } from './input';
import { updatePickups } from './pickups';
import type { CaptureCause, EndReason } from './events';
import { rotateSmall } from './vec';
import { emit, runScheduled, statValue, type Runner, type SideIndex, type World } from './world';

const shieldAbsorbSteps = Math.round(tuning.shield.absorbSeconds * tuning.sim.stepsPerSecond);

function other(side: SideIndex): SideIndex {
  return side === 0 ? 1 : 0;
}

/** Underdog boost and Surge, once per step per side. */
function updateSpeedFactors(world: World): void {
  const n = world.arena.cellCount;
  for (const s of [0, 1] as const) {
    const deficit = (world.counts[other(s)] - world.counts[s]) / n;
    const underdog = deficit > 0 ? 1 + Math.min(tuning.tension.underdogMax, tuning.tension.underdogPerShare * deficit) : 1;
    const st = world.sides[s];
    if (st.slowSteps > 0 && --st.slowSteps === 0) st.slowMul = 1;
    st.speedFactor = underdog * st.surgeMul * st.slowMul;
  }
}

export function runnerSpeed(world: World, r: Runner): number {
  const v = statValue(world.sides[r.side], 'speed') * r.speedMul * world.sides[r.side].speedFactor;
  return Math.min(v, tuning.runner.maxSpeed);
}

function endMatch(world: World, winner: SideIndex, reason: EndReason): void {
  if (world.phase === 'ended') return;
  world.phase = 'ended';
  world.winner = winner;
  world.endReason = reason;
  emit(world, { type: 'MatchEnded', step: world.step, winner, reason });
}

export function capture(world: World, cell: number, side: SideIndex, cause: CaptureCause): void {
  const prev = world.owner[cell]!;
  if (prev === side || world.phase === 'ended') return;
  // A Shield pickup makes the owner's cells untakeable for a moment.
  if (prev === 0 || prev === 1) {
    if (world.sides[prev].shieldSteps > 0) return;
    if (world.step < world.cellLockUntil[cell]!) return;
    // Per-cell shields: each point absorbs one attempt, then the cell shrugs off attempts for a moment.
    if (world.step - world.cellShieldStep[cell]! < shieldAbsorbSteps) return;
    if (world.cellShield[cell]! > 0) {
      world.cellShield[cell]!--;
      world.cellShieldStep[cell] = world.step;
      emit(world, { type: 'ShieldHit', step: world.step, cell, owner: prev });
      return;
    }
  }
  world.owner[cell] = side;
  world.counts[side]++;
  if (prev === 0 || prev === 1) world.counts[prev]--;
  const st = world.sides[side];
  st.captures++;
  emit(world, { type: 'CellCaptured', step: world.step, cell, side, cause });
  const ctx = world.contexts[side];
  const mod = world.currentMod;
  world.currentMod = -1;
  st.core.hooks.onCapture?.(ctx, cell);
  for (let i = 0; i < st.mods.length; i++) {
    const m = st.mods[i]!;
    if (!m.mod.hooks.onCapture) continue;
    world.currentMod = i;
    m.mod.hooks.onCapture(ctx, cell, m.level);
  }
  if (prev === 0 || prev === 1) {
    const lost = world.sides[prev];
    const lctx = world.contexts[prev];
    world.currentMod = -1;
    lost.core.hooks.onCellLost?.(lctx, cell);
    for (let i = 0; i < lost.mods.length; i++) {
      const m = lost.mods[i]!;
      if (!m.mod.hooks.onCellLost) continue;
      world.currentMod = i;
      m.mod.hooks.onCellLost(lctx, cell, m.level);
    }
  }
  world.currentMod = mod;
  if (world.phase === 'suddenDeath') endMatch(world, side, 'suddenDeath');
}

/** Count a hit and fire the Core's, then each Mod's, on-hit hook. */
export function hit(world: World, runner: Runner, kind: 'wall' | 'clash'): void {
  const st = world.sides[runner.side];
  st.hits++;
  const info = world.hitScratch;
  info.runner = runner;
  info.kind = kind;
  const ctx = world.contexts[runner.side];
  world.currentMod = -1;
  st.core.hooks.onHit?.(ctx, info);
  for (let i = 0; i < st.mods.length; i++) {
    const m = st.mods[i]!;
    if (!m.mod.hooks.onHit) continue;
    world.currentMod = i;
    m.mod.hooks.onHit(ctx, info, m.level);
  }
  world.currentMod = -1;
}

function radiusOf(world: World, r: Runner): number {
  return statValue(world.sides[r.side], 'bodyRadius') * r.radiusMul;
}

function moveRunner(world: World, r: Runner): void {
  r.lastX = r.x;
  r.lastY = r.y;
  const speed = runnerSpeed(world, r);
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
      const va = runnerSpeed(world, a);
      const vb = runnerSpeed(world, b);
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
  // A runner moving more than a sample spacing per step captures along its path, so no
  // speed lets it skip cells. (Across a wall bounce this cuts the corner slightly.)
  const dx = r.x - r.lastX;
  const dy = r.y - r.lastY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const samples = Math.floor(dist / tuning.runner.pathSampleSpacing);
  for (let k = 1; k <= samples; k++) {
    const f = k / (samples + 1);
    r.cell = findCell(world.arena, r.lastX + dx * f, r.lastY + dy * f, r.cell);
    if (world.owner[r.cell] !== r.side) capture(world, r.cell, r.side, 'runner');
  }
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

const spinStep = tuning.beam.spinRate / tuning.sim.stepsPerSecond;
const swingStep = tuning.beam.swingRate / tuning.sim.stepsPerSecond;
// cos(swingStep) by Taylor series, so no engine-specific Math.cos result enters the sim.
const cosSwing = 1 - (swingStep * swingStep) / 2 + swingStep ** 4 / 24;

/**
 * Point the beam. An ultimate spin turns it through full circles; a swing (set
 * by the Core after a hit) turns it back toward trailing at a fixed rate; both
 * sweep cells as they go. Otherwise it snaps straight behind the runner.
 */
function aimBeam(r: Runner): void {
  if (r.spinLeft > 0) {
    const step = Math.min(spinStep, r.spinLeft);
    const dir = { dx: r.bx, dy: r.by };
    rotateSmall(dir, step);
    r.bx = dir.dx;
    r.by = dir.dy;
    r.spinLeft -= step;
    return;
  }
  const tx = -r.dx;
  const ty = -r.dy;
  if (!r.swinging || r.bx * tx + r.by * ty >= cosSwing) {
    r.bx = tx;
    r.by = ty;
    r.swinging = false;
    return;
  }
  const dir = { dx: r.bx, dy: r.by };
  rotateSmall(dir, r.bx * ty - r.by * tx >= 0 ? swingStep : -swingStep);
  r.bx = dir.dx;
  r.by = dir.dy;
}

/** Current beam length of a runner. Only primaries carry beams; a spin caps the reach. */
export function beamLength(world: World, r: Runner): number {
  if (!r.primary) return 0;
  const l = statValue(world.sides[r.side], 'beamLength');
  return r.spinLeft > 0 ? Math.min(l, r.spinReach) : l;
}

/** Sample along the beam from the runner outward and capture every enemy cell it covers. */
function captureBeam(world: World, r: Runner): void {
  const length = beamLength(world, r);
  if (length <= 0) return;
  aimBeam(r);
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
  // A side takes the lead only when ahead by the hysteresis margin, so near-ties do not flicker.
  const h = world.leader === -1 ? 1 : tuning.tension.leadHysteresis;
  const leader: SideIndex | -1 = a - b >= h ? 0 : b - a >= h ? 1 : world.leader;
  if (leader !== world.leader) {
    if (world.leader !== -1) {
      world.leadChanges++;
      world.lastLeadChangeStep = world.step;
    }
    world.leader = leader;
    if (leader !== -1) {
      emit(world, { type: 'LeadChange', step: world.step, leader });
      for (const s of [0, 1] as const) {
        const st = world.sides[s];
        for (let i = 0; i < st.mods.length; i++) {
          const m = st.mods[i]!;
          if (!m.mod.hooks.onLeadChange) continue;
          world.currentMod = i;
          m.mod.hooks.onLeadChange(world.contexts[s], leader === s, m.level);
        }
        world.currentMod = -1;
      }
    }
  }
  if (world.step <= world.matchSteps / 2) {
    const n = world.arena.cellCount;
    const share = Math.max(a, b) / n;
    if (share > world.maxShareFirstHalf) {
      world.maxShareFirstHalf = share;
      world.maxShareFirstHalfSide = a >= b ? 0 : 1;
    }
  }
}

/** Advance the world by one fixed step of 1/60 s. */
export function stepWorld(world: World): void {
  if (world.phase === 'ended') return;
  if (needsTactical(world)) {
    // Only consume decisions at this boundary, never a queued next-step ultimate.
    for (let i = 0; i < world.pendingInputs.length;) {
      const input = world.pendingInputs[i]!;
      if (input.type === 'tactical' && input.step <= world.step) {
        applyTactical(world, input.side, input.choice);
        world.pendingInputs.splice(i, 1);
      } else i++;
    }
    for (const side of [0, 1] as const) if (world.controllers[side]) applyTactical(world, side, tacticalDefault(world, side));
    if (world.tacticalChoices.some((c) => c === null)) return;
    resolveTactical(world);
  }
  // Events emitted while the world was created (match-start hooks) ride along with step 1's.
  if (world.step > 0) world.events.length = 0;
  world.step++;

  for (const side of world.sides) {
    if (world.ruleset === 'recharge' && side.ultimates === 0 && side.rechargeAt >= 0 && world.step >= side.rechargeAt) {
      side.ultimates = 1;
      side.rechargeAt = -1;
    }
  }
  applyPendingInputs(world);
  runControllers(world);
  while (world.timers.length > 0 && world.timers[0]!.step <= world.step) {
    const t = world.timers.shift()!;
    world.currentMod = t.mod;
    runScheduled(world, t);
    world.currentMod = -1;
  }
  updateSpeedFactors(world);

  for (const s of [0, 1] as const) {
    const st = world.sides[s];
    const ctx = world.contexts[s];
    world.currentMod = -1;
    st.core.hooks.onStep?.(ctx);
    for (let i = 0; i < st.mods.length; i++) {
      const m = st.mods[i]!;
      if (m.mod.hooks.onStep) {
        world.currentMod = i;
        m.mod.hooks.onStep(ctx, m.level);
      }
      if (!m.mod.hooks.onInterval || !m.mod.intervalSeconds) continue;
      const every = Math.max(1, Math.round(m.mod.intervalSeconds(m.level) * tuning.sim.stepsPerSecond));
      if (world.step % every !== 0) continue;
      world.currentMod = i;
      m.mod.hooks.onInterval(ctx, m.level);
    }
    world.currentMod = -1;
  }

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

  updatePickups(world, (w, cell, side) => capture(w, cell, side, 'pickup'));

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
