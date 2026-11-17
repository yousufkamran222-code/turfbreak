import { useState } from 'preact/hooks';
import { cores } from '../content/cores';
import { mods } from '../content/mods';
import { featFor } from '../content/unlocks';
import { defaultCoreStats, type CoreStats, type Save } from '../meta/save';
import type { CoreDef, ModDef } from '../sim/abilities';
import { useBack } from './back';
import type { Game } from './game';
import { ModIcon, ShapeIcon, coreName } from './parts';

/** Cores and Mods found out of all of them. */
export function collectionProgress(save: Save): { found: number; total: number; cores: [number, number]; mods: [number, number] } {
  const c = cores.filter((x) => save.unlocks.cores.includes(x.id)).length;
  const m = mods.filter((x) => save.unlocks.mods.includes(x.id)).length;
  return { found: c + m, total: cores.length + mods.length, cores: [c, cores.length], mods: [m, mods.length] };
}

/** The records worth showing for a Core: only the ones that apply to it and have a value. */
export function coreRecords(core: CoreDef, s: CoreStats): [string, string][] {
  const out: [string, string][] = [
    ['Runs', `${s.runs}`],
    ['Run wins', `${s.runWins}`],
    ['Best margin', s.bestMargin > 0 ? `${s.bestMargin} cells` : '–'],
  ];
  if (core.id === 'ricochet') out.push(['Longest beam', s.longestBeam > 0 ? `${s.longestBeam}` : '–']);
  if (core.id === 'splitter') out.push(['Most splits alive', s.mostSplits > 0 ? `${s.mostSplits}` : '–']);
  out.push(['Fastest Wipeout', s.fastestWipeout > 0 ? `${s.fastestWipeout} s` : '–']);
  out.push(['Best Endless round', s.bestEndless > 0 ? `${s.bestEndless}` : '–']);
  return out;
}

function CoreEntry({ core, save }: { core: CoreDef; save: Save }) {
  const found = save.unlocks.cores.includes(core.id);
  const stats = save.stats.byCore[core.id] ?? defaultCoreStats();
  const hint = featFor('core', core.id)?.hint;
  return (
    <li class={`coll-card ${found ? '' : 'locked'}`} style={{ '--card': found ? core.color : '#2a3040' }} data-id={core.id}>
      <div class="coll-head">
        <ShapeIcon shape={core.shape} color={found ? core.color : '#555b70'} size={40} />
        <div class="coll-title">
          <b style={{ color: found ? core.color : undefined }}>{coreName(core)}</b>
          {found ? <span class="core-sig">{core.signature}</span> : <span class="coll-hint">LOCKED · {hint ?? 'Unlock by playing.'}</span>}
        </div>
      </div>
      {found && (
        <>
          <p class="core-ult">
            <b>{core.ultimate.name}.</b> {core.ultimate.description}
          </p>
          <dl class="coll-stats">
            {coreRecords(core, stats).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
            <div>
              <dt>Best round</dt>
              <dd>{save.stats.bestRound[core.id] ?? 0}</dd>
            </div>
            <div>
              <dt>Best Ascension</dt>
              <dd>{save.bestAscension[core.id] ?? 0}</dd>
            </div>
          </dl>
        </>
      )}
    </li>
  );
}

function ModEntry({ mod, found }: { mod: ModDef; found: boolean }) {
  const hint = featFor('mod', mod.id)?.hint;
  return (
    <li class={`coll-mod ${found ? '' : 'locked'}`} data-id={mod.id}>
      {found ? <ModIcon mod={mod} level={1} size="md" /> : <span class="mod-icon md empty"><span class="g">?</span></span>}
      <div class="coll-title">
        <b>
          {mod.name} <span class={`rar ${mod.rarity}`}>{mod.rarity}</span> <span class="tag">{mod.group}</span>
        </b>
        {found ? (
          <>
            <span class="coll-text">{mod.text(1)}</span>
            <span class="coll-text dim">Lv 3: {mod.text(3)}</span>
          </>
        ) : (
          <span class="coll-hint">LOCKED · {hint ?? 'Unlock by playing.'}</span>
        )}
      </div>
    </li>
  );
}

/** Every Core and Mod: found ones in full, locked ones with the feat that unlocks them. */
export function CollectionScreen({ game, onDone }: { game: Game; onDone(): void }) {
  useBack(() => {
    onDone();
    return true;
  });
  const [tab, setTab] = useState<'cores' | 'mods'>('cores');
  const save = game.save.value;
  const p = collectionProgress(save);
  // Found first, then locked, each in content order.
  const sortedMods = [...mods].sort((a, b) => Number(save.unlocks.mods.includes(b.id)) - Number(save.unlocks.mods.includes(a.id)));
  return (
    <main class="screen collection">
      <h2>COLLECTION</h2>
      <p class="lede center progress" id="progress">
        <b>{p.found}</b> / {p.total} found
      </p>
      <div class="seg" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'cores'} class={tab === 'cores' ? 'on' : ''} onClick={() => setTab('cores')}>
          Cores {p.cores[0]}/{p.cores[1]}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'mods'} class={tab === 'mods' ? 'on' : ''} onClick={() => setTab('mods')}>
          Mods {p.mods[0]}/{p.mods[1]}
        </button>
      </div>
      {tab === 'cores' ? (
        <ul class="coll-list">
          {cores.map((c) => (
            <CoreEntry key={c.id} core={c} save={save} />
          ))}
        </ul>
      ) : (
        <ul class="coll-list">
          {sortedMods.map((m) => (
            <ModEntry key={m.id} mod={m} found={save.unlocks.mods.includes(m.id)} />
          ))}
        </ul>
      )}
      <button type="button" class="secondary" onClick={onDone}>
        Back
      </button>
    </main>
  );
}
