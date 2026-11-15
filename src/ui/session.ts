import { signal } from '@preact/signals';
import type { Synth } from '../audio/synth';
import type { InputVariant } from '../content/inputs';
import { tuning } from '../content/tuning';
import { FixedStepper } from '../loop';
import { Juice } from '../render/juice';
import { ArenaRenderer, sidePalette } from '../render/renderer';
import type { CoreDef } from '../sim/abilities';
import type { EndReason } from '../sim/events';
import { cooldownSteps, queueInput, type ControllerSpec } from '../sim/input';
import { stepWorld } from '../sim/step';
import { createWorld, type Phase, type SideIndex, type World } from '../sim/world';
import { sideLook } from './sides';

const RUNNER_SLOTS = tuning.runner.maxPerSide * 2;
const SPS = tuning.sim.stepsPerSecond;

export interface SessionConfig {
  seed: number;
  cores: readonly [CoreDef, CoreDef];
  variant: InputVariant;
  /** Rival controller, or null for a rival that never uses the input. */
  rival: ControllerSpec | null;
  /** When set, the game plays the player's input with this controller (redirect assist). */
  assist: ControllerSpec | null;
}

/** Live values the HUD reads. Signals only notify when a value actually changes. */
export function createHud() {
  return {
    counts: [signal(0), signal(0)] as const,
    stacks: [signal(0), signal(0)] as const,
    runners: [signal(1), signal(1)] as const,
    /** Bumped each time a Core triggers, so the HUD can flash its counter. */
    triggers: [signal(0), signal(0)] as const,
    /** Bumped on each lead change, so the territory bar can thump. */
    leadPulse: signal(0),
    secondsLeft: signal<number>(tuning.match.durationSeconds),
    countdown: signal<number>(tuning.match.countdownSeconds),
    phase: signal<Phase>('running'),
    winner: signal<SideIndex | -1>(-1),
    endReason: signal<EndReason | null>(null),
    leadChanges: signal(0),
    /** Player redirect gauge from 0 to 1, and whether a charge is ready. */
    gauge: signal(1),
    gaugeReady: signal(true),
    /** Active pickup effects per side, for the chips under each card. */
    effects: [signal(''), signal('')] as const,
    /** Show the one-line input prompt (MASTER_PROMPT 6.6). */
    prompt: signal(false),
    speed: signal<1 | 2>(1),
  };
}
export type Hud = ReturnType<typeof createHud>;

/**
 * One match on screen: owns the world, steps it at a fixed rate, renders with
 * interpolation, feeds juice and audio from the event queue, turns taps into
 * input records and pushes HUD values. Pauses when the platform pauses.
 */
