/**
 * In-match pickups (Phase 2 iteration, from Yousuf's play feedback). A side's
 * primary runner grabs one by touching it; the effect is short. Steering to
 * pickups is what gives the redirect something concrete to aim at.
 */
export type PickupEffect =
  | { kind: 'surge'; speedMul: number; seconds: number }
  | { kind: 'blast'; radius: number }
  | { kind: 'charge' }
  | { kind: 'shield'; seconds: number };

export interface PickupDef {
  readonly id: string;
  readonly name: string;
  /** One character drawn on the orb. */
  readonly glyph: string;
  readonly color: string;
  /** Relative spawn weight. */
  readonly weight: number;
  readonly effect: PickupEffect;
  readonly description: string;
}

export const pickups: readonly PickupDef[] = [
  {
    id: 'surge',
    name: 'Surge',
    glyph: '»',
    color: '#ffd23d',
    weight: 3,
    effect: { kind: 'surge', speedMul: 1.5, seconds: 4 },
    description: 'All your runners move 50% faster for 4 s.',
  },
  {
    id: 'blast',
    name: 'Blast',
    glyph: '✸',
    color: '#ff7a3d',
    weight: 3,
    effect: { kind: 'blast', radius: 170 },
    description: 'Captures every cell around the pickup.',
  },
  {
    id: 'charge',
    name: 'Charge',
    glyph: '↻',
    color: '#5ee6ff',
    weight: 2,
    effect: { kind: 'charge' },
    description: 'Your redirect is ready again at once.',
  },
  {
    id: 'shield',
    name: 'Shield',
    glyph: '◆',
    color: '#9dff6b',
    weight: 2,
    effect: { kind: 'shield', seconds: 3 },
    description: 'Your cells cannot be taken for 3 s.',
  },
];
