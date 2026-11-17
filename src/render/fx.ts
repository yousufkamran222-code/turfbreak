import { tuning } from '../content/tuning';

/**
 * Runtime presentation switches the settings screen flips (MASTER_PROMPT 6.5).
 * Juice, the renderer and the match session read these instead of the const
 * tuning values, so a change applies to the very next frame.
 */
export const fx = {
  /** Global multiplier for shake, particles, slow-mo and flashes. 0 under reduce motion. */
  intensity: tuning.juice.intensity as number,
  /** Diagonal-stripe pattern on side 1's cells and a thicker frontier. */
  highContrast: false,
};

export function setReduceMotion(on: boolean): void {
  fx.intensity = on ? 0 : tuning.juice.intensity;
}

export function setHighContrast(on: boolean): void {
  fx.highContrast = on;
}