export class MatchSession {
  readonly world: World;
  readonly hud = createHud();
  private readonly renderer: ArenaRenderer;
  private readonly juice: Juice;
  private readonly stepper = new FixedStepper(SPS, tuning.sim.maxStepsPerFrame);
  private readonly prevX = new Float64Array(RUNNER_SLOTS + 8);
  private readonly prevY = new Float64Array(RUNNER_SLOTS + 8);
  private countdown: number = tuning.match.countdownSeconds;
  private last = 0;
  private clock = 0;
  private raf = 0;
  private paused = false;
  private playerUsedInput = false;
  private lastUrgentSecond = -1;
  private endPlayed = false;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly cfg: SessionConfig,
    private readonly synth: Synth,
  ) {
    this.world = createWorld({
      seed: cfg.seed,
      cores: cfg.cores,
      inputMode: cfg.variant.mode,
      controllers: [cfg.assist, cfg.rival],
    });
    this.renderer = new ArenaRenderer(canvas, [
      sidePalette(sideLook(cfg.cores, 0).color),
      sidePalette(sideLook(cfg.cores, 1).color),
    ]);
    this.juice = new Juice(this.world.arena.cellCount, cfg.seed);
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
    if (paused) this.synth.suspend();
    else this.synth.resume();
  }

  toggleSpeed(): void {
    this.hud.speed.value = this.hud.speed.value === 1 ? 2 : 1;
  }

  /** A tap on the arena at arena coordinates. */
  press(x: number, y: number): void {
    if (this.cfg.assist || this.world.phase === 'ended') return;
    const mode = this.world.inputMode;
    if (mode === 'redirect') {
      if (this.world.sides[0].charges <= 0) return;
      queueInput(this.world, { side: 0, type: 'redirect', x, y });
      this.playerUsedInput = true;
    }
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
    if (!this.paused) {
      this.clock += elapsed;
      this.juice.beginFrame();
      if (this.world.phase !== 'ended') {
        if (this.countdown > 0) {
          this.countdown = Math.max(0, this.countdown - elapsed);
        } else if (this.juice.hitStop > 0) {
          // Hit-stop: hold the sim for a few frames on a big clash.
          this.stepper.reset();
        } else {
          alpha = this.stepper.advance(elapsed, this.hud.speed.value, () => {
            if (this.world.phase === 'ended' || this.juice.hitStop > 0) return;
            const before = this.world.runners.length;
            this.syncPrev(0);
            stepWorld(this.world);
            // Runners spawned this step have no previous position yet.
            this.syncPrev(before);
            this.consumeEvents();
          });
        }
      }
      this.juice.update(elapsed, this.clock);
    }
    this.render(this.world.phase === 'ended' ? 1 : alpha);
    this.pushHud();
    this.raf = requestAnimationFrame(this.frame);
  };

  private consumeEvents(): void {
    const w = this.world;
    for (const ev of w.events) {
      this.juice.feed(ev, w, this.clock);
      switch (ev.type) {
        case 'CoreTriggered':
          this.hud.triggers[ev.side].value++;
          this.synth.trigger(ev.side);
          break;
        case 'WallBounce':
          this.synth.hit(ev.side);
          break;
        case 'Clash':
          this.synth.clash();
          break;
        case 'CellCaptured':
          this.synth.capture(ev.side);
          break;
        case 'Redirect':
          if (ev.side === 0) this.synth.redirect();
          break;
        case 'PickupCollected':
          this.synth.pickup(ev.kind === 'blast');
          break;
        case 'LeadChange':
          this.hud.leadPulse.value++;
          break;
        case 'MatchEnded':
          if (!this.endPlayed) this.synth.end(ev.winner === 0);
          this.endPlayed = true;
          break;
        default:
          break;
      }
    }
  }

  private render(alpha: number): void {
    this.renderer.draw(this.world, this.prevX, this.prevY, alpha, this.juice, this.clock);
  }

  private pushHud(): void {
    const w = this.world;
    const h = this.hud;
    for (const s of [0, 1] as const) {
      const st = w.sides[s];
      const fx: string[] = [];
      if (st.surgeSteps > 0) fx.push('SURGE');
      if (st.shieldSteps > 0) fx.push('SHIELD');
      h.effects[s].value = fx.join(' · ');
      h.counts[s].value = w.counts[s];
      h.stacks[s].value = w.sides[s].stacks;
      h.runners[s].value = w.sides[s].runnerCount;
    }
    const secs = Math.max(0, Math.ceil((w.matchSteps - w.step) / SPS));
    if (w.phase === 'running' && this.countdown === 0 && secs <= tuning.tension.urgentSeconds && secs !== this.lastUrgentSecond) {
      this.lastUrgentSecond = secs;
      if (secs > 0) this.synth.urgentTick();
    }
    h.secondsLeft.value = secs;
    h.countdown.value = Math.ceil(this.countdown * 2) / 2;
    h.phase.value = w.phase;
    h.winner.value = w.winner;
    h.endReason.value = w.endReason;
    h.leadChanges.value = w.leadChanges;
    const st = w.sides[0];
    if (w.inputMode === 'redirect') {
      h.gaugeReady.value = st.charges > 0;
      h.gauge.value = st.charges > 0 ? 1 : 1 - st.chargeSteps / cooldownSteps(w);
    }
    h.prompt.value =
      !this.cfg.assist &&
      this.cfg.variant.prompt !== null &&
      !this.playerUsedInput &&
      w.phase === 'running' &&
      w.step >= tuning.match.promptSeconds * SPS;
  }
}
