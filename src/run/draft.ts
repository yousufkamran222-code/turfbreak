import { mods as allMods } from '../content/mods';
import type { ModDef, ModPick, Rarity } from '../sim/abilities';
import type { Rng } from '../sim/rng';

/** Rarity weights for offers; later rounds tilt toward rares. */
const RARITY_WEIGHT: Record<Rarity, (round: number) => number> = {
  common: () => 6,
  uncommon: (r) => 3 + r,
  rare: (r) => 1 + r,
};

export const MAX_MODS = 6;
export const MAX_LEVEL = 3;

/** Mods that can still be offered: not at max level, and new ones only while there is a free slot. */
function eligible(build: readonly ModPick[]): ModDef[] {
  return allMods.filter((m) => {
    const owned = build.find((p) => p.mod.id === m.id);
    if (owned) return owned.level < MAX_LEVEL;
    return build.length < MAX_MODS;
  });
}

/** Offer up to `count` distinct Mods, weighted by rarity and round. */
export function offerMods(build: readonly ModPick[], round: number, count: number, rng: Rng): ModDef[] {
  const pool = eligible(build);
  const offer: ModDef[] = [];
  while (offer.length < count && pool.length > 0) {
    const weights = pool.map((m) => RARITY_WEIGHT[m.rarity](round));
    let roll = rng.next() * weights.reduce((a, b) => a + b, 0);
    let i = 0;
    while (i < pool.length - 1 && roll >= weights[i]!) roll -= weights[i++]!;
    offer.push(pool.splice(i, 1)[0]!);
  }
  return offer;
}

/** Add a Mod to a build, or level it up if already owned. Slot order is kept. */
export function takeMod(build: readonly ModPick[], mod: ModDef): ModPick[] {
  const i = build.findIndex((p) => p.mod.id === mod.id);
  if (i < 0) return [...build, { mod, level: 1 }];
  return build.map((p, k) => (k === i ? { mod: p.mod, level: Math.min(MAX_LEVEL, p.level + 1) } : p));
}

/** A rival build with `picks` random draft picks, as if it had drafted too. */
export function rivalBuild(picks: number, round: number, rng: Rng): ModPick[] {
  let build: ModPick[] = [];
  for (let i = 0; i < picks; i++) {
    const offer = offerMods(build, round, 1, rng);
    if (offer[0]) build = takeMod(build, offer[0]);
  }
  return build;
}
