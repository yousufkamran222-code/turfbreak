import { App } from '@capacitor/app';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Preferences } from '@capacitor/preferences';
import { Share } from '@capacitor/share';
import { Listeners } from './listeners';
import type { HapticKind, Platform } from './types';

const impact: Record<HapticKind, ImpactStyle> = {
  light: ImpactStyle.Light,
  medium: ImpactStyle.Medium,
  heavy: ImpactStyle.Heavy,
};

/** Android target, inside the Capacitor WebView. Ads are stubbed until Phase 8. */
export function createAndroidPlatform(): Platform {
  const pause = new Listeners<() => void>();
  const resume = new Listeners<() => void>();
  const back = new Listeners<() => boolean>();

  return {
    id: 'android',
    async init() {
      await App.addListener('pause', () => pause.emit());
      await App.addListener('resume', () => resume.emit());
      await App.addListener('backButton', () => {
        if (!back.emitUntilHandled()) void App.exitApp();
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
        return (await Preferences.get({ key })).value;
      } catch {
        return null;
      }
    },
    async storageSet(key, value) {
      try {
        await Preferences.set({ key, value });
      } catch {
        // A failed write must never crash the game.
      }
    },
    haptic(kind) {
      void Haptics.impact({ style: impact[kind] }).catch(() => {});
    },
    async share(payload) {
      try {
        const opts: { text?: string; url?: string } = {};
        if (payload.text !== undefined) opts.text = payload.text;
        if (payload.url !== undefined) opts.url = payload.url;
        await Share.share(opts);
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
