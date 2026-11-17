import { useEffect, useMemo, useState } from 'preact/hooks';
import { rulesFor } from '../content/ascension';
import { tuning } from '../content/tuning';
import { matchConfig } from '../run/run';
import type { ControllerSpec } from '../sim/input';
import { DraftScreen, roundLabel } from './DraftScreen';
import type { Game } from './game';
import { MatchScreen } from './MatchScreen';
import type { SessionConfig } from './session';
import { SummaryScreen } from './SummaryScreen';
import { VsCard } from './VsCard';

/** Leaves a run whose saved match can no longer be built, without crashing. */
function Bail({ game, onHome }: { game: Game; onHome(): void }) {
  useEffect(() => {
    game.clearRun();
    onHome();
  }, []);
  return null;
}

/**
 * The run: follows `save.run`. Draft, then the VS card, then the match, then the
 * next draft, until the summary. Every state change goes through `Game`, which
 * saves it, so this component holds no run state of its own beyond "has the VS
 * card been dismissed".
 */
export function RunFlow({ game, onHome }: { game: Game; onHome(): void }) {
  const run = game.save.value.run;
  // The VS card is shown once per match; remember which one it was dismissed for.
  const [started, setStarted] = useState<string | null>(null);
  const [muted, setMuted] = useState(game.synth.isMuted);
  const key = run?.rival ? `${run.round}:${run.rival.seed}` : '';

  const config = useMemo<SessionConfig | null>(() => {
    if (!run || run.phase !== 'match') return null;
    try {
      const m = matchConfig(run);
      const assist: ControllerSpec | null = game.settings.autoPlay ? { kind: 'heuristic', ...tuning.ai.assist } : null;
      return {
        seed: m.seed,
        cores: m.cores,
        mods: m.mods ?? [[], []],
        rival: m.controllers?.[1] ?? null,
        assist,
        twist: m.twist,
        haptic: (kind) => game.haptic(kind),
      };
    } catch {
      return null;
    }
    // A match is built once per round; settings changes apply to the next one.
  }, [key, run?.phase]);

  if (!run) return null;

  if (run.phase === 'draft') {
    return (
      <DraftScreen
        run={run}
        onPick={(id) => game.pick(id)}
        onReroll={() => game.reroll()}
        onReplace={(id, slot) => game.replace(id, slot)}
        onHome={onHome}
        hintSeen={game.prefs.value.draftHintSeen === true}
        onHintSeen={() => game.markDraftHintSeen()}
      />
    );
  }

  if (run.phase === 'summary') {
    return (
      <SummaryScreen
        run={run}
        platform={game.platform}
        unlocked={game.unlocked.value}
        dailyDay={game.save.value.daily?.day}
        onEndless={() => game.endless()}
        onAgain={() => game.begin(run.coreId, run.ascension)}
        onHome={() => {
          game.clearRun();
          onHome();
        }}
      />
    );
  }

  // phase === 'match'
  if (!config) {
    // The saved match cannot be built (its Core was removed): drop the run rather than crash.
    return <Bail game={game} onHome={onHome} />;
  }
  if (started !== key) {
    return <VsCard run={run} onStart={() => setStarted(key)} onHome={onHome} />;
  }
  const lastRound = !run.endless && run.round >= rulesFor(run.ascension).rounds;
  return (
    <MatchScreen
      key={key}
      platform={game.platform}
      synth={game.synth}
      muted={muted}
      onToggleMute={() => {
        game.synth.setMuted(!muted);
        setMuted(!muted);
      }}
      config={config}
      title={roundLabel(run)}
      note={(winner) => (winner === 0 ? '' : run.hearts > 1 ? `Heart lost. ${run.hearts - 1} left.` : 'Last heart lost.')}
      actions={[
        {
          label: lastRound ? 'See results' : 'Continue',
          run: (o) => {
            game.finish(o);
          },
        },
      ]}
      quitLabel="Quit run"
      onQuit={() => {
        game.clearRun();
        onHome();
      }}
    />
  );
}
