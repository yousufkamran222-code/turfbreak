import { tuning } from '../content/tuning';
import { beamLength } from './step';
import { emit, statValue, type SideIndex, type World } from './world';

type CaptureFn = (world: World, cell: number, side: SideIndex) => void;

const SPS = tuning.sim.stepsPerSecond;

function pickWeighted(world: World): number {
  const defs = world.pickupDefs;
  let total = 0;
  for (const d of defs) total += d.weight;
  let roll = world.rng.next() * total;
  for (let i = 0; i < defs.length; i++) {
    roll -= defs[i]!.weight;
    if (roll < 0) return i;
  }
  return defs.length - 1;
}

/** Spawn at a random cell centre away from both primaries, so nobody gets one for free. Falls back to the last try. */
function spawn(world: World): void {
  const a = world.arena;
  const minD = tuning.pickups.minDistanceFromRunner;
  let x = 0;
  let y = 0;
  for (let tries = 0; tries < 12; tries++) {
    const cell = world.rng.int(a.cellCount);
    x = a.centroids[cell * 2]!;
    y = a.centroids[cell * 2 + 1]!;
    let ok = true;
    for (const r of world.runners) {
      if (!r.primary) continue;
      const dx = r.x - x;
      const dy = r.y - y;
      if (dx * dx + dy * dy < minD * minD) ok = false;
    }
    if (ok) break;
  }
  const def = pickWeighted(world);
  const p = { id: world.nextPickupId++, def, x, y, expiresStep: world.step + Math.round(tuning.pickups.lifetimeSeconds * SPS) };
  world.pickups.push(p);
  emit(world, { type: 'PickupSpawned', step: world.step, id: p.id, kind: world.pickupDefs[def]!.id, x, y });
}

function apply(world: World, side: SideIndex, defIndex: number, x: number, y: number, capture: CaptureFn): void {
  const def = world.pickupDefs[defIndex]!;
  const st = world.sides[side];
  st.pickups++;
  const e = def.effect;
  switch (e.kind) {
    case 'surge':
      st.surgeSteps = Math.round(e.seconds * SPS);
      st.surgeMul = e.speedMul;
      break;
    case 'blast': {
      const c = world.arena.centroids;
      const r2 = e.radius * e.radius;
      for (let i = 0; i < world.arena.cellCount; i++) {
        const dx = c[i * 2]! - x;
        const dy = c[i * 2 + 1]! - y;
        if (dx * dx + dy * dy <= r2) capture(world, i, side);
      }
      break;
    }
    case 'charge':
      st.ultimates = Math.max(st.ultimates, 1);
      break;
    case 'shield':
      st.shieldSteps = Math.round(e.seconds * SPS);
      break;
  }
}

/** A beam that passes over a pickup snags it (Ricochet's laser grabs orbs). */
function grabWithBeams(world: World, capture: CaptureFn): void {
  for (const r of world.runners) {
    if (!r.primary || world.pickups.length === 0) continue;
    const length = beamLength(world, r);
    if (length <= 0) continue;
    for (let i = 0; i < world.pickups.length; i++) {
      const p = world.pickups[i]!;
      // Distance from the pickup to the beam segment.
      const t = Math.max(0, Math.min(length, (p.x - r.x) * r.bx + (p.y - r.y) * r.by));
      const dx = r.x + r.bx * t - p.x;
      const dy = r.y + r.by * t - p.y;
      if (dx * dx + dy * dy > tuning.pickups.radius * tuning.pickups.radius) continue;
      world.pickups.splice(i, 1);
      i--;
      emit(world, { type: 'PickupCollected', step: world.step, id: p.id, kind: world.pickupDefs[p.def]!.id, side: r.side, x: p.x, y: p.y });
      apply(world, r.side, p.def, p.x, p.y, capture);
    }
  }
}

/**
 * Tick effect timers, expire old pickups, spawn new ones, and let any runner
 * grab one it touches. Grab order alternates by step, like captures.
 */
export function updatePickups(world: World, capture: CaptureFn): void {
  for (const s of [0, 1] as const) {
    const st = world.sides[s];
    if (st.surgeSteps > 0 && --st.surgeSteps === 0) st.surgeMul = 1;
    if (st.shieldSteps > 0) st.shieldSteps--;
  }
  if (world.pickupDefs.length === 0) return;

  for (let i = world.pickups.length - 1; i >= 0; i--) {
    const p = world.pickups[i]!;
    if (world.step >= p.expiresStep) {
      world.pickups.splice(i, 1);
      emit(world, { type: 'PickupExpired', step: world.step, id: p.id });
    }
  }
  if (world.step >= world.nextPickupStep) {
    if (world.pickups.length < tuning.pickups.maxOnMap) spawn(world);
    world.nextPickupStep = world.step + Math.round(tuning.pickups.everySeconds * SPS);
  }

  if (world.pickups.length === 0) return;
  grabWithBeams(world, capture);
  const rs = world.runners;
  const n = rs.length;
  for (let k = 0; k < n && world.pickups.length > 0; k++) {
    const r = rs[world.step % 2 === 0 ? k : n - 1 - k]!;
    const st = world.sides[r.side];
    const reach = (tuning.pickups.radius + statValue(st, 'bodyRadius') * r.radiusMul) * st.pickupReachMul;
    for (let i = 0; i < world.pickups.length; i++) {
      const p = world.pickups[i]!;
      const dx = r.x - p.x;
      const dy = r.y - p.y;
      if (dx * dx + dy * dy > reach * reach) continue;
      world.pickups.splice(i, 1);
      i--;
      emit(world, { type: 'PickupCollected', step: world.step, id: p.id, kind: world.pickupDefs[p.def]!.id, side: r.side, x: p.x, y: p.y });
      apply(world, r.side, p.def, p.x, p.y, capture);
    }
  }
}
