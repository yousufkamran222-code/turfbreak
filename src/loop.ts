/**
 * Fixed-step loop with interpolated rendering (MASTER_PROMPT 4.3 rule 6).
 * The accumulator is separated from requestAnimationFrame so it can be tested.
 */
export class FixedStepper {
  private accumulator = 0;
  readonly dt: number;

  constructor(
    stepsPerSecond: number,
    private readonly maxStepsPerFrame: number,
  ) {
    this.dt = 1 / stepsPerSecond;
  }

  /**
   * Advance by a real elapsed time, calling `step` a whole number of times.
   * `step` may return `false` to stop for this frame (a hit-stop began): the
   * step it refused is not consumed, so no sim time is lost at 2x or 4x.
   * Returns the interpolation factor in [0, 1) between the last two states.
   */
  advance(elapsedSeconds: number, speed: number, step: () => unknown): number {
    this.accumulator += Math.max(0, elapsedSeconds) * speed;
    let steps = 0;
    let refused = false;
    while (this.accumulator >= this.dt && steps < this.maxStepsPerFrame * speed) {
      if (step() === false) {
        refused = true;
        break;
      }
      this.accumulator -= this.dt;
      steps++;
    }
    // After a long stall (tab hidden, debugger), drop the backlog instead of fast-forwarding.
    if (!refused && this.accumulator >= this.dt) this.accumulator = 0;
    return this.accumulator / this.dt;
  }

  reset(): void {
    this.accumulator = 0;
  }
}
