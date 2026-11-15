import { useMemo, useState } from 'preact/hooks';
import { Synth } from '../audio/synth';
import { coreById } from '../content/cores';
import { tuning } from '../content/tuning';
import type { Platform } from '../platform';
import type { ControllerSpec } from '../sim/input';
import { Gauntlet } from './Gauntlet';
import { MatchScreen } from './MatchScreen';
import { SetupScreen, type SetupChoice } from './SetupScreen';

interface Props {
  platform: Platform;
  launches: number;
}

function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}

type Screen = 'menu' | 'gauntlet' | 'quick';

/** Phase 2 shell: menu, the mini-draft Gauntlet, and a debug quick match. */
export function App({ platform, launches }: Props) {
  const synth = useMemo(() => new Synth(), []);
  const [screen, setScreen] = useState<Screen>('menu');
  const [choice, setChoice] = useState<SetupChoice>({
    coreA: 'ricochet',
    coreB: 'splitter',
    seed: randomSeed(),
    rivalAi: true,
    assist: false,
  });
  // Every match gets a fresh key, so Rematch remounts even with the same seed.
  const [matchId, setMatchId] = useState(0);
  const [muted, setMuted] = useState(false);
  const toggleMute = (): void => {
    synth.setMuted(!muted);
    setMuted(!muted);
  };

  if (screen === 'gauntlet') {
    return <Gauntlet platform={platform} synth={synth} muted={muted} onToggleMute={toggleMute} onExit={() => setScreen('menu')} />;
  }

  if (screen === 'quick') {
    const rival: ControllerSpec | null = choice.rivalAi ? { kind: 'heuristic', ...tuning.ai.rival } : null;
    const assist: ControllerSpec | null = choice.assist ? { kind: 'heuristic', ...tuning.ai.assist } : null;
    return (
      <MatchScreen
        key={matchId}
        platform={platform}
        synth={synth}
        muted={muted}
        onToggleMute={toggleMute}
        seed={choice.seed}
        cores={[coreById(choice.coreA), coreById(choice.coreB)]}
        mods={[[], []]}
        rival={rival}
        assist={assist}
        actions={[
          { label: 'Rematch', run: () => setMatchId((n) => n + 1) },
          {
            label: 'New seed',
            run: () => {
              setChoice({ ...choice, seed: randomSeed() });
              setMatchId((n) => n + 1);
            },
          },
        ]}
        onBack={() => setScreen('menu')}
      />
    );
  }

  return (
    <SetupScreen
      initial={choice}
      platformId={platform.id}
      launches={launches}
      onGauntlet={() => {
        synth.unlock();
        setScreen('gauntlet');
      }}
      onQuick={(c) => {
        synth.unlock();
        setChoice(c);
        setMatchId((n) => n + 1);
        setScreen('quick');
      }}
    />
  );
}
