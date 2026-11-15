import { useEffect, useRef, useState } from 'preact/hooks';
import type { Platform } from '../platform';
import type { CoreDef } from '../sim/abilities';
import type { EndReason } from '../sim/events';
import { Hud as HudView } from './Hud';
import { MatchSession } from './session';
import { sideLook } from './sides';

interface Props {
  platform: Platform;
  seed: number;
  cores: readonly [CoreDef, CoreDef];
  onRematch(): void;
  onNextSeed(): void;
  onBack(): void;
}

const reasonText: Record<EndReason, string> = {
  time: 'on time',
  suddenDeath: 'in sudden death',
  wipeout: 'by WIPEOUT',
};

export function MatchScreen({ platform, seed, cores, onRematch, onNextSeed, onBack }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [session, setSession] = useState<MatchSession | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const box = boxRef.current;
    if (!canvas || !box) return;
    const s = new MatchSession(canvas, { seed, cores });
    setSession(s);
    const fit = (): void => s.resize(Math.floor(Math.min(box.clientWidth, box.clientHeight)));
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    fit();
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
      offPause();
      offResume();
      offBack();
      platform.gameplayStop();
    };
    // The session is rebuilt by remounting (App keys this screen by seed and Cores).
  }, []);

  const looks = [sideLook(cores, 0), sideLook(cores, 1)] as const;
  const hud = session?.hud;
  const winner = hud?.winner.value ?? -1;
  const reason = hud?.endReason.value ?? null;

  return (
    <main class="match" style={{ '--side-a': looks[0].color, '--side-b': looks[1].color }}>
      {hud && <HudView hud={hud} cores={cores} looks={looks} />}
      <div class="arena-box" ref={boxRef}>
        <canvas ref={canvasRef} class="arena" />
        {hud && hud.countdown.value > 0 && <div class="countdown">READY</div>}
        {winner !== -1 && reason && (
          <div class="result">
            <div class="result-title" style={{ color: looks[winner].color }}>
              {looks[winner].name} WINS
            </div>
            <div class="result-sub">
              {reasonText[reason]} · {hud?.counts[0].value} to {hud?.counts[1].value} ·{' '}
              {hud?.leadChanges.value} lead changes
            </div>
            <div class="row">
              <button type="button" class="primary" onClick={onRematch}>
                Rematch
              </button>
              <button type="button" class="secondary" onClick={onNextSeed}>
                Next seed
              </button>
            </div>
          </div>
        )}
      </div>
      <footer class="match-footer">
        <button type="button" class="secondary small" onClick={onBack}>
          Back
        </button>
        <span class="seed">seed {seed}</span>
      </footer>
    </main>
  );
}
