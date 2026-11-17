/** Bounds for data entering the simulation from saves and replay links. */
import { tuning } from '../content/tuning';
import type { ControllerSpec, InputRecord } from './input';
import type { MatchTwist } from './world';

export const limits = { codeLength: 16 * 1024, inputs: 512, mods: 6, duration: 120, minDuration: 10, minPickup: 1, maxPickup: 60 } as const;
export const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
export const finite = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
export const integer = (v: unknown, lo = 0, hi = Number.MAX_SAFE_INTEGER): v is number => finite(v, lo, hi) && Number.isSafeInteger(v);

export function validTwist(v: unknown): v is MatchTwist {
  if (!object(v)) return false;
  if (Object.keys(v).some((k) => !['extraPrimaries', 'startShare', 'startShields', 'durationSeconds', 'pickupEverySeconds'].includes(k))) return false;
  const pair = (p: unknown, max: number): boolean => Array.isArray(p) && p.length === 2 && p.every((n) => integer(n, 0, max));
  return (v.extraPrimaries === undefined || pair(v.extraPrimaries, tuning.runner.maxPerSide - 1)) &&
    (v.startShields === undefined || pair(v.startShields, 255)) &&
    (v.startShare === undefined || finite(v.startShare, 0.1, 0.9)) &&
    (v.durationSeconds === undefined || finite(v.durationSeconds, limits.minDuration, limits.duration)) &&
    (v.pickupEverySeconds === undefined || finite(v.pickupEverySeconds, limits.minPickup, limits.maxPickup));
}

export function validController(v: unknown): v is ControllerSpec {
  return object(v) && (v.kind === 'random' || (v.kind === 'heuristic' && finite(v.aimError, 0, 0.3) && finite(v.patience, 0.1, 10)));
}

export function validBuild(v: unknown, ids: readonly string[]): v is { id: string; level: number }[] {
  return Array.isArray(v) && v.length <= limits.mods && v.every((e, i) => object(e) && typeof e.id === 'string' && ids.includes(e.id) && integer(e.level, 1, 3) && !v.slice(0, i).some((p: unknown) => object(p) && p.id === e.id));
}

export function validInputs(v: unknown, duration: number, ruleset = 'classic'): v is InputRecord[] {
  const maxStep = Math.ceil((duration + tuning.match.suddenDeathMaxSeconds) * tuning.sim.stepsPerSecond);
  if (!Array.isArray(v) || v.length > limits.inputs) return false;
  return v.every((e, i) => {
    if (!object(e) || !integer(e.step, 1, maxStep) || (e.side !== 0 && e.side !== 1)) return false;
    const prev: unknown = v[i - 1];
    if (object(prev) && typeof prev.step === 'number' && e.step < prev.step) return false;
    if (e.type === 'ultimate') return true;
    if (e.type === 'tactical') return ruleset === 'tactical' && e.step === Math.floor(Math.round(duration * tuning.sim.stepsPerSecond) / 2) && ['speed', 'shield', 'recharge'].includes(String(e.choice)) && !v.slice(0, i).some((p: unknown) => object(p) && p.type === 'tactical' && p.side === e.side);
    return e.type === 'launch' && !v.slice(0, i).some((p: unknown) => object(p) && p.type === 'launch' && p.side === e.side) && e.step <= 1 && finite(e.dx, -1e6, 1e6) && finite(e.dy, -1e6, 1e6) && e.dx * e.dx + e.dy * e.dy >= 1e-18;
  });
}
