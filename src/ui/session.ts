import { signal } from '@preact/signals';
import type { Synth } from '../audio/synth';
import { tuning } from '../content/tuning';
import { FixedStepper } from '../loop';
import { fx } from '../render/fx';
import { Juice } from '../render/juice';
import { ArenaRenderer, sidePalette, type Overlay } from '../render/renderer';
import type { CoreDef, ModPick } from '../sim/abilities';
import type { EndReason } from '../sim/events';
import { APP_VERSION, type ReplayData } from '../meta/replay';
import { canUltimate, primaryOf, queueInput, type ControllerSpec, type InputRecord } from '../sim/input';
import { stepWorld } from '../sim/step';
import { createWorld, type MatchTwist, type Phase, type SideIndex, type World } from '../sim/world';
import type { HapticKind } from '../platform/types';
import { MatchStats } from './matchStats';
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
  /** Recorded inputs of both sides (a replay). The match then plays itself: no aiming, no ultimate button. */
  inputs?: readonly InputRecord[] | undefined;
  /** Boss arena twist and other match rule changes (from `matchConfig`). */
  twist?: MatchTwist | undefined;
  /** Called for clashes, Core triggers and the result; the caller decides whether haptics are on. */
  haptic?: ((kind: HapticKind) => void) | undefined;
}

/** One line of the desktop trigger log. */
export interface LogEntry {
  id: number;
  side: SideIndex;
  glyph: string;
  label: string;
}

