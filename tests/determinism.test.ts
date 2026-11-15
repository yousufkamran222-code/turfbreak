import { describe, expect, it } from 'vitest';
import { hashWorld } from '../src/sim/hash';
import { checkInvariants } from '../src/sim/invariants';
import { runMatch } from '../src/sim/match';
import { stepWorld } from '../src/sim/step';
import { createWorld } from '../src/sim/world';
import { ricochet, splitter } from './helpers';

function hashes(seed: number): number[] {
  const w = createWorld({ seed, cores: [ricochet, splitter] });
  const out: number[] = [hashWorld(w)];
  while (w.phase !== 'ended') {
    stepWorld(w);
    if (w.step % 120 === 0) out.push(hashWorld(w));
  }
  out.push(hashWorld(w));
  return out;
}

describe('determinism', () => {
  it('gives the same state hash at every sampled step for the same seed', () => {
    for (const seed of [1, 42, 9001]) expect(hashes(seed)).toEqual(hashes(seed));
  });

  it('gives different matches for different seeds', () => {
    expect(hashes(1).at(-1)).not.toBe(hashes(2).at(-1));
  });

  it('is unaffected by recording events', () => {
    const a = createWorld({ seed: 5, cores: [ricochet, splitter], recordEvents: true });
    const b = createWorld({ seed: 5, cores: [ricochet, splitter], recordEvents: false });
    while (a.phase !== 'ended') stepWorld(a);
    while (b.phase !== 'ended') stepWorld(b);
    expect(hashWorld(a)).toBe(hashWorld(b));
  });

  it('matches golden final hashes; update them only for a deliberate sim change, and say why in the commit', () => {
    const golden = [1, 2, 3].map((seed) => {
      const w = createWorld({ seed, cores: [ricochet, splitter] });
      while (w.phase !== 'ended') stepWorld(w);
      return { seed, hash: hashWorld(w), winner: w.winner, counts: [...w.counts] };
    });
    expect(golden).toMatchSnapshot();
  });
});

describe('invariants', () => {
  it('hold after every step across many matches and pairings', () => {
    const pairs = [
      [ricochet, splitter],
      [splitter, ricochet],
      [ricochet, ricochet],
      [splitter, splitter],
    ] as const;
    let matches = 0;
    for (let seed = 1; seed <= 15; seed++) {
      for (const p of pairs) {
        runMatch({ seed, cores: p }, checkInvariants);
        matches++;
      }
    }
    expect(matches).toBe(60);
  });
});
