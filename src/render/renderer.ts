import type { RunnerShape } from '../sim/abilities';
import { beamLength } from '../sim/step';
import { statValue, type World } from '../sim/world';
import type { Juice } from './juice';
import { tuning } from '../content/tuning';
import { fx } from './fx';
import { mix, rgba } from './colors';

export const BACKGROUND = '#0b0d12';

/** Things drawn over the arena that are not part of the world: the launch preview and the ultimate flash. */
export interface Overlay {
  /** Launch direction being aimed, from the player's primary, or null. */
  aim: { dx: number; dy: number } | null;
  /** Screen flash strength from 0 to 1. */
  flash: number;
}

export interface SidePalette {
  core: string;
  fill: string;
  edge: string;
  beam: string;
  beamGlow: string;
}

export function sidePalette(color: string): SidePalette {
  return {
    core: color,
    fill: mix(color, BACKGROUND, 0.38),
    edge: mix(color, '#ffffff', 0.35),
    beam: mix(color, '#ffffff', 0.45),
    beamGlow: rgba(color, 0.3),
  };
}

/** Unit-radius outline points for each runner shape, so drawing allocates nothing. */
function polygonPoints(sides: number, rotation: number): Float64Array {
  const pts = new Float64Array(sides * 2);
  for (let i = 0; i < sides; i++) {
    const a = rotation + (i / sides) * Math.PI * 2;
    pts[i * 2] = Math.cos(a);
    pts[i * 2 + 1] = Math.sin(a);
  }
  return pts;
}

function starPoints(): Float64Array {
  const pts = new Float64Array(20);
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    const r = i % 2 === 0 ? 1.15 : 0.5;
    pts[i * 2] = Math.cos(a) * r;
    pts[i * 2 + 1] = Math.sin(a) * r;
  }
  return pts;
}

const SHAPES: Record<RunnerShape, Float64Array | null> = {
  circle: null,
  diamond: polygonPoints(4, 0),
  hexagon: polygonPoints(6, Math.PI / 6),
  triangle: polygonPoints(3, -Math.PI / 2),
  square: polygonPoints(4, Math.PI / 4),
  pentagon: polygonPoints(5, -Math.PI / 2),
  octagon: polygonPoints(8, Math.PI / 8),
  star: starPoints(),
};

/**
 * Draws the arena: territory, cell edges, the frontier line, beams and runners.
 * Reads the world and never writes to it.
 */
