# Stage plan for the autonomous build-out (16 Nov 2026)

Yousuf asked for several hours of autonomous work to take the game to "complete per the planning docs". This file is the working plan and the interface contracts that parallel agents code against. Decisions are logged in `DECISIONS.md`; results in `PROGRESS.md`.

## Stages

| Stage | Covers | Content |
| --- | --- | --- |
| A | Phases 3 + 4 | 8 Cores, 30+ Mods, the run (10 rounds, hearts, reroll, bosses, Ascension, Endless), saves, run UI |
| B | Phase 5 | Settings, reduce motion, high contrast, desktop layout, icon and splash, performance, UI smoke tests in CI |
| C | Phase 6 | Unlocks and Collection, Daily Clash, Versus Lab, replay codes, clip export, lifetime stats |
| D | Phase 7 | CrazyGames adapter, ad placements behind the adapter, privacy page, store kit, guides |

After each stage: merge to `main`, then playtest agents play the web build with Playwright and the lab, and report. Their findings drive a fix round before the next stage.

## Rules for every agent

- Read `CLAUDE.md` first. `src/sim` is pure and deterministic. Content is data in `src/content`.
- Numbers for a Core or Mod live in that Core's or Mod's definition (a `values` object or level arrays), not in `tuning.ts`, so parallel work does not collide.
- Do not change how Ricochet and Splitter behave unless your task says so. If golden hashes in `tests/__snapshots__` change and you did not intend a sim change, you broke determinism: find out why.
- The ability API in `src/sim/abilities.ts` is complete for the planned content. If you truly need an addition, keep it small and additive, and say so in your report.
- `npm run check` must pass before you commit. Commit on your current branch with a conventional message. Do not push, do not open PRs.
- Report back: what you built, files touched, test count, lab numbers, anything you could not do, and any design call you made.

## Ability API quick reference

Hooks (Core): `onMatchStart, onStep, onHit(hit.kind = wall|clash), onCapture, onCellLost, onUltimate, onBoost(factor)`.
Hooks (Mod, each gets `level`): `onMatchStart, onHit, onCapture, onCellLost, onCoreTrigger, onPickup(kind), onStep, onLeadChange(ahead), onUltimate, onInterval` (with `intervalSeconds(level)`), plus `run(level)` for economy effects.
Context: `stacks/addStacks, addStat/mulStat, counter/setCounter, primary, spawnRunner, captureCell, blast, shield, surge, setPickupReach, addHits, swingBeam, spinBeam, after(seconds, fn), shieldCells, lockCells, teleport, steer, slowEnemy, cedeCells, secondsLeft, lead, boostCore, grantUltimate, echoUltimate, triggered, rng, world (read-only), side, enemy`.
Stats: `speed, bodyRadius, captureRadius, beamLength, triggerDiscount`. A Core's "every N hits" threshold must be `max(1, N - triggerDiscount)`.
Helpers: `src/content/helpers.ts` (`at`, `enemyCellsWithin`, `nearestEnemyCells`, `frontierCells`, `loneliestEnemyCell`, `share`, ...).
Counter slots: Cores use 0–9. Mods use `20 + their index in the mods array` and up; never share a slot.

## Cores (8)

Each needs: colour and alt colour (distinct from all others, readable on the dark background), a unique shape, signature text, `stackLabel`, `values`, an `ultimate` (name, description, `value()`, `threshold`), `onBoost`, and hooks. Growth curves must differ in shape.

| Core | Signature | Ultimate | onBoost(f) |
| --- | --- | --- | --- |
| Ricochet (exists) | Beam grows per hit, swings after each hit | Spin | Beam length × f |
| Splitter (exists) | Split every N hits | Burst | Spawn `max(1, floor(splits × (f − 1)))` splits |
| Pulse (cyan, circle) | Every 5 hits, a shockwave captures in a radius; the radius grows each pulse | Nova: one shockwave at 2.2× radius | Pulse radius × f |
| Bloom (green, pentagon) | Cells it captures spread to one adjacent enemy cell after 2 s, by chance; the chance grows per capture (cap it) | Overgrowth: every frontier cell spreads at once | Spread chance × f (still capped) |
| Fortress (gold, square) | Every 10 captures, its whole territory gains a shield point (cap per cell) | Bastion: +2 shield on every cell and untakeable for 2 s | Grant shields now |
| Phantom (violet, triangle) | Every 6 s, teleports to the enemy cell furthest from any runner and blasts a small radius; the interval shortens each jump (floor it) | Blink Storm: 4 quick jumps | Interval ÷ f |
| Juggernaut (orange, octagon) | Capture radius grows every 8 captures; speed drops slightly as it grows | Stampede: double speed and +50% capture radius for 4 s | Capture radius × f |
| Leech (teal, star) | Steers gently toward the enemy primary. On a clash: gains permanent speed and slows the enemy for a moment | Drain: captures the N enemy cells nearest the enemy primary and slows the enemy | Speed stacks × f |

## Mods (30+)

