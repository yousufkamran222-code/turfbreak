import { afterEach, describe, expect, it } from 'vitest';
import { setAnalyticsSink, track } from '../src/meta/analytics';

describe('analytics', () => {
  afterEach(() => setAnalyticsSink(null));

  it('does nothing by default', () => {
    expect(() => track('x', { a: 1 })).not.toThrow();
  });

  it('forwards to a sink and never throws into the game', () => {
    const seen: string[] = [];
    setAnalyticsSink((e) => seen.push(e));
    track('run_start');
    expect(seen).toEqual(['run_start']);
    setAnalyticsSink(() => {
      throw new Error('boom');
    });
    expect(() => track('match_end')).not.toThrow();
  });
});
