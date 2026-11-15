import { describe, expect, it } from 'vitest';
import { tuning } from '../src/content/tuning';
import { findCell, generateArena } from '../src/sim/arena';
import { Rng, Stream } from '../src/sim/rng';
import { blankWorld } from './helpers';

const arena = generateArena(tuning.arena, new Rng(7, Stream.arena));

function pointInPolygon(poly: Float64Array, x: number, y: number): boolean {
  let inside = false;
  const m = poly.length / 2;
  for (let i = 0, j = m - 1; i < m; j = i++) {
    const xi = poly[i * 2]!;
    const yi = poly[i * 2 + 1]!;
    const xj = poly[j * 2]!;
    const yj = poly[j * 2 + 1]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

describe('arena', () => {
  it('has about the target number of cells, each with a real polygon inside the arena', () => {
    expect(Math.abs(arena.cellCount - tuning.arena.cellCount)).toBeLessThanOrEqual(10);
    for (const poly of arena.polygons) {
      expect(poly.length).toBeGreaterThanOrEqual(6);
      for (const v of poly) {
        expect(v).toBeGreaterThanOrEqual(-1e-9);
        expect(v).toBeLessThanOrEqual(tuning.arena.size + 1e-9);
      }
    }
  });

  it('cell areas sum to the arena area', () => {
    let total = 0;
    for (const poly of arena.polygons) {
      const m = poly.length / 2;
      let a = 0;
      for (let i = 0; i < m; i++) {
        const j = (i + 1) % m;
        a += poly[i * 2]! * poly[j * 2 + 1]! - poly[j * 2]! * poly[i * 2 + 1]!;
      }
      total += Math.abs(a) / 2;
    }
    expect(total).toBeCloseTo(tuning.arena.size ** 2, 0);
  });

  it('has symmetric, sorted neighbour lists', () => {
    arena.neighbors.forEach((ns, i) => {
      expect([...ns]).toEqual([...ns].sort((a, b) => a - b));
      for (const j of ns) expect([...arena.neighbors[j]!]).toContain(i);
    });
  });

  it('finds one shared edge per neighbour pair', () => {
    const pairs = new Set<string>();
    for (let k = 0; k < arena.edgeCount; k++) pairs.add(`${arena.edges[k * 6]}-${arena.edges[k * 6 + 1]}`);
    let expected = 0;
    arena.neighbors.forEach((ns, i) => (expected += ns.filter((j) => j > i).length));
    expect(pairs.size).toBe(expected);
    expect(arena.edgeCount).toBe(expected);
  });

  it('point lookup returns the cell whose polygon contains the point', () => {
    const rng = new Rng(3);
    for (let k = 0; k < 500; k++) {
      const x = rng.range(1, 999);
      const y = rng.range(1, 999);
      expect(pointInPolygon(arena.polygons[findCell(arena, x, y)]!, x, y)).toBe(true);
    }
  });

  it('is identical for the same seed', () => {
    const again = generateArena(tuning.arena, new Rng(7, Stream.arena));
    expect(again.sites).toEqual(arena.sites);
  });

  it('starts each side with exactly half the cells', () => {
    for (const seed of [1, 2, 3, 4]) {
      const w = blankWorld(seed);
      const n = w.arena.cellCount;
      expect(w.counts[0]).toBe(Math.floor(n / 2));
      expect(w.counts[0] + w.counts[1]).toBe(n);
    }
  });
});
