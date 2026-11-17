import { useEffect } from 'preact/hooks';
import { mods } from '../content/mods';
import type { Platform } from '../platform';
import type { RunState } from '../run/run';
import { useBack } from './back';
import { bestMoment } from './moment';
import { findCore, coreName, Hearts, ModIcon } from './parts';

interface Props {
  run: RunState;
  platform: Platform;
  /** The Ascension tier this run just unlocked, if any. */
  unlocked: number | null;
  onAgain(): void;
  onEndless(): void;
  onHome(): void;
}

export function SummaryScreen({ run, platform, unlocked, onAgain, onEndless, onHome }: Props) {
  useBack(() => {
    onHome();
    return true;
  });
  const won = run.outcome === 'won';
  useEffect(() => {
    if (won) platform.happyMoment();
  }, []);
  const core = findCore(run.coreId);
  const wins = run.history.filter((h) => h.won).length;
  const moment = bestMoment(run.history);
  const title = won ? 'RUN WON' : run.endless ? 'ENDLESS OVER' : 'RUN OVER';
  const shareText = `${won ? 'Won' : 'Lost'} a Turfbreak run with ${core ? coreName(core) : run.coreId}: ${wins} rounds won, reached round ${run.round}.`;

  return (
    <main class="screen summary">
      <h2 class={won ? 'win' : 'lose'}>{title}</h2>
      {core && <p class="lede center" style={{ color: core.color }}>{coreName(core)} · Ascension {run.ascension}</p>}

      <div class="stats-grid">
        <div>
          <b>{wins}</b>
          <span>rounds won</span>
        </div>
        <div>
          <b>{run.round}</b>
          <span>round reached</span>
        </div>
        <div>
          <b>
            <Hearts hearts={run.hearts} max={Math.max(3, run.hearts)} />
          </b>
          <span>hearts left</span>
        </div>
      </div>

      {moment && (
        <p class="moment">
          <span>BEST MOMENT</span>
          {moment}
        </p>
      )}

      {unlocked !== null && <p class="unlock">Ascension {unlocked} unlocked for this Core!</p>}

      <section class="final-build">
        <h3>Final build</h3>
        {run.build.length === 0 && <p class="muted">No Mods.</p>}
        <ul>
          {run.build.map((e) => {
            const m = mods.find((x) => x.id === e.id);
            if (!m) return null;
            return (
              <li key={e.id}>
                <ModIcon mod={m} level={e.level} size="md" />
                <span class="fb-text">
                  <b>
                    {m.name} Lv {e.level}
                  </b>
                  <small>{m.text(e.level)}</small>
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <div class="stack-actions">
        {won && (
          <button type="button" class="primary big" id="endless" onClick={onEndless}>
            Continue (Endless)
          </button>
        )}
        <button type="button" class={won ? 'secondary big' : 'primary big'} id="again" onClick={onAgain}>
          Play again
        </button>
        <div class="row">
          <button type="button" class="secondary" onClick={() => void platform.share({ text: shareText })}>
            Share
          </button>
          <button type="button" class="secondary" id="home" onClick={onHome}>
            Home
          </button>
        </div>
      </div>
    </main>
  );
}
