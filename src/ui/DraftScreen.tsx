import { useEffect, useState } from 'preact/hooks';
import { rulesFor } from '../content/ascension';
import { mods } from '../content/mods';
import { MAX_MODS, type RunState } from '../run/run';
import type { ModDef } from '../sim/abilities';
import { useBack } from './back';
import { BuildRow, Hearts, ModIcon } from './parts';

interface Props {
  run: RunState;
  onPick(modId: string | null): void;
  onReroll(): void;
  onReplace(modId: string, slot: number): void;
  onHome(): void;
  /** Offer the rewarded reroll (the platform has ads, not the first run, not the Daily). */
  adReroll?: boolean;
  onAdReroll?(): void;
  /** The one-line hint under the buttons was already shown on an earlier draft. */
  hintSeen?: boolean;
  onHintSeen?(): void;
}

export function roundLabel(run: RunState): string {
  const total = rulesFor(run.ascension).rounds;
  return run.endless ? `ROUND ${run.round} · ENDLESS` : `ROUND ${run.round} / ${total}`;
}

/** What the last match was, as one line above the draft (the "result" half of Result and draft). */
function lastResult(run: RunState): string | null {
  const h = run.history[run.history.length - 1];
  if (!h) return null;
  if (h.won) return h.wipeout ? `WIPEOUT vs ${h.rivalName}!` : `Won by ${h.margin} cells vs ${h.rivalName}`;
  return `Lost by ${h.margin} cells to ${h.rivalName}. Heart lost.`;
}

/** Pick 1 of the offered Mods, reroll, skip, or (with a full build) choose which Mod to replace. */
export function DraftScreen({ run, onPick, onReroll, onReplace, onHome, adReroll = false, onAdReroll, hintSeen = true, onHintSeen }: Props) {
  // Shown for the whole first draft (rerolls included), then never again.
  const [showHint] = useState(!hintSeen);
  useEffect(() => {
    if (showHint) onHintSeen?.();
  }, []);
  const [replacing, setReplacing] = useState<ModDef | null>(null);
  useBack(() => {
    if (replacing) setReplacing(null);
    else onHome();
    return true;
  });
  const rules = rulesFor(run.ascension);
  const offer = run.offer.map((id) => mods.find((m) => m.id === id)).filter((m): m is ModDef => !!m);
  const full = run.build.length >= MAX_MODS;
  const last = lastResult(run);

  const choose = (m: ModDef): void => {
    const owned = run.build.some((e) => e.id === m.id);
    if (!owned && full) setReplacing(m);
    else onPick(m.id);
  };

  return (
    <main class="screen draft-screen">
      <header class="run-head">
        <h2>{roundLabel(run)}</h2>
        <div class="run-sub">
          <Hearts hearts={run.hearts} max={rules.hearts} />
          <span class="rerolls" aria-label={`${run.rerolls} rerolls`}>
            ⟳ {run.rerolls} {run.rerolls === 1 ? 'reroll' : 'rerolls'}
          </span>
        </div>
      </header>
      {last && <p class={`last ${run.history[run.history.length - 1]?.won ? 'won' : 'lost'}`}>{last}</p>}
      {run.round === 1 && run.build.length === 0 ? (
        <p class="lede center">Pick a Mod. It stays for the whole run.</p>
      ) : (
        <p class="lede center">Pick a Mod{full ? ' (build full: a new one replaces another)' : ''}.</p>
      )}

      <div class="cards">
        {offer.map((m) => {
          const owned = run.build.find((e) => e.id === m.id);
          const level = owned ? owned.level + 1 : 1;
          return (
            <button key={m.id} type="button" class={`mod-card ${m.rarity}`} onClick={() => choose(m)} data-mod={m.id}>
              <span class="mod-glyph">{m.glyph}</span>
              <span class="mod-name">
                {m.name}
                {owned ? (
                  <em>
                    {' '}
                    Lv {owned.level} → {level}
                  </em>
                ) : (
                  <em class="new"> NEW</em>
                )}
              </span>
              <span class="mod-text">{m.text(level)}</span>
              <span class="mod-tags">
                <i class={`rar ${m.rarity}`}>{m.rarity}</i> · {m.group}
              </span>
            </button>
          );
        })}
      </div>

      <div class="draft-actions">
        <button type="button" class="secondary" id="reroll" disabled={run.rerolls <= 0} onClick={onReroll}>
          Reroll ({run.rerolls})
        </button>
        <button type="button" class="secondary" id="skip" onClick={() => onPick(null)}>
          Skip (+{rules.skipRerolls} reroll{rules.skipRerolls === 1 ? '' : 's'})
        </button>
      </div>
      {adReroll && (
        <div class="draft-actions ad">
          <button type="button" class="secondary" id="ad-reroll" onClick={onAdReroll}>
            ▶ Free reroll (ad)
          </button>
        </div>
      )}
      {showHint && <p class="draft-hint">Reroll: new offers. Skip: take nothing, gain a reroll.</p>}

      <section class="build-panel" aria-label="Your build">
        <span class="muted">Your build {run.build.length}/{MAX_MODS}</span>
        <BuildRow build={run.build} slots />
      </section>

      {replacing && (
        <div class="overlay" role="dialog" aria-label="Replace which Mod?">
          <div class="sheet">
            <h3>Replace which Mod?</h3>
            <p class="lede center">
              {replacing.glyph} {replacing.name} takes its place at Lv 1.
            </p>
            <div class="slots">
              {run.build.map((e, i) => {
                const m = mods.find((x) => x.id === e.id);
                if (!m) return null;
                return (
                  <button key={e.id} type="button" class="slot-btn" data-slot={i} onClick={() => onReplace(replacing.id, i)}>
                    <ModIcon mod={m} level={e.level} size="lg" />
                    <span class="slot-name">{m.name}</span>
                    <span class="slot-lv">Lv {e.level}</span>
                  </button>
                );
              })}
            </div>
            <button type="button" class="secondary" onClick={() => setReplacing(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