/** Quick Hands: seconds until the ultimate comes back, per level (mirrors the Mod's own numbers, for display only). */
const QUICK_HANDS_DELAY = [24, 16, 11] as const;
const QUICK_HANDS_CHARGES = [1, 1, 2] as const;
const LOG_LINES = 8;

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
    /** Seconds until a Mod recharges the used ultimate; 0 when nothing will. */
    ultimateWait: signal(0),
    /** The last few Core and Mod triggers, newest last (desktop log). */
    log: signal<readonly LogEntry[]>([]),
    /** Bumped when an ultimate fires, with the side, for the banner. */
    ultimateBanner: signal<{ side: SideIndex; n: number } | null>(null),
    effects: [signal(''), signal('')] as const,
    speed: signal<1 | 2 | 4>(1),
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
  /** Counts what unlock feats need; read `stats.summary(world)` once the match ends. */
  readonly stats: MatchStats;
  /** True when nobody aims or fires: auto-play, a replay or a Versus Lab match. */
  readonly passive: boolean;
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
  private logId = 0;
  private ultimateStep = -1;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly cfg: SessionConfig,
    private readonly synth: Synth,
  ) {
    this.world = createWorld({
      seed: cfg.seed,
      cores: cfg.cores,
      mods: cfg.mods,
      controllers: cfg.inputs ? [null, null] : [cfg.assist, cfg.rival],
      ...(cfg.inputs ? { inputs: cfg.inputs } : {}),
      ...(cfg.twist ? { twist: cfg.twist } : {}),
    });
    this.passive = !!cfg.assist || !!cfg.inputs;
    this.stats = new MatchStats(this.world, cfg.mods[0].length, cfg.cores[1].id);
    this.hud = createHud([cfg.mods[0].length, cfg.mods[1].length]);
    this.renderer = new ArenaRenderer(canvas, [
      sidePalette(sideLook(cfg.cores, 0).color),
      sidePalette(sideLook(cfg.cores, 1).color),
    ]);
    this.juice = new Juice(this.world.arena.cellCount, cfg.seed);
    const r = primaryOf(this.world, 0);
    if (r && !this.passive) this.aim = { dx: r.dx, dy: r.dy };
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
    // Auto-play and replays skip aiming: the controller (or the record) aims on the first step.
    if (this.passive) this.launch();
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

  /** Cycle through `speeds` (1x, 2x by default). */
  toggleSpeed(speeds: readonly (1 | 2 | 4)[] = [1, 2]): void {
    const i = speeds.indexOf(this.hud.speed.value);
    this.hud.speed.value = speeds[(i + 1) % speeds.length] ?? 1;
  }

  /**
   * Run the rest of the match at once: no juice or audio for the steps in
   * between, only the feat counters, then the final step's events as usual.
   */
  skipToEnd(): void {
    if (this.hud.stage.value === 'aiming') this.launch();
    if (this.hud.stage.value !== 'playing') return;
    const w = this.world;
    const ended = (): boolean => w.phase === 'ended';
    let guard = 0;
    while (!ended() && guard++ < 200_000) {
      this.syncPrev(0);
      const before = w.runners.length;
      stepWorld(w);
      this.stats.observe(w);
      this.syncPrev(before);
      if (!ended()) w.events.length = 0;
    }
    this.consumeEvents();
  }

  /** Everything needed to play this match back: seed, Cores, builds, twist and the inputs applied so far. */
  replayData(): ReplayData {
    const c = this.cfg;
    const entry = (p: ModPick) => ({ id: p.mod.id, level: p.level });
    return {
      version: APP_VERSION,
      seed: c.seed,
      cores: [c.cores[0].id, c.cores[1].id],
      builds: [c.mods[0].map(entry), c.mods[1].map(entry)],
      twist: c.twist ?? null,
      inputs: [...this.world.inputLog],
    };
  }

  /** While aiming, point the launch from the player's runner toward (x, y) in arena units. */
  aimAt(x: number, y: number): void {
    if (this.hud.stage.value !== 'aiming' || this.passive) return;
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
    if (this.aim && !this.passive) queueInput(this.world, { side: 0, type: 'launch', dx: this.aim.dx, dy: this.aim.dy });
    this.hud.stage.value = 'playing';
    this.synth.launch();
    this.synth.startBeat();
  }

  fireUltimate(): void {
    if (this.passive || this.hud.stage.value !== 'playing' || !canUltimate(this.world, 0)) return;
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
          // Frozen: the steps owed from the frame that began the hit-stop stay in the stepper.
        } else {
          alpha = this.stepper.advance(dt, this.hud.speed.value, () => {
            // A hit-stop that began mid-frame pauses the remaining steps instead of eating them.
            if (this.world.phase === 'ended' || this.juice.hitStop > 0) return false;
            const before = this.world.runners.length;
            this.syncPrev(0);
            stepWorld(this.world);
            this.stats.observe(this.world);
            this.syncPrev(before);
            this.consumeEvents();
            return true;
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
          this.log(ev.side, '◈', this.cfg.cores[ev.side].name);
          this.synth.trigger(ev.side);
          if (ev.side === 0) this.buzz('light', 140);
          break;
        case 'ModTriggered': {
          const sig = this.hud.modTriggers[ev.side][ev.slot];
          if (sig) sig.value++;
          const pick = this.cfg.mods[ev.side][ev.slot];
          if (pick) this.log(ev.side, pick.mod.glyph, pick.mod.name);
          break;
        }
        case 'UltimateFired':
          if (ev.side === 0 && !ev.echo) this.ultimateStep = w.step;
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

  private log(side: SideIndex, glyph: string, label: string): void {
    const next = [...this.hud.log.value, { id: ++this.logId, side, glyph, label }];
    this.hud.log.value = next.length > LOG_LINES ? next.slice(next.length - LOG_LINES) : next;
  }

  /** Seconds until Quick Hands returns the ultimate, or 0 when it is not coming back. */
  private ultimateWait(): number {
    const w = this.world;
    if (this.ultimateStep < 0 || w.sides[0].ultimates > 0) return 0;
    const qh = this.cfg.mods[0].find((p) => p.mod.id === 'quick-hands');
    if (!qh) return 0;
    const i = Math.min(2, Math.max(0, qh.level - 1));
    if (w.sides[0].ultimatesUsed > QUICK_HANDS_CHARGES[i]!) return 0;
    return Math.max(0, Math.ceil(QUICK_HANDS_DELAY[i]! - (w.step - this.ultimateStep) / SPS));
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
    h.ultimateReady.value = !this.passive && canUltimate(w, 0);
    h.ultimateWait.value = this.ultimateWait();
  }
}
