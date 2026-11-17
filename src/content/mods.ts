import type { ModDef } from '../sim/abilities';
import { at, frontierCells, hasNeighborOwnedBy, nearestEnemyCells, share } from './helpers';
import { tuning } from './tuning';

/** Growth Spurt counts every capture, beam sweeps included, so it needs many. */
const GROWTH_EVERY = 20;

/**
 * Counter slots. Cores use 0 to 9. A Mod's first counter is `20 + its index in the mods array`,
 * its second is `60 + index` (bank 1). Landmines also reserves 100 to 105 for its mine list.
 * Always go through `slot` so no two Mods share one.
 */
const slotCache: Record<string, number> = {};
function slot(id: string, bank: 0 | 1 = 0): number {
  let i = slotCache[id];
  if (i === undefined) {
    i = mods.findIndex((m) => m.id === id);
    if (i < 0) throw new Error(`Unknown mod ${id}`);
    slotCache[id] = i;
  }
  return (bank === 0 ? 20 : 60) + i;
}
/** Up to `n` entries of `cells`, picked without replacement. */
function pickSome(ctx: { rng: { int(n: number): number } }, cells: number[], n: number): number[] {
  const out: number[] = [];
  const pool = cells.slice();
  while (out.length < n && pool.length > 0) out.push(pool.splice(ctx.rng.int(pool.length), 1)[0]!);
  return out;
}
const MINES = 100;
const MAX_MINES = 6;

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
    text: (l) => `Gain ${at(l, [0.5, 0.7, 1])}% of base speed each time your main runner hits, for the rest of the match.`,
    hooks: {
      onHit(ctx, hit, l) {
        // Main runner only: counting every split's hits made it run away with Splitter.
        if (!hit.runner.primary) return;
        ctx.addStat('speed', tuning.runner.speed * at(l, [0.005, 0.007, 0.01]));
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
    text: (l) => `Every ${GROWTH_EVERY} captures, gain ${at(l, [4, 5, 7])} capture radius, up to ${at(l, [40, 55, 70])}.`,
    hooks: {
      onCapture(ctx, _cell, l) {
        const n = ctx.counter(slot('growth-spurt')) + 1;
        ctx.setCounter(slot('growth-spurt'), n % GROWTH_EVERY);
        if (n % GROWTH_EVERY !== 0) return;
        const room = at(l, [40, 55, 70]) - ctx.world.sides[ctx.side].stats.captureRadius.add;
        if (room <= 0) return;
        ctx.addStat('captureRadius', Math.min(room, at(l, [4, 5, 7])));
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
    text: (l) => `Every 10 s, Shield: your cells cannot be taken for ${at(l, [1.2, 1.7, 2.4])} s.`,
    intervalSeconds: () => 10,
    hooks: {
      onInterval(ctx, l) {
        ctx.shield(at(l, [1.2, 1.7, 2.4]));
        ctx.triggered();
      },
    },
  },
  {
    id: 'magnet',
    name: 'Magnet',
    glyph: '∩',
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
    text: (l) => `Your ultimate fires again ${l === 1 ? 'once' : l === 2 ? 'twice' : 'three times'}, 5 s apart.`,
    hooks: {
      onUltimate(ctx, l) {
        for (let i = 1; i <= l; i++) ctx.echoUltimate(5 * i);
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
    text: (l) => `Begin each match with ${at(l, [2, 3, 5])} hits already counted.`,
    hooks: {
      onMatchStart(ctx, l) {
        ctx.addHits(at(l, [2, 3, 5]));
        ctx.triggered();
      },
    },
  },
  {
    id: 'compound',
    name: 'Compound',
    glyph: '⊕',
    rarity: 'rare',
    group: 'Scaling',
    text: (l) => `Every ${at(l, [15, 12, 10])} s, your Core's signature grows ${at(l, [8, 15, 22])}%.`,
    intervalSeconds: (l) => at(l, [15, 12, 10]),
    hooks: {
      onInterval(ctx, l) {
        ctx.boostCore(at(l, [1.08, 1.15, 1.22]));
        ctx.triggered();
      },
    },
  },
  {
    id: 'echo',
    name: 'Echo',
    glyph: '≈',
    rarity: 'uncommon',
    group: 'Trigger',
    text: (l) => `Every 3rd time your Core's signature fires (at most once per ${at(l, [9, 7, 6])} s), it grows ${at(l, [5, 7, 10])}% more.`,
    hooks: {
      onCoreTrigger(ctx, l) {
        // Cooldown (also stops a Core whose boost fires its own signature from recursing into Echo):
        // Cores that trigger every second would otherwise compound without limit.
        const stamp = slot('echo', 1);
        const now = ctx.world.step / tuning.sim.stepsPerSecond;
        const last = ctx.counter(stamp);
        if (last > 0 && now - (last - 1) < at(l, [9, 7, 6])) return;
        const n = ctx.counter(slot('echo')) + 1;
        if (n < 3) {
          ctx.setCounter(slot('echo'), n);
          return;
        }
        ctx.setCounter(slot('echo'), 0);
        ctx.setCounter(stamp, now + 1);
        ctx.boostCore(at(l, [1.05, 1.07, 1.1]));
        ctx.triggered();
      },
    },
  },
  {
    id: 'hair-trigger',
    name: 'Hair Trigger',
    glyph: '↯',
    rarity: 'rare',
    group: 'Trigger',
    text: (l) => `Your Core's "every N hits" effects need ${at(l, [1, 2, 3])} fewer hits.`,
    hooks: {
      onMatchStart(ctx, l) {
        ctx.addStat('triggerDiscount', l);
        ctx.triggered();
      },
    },
  },
  {
    id: 'clash-engine',
    name: 'Clash Engine',
    glyph: '✕',
    rarity: 'uncommon',
    group: 'Trigger',
    text: (l) => `Each clash with an enemy runner counts as ${at(l, [1, 2, 3]) + 1} hits.`,
    hooks: {
      onHit(ctx, hit, l) {
        if (hit.kind !== 'clash') return;
        ctx.addHits(at(l, [1, 2, 3]));
        ctx.triggered();
      },
    },
  },
  {
    id: 'wall-hugger',
    name: 'Wall Hugger',
    glyph: '▣',
    rarity: 'common',
    group: 'Trigger',
    text: (l) => `When your main runner bounces off a wall, capture the ${at(l, [1, 1, 2])} enemy cells nearest the bounce.`,
    hooks: {
      onHit(ctx, hit, l) {
        if (hit.kind !== 'wall' || !hit.runner.primary) return;
        const cells = nearestEnemyCells(ctx.world, ctx.side, hit.runner.x, hit.runner.y, at(l, [1, 1, 2]));
        if (cells.length === 0) return;
        for (const c of cells) ctx.captureCell(c);
        ctx.triggered();
      },
    },
  },
  {
    id: 'scorched-trail',
    name: 'Scorched Trail',
    glyph: '≡',
    rarity: 'common',
    group: 'Territory',
    text: (l) => `Cells you capture cannot be retaken for ${at(l, [0.5, 0.8, 1.2])} s.`,
    hooks: {
      onCapture(ctx, cell, l) {
        // A runner takes a few cells a step; a shockwave or blast takes dozens at once. Only the
        // first few captures of a step are locked, so big bursts do not become untouchable.
        const stamp = slot('scorched-trail', 1);
        const step = ctx.world.step;
        const v = ctx.counter(stamp);
        const used = Math.floor(v / 64) === step ? v % 64 : 0;
        if (used >= 4) return;
        ctx.setCounter(stamp, step * 64 + used + 1);
        ctx.lockCells([cell], at(l, [0.5, 0.8, 1.2]));
        // Fires on every capture; flash the icon only now and then.
        const n = ctx.counter(slot('scorched-trail')) + 1;
        ctx.setCounter(slot('scorched-trail'), n % 12);
        if (n % 12 === 0) ctx.triggered();
      },
    },
  },
  {
    id: 'ramparts',
    name: 'Ramparts',
    glyph: '▦',
    rarity: 'common',
    group: 'Territory',
    text: (l) => `Every ${at(l, [12, 10, 8])} s, your cells with no enemy neighbour gain a shield point (up to ${at(l, [1, 1, 2])}), on at most ${at(l, [5, 8, 12])} cells.`,
    intervalSeconds: (l) => at(l, [12, 10, 8]),
    hooks: {
      onInterval(ctx, l) {
        const w = ctx.world;
        const cap = at(l, [1, 1, 2]);
        const cells: number[] = [];
        for (let i = 0; i < w.arena.cellCount; i++) {
          if (w.owner[i] === ctx.side && w.cellShield[i]! < cap && !hasNeighborOwnedBy(w, i, ctx.enemy)) cells.push(i);
        }
        if (cells.length === 0) return;
        ctx.shieldCells(pickSome(ctx, cells, at(l, [5, 8, 12])), 1);
        ctx.triggered();
      },
    },
  },
  {
    id: 'encircle',
    name: 'Encircle',
    glyph: '◉',
    rarity: 'rare',
    group: 'Territory',
    text: (l) =>
      l === 1
        ? 'After you capture a cell, a neighbouring enemy cell with no enemy neighbour flips to you.'
        : l === 2
          ? 'After you capture a cell, enemy cells within two steps with no enemy neighbour flip to you.'
          : 'After you capture a cell, enemy cells within two steps with at most one enemy neighbour flip to you.',
    hooks: {
      onCapture(ctx, cell, l) {
        const w = ctx.world;
        const foe = ctx.enemy;
        const maxFoes = l >= 3 ? 1 : 0;
        const isolated = (c: number): boolean => {
          if (w.owner[c] !== foe) return false;
          const ns = w.arena.neighbors[c]!;
          let foes = 0;
          for (let k = 0; k < ns.length; k++) if (w.owner[ns[k]!] === foe) foes++;
          return foes <= maxFoes;
        };
        const flips: number[] = [];
        const ring = w.arena.neighbors[cell]!;
        for (let k = 0; k < ring.length; k++) {
          const a = ring[k]!;
          if (isolated(a) && !flips.includes(a)) flips.push(a);
          if (l < 2) continue;
          const ns = w.arena.neighbors[a]!;
          for (let j = 0; j < ns.length; j++) {
            const b = ns[j]!;
            if (isolated(b) && !flips.includes(b)) flips.push(b);
          }
        }
        if (flips.length === 0) return;
        for (const c of flips) if (w.owner[c] === foe) ctx.captureCell(c);
        ctx.triggered();
      },
    },
  },
  {
    id: 'landmines',
    name: 'Landmines',
    glyph: '✦',
    rarity: 'uncommon',
    group: 'Territory',
    text: (l) => `Every ${at(l, [7, 6, 5])} s, mine one of your frontier cells. When the enemy takes it, blast ${at(l, [110, 140, 170])} around it.`,
    intervalSeconds: (l) => at(l, [7, 6, 5]),
    hooks: {
      onInterval(ctx) {
        let free = -1;
        const mined: number[] = [];
        for (let k = 0; k < MAX_MINES; k++) {
          const v = ctx.counter(MINES + k);
          if (v === 0) {
            if (free < 0) free = k;
          } else mined.push(v - 1);
        }
        if (free < 0) return;
        const front = frontierCells(ctx.world, ctx.side).filter((c) => !mined.includes(c));
        if (front.length === 0) return;
        ctx.setCounter(MINES + free, front[ctx.rng.int(front.length)]! + 1);
        ctx.triggered();
      },
      onCellLost(ctx, cell, l) {
        for (let k = 0; k < MAX_MINES; k++) {
          if (ctx.counter(MINES + k) !== cell + 1) continue;
          ctx.setCounter(MINES + k, 0);
          const c = ctx.world.arena.centroids;
          ctx.blast(c[cell * 2]!, c[cell * 2 + 1]!, at(l, [110, 140, 170]));
          ctx.triggered();
          return;
        }
      },
    },
  },
  {
    id: 'critical-mass',
    name: 'Critical Mass',
    glyph: '✺',
    rarity: 'rare',
    group: 'Territory',
    text: (l) => `The first time you hold ${at(l, [60, 57, 54])}% of the map, blast 300 around your runner and move ${at(l, [15, 20, 25])}% faster for the rest of the match.`,
    hooks: {
      onCapture(ctx, _cell, l) {
        if (ctx.counter(slot('critical-mass'))) return;
        if (share(ctx.world, ctx.side) < at(l, [0.6, 0.57, 0.54])) return;
        ctx.setCounter(slot('critical-mass'), 1);
        const r = ctx.primary();
        if (!r) return;
        ctx.blast(r.x, r.y, 300);
        ctx.mulStat('speed', at(l, [1.15, 1.2, 1.25]));
        ctx.triggered();
      },
    },
  },
  {
    id: 'underdog',
    name: 'Underdog',
    glyph: '▼',
    rarity: 'common',
    group: 'Timing',
    text: (l) => `While behind, move ${at(l, [10, 15, 20])}% faster.`,
    hooks: {
      onLeadChange(ctx, ahead, l) {
        const on = ctx.counter(slot('underdog')) === 1;
        const f = at(l, [1.1, 1.15, 1.2]);
        if (!ahead && !on) {
          ctx.setCounter(slot('underdog'), 1);
          ctx.mulStat('speed', f);
          ctx.triggered();
        } else if (ahead && on) {
          ctx.setCounter(slot('underdog'), 0);
          ctx.mulStat('speed', 1 / f);
        }
      },
    },
  },
  {
    id: 'buzzer-beater',
    name: 'Buzzer Beater',
    glyph: '◔',
    rarity: 'uncommon',
    group: 'Timing',
    text: (l) => `In the final 8 s, your Core's signature grows ${at(l, [6, 10, 14])}% every 2 s.`,
    intervalSeconds: () => 2,
    hooks: {
      onInterval(ctx, l) {
        const left = ctx.secondsLeft();
        if (left <= 0 || left > 8) return;
        ctx.boostCore(at(l, [1.06, 1.1, 1.14]));
        ctx.triggered();
      },
    },
  },
  {
    id: 'front-runner',
    name: 'Front Runner',
    glyph: '▲',
    rarity: 'common',
    group: 'Timing',
    text: (l) => `While ahead, every ${at(l, [12, 9, 7])} s ${at(l, [5, 8, 10])} of your frontier cells gain a shield point (up to ${at(l, [1, 1, 2])}).`,
    intervalSeconds: (l) => at(l, [12, 9, 7]),
    hooks: {
      onInterval(ctx, l) {
        if (ctx.world.leader !== ctx.side) return;
        const cap = at(l, [1, 1, 2]);
        const cells = frontierCells(ctx.world, ctx.side).filter((c) => ctx.world.cellShield[c]! < cap);
        if (cells.length === 0) return;
        ctx.shieldCells(pickSome(ctx, cells, at(l, [5, 8, 10])), 1);
        ctx.triggered();
      },
    },
  },
  {
    id: 'comeback',
    name: 'Comeback',
    glyph: '↻',
    rarity: 'uncommon',
    group: 'Timing',
    text: (l) => `When you lose the lead, Surge: move 30% faster for ${at(l, [2, 3, 4])} s.`,
    hooks: {
      onLeadChange(ctx, ahead, l) {
        const s = slot('comeback');
        if (ahead) {
          ctx.setCounter(s, 1);
          return;
        }
        if (!ctx.counter(s)) return;
        ctx.setCounter(s, 0);
        ctx.surge(1.3, at(l, [2, 3, 4]));
        ctx.triggered();
      },
    },
  },
  {
    id: 'scavenger',
    name: 'Scavenger',
    glyph: '✚',
    rarity: 'common',
    group: 'Economy',
    text: (l) => `Gain ${at(l, [1, 2, 3])} reroll${l === 1 ? '' : 's'} after every win.`,
    run: (l) => ({ rerollsPerWin: at(l, [1, 2, 3]) }),
    hooks: {},
  },
  {
    id: 'collector',
    name: 'Collector',
    glyph: '❖',
    rarity: 'common',
    group: 'Economy',
    text: (l) => `After a win by ${at(l, [20, 15, 10])} cells or more, the next draft offers one more Mod.`,
    run: (l) => ({ extraOffers: 1, bigWinMargin: at(l, [20, 15, 10]) }),
    hooks: {},
  },
  {
    id: 'glass-cannon',
    name: 'Glass Cannon',
    glyph: '✹',
    rarity: 'rare',
    group: 'Wild',
    text: (l) => `Move ${at(l, [8, 15, 22])}% faster, but start the match holding only ${at(l, [48, 47, 46])}% of the map.`,
    hooks: {
      onMatchStart(ctx, l) {
        ctx.mulStat('speed', at(l, [1.08, 1.15, 1.22]));
        const w = ctx.world;
        const over = w.counts[ctx.side] - Math.round(w.arena.cellCount * at(l, [0.48, 0.47, 0.46]));
        if (over > 0) ctx.cedeCells(over);
        ctx.triggered();
      },
    },
  },
  {
    id: 'decoy',
    name: 'Decoy',
    glyph: '◌',
    rarity: 'uncommon',
    group: 'Wild',
    text: (l) => `Start the match with ${at(l, [1, 1, 2])} extra small, slow runner${l === 3 ? 's' : ''}${l === 2 ? ' (a little bigger and faster)' : ''}.`,
    hooks: {
      onMatchStart(ctx, l) {
        const r = ctx.primary();
        if (!r) return;
        for (let i = 0; i < at(l, [1, 1, 2]); i++) ctx.spawnRunner(r, { radiusMul: at(l, [0.5, 0.55, 0.5]), speedMul: at(l, [0.06, 0.09, 0.04]) });
        ctx.triggered();
      },
    },
  },
  {
    id: 'second-wind',
    name: 'Second Wind',
    glyph: '♥',
    rarity: 'uncommon',
    group: 'Wild',
    text: (l) => `Once per match, when you fall under 30% of the map: Shield for ${at(l, [1.5, 2.2, 3])} s and Surge for ${at(l, [2, 3, 4])} s.`,
    hooks: {
      onCellLost(ctx, _cell, l) {
        if (ctx.counter(slot('second-wind'))) return;
        if (share(ctx.world, ctx.side) >= 0.3) return;
        ctx.setCounter(slot('second-wind'), 1);
        ctx.shield(at(l, [1.5, 2.2, 3]));
        ctx.surge(1.4, at(l, [2, 3, 4]));
        ctx.triggered();
      },
    },
  },
  {
    id: 'quick-hands',
    name: 'Quick Hands',
    glyph: '⇉',
    rarity: 'rare',
    group: 'Ultimate',
    text: (l) => `Your ultimate is ready again ${at(l, [24, 16, 11])} s after you use it${l === 3 ? ', twice' : ''}.`,
    hooks: {
      onUltimate(ctx, l) {
        const used = ctx.counter(slot('quick-hands'));
        if (used >= at(l, [1, 1, 2])) return;
        ctx.setCounter(slot('quick-hands'), used + 1);
        ctx.triggered();
        ctx.after(at(l, [24, 16, 11]), (c) => {
          c.grantUltimate();
          c.triggered();
        });
      },
    },
  },
  {
    id: 'hoarder',
    name: 'Hoarder',
    glyph: '★',
    rarity: 'common',
    group: 'Pickup',
    text: (l) => `Each pickup you grab also gives ${at(l, [4, 6, 9])}% of base speed for the match.`,
    hooks: {
      onPickup(ctx, _kind, l) {
        ctx.addStat('speed', tuning.runner.speed * at(l, [0.04, 0.06, 0.09]));
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
