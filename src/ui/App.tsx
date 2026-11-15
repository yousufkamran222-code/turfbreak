import { useMemo, useState } from 'preact/hooks';
import { Synth } from '../audio/synth';
import { coreById } from '../content/cores';
import { inputVariantById } from '../content/inputs';
import { tuning } from '../content/tuning';
import type { Platform } from '../platform';
import type { ControllerSpec } from '../sim/input';
import { MatchScreen } from './MatchScreen';
import { SetupScreen, type SetupChoice } from './SetupScreen';

interface Props {
  platform: Platform;
  launches: number;
}

function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}

/** Phase 2 shell: a debug setup screen and the match screen. */
export function App({ platform, launches }: Props) {
  const synth = useMemo(() => new Synth(), []);
  const [choice, setChoice] = useState<SetupChoice>({
    coreA: 'ricochet',
    coreB: 'splitter',
    seed: randomSeed(),
    variant: 'redirect',
    rivalAi: true,
    assist: false,
  });
  const [inMatch, setInMatch] = useState(false);
  // Every match gets a fresh key, so Rematch remounts even with the same seed.
  const [matchId, setMatchId] = useState(0);
  const [muted, setMuted] = useState(false);

  if (!inMatch) {
    return (
      <SetupScreen
        initial={choice}
        platformId={platform.id}
        launches={launches}
        onStart={(c) => {
          synth.unlock();
          setChoice(c);
          setMatchId((n) => n + 1);
          setInMatch(true);
        }}
      />
    );
  }

  const rival: ControllerSpec | null = choice.rivalAi ? { kind: 'heuristic', ...tuning.ai.rival } : null;
  const assist: ControllerSpec | null = choice.assist ? { kind: 'heuristic', ...tuning.ai.assist } : null;
  return (
    <MatchScreen
      key={matchId}
      platform={platform}
      synth={synth}
      muted={muted}
      onToggleMute={() => {
        synth.setMuted(!muted);
        setMuted(!muted);
      }}
      seed={choice.seed}
      cores={[coreById(choice.coreA), coreById(choice.coreB)]}
      variant={inputVariantById(choice.variant)}
      rival={rival}
      assist={assist}
      onRematch={() => setMatchId((n) => n + 1)}
      onNextSeed={() => {
        setChoice({ ...choice, seed: randomSeed() });
        setMatchId((n) => n + 1);
      }}
      onBack={() => {
        setChoice({ ...choice });
        setInMatch(false);
      }}
    />
  );
}
