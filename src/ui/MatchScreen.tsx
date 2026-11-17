import { useEffect, useRef, useState } from 'preact/hooks';
import type { Synth } from '../audio/synth';
import type { Platform } from '../platform';
import type { EndReason } from '../sim/events';
import type { SideIndex } from '../sim/world';
import { useBack } from './back';
import { ClipRecorder } from './clip';
import type { MatchOutcome } from './game';
import { Hud as HudView } from './Hud';
import { MatchSession, type SessionConfig } from './session';
import { sideLook } from './sides';
import { SidePanel } from './SidePanels';
import { tuning } from '../content/tuning';
import { replayCodeOf, replayUrl, resultLabel, shareOrCopy, useFlash } from './share';

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
  /** Speeds the footer button cycles through. Default 1x and 2x. */
  speeds?: readonly (1 | 2 | 4)[];
  /** Show a "Skip" button that runs the match to its end. */
  skip?: boolean;
  /** A replay: banner on top and a neutral result (no "you"). */
  replay?: boolean;
  /** Neutral result wording for matches the player did not play (Versus Lab). */
  neutral?: boolean;
  /** Offer replay code and clip buttons on the result. Default true. */
  exportable?: boolean;
  /** Show the seed in the footer (Debug quick match and Versus Lab only). */
  showSeed?: boolean;
}

const reasonText: Record<EndReason, string> = {
  time: 'on time',
  suddenDeath: 'in sudden death',
  wipeout: 'by WIPEOUT',
};

