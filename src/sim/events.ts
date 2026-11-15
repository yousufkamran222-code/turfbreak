import type { SideIndex } from './world';

export type CaptureCause = 'runner' | 'beam' | 'radius';
export type EndReason = 'time' | 'suddenDeath' | 'wipeout';

/** Typed events the sim emits for the renderer, audio and HUD (MASTER_PROMPT 4.3 rule 2). */
export type SimEvent =
  | { type: 'CellCaptured'; step: number; cell: number; side: SideIndex; cause: CaptureCause }
  | { type: 'WallBounce'; step: number; runner: number; side: SideIndex; x: number; y: number }
  | { type: 'Clash'; step: number; a: number; b: number; x: number; y: number }
  | { type: 'CoreTriggered'; step: number; side: SideIndex; stacks: number }
  | { type: 'RunnerSpawned'; step: number; side: SideIndex; runner: number }
  | { type: 'RunnerOverflow'; step: number; side: SideIndex; overflow: number }
  | { type: 'LeadChange'; step: number; leader: SideIndex }
  | { type: 'SuddenDeath'; step: number }
  | { type: 'Redirect'; step: number; side: SideIndex; runner: number; x: number; y: number }
  | { type: 'MatchEnded'; step: number; winner: SideIndex; reason: EndReason };
