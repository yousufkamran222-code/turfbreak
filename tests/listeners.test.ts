import { describe, expect, it } from 'vitest';
import { Listeners } from '../src/platform/listeners';

describe('Listeners', () => {
  it('lets the newest back handler consume the press', () => {
    const l = new Listeners<() => boolean>();
    const calls: string[] = [];
    l.add(() => (calls.push('home'), false));
    const off = l.add(() => (calls.push('match'), true));
    expect(l.emitUntilHandled()).toBe(true);
    expect(calls).toEqual(['match']);
    off();
    expect(l.emitUntilHandled()).toBe(false);
    expect(calls).toEqual(['match', 'home']);
  });
});