export class ArenaRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private cellPaths: Path2D[] = [];
  private edgesPath: Path2D | null = null;
  private arenaKey: unknown = null;
  private pxPerUnit = 1;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private palettes: [SidePalette, SidePalette],
  ) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
  }

  private stripes: CanvasPattern | null = null;

  /** A 14 px tile of dark diagonal stripes, in device pixels (the caller cancels the world scale). */
  private stripePattern(): CanvasPattern | null {
    if (this.stripes) return this.stripes;
    const tile = document.createElement('canvas');
    tile.width = 14;
    tile.height = 14;
    const t = tile.getContext('2d');
    if (!t) return null;
    t.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    t.lineWidth = 4;
    t.beginPath();
    for (const o of [-14, 0, 14]) {
      t.moveTo(o, 14);
      t.lineTo(o + 14, 0);
    }
    t.stroke();
    this.stripes = this.ctx.createPattern(tile, 'repeat');
    return this.stripes;
  }

  setPalettes(p: [SidePalette, SidePalette]): void {
    this.palettes = p;
  }

  /** Size the backing store for a square of `cssSize` CSS pixels. */
  resize(cssSize: number, dpr: number, arenaSize: number): void {
    const px = Math.max(1, Math.round(cssSize * dpr));
    this.canvas.width = px;
    this.canvas.height = px;
    this.canvas.style.width = `${cssSize}px`;
    this.canvas.style.height = `${cssSize}px`;
    this.pxPerUnit = px / arenaSize;
  }

  private buildPaths(world: World): void {
    const a = world.arena;
    this.cellPaths = a.polygons.map((poly) => {
      const p = new Path2D();
      p.moveTo(poly[0]!, poly[1]!);
      for (let k = 2; k < poly.length; k += 2) p.lineTo(poly[k]!, poly[k + 1]!);
      p.closePath();
      return p;
    });
    const edges = new Path2D();
    for (const poly of a.polygons) {
      edges.moveTo(poly[0]!, poly[1]!);
      for (let k = 2; k < poly.length; k += 2) edges.lineTo(poly[k]!, poly[k + 1]!);
      edges.closePath();
    }
    this.edgesPath = edges;
    this.arenaKey = a;
  }

  /**
   * `prevX/prevY` hold runner positions from the previous sim step (by index),
   * and `alpha` is how far the renderer is between that step and the current one.
   */
  draw(world: World, prevX: Float64Array, prevY: Float64Array, alpha: number, juice: Juice, now: number, overlay: Overlay): void {
    if (this.arenaKey !== world.arena) this.buildPaths(world);
    const c = this.ctx;
    const k = this.pxPerUnit;
    const unit = 1 / k;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = BACKGROUND;
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(k, 0, 0, k, juice.shake.x * k, juice.shake.y * k);

    // Territory, one fill style change per side.
    const owner = world.owner;
    for (const s of [0, 1] as const) {
      c.fillStyle = this.palettes[s].fill;
      for (let i = 0; i < owner.length; i++) if (owner[i] === s) c.fill(this.cellPaths[i]!);
    }

    // High contrast: side 1 also wears diagonal stripes, so the sides never rely on colour alone.
    if (fx.highContrast) {
      const stripes = this.stripePattern();
      if (stripes) {
        stripes.setTransform(new DOMMatrix().scale(unit));
        c.fillStyle = stripes;
        for (let i = 0; i < owner.length; i++) if (owner[i] === 1) c.fill(this.cellPaths[i]!);
      }
    }

    // Shields: per-cell shield points brighten the cell; a side-wide Shield makes the whole side shimmer.
    const cs = world.cellShield;
    c.fillStyle = 'rgba(255, 255, 255, 0.16)';
    for (let i = 0; i < owner.length; i++) {
      if (cs[i]! > 0) {
        c.fill(this.cellPaths[i]!);
        if (cs[i]! > 1) c.fill(this.cellPaths[i]!);
      }
    }
    for (const s of [0, 1] as const) {
      if (world.sides[s].shieldSteps <= 0) continue;
      c.fillStyle = `rgba(255, 255, 255, ${(0.1 + 0.06 * Math.sin(now * 10)).toFixed(3)})`;
      for (let i = 0; i < owner.length; i++) if (owner[i] === s) c.fill(this.cellPaths[i]!);
    }

    // Thin, lighter cell edges.
    c.strokeStyle = 'rgba(255, 255, 255, 0.10)';
    c.lineWidth = 1.2 * unit;
    c.lineJoin = 'round';
    if (this.edgesPath) c.stroke(this.edgesPath);

    // The frontier: every shared edge whose two cells have different owners.
    const e = world.arena.edges;
    c.beginPath();
    for (let i = 0; i < world.arena.edgeCount; i++) {
      const o = i * 6;
      if (owner[e[o]!] !== owner[e[o + 1]!]) {
        c.moveTo(e[o + 2]!, e[o + 3]!);
        c.lineTo(e[o + 4]!, e[o + 5]!);
      }
    }
    c.lineCap = 'round';
    c.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    c.lineWidth = (fx.highContrast ? 4.5 : 2.5) * unit;
    c.stroke();

    // Capture pops draw above cells but below runners, so the frontier stays legible.
    juice.drawPops(c, world, this.cellPaths, now);

    // Beams, drawn additively with a wide faint pass for glow (no shadowBlur).
    c.globalCompositeOperation = 'lighter';
    const rs = world.runners;
    for (let i = 0; i < rs.length; i++) {
      const r = rs[i]!;
      if (!r.primary) continue;
      const length = beamLength(world, r);
      if (length <= 0) continue;
      const hx = lerp(prevX[i]!, r.x, alpha);
      const hy = lerp(prevY[i]!, r.y, alpha);
      const reach = beamReach(hx, hy, r.bx, r.by, length, world.arena.size);
      c.beginPath();
      c.moveTo(hx, hy);
      c.lineTo(hx + r.bx * reach, hy + r.by * reach);
      const pal = this.palettes[r.side];
      c.lineCap = 'round';
      c.strokeStyle = pal.beamGlow;
      c.lineWidth = 26;
      c.stroke();
      c.strokeStyle = pal.beam;
      c.lineWidth = 9;
      c.stroke();
    }
    const pickupColors = world.pickupDefs.map((d) => d.color);
    juice.drawParticles(c, [this.palettes[0].beam, this.palettes[1].beam, ...pickupColors]);
    c.globalCompositeOperation = 'source-over';
    juice.drawRings(c, [this.palettes[0].core, this.palettes[1].core, ...pickupColors], now);
    this.drawPickups(world, now);

    if (overlay.aim) this.drawAim(world, overlay.aim, now);

    // Runners: splits first, primaries on top.
    for (const primaryPass of [false, true]) {
      for (let i = 0; i < rs.length; i++) {
        const r = rs[i]!;
        if (r.primary !== primaryPass) continue;
        const x = lerp(prevX[i]!, r.x, alpha);
        const y = lerp(prevY[i]!, r.y, alpha);
        const rad = statValue(world.sides[r.side], 'bodyRadius') * r.radiusMul;
        const shape = SHAPES[world.sides[r.side].core.shape];
        // Drawn larger than the collision body so runners read on a phone.
        const scale = rad * (r.primary ? 1.7 : 1.4);
        c.beginPath();
        if (shape) {
          c.moveTo(x + shape[0]! * scale, y + shape[1]! * scale);
          for (let p = 2; p < shape.length; p += 2) c.lineTo(x + shape[p]! * scale, y + shape[p + 1]! * scale);
          c.closePath();
        } else {
          c.arc(x, y, scale, 0, Math.PI * 2);
        }
        c.fillStyle = this.palettes[r.side].core;
        c.fill();
        c.strokeStyle = r.primary ? '#ffffff' : this.palettes[r.side].edge;
        c.lineWidth = (r.primary ? 3 : 1.5) * unit * 1.5;
        c.stroke();
      }
    }

    juice.drawCallouts(c, [this.palettes[0].beam, this.palettes[1].beam], now);
    if (overlay.flash > 0) {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.fillStyle = `rgba(255, 255, 255, ${(0.55 * overlay.flash * fx.intensity).toFixed(3)})`;
      c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  /** Pickup orbs: a glow, a solid core with the kind's glyph, and a blink before they expire. */
  private drawPickups(world: World, now: number): void {
    const c = this.ctx;
    const r = tuning.pickups.radius;
    for (const p of world.pickups) {
      const def = world.pickupDefs[p.def]!;
      const left = (p.expiresStep - world.step) / tuning.sim.stepsPerSecond;
      if (left < 2 && Math.floor(now * 8) % 2 === 0) continue;
      const pulse = 1 + 0.08 * Math.sin(now * 6 + p.id);
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = rgba(def.color, 0.25);
      c.beginPath();
      c.arc(p.x, p.y, r * 1.8 * pulse, 0, Math.PI * 2);
      c.fill();
      c.globalCompositeOperation = 'source-over';
      c.fillStyle = def.color;
      c.beginPath();
      c.arc(p.x, p.y, r * pulse, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#ffffff';
      c.lineWidth = 3;
      c.stroke();
      c.fillStyle = '#0b0d12';
      c.font = `900 ${Math.round(r * 1.3)}px system-ui, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(def.glyph, p.x, p.y + 1);
    }
  }

  /** The launch preview: a dotted path from the player's runner, following up to two wall bounces. */
  private drawAim(world: World, aim: { dx: number; dy: number }, now: number): void {
    const r = world.runners.find((x) => x.side === 0 && x.primary);
    if (!r) return;
    const c = this.ctx;
    const size = world.arena.size;
    const rad = statValue(world.sides[0], 'bodyRadius');
    let x = r.x;
    let y = r.y;
    let dx = aim.dx;
    let dy = aim.dy;
    c.setLineDash([18, 16]);
    c.lineDashOffset = -now * 60;
    c.lineWidth = 6;
    c.lineCap = 'round';
    c.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    c.beginPath();
    c.moveTo(x, y);
    for (let bounce = 0; bounce < 3; bounce++) {
      // Distance to the next wall along the heading.
      let t = Infinity;
      if (dx > 0) t = Math.min(t, (size - rad - x) / dx);
      if (dx < 0) t = Math.min(t, (rad - x) / dx);
      if (dy > 0) t = Math.min(t, (size - rad - y) / dy);
      if (dy < 0) t = Math.min(t, (rad - y) / dy);
      if (!Number.isFinite(t)) break;
      x += dx * t;
      y += dy * t;
      c.lineTo(x, y);
      if (x <= rad + 1e-6 || x >= size - rad - 1e-6) dx = -dx;
      if (y <= rad + 1e-6 || y >= size - rad - 1e-6) dy = -dy;
    }
    c.stroke();
    c.setLineDash([]);
    // Arrowhead at the runner.
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(r.x + aim.dx * 70, r.y + aim.dy * 70, 12 + 3 * Math.sin(now * 8), 0, Math.PI * 2);
    c.fill();
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** How far a beam reaches from (x, y) along (bx, by) before leaving the arena. */
function beamReach(x: number, y: number, bx: number, by: number, length: number, size: number): number {
  let t = length;
  if (bx > 0) t = Math.min(t, (size - x) / bx);
  else if (bx < 0) t = Math.min(t, -x / bx);
  if (by > 0) t = Math.min(t, (size - y) / by);
  else if (by < 0) t = Math.min(t, -y / by);
  return Math.max(0, t);
}
