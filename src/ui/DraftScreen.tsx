import type { CoreDef, ModDef, ModPick } from '../sim/abilities';

interface Props {
  core: CoreDef;
  build: readonly ModPick[];
  offer: readonly ModDef[];
  heading: string;
  hint: string | null;
  onPick(mod: ModDef): void;
  onSkip(): void;
}

/** Pick 1 of 3 Mods. Owned Mods show the level they would go to. */
export function DraftScreen({ core, build, offer, heading, hint, onPick, onSkip }: Props) {
  return (
    <main class="draft">
      <h2>{heading}</h2>
      {hint && <p class="lede">{hint}</p>}
      <div class="cards">
        {offer.map((m) => {
          const owned = build.find((p) => p.mod.id === m.id);
          const level = owned ? owned.level + 1 : 1;
          return (
            <button key={m.id} type="button" class={`mod-card ${m.rarity}`} onClick={() => onPick(m)}>
              <span class="mod-glyph">{m.glyph}</span>
              <span class="mod-name">
                {m.name} {owned ? <em>→ Lv {level}</em> : null}
              </span>
              <span class="mod-text">{m.text(level)}</span>
              <span class="mod-tags">
                {m.group} · {m.rarity}
              </span>
            </button>
          );
        })}
      </div>
      <div class="build-line">
        <span class="muted">{core.name}</span>
        {build.map((p) => (
          <span key={p.mod.id} class="mod-chip static" title={p.mod.text(p.level)}>
            {p.mod.glyph}
            {p.level > 1 && <sub>{p.level}</sub>}
          </span>
        ))}
      </div>
      <button type="button" class="secondary" onClick={onSkip}>
        Skip
      </button>
    </main>
  );
}
