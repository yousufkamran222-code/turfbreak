import { tuning } from '../content/tuning';
import type { SimEvent } from '../sim/events';
import { Rng, Stream } from '../sim/rng';
import type { World } from '../sim/world';

const J = tuning.juice;

/**
 * Cosmetic feedback built on the sim's event queue (MASTER_PROMPT 6.2):
 * capture pops, sparks, camera shake, hit-stop and tap markers. It reads
 * events and never touches the sim. Its randomness has its own stream.
 */
export class Juice {
  /** Render-clock time each cell's pop starts, or -1. */
  private popStart: Float32Array;
  private readonly px = new Float32Array(J.maxParticles);
  private readonly py = new Float32Array(J.maxParticles);
  private readonly vx = new Float32Array(J.maxParticles);
  private readonly vy = new Float32Array(J.maxParticles);
  private readonly life = new Float32Array(J.maxParticles);
  private readonly maxLife = new Float32Array(J.maxParticles);
  /** Colour slot: 0 and 1 are the sides, 2 and up are pickup kinds. */
  private readonly color = new Uint8Array(J.maxParticles);
  private next = 0;
  private trauma = 0;
  private readonly rng: Rng;
  private batch = 0;
  hitStop = 0;
  /** Expanding rings: tap markers, pickup spawns and blasts. `color` is a colour slot. */
  readonly rings: { x: number; y: number; t: number; color: number; from: number; to: number; dur: number }[] = [];
  readonly shake = { x: 0, y: 0 };

  constructor(cellCount: number, seed: number) {
    this.popStart = new Float32Array(cellCount).fill(-1);
    this.rng = new Rng(seed, Stream.cosmetic);
  }

  /** Call once per frame before feeding that frame's events. */
  beginFrame(): void {
    this.batch = 0;
  }

  feed(ev: SimEvent, world: World, now: number): void {
    const k = J.intensity;
    switch (ev.type) {
      case 'CellCaptured': {
        const delay = Math.min(this.batch++ * J.popStagger, J.popStaggerMax);
        this.popStart[ev.cell] = now + delay;
        break;
      }
      case 'WallBounce': {
        this.sparks(ev.x, ev.y, ev.side, Math.round(J.sparksWall * k), 260);
        const r = world.runners.find((x) => x.id === ev.runner);
        if (r?.primary) this.trauma += J.traumaWall * k;
        break;
      }
      case 'Clash': {
        this.sparks(ev.x, ev.y, 0, Math.round((J.sparksClash / 2) * k), 380);
        this.sparks(ev.x, ev.y, 1, Math.round((J.sparksClash / 2) * k), 380);
        this.trauma += J.traumaClash * k;
        const a = world.runners.find((x) => x.id === ev.a);
        const b = world.runners.find((x) => x.id === ev.b);
        if (a?.primary || b?.primary) this.hitStop = Math.max(this.hitStop, J.hitStopSeconds * k);
        break;
      }
      case 'CoreTriggered': {
        const r = world.runners.find((x) => x.side === ev.side && x.primary);
        if (r) this.sparks(r.x, r.y, ev.side, Math.round(J.sparksTrigger * k), 200);
        this.trauma += J.traumaTrigger * k * 0.5;
        break;
      }
      case 'Redirect':
        this.rings.push({ x: ev.x, y: ev.y, t: now, color: ev.side, from: 18, to: 58, dur: J.tapMarkerSeconds });
        break;
      case 'PickupSpawned': {
        const slot = 2 + world.pickupDefs.findIndex((d) => d.id === ev.kind);
        this.rings.push({ x: ev.x, y: ev.y, t: now, color: slot, from: 90, to: 20, dur: 0.35 });
        break;
      }
      case 'PickupCollected': {
        const def = world.pickupDefs.findIndex((d) => d.id === ev.kind);
        const e = world.pickupDefs[def]?.effect;
        this.sparks(ev.x, ev.y, 2 + def, Math.round(18 * k), 420);
        this.rings.push({ x: ev.x, y: ev.y, t: now, color: 2 + def, from: 20, to: e?.kind === 'blast' ? e.radius : 80, dur: 0.4 });
        this.trauma += (e?.kind === 'blast' ? J.traumaClash : J.traumaTrigger) * k;
        break;
      }
      default:
        break;
    }
    this.trauma = Math.min(1, this.trauma);
  }

