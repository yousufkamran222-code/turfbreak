import { tuning } from './content/tuning';
import { FixedStepper } from './loop';
import { parseSave, SAVE_KEY, serializeSave } from './meta/save';
import { createPlatform } from './platform';
import { createDot, redirectDot, stepDot, type BounceConfig } from './sim/bounce';
import { Rng, Stream } from './sim/rng';

const cfg: BounceConfig = {
  arenaSize: tuning.sim.arenaSize,
  speed: tuning.runner.speed,
  radius: tuning.runner.bodyRadius,
  jitterRad: (tuning.runner.wallJitterDeg * Math.PI) / 180,
};

async function start(): Promise<void> {
  const platform = await createPlatform();
  await platform.init();

  const save = parseSave(await platform.storageGet(SAVE_KEY));
  save.launches++;
  await platform.storageSet(SAVE_KEY, serializeSave(save));

  const canvas = document.getElementById('arena') as HTMLCanvasElement;
  const maybeCtx = canvas.getContext('2d', { alpha: false });
  if (!maybeCtx) throw new Error('Canvas 2D is not available');
  const ctx: CanvasRenderingContext2D = maybeCtx;
  const info = document.getElementById('build-info') as HTMLElement;
  info.textContent = `Turfbreak v${__APP_VERSION__} · ${__APP_COMMIT__} · ${platform.id} · launch ${save.launches}`;

  const rng = new Rng(Date.now() >>> 0, Stream.sim);
  const dot = createDot(cfg, rng);
  let prevX = dot.x;
  let prevY = dot.y;
  const stepper = new FixedStepper(tuning.sim.stepsPerSecond, tuning.sim.maxStepsPerFrame);

  // Arena layout in CSS pixels: the largest centred square that fits.
  let scale = 1;
  let offX = 0;
  let offY = 0;
  function resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, tuning.render.maxDevicePixelRatio);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const side = Math.min(w, h) - 24;
    scale = side / cfg.arenaSize;
    offX = (w - side) / 2;
    offY = (h - side) / 2;
  }
  window.addEventListener('resize', resize);
  resize();

  canvas.addEventListener('pointerdown', (e) => {
    const x = (e.clientX - offX) / scale;
    const y = (e.clientY - offY) / scale;
    redirectDot(dot, x, y, cfg.speed);
    platform.haptic('light');
  });

  let paused = false;
  let last = performance.now();
  platform.onPause(() => {
    paused = true;
  });
  platform.onResume(() => {
    paused = false;
    last = performance.now();
    stepper.reset();
  });

  function frame(now: number): void {
    const elapsed = (now - last) / 1000;
    last = now;
    const alpha = paused
      ? 0
      : stepper.advance(elapsed, 1, () => {
          prevX = dot.x;
          prevY = dot.y;
          stepDot(dot, cfg, rng, stepper.dt);
        });
    draw(alpha);
    requestAnimationFrame(frame);
  }

  function draw(alpha: number): void {
    const c = ctx;
    c.fillStyle = '#0d0f14';
    c.fillRect(0, 0, window.innerWidth, window.innerHeight);
    c.strokeStyle = '#2a3040';
    c.lineWidth = 2;
    c.strokeRect(offX, offY, cfg.arenaSize * scale, cfg.arenaSize * scale);
    const x = prevX + (dot.x - prevX) * alpha;
    const y = prevY + (dot.y - prevY) * alpha;
    c.fillStyle = '#ff3b5c';
    c.beginPath();
    c.arc(offX + x * scale, offY + y * scale, cfg.radius * scale, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#8890a6';
    c.font = '14px system-ui, sans-serif';
    c.textAlign = 'center';
    c.fillText(`bounces ${dot.bounces} · tap to redirect`, window.innerWidth / 2, offY + cfg.arenaSize * scale + 18);
  }

  platform.loadingFinished();
  requestAnimationFrame(frame);
}

void start();
