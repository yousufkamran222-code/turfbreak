import { tuning } from '../content/tuning';
import type { SideIndex } from '../sim/world';

/** Pentatonic scales as MIDI note numbers, one per side, so the two sides sound different. */
const SCALES: readonly (readonly number[])[] = [
  [72, 74, 76, 79, 81, 84, 86, 88, 91, 93],
  [69, 72, 74, 76, 79, 81, 84, 86, 88, 91],
];

const midiToHz = (m: number): number => 440 * 2 ** ((m - 69) / 12);

/**
 * Everything is synthesised with WebAudio (MASTER_PROMPT 6.3); there are no
 * audio files. The context starts only after a user gesture.
 */
export class Synth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;
  private readonly hitIndex = [0, 0];
  private readonly lastHit = [-Infinity, -Infinity];
  private readonly lastTick = [-Infinity, -Infinity];

  /** Call from a user gesture (a tap or click handler). */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : tuning.audio.masterVolume;
        this.master.connect(this.ctx.destination);
      }
      void this.ctx.resume();
    } catch {
      // Audio is optional; the game runs silently without it.
    }
  }

  get isMuted(): boolean {
    return this.muted;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : tuning.audio.masterVolume, this.ctx.currentTime, 0.02);
  }

  suspend(): void {
    void this.ctx?.suspend().catch(() => {});
  }

  resume(): void {
    void this.ctx?.resume().catch(() => {});
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted || ctx.state !== 'running') return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** Consecutive hits climb the side's scale, so a build firing fast is heard as a rising run. */
  hit(side: SideIndex): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastHit[side]! > tuning.audio.hitResetSeconds) this.hitIndex[side] = 0;
    this.lastHit[side] = now;
    const scale = SCALES[side]!;
    const i = Math.min(this.hitIndex[side]!, scale.length - 1);
    this.hitIndex[side]!++;
    this.tone(midiToHz(scale[i]!), 0.22, 'triangle', 0.22);
  }

  capture(side: SideIndex): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastTick[side]! < tuning.audio.captureTickSeconds) return;
    this.lastTick[side] = now;
    this.tone(side === 0 ? 1760 : 1480, 0.03, 'sine', 0.05);
  }

  clash(): void {
    this.tone(110, 0.18, 'square', 0.12);
    this.tone(220, 0.1, 'triangle', 0.1);
  }

  trigger(side: SideIndex): void {
    const base = SCALES[side]![0]!;
    this.tone(midiToHz(base + 12), 0.25, 'sine', 0.12);
    this.tone(midiToHz(base + 19), 0.25, 'sine', 0.08, 0.04);
  }

  redirect(): void {
    this.tone(660, 0.08, 'sine', 0.12);
    this.tone(990, 0.1, 'sine', 0.1, 0.05);
  }

  urgentTick(): void {
    this.tone(1200, 0.05, 'square', 0.06);
  }

  end(win: boolean): void {
    const notes = win ? [72, 76, 79, 84] : [72, 70, 67, 63];
    notes.forEach((n, i) => this.tone(midiToHz(n), 0.3, 'triangle', 0.18, i * 0.09));
  }
}
