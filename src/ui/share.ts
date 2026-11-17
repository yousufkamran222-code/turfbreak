import { useEffect, useRef, useState } from 'preact/hooks';
import type { Platform } from '../platform';
import { encodeReplay, type ReplayData } from '../meta/replay';

export type ShareResult = 'shared' | 'copied' | 'failed';

/** Open the share sheet, or copy the text (and link) to the clipboard where there is none. */
export async function shareOrCopy(platform: Platform, p: { text: string; url?: string | undefined }): Promise<ShareResult> {
  const payload: { text: string; url?: string } = { text: p.text };
  if (p.url) payload.url = p.url;
  if (await platform.share(payload)) return 'shared';
  return (await platform.copy(p.url ? `${p.text}\n${p.url}` : p.text)) ? 'copied' : 'failed';
}

/** A link that opens this build and plays the replay; null where there is no web address (Android). */
export function replayUrl(platform: Platform, code: string): string | null {
  if (platform.id === 'android') return null;
  try {
    return `${window.location.origin}${window.location.pathname}?replay=${code}`;
  } catch {
    return null;
  }
}

export const replayCodeOf = (d: ReplayData): string => encodeReplay(d);

/** A label that says what just happened for two seconds ("Copied!"), then goes back. */
export function useFlash(): [string | null, (msg: string) => void] {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return [
    msg,
    (m) => {
      setMsg(m);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setMsg(null), 2000);
    },
  ];
}

export const resultLabel: Record<ShareResult, string> = { shared: 'Shared!', copied: 'Copied!', failed: "Couldn't share" };
