import { tuning } from '../content/tuning';
import type { MatchSummary } from '../content/unlocks';
import { statValue, type World } from '../sim/world';

const SPS = tuning.sim.stepsPerSecond;
const LATE_LEAD_SECONDS = 10;

/**
 * Counts what feats need from a match: call `observe` after every sim step (it
 * reads that step's events and the world), then `summary` once the match ends.
 * Lives in the UI layer, so the sim stays untouched. Side 0 is the player.
 */
export class MatchStats {
  private readonly primaries: number;
  private maxRunners = 0;
  private peakDeficit = 0;
  private shieldAbsorbed = 0;
  private pickups = 0;
  private ultimates = 0;
  private lastUltimateStep = -1;
  private leadLate = false;
  private longestBeam = 0;

  constructor(
    world: World,
    private readonly mods: number,
    private readonly rivalCoreId: string,
  ) {
    this.primaries = world.runners.filter((r) => r.side === 0 && r.primary).length;
    this.observe(world);
  }

  observe(world: World): void {
    for (const ev of world.events) {
      switch (ev.type) {
        case 'ShieldHit':
          if (ev.owner === 0) this.shieldAbsorbed++;
          break;
        case 'PickupCollected':
          if (ev.side === 0) this.pickups++;
          break;
        case 'UltimateFired':
          if (ev.side === 0 && !ev.echo) {
            this.ultimates++;
            this.lastUltimateStep = ev.step;
          }
          break;
        case 'LeadChange':
          if (ev.leader === 0 && world.matchSteps - ev.step <= LATE_LEAD_SECONDS * SPS) this.leadLate = true;
          break;
        default:
          break;
      }
    }
    const side = world.sides[0];
    if (side.runnerCount > this.maxRunners) this.maxRunners = side.runnerCount;
    const deficit = world.counts[1] - world.counts[0];
    if (deficit > this.peakDeficit) this.peakDeficit = deficit;
    if (side.core.id === 'ricochet') {
      const beam = statValue(side, 'beamLength');
      if (beam > this.longestBeam) this.longestBeam = beam;
    }
  }

  /** The finished match. `world` must be the same world that was observed. */
  summary(world: World): MatchSummary {
    const side = world.sides[0];
    const won = world.winner === 0;
    return {
      coreId: side.core.id,
      rivalCoreId: this.rivalCoreId,
      won,
      margin: Math.abs(world.counts[0] - world.counts[1]),
      wipeout: won && world.endReason === 'wipeout',
      seconds: world.step / SPS,
      leadChanges: world.leadChanges,
      maxRunners: this.maxRunners,
      maxSplits: Math.max(0, this.maxRunners - this.primaries),
      peakDeficit: this.peakDeficit,
      shieldAbsorbed: this.shieldAbsorbed,
      pickups: this.pickups,
      ultimates: this.ultimates,
      lastUltimateLeft: this.lastUltimateStep < 0 ? null : Math.max(0, (world.matchSteps - this.lastUltimateStep) / SPS),
      leadLate: this.leadLate,
      triggers: side.triggers,
      longestBeam: Math.round(this.longestBeam),
      mods: this.mods,
    };
  }
}