Three levels each; rarity common, uncommon or rare; a `group`; a one-character `glyph` (no duplicates); `text(level)` with numbers filled in. Existing nine stay: overclock, growth-spurt, chain-reaction, afterburner, shockwave, bulwark, magnet, encore, head-start. New ids and intent (numbers are the implementer's first guess, then tuned by the lab):

| id | Group | Effect (L1 / L2 / L3) |
| --- | --- | --- |
| compound | Scaling | Every 10 s, `boostCore(1.2 / 1.3 / 1.45)` |
| echo | Trigger | Every 3rd Core trigger, `boostCore(1.06 / 1.09 / 1.12)` |
| hair-trigger | Trigger | `triggerDiscount` +1 / +2 / +3 |
| clash-engine | Trigger | A clash counts as 2 / 3 / 4 extra hits |
| wall-hugger | Trigger | A primary's wall bounce captures the 2 / 3 / 4 enemy cells nearest the bounce |
| scorched-trail | Territory | Cells you capture cannot be retaken for 1.5 / 2 / 3 s |
| ramparts | Territory | Every 10 s, your cells with no enemy neighbour gain a shield point (cap 1 / 1 / 2) |
| encircle | Territory | After you capture a cell, any neighbouring enemy cell with no enemy neighbour flips to you (L2, L3: also check neighbours of neighbours) |
| landmines | Territory | Every 8 / 7 / 6 s, mine one of your frontier cells. When the enemy takes it, blast 110 around it |
| critical-mass | Territory | The first time you hold 65 / 62 / 58% of the map, blast 260 around your runner |
| underdog | Timing | While behind, +20 / 30 / 40% speed |
| buzzer-beater | Timing | In the final 8 s, `boostCore(1.15)` every 2 / 1.5 / 1 s |
| front-runner | Timing | While ahead, every 3 s your frontier cells gain a shield point (cap 1 / 1 / 2) |
| comeback | Timing | When you lose the lead: Surge ×1.5 for 3 / 4 / 5 s |
| scavenger | Economy | `run`: +1 / 2 / 3 rerolls per win |
| collector | Economy | `run`: after a win by 20 / 15 / 10 cells, the next draft offers one more Mod |
| glass-cannon | Wild | +50 / 65 / 80% speed; at match start, cede cells until you hold 40% of the map |
| decoy | Wild | Start with 1 / 2 / 3 small slow extra runners |
| second-wind | Wild | Once per match, when you fall under 30% of the map: Shield 2 / 3 / 4 s and Surge |
| quick-hands | Ultimate | Your ultimate is ready again 16 / 12 / 9 s after you use it (once / once / twice) |
| hoarder | Pickup | Each pickup you grab also gives +4 / 6 / 9% of base speed for the match |

## The run (contract for `src/run/run.ts`)

Pure functions over one JSON-serialisable state, so the UI, the lab and saves share it. Randomness comes from a `RngState` stored in the state, so a run is reproducible from its seed (Daily Clash depends on this).

```ts
export interface BuildEntry { id: string; level: number }
export interface RivalSpec {
  name: string;                 // "CYAN PULSE", or a boss name
  coreId: string;
  mods: BuildEntry[];
  seed: number;                 // match seed
  bossId: string | null;
  twist: MatchTwist | null;
  controller: ControllerSpec | null;
}
export interface RoundResult { round: number; won: boolean; margin: number; wipeout: boolean; rivalName: string }
export interface RunState {
  version: 1;
  seed: number;
  rng: RngState;
  mode: 'standard' | 'daily';
  ascension: number;            // 0..8
  coreId: string;
  build: BuildEntry[];          // slot order
  round: number;                // 1-based; the round about to be drafted for or played
  hearts: number;
  rerolls: number;
  phase: 'draft' | 'match' | 'summary';
  offer: string[];              // mod ids on offer while phase === 'draft'
  rival: RivalSpec | null;      // set while phase === 'match'
  history: RoundResult[];
  endless: boolean;             // continuing past round 10
  outcome: 'won' | 'lost' | null;
}
export function startRun(o: { seed: number; coreId: string; ascension?: number; mode?: 'standard' | 'daily'; unlockedMods?: string[] }): RunState; // phase 'draft', round 1
export function pickMod(run: RunState, modId: string | null): RunState;      // null = skip (+1 reroll); goes to 'match' with a rival
export function rerollOffer(run: RunState): RunState;                        // spends a reroll
export function replaceMod(run: RunState, modId: string, slot: number): RunState; // 7th Mod replaces a slot
export function matchConfig(run: RunState): MatchConfig;                     // player is side 0
export function finishMatch(run: RunState, r: { won: boolean; margin: number; wipeout: boolean }): RunState; // to 'draft' or 'summary'
export function continueEndless(run: RunState): RunState;                    // from a won summary
export function buildPicks(build: BuildEntry[]): ModPick[];
```

Rules: 10 rounds; 3 hearts (a loss costs one; the run ends at 0 or after round 10); start with 1 reroll; a Wipeout grants +1 reroll; a draft after every match, win or lose; build cap 6 with replace; owned Mods level up to 3. Rounds 5 and 10 are bosses with a hand-authored build and a `MatchTwist`; four bosses in rotation. Rivals come from hand-authored archetype lists per Core (`src/content/rivals.ts`): an ordered list of Mod ids; a rival at round r takes the first k picks, levelling duplicates. Rival strength (picks per round, controller on or off) scales with round and Ascension. Rounds 1–2 rivals use no controller. Ascension tiers 1–8 each add one rule (`src/content/ascension.ts`). Endless: after a won run, rivals keep scaling until hearts run out.

Lab (`tools/lab.ts --runs`): simulate whole runs headlessly with a random drafter and a synergy drafter (prefers upgrades and Mods whose group it already has), per Core and Ascension tier, and report run win rate and average rounds survived. Targets: random drafter 35–50% at tier 0; synergy drafter about 80%.

Saves (`src/meta/save.ts`, version 2 with a migration from 1): `{ version, launches, settings, run: RunState | null, stats, unlocks, bestAscension: Record<coreId, number> }`. Corrupt or unknown saves fall back to defaults and never throw.
