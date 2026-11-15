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
  input: {
    /** Default redirect rules; a match can override them (Mods such as Quick Hands and Slingshot will). */
    redirect: {
      /** Seconds for a charge to come back. */
      cooldownSeconds: 5,
      maxCharges: 1,
      /** Whether a redirect also counts as a hit for Core triggers. */
      countsAsHit: false,
      /** Speed multiplier for a moment right after a redirect (1 = none). */
      dashMul: 1,
      dashSeconds: 1,
    },
  },
  ai: {
    /** How far ahead a controller looks when scoring a heading. */
    rayLength: 1100,
    raySpacing: 26,
    /** Rival: aim error in radians (max 0.3), reaction delay after a charge is ready, minimum gain in enemy cells. */
    rival: { aimError: 0.2, reactionSeconds: 0.5, minGain: 2 },
    /** Assist plays the player's redirect deliberately worse than a rival. */
    assist: { aimError: 0.3, reactionSeconds: 1.5, minGain: 4 },
    /** Seconds to wait before re-checking when no heading was worth a redirect. */
    recheckSeconds: 0.25,
    /** A pickup is worth this many enemy cells to a controller, minus one cell per `pickupDistanceCost` units away. */
    pickupValue: 24,
    pickupDistanceCost: 70,
    /** Weight on the cells a beam would sweep during the turn (Ricochet). */
    sweepWeight: 0.4,
    sweepStep: 0.25,
    sweepSpacing: 40,
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
    countdownSeconds: 1.5,
    /** When the one-line input prompt appears if the player has not used their input yet. */
    promptSeconds: 5,
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
  },
  audio: {
    masterVolume: 0.5,
    /** Consecutive hits climb the scale; a pause this long resets the run. */
    hitResetSeconds: 1.2,
    /** At most one capture tick per side in this interval. */
    captureTickSeconds: 0.045,
  },
} as const;
