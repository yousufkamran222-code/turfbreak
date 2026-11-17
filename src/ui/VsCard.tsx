import { useEffect, useRef, useState } from 'preact/hooks';
import { rulesFor } from '../content/ascension';
import { bosses } from '../content/bosses';
import type { RunState } from '../run/run';
import { useBack } from './back';
import { roundLabel } from './DraftScreen';
import type { ModPick } from '../sim/abilities';
import { buildPicks } from '../run/run';
import { findCore, Hearts, ModList, ShapeIcon } from './parts';
import { sideLook } from './sides';

/** The full text of one Mod, shown over the card of the side that owns it. */
function ModPop({ pick }: { pick: ModPick }) {
  return (
    <div class="mod-pop" role="dialog" aria-label={pick.mod.name}>
      <b>
        {pick.mod.glyph} {pick.mod.name} {pick.level}
      </b>
      <span>{pick.mod.text(pick.level)}</span>
    </div>
  );
}

const AUTO_START_MS = 2000;

/** The card before each match: both sides, their Mods, the round and the hearts. Starts itself after 2 s. */
export function VsCard({ run, onStart, onHome }: { run: RunState; onStart(): void; onHome(): void }) {
  const done = useRef(false);
  /** The Mod whose text is open, as "side:id". While it is open the card waits instead of starting. */
  const [pop, setPop] = useState<string | null>(null);
  const go = (): void => {
    if (done.current) return;
    done.current = true;
    onStart();
  };
  useEffect(() => {
    if (pop) return;
    const t = setTimeout(go, AUTO_START_MS);
    return () => clearTimeout(t);
  }, [pop]);
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
  const popSide = pop?.startsWith('0:') ? 0 : 1;
  const popPick = pop ? buildPicks(pop.startsWith('0:') ? run.build : rival.mods).find((p) => p.mod.id === pop.slice(2)) : undefined;

  return (
    <main class="screen vs" onClick={() => (pop ? setPop(null) : go())}>
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
        {popPick && popSide === 0 && <ModPop pick={popPick} />}
        <ModList build={run.build} active={pop?.startsWith('0:') ? pop.slice(2) : null} onTap={(id) => setPop(pop === `0:${id}` ? null : `0:${id}`)} />
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
        {popPick && popSide === 1 && <ModPop pick={popPick} />}
        <ModList build={rival.mods} active={pop?.startsWith('1:') ? pop.slice(2) : null} onTap={(id) => setPop(pop === `1:${id}` ? null : `1:${id}`)} />
      </section>

      <div class="start-hint">
        {pop ? 'Tap to close' : 'Tap to start'}
        {!pop && <span class="auto-bar" aria-hidden="true" />}
      </div>
    </main>
  );
}
