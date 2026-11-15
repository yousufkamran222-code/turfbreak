/** Every tunable number lives here or in a content definition (MASTER_PROMPT 3.2 rule 5). */
export const tuning = {
  sim: {
    /** Fixed simulation rate in steps per second. */
    stepsPerSecond: 60,
    /** Max sim steps per rendered frame, so a long stall cannot spiral. */
    maxStepsPerFrame: 8,
  },
  arena: {
    /** Logical arena size; screen size never affects the sim. */
    size: 1000,
    /** Target cell count; the jittered grid rounds it to cols x rows. */
    cellCount: 180,
    /** Jitter as a share of one grid cell (1 = anywhere inside the grid cell). */
    jitter: 0.85,
    lloydIterations: 2,
  },
  runner: {
    speed: 420,
    bodyRadius: 14,
    captureRadius: 0,
    /** Max heading jitter after a wall bounce, in radians (4 degrees). */
    wallJitter: 0.0698,
    /** Max spread of the starting heading either side of straight at the enemy, in radians (15 degrees). */
    startSpread: 0.2618,
    /** Hard performance cap per side (MASTER_PROMPT 4.4). Extra spawns overflow into speed. */
    maxPerSide: 32,
    /** Speed multiplier gained per overflowed spawn. */
    overflowSpeed: 0.02,
  },
  beam: {
    /** Distance between capture samples along a beam, in arena units. */
    sampleSpacing: 24,
    /** How fast a beam swings to trail behind its runner after a turn, in radians per second. */
    swingRate: 6,
  },
  match: {
    durationSeconds: 40,
    countdownSeconds: 1.5,
    /** If sudden death runs this long with no capture, the side with more hits wins. */
    suddenDeathMaxSeconds: 10,
    /** Share of the map that counts as "effectively decided" before half time (lab metric). */
    decidedShare: 0.7,
  },
  render: {
    maxDevicePixelRatio: 2,
  },
} as const;
