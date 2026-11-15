import { tuning } from '../content/tuning';
import { emit, type Runner, type SideIndex, type World } from './world';

/** The input scheme under test (MASTER_PROMPT 5.4; Phase 2 compares these). */
export type InputMode = 'redirect' | 'boost' | 'none';

/** Player input enters the sim only as timestamped records (MASTER_PROMPT 4.3 rule 2). */
export type InputRecord =
  | { step: number; side: SideIndex; type: 'redirect'; x: number; y: number }
  | { step: number; side: SideIndex; type: 'boost'; held: boolean };

/** Distributes Omit over the union, so each variant keeps its own fields. */
type WithoutStep<T> = T extends unknown ? Omit<T, 'step'> : never;

export interface RedirectRules {
  cooldownSeconds: number;
  maxCharges: number;
  countsAsHit: boolean;
  dashMul: number;
  dashSeconds: number;
}

export type ControllerSpec =
  | { kind: 'heuristic'; aimError: number; reactionSeconds: number; minGain: number }
  | { kind: 'random' };

export function primaryOf(world: World, side: SideIndex): Runner | null {
  for (const r of world.runners) if (r.side === side && r.primary) return r;
  return null;
}

/** Queue an input from outside the sim. It applies on the next step. */
export function queueInput(world: World, input: WithoutStep<InputRecord>): void {
  world.pendingInputs.push({ ...input, step: world.step + 1 } as InputRecord);
}

export function canRedirect(world: World, side: SideIndex): boolean {
  return world.inputMode === 'redirect' && world.sides[side].charges > 0 && world.phase !== 'ended';
}

/** Turn a side's primary runner to head straight at (x, y). Returns false if it could not. */
export function applyRedirect(world: World, side: SideIndex, x: number, y: number): boolean {
  if (!canRedirect(world, side)) return false;
  const r = primaryOf(world, side);
  if (!r) return false;
  const dx = x - r.x;
  const dy = y - r.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-6) return false;
  r.dx = dx / len;
  r.dy = dy / len;
  const st = world.sides[side];
  const rules = world.redirectRules;
  st.charges--;
  st.redirects++;
  if (rules.dashMul !== 1) st.dashSteps = Math.round(rules.dashSeconds * tuning.sim.stepsPerSecond);
  if (rules.countsAsHit) st.pendingRedirectHits++;
  if (st.chargeSteps <= 0) st.chargeSteps = cooldownSteps(world);
  world.inputLog.push({ step: world.step, side, type: 'redirect', x, y });
  emit(world, { type: 'Redirect', step: world.step, side, runner: r.id, x, y });
  st.core.hooks.onRedirect?.(world.contexts[side], r);
  return true;
}

export function applyBoost(world: World, side: SideIndex, held: boolean): void {
  if (world.inputMode !== 'boost') return;
  const st = world.sides[side];
  if (st.boostHeld === held) return;
  st.boostHeld = held;
  world.inputLog.push({ step: world.step, side, type: 'boost', held });
}

/** Apply every queued input whose step has come. */
export function applyPendingInputs(world: World): void {
  const q = world.pendingInputs;
  let k = 0;
  while (k < q.length && q[k]!.step <= world.step) {
    const inp = q[k]!;
    if (inp.type === 'redirect') applyRedirect(world, inp.side, inp.x, inp.y);
    else applyBoost(world, inp.side, inp.held);
    k++;
  }
  if (k > 0) q.splice(0, k);
}

export function cooldownSteps(world: World): number {
  return Math.round(world.redirectRules.cooldownSeconds * tuning.sim.stepsPerSecond);
}

/** Cooldowns and the boost meter. */
export function tickInputState(world: World): void {
  const dt = world.dt;
  const max = world.redirectRules.maxCharges;
  for (const s of [0, 1] as const) {
    const st = world.sides[s];
    if (st.charges < max && st.chargeSteps > 0) {
      st.chargeSteps--;
      if (st.chargeSteps === 0) {
        st.charges++;
        if (st.charges < max) st.chargeSteps = cooldownSteps(world);
      }
    }
    if (st.dashSteps > 0) st.dashSteps--;
    if (st.boostHeld && st.boostMeter > 0) st.boostMeter = Math.max(0, st.boostMeter - dt / tuning.input.boostDrainSeconds);
    else if (!st.boostHeld) st.boostMeter = Math.min(1, st.boostMeter + dt / tuning.input.boostRefillSeconds);
  }
}

/** Is this side boosting right now? */
export function isBoosting(world: World, side: SideIndex): boolean {
  const st = world.sides[side];
  return world.inputMode === 'boost' && st.boostHeld && st.boostMeter > 0;
}
