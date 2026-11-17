import { useEffect, useState } from 'preact/hooks';
import { cores } from '../content/cores';
import { defaultSave } from '../meta/save';
import { startRun } from '../run/run';
import { type Ruleset } from '../sim/world';
import { Game } from './game';
import { RunFlow } from './RunFlow';
import { useBack } from './back';

/** Isolated run state. The host provides rendering/audio/lifecycle, never storage or ads. */
export function comparisonGame(source: Game, ruleset: Ruleset, seed: number, coreId: string): Game {
  const initial = defaultSave();
  initial.settings = { ...source.settings, autoPlay: false };
  initial.unlocks = structuredClone(source.save.value.unlocks);
  initial.run = startRun({ seed, coreId, unlockedMods: initial.unlocks.mods });
  initial.stats.runsStarted = 1;
  const sandbox = new Game({ ...source.platform, storageGet: async () => null, storageSet: async () => {}, canShowRewarded: () => false,
    showRewarded: async () => 'unavailable', showInterstitial: async () => {} }, source.synth, initial, true);
  sandbox.ruleset = ruleset;
  return sandbox;
}

export function ComparisonScreen({ game, onDone }: { game: Game; onDone(): void }) {
  const [seed, setSeed] = useState(20261117);
  const [core, setCore] = useState(game.prefs.value.coreId);
  const [sandbox, setSandbox] = useState<Game | null>(null);
  useEffect(() => () => sandbox?.dispose(), [sandbox]);
  const leave = (): void => setSandbox(null);
  useBack(() => { if (!sandbox) onDone(); else leave(); return true; });
  if (sandbox) return <div class="comparison-run"><div class="comparison-label">PLAYTEST · {sandbox.ruleset.toUpperCase()} · seed {seed} <button type="button" class="secondary small" onClick={leave}>Exit playtest</button></div><RunFlow game={sandbox} onHome={leave} /></div>;
  const available = cores.filter((c) => game.save.value.unlocks.cores.includes(c.id));
  return <main class="screen center-col">
    <h2>AGENCY PLAYTEST</h2>
    <p>Compare the same run with three control styles. Progress here is temporary. Your normal run and Daily stay saved.</p>
    <label>Seed <input type="number" min="0" max="4294967295" value={seed} onInput={(e) => { const n = Number(e.currentTarget.value); if (Number.isSafeInteger(n) && n >= 0 && n <= 0xffffffff) setSeed(n); }} /></label>
    <label>Core <select value={core} onChange={(e) => setCore(e.currentTarget.value)}>{available.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    <p>Classic: launch aim and one ultimate. Recharge: ultimate returns after 12s. Tactical: choose a boost at halftime.</p>
    {(['classic', 'recharge', 'tactical'] as const).map((ruleset) => <button type="button" key={ruleset} onClick={() => { game.synth.unlock(); setSandbox(comparisonGame(game, ruleset, seed, core)); }}>Play {ruleset}</button>)}
    <p>Use the same draft picks for the closest comparison. Rate fun, control, clarity, pacing, and desire to replay from 1–5.</p>
    <button type="button" class="secondary" onClick={onDone}>Home</button>
  </main>;
}