  private sparks(x: number, y: number, color: number, n: number, speed: number): void {
    for (let i = 0; i < n; i++) {
      const p = this.next;
      this.next = (this.next + 1) % J.maxParticles;
      const dir = this.rng.unitVector();
      const v = speed * (0.4 + this.rng.next() * 0.8);
      this.px[p] = x;
      this.py[p] = y;
      this.vx[p] = dir.x * v;
      this.vy[p] = dir.y * v;
      this.maxLife[p] = 0.25 + this.rng.next() * 0.3;
      this.life[p] = this.maxLife[p]!;
      this.color[p] = color;
    }
  }

  update(dt: number, now: number): void {
    this.hitStop = Math.max(0, this.hitStop - dt);
    this.trauma = Math.max(0, this.trauma - J.traumaDecay * dt);
    const t2 = this.trauma * this.trauma * J.shakeMax;
    this.shake.x = t2 * (this.rng.next() * 2 - 1);
    this.shake.y = t2 * (this.rng.next() * 2 - 1);
    const drag = Math.exp(-4 * dt);
    for (let i = 0; i < J.maxParticles; i++) {
      if (this.life[i]! <= 0) continue;
      this.life[i]! -= dt;
      this.px[i]! += this.vx[i]! * dt;
      this.py[i]! += this.vy[i]! * dt;
      this.vx[i]! *= drag;
      this.vy[i]! *= drag;
    }
    for (let i = this.rings.length - 1; i >= 0; i--) if (now - this.rings[i]!.t > this.rings[i]!.dur) this.rings.splice(i, 1);
  }

  drawPops(c: CanvasRenderingContext2D, world: World, paths: Path2D[], now: number): void {
    const cen = world.arena.centroids;
    for (let i = 0; i < this.popStart.length; i++) {
      const start = this.popStart[i]!;
      if (start < 0) continue;
      const age = now - start;
      if (age < 0) continue;
      const t = age / J.popSeconds;
      if (t >= 1) {
        this.popStart[i] = -1;
        continue;
      }
      const s = 1 + J.popScale * Math.sin(Math.PI * t) * J.intensity;
      const cx = cen[i * 2]!;
      const cy = cen[i * 2 + 1]!;
      c.save();
      c.translate(cx, cy);
      c.scale(s, s);
      c.translate(-cx, -cy);
      c.fillStyle = `rgba(255, 255, 255, ${(0.55 * (1 - t)).toFixed(3)})`;
      c.fill(paths[i]!);
      c.restore();
    }
  }

  drawParticles(c: CanvasRenderingContext2D, colors: readonly string[]): void {
    c.lineCap = 'round';
    for (let s = 0; s < colors.length; s++) {
      c.strokeStyle = colors[s]!;
      c.lineWidth = 4;
      c.beginPath();
      for (let i = 0; i < J.maxParticles; i++) {
        if (this.life[i]! <= 0 || this.color[i] !== s) continue;
        const f = 0.035;
        c.moveTo(this.px[i]!, this.py[i]!);
        c.lineTo(this.px[i]! - this.vx[i]! * f, this.py[i]! - this.vy[i]! * f);
      }
      c.stroke();
    }
  }

  drawRings(c: CanvasRenderingContext2D, colors: readonly string[], now: number): void {
    for (const ring of this.rings) {
      const t = Math.min(1, (now - ring.t) / ring.dur);
      c.strokeStyle = colors[ring.color] ?? '#ffffff';
      c.globalAlpha = 1 - t;
      c.lineWidth = 5;
      c.beginPath();
      c.arc(ring.x, ring.y, ring.from + (ring.to - ring.from) * t, 0, Math.PI * 2);
      c.stroke();
    }
    c.globalAlpha = 1;
  }
}
