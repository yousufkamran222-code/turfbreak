import { useState } from 'preact/hooks';
import { cores } from '../content/cores';
import { mods } from '../content/mods';
import { decodeReplay } from '../meta/replay';
import { MAX_LEVEL, type BuildEntry } from '../run/run';
import { useBack } from './back';
import { unlockedCores, type Game } from './game';
import { BuildRow, ShapeIcon, coreName, findCore } from './parts';

export const LAB_MAX_MODS = 6;

export interface LabSetup {
  cores: [string, string];
  builds: [BuildEntry[], BuildEntry[]];
  seed: number;
}

/** Tap a Mod: add it at level 1, then raise its level, then remove it. Never more than `LAB_MAX_MODS`. */
export function cycleMod(build: readonly BuildEntry[], id: string): BuildEntry[] {
  const at = build.findIndex((e) => e.id === id);
  if (at < 0) return build.length >= LAB_MAX_MODS ? [...build] : [...build, { id, level: 1 }];
  const e = build[at]!;
  if (e.level >= MAX_LEVEL) return build.filter((_, i) => i !== at);
  return build.map((x, i) => (i === at ? { id: x.id, level: x.level + 1 } : x));
}

export const labSeed = (): number => Math.floor(Math.random() * 1_000_000);

/** Versus Lab setup: two Cores, up to six Mods each (with levels) from what is unlocked, a seed. */
export function LabScreen({
  game,
  setup,
  onChange,
  onStart,
  onCode,
  onDone,
}: {
  game: Game;
  setup: LabSetup;
  onChange(s: LabSetup): void;
  onStart(): void;
  onCode(code: string): string | null;
  onDone(): void;
}) {
  useBack(() => {
    onDone();
    return true;
  });
  const save = game.save.value;
  const [side, setSide] = useState<0 | 1>(0);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const openCores = unlockedCores(save);
  const openMods = mods.filter((m) => save.unlocks.mods.includes(m.id));
  const build = setup.builds[side];
  const core = findCore(setup.cores[side]);

  const setCore = (id: string): void => {
    const c: [string, string] = [...setup.cores];
    c[side] = id;
    onChange({ ...setup, cores: c });
  };
  const setBuild = (b: BuildEntry[]): void => {
    const bs: [BuildEntry[], BuildEntry[]] = [setup.builds[0], setup.builds[1]];
    bs[side] = b;
    onChange({ ...setup, builds: bs });
  };

  return (
    <main class="screen lab">
      <h2>VERSUS LAB</h2>
      <p class="lede center">Build two sides from what you have unlocked and watch them fight.</p>
      <div class="seg" role="tablist">
        {([0, 1] as const).map((i) => (
          <button key={i} type="button" role="tab" aria-selected={side === i} class={side === i ? 'on' : ''} onClick={() => setSide(i)}>
            {i === 0 ? 'Side A' : 'Side B'} · {findCore(setup.cores[i])?.name}
            <small>{setup.builds[i].length} Mods</small>
          </button>
        ))}
      </div>

      <h3>Core</h3>
      <div class="chips">
        {openCores.map((id) => {
          const c = findCore(id);
          if (!c) return null;
          return (
            <button key={id} type="button" class={`chip ${setup.cores[side] === id ? 'on' : ''}`} style={{ '--card': c.color }} onClick={() => setCore(id)}>
              <ShapeIcon shape={c.shape} color={c.color} size={22} />
              {c.name}
            </button>
          );
        })}
      </div>
      {core && <p class="core-sig lab-sig" style={{ color: core.color }}>{coreName(core)}: {core.signature}</p>}

      <h3>
        Build · {build.length}/{LAB_MAX_MODS}
      </h3>
      <BuildRow build={build} slots size="lg" />
      <p class="hint lab-hint">Tap a Mod to add it, tap again to raise its level, again to remove it.</p>
      <div class="mod-grid">
        {openMods.map((m) => {
          const e = build.find((x) => x.id === m.id);
          return (
            <button
              key={m.id}
              type="button"
              class={`mod-pick ${e ? 'on' : ''}`}
              disabled={!e && build.length >= LAB_MAX_MODS}
              onClick={() => setBuild(cycleMod(build, m.id))}
              title={m.text(e?.level ?? 1)}
            >
              <span class="g">{m.glyph}</span>
              <span class="mp-name">{m.name}</span>
              {e && <span class="mp-lv">Lv {e.level}</span>}
            </button>
          );
        })}
      </div>

      <h3>Seed</h3>
      <div class="row">
        <input
          type="number"
          inputMode="numeric"
          min="0"
          aria-label="Seed"
          value={setup.seed}
          onInput={(e) => onChange({ ...setup, seed: Math.max(0, Math.floor(Number((e.target as HTMLInputElement).value) || 0)) })}
        />
        <button type="button" class="secondary" onClick={() => onChange({ ...setup, seed: labSeed() })}>
          Random
        </button>
      </div>

      <button type="button" class="primary big" id="lab-start" onClick={onStart}>
        Start match
      </button>

      <h3>Replay code</h3>
      <div class="row">
        <input type="text" aria-label="Replay code" placeholder="Paste a replay code" value={code} onInput={(e) => setCode((e.target as HTMLInputElement).value)} />
        <button
          type="button"
          class="secondary"
          disabled={code.trim() === ''}
          onClick={() => {
            const r = decodeReplay(code);
            setError(r.ok ? onCode(code.trim()) : r.error);
          }}
        >
          Play
        </button>
      </div>
      {error && <p class="error" role="alert">{error}</p>}

      <button type="button" class="secondary" onClick={onDone}>
        Back
      </button>
    </main>
  );
}

/** A starting lab: the player's Core against the next one, with the player's usual first Mods. */
export function defaultLab(game: Game): LabSetup {
  const open = unlockedCores(game.save.value);
  const a = open[0] ?? cores[0]!.id;
  const b = open[1] ?? open[0] ?? cores[1]!.id;
  return { cores: [a, b], builds: [[], []], seed: labSeed() };
}
