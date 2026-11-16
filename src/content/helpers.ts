import { primaryOf } from '../sim/input';
import type { SideIndex, World } from '../sim/world';

/** Read-only world queries shared by Cores and Mods. None of these mutate anything. */

/** Pick a value by level (1 to 3). */
export const at = <T>(level: number, values: readonly [T, T, T]): T => values[Math.min(3, Math.max(1, level)) - 1]!;

/** Enemy cells whose centre lies within `radius` of (x, y). */
export function enemyCellsWithin(world: Readonly<World>, side: SideIndex, x: number, y: number, radius: number): number[] {
  const c = world.arena.centroids;
  const out: number[] = [];
  for (let i = 0; i < world.arena.cellCount; i++) {
    if (world.owner[i] === side) continue;
    const dx = c[i * 2]! - x;
    const dy = c[i * 2 + 1]! - y;
    if (dx * dx + dy * dy <= radius * radius) out.push(i);
  }
  return out;
}

/** Count of enemy cells within `radius` of the side's primary runner. */
export function enemyCellsNear(world: Readonly<World>, side: SideIndex, radius: number): number {
  const r = primaryOf(world as World, side);
  return r ? enemyCellsWithin(world, side, r.x, r.y, radius).length : 0;
}

/** The `n` enemy cells nearest (x, y), nearest first; ties go to the lower index. */
export function nearestEnemyCells(world: Readonly<World>, side: SideIndex, x: number, y: number, n: number): number[] {
  const c = world.arena.centroids;
  const cand: { i: number; d: number }[] = [];
  for (let i = 0; i < world.arena.cellCount; i++) {
    if (world.owner[i] === side) continue;
    const dx = c[i * 2]! - x;
    const dy = c[i * 2 + 1]! - y;
    cand.push({ i, d: dx * dx + dy * dy });
  }
  cand.sort((a, b) => a.d - b.d || a.i - b.i);
  return cand.slice(0, n).map((k) => k.i);
}

/** Does this cell have a neighbour owned by `owner`? */
export function hasNeighborOwnedBy(world: Readonly<World>, cell: number, owner: SideIndex): boolean {
  const ns = world.arena.neighbors[cell]!;
  for (let k = 0; k < ns.length; k++) if (world.owner[ns[k]!] === owner) return true;
  return false;
}

/** This side's cells that touch at least one enemy cell, in index order. */
export function frontierCells(world: Readonly<World>, side: SideIndex): number[] {
  const enemy: SideIndex = side === 0 ? 1 : 0;
  const out: number[] = [];
  for (let i = 0; i < world.arena.cellCount; i++) {
    if (world.owner[i] === side && hasNeighborOwnedBy(world, i, enemy)) out.push(i);
  }
  return out;
}

/** The enemy cell whose centre is furthest from every runner (Phantom's target). -1 if the enemy has no cells. */
export function loneliestEnemyCell(world: Readonly<World>, side: SideIndex): number {
  const c = world.arena.centroids;
  let best = -1;
  let bestD = -1;
  for (let i = 0; i < world.arena.cellCount; i++) {
    if (world.owner[i] === side) continue;
    let near = Infinity;
    for (const r of world.runners) {
      const dx = c[i * 2]! - r.x;
      const dy = c[i * 2 + 1]! - r.y;
      near = Math.min(near, dx * dx + dy * dy);
    }
    if (near > bestD) {
      bestD = near;
      best = i;
    }
  }
  return best;
}

/** This side's share of the map, 0 to 1. */
export function share(world: Readonly<World>, side: SideIndex): number {
  return world.counts[side] / world.arena.cellCount;
}
