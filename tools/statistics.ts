/** Wilson interval for independent Bernoulli samples. */
export function wilson(wins: number, n: number): [number, number] {
  if (n <= 0) return [0, 1];
  const z = 1.959963984540054;
  const p = wins / n;
  const denom = 1 + z * z / n;
  const centre = (p + z * z / (2 * n)) / denom;
  const half = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}
