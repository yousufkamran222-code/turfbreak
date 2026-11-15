import { useState } from 'preact/hooks';
import { cores } from '../content/cores';
import { inputVariants } from '../content/inputs';

export interface SetupChoice {
  coreA: string;
  coreB: string;
  seed: number;
  /** Input variant id (Phase 2 comparison). */
  variant: string;
  rivalAi: boolean;
  assist: boolean;
}

interface Props {
  initial: SetupChoice;
  platformId: string;
  launches: number;
  onStart(choice: SetupChoice): void;
}

/** Debug screen: pick two Cores, a seed and the input variant, then play. */
export function SetupScreen({ initial, platformId, launches, onStart }: Props) {
  const [coreA, setCoreA] = useState(initial.coreA);
  const [coreB, setCoreB] = useState(initial.coreB);
  const [seed, setSeed] = useState(String(initial.seed));
  const [variant, setVariant] = useState(initial.variant);
  const [rivalAi, setRivalAi] = useState(initial.rivalAi);
  const [assist, setAssist] = useState(initial.assist);

  const seedNum = Number.parseInt(seed, 10);
  const valid = Number.isFinite(seedNum) && seedNum >= 0;
  const v = inputVariants.find((x) => x.id === variant);

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
      <p class="lede">Who wins? You play side A.</p>
      {corePicker('Side A (you)', coreA, setCoreA)}
      {corePicker('Side B (rival)', coreB, setCoreB)}
      <label class="field">
        <span>Input</span>
        <select value={variant} onChange={(e) => setVariant((e.target as HTMLSelectElement).value)}>
          {inputVariants.map((x) => (
            <option value={x.id} key={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        <small>{v?.description}</small>
      </label>
      <div class="toggles">
        <label class="toggle">
          <input type="checkbox" checked={rivalAi} onChange={(e) => setRivalAi((e.target as HTMLInputElement).checked)} />
          <span>Rival uses the input too</span>
        </label>
        <label class="toggle">
          <input type="checkbox" checked={assist} onChange={(e) => setAssist((e.target as HTMLInputElement).checked)} />
          <span>Assist: let the game play my input</span>
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
        class="primary"
        disabled={!valid}
        onClick={() => onStart({ coreA, coreB, seed: seedNum, variant, rivalAi, assist })}
      >
        Play
      </button>
      <footer class="build">
        v{__APP_VERSION__} · {__APP_COMMIT__} · {platformId} · launch {launches}
      </footer>
    </main>
  );
}
