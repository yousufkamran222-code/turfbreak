import { signal } from '@preact/signals';
import { tuning } from '../content/tuning';
import { FixedStepper } from '../loop';
import { ArenaRenderer, sidePalette } from '../render/renderer';
import type { CoreDef } from '../sim/abilities';
import type { EndReason } from '../sim/events';
import { stepWorld } from '../sim/step';
import { createWorld, type Phase, type SideIndex, type World } from '../sim/world';
import { sideLook } from './sides';

const RUNNER_SLOTS = tuning.runner.maxPerSide * 2;

export interface SessionConfig {
  seed: number;
  cores: readonly [CoreDef, CoreDef];
}

/** Live values the HUD reads. Signals only notify when a value actually changes. */
export function createHud() {
  return {
    counts: [signal(0), signal(0)] as const,
    stacks: [signal(0), signal(0)] as const,
    runners: [signal(1), signal(1)] as const,
    /** Bumped each time a Core triggers, so the HUD can flash its counter. */
    triggers: [signal(0), signal(0)] as const,
    secondsLeft: signal<number>(tuning.match.durationSeconds),
    countdown: signal<number>(tuning.match.countdownSeconds),
    phase: signal<Phase>('running'),
    winner: signal<SideIndex | -1>(-1),
    endReason: signal<EndReason | null>(null),
    leadChanges: signal(0),
  };
}
export type Hud = ReturnType<typeof createHud>;

/**
 * One match on screen: owns the world, steps it at a fixed rate, renders with
 * interpolation and pushes HUD values. Pauses when the platform pauses.
 */
export class MatchSession {
  readonly world: World;
  readonly hud = createHud();
  private readonly renderer: ArenaRenderer;
  private readonly stepper = new FixedStepper(tuning.sim.stepsPerSecond, tuning.sim.maxStepsPerFrame);
  private readonly prevX = new Float64Array(RUNNER_SLOTS + 8);
  private readonly prevY = new Float64Array(RUNNER_SLOTS + 8);
  private countdown: number = tuning.match.countdownSeconds;
  private last = 0;
  private raf = 0;
  private paused = false;

  constructor(canvas: HTMLCanvasElement, cfg: SessionConfig) {
    this.world = createWorld({ seed: cfg.seed, cores: cfg.cores });
    this.renderer = new ArenaRenderer(canvas, [
      sidePalette(sideLook(cfg.cores, 0).color),
      sidePalette(sideLook(cfg.cores, 1).color),
    ]);
    this.syncPrev(0);
    this.pushHud();
  }

  resize(cssSize: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, tuning.render.maxDevicePixelRatio);
    this.renderer.resize(cssSize, dpr, this.world.arena.size);
    this.render(1);
  }

  start(): void {
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.last = performance.now();
    this.stepper.reset();
  }

  private syncPrev(from: number): void {
    const rs = this.world.runners;
    for (let i = from; i < rs.length; i++) {
      this.prevX[i] = rs[i]!.x;
      this.prevY[i] = rs[i]!.y;
    }
  }

  private readonly frame = (now: number): void => {
    const elapsed = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    let alpha = 1;
    if (!this.paused && this.world.phase !== 'ended') {
      if (this.countdown > 0) {
        this.countdown = Math.max(0, this.countdown - elapsed);
      } else {
        alpha = this.stepper.advance(elapsed, 1, () => {
          const before = this.world.runners.length;
          this.syncPrev(0);
          stepWorld(this.world);
          // Runners spawned this step have no previous position yet.
          this.syncPrev(before);
          this.consumeEvents();
        });
      }
    }
    this.render(this.world.phase === 'ended' ? 1 : alpha);
    this.pushHud();
    this.raf = requestAnimationFrame(this.frame);
  };

  private consumeEvents(): void {
    for (const ev of this.world.events) {
      if (ev.type === 'CoreTriggered') this.hud.triggers[ev.side].value++;
    }
  }

  private render(alpha: number): void {
    this.renderer.draw(this.world, this.prevX, this.prevY, alpha);
  }

  private pushHud(): void {
    const w = this.world;
    const h = this.hud;
    for (const s of [0, 1] as const) {
      h.counts[s].value = w.counts[s];
      h.stacks[s].value = w.sides[s].stacks;
      h.runners[s].value = w.sides[s].runnerCount;
    }
    h.secondsLeft.value = Math.max(0, Math.ceil((w.matchSteps - w.step) / tuning.sim.stepsPerSecond));
    h.countdown.value = Math.ceil(this.countdown * 2) / 2;
    h.phase.value = w.phase;
    h.winner.value = w.winner;
    h.endReason.value = w.endReason;
    h.leadChanges.value = w.leadChanges;
  }
}
