/** Every tunable number lives here or in a content definition (MASTER_PROMPT 3.2 rule 5). */
export const tuning = {
  agency: {
    rechargeSeconds: 12,
    tacticalSpeed: 1.2,
    tacticalSpeedSeconds: 6,
    tacticalShieldSeconds: 3,
  },
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
    /** Speed gained per overflowed spawn, as a share of base speed (additive, so it cannot compound). */
    overflowSpeed: 0.02,
    /**
     * Hard speed limit: about one path sample per step. Speed feeds hits and hits feed
     * speed (Overclock, overflow), so without it a side can run away to absurd speeds.
     */
    maxSpeed: 1800,
    /** Fast runners capture along their path at this spacing (well under one cell), so none skip cells. */
    pathSampleSpacing: 30,
  },
  beam: {
    /** Distance between capture samples along a beam, in arena units. */
    sampleSpacing: 24,
    /** How fast an ultimate spins a beam, in radians per second (one turn in about 0.9 s). */
    spinRate: 7,
    /** How fast a beam swings back to trailing after a hit, in radians per second. */
    swingRate: 6,
  },
  ai: {
    /** How far ahead a controller looks when scoring a launch heading, following bounces. */
    rayLength: 1100,
    raySpacing: 26,
    /** Rival: launch aim error in radians (max 0.3), and patience on the ultimate (1 = fire at the Core's threshold). */
    rival: { aimError: 0.15, patience: 1 },
    /** Auto-play for the player's side: a little sloppier and a little more impatient than the rival. */
    assist: { aimError: 0.25, patience: 0.8 },
    /** Controllers check the ultimate this often, and always fire it by this many seconds before the buzzer. */
    ultimateCheckSeconds: 0.25,
    ultimateDeadlineSeconds: 6,
  },

  tension: {
    /** Final seconds in which the HUD and audio turn urgent (presentation only). */
    urgentSeconds: 10,
    /** Underdog boost: speed gained per unit of deficit share (deficit cells / all cells). */
    underdogPerShare: 0.5,
    underdogMax: 0.06,
    /** A new leader must be ahead by this many cells before it counts as a lead change. */
    leadHysteresis: 3,
  },
  shield: {
    /** After a shielded cell absorbs a capture attempt, further attempts on it are ignored for this long. */
    absorbSeconds: 0.3,
  },
  pickups: {
    /** First spawn, then one every few seconds while fewer than `maxOnMap` are out. */
    firstSeconds: 3,
    everySeconds: 6,
    maxOnMap: 2,
    lifetimeSeconds: 10,
    /** Grab distance from the pickup centre, added to the runner's body radius. */
    radius: 32,
    /** Spawns avoid points this close to a primary runner, so nobody gets one for free. */
    minDistanceFromRunner: 220,
  },
  match: {
    durationSeconds: 40,
    /** Seconds the player has to aim the launch before it launches on its own. */
    aimSeconds: 4,
    /** If sudden death runs this long with no capture, the side with more hits wins. */
    suddenDeathMaxSeconds: 10,
    /** Share of the map that counts as "effectively decided" before half time (lab metric). */
    decidedShare: 0.7,
  },
  render: {
    maxDevicePixelRatio: 2,
  },
  juice: {
    /** Global multiplier for shake and particles; reduce-motion sets it to 0 (Phase 5 adds the setting). */
    intensity: 1,
    popSeconds: 0.28,
    popScale: 0.22,
    /** Delay between flashes when many cells flip in one frame, so a wave reads as a wave. */
    popStagger: 0.012,
    popStaggerMax: 0.3,
    maxParticles: 480,
    sparksWall: 5,
    sparksClash: 16,
    sparksTrigger: 10,
    /** Shake in arena units at full trauma, and trauma added per event. */
    shakeMax: 14,
    traumaClash: 0.32,
    traumaWall: 0.06,
    traumaTrigger: 0.12,
    traumaDecay: 1.6,
    /** Frames of hit-stop on a clash involving a primary, in seconds. */
    hitStopSeconds: 0.06,
    tapMarkerSeconds: 0.45,
    /** Slow motion when an ultimate fires: time scale and real seconds. */
    ultimateSlowScale: 0.3,
    ultimateSlowSeconds: 0.7,
    ultimateFlashSeconds: 0.25,
    /** Pause on the final frame before the result banner. */
    endFreezeSeconds: 0.7,
    /** Capture streaks: a gap this long ends a streak; callouts at these counts. */
    streakGapSeconds: 0.7,
    streakMilestones: [10, 25, 50, 100],
  },
  audio: {
    masterVolume: 0.5,
    /** Consecutive hits climb the scale; a pause this long resets the run. */
    hitResetSeconds: 1.2,
    /** At most one capture tick per side in this interval. */
    captureTickSeconds: 0.045,
    /** Generated beat under matches; it gains layers in the final seconds. */
    beatBpm: 118,
    beatVolume: 0.35,
  },
} as const;
