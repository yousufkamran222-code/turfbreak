import { useMemo, useState } from 'preact/hooks';
import type { Synth } from '../audio/synth';
import { cores } from '../content/cores';
import { tuning } from '../content/tuning';
import type { Platform } from '../platform';
import { offerMods, rivalBuild, takeMod } from '../run/draft';
import type { CoreDef, ModDef, ModPick } from '../sim/abilities';
import { Rng } from '../sim/rng';
import { DraftScreen } from './DraftScreen';
import { MatchScreen } from './MatchScreen';

/** Phase 2 mini draft: pick a Core, then draft a Mod before each of five matches. */
const ROUNDS = 5;
const OFFER = 3;

interface Props {
  platform: Platform;
  synth: Synth;
  muted: boolean;
  onToggleMute(): void;
  onExit(): void;
}

type Stage = { kind: 'core' } | { kind: 'draft' } | { kind: 'match'; key: number } | { kind: 'summary' };

export function Gauntlet({ platform, synth, muted, onToggleMute, onExit }: Props) {
  // UI-side randomness for offers and rivals; the matches themselves stay seeded.
  const rng = useMemo(() => new Rng(Math.floor(Math.random() * 2 ** 31)), []);
  const [stage, setStage] = useState<Stage>({ kind: 'core' });
  const [core, setCore] = useState<CoreDef | null>(null);
  const [build, setBuild] = useState<ModPick[]>([]);
  const [round, setRound] = useState(1);
  const [results, setResults] = useState<boolean[]>([]);
  const [offer, setOffer] = useState<ModDef[]>([]);
  const [rival, setRival] = useState<{ core: CoreDef; mods: ModPick[]; seed: number } | null>(null);

  const startDraft = (b: readonly ModPick[], r: number): void => {
    setOffer(offerMods(b, r, OFFER, rng));
    setStage({ kind: 'draft' });
  };

  const startMatch = (b: readonly ModPick[], r: number): void => {
    const rc = cores[rng.int(cores.length)]!;
    setRival({ core: rc, mods: rivalBuild(b.length, r, rng), seed: rng.int(1_000_000) });
    setStage({ kind: 'match', key: r * 1000 + rng.int(1000) });
  };

  if (stage.kind === 'core') {
    return (
      <main class="draft">
        <h2>WHO WINS?</h2>
        <p class="lede">Pick your Core. Then draft Mods and watch your build fight five rivals.</p>
        <div class="cards">
          {cores.map((c) => (
            <button
              key={c.id}
              type="button"
              class="mod-card core-card"
              style={{ '--card': c.color }}
              onClick={() => {
                synth.unlock();
                setCore(c);
                startDraft([], 1);
              }}
            >
              <span class="mod-name" style={{ color: c.color }}>
                {c.colorName} {c.name.toUpperCase()}
              </span>
              <span class="mod-text">{c.signature}</span>
              <span class="mod-tags">
                Ultimate: {c.ultimate.name}. {c.ultimate.description}
              </span>
            </button>
          ))}
        </div>
        <button type="button" class="secondary" onClick={onExit}>
          Back
        </button>
      </main>
    );
  }

  if (!core) return null;

  if (stage.kind === 'draft') {
    const pick = (b: ModPick[]): void => {
      setBuild(b);
      startMatch(b, round);
    };
    return (
      <DraftScreen
        core={core}
        build={build}
        offer={offer}
        heading={`ROUND ${round} OF ${ROUNDS}`}
        hint={round === 1 ? 'Pick a Mod. It stays for the whole run.' : null}
        onPick={(m) => pick(takeMod(build, m))}
        onSkip={() => pick(build)}
      />
    );
  }

  if (stage.kind === 'match' && rival) {
    const next = (won: boolean): void => {
      const rs = [...results, won];
      setResults(rs);
      if (round >= ROUNDS) {
        setStage({ kind: 'summary' });
        return;
      }
      setRound(round + 1);
      startDraft(build, round + 1);
    };
    return (
      <MatchScreen
        key={stage.key}
        platform={platform}
        synth={synth}
        muted={muted}
        onToggleMute={onToggleMute}
        seed={rival.seed}
        cores={[core, rival.core]}
        mods={[build, rival.mods]}
        rival={{ kind: 'heuristic', ...tuning.ai.rival }}
        assist={null}
        title={`ROUND ${round} OF ${ROUNDS} · ${results.filter(Boolean).length}–${results.filter((x) => !x).length}`}
        actions={[{ label: round >= ROUNDS ? 'Finish' : 'Next round', run: (w) => next(w === 0) }]}
        onBack={onExit}
      />
    );
  }

  const wins = results.filter(Boolean).length;
  return (
    <main class="draft">
      <h2>{wins >= 4 ? 'UNSTOPPABLE' : wins >= 3 ? 'RUN WON' : 'RUN OVER'}</h2>
      <p class="lede">
        {wins} wins, {ROUNDS - wins} losses with {core.colorName} {core.name.toUpperCase()}
      </p>
      <div class="build-line">
        {build.map((p) => (
          <span key={p.mod.id} class="mod-chip static" title={p.mod.text(p.level)}>
            {p.mod.glyph}
            {p.level > 1 && <sub>{p.level}</sub>}
          </span>
        ))}
      </div>
      <ul class="summary-list">
        {build.map((p) => (
          <li key={p.mod.id}>
            <strong>
              {p.mod.name} {p.level}
            </strong>
            : {p.mod.text(p.level)}
          </li>
        ))}
      </ul>
      <button
        type="button"
        class="primary"
        onClick={() => {
          setBuild([]);
          setResults([]);
          setRound(1);
          setStage({ kind: 'core' });
        }}
      >
        Play again
      </button>
      <button type="button" class="secondary" onClick={onExit}>
        Menu
      </button>
    </main>
  );
}
