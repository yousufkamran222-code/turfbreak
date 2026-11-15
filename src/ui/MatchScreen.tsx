import { useEffect, useRef, useState } from 'preact/hooks';
import type { Synth } from '../audio/synth';
import type { InputVariant } from '../content/inputs';
import type { Platform } from '../platform';
import type { CoreDef } from '../sim/abilities';
import type { EndReason } from '../sim/events';
import type { ControllerSpec } from '../sim/input';
import { Hud as HudView } from './Hud';
import { MatchSession } from './session';
import { sideLook } from './sides';

interface Props {
  platform: Platform;
  synth: Synth;
  muted: boolean;
  onToggleMute(): void;
  seed: number;
  cores: readonly [CoreDef, CoreDef];
  variant: InputVariant;
  rival: ControllerSpec | null;
  assist: ControllerSpec | null;
  onRematch(): void;
  onNextSeed(): void;
  onBack(): void;
}

const reasonText: Record<EndReason, string> = {
  time: 'on time',
  suddenDeath: 'in sudden death',
  wipeout: 'by WIPEOUT',
};

export function MatchScreen(props: Props) {
  const { platform, synth, seed, cores, variant, rival, assist, onRematch, onNextSeed, onBack } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [session, setSession] = useState<MatchSession | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const box = boxRef.current;
    if (!canvas || !box) return;
    const s = new MatchSession(canvas, { seed, cores, variant, rival, assist }, synth);
    setSession(s);
    const fit = (): void => s.resize(Math.floor(Math.min(box.clientWidth, box.clientHeight)));
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    fit();

    // Arena input: a press redirects.
    const toArena = (e: PointerEvent): [number, number] => {
      const rect = canvas.getBoundingClientRect();
      const size = s.world.arena.size;
      return [((e.clientX - rect.left) / rect.width) * size, ((e.clientY - rect.top) / rect.height) * size];
    };
    const down = (e: PointerEvent): void => {
      e.preventDefault();
      synth.unlock();
      const [x, y] = toArena(e);
      s.press(x, y);
    };
    canvas.addEventListener('pointerdown', down);

    s.start();
    platform.gameplayStart();
    const offPause = platform.onPause(() => s.setPaused(true));
    const offResume = platform.onResume(() => s.setPaused(false));
    const offBack = platform.onBack(() => {
      onBack();
      return true;
    });
    return () => {
      s.stop();
      ro.disconnect();
      canvas.removeEventListener('pointerdown', down);
      offPause();
      offResume();
      offBack();
      platform.gameplayStop();
    };
    // The session is rebuilt by remounting: App gives every match a fresh key.
  }, []);

  const looks = [sideLook(cores, 0), sideLook(cores, 1)] as const;
  const hud = session?.hud;
  const winner = hud?.winner.value ?? -1;
  const reason = hud?.endReason.value ?? null;
  const gauge = hud?.gauge.value ?? 1;
  const ready = hud?.gaugeReady.value ?? true;
  const gaugeLabel =
    variant.mode === 'redirect' ? (ready ? 'REDIRECT READY' : 'RECHARGING') : '';

  return (
    <main class="match" style={{ '--side-a': looks[0].color, '--side-b': looks[1].color }}>
      {hud && <HudView hud={hud} cores={cores} looks={looks} />}
      <div class="arena-box" ref={boxRef}>
        <canvas ref={canvasRef} class="arena" />
        {hud && hud.countdown.value > 0 && <div class="countdown">READY</div>}
        {hud?.prompt.value && variant.prompt && <div class="prompt">{variant.prompt}</div>}
        {winner !== -1 && reason && (
          <div class="result">
            <div class="result-title" style={{ color: looks[winner].color }}>
              {winner === 0 ? 'YOU WIN' : 'YOU LOSE'}
            </div>
            <div class="result-name">{looks[winner].name} WINS</div>
            <div class="result-sub">
              {reasonText[reason]} · {hud?.counts[0].value} to {hud?.counts[1].value} · {hud?.leadChanges.value} lead changes
            </div>
            <div class="row">
              <button type="button" class="primary" onClick={onRematch}>
                Rematch
              </button>
              <button type="button" class="secondary" onClick={onNextSeed}>
                New seed
              </button>
            </div>
          </div>
        )}
      </div>
      {variant.mode !== 'none' && (
        <div class={`gauge ${ready ? 'ready' : ''}`} aria-label={gaugeLabel}>
          <div class="gauge-fill" style={{ width: `${Math.round(gauge * 100)}%` }} />
          <span class="gauge-label">{assist ? `${gaugeLabel} · ASSIST` : gaugeLabel}</span>
        </div>
      )}
      <footer class="match-footer">
        <button type="button" class="secondary small" onClick={onBack}>
          Back
        </button>
        <span class="seed">
          seed {seed} · {variant.name}
        </span>
        <div class="row">
          <button type="button" class="secondary small" onClick={props.onToggleMute} aria-label="Toggle sound">
            {props.muted ? 'Sound off' : 'Sound on'}
          </button>
          <button type="button" class="secondary small" onClick={() => session?.toggleSpeed()}>
            {hud?.speed.value ?? 1}x
          </button>
        </div>
      </footer>
    </main>
  );
}
