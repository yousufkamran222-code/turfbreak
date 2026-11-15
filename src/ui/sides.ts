import type { CoreDef } from '../sim/abilities';
import type { SideIndex } from '../sim/world';

export interface SideLook {
  name: string;
  colorWord: string;
  coreWord: string;
  color: string;
}

/** Side B swaps to the Core's alternate colour in a mirror match, so the sides never share a colour. */
export function sideLook(cores: readonly [CoreDef, CoreDef], side: SideIndex): SideLook {
  const core = cores[side];
  const mirror = cores[0].id === cores[1].id;
  const alt = side === 1 && mirror;
  const colorWord = alt ? core.altColorName : core.colorName;
  const coreWord = core.name.toUpperCase();
  return { name: `${colorWord} ${coreWord}`, colorWord, coreWord, color: alt ? core.altColor : core.color };
}
