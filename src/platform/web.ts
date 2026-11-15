import { Listeners } from './listeners';
import type { HapticKind, Platform, PlatformId } from './types';

const hapticMs: Record<HapticKind, number> = { light: 10, medium: 20, heavy: 35 };

/** Browser target: GitHub Pages, itch.io and CrazyGames Basic Launch. */
export function createWebPlatform(id: PlatformId = 'web'): Platform {
  const pause = new Listeners<() => void>();
  const resume = new Listeners<() => void>();
  const back = new Listeners<() => boolean>();

  return {
    id,
    async init() {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) pause.emit();
        else resume.emit();
      });
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') back.emitUntilHandled();
      });
    },
    loadingFinished() {},
    gameplayStart() {},
    gameplayStop() {},
    happyMoment() {},
    canShowRewarded: () => false,
    showRewarded: async () => 'unavailable',
    showInterstitial: async () => {},
    async storageGet(key) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    async storageSet(key, value) {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // Private mode or blocked storage: the game must keep running without saves.
      }
    },
    haptic(kind) {
      try {
        navigator.vibrate?.(hapticMs[kind]);
      } catch {
        // Some browsers throw when vibrate is called without a user gesture.
      }
    },
    async share(payload) {
      try {
        if (!navigator.share) return false;
        const data: ShareData = {};
        if (payload.text !== undefined) data.text = payload.text;
        if (payload.url !== undefined) data.url = payload.url;
        await navigator.share(data);
        return true;
      } catch {
        return false;
      }
    },
    onPause: (cb) => pause.add(cb),
    onResume: (cb) => resume.add(cb),
    onBack: (cb) => back.add(cb),
  };
}
