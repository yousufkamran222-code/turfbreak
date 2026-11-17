import { useEffect, useRef } from 'preact/hooks';
import { rulesFor } from '../content/ascension';
import { bosses } from '../content/bosses';
import type { RunState } from '../run/run';
import { useBack } from './back';
import { roundLabel } from './DraftScreen';
import { findCore, Hearts, ShapeIcon, BuildRow } from './parts';
import { sideLook } from './sides';

const AUTO_START_MS = 2000;

/** The card before each match: both sides, their Mods, the round and the hearts. Starts itself after 2 s. */
export function VsCard({ run, onStart, onHome }: { run: RunState; onStart(): void; onHome(): void }) {
  const done = useRef(false);
  const go = (): void => {
    if (done.current) return;
    done.current = true;
    onStart();
  };
  useEffect(() => {
    const t = setTimeout(go, AUTO_START_MS);
    return () => clearTimeout(t);
  }, []);
  useBack(() => {
    done.current = true;
    onHome();
    return true;
  });

  const rival = run.rival;
  const mine = findCore(run.coreId);
  const theirs = rival ? findCore(rival.coreId) : undefined;
  if (!rival || !mine || !theirs) return null;
  const looks = [sideLook([mine, theirs], 0), sideLook([mine, theirs], 1)] as const;
  const boss = rival.bossId ? bosses.find((b) => b.id === rival.bossId) : undefined;
  const rules = rulesFor(run.ascension);

  return (
    <main class="screen vs" onClick={go}>
      <header class="vs-head">
        <Hearts hearts={run.hearts} max={rules.hearts} />
        <h2>{roundLabel(run)}</h2>
      </header>

      <section class="vs-side you" style={{ '--c': looks[0].color }}>
        <ShapeIcon shape={mine.shape} color={looks[0].color} size={64} />
        <div class="vs-name" style={{ color: looks[0].color }}>
          {looks[0].name}
        </div>
        <div class="vs-tag">YOU</div>
        <BuildRow build={run.build} size="md" />
      </section>

      <div class="vs-mid">VS</div>

      <section class={`vs-side them ${boss ? 'boss' : ''}`} style={{ '--c': looks[1].color }}>
        {boss && <div class="boss-tag">BOSS</div>}
        <ShapeIcon shape={theirs.shape} color={looks[1].color} size={64} />
        <div class="vs-name" style={{ color: looks[1].color }}>
          {rival.name}
        </div>
        {boss ? (
          <div class="twist">{boss.description}</div>
        ) : (
          <div class="vs-tag">RIVAL</div>
        )}
        <BuildRow build={rival.mods} size="md" />
      </section>

      <div class="start-hint">
        Tap to start
        <span class="auto-bar" aria-hidden="true" />
      </div>
    </main>
  );
}
