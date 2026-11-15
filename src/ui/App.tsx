import { useState } from 'preact/hooks';
import { coreById } from '../content/cores';
import type { Platform } from '../platform';
import { MatchScreen } from './MatchScreen';
import { SetupScreen, type SetupChoice } from './SetupScreen';

interface Props {
  platform: Platform;
  launches: number;
}

/** Phase 1 shell: a debug setup screen and the match screen. */
export function App({ platform, launches }: Props) {
  const [choice, setChoice] = useState<SetupChoice>({ coreA: 'ricochet', coreB: 'splitter', seed: 1 });
  const [inMatch, setInMatch] = useState(false);

  if (!inMatch) {
    return (
      <SetupScreen
        initial={choice}
        platformId={platform.id}
        launches={launches}
        onStart={(c) => {
          setChoice(c);
          setInMatch(true);
        }}
      />
    );
  }
  return (
    <MatchScreen
      key={`${choice.coreA}-${choice.coreB}-${choice.seed}`}
      platform={platform}
      seed={choice.seed}
      cores={[coreById(choice.coreA), coreById(choice.coreB)]}
      onRematch={() => setChoice({ ...choice })}
      onNextSeed={() => setChoice({ ...choice, seed: (choice.seed + 1) >>> 0 })}
      onBack={() => setInMatch(false)}
    />
  );
}
