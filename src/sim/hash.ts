import type { World } from './world';

const f64 = new Float64Array(1);
const f64Bytes = new Uint8Array(f64.buffer);

/** FNV-1a over the parts of the state that matter, so two runs can be compared step by step. */
export class Hasher {
  private h = 0x811c9dc5;

  byte(b: number): void {
    this.h = Math.imul(this.h ^ (b & 0xff), 0x01000193);
  }

  u32(v: number): void {
    this.byte(v);
    this.byte(v >>> 8);
    this.byte(v >>> 16);
    this.byte(v >>> 24);
  }

  f64(v: number): void {
    f64[0] = v;
    for (let i = 0; i < 8; i++) this.byte(f64Bytes[i]!);
  }

  bytes(arr: Uint8Array): void {
    for (let i = 0; i < arr.length; i++) this.byte(arr[i]!);
  }

  digest(): number {
    return this.h >>> 0;
  }
}

export function hashWorld(world: World): number {
  const h = new Hasher();
  h.u32(world.step);
  h.bytes(world.owner);
  h.u32(world.runners.length);
  for (const r of world.runners) {
    h.f64(r.x);
    h.f64(r.y);
    h.f64(r.dx);
    h.f64(r.dy);
    h.u32(r.cell);
    h.f64(r.lastX);
    h.f64(r.lastY);
    h.f64(r.bx);
    h.f64(r.by);
    h.f64(r.spinLeft);
    h.f64(r.spinReach);
    h.byte(r.swinging ? 1 : 0);
  }
  for (const s of world.sides) {
    h.u32(s.hits);
    h.u32(s.captures);
    h.f64(s.stacks);
    h.u32(s.overflow);
    h.u32(s.ultimates);
    h.u32(s.ultimatesUsed);
    h.u32(s.surgeSteps);
    h.u32(s.shieldSteps);
    h.u32(s.pickups);
    for (const k of ['speed', 'bodyRadius', 'captureRadius', 'beamLength'] as const) {
      h.f64(s.stats[k].add);
      h.f64(s.stats[k].mul);
    }
  }
  h.u32(world.pickups.length);
  for (const p of world.pickups) {
    h.u32(p.id);
    h.u32(p.def);
    h.f64(p.x);
    h.f64(p.y);
  }
  const rs = world.rng.getState();
  h.u32(rs.a);
  h.u32(rs.b);
  h.u32(rs.c);
  h.u32(rs.d);
  return h.digest();
}
