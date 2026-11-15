import type { InputMode } from '../sim/input';

/**
 * Input choices on the debug screen. Phase 2's fun gate settled on Redirect;
 * No input remains for comparison and for watching.
 */
export interface InputVariant {
  id: string;
  name: string;
  mode: InputMode;
  /** One-line prompt shown five seconds in until the player first uses it. */
  prompt: string | null;
  description: string;
}

export const inputVariants: readonly InputVariant[] = [
  {
    id: 'redirect',
    name: 'Redirect',
    mode: 'redirect',
    prompt: 'Tap to redirect',
    description: 'Tap to aim your runner at that spot. 5 s cooldown. Steer into pickups; Ricochet sweeps its beam on every redirect.',
  },
  {
    id: 'none',
    name: 'No input',
    mode: 'none',
    prompt: null,
    description: 'Just watch.',
  },
];

export function inputVariantById(id: string): InputVariant {
  const v = inputVariants.find((x) => x.id === id);
  if (!v) throw new Error(`Unknown input variant ${id}`);
  return v;
}
