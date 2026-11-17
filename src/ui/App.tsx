import { useEffect, useState } from 'preact/hooks';
import { coreById } from '../content/cores';
import { tuning } from '../content/tuning';
import type { ControllerSpec } from '../sim/input';
import { handleBack } from './back';
import type { Game } from './game';
import { CoreSelectScreen, FirstScreen, HomeScreen, SettingsScreen } from './MenuScreens';
import { MatchScreen } from './MatchScreen';
import { RunFlow } from './RunFlow';
import { SetupScreen, type SetupChoice } from './SetupScreen';

interface Props {
  game: Game;
}

function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}

type Screen = 'home' | 'run' | 'cores' | 'settings' | 'debug' | 'quick';

/** The shell: first-launch pick, home, the run, settings and the debug quick match. */
export function App({ game }: Props) {
  const { platform, synth } = game;
  const save = game.save.value;
  const firstLaunch = save.stats.runsStarted === 0 && save.run === null;
  const [screen, setScreen] = useState<Screen>('home');
  const [choice, setChoice] = useState<SetupChoice>({
    coreA: 'ricochet',
    coreB: 'splitter',
    seed: randomSeed(),
    rivalAi: true,
    assist: false,
  });
  // Every quick match gets a fresh key, so Rematch remounts even with the same seed.
  const [matchId, setMatchId] = useState(0);
  const [muted, setMuted] = useState(false);

  // One platform back listener; screens register what back means for them (see back.ts).
  useEffect(() => platform.onBack(handleBack), [platform]);

  const home = (): void => setScreen('home');

  // A run in progress is always shown as the run, whatever else was open (first run included).
  if (screen === 'run' && save.run) return <RunFlow game={game} onHome={home} />;
  if (screen === 'settings') return <SettingsScreen game={game} onDone={home} />;
  if (screen === 'cores') return <CoreSelectScreen game={game} onDone={home} />;

  if (screen === 'debug') {
    return (
      <SetupScreen
        initial={choice}
        platformId={platform.id}
        launches={save.launches}
        onBack={home}
        onQuick={(c) => {
          synth.unlock();
          setChoice(c);
          setMatchId((n) => n + 1);
          setScreen('quick');
        }}
      />
    );
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
        onToggleMute={() => {
          synth.setMuted(!muted);
          setMuted(!muted);
        }}
        config={{
          seed: choice.seed,
          cores: [coreById(choice.coreA), coreById(choice.coreB)],
          mods: [[], []],
          rival,
          assist,
          haptic: (k) => game.haptic(k),
        }}
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
        quitLabel="Back to debug"
        onQuit={() => setScreen('debug')}
      />
    );
  }

  if (firstLaunch) return <FirstScreen game={game} onRun={() => setScreen('run')} onSettings={() => setScreen('settings')} />;

  return (
    <HomeScreen
      game={game}
      onRun={() => setScreen('run')}
      onChangeCore={() => setScreen('cores')}
      onSettings={() => setScreen('settings')}
      onDebug={() => setScreen('debug')}
    />
  );
}
