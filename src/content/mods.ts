import type { ModDef } from '../sim/abilities';
import { tuning } from './tuning';

/** Growth Spurt counts every capture, beam sweeps included, so it needs many. */
const GROWTH_EVERY = 25;

/** Pick a value by level (1 to 3). */
const at = <T>(level: number, values: readonly [T, T, T]): T => values[Math.min(3, Math.max(1, level)) - 1]!;

/**
 * Mods, first version (Phase 2 mini draft). Four come from the pickups
 * (Afterburner, Shockwave, Bulwark, Magnet) so their effects can be chosen,
 * not only found. Each has three levels; picking an owned Mod levels it up.
 */
export const mods: readonly ModDef[] = [
  {
    id: 'overclock',
    name: 'Overclock',
    glyph: '⚡',
    rarity: 'uncommon',
    group: 'Scaling',
    text: (l) => `Gain ${at(l, [1, 1.5, 2.5])}% of base speed each time your main runner hits, for the rest of the match.`,
    hooks: {
      onHit(ctx, hit, l) {
        // Main runner only: counting every split's hits made it run away with Splitter.
        if (!hit.runner.primary) return;
        ctx.addStat('speed', tuning.runner.speed * at(l, [0.01, 0.015, 0.025]));
        ctx.triggered();
      },
    },
  },
  {
    id: 'growth-spurt',
    name: 'Growth Spurt',
    glyph: '◎',
    rarity: 'common',
    group: 'Scaling',
    text: (l) => `Every ${GROWTH_EVERY} captures, gain ${at(l, [3, 4, 6])} capture radius, up to ${at(l, [40, 55, 70])}.`,
    hooks: {
      onCapture(ctx, _cell, l) {
        // Counter slot 30 is reserved for this Mod so it never collides with a Core's counters.
        const n = ctx.counter(30) + 1;
        ctx.setCounter(30, n % GROWTH_EVERY);
        if (n % GROWTH_EVERY !== 0) return;
        const room = at(l, [40, 55, 70]) - ctx.world.sides[ctx.side].stats.captureRadius.add;
        if (room <= 0) return;
        ctx.addStat('captureRadius', Math.min(room, at(l, [3, 4, 6])));
        ctx.triggered();
      },
    },
  },
  {
    id: 'chain-reaction',
    name: 'Chain Reaction',
    glyph: '⛓',
    rarity: 'uncommon',
    group: 'Territory',
    text: (l) => `Each capture has a ${at(l, [10, 15, 20])}% chance to flip a neighbouring enemy cell. It can chain.`,
    hooks: {
      onCapture(ctx, cell, l) {
        if (ctx.rng.next() >= at(l, [0.1, 0.15, 0.2])) return;
        const w = ctx.world;
        const ns = w.arena.neighbors[cell]!;
        for (let k = 0; k < ns.length; k++) {
          const j = ns[(k + ctx.rng.int(ns.length)) % ns.length]!;
          if (w.owner[j] === ctx.side) continue;
          ctx.triggered();
          ctx.captureCell(j);
          return;
        }
      },
    },
  },
  {
    id: 'afterburner',
    name: 'Afterburner',
    glyph: '»',
    rarity: 'common',
    group: 'Pickup',
    text: (l) => `Every 8 s, Surge: your runners move 40% faster for ${at(l, [2, 3, 4])} s.`,
    intervalSeconds: () => 8,
    hooks: {
      onInterval(ctx, l) {
        ctx.surge(1.4, at(l, [2, 3, 4]));
        ctx.triggered();
      },
    },
  },
  {
    id: 'shockwave',
    name: 'Shockwave',
    glyph: '✸',
    rarity: 'uncommon',
    group: 'Pickup',
    text: (l) => `Every ${at(l, [9, 7, 5])} s, Blast: capture every cell within 120 of your runner.`,
    intervalSeconds: (l) => at(l, [9, 7, 5]),
    hooks: {
      onInterval(ctx) {
        const r = ctx.primary();
        if (!r) return;
        ctx.blast(r.x, r.y, 120);
        ctx.triggered();
      },
    },
  },
  {
    id: 'bulwark',
    name: 'Bulwark',
    glyph: '◆',
    rarity: 'uncommon',
    group: 'Pickup',
    text: (l) => `Every 10 s, Shield: your cells cannot be taken for ${at(l, [1.5, 2, 3])} s.`,
    intervalSeconds: () => 10,
    hooks: {
      onInterval(ctx, l) {
        ctx.shield(at(l, [1.5, 2, 3]));
        ctx.triggered();
      },
    },
  },
  {
    id: 'magnet',
    name: 'Magnet',
    glyph: '🧲',
    rarity: 'common',
    group: 'Pickup',
    text: (l) => `Your runners grab pickups from ${at(l, [2, 2.5, 3])}× as far away.`,
    hooks: {
      onMatchStart(ctx, l) {
        ctx.setPickupReach(at(l, [2, 2.5, 3]));
      },
    },
  },
  {
    id: 'encore',
    name: 'Encore',
    glyph: '↺',
    rarity: 'rare',
    group: 'Ultimate',
    text: (l) => `Your ultimate fires again ${l === 1 ? 'once' : l === 2 ? 'twice' : 'three times'}, 1.5 s apart.`,
    hooks: {
      onUltimate(ctx, l) {
        for (let i = 1; i <= l; i++) ctx.echoUltimate(1.5 * i);
        ctx.triggered();
      },
    },
  },
  {
    id: 'head-start',
    name: 'Head Start',
    glyph: '▶',
    rarity: 'common',
    group: 'Trigger',
    text: (l) => `Begin each match with ${at(l, [3, 5, 8])} hits already counted.`,
    hooks: {
      onMatchStart(ctx, l) {
        ctx.addHits(at(l, [3, 5, 8]));
        ctx.triggered();
      },
    },
  },
];

export function modById(id: string): ModDef {
  const m = mods.find((x) => x.id === id);
  if (!m) throw new Error(`Unknown mod ${id}`);
  return m;
}
