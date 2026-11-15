import type { CoreDef } from '../sim/abilities';

const ricochetValues = {
  /** Beam length at match start. */
  startBeam: 60,
  /** Beam length gained per hit. */
  beamPerHit: 38,
};

/**
 * Trails a beam that captures every cell it sweeps. After each turn the beam swings round to trail
 * behind again, sweeping an arc, so area per bounce grows with the square of its length.
 */
export const ricochet: CoreDef = {
  id: 'ricochet',
  name: 'Ricochet',
  colorName: 'CRIMSON',
  color: '#ff3355',
  altColorName: 'SCARLET',
  altColor: '#ff8a3d',
  shape: 'diamond',
  signature: `Trails a beam that sweeps cells as it swings. The beam grows ${ricochetValues.beamPerHit} per hit.`,
  stackLabel: 'Beam',
  values: ricochetValues,
  hooks: {
    onMatchStart(ctx) {
      ctx.addStacks(ricochetValues.startBeam);
      ctx.addStat('beamLength', ricochetValues.startBeam);
    },
    onHit(ctx) {
      ctx.addStacks(ricochetValues.beamPerHit);
      ctx.addStat('beamLength', ricochetValues.beamPerHit);
      ctx.triggered();
    },
  },
};

const splitterValues = {
  /** Hits needed per split. */
  splitEvery: 7,
  /** Split size relative to the primary. */
  splitRadius: 0.7,
  /** Split speed relative to the primary. */
  splitSpeed: 0.7,
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
  hooks: {
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
