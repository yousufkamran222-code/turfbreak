import { ricochet, splitter } from '../src/content/cores';
import type { CoreDef } from '../src/sim/abilities';
import { addRunner, createWorld, type World } from '../src/sim/world';

/** A Core with no ability, for testing base rules in isolation. */
export const blank: CoreDef = {
  id: 'blank',
  name: 'Blank',
  colorName: 'GREY',
  color: '#888888',
  altColorName: 'SILVER',
  altColor: '#bbbbbb',
  shape: 'circle',
  signature: '',
  stackLabel: '',
  values: {},
  ultimate: { name: 'None', description: '', value: () => 0, threshold: 1 },
  hooks: {},
};

export function blankWorld(seed = 1): World {
  return createWorld({ seed, cores: [blank, blank] });
}

/** Remove all runners, then place controlled ones. */
export function clearRunners(world: World): void {
  world.runners.length = 0;
  world.sides[0].runnerCount = 0;
  world.sides[1].runnerCount = 0;
}

export function place(world: World, side: 0 | 1, x: number, y: number, dx: number, dy: number) {
  return addRunner(world, side, true, x, y, dx, dy, { radiusMul: 1, speedMul: 1 });
}

export { ricochet, splitter };
