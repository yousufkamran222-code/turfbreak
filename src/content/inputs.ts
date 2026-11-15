import type { InputMode, RedirectRules } from '../sim/input';

/** The Phase 2 input candidates, compared behind a debug switch. */
export interface InputVariant {
  id: string;
  name: string;
  mode: InputMode;
  redirect?: Partial<RedirectRules>;
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
    description: 'Tap to aim your runner at that spot. 5 s cooldown.',
  },
  {
    id: 'redirect-plus',
    name: 'Redirect+',
    mode: 'redirect',
    redirect: { cooldownSeconds: 3, countsAsHit: true },
    prompt: 'Tap to redirect',
    description: 'Tap to aim your runner. 3 s cooldown, and each redirect counts as a hit for your Core.',
  },
  {
    id: 'boost',
    name: 'Hold to boost',
    mode: 'boost',
    prompt: 'Hold to boost',
    description: 'Hold anywhere to speed up while the meter lasts.',
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
