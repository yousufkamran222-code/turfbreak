import { ascensionTiers } from '../content/ascension';
import { cores } from '../content/cores';
import type { CoreDef } from '../sim/abilities';
import { useBack } from './back';
import { maxTier, unlockedCores, type Game } from './game';
import { findCore, coreName, ShapeIcon } from './parts';

interface CoreInfoProps {
  core: CoreDef;
}

function CoreInfo({ core }: CoreInfoProps) {
  return (
    <>
      <span class="core-title" style={{ color: core.color }}>
        {coreName(core)}
      </span>
      <span class="core-sig">{core.signature}</span>
      <span class="core-ult">
        <b>{core.ultimate.name}.</b> {core.ultimate.description}
      </span>
    </>
  );
}

/** Home: one tap on Play (or Continue) from launch to a run. */
export function HomeScreen({
  game,
  onRun,
  onChangeCore,
  onSettings,
  onDebug,
}: {
  game: Game;
  /** Open the run screens (they follow the saved run). */
  onRun(): void;
  onChangeCore(): void;
  onSettings(): void;
  onDebug(): void;
}) {
  const save = game.save.value;
  const prefs = game.prefs.value;
  const core = findCore(prefs.coreId) ?? cores[0]!;
  const best = maxTier(save, core.id);
  const run = save.run;
  const runCore = run ? findCore(run.coreId) : undefined;
  const tierText = prefs.ascension === 0 ? 'Base game.' : (ascensionTiers[prefs.ascension - 1]?.description ?? '');

  return (
    <main class="screen home">
      <header class="brand">
        <h1>TURFBREAK</h1>
        <p class="lede">Build a side. Watch it fight.</p>
      </header>

      <button type="button" class="core-panel" style={{ '--card': core.color }} onClick={onChangeCore} aria-label="Change Core">
        <ShapeIcon shape={core.shape} color={core.color} size={56} />
        <span class="core-text">
          <CoreInfo core={core} />
        </span>
        <span class="chev" aria-hidden="true">
          Change
        </span>
      </button>

      <div class="asc">
        <button
          type="button"
          class="secondary step"
          aria-label="Lower Ascension"
          disabled={prefs.ascension <= 0}
          onClick={() => game.setPrefs({ ...prefs, ascension: prefs.ascension - 1 })}
        >
          −
        </button>
        <div class="asc-mid">
          <div class="asc-name">ASCENSION {prefs.ascension}</div>
          <div class="asc-text">{tierText}</div>
        </div>
        <button
          type="button"
          class="secondary step"
          aria-label="Raise Ascension"
          disabled={prefs.ascension >= best}
          onClick={() => game.setPrefs({ ...prefs, ascension: prefs.ascension + 1 })}
        >
          +
        </button>
      </div>
      {best === 0 && <p class="hint">Win a run with this Core to unlock Ascension 1.</p>}

      <div class="stack-actions">
        {run && runCore && (
          <button type="button" class="primary big" onClick={() => {
              game.synth.unlock();
              onRun();
            }}
            id="continue">
            Continue
            <small>
              {runCore.name} · Round {run.round}
              {run.phase === 'summary' ? ' · Summary' : ''}
            </small>
          </button>
        )}
        <button
          type="button"
          class={run ? 'secondary big' : 'primary big'}
          id="play"
          onClick={() => {
            game.synth.unlock();
            game.begin(core.id, prefs.ascension);
            onRun();
          }}
        >
          {run ? 'New run' : 'Play'}
        </button>
      </div>

      <footer class="home-foot">
        <button type="button" class="secondary small" onClick={onSettings}>
          Settings
        </button>
        <button type="button" class="ghost small" onClick={onDebug}>
          Debug
        </button>
      </footer>
    </main>
  );
}

