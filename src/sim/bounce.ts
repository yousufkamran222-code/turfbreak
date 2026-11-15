import { Rng } from './rng';

/**
 * Phase 0 placeholder sim: one dot bouncing in the arena. It exercises the
 * fixed step, wall reflection with PRNG jitter, and the purity rules that the
 * Phase 1 simulation will follow.
 */
export interface DotState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  bounces: number;
}

export interface BounceConfig {
  arenaSize: number;
  speed: number;
  radius: number;
  jitterRad: number;
}

export function createDot(cfg: BounceConfig, rng: Rng): DotState {
  const angle = rng.range(0, Math.PI * 2);
  return {
    x: cfg.arenaSize / 2,
    y: cfg.arenaSize / 2,
    vx: Math.cos(angle) * cfg.speed,
    vy: Math.sin(angle) * cfg.speed,
    bounces: 0,
  };
}

/** Rotate a velocity by a small angle without leaving vector maths. */
function rotate(dot: DotState, rad: number): void {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const vx = dot.vx * c - dot.vy * s;
  const vy = dot.vx * s + dot.vy * c;
  dot.vx = vx;
  dot.vy = vy;
}

export function stepDot(dot: DotState, cfg: BounceConfig, rng: Rng, dt: number): void {
  dot.x += dot.vx * dt;
  dot.y += dot.vy * dt;
  const min = cfg.radius;
  const max = cfg.arenaSize - cfg.radius;
  let bounced = false;
  if (dot.x < min) {
    dot.x = 2 * min - dot.x;
    dot.vx = Math.abs(dot.vx);
    bounced = true;
  } else if (dot.x > max) {
    dot.x = 2 * max - dot.x;
    dot.vx = -Math.abs(dot.vx);
    bounced = true;
  }
  if (dot.y < min) {
    dot.y = 2 * min - dot.y;
    dot.vy = Math.abs(dot.vy);
    bounced = true;
  } else if (dot.y > max) {
    dot.y = 2 * max - dot.y;
    dot.vy = -Math.abs(dot.vy);
    bounced = true;
  }
  if (bounced) {
    dot.bounces++;
    rotate(dot, rng.range(-cfg.jitterRad, cfg.jitterRad));
    // Jitter must never turn the dot back into the wall it just left.
    if (dot.x <= min) dot.vx = Math.abs(dot.vx);
    if (dot.x >= max) dot.vx = -Math.abs(dot.vx);
    if (dot.y <= min) dot.vy = Math.abs(dot.vy);
    if (dot.y >= max) dot.vy = -Math.abs(dot.vy);
  }
}

/** Point the dot at a target, keeping its speed. Used by the Phase 0 tap test. */
export function redirectDot(dot: DotState, tx: number, ty: number, speed: number): void {
  const dx = tx - dot.x;
  const dy = ty - dot.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return;
  dot.vx = (dx / len) * speed;
  dot.vy = (dy / len) * speed;
}
