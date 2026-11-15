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
   * Returns the interpolation factor in [0, 1) between the last two states.
   */
  advance(elapsedSeconds: number, speed: number, step: () => void): number {
    this.accumulator += Math.max(0, elapsedSeconds) * speed;
    let steps = 0;
    while (this.accumulator >= this.dt && steps < this.maxStepsPerFrame * speed) {
      step();
      this.accumulator -= this.dt;
      steps++;
    }
    // After a long stall (tab hidden, debugger), drop the backlog instead of fast-forwarding.
    if (this.accumulator >= this.dt) this.accumulator = 0;
    return this.accumulator / this.dt;
  }

  reset(): void {
    this.accumulator = 0;
  }
}
