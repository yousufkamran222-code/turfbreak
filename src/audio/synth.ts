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
  private sfx: GainNode | null = null;
  private music: GainNode | null = null;
  private musicVolume = 1;
  private sfxVolume = 1;
  private muted = false;
  private readonly hitIndex = [0, 0];
  private readonly lastHit = [-Infinity, -Infinity];
  private readonly lastTick = [-Infinity, -Infinity];
  private beatTimer: ReturnType<typeof setInterval> | null = null;
  private nextBeatTime = 0;
  private beatIndex = 0;
  private intense = false;
  private noiseBuffer: AudioBuffer | null = null;

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
        this.sfx = this.ctx.createGain();
        this.sfx.gain.value = this.sfxVolume;
        this.sfx.connect(this.master);
        this.music = this.ctx.createGain();
        this.music.gain.value = this.musicVolume;
        this.music.connect(this.master);
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

  /** Separate music (the beat) and effects volumes, each 0..1. */
  setVolumes(music: number, sfx: number): void {
    this.musicVolume = music;
    this.sfxVolume = sfx;
    if (this.ctx && this.music && this.sfx) {
      this.music.gain.setTargetAtTime(music, this.ctx.currentTime, 0.02);
      this.sfx.gain.setTargetAtTime(sfx, this.ctx.currentTime, 0.02);
    }
  }

  suspend(): void {
    void this.ctx?.suspend().catch(() => {});
  }

  resume(): void {
    void this.ctx?.resume().catch(() => {});
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0, bus: 'sfx' | 'music' = 'sfx'): void {
    const ctx = this.ctx;
    const out = bus === 'music' ? this.music : this.sfx;
    if (!ctx || !out || this.muted || ctx.state !== 'running') return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(out);
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

  /** A capture inside a streak: ticks climb the side's scale as the streak grows. */
  streakTick(side: SideIndex, streak: number): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastTick[side]! < tuning.audio.captureTickSeconds) return;
    this.lastTick[side] = now;
    const scale = SCALES[side]!;
    const step = Math.min(scale.length - 1, Math.floor(streak / 3));
    this.tone(midiToHz(scale[step]! + 12), 0.05, 'sine', 0.05 + Math.min(0.06, streak * 0.002));
  }

  /** A streak milestone (x10, x25...): a bright rising chord. */
  milestone(side: SideIndex, tier: number): void {
    const base = SCALES[side]![0]! + 12 * Math.min(1, tier);
    [0, 4, 7, 12].forEach((n, i) => this.tone(midiToHz(base + n), 0.35, 'triangle', 0.12, i * 0.04));
  }

  private noise(dur: number, gain: number, from: number, to: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfx || this.muted || ctx.state !== 'running') return;
    if (!this.noiseBuffer) {
      this.noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    const t = ctx.currentTime;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  /** The ultimate: a rising whoosh and a big chord. */
  ultimate(side: SideIndex): void {
    this.noise(0.7, 0.35, 300, 4000);
    const base = SCALES[side]![0]!;
    [0, 7, 12, 16, 19].forEach((n, i) => this.tone(midiToHz(base + n), 0.6, 'sawtooth', 0.06, 0.05 + i * 0.03));
  }

  shieldHit(): void {
    this.tone(1900, 0.06, 'triangle', 0.05);
  }

  teleport(): void {
    this.tone(1400, 0.08, 'sine', 0.1);
    this.tone(700, 0.12, 'sine', 0.1, 0.05);
  }

  blast(): void {
    this.noise(0.4, 0.3, 1200, 120);
    this.tone(60, 0.35, 'sine', 0.25);
  }

  launch(): void {
    this.noise(0.25, 0.2, 600, 2400);
    this.tone(523, 0.15, 'triangle', 0.15);
  }

  /** Start the generated beat. `setIntense` adds layers in the final seconds. */
  startBeat(): void {
    if (!this.ctx || this.beatTimer) return;
    this.nextBeatTime = this.ctx.currentTime + 0.05;
    this.beatIndex = 0;
    this.intense = false;
    // Look-ahead scheduling: queue the next 100 ms of sixteenth notes every 25 ms.
    this.beatTimer = setInterval(() => this.scheduleBeat(), 25);
  }

  stopBeat(): void {
    if (this.beatTimer) clearInterval(this.beatTimer);
    this.beatTimer = null;
  }

  setIntense(on: boolean): void {
    this.intense = on;
  }

  private scheduleBeat(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const sixteenth = 60 / tuning.audio.beatBpm / 4;
    while (this.nextBeatTime < ctx.currentTime + 0.1) {
      const delay = Math.max(0, this.nextBeatTime - ctx.currentTime);
      const i = this.beatIndex % 16;
      const v = tuning.audio.beatVolume;
      if (i % 4 === 0) this.kick(delay, v);
      if (i % 2 === 0 || this.intense) this.tone(9000, 0.03, 'square', 0.012 * v * (i % 4 === 2 ? 2 : 1), delay, 'music');
      if (this.intense && (i === 4 || i === 12)) this.tone(200, 0.12, 'triangle', 0.18 * v, delay, 'music');
      if (this.intense && i % 4 === 0) this.tone(midiToHz(45 + (i === 8 ? 5 : 0)), 0.2, 'sawtooth', 0.08 * v, delay, 'music');
      this.nextBeatTime += sixteenth;
      this.beatIndex++;
    }
  }

  private kick(delay: number, v: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.music || this.muted) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.5 * v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(g).connect(this.music);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  pickup(blast: boolean): void {
    [76, 81, 88].forEach((n, i) => this.tone(midiToHz(n), 0.16, 'triangle', 0.14, i * 0.05));
    if (blast) this.tone(70, 0.35, 'sawtooth', 0.12);
  }

  urgentTick(): void {
    this.tone(1200, 0.05, 'square', 0.06);
  }

  end(win: boolean): void {
    const notes = win ? [72, 76, 79, 84] : [72, 70, 67, 63];
    notes.forEach((n, i) => this.tone(midiToHz(n), 0.3, 'triangle', 0.18, i * 0.09));
  }
}
