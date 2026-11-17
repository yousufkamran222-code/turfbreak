import { Listeners } from './listeners';
import type { HapticKind, Platform, PlatformId } from './types';

const hapticMs: Record<HapticKind, number> = { light: 10, medium: 20, heavy: 35 };

/** Share a file through the system sheet when the browser can; otherwise save it as a download. */
async function shareFile(file: Blob, name: string, text?: string): Promise<boolean> {
  const f = new File([file], name, { type: file.type || 'video/webm' });
  const data: ShareData = { files: [f] };
  if (text !== undefined) data.text = text;
  if (navigator.share && navigator.canShare?.(data)) {
    try {
      await navigator.share(data);
      return true;
    } catch {
      // Dismissed or refused: fall back to a download unless the person simply cancelled.
    }
  }
  const url = URL.createObjectURL(f);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

/** Browser target: GitHub Pages, itch.io and CrazyGames Basic Launch. */
export function createWebPlatform(id: PlatformId = 'web'): Platform {
  const pause = new Listeners<() => void>();
  const resume = new Listeners<() => void>();
  const back = new Listeners<() => boolean>();

  return {
    id,
    canShareFiles: true,
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
        if (payload.file) return await shareFile(payload.file, payload.fileName ?? 'turfbreak-clip.webm', payload.text);
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
    async copy(text) {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
          return true;
        }
      } catch {
        // Fall through to the legacy path.
      }
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
      } catch {
        return false;
      }
    },
    onPause: (cb) => pause.add(cb),
    onResume: (cb) => resume.add(cb),
    onBack: (cb) => back.add(cb),
  };
}
