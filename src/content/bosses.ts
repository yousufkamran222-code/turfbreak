import type { MatchTwist } from '../sim/world';

/**
 * Bosses (MASTER_PROMPT 5.8 rule 5). A boss has a fixed Core, a hand-authored
 * ordered build (taken like a rival's, with `rivalScaling.bossPicks` extra
 * picks) and a match twist. The player is always side 0 and the boss side 1.
 * A boss whose Core does not exist (yet) is left out of the rotation.
 */
export interface BossDef {
  readonly id: string;
  /** In capitals, for the VS card. */
  readonly name: string;
  readonly coreId: string;
  readonly mods: readonly string[];
  readonly twist: MatchTwist;
  /** One line for the VS card. */
  readonly description: string;
}

export const bosses: readonly BossDef[] = [
  {
    id: 'twins',
    name: 'THE TWINS',
    coreId: 'splitter',
    mods: ['head-start', 'overclock', 'magnet', 'afterburner', 'head-start', 'encore', 'overclock', 'afterburner', 'magnet', 'encore'],
    twist: { extraPrimaries: [0, 1] },
    description: 'Starts with two main runners.',
  },
  {
    id: 'wall',
    name: 'THE WALL',
    coreId: 'fortress',
    mods: ['bulwark', 'ramparts', 'front-runner', 'compound', 'bulwark', 'scorched-trail', 'ramparts', 'front-runner', 'compound', 'scorched-trail'],
    twist: { startShields: [0, 1] },
    description: 'Every cell it starts with is shielded once.',
  },
  {
    id: 'landlord',
    name: 'THE LANDLORD',
    coreId: 'bloom',
    mods: ['chain-reaction', 'encircle', 'bulwark', 'growth-spurt', 'chain-reaction', 'compound', 'encircle', 'bulwark', 'growth-spurt', 'compound'],
    twist: { startShare: 0.38 },
    description: 'Owns most of the map before the match starts: you start with 38%.',
  },
  {
    id: 'marathon',
    name: 'THE MARATHON',
    coreId: 'ricochet',
    mods: ['growth-spurt', 'compound', 'overclock', 'shockwave', 'growth-spurt', 'encore', 'compound', 'overclock', 'shockwave', 'encore'],
    twist: { durationSeconds: 60, pickupEverySeconds: 3 },
    description: 'A 60-second match with pickups twice as often.',
  },
];
