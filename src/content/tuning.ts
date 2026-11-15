/** Every tunable number lives here or in a content definition (MASTER_PROMPT 3.2 rule 5). */
export const tuning = {
  sim: {
    /** Fixed simulation rate in steps per second. */
    stepsPerSecond: 60,
    /** Logical arena size; screen size never affects the sim. */
    arenaSize: 1000,
    /** Max sim steps per rendered frame, so a long stall cannot spiral. */
    maxStepsPerFrame: 8,
  },
  runner: {
    speed: 420,
    bodyRadius: 14,
    /** Max heading jitter after a wall bounce, in degrees. */
    wallJitterDeg: 4,
  },
  render: {
    maxDevicePixelRatio: 2,
  },
} as const;