/** Pick the Core for the next run: unlocked ones are tappable, the rest are greyed. */
export function CoreSelectScreen({ game, onDone }: { game: Game; onDone(): void }) {
  useBack(() => {
    onDone();
    return true;
  });
  const save = game.save.value;
  const open = unlockedCores(save);
  const prefs = game.prefs.value;
  return (
    <main class="screen">
      <h2>CHOOSE YOUR CORE</h2>
      <div class="cards">
        {cores.map((c) => {
          const unlocked = open.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              class={`core-card ${unlocked ? '' : 'locked'} ${prefs.coreId === c.id ? 'current' : ''}`}
              style={{ '--card': c.color }}
              disabled={!unlocked}
              onClick={() => {
                game.setPrefs({ coreId: c.id, ascension: c.id === prefs.coreId ? prefs.ascension : 0 });
                onDone();
              }}
            >
              <ShapeIcon shape={c.shape} color={unlocked ? c.color : '#555b70'} size={44} />
              <span class="core-text">
                <CoreInfo core={c} />
              </span>
              {!unlocked && <span class="lock">Unlock later</span>}
            </button>
          );
        })}
      </div>
      <button type="button" class="secondary" onClick={onDone}>
        Back
      </button>
    </main>
  );
}

/** First launch: "WHO WINS?" with two Cores. The pick starts the first run. */
export function FirstScreen({ game, onRun, onSettings }: { game: Game; onRun(): void; onSettings(): void }) {
  const open = unlockedCores(game.save.value)
    .slice(0, 2)
    .map((id) => findCore(id))
    .filter((c): c is CoreDef => !!c);
  return (
    <main class="screen first">
      <h2 class="who">WHO WINS?</h2>
      <p class="lede center">Pick your Core. Then draft Mods and watch your build fight.</p>
      <div class="cards">
        {open.map((c) => (
          <button
            key={c.id}
            type="button"
            class="core-card big"
            style={{ '--card': c.color }}
            onClick={() => {
              game.synth.unlock();
              game.begin(c.id, 0);
              onRun();
            }}
          >
            <ShapeIcon shape={c.shape} color={c.color} size={64} />
            <span class="core-text">
              <CoreInfo core={c} />
            </span>
          </button>
        ))}
      </div>
      <button type="button" class="ghost small" onClick={onSettings}>
        Settings
      </button>
    </main>
  );
}

function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange(v: boolean): void }) {
  return (
    <label class="setting toggle-row">
      <span class="s-text">
        <span class="s-label">{label}</span>
        {hint && <span class="s-hint">{hint}</span>}
      </span>
      <input type="checkbox" role="switch" checked={value} onChange={(e) => onChange((e.target as HTMLInputElement).checked)} />
    </label>
  );
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange(v: number): void }) {
  return (
    <label class="setting slider-row">
      <span class="s-label">{label}</span>
      <input
        type="range"
        min="0"
        max="100"
        value={Math.round(value * 100)}
        onInput={(e) => onChange(Number((e.target as HTMLInputElement).value) / 100)}
      />
      <span class="s-val">{Math.round(value * 100)}</span>
    </label>
  );
}

export function SettingsScreen({ game, onDone }: { game: Game; onDone(): void }) {
  useBack(() => {
    onDone();
    return true;
  });
  const s = game.save.value.settings;
  const set = game.setSettings.bind(game);
  return (
    <main class="screen">
      <h2>SETTINGS</h2>
      <section class="settings">
        <Slider label="Music" value={s.musicVolume} onChange={(v) => set({ musicVolume: v })} />
        <Slider label="Effects" value={s.sfxVolume} onChange={(v) => set({ sfxVolume: v })} />
        <Toggle label="Haptics" hint="Vibrate on clashes, Core triggers and results." value={s.haptics} onChange={(v) => set({ haptics: v })} />
        <Toggle label="Reduce motion" hint="No shake, slow-mo or flashes." value={s.reduceMotion} onChange={(v) => set({ reduceMotion: v })} />
        <Toggle label="High contrast" hint="Stripes on the rival's cells, thicker frontier." value={s.highContrast} onChange={(v) => set({ highContrast: v })} />
        <Toggle label="Auto-play" hint="The game aims and fires your ultimate for you." value={s.autoPlay} onChange={(v) => set({ autoPlay: v })} />
      </section>
      <p class="build-info">
        v{__APP_VERSION__} · {__APP_COMMIT__} · {game.platform.id} · launch {game.save.value.launches}
      </p>
      <button type="button" class="primary" onClick={onDone}>
        Done
      </button>
    </main>
  );
}
