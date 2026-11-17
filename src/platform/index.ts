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
  if (target === 'crazygames') {
    const { createCrazyGamesPlatform } = await import('./crazygames');
    return createCrazyGamesPlatform();
  }
  const { createWebPlatform } = await import('./web');
  return createWebPlatform('web');
}

export type { Platform } from './types';
