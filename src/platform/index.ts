import type { Platform } from './types';

/**
 * Picks the adapter at build time. VITE_PLATFORM is a compile-time constant,
 * so the bundler drops the unused branches and their SDKs.
 */
export async function createPlatform(): Promise<Platform> {
  const target = import.meta.env.VITE_PLATFORM;
  if (target === 'android') {
    const { createAndroidPlatform } = await import('./android');
    return createAndroidPlatform();
  }
  const { createWebPlatform } = await import('./web');
  // The CrazyGames SDK adapter arrives in Phase 7; until then it behaves as plain web.
  return createWebPlatform(target === 'crazygames' ? 'crazygames' : 'web');
}

export type { Platform } from './types';
