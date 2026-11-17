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

/** Hash data recursively in canonical key order; never hash executable code. */
function data(h: Hasher, value: unknown): void {
  if (typeof value === 'number') { h.byte(1); h.f64(value); }
  else if (typeof value === 'string') { h.byte(2); h.u32(value.length); for (let i = 0; i < value.length; i++) h.u32(value.charCodeAt(i)); }
  else if (typeof value === 'boolean') { h.byte(3); h.byte(value ? 1 : 0); }
  else if (value === null || value === undefined) h.byte(0);
  else if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    h.byte(4);
    const values = value as ArrayLike<unknown>;
    h.u32(values.length);
    for (let i = 0; i < values.length; i++) data(h, values[i]);
  } else if (typeof value === 'object') {
    h.byte(5);
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).filter((k) => typeof record[k] !== 'function').sort();
    h.u32(keys.length);
    for (const k of keys) { data(h, k); data(h, record[k]); }
  }
}

function state(world: World, controls: boolean): number {
  const h = new Hasher();
  const { arena, contexts: _contexts, hitScratch: _scratch, events: _events, recordEvents: _record, rng, aiRngs, controllers, ...rest } = world;
  void _contexts; void _scratch; void _events; void _record;
  // Hooks/contexts are executable references. Content identity is explicit and versioned.
  data(h, { ...rest, arena: { size: arena.size, centroids: arena.centroids, neighbors: arena.neighbors },
    sides: world.sides.map(({ core, mods, aiUltimateStep, ...side }) => ({ ...side, ...(controls ? { aiUltimateStep } : {}), core: core.id, mods: mods.map((p) => [p.mod.id, p.level]) })),
    pickupDefs: world.pickupDefs.map((p) => p.id), rng: rng.getState(),
    ...(controls ? { controllers, aiRngs: aiRngs.map((r) => r.getState()) } : {}),
  });
  return h.digest();
}

/** Complete simulation state, including controller state and pending effects/inputs. */
export function hashWorld(world: World): number { return state(world, true); }
/** Replay equivalence excludes controllers and their private RNG streams, which recordings replace. */
export function hashReplayState(world: World): number { return state(world, false); }
