import { ComparisonScreen } from './ComparisonScreen';
import { useEffect, useState } from 'preact/hooks';
import { coreById } from '../content/cores';
import { tuning } from '../content/tuning';
import { decodeReplay, replayConfig, replayParam, type ReplayData } from '../meta/replay';
import { buildPicks } from '../run/run';
import type { ControllerSpec } from '../sim/input';
import { handleBack, useBack } from './back';
import { CollectionScreen } from './CollectionScreen';
import type { Game } from './game';
import { defaultLab, LabScreen, labSeed, type LabSetup } from './LabScreen';
import { CoreSelectScreen, FirstScreen, HomeScreen, SettingsScreen } from './MenuScreens';
import { MatchScreen } from './MatchScreen';
import type { SessionConfig } from './session';
import { UnlockToast } from './UnlockToast';
import { RunFlow } from './RunFlow';
import { SetupScreen, type SetupChoice } from './SetupScreen';

interface Props {
  game: Game;
}

function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}

type Screen = 'comparison' | 'home' | 'run' | 'cores' | 'settings' | 'debug' | 'quick' | 'collection' | 'lab' | 'labmatch' | 'replay';

/** What `?replay=` held on load: a replay to play, or why it cannot be. */
type Incoming = { data: ReplayData } | { error: string } | null;

function readIncoming(game: Game): Incoming {
  if (game.platform.id === 'android') return null;
  try {
    const code = replayParam(window.location.search);
    if (!code) return null;
    const r = decodeReplay(code);
    return r.ok ? { data: r.data } : { error: r.error };
  } catch {
    return null;
  }
}

/** Drop `?replay=` from the address bar so a reload does not replay again. */
function clearReplayParam(): void {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has('replay')) {
      url.searchParams.delete('replay');
      window.history.replaceState(null, '', url.toString());
    }
  } catch {
    // No history API: harmless.
  }
}

function ReplayError({ message, onDone }: { message: string; onDone(): void }) {
  useBack(() => {
    onDone();
    return true;
  });
  return (
    <main class="screen center-col">
      <h2>REPLAY</h2>
      <p class="error" role="alert">{message}</p>
      <button type="button" class="primary" onClick={onDone}>
        Home
      </button>
    </main>
  );
}

/** The shell, plus the "UNLOCKED" banner that sits above every screen. */
export function App({ game }: Props) {
  return (
    <>
      <Screens game={game} />
      <UnlockToast game={game} />
      {game.saveFailed.value && <div class="save-status" role="status">Progress could not be saved. Retrying when you return.</div>}
    </>
  );
}

