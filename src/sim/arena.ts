import { Delaunay } from 'd3-delaunay';
import { Rng } from './rng';

export interface ArenaConfig {
  size: number;
  cellCount: number;
  jitter: number;
  lloydIterations: number;
}

/** Immutable map data, built once per match from the arena PRNG stream. */
export interface Arena {
  readonly size: number;
  readonly cellCount: number;
  /** Voronoi sites, x/y interleaved. */
  readonly sites: Float64Array;
  /** Polygon centroids, x/y interleaved. */
  readonly centroids: Float64Array;
  /** One flat x/y ring per cell, not closed. */
  readonly polygons: readonly Float64Array[];
  /** Neighbour ids per cell, ascending. */
  readonly neighbors: readonly Int32Array[];
  readonly touchesEdge: Uint8Array;
  /** Shared edges between neighbours: [i, j, x1, y1, x2, y2] per edge, i < j. */
  readonly edges: Float64Array;
  readonly edgeCount: number;
  readonly delaunay: Delaunay<number>;
}

function jitteredGrid(cfg: ArenaConfig, rng: Rng): Float64Array {
  const cols = Math.max(2, Math.round(Math.sqrt(cfg.cellCount)));
  const rows = Math.max(2, Math.round(cfg.cellCount / cols));
  const pts = new Float64Array(cols * rows * 2);
  const w = cfg.size / cols;
  const h = cfg.size / rows;
  let k = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      pts[k++] = (c + 0.5 + cfg.jitter * (rng.next() - 0.5)) * w;
      pts[k++] = (r + 0.5 + cfg.jitter * (rng.next() - 0.5)) * h;
    }
  }
  return pts;
}

/** Area centroid of a closed ring given as d3 returns it (first point repeated last). */
function ringCentroid(ring: ArrayLike<ArrayLike<number>>): { x: number; y: number; area: number } {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const p = ring[i]!;
    const q = ring[i + 1]!;
    const cross = p[0]! * q[1]! - q[0]! * p[1]!;
    a += cross;
    cx += (p[0]! + q[0]!) * cross;
    cy += (p[1]! + q[1]!) * cross;
  }
  a /= 2;
  return { x: cx / (6 * a), y: cy / (6 * a), area: a };
}

export function generateArena(cfg: ArenaConfig, rng: Rng): Arena {
  const bounds: [number, number, number, number] = [0, 0, cfg.size, cfg.size];
  const pts = jitteredGrid(cfg, rng);
  const n = pts.length / 2;

  for (let it = 0; it < cfg.lloydIterations; it++) {
    const voronoi = new Delaunay(pts).voronoi(bounds);
    for (let i = 0; i < n; i++) {
      const ring = voronoi.cellPolygon(i);
      if (!ring) continue;
      const c = ringCentroid(ring);
      pts[i * 2] = c.x;
      pts[i * 2 + 1] = c.y;
    }
  }

  const delaunay = new Delaunay(pts);
  const voronoi = delaunay.voronoi(bounds);
  const centroids = new Float64Array(n * 2);
  const polygons: Float64Array[] = [];
  const neighbors: Int32Array[] = [];
  const touchesEdge = new Uint8Array(n);
  const eps = 1e-6 * cfg.size;

  for (let i = 0; i < n; i++) {
    const ring = voronoi.cellPolygon(i);
    if (!ring) throw new Error(`Arena cell ${i} has no polygon`);
    const c = ringCentroid(ring);
    centroids[i * 2] = c.x;
    centroids[i * 2 + 1] = c.y;
    const poly = new Float64Array((ring.length - 1) * 2);
    for (let k = 0; k < ring.length - 1; k++) {
      const x = ring[k]![0]!;
      const y = ring[k]![1]!;
      poly[k * 2] = x;
      poly[k * 2 + 1] = y;
      if (x <= eps || y <= eps || x >= cfg.size - eps || y >= cfg.size - eps) touchesEdge[i] = 1;
    }
    polygons.push(poly);
    neighbors.push(Int32Array.from([...voronoi.neighbors(i)]).sort());
  }

  // A polygon edge of cell i is shared with neighbour j when its midpoint is
  // equidistant from both sites (it lies on their bisector).
  const edgeList: number[] = [];
  for (let i = 0; i < n; i++) {
    const poly = polygons[i]!;
    const m = poly.length / 2;
    const sx = pts[i * 2]!;
    const sy = pts[i * 2 + 1]!;
    for (let k = 0; k < m; k++) {
      const x1 = poly[k * 2]!;
      const y1 = poly[k * 2 + 1]!;
      const x2 = poly[((k + 1) % m) * 2]!;
      const y2 = poly[((k + 1) % m) * 2 + 1]!;
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const di = (mx - sx) ** 2 + (my - sy) ** 2;
      let best = -1;
      let bestDiff = Infinity;
      for (const j of neighbors[i]!) {
        const dj = (mx - pts[j * 2]!) ** 2 + (my - pts[j * 2 + 1]!) ** 2;
        const diff = Math.abs(dj - di);
        if (diff < bestDiff) {
          bestDiff = diff;
          best = j;
        }
      }
      if (best > i && bestDiff <= 1e-6 * Math.max(1, di)) edgeList.push(i, best, x1, y1, x2, y2);
    }
  }

  return {
    size: cfg.size,
    cellCount: n,
    sites: pts,
    centroids,
    polygons,
    neighbors,
    touchesEdge,
    edges: Float64Array.from(edgeList),
    edgeCount: edgeList.length / 6,
    delaunay,
  };
}

/** The cell containing a point. `hint` (the previous cell) makes the walk short. */
export function findCell(arena: Arena, x: number, y: number, hint = 0): number {
  return arena.delaunay.find(x, y, hint);
}
