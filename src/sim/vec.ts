/**
 * Rotate a unit direction by a small angle without Math.sin or Math.cos
 * (MASTER_PROMPT 4.3 rule 4). Uses a Taylor approximation and renormalises with
 * sqrt, which IEEE 754 defines exactly, so every engine gives the same bits.
 * Accurate to well under a degree for |angle| <= 0.3 rad.
 */
export function rotateSmall(dir: { dx: number; dy: number }, angle: number): void {
  const t2 = angle * angle;
  const c = 1 - t2 / 2 + (t2 * t2) / 24;
  const s = angle - (angle * t2) / 6;
  const x = dir.dx * c - dir.dy * s;
  const y = dir.dx * s + dir.dy * c;
  const inv = 1 / Math.sqrt(x * x + y * y);
  dir.dx = x * inv;
  dir.dy = y * inv;
}
