import type { SideIndex } from './world';

export type CaptureCause = 'runner' | 'beam' | 'radius' | 'pickup' | 'ability';
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
  | { type: 'ShieldHit'; step: number; cell: number; owner: SideIndex }
  | { type: 'Teleport'; step: number; side: SideIndex; runner: number; fromX: number; fromY: number; x: number; y: number }
  | { type: 'ModTriggered'; step: number; side: SideIndex; slot: number }
  | { type: 'UltimateFired'; step: number; side: SideIndex; echo: boolean }
  | { type: 'Blast'; step: number; side: SideIndex; x: number; y: number; radius: number }
  | { type: 'PickupSpawned'; step: number; id: number; kind: string; x: number; y: number }
  | { type: 'PickupCollected'; step: number; id: number; kind: string; side: SideIndex; x: number; y: number }
  | { type: 'PickupExpired'; step: number; id: number }
  | { type: 'MatchEnded'; step: number; winner: SideIndex; reason: EndReason };
