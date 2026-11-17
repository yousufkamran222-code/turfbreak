import { useEffect } from 'preact/hooks';
import type { Game } from './game';
import { featName } from './game';

/** "UNLOCKED: Bloom" banner for feats just met. Tap to dismiss; it also fades after a few seconds. */
export function UnlockToast({ game }: { game: Game }) {
  const feats = game.newFeats.value;
  useEffect(() => {
    if (feats.length === 0) return;
    const t = window.setTimeout(() => (game.newFeats.value = []), 6500);
    return () => window.clearTimeout(t);
  }, [feats]);
  if (feats.length === 0) return null;
  return (
    <div class="toasts" role="status" aria-live="polite">
      {feats.slice(0, 2).map((f) => (
        <button key={f.id} type="button" class="toast" onClick={() => (game.newFeats.value = [])}>
          <span class="toast-title">UNLOCKED: {featName(f).toUpperCase()}</span>
          <span class="toast-sub">
            {f.kind === 'core' ? 'New Core' : 'New Mod'} · {f.hint}
          </span>
        </button>
      ))}
      {feats.length > 2 && (
        <button type="button" class="toast" onClick={() => (game.newFeats.value = [])}>
          <span class="toast-title">+{feats.length - 2} MORE UNLOCKED</span>
          <span class="toast-sub">See the Collection.</span>
        </button>
      )}
    </div>
  );
}
