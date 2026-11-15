import { useState } from 'preact/hooks';
import { cores } from '../content/cores';

export interface SetupChoice {
  coreA: string;
  coreB: string;
  seed: number;
  rivalAi: boolean;
  assist: boolean;
}

interface Props {
  initial: SetupChoice;
  platformId: string;
  launches: number;
  onGauntlet(): void;
  onQuick(choice: SetupChoice): void;
}

/** Menu: the mini-draft Gauntlet, or a debug quick match with two Cores and a seed. */
export function SetupScreen({ initial, platformId, launches, onGauntlet, onQuick }: Props) {
  const [coreA, setCoreA] = useState(initial.coreA);
  const [coreB, setCoreB] = useState(initial.coreB);
  const [seed, setSeed] = useState(String(initial.seed));
  const [rivalAi, setRivalAi] = useState(initial.rivalAi);
  const [assist, setAssist] = useState(initial.assist);

  const seedNum = Number.parseInt(seed, 10);
  const valid = Number.isFinite(seedNum) && seedNum >= 0;

  const corePicker = (label: string, value: string, set: (v: string) => void) => (
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
      <p class="lede">Build a side. Watch it fight.</p>
      <button type="button" class="primary" onClick={onGauntlet}>
        Play the Gauntlet
      </button>
      <h3 class="section">Quick match (debug)</h3>
      {corePicker('Side A (you)', coreA, setCoreA)}
      {corePicker('Side B (rival)', coreB, setCoreB)}
      <div class="toggles">
        <label class="toggle">
          <input type="checkbox" checked={rivalAi} onChange={(e) => setRivalAi((e.target as HTMLInputElement).checked)} />
          <span>Rival aims and fires its ultimate</span>
        </label>
        <label class="toggle">
          <input type="checkbox" checked={assist} onChange={(e) => setAssist((e.target as HTMLInputElement).checked)} />
          <span>Auto-play my side</span>
        </label>
      </div>
      <label class="field">
        <span>Seed</span>
        <div class="row">
          <input inputMode="numeric" value={seed} onInput={(e) => setSeed((e.target as HTMLInputElement).value)} />
          <button type="button" class="secondary" onClick={() => setSeed(String(Math.floor(Math.random() * 1_000_000)))}>
            Random
          </button>
        </div>
      </label>
      <button
        type="button"
        class="secondary"
        disabled={!valid}
        onClick={() => onQuick({ coreA, coreB, seed: seedNum, rivalAi, assist })}
      >
        Quick match
      </button>
      <footer class="build">
        v{__APP_VERSION__} · {__APP_COMMIT__} · {platformId} · launch {launches}
      </footer>
    </main>
  );
}
