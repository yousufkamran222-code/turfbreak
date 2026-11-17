import { signal } from '@preact/signals';
import type { Synth } from '../audio/synth';
import { tuning } from '../content/tuning';
import { FixedStepper } from '../loop';
import { fx } from '../render/fx';
import { Juice } from '../render/juice';
import { ArenaRenderer, sidePalette, type Overlay } from '../render/renderer';
import type { CoreDef, ModPick } from '../sim/abilities';
import type { EndReason } from '../sim/events';
import { canUltimate, primaryOf, queueInput, type ControllerSpec } from '../sim/input';
import { stepWorld } from '../sim/step';
import { createWorld, type MatchTwist, type Phase, type SideIndex, type World } from '../sim/world';
import type { HapticKind } from '../platform/types';
import { sideLook } from './sides';

const RUNNER_SLOTS = tuning.runner.maxPerSide * 2;
const SPS = tuning.sim.stepsPerSecond;
const J = tuning.juice;

export interface SessionConfig {
  seed: number;
  cores: readonly [CoreDef, CoreDef];
  mods: readonly [readonly ModPick[], readonly ModPick[]];
  /** Rival controller, or null for a rival that never aims or fires its ultimate. */
  rival: ControllerSpec | null;
  /** When set, the game plays the player's side with this controller (auto-play). */
  assist: ControllerSpec | null;
  /** Boss arena twist and other match rule changes (from `matchConfig`). */
  twist?: MatchTwist | undefined;
  /** Called for clashes, Core triggers and the result; the caller decides whether haptics are on. */
  haptic?: ((kind: HapticKind) => void) | undefined;
}

export type Stage = 'aiming' | 'playing' | 'freeze' | 'result';

/** Live values the HUD reads. Signals only notify when a value actually changes. */
export function createHud(modCounts: readonly [number, number]) {
  return {
    counts: [signal(0), signal(0)] as const,
    stacks: [signal(0), signal(0)] as const,
    /** Bumped each time a Core triggers, so the HUD can flash its counter. */
    triggers: [signal(0), signal(0)] as const,
    /** Per Mod slot, bumped each time that Mod fires. */
    modTriggers: [
      Array.from({ length: modCounts[0] }, () => signal(0)),
      Array.from({ length: modCounts[1] }, () => signal(0)),
    ] as const,
    /** Bumped on each lead change, so the territory bar can thump. */
    leadPulse: signal(0),
    secondsLeft: signal<number>(tuning.match.durationSeconds),
    stage: signal<Stage>('aiming'),
    aimLeft: signal<number>(tuning.match.aimSeconds),
    phase: signal<Phase>('running'),
    winner: signal<SideIndex | -1>(-1),
    endReason: signal<EndReason | null>(null),
    leadChanges: signal(0),
    ultimateReady: signal(true),
    /** Bumped when an ultimate fires, with the side, for the banner. */
    ultimateBanner: signal<{ side: SideIndex; n: number } | null>(null),
    effects: [signal(''), signal('')] as const,
    speed: signal<1 | 2>(1),
  };
}
export type Hud = ReturnType<typeof createHud>;

/**
 * One match on screen: aiming, then the watched match. Owns the world, steps it
 * at a fixed rate, renders with interpolation, feeds juice and audio from the
 * event queue and pushes HUD values. Pauses when the platform pauses.
 */
export class MatchSession {
  readonly world: World;
  readonly hud: Hud;
  private readonly renderer: ArenaRenderer;
  private readonly juice: Juice;
  private readonly stepper = new FixedStepper(SPS, tuning.sim.maxStepsPerFrame);
  private readonly prevX = new Float64Array(RUNNER_SLOTS + 8);
  private readonly prevY = new Float64Array(RUNNER_SLOTS + 8);
  private readonly overlay: Overlay = { aim: null, flash: 0 };
  private aim: { dx: number; dy: number } | null = null;
  private aimLeft: number = tuning.match.aimSeconds;
  private last = 0;
  private clock = 0;
  private raf = 0;
  private paused = false;
  private slowLeft = 0;
  private freezeLeft = 0;
  private readonly streak = [0, 0];
  private readonly lastCapture = [-Infinity, -Infinity];
  private readonly milestone = [0, 0];

