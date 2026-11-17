import { Listeners } from './listeners';
import type { Platform, RewardedResult } from './types';
import { createWebPlatform } from './web';

/**
 * CrazyGames adapter (HTML5 SDK v3, https://docs.crazygames.com/sdk/intro/).
 * Wraps the web adapter and adds the SDK's loading, gameplay, happytime, data
 * and video-ad calls. Outside CrazyGames the SDK reports environment "disabled"
 * and every call would throw, so the adapter then behaves exactly like web.
 * Ads pause and mute the game through the same pause/resume hooks the game
 * already uses for a hidden tab, and recover cleanly on errors and adblock.
 */
const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';

interface AdCallbacks {
  adStarted?: () => void;
  adFinished?: () => void;
  adError?: (error: unknown) => void;
}

interface CrazySdk {
  init(): Promise<void>;
  environment: 'local' | 'crazygames' | 'disabled';
  game: { loadingStart(): void; loadingStop(): void; gameplayStart(): void; gameplayStop(): void; happytime(): void };
  ad: { requestAd(kind: 'midgame' | 'rewarded', callbacks: AdCallbacks): void; hasAdblock(): Promise<boolean> };
  data: { getItem(key: string): string | null; setItem(key: string, value: string): void };
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('CrazyGames SDK failed to load'));
    document.head.appendChild(s);
  });
}

export function createCrazyGamesPlatform(): Platform {
  const web = createWebPlatform('crazygames');
  const pause = new Listeners<() => void>();
  const resume = new Listeners<() => void>();
  let sdk: CrazySdk | null = null;
  let adblock = false;
  let adPlaying = false;

  /** Run an SDK call; a throw never reaches the game. */
  const safe = (fn: (s: CrazySdk) => void): void => {
    if (!sdk) return;
    try {
      fn(sdk);
    } catch {
      // The portal may refuse a call (e.g. outside its domains); the game carries on.
    }
  };

  const playAd = (kind: 'midgame' | 'rewarded'): Promise<RewardedResult> =>
    new Promise((resolve) => {
      if (!sdk || adPlaying) {
        resolve('unavailable');
        return;
      }
      adPlaying = true;
      let started = false;
      const done = (result: RewardedResult): void => {
        if (!adPlaying) return;
        adPlaying = false;
        if (started) resume.emit();
        resolve(result);
      };
      try {
        sdk.ad.requestAd(kind, {
          adStarted: () => {
            started = true;
            pause.emit();
          },
          adFinished: () => done('rewarded'),
          adError: () => done(started ? 'dismissed' : 'unavailable'),
        });
      } catch {
        done('unavailable');
      }
    });

  return {
    ...web,
    id: 'crazygames',
    // Portal builds share text only; files are not offered inside the portal frame.
    canShareFiles: false,
    async init() {
      await web.init();
      web.onPause(() => pause.emit());
      web.onResume(() => {
        if (!adPlaying) resume.emit();
      });
      try {
        await loadScript(SDK_URL);
        const s = (window as unknown as { CrazyGames?: { SDK?: CrazySdk } }).CrazyGames?.SDK;
        if (!s) return;
        await s.init();
        if (s.environment === 'disabled') return;
        sdk = s;
        safe((x) => x.game.loadingStart());
        adblock = await s.ad.hasAdblock().catch(() => false);
      } catch {
        sdk = null;
      }
    },
    loadingFinished() {
      safe((s) => s.game.loadingStop());
    },
    gameplayStart() {
      safe((s) => s.game.gameplayStart());
    },
    gameplayStop() {
      safe((s) => s.game.gameplayStop());
    },
    happyMoment() {
      safe((s) => s.game.happytime());
    },
    canShowRewarded: () => sdk !== null && !adblock && !adPlaying,
    showRewarded: () => playAd('rewarded'),
    async showInterstitial() {
      if (!sdk || adblock) return;
      await playAd('midgame');
    },
    async storageGet(key) {
      if (sdk) {
        try {
          return sdk.data.getItem(key);
        } catch {
          // Fall through to localStorage.
        }
      }
      return web.storageGet(key);
    },
    async storageSet(key, value) {
      if (sdk) {
        try {
          sdk.data.setItem(key, value);
          return;
        } catch {
          // Fall through to localStorage.
        }
      }
      await web.storageSet(key, value);
    },
    onPause: (cb) => pause.add(cb),
    onResume: (cb) => resume.add(cb),
  };
}
