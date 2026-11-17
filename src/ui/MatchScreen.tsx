import { useEffect, useRef, useState } from 'preact/hooks';
import type { Synth } from '../audio/synth';
import type { Platform } from '../platform';
import type { EndReason } from '../sim/events';
import type { SideIndex } from '../sim/world';
import { useBack } from './back';
import type { MatchOutcome } from './game';
import { Hud as HudView } from './Hud';
import { MatchSession, type SessionConfig } from './session';
import { sideLook } from './sides';

interface Props {
  platform: Platform;
  synth: Synth;
  muted: boolean;
  onToggleMute(): void;
  /** The match to play: seed, Cores, Mods, controllers and any boss twist. */
  config: SessionConfig;
  /** Shown above the arena, e.g. "ROUND 3 / 10". */
  title?: string;
  /** Result buttons: label and action. The first is the primary action. */
  actions: readonly { label: string; run(outcome: MatchOutcome): void }[];
  /** A line under the result, e.g. the heart lost. */
  note?: (winner: SideIndex) => string;
  /** Leave the match from the pause overlay (the second button). */
  quitLabel?: string;
  onQuit(): void;
}

const reasonText: Record<EndReason, string> = {
  time: 'on time',
  suddenDeath: 'in sudden death',
  wipeout: 'by WIPEOUT',
};

export function MatchScreen(props: Props) {
  const { platform, synth, config, actions } = props;
  const { seed, cores, mods, assist } = config;
  const [paused, setPausedState] = useState(false);
  const pausedRef = useRef(false);
  const sessionRef = useRef<MatchSession | null>(null);
  const setPause = (p: boolean): void => {
    pausedRef.current = p;
    setPausedState(p);
    sessionRef.current?.setPaused(p);
    if (p) platform.gameplayStop();
    else platform.gameplayStart();
  };
  useBack(() => {
    setPause(!pausedRef.current);
    return true;
  });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [session, setSession] = useState<MatchSession | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const box = boxRef.current;
    if (!canvas || !box) return;
    const s = new MatchSession(canvas, config, synth);
    sessionRef.current = s;
    setSession(s);
    const fit = (): void => s.resize(Math.floor(Math.min(box.clientWidth, box.clientHeight)));
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    fit();

    // Aiming: drag anywhere on the arena to point the launch, lift to launch.
    const toArena = (e: PointerEvent): [number, number] => {
      const rect = canvas.getBoundingClientRect();
      const size = s.world.arena.size;
      return [((e.clientX - rect.left) / rect.width) * size, ((e.clientY - rect.top) / rect.height) * size];
    };
    let dragging = false;
    const down = (e: PointerEvent): void => {
      e.preventDefault();
      synth.unlock();
      if (s.hud.stage.value !== 'aiming') return;
      dragging = true;
      s.aimAt(...toArena(e));
    };
    const move = (e: PointerEvent): void => {
      if (dragging) s.aimAt(...toArena(e));
    };
    const up = (): void => {
      if (!dragging) return;
      dragging = false;
      s.launch();
    };
    canvas.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);

    s.start();
    platform.gameplayStart();
    // Backgrounding opens the pause overlay; the player resumes from it.
    const offPause = platform.onPause(() => {
      if (!pausedRef.current) setPause(true);
    });
    return () => {
      s.stop();
      ro.disconnect();
      canvas.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      offPause();
      sessionRef.current = null;
      platform.gameplayStop();
    };
    // The session is rebuilt by remounting: every match gets a fresh key.
  }, []);

  const looks = [sideLook(cores, 0), sideLook(cores, 1)] as const;
  const hud = session?.hud;
  const stage = hud?.stage.value ?? 'aiming';
  const winner = hud?.winner.value ?? -1;
  const reason = hud?.endReason.value ?? null;
  const banner = hud?.ultimateBanner.value ?? null;
  const ready = hud?.ultimateReady.value ?? false;

  return (
    <main class="match" style={{ '--side-a': looks[0].color, '--side-b': looks[1].color }}>
      {props.title && <div class="match-title">{props.title}</div>}
      {hud && <HudView hud={hud} cores={cores} looks={looks} mods={mods} />}
      <div class="arena-box" ref={boxRef}>
        <canvas ref={canvasRef} class="arena" />
        {stage === 'aiming' && !assist && (
          <div class="prompt">
            Drag to aim · release to launch
            <span class="aim-left">{hud?.aimLeft.value}</span>
          </div>
        )}
        {banner && stage === 'playing' && (
          <div key={banner.n} class="ult-banner" style={{ color: looks[banner.side].color }}>
            {looks[banner.side].name} · {cores[banner.side].ultimate.name.toUpperCase()}!
          </div>
        )}
        {stage === 'result' && winner !== -1 && reason && (
          <div class="result">
            <div class="result-title" style={{ color: looks[winner].color }}>
              {winner === 0 ? 'YOU WIN' : 'YOU LOSE'}
            </div>
            <div class="result-name">{looks[winner].name} WINS</div>
            <div class="result-sub">
              {reasonText[reason]} · {hud?.counts[0].value} to {hud?.counts[1].value} · {hud?.leadChanges.value} lead changes
            </div>
            {props.note && <div class="result-note">{props.note(winner as SideIndex)}</div>}
            <div class="row">
              {actions.map((a, i) => (
                <button
                  key={a.label}
                  type="button"
                  class={i === 0 ? 'primary' : 'secondary'}
                  onClick={() =>
                    a.run({
                      winner: winner as SideIndex,
                      margin: Math.abs((hud?.counts[0].value ?? 0) - (hud?.counts[1].value ?? 0)),
                      wipeout: reason === 'wipeout',
                    })
                  }
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {!assist && (
        <button
          type="button"
          class={`ultimate ${ready && stage === 'playing' ? 'ready' : ''}`}
          disabled={!ready || stage !== 'playing'}
          onClick={() => session?.fireUltimate()}
        >
          <span class="ult-name">{cores[0].ultimate.name.toUpperCase()}</span>
          <span class="ult-desc">{ready ? cores[0].ultimate.description : 'Used'}</span>
        </button>
      )}
      <footer class="match-footer">
        <button type="button" class="secondary small" id="pause" onClick={() => setPause(true)}>
          Pause
        </button>
        <span class="seed">seed {seed}</span>
        <div class="row">
          <button type="button" class="secondary small" onClick={props.onToggleMute} aria-label="Toggle sound">
            {props.muted ? 'Muted' : 'Sound'}
          </button>
          <button type="button" class="secondary small" onClick={() => session?.toggleSpeed()}>
            {hud?.speed.value ?? 1}x
          </button>
        </div>
      </footer>
      {paused && (
        <div class="overlay" role="dialog" aria-label="Paused">
          <div class="sheet">
            <h3>PAUSED</h3>
            <button type="button" class="primary" id="resume" onClick={() => setPause(false)}>
              Resume
            </button>
            <button type="button" class="secondary" id="quit" onClick={props.onQuit}>
              {props.quitLabel ?? 'Quit match'}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