  constructor(
    canvas: HTMLCanvasElement,
    private readonly cfg: SessionConfig,
    private readonly synth: Synth,
  ) {
    this.world = createWorld({
      seed: cfg.seed,
      cores: cfg.cores,
      mods: cfg.mods,
      controllers: [cfg.assist, cfg.rival],
      ...(cfg.twist ? { twist: cfg.twist } : {}),
    });
    this.hud = createHud([cfg.mods[0].length, cfg.mods[1].length]);
    this.renderer = new ArenaRenderer(canvas, [
      sidePalette(sideLook(cfg.cores, 0).color),
      sidePalette(sideLook(cfg.cores, 1).color),
    ]);
    this.juice = new Juice(this.world.arena.cellCount, cfg.seed);
    const r = primaryOf(this.world, 0);
    if (r && !cfg.assist) this.aim = { dx: r.dx, dy: r.dy };
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
    // Auto-play skips aiming: the controller aims on the first step.
    if (this.cfg.assist) this.launch();
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.synth.stopBeat();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.last = performance.now();
    this.stepper.reset();
    if (paused) {
      this.synth.stopBeat();
      this.synth.suspend();
    } else {
      this.synth.resume();
      if (this.hud.stage.value === 'playing') this.synth.startBeat();
    }
  }

  toggleSpeed(): void {
    this.hud.speed.value = this.hud.speed.value === 1 ? 2 : 1;
  }

  /** While aiming, point the launch from the player's runner toward (x, y) in arena units. */
  aimAt(x: number, y: number): void {
    if (this.hud.stage.value !== 'aiming' || this.cfg.assist) return;
    const r = primaryOf(this.world, 0);
    if (!r) return;
    const dx = x - r.x;
    const dy = y - r.y;
    const len = Math.hypot(dx, dy);
    if (len < 20) return;
    this.aim = { dx: dx / len, dy: dy / len };
  }

  /** Release the launch (from a finger lift, or when aiming time runs out). */
  launch(): void {
    if (this.hud.stage.value !== 'aiming') return;
    if (this.aim && !this.cfg.assist) queueInput(this.world, { side: 0, type: 'launch', dx: this.aim.dx, dy: this.aim.dy });
    this.hud.stage.value = 'playing';
    this.synth.launch();
    this.synth.startBeat();
  }

  fireUltimate(): void {
    if (this.cfg.assist || this.hud.stage.value !== 'playing' || !canUltimate(this.world, 0)) return;
    queueInput(this.world, { side: 0, type: 'ultimate' });
  }

  private syncPrev(from: number): void {
    const rs = this.world.runners;
    for (let i = from; i < rs.length; i++) {
      this.prevX[i] = rs[i]!.x;
      this.prevY[i] = rs[i]!.y;
    }
  }

  private readonly frame = (now: number): void => {
    const realDt = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    let alpha = 1;
    if (!this.paused) {
      // Slow motion stretches sim time but not the real-time timers that drive it.
      const scale = this.slowLeft > 0 ? J.ultimateSlowScale : 1;
      this.slowLeft = Math.max(0, this.slowLeft - realDt);
      this.overlay.flash = Math.max(0, this.overlay.flash - realDt / J.ultimateFlashSeconds);
      const dt = realDt * scale;
      this.clock += dt;
      this.juice.beginFrame();
      const stage = this.hud.stage.value;
      if (stage === 'aiming') {
        this.aimLeft = Math.max(0, this.aimLeft - realDt);
        if (this.aimLeft === 0) this.launch();
      } else if (stage === 'playing') {
        if (this.juice.hitStop > 0) {
          this.stepper.reset();
        } else {
          alpha = this.stepper.advance(dt, this.hud.speed.value, () => {
            if (this.world.phase === 'ended' || this.juice.hitStop > 0) return;
            const before = this.world.runners.length;
            this.syncPrev(0);
            stepWorld(this.world);
            this.syncPrev(before);
            this.consumeEvents();
          });
        }
      } else if (stage === 'freeze') {
        this.freezeLeft -= realDt;
        if (this.freezeLeft <= 0) this.hud.stage.value = 'result';
      }
      this.juice.update(dt, this.clock);
    }
    this.overlay.aim = this.hud.stage.value === 'aiming' && this.aim ? this.aim : null;
    this.render(this.world.phase === 'ended' ? 1 : alpha);
    this.pushHud();
    this.raf = requestAnimationFrame(this.frame);
  };