export function MatchScreen(props: Props) {
  const { platform, synth, config, actions } = props;
  const { seed, cores, mods } = config;
  const passive = !!config.assist || !!config.inputs;
  const neutral = !!props.neutral || !!props.replay;
  const speeds = props.speeds ?? [1, 2];
  const clipRef = useRef<ClipRecorder | null>(null);
  const clipBlob = useRef<Blob | null>(null);
  const [clipOk, setClipOk] = useState(false);
  const [flash, setFlash] = useFlash();
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
    // Clip export is optional: any failure just leaves the button hidden.
    if (platform.canShareFiles && props.exportable !== false && !props.replay) {
      const clip = ClipRecorder.create(canvas);
      if (clip) {
        clip.start();
        clipRef.current = clip;
        setClipOk(true);
      }
    }
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
      clipRef.current?.stop();
      clipRef.current = null;
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
  const wait = hud?.ultimateWait.value ?? 0;
  const ult = cores[0].ultimate;
  const ultReady = ready && !paused && !hud?.tactical.value && stage === 'playing';
  const ultSub = ultReady ? ult.description : stage === 'aiming' ? 'Ready after launch' : wait > 0 ? `Ready in ${wait}s` : 'Used';
  const ultName = ultReady ? `TAP: ${ult.name.toUpperCase()}` : ult.name.toUpperCase();
  const tags = props.neutral || props.replay ? (['SIDE A', 'SIDE B'] as const) : (['YOU', 'RIVAL'] as const);

  const exportCode = (): { code: string; url: string | null } | null => {
    if (!session) return null;
    const code = replayCodeOf(session.replayData());
    return { code, url: replayUrl(platform, code) };
  };
  const copyCode = async (): Promise<void> => {
    const x = exportCode();
    if (!x) return;
    setFlash((await platform.copy(x.code)) ? 'Code copied!' : "Couldn't copy");
  };
  const shareReplay = async (): Promise<void> => {
    const x = exportCode();
    if (!x) return;
    const text = `Turfbreak replay: ${looks[0].name} vs ${looks[1].name}.`;
    setFlash(resultLabel[await shareOrCopy(platform, { text: x.url ? text : `${text}\nCode: ${x.code}`, url: x.url ?? undefined })]);
  };
  const saveClip = async (): Promise<void> => {
    try {
      setFlash('Saving…');
      if (!clipBlob.current) clipBlob.current = (await clipRef.current?.save()) ?? null;
      if (!clipBlob.current) return setFlash('No clip to save');
      setFlash((await platform.share({ file: clipBlob.current, fileName: `turfbreak-${seed}.webm`, text: 'Turfbreak clip' })) ? 'Clip saved!' : "Couldn't save");
    } catch {
      setFlash("Couldn't save");
    }
  };

  return (
    <main class="match-wrap" style={{ '--side-a': looks[0].color, '--side-b': looks[1].color }}>
      {hud && <SidePanel hud={hud} side={0} core={cores[0]} look={looks[0]} mods={mods[0]} tag={tags[0]} />}
      <div class="match">
      {props.replay && <div class="replay-banner">REPLAY</div>}
      {props.title && <div class="match-title">{props.title}</div>}
      {hud && <HudView hud={hud} cores={cores} looks={looks} mods={mods} />}
      <div class="arena-box" ref={boxRef}>
        <canvas ref={canvasRef} class="arena" />
        {banner && stage === 'playing' && (
          <div key={banner.n} class="ult-banner" style={{ color: looks[banner.side].color }}>
            {looks[banner.side].name} · {cores[banner.side].ultimate.name.toUpperCase()}!
          </div>
        )}
        {stage === 'result' && winner !== -1 && reason && (
          <div class="result">
            <div class="result-title" style={{ color: looks[winner].color }}>
              {neutral ? `${looks[winner].name} WINS` : winner === 0 ? 'YOU WIN' : 'YOU LOSE'}
            </div>
            {!neutral && <div class="result-name">{looks[winner].name} WINS</div>}
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
                      summary: session ? session.stats.summary(session.world) : undefined,
                    })
                  }
                >
                  {a.label}
                </button>
              ))}
            </div>
            {props.exportable !== false && (
              <div class="row export">
                <button type="button" class="secondary small" id="copy-code" onClick={() => void copyCode()}>
                  Copy code
                </button>
                <button type="button" class="secondary small" id="share-replay" onClick={() => void shareReplay()}>
                  Share replay
                </button>
                {clipOk && (
                  <button type="button" class="secondary small" id="save-clip" onClick={() => void saveClip()}>
                    Save clip
                  </button>
                )}
              </div>
            )}
            {flash && <div class="flash-note" role="status">{flash}</div>}
          </div>
        )}
      </div>
      {hud?.tactical.value && !paused && (
        <section class="tactical-panel" aria-label="Halftime tactical choice">
          <strong>HALFTIME · CHOOSE A BOOST</strong>
          <p>The match is paused. Inspect the arena, then choose.</p>
          <div class="row">
            <button type="button" onClick={() => session?.chooseTactical('speed')}>Speed +20% · 6s</button>
            <button type="button" onClick={() => session?.chooseTactical('shield')}>Shield · 3s</button>
            <button type="button" onClick={() => session?.chooseTactical('recharge')}>Ultimate ready</button>
          </div>
        </section>
      )}
      {!passive && (
        <div class="aim-row" aria-live="polite">
          {stage === 'aiming' && (
            <>
              <span>Drag to aim · release to launch</span>
              <svg class="aim-ring" viewBox="0 0 24 24" aria-label={`Launching in ${hud?.aimLeft.value ?? tuning.match.aimSeconds}`}>
                <circle cx="12" cy="12" r="9" class="track" />
                <circle cx="12" cy="12" r="9" class="fill" style={{ animationDuration: `${tuning.match.aimSeconds}s` }} />
              </svg>
            </>
          )}
        </div>
      )}
      {!passive && (
        <button
          type="button"
          class={`ultimate ${ultReady ? 'ready' : stage === 'aiming' ? 'pending' : 'spent'}`}
          disabled={!ultReady}
          onClick={() => session?.fireUltimate()}
        >
          <span class="ult-name">{ultName}</span>
          <span class="ult-desc">{ultSub}</span>
          {config.ruleset === 'recharge' && <progress aria-label="Ultimate charge" max={1} value={hud?.rechargeProgress.value ?? 1} />}
        </button>
      )}
      <footer class="match-footer">
        <button type="button" class="secondary small" id="pause" onClick={() => setPause(true)}>
          Pause
        </button>
        <span class="seed">{props.showSeed ? `seed ${seed}` : ''}</span>
        <div class="row">
          <button type="button" class="secondary small" onClick={props.onToggleMute} aria-label="Toggle sound">
            {props.muted ? 'Muted' : 'Sound'}
          </button>
          <button type="button" class="secondary small" id="speed" onClick={() => session?.toggleSpeed(speeds)}>
            {hud?.speed.value ?? 1}x
          </button>
          {props.skip && stage !== 'result' && stage !== 'freeze' && (
            <button type="button" class="secondary small" id="skip" onClick={() => session?.skipToEnd()}>
              Skip
            </button>
          )}
        </div>
      </footer>
      </div>
      {hud && <SidePanel hud={hud} side={1} core={cores[1]} look={looks[1]} mods={mods[1]} tag={tags[1]} log />}
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
