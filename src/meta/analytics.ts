/**
 * Analytics seam (MASTER_PROMPT 6.8). v1 collects no data: `track` does nothing
 * unless a sink is installed. A privacy-respecting provider can be added later
 * with one `setAnalyticsSink` call in a platform adapter, without touching the game.
 */
export type AnalyticsProps = Readonly<Record<string, string | number | boolean>>;
export type AnalyticsSink = (event: string, props: AnalyticsProps) => void;

let sink: AnalyticsSink | null = null;

export function setAnalyticsSink(next: AnalyticsSink | null): void {
  sink = next;
}

/** Record an event. A no-op by default; never throws into the game. */
export function track(event: string, props: AnalyticsProps = {}): void {
  if (!sink) return;
  try {
    sink(event, props);
  } catch {
    // Analytics must never break play.
  }
}