  private onCapture(side: SideIndex, cell: number): void {
    if (this.clock - this.lastCapture[side]! > J.streakGapSeconds) {
      this.streak[side] = 0;
      this.milestone[side] = 0;
    }
    this.lastCapture[side] = this.clock;
    const n = ++this.streak[side]!;
    this.synth.streakTick(side, n);
    const next = J.streakMilestones[this.milestone[side]!];
    if (next !== undefined && n >= next) {
      const tier = this.milestone[side]!;
      this.milestone[side]!++;
      const c = this.world.arena.centroids;
      this.juice.callout(`×${next}`, c[cell * 2]!, c[cell * 2 + 1]!, side, tier);
      this.synth.milestone(side, tier);
    }
  }

  private consumeEvents(): void {
    const w = this.world;
    for (const ev of w.events) {
      this.juice.feed(ev, w, this.clock);
      switch (ev.type) {
        case 'CoreTriggered':
          this.hud.triggers[ev.side].value++;
          this.synth.trigger(ev.side);
          if (ev.side === 0) this.buzz('light', 140);
          break;
        case 'ModTriggered': {
          const sig = this.hud.modTriggers[ev.side][ev.slot];
          if (sig) sig.value++;
          break;
        }
        case 'UltimateFired':
          this.synth.ultimate(ev.side);
          this.slowLeft = J.ultimateSlowSeconds * fx.intensity;
          this.overlay.flash = 1;
          this.hud.ultimateBanner.value = { side: ev.side, n: (this.hud.ultimateBanner.value?.n ?? 0) + 1 };
          break;
        case 'Blast':
          this.synth.blast();
          break;
        case 'ShieldHit':
          this.synth.shieldHit();
          break;
        case 'Teleport': {
          this.synth.teleport();
          // A teleported runner must not be drawn sliding across the map between two frames.
          const i = w.runners.findIndex((r) => r.id === ev.runner);
          if (i >= 0) {
            this.prevX[i] = ev.x;
            this.prevY[i] = ev.y;
          }
          break;
        }
        case 'WallBounce':
          this.synth.hit(ev.side);
          break;
        case 'Clash':
          this.synth.clash();
          this.buzz('medium', 160);
          break;
        case 'CellCaptured':
          this.onCapture(ev.side, ev.cell);
          break;
        case 'PickupCollected':
          this.synth.pickup(ev.kind === 'blast');
          break;
        case 'LeadChange':
          this.hud.leadPulse.value++;
          break;
        case 'MatchEnded':
          this.synth.stopBeat();
          this.synth.end(ev.winner === 0);
          this.buzz('heavy', 0);
          this.juice.confetti(ev.winner, this.world.arena.size);
          this.freezeLeft = J.endFreezeSeconds;
          this.hud.stage.value = 'freeze';
          break;
        default:
          break;
      }
    }
  }

  private lastBuzz = -Infinity;

  /** A haptic pulse, rate-limited so a busy build does not buzz constantly. */
  private buzz(kind: HapticKind, minGapMs: number): void {
    const h = this.cfg.haptic;
    if (!h) return;
    const now = performance.now();
    if (now - this.lastBuzz < minGapMs) return;
    this.lastBuzz = now;
    h(kind);
  }

  private render(alpha: number): void {
    this.renderer.draw(this.world, this.prevX, this.prevY, alpha, this.juice, this.clock, this.overlay);
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
      h.stacks[s].value = st.stacks;
    }
    const secs = Math.max(0, Math.ceil((w.matchSteps - w.step) / SPS));
    this.synth.setIntense(w.phase === 'running' && secs <= tuning.tension.urgentSeconds);
    h.secondsLeft.value = secs;
    h.aimLeft.value = Math.ceil(this.aimLeft);
    h.phase.value = w.phase;
    h.winner.value = w.winner;
    h.endReason.value = w.endReason;
    h.leadChanges.value = w.leadChanges;
    h.ultimateReady.value = !this.cfg.assist && canUltimate(w, 0);
  }
}