/** First-launch pick, home, the run, collection, Daily, lab, replays, settings and the debug quick match. */
function Screens({ game }: Props) {
  const { platform, synth } = game;
  const save = game.save.value;
  const firstLaunch = save.stats.runsStarted === 0 && save.run === null;
  const [incoming, setIncoming] = useState<Incoming>(() => readIncoming(game));
  const [screen, setScreen] = useState<Screen>(() => (incoming ? 'replay' : 'home'));
  const [replay, setReplay] = useState<ReplayData | null>(incoming && 'data' in incoming ? incoming.data : null);
  const [lab, setLab] = useState<LabSetup>(() => defaultLab(game));
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
  const closeReplay = (): void => {
    clearReplayParam();
    setIncoming(null);
    setReplay(null);
    setScreen('home');
  };
  const toggleMute = (): void => {
    synth.setMuted(!muted);
    setMuted(!muted);
  };

  if (screen === 'comparison') return <ComparisonScreen game={game} onDone={home} />;

  if (screen === 'replay') {
    const cfg = replay ? replayConfig(replay) : null;
    if (!replay || !cfg) {
      const message = incoming && 'error' in incoming ? incoming.error : 'That replay uses content this version does not have.';
      return <ReplayError message={message} onDone={closeReplay} />;
    }
    const session: SessionConfig = {
      seed: cfg.seed,
      ruleset: cfg.ruleset ?? 'classic',
      cores: cfg.cores,
      mods: cfg.mods ?? [[], []],
      rival: null,
      assist: null,
      inputs: cfg.inputs ?? [],
      twist: cfg.twist,
      haptic: (k) => game.haptic(k),
    };
    return (
      <MatchScreen
        key={`replay-${matchId}`}
        platform={platform}
        synth={synth}
        muted={muted}
        onToggleMute={toggleMute}
        config={session}
        replay
        exportable={false}
        speeds={[1, 2, 4]}
        skip
        actions={[
          { label: 'Watch again', run: () => setMatchId((n) => n + 1) },
          { label: 'Close', run: closeReplay },
        ]}
        quitLabel="Close replay"
        onQuit={closeReplay}
      />
    );
  }

  if (screen === 'collection') return <CollectionScreen game={game} onDone={home} />;

  if (screen === 'lab' || screen === 'labmatch') {
    if (screen === 'lab') {
      return (
        <LabScreen
          game={game}
          setup={lab}
          onChange={setLab}
          onDone={home}
          onStart={() => {
            synth.unlock();
            setMatchId((n) => n + 1);
            setScreen('labmatch');
          }}
          onCode={(code) => {
            const r = decodeReplay(code);
            if (!r.ok) return r.error;
            if (!replayConfig(r.data)) return 'That replay uses content this version does not have.';
            synth.unlock();
            setReplay(r.data);
            setMatchId((n) => n + 1);
            setScreen('replay');
            return null;
          }}
        />
      );
    }
    const ai: ControllerSpec = { kind: 'heuristic', ...tuning.ai.rival };
    return (
      <MatchScreen
        key={`lab-${matchId}`}
        platform={platform}
        synth={synth}
        muted={muted}
        onToggleMute={toggleMute}
        config={{
          seed: lab.seed,
          cores: [coreById(lab.cores[0]), coreById(lab.cores[1])],
          mods: [buildPicks(lab.builds[0]), buildPicks(lab.builds[1])],
          rival: ai,
          assist: ai,
          haptic: (k) => game.haptic(k),
        }}
        title="VERSUS LAB"
        showSeed
        neutral
        speeds={[1, 2, 4]}
        skip
        actions={[
          { label: 'Rematch', run: () => setMatchId((n) => n + 1) },
          {
            label: 'New seed',
            run: () => {
              setLab({ ...lab, seed: labSeed() });
              setMatchId((n) => n + 1);
            },
          },
        ]}
        quitLabel="Back to Lab"
        onQuit={() => setScreen('lab')}
      />
    );
  }

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
        onToggleMute={toggleMute}
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
        showSeed
        quitLabel="Back to debug"
        onQuit={() => setScreen('debug')}
      />
    );
  }

  if (firstLaunch) return <div class="playtest-home">{(import.meta.env.DEV || import.meta.env.VITE_AGENCY_PLAYTEST === 'true') && <button type="button" class="secondary" id="agency-playtest" onClick={() => setScreen('comparison')}>Agency playtest</button>}<FirstScreen game={game} onRun={() => setScreen('run')} onSettings={() => setScreen('settings')} /></div>;

  return (
    <div class="playtest-home">
    {(import.meta.env.DEV || import.meta.env.VITE_AGENCY_PLAYTEST === 'true') && <button type="button" class="secondary" id="agency-playtest" onClick={() => setScreen('comparison')}>Agency playtest</button>}
    <HomeScreen
      game={game}
      onRun={() => setScreen('run')}
      onChangeCore={() => setScreen('cores')}
      onSettings={() => setScreen('settings')}
      onDebug={() => setScreen('debug')}
      onCollection={() => setScreen('collection')}
      onLab={() => setScreen('lab')}
      onDaily={() => {
        game.synth.unlock();
        game.beginDaily();
        setScreen('run');
      }}
      onDailyResume={() => setScreen('run')}
    />
    </div>
  );
}
