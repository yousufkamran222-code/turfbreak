import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCrazyGamesPlatform } from '../src/platform/crazygames';

interface Callbacks { adStarted?(): void; adFinished?(): void; adError?(e: unknown): void }
let callbacks: Callbacks;
let visibility: () => void;
let scriptLoads = true;
let sdk: ReturnType<typeof fakeSdk>;
function fakeSdk() {
  return {
    init: vi.fn(async () => {}), environment: 'crazygames',
    game: { loadingStart: vi.fn(), loadingStop: vi.fn(), gameplayStart: vi.fn(), gameplayStop: vi.fn(), happytime: vi.fn() },
    ad: { hasAdblock: vi.fn(async () => false), requestAd: vi.fn((_kind: string, cb: Callbacks) => { callbacks = cb; }) },
    data: { getItem: vi.fn(() => null), setItem: vi.fn() },
  };
}
beforeEach(() => {
  vi.useFakeTimers(); scriptLoads = true; sdk = fakeSdk();
  vi.stubGlobal('document', { hidden: false, createElement: () => ({}), head: { appendChild: (s: { onload(): void }) => { if (scriptLoads) queueMicrotask(() => s.onload()); } },
    addEventListener: (_name: string, cb: () => void) => { visibility = cb; } });
  vi.stubGlobal('window', { CrazyGames: { SDK: sdk }, addEventListener: vi.fn(), localStorage: { getItem: () => null, setItem: vi.fn() } });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

async function platform() {
  const p = createCrazyGamesPlatform();
  const init = p.init();
  await vi.advanceTimersByTimeAsync(0); await init;
  return p;
}

describe('CrazyGames recovery', () => {
  it('falls back after a stalled script without blocking boot', async () => {
    scriptLoads = false;
    const p = createCrazyGamesPlatform(); const init = p.init();
    await vi.advanceTimersByTimeAsync(10000); await init;
    expect(p.canShowRewarded()).toBe(false);
  });
  it('ignores an SDK init result after its timeout', async () => {
    let finish!: () => void;
    sdk.init.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    const p = createCrazyGamesPlatform(); const init = p.init();
    await vi.advanceTimersByTimeAsync(10000); await init;
    finish(); await vi.advanceTimersByTimeAsync(0);
    expect(p.canShowRewarded()).toBe(false); expect(sdk.game.loadingStart).not.toHaveBeenCalled();
  });
  it('bounds adblock detection and conservatively disables ads', async () => {
    sdk.ad.hasAdblock.mockImplementation(() => new Promise<boolean>(() => {}));
    const p = createCrazyGamesPlatform(); const init = p.init();
    await vi.advanceTimersByTimeAsync(3000); await init;
    expect(p.canShowRewarded()).toBe(false);
  });
  it('times out an unanswered request, disables ads, and ignores late callbacks', async () => {
    const p = await platform(); const pause = vi.fn(); const resume = vi.fn(); p.onPause(pause); p.onResume(resume);
    const request = p.showRewarded(); const late = callbacks;
    await vi.advanceTimersByTimeAsync(15000);
    expect(await request).toBe('unavailable'); expect(p.canShowRewarded()).toBe(false);
    late.adStarted?.(); late.adFinished?.();
    expect(pause).not.toHaveBeenCalled(); expect(resume).not.toHaveBeenCalled();
  });
  it('settles once, rejects overlap, and restores only a visible page', async () => {
    const p = await platform(); const resume = vi.fn(); p.onResume(resume);
    const request = p.showRewarded();
    callbacks.adStarted?.(); callbacks.adStarted?.();
    expect(await p.showRewarded()).toBe('unavailable');
    Object.assign(document, { hidden: true }); visibility();
    await vi.advanceTimersByTimeAsync(180000);
    expect(await request).toBe('dismissed'); expect(resume).not.toHaveBeenCalled();
    callbacks.adFinished?.();
    Object.assign(document, { hidden: false }); visibility();
    expect(resume).toHaveBeenCalledTimes(1);
  });
  it('rewards once and ignores duplicate completion from a previous ad', async () => {
    const p = await platform();
    const first = p.showRewarded(); const stale = callbacks;
    stale.adStarted?.(); stale.adFinished?.(); expect(await first).toBe('rewarded');
    const second = p.showRewarded(); stale.adFinished?.();
    expect(p.canShowRewarded()).toBe(false);
    callbacks.adError?.(new Error('no fill')); expect(await second).toBe('unavailable');
    expect(p.canShowRewarded()).toBe(true);
  });
  it('handles throwing SDK requests', async () => {
    const p = await platform(); sdk.ad.requestAd.mockImplementation(() => { throw new Error('offline'); });
    expect(await p.showRewarded()).toBe('unavailable'); expect(p.canShowRewarded()).toBe(true);
  });
});
