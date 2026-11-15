export type PlatformId = 'web' | 'crazygames' | 'android';
export type HapticKind = 'light' | 'medium' | 'heavy';
export type RewardedResult = 'rewarded' | 'dismissed' | 'unavailable';

/**
 * The only door between the game and its host (MASTER_PROMPT 7.1). Nothing
 * outside src/platform may reference Capacitor, a portal SDK or a store API.
 */
export interface Platform {
  readonly id: PlatformId;
  init(): Promise<void>;
  loadingFinished(): void;
  /** Match begins or resumes. */
  gameplayStart(): void;
  /** Menus, draft, pause. */
  gameplayStop(): void;
  /** Run won, Wipeout. */
  happyMoment(): void;
  canShowRewarded(): boolean;
  showRewarded(): Promise<RewardedResult>;
  showInterstitial(): Promise<void>;
  storageGet(key: string): Promise<string | null>;
  storageSet(key: string, value: string): Promise<void>;
  haptic(kind: HapticKind): void;
  share(payload: { text?: string; url?: string; file?: Blob }): Promise<boolean>;
  /**
   * Lifecycle hooks, added to the 7.1 sketch so the game can pause when the
   * tab is hidden or the app is backgrounded. Each returns an unsubscribe.
   */
  onPause(cb: () => void): () => void;
  onResume(cb: () => void): () => void;
  /**
   * Hardware or gesture back. The handler returns true when it consumed the
   * press (for example, a match opened its pause menu). If no handler consumes
   * it, the platform performs its default (exit on Android, nothing on web).
   */
  onBack(cb: () => boolean): () => void;
}
