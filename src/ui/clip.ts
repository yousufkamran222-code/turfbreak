/**
 * Clip export: a rolling recording of the arena canvas, so "Save clip" can hand
 * over roughly the last 15 seconds. A WebM cannot be trimmed from the front
 * (only its first chunk carries the headers), so two recorders run staggered
 * by half a window, each restarted when it is a full window old; the older one
 * holds 8 to 16 seconds when asked. Every call is guarded: if anything is
 * unsupported or throws, the match carries on and the button stays hidden.
 */
const WINDOW_MS = 16_000;
const MIMES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];

interface Slot {
  rec: MediaRecorder;
  chunks: Blob[];
  startedAt: number;
}

export class ClipRecorder {
  private slots: (Slot | null)[] = [null, null];
  private tick = 0;
  private timer: number | undefined;
  private stream: MediaStream | null = null;

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly mime: string,
  ) {}

  /** A recorder for this canvas, or null when the browser cannot record one. */
  static create(canvas: HTMLCanvasElement): ClipRecorder | null {
    try {
      if (typeof MediaRecorder === 'undefined' || typeof canvas.captureStream !== 'function') return null;
      const mime = MIMES.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
      if (!mime) return null;
      return new ClipRecorder(canvas, mime);
    } catch {
      return null;
    }
  }

  start(): void {
    try {
      this.stream = this.canvas.captureStream(30);
      this.rotate();
      this.timer = window.setInterval(() => this.rotate(), WINDOW_MS / 2);
    } catch {
      this.stop();
    }
  }

  private rotate(): void {
    const i = this.tick++ % 2;
    this.discard(i);
    try {
      if (!this.stream) return;
      const rec = new MediaRecorder(this.stream, { mimeType: this.mime, videoBitsPerSecond: 1_500_000 });
      const slot: Slot = { rec, chunks: [], startedAt: performance.now() };
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) slot.chunks.push(e.data);
      };
      rec.onerror = () => this.discard(i);
      rec.start(1000);
      this.slots[i] = slot;
    } catch {
      this.slots[i] = null;
    }
  }

  private discard(i: number): void {
    const s = this.slots[i];
    this.slots[i] = null;
    if (!s) return;
    try {
      s.rec.ondataavailable = null;
      if (s.rec.state !== 'inactive') s.rec.stop();
    } catch {
      // Already stopped.
    }
  }

  /** Stop recording and drop everything. */
  stop(): void {
    window.clearInterval(this.timer);
    this.discard(0);
    this.discard(1);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  /** Stop and return the longest recording as a WebM, or null if there is none. Recording ends for good. */
  async save(): Promise<Blob | null> {
    const live = this.slots.filter((s): s is Slot => s !== null).sort((a, b) => a.startedAt - b.startedAt);
    window.clearInterval(this.timer);
    const best = live[0];
    if (!best) return null;
    try {
      const done = new Promise<void>((resolve) => {
        best.rec.onstop = () => resolve();
        // Never hang: a recorder that does not stop in 3 s is abandoned.
        window.setTimeout(resolve, 3000);
      });
      if (best.rec.state !== 'inactive') {
        best.rec.requestData();
        best.rec.stop();
      }
      await done;
      const blob = new Blob(best.chunks, { type: this.mime.split(';')[0] ?? 'video/webm' });
      return blob.size > 0 ? blob : null;
    } catch {
      return null;
    } finally {
      this.stop();
    }
  }
}
