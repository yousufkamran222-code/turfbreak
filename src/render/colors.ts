/** Small colour helpers for deriving territory shades from a Core's colour. */
export function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** Mix a colour towards a background colour. t = 0 gives the colour, 1 gives the background. */
export function mix(hex: string, bg: string, t: number): string {
  const a = hexToRgb(hex);
  const b = hexToRgb(bg);
  const c = a.map((v, i) => Math.round(v + (b[i]! - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
