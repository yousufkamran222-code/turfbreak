import { emit, type Runner, type SideIndex, type World } from './world';

/**
 * Player input enters the sim only as timestamped records (MASTER_PROMPT 4.3 rule 2).
 * After Phase 2's fun gate there are two: aim the launch before the match starts,
 * and fire the Core's ultimate once at a moment of the player's choosing.
 */
export type InputRecord =
  | { step: number; side: SideIndex; type: 'launch'; dx: number; dy: number }
  | { step: number; side: SideIndex; type: 'ultimate' };

/** Distributes Omit over the union, so each variant keeps its own fields. */
type WithoutStep<T> = T extends unknown ? Omit<T, 'step'> : never;

export type ControllerSpec =
  | {
      kind: 'heuristic';
      /** Aim error on the launch, in radians (max 0.3). */
      aimError: number;
      /** Multiplier on the Core's ultimate threshold: above 1 waits for a better moment. */
      patience: number;
    }
  | { kind: 'random' };

export function primaryOf(world: World, side: SideIndex): Runner | null {
  for (const r of world.runners) if (r.side === side && r.primary) return r;
  return null;
}

/** Queue an input from outside the sim. It applies on the next step. */
export function queueInput(world: World, input: WithoutStep<InputRecord>): void {
  world.pendingInputs.push({ ...input, step: world.step + 1 } as InputRecord);
}

/** Aim the primary's launch. Only valid before the runners have moved. */
export function applyLaunch(world: World, side: SideIndex, dx: number, dy: number): boolean {
  const st = world.sides[side];
  if (st.launched || world.step > 1) return false;
  const r = primaryOf(world, side);
  const len = Math.sqrt(dx * dx + dy * dy);
  if (!r || len < 1e-9) return false;
  r.dx = dx / len;
  r.dy = dy / len;
  r.bx = -r.dx;
  r.by = -r.dy;
  st.launched = true;
  world.inputLog.push({ step: world.step, side, type: 'launch', dx, dy });
  return true;
}

export function canUltimate(world: World, side: SideIndex): boolean {
  return world.sides[side].ultimates > 0 && world.phase !== 'ended';
}

/** Run the Core's ultimate effect, then every Mod's ultimate hook. */
export function runUltimate(world: World, side: SideIndex, echo: boolean): void {
  const st = world.sides[side];
  emit(world, { type: 'UltimateFired', step: world.step, side, echo });
  world.currentMod = -1;
  st.core.hooks.onUltimate?.(world.contexts[side]);
  if (echo) return;
  st.mods.forEach((m, i) => {
    if (!m.mod.hooks.onUltimate) return;
    world.currentMod = i;
    m.mod.hooks.onUltimate(world.contexts[side], m.level);
  });
  world.currentMod = -1;
}

/** Fire a side's ultimate if it has one ready. */
export function applyUltimate(world: World, side: SideIndex): boolean {
  if (!canUltimate(world, side)) return false;
  const st = world.sides[side];
  st.ultimates--;
  st.ultimatesUsed++;
  world.inputLog.push({ step: world.step, side, type: 'ultimate' });
  runUltimate(world, side, false);
  return true;
}

/** Apply every queued input whose step has come. */
export function applyPendingInputs(world: World): void {
  const q = world.pendingInputs;
  let k = 0;
  while (k < q.length && q[k]!.step <= world.step) {
    const inp = q[k]!;
    if (inp.type === 'launch') applyLaunch(world, inp.side, inp.dx, inp.dy);
    else applyUltimate(world, inp.side);
    k++;
  }
  if (k > 0) q.splice(0, k);
}
