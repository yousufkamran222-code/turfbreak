import { useState } from 'preact/hooks';
import { cores } from '../content/cores';

export interface SetupChoice {
  coreA: string;
  coreB: string;
  seed: number;
}

interface Props {
  initial: SetupChoice;
  platformId: string;
  launches: number;
  onStart(choice: SetupChoice): void;
}

/** Debug screen: pick two Cores and a seed, then watch. */
export function SetupScreen({ initial, platformId, launches, onStart }: Props) {
  const [coreA, setCoreA] = useState(initial.coreA);
  const [coreB, setCoreB] = useState(initial.coreB);
  const [seed, setSeed] = useState(String(initial.seed));

  const seedNum = Number.parseInt(seed, 10);
  const valid = Number.isFinite(seedNum) && seedNum >= 0;

  const picker = (label: string, value: string, set: (v: string) => void) => (
    <label class="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => set((e.target as HTMLSelectElement).value)}>
        {cores.map((c) => (
          <option value={c.id} key={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <small>{cores.find((c) => c.id === value)?.signature}</small>
    </label>
  );

  return (
    <main class="setup">
      <h1>
        TURFBREAK <span class="tag">debug</span>
      </h1>
      <p class="lede">Who wins? Pick two Cores and a seed.</p>
      {picker('Side A', coreA, setCoreA)}
      {picker('Side B', coreB, setCoreB)}
      <label class="field">
        <span>Seed</span>
        <div class="row">
          <input inputMode="numeric" value={seed} onInput={(e) => setSeed((e.target as HTMLInputElement).value)} />
          <button
            type="button"
            class="secondary"
            onClick={() => setSeed(String(Math.floor(Math.random() * 1_000_000)))}
          >
            Random
          </button>
        </div>
      </label>
      <button type="button" class="primary" disabled={!valid} onClick={() => onStart({ coreA, coreB, seed: seedNum })}>
        Watch
      </button>
      <footer class="build">
        v{__APP_VERSION__} · {__APP_COMMIT__} · {platformId} · launch {launches}
      </footer>
    </main>
  );
}
