import type { CoreDef, ModPick } from '../sim/abilities';
import type { SideIndex } from '../sim/world';
import type { Hud as HudState } from './session';
import type { SideLook } from './sides';

interface PanelProps {
  hud: HudState;
  side: SideIndex;
  core: CoreDef;
  look: SideLook;
  mods: readonly ModPick[];
  /** "YOU", "RIVAL" or a neutral label. */
  tag: string;
  /** Right panel only: the live trigger log. */
  log?: boolean;
}

/**
 * Desktop and landscape side panel (MASTER_PROMPT 6.4): one side's build with
 * Mod names, and on the right a live log of Core and Mod triggers. Hidden in
 * portrait by CSS.
 */
export function SidePanel({ hud, side, core, look, mods, tag, log }: PanelProps) {
  const entries = log ? hud.log.value : [];
  return (
    <aside class={`side-panel side-${side}`} style={{ '--c': look.color }} aria-label={`${look.name} build`}>
      <div class="sp-tag">{tag}</div>
      <div class="sp-name" style={{ color: look.color }}>
        {look.name}
      </div>
      <div class="sp-sig">
        {core.stackLabel} <b>{Number.isInteger(hud.stacks[side].value) ? hud.stacks[side].value : hud.stacks[side].value.toFixed(1)}</b>
      </div>
      <h3>Build</h3>
      {mods.length === 0 ? (
        <p class="sp-none">No Mods</p>
      ) : (
        <ul class="sp-mods">
          {mods.map((m) => (
            <li key={m.mod.id} class={m.mod.rarity}>
              <span class="g">{m.mod.glyph}</span>
              <span class="sp-mod-text">
                <b>
                  {m.mod.name} {m.level}
                </b>
                <small>{m.mod.text(m.level)}</small>
              </span>
            </li>
          ))}
        </ul>
      )}
      {log && (
        <>
          <h3>Triggers</h3>
          <ul class="sp-log" aria-live="off">
            {entries.length === 0 && <li class="none">Nothing yet</li>}
            {[...entries].reverse().map((e) => (
              <li key={e.id} class={`side-${e.side}`}>
                <span class="g">{e.glyph}</span>
                <span>{e.label}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}
