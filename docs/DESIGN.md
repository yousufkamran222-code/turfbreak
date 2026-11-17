# Design notes

Living design detail as it firms up. The brief (`MASTER_PROMPT.md` sections 5 and 6) is the baseline; this file records how it was actually built and why.

## Simulation (Phase 1)

- **Arena.** 13 × 14 jittered grid (182 cells), jitter 0.85, two Lloyd passes, Voronoi clipped to 1000 × 1000. Shared edges between neighbours are precomputed for the frontier line. The starting split sorts cells by signed distance to a seeded line through the centre and gives each side exactly 91.
- **Step order.** Core `onStep` hooks (side 0 then 1), move every runner (wall bounce plus jitter), resolve enemy clashes in index order, then captures: the cell under each runner, then capture radius, then the beam. Capture order alternates direction each step. Then wipeout check, lead tracking and the buzzer. Runners spawned during a step start moving on the next one.
- **Clash.** Enemy runners that overlap are pushed apart. If they are closing, each one's velocity component along the normal is reflected, and both sides count a hit. Speed stays a stat, never stored on the runner.
- **Beam.** A beam is a world feature any side can have (`beamLength` stat). It is a straight line from the primary runner along `(bx, by)`, clipped at the walls. Each step the beam turns toward straight-behind-the-runner at up to `swingRate`, then captures every enemy cell under samples spaced 24 units apart. Ricochet grows the beam on every hit.
- **Splits.** Spawned at the parent's position with a random heading. Over the per-side cap of 32, each extra spawn becomes +2% side speed (overflow), shown as a spawn that did not appear.
- **Sudden death.** A tie at the buzzer continues until the next capture. If none comes within 10 s, the side with more hits wins, then a seeded coin.

## Input, ultimates, pickups and Mods (Phase 2, final)

- **Input records.** `{ step, side, type: 'launch', dx, dy }` (valid only before step 2) and `{ step, side, type: 'ultimate' }`. The UI queues them for the next step; the sim applies them at the start of the step, then controllers act, then Encore echoes due this step. Everything applied lands in `world.inputLog`. Seed, Cores, Mods and that log replay a match exactly (tested).
- **Ultimate.** One per match (`ultimates`); a Charge pickup sets it back to one. Firing runs the Core's `onUltimate`, then each Mod's `onUltimate`. Encore schedules echoes that re-run only the Core's effect.
- **Controllers.** Launch: the best of 16 fixed headings by enemy cells along a 1,100-unit bouncing ray, plus aim error. Ultimate: each Core defines `ultimate.value(world, side)` and a threshold (Ricochet: enemy cells inside the Spin disc; Splitter: splits owned). Controllers fire when value ≥ threshold × patience, or 6 s before the buzzer.
- **Beam.** It trails straight behind. It swings back to trailing at 6 rad/s after a Ricochet hit, and spins at 7 rad/s on Spin (reach capped at 300). It sweeps cells while swinging or spinning, and snags pickups.
- **Pickups.** Any runner grabs one by touching it (radius 32 plus body, times the Magnet reach). A beam passing within 32 of one grabs it first.
- **Mods.** `ModDef` with three levels, optional `intervalSeconds(level)` and hooks that receive the level. `world.currentMod` routes `ctx.triggered()` to a `ModTriggered` event, so the HUD flashes that slot.
- **Speed.** Runner speed is capped at 1,800 units/s. Captures sample along each step's path at 30-unit spacing.
- **Underdog boost.** The trailing side's speed factor is 1 + min(6%, 0.5 × deficit share), times any Surge.

## Juice and audio (Phase 2)

- Everything is driven by the sim's event queue and has its own cosmetic PRNG stream.
- **Capture pops:** a white flash and a scale pop, staggered by 12 ms per cell within a frame (capped at 0.3 s), so a beam sweep reads as a wave.
- **Sparks:** from a pooled particle array (480 max), drawn as additive streaks.
- **Shake:** trauma-based (trauma squared × 14 units), added by clashes, primary wall bounces and Core triggers.
- **Hit-stop:** 60 ms on clashes involving a primary.
- **Rings:** spawn rings for pickups, collect bursts, Blast and ultimate shockwaves.
- **Streaks:** consecutive captures with gaps under 0.7 s. Ticks climb the side's scale; ×10/×25/×50/×100 pop as callouts with a chord, sparks and shake.
- **Ultimate moment:** 0.7 s of 0.3× slow motion, a white flash, a banner ("CRIMSON RICOCHET · SPIN!") and a rising whoosh.
- **Beat:** 118 BPM kick and hats from the launch; snare and bass join in the final 10 s.
- **Match end:** a 0.7 s freeze, confetti in the winner's colour, then the result drops in.
- **Audio:**
  - Each side has its own pentatonic scale. Wall bounces climb it and the climb resets after 1.2 s without a hit.
  - Capture ticks are limited to one per side per 45 ms.
  - Clashes, Core triggers, launches, ultimates, blasts and pickups each have their own sounds.
  - A tick plays every second in the last 10 s, and a stinger on win or loss.
  - The audio context starts on the first tap and suspends when the app pauses.

## Look (Phase 1)

- Territory is the side's colour mixed 38% toward the background; edges are white at 10%; the frontier is white at 90%.
- Runners are drawn 1.7× (primary) or 1.4× (split) their collision radius so they read on a phone. Primaries have a white outline.
- The beam is drawn additively: a wide faint pass for glow and a bright core, with no `shadowBlur`.
- Ricochet is a diamond and Splitter a hexagon, so the sides differ by shape as well as colour.

## Balance notes

- Ricochet's curve is steady and front-loaded: it usually leads mid-match. Splitter is slow then explosive: few splits before 20 s, then a late surge. Most Ricochet vs Splitter matches are a race between Ricochet's lead and Splitter's explosion, which is the crossing-curves shape 5.6 asks for.

## v0.7 reliability and agency comparison

Saves and replay links validate bounded match data before world allocation. Invalid active runs are discarded independently of settings, unlocks and lifetime stats. Per-key persistence serializes writes and coalesces pending values; failures retain the latest value for the next write/resume and show a status message. Background flush is best effort, never a guarantee after process termination.

The CrazyGames adapter bounds boot (10 s), adblock detection (3 s), initial ad response (15 s) and started-ad completion (180 s). A timed-out ad disables subsequent requests for the session. Per-request completion guards ignore stale callbacks; visibility and the match's explicit pause overlay prevent automatic resumption over a user pause.

Delayed simulation effects carry typed payloads rather than closures. Core hooks dispatch their own `onScheduled` effects; generic effects restore radius, grant readiness or echo an ultimate. Timer order and attribution are preserved. `hashWorld` includes controller state; `hashReplayState` compares physical simulation state without controllers, their RNG streams or their scheduling scratch, because recorded inputs replace those controllers. Presentation events are excluded from both.

Replay format 2 carries the ruleset and tactical-choice inputs. v0.7 rejects older incompatible replay versions. Valid v2 saves retain progress and active runs use the current balance. Classic is still the release default. Opt-in comparison runs are temporary, use matched run seeds and cannot persist player progress. See `AGENCY_PLAYTEST.md` for exact prototype rules and the human selection gate.
