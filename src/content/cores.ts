import type { CoreDef } from '../sim/abilities';
import { primaryOf } from '../sim/input';
import { statValue, type SideIndex, type World } from '../sim/world';

/** Enemy cells whose centre lies within `radius` of the side's primary runner. */
function enemyCellsNear(world: Readonly<World>, side: SideIndex, radius: number): number {
  const r = primaryOf(world as World, side);
  if (!r) return 0;
  const c = world.arena.centroids;
  let n = 0;
  for (let i = 0; i < world.arena.cellCount; i++) {
    if (world.owner[i] === side) continue;
    const dx = c[i * 2]! - r.x;
    const dy = c[i * 2 + 1]! - r.y;
    if (dx * dx + dy * dy <= radius * radius) n++;
  }
  return n;
}

const ricochetValues = {
  /** Beam length at match start. */
  startBeam: 60,
  /** Beam length gained per hit. */
  beamPerHit: 40,
  /** 1 = after every hit the beam swings back to trailing, sweeping the turn. 0 = it snaps. */
  swingOnHit: 1,
  /** Full turns the beam spins on the ultimate, and its reach while spinning. */
  spinTurns: 1,
  spinReach: 300,
};

/**
 * Trails a beam that captures every cell it covers. After each hit the beam swings back to
 * trail behind, sweeping the turn. Its ultimate, Spin, sweeps full circles.
 */
export const ricochet: CoreDef = {
  id: 'ricochet',
  name: 'Ricochet',
  colorName: 'CRIMSON',
  color: '#ff3355',
  altColorName: 'SCARLET',
  altColor: '#ff8a3d',
  shape: 'diamond',
  signature: `Trails a beam that sweeps cells as it swings after each bounce. The beam grows ${ricochetValues.beamPerHit} per hit.`,
  stackLabel: 'Beam',
  values: ricochetValues,
  ultimate: {
    name: 'Spin',
    description: `Your beam spins a full circle (up to ${ricochetValues.spinReach} long), capturing everything it sweeps.`,
    // Worth it when many enemy cells sit inside the circle the beam would sweep.
    value: (world, side) => enemyCellsNear(world, side, Math.min(ricochetValues.spinReach, statValue(world.sides[side], 'beamLength'))),
    threshold: 22,
  },
  hooks: {
    onUltimate(ctx) {
      ctx.spinBeam(ricochetValues.spinTurns, ricochetValues.spinReach);
      ctx.triggered();
    },
    onMatchStart(ctx) {
      ctx.addStacks(ricochetValues.startBeam);
      ctx.addStat('beamLength', ricochetValues.startBeam);
    },
    onHit(ctx) {
      ctx.addStacks(ricochetValues.beamPerHit);
      ctx.addStat('beamLength', ricochetValues.beamPerHit);
      if (ricochetValues.swingOnHit) ctx.swingBeam();
      ctx.triggered();
    },
  },
};

const splitterValues = {
  /** Hits needed per split. */
  splitEvery: 8,
  /** Split size relative to the primary. */
  splitRadius: 0.7,
  /** Split speed relative to the primary. */
  splitSpeed: 0.7,
  /** Burst spawns one split for every this many splits you already have (at least one). */
  burstPer: 3,
  /** Controllers fire Burst once you have this many splits. */
  burstAtSplits: 3,
};

/** Every few hits, spawns a smaller permanent split. Slow, then explosive. */
export const splitter: CoreDef = {
  id: 'splitter',
  name: 'Splitter',
  colorName: 'MAGENTA',
  color: '#d24dff',
  altColorName: 'VIOLET',
  altColor: '#7a6cff',
  shape: 'hexagon',
  signature: `Every ${splitterValues.splitEvery} hits, spawns a smaller permanent split.`,
  stackLabel: 'Splits',
  values: splitterValues,
  ultimate: {
    name: 'Burst',
    description: `Instantly spawns one split for every ${splitterValues.burstPer} you have (at least one).`,
    // Burst scales with the splits already out, so it is worth waiting for.
    value: (world, side) => world.sides[side].runnerCount - 1,
    threshold: splitterValues.burstAtSplits,
  },
  hooks: {
    onUltimate(ctx) {
      const r = ctx.primary();
      if (!r) return;
      const n = Math.max(1, Math.floor((ctx.world.sides[ctx.side].runnerCount - 1) / splitterValues.burstPer));
      for (let i = 0; i < n; i++) {
        if (ctx.spawnRunner(r, { radiusMul: splitterValues.splitRadius, speedMul: splitterValues.splitSpeed })) ctx.addStacks(1);
      }
      ctx.triggered();
    },
    onHit(ctx, hit) {
      const n = ctx.counter(0) + 1;
      if (n < splitterValues.splitEvery) {
        ctx.setCounter(0, n);
        return;
      }
      ctx.setCounter(0, 0);
      ctx.spawnRunner(hit.runner, { radiusMul: splitterValues.splitRadius, speedMul: splitterValues.splitSpeed });
      ctx.addStacks(1);
      ctx.triggered();
    },
  },
};

export const cores: readonly CoreDef[] = [ricochet, splitter];

export function coreById(id: string): CoreDef {
  const c = cores.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown core ${id}`);
  return c;
}
