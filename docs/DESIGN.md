# Design notes

Living design detail as it firms up. The brief (`MASTER_PROMPT.md` sections 5 and 6) is the baseline; this file records how it was actually built and why.

## Simulation (Phase 1)

- **Arena.** 13 × 14 jittered grid (182 cells), jitter 0.85, two Lloyd passes, Voronoi clipped to 1000 × 1000. Shared edges between neighbours are precomputed for the frontier line. The starting split sorts cells by signed distance to a seeded line through the centre and gives each side exactly 91.
- **Step order.** Core `onStep` hooks (side 0 then 1), move every runner (wall bounce plus jitter), resolve enemy clashes in index order, then captures: the cell under each runner, then capture radius, then the beam. Capture order alternates direction each step. Then wipeout check, lead tracking and the buzzer. Runners spawned during a step start moving on the next one.
- **Clash.** Enemy runners that overlap are pushed apart. If they are closing, each one's velocity component along the normal is reflected, and both sides count a hit. Speed stays a stat, never stored on the runner.
- **Beam.** A beam is a world feature any side can have (`beamLength` stat). It is a straight line from the primary runner along `(bx, by)`, clipped at the walls. Each step the beam turns toward straight-behind-the-runner at up to `swingRate`, then captures every enemy cell under samples spaced 24 units apart. Ricochet grows the beam on every hit.
- **Splits.** Spawned at the parent's position with a random heading. Over the per-side cap of 32, each extra spawn becomes +2% side speed (overflow), shown as a spawn that did not appear.
- **Sudden death.** A tie at the buzzer continues until the next capture. If none comes within 10 s, the side with more hits wins, then a seeded coin.

## Input and tension (Phase 2)

- **Input records.** `{ step, side, type: 'redirect', x, y }`. The UI queues them for the next step. The sim applies them at the start of the step, after which built-in controllers act, then cooldowns tick. Everything applied lands in `world.inputLog`. Seed, Cores and that log replay a match exactly (tested).
- **Redirect.** Points the primary's heading straight at the tap and spends a charge; the cooldown starts when a charge is spent. It also sets the runner's beam swinging; this is the only way a beam sweeps (bounces and clashes snap it straight behind). For Ricochet a sharp redirect is therefore a big sweep, and the angle of the turn is the skill.
- **Pickups.** Spawned from the sim PRNG, so they are part of the replay. Grab order alternates by step like captures. Surge multiplies the side's speed factor, Shield makes `capture` refuse to flip the owner's cells, Blast captures by centroid distance, Charge sets charges to 1.
- **Controllers.** The heuristic scores 16 fixed headings (written as literals, no trig) by counting enemy cells along a 1,100-unit bouncing ray, plus 0.4 × the enemy cells a beam would sweep during the turn. It also considers heading straight at each reachable pickup, valued at 24 cells minus one per 70 units. It redirects when the best beats the current heading by `minGain` cells, after a reaction delay, with aim error. If nothing is worth it, it re-checks every 0.25 s. Assist uses the same code with worse numbers.
- **Underdog boost.** The trailing side's speed factor is 1 + min(6%, 0.5 × deficit share).

## Juice and audio (Phase 2)

- Everything is driven by the sim's event queue and has its own cosmetic PRNG stream.
- **Capture pops:** a white flash and a scale pop, staggered by 12 ms per cell within a frame (capped at 0.3 s), so a beam sweep reads as a wave.
- **Sparks:** from a pooled particle array (480 max), drawn as additive streaks.
- **Shake:** trauma-based (trauma squared × 14 units), added by clashes, primary wall bounces and Core triggers.
- **Hit-stop:** 60 ms on clashes involving a primary.
- **Tap marker:** an expanding ring where the redirect aimed, plus a pulsing ring around the player's runner showing the cooldown.
- **Audio:**
  - Each side has its own pentatonic scale. Wall bounces climb it and the climb resets after 1.2 s without a hit.
  - Capture ticks are limited to one per side per 45 ms.
  - Clashes, Core triggers and redirects each have their own sounds.
  - A tick plays every second in the last 10 s, and a stinger on win or loss.
  - The audio context starts on the Play tap and suspends when the app pauses.

## Look (Phase 1)

- Territory is the side's colour mixed 38% toward the background; edges are white at 10%; the frontier is white at 90%.
- Runners are drawn 1.7× (primary) or 1.4× (split) their collision radius so they read on a phone. Primaries have a white outline.
- The beam is drawn additively: a wide faint pass for glow and a bright core, with no `shadowBlur`.
- Ricochet is a diamond and Splitter a hexagon, so the sides differ by shape as well as colour.

## Balance notes

- Ricochet's curve is steady and front-loaded: it usually leads mid-match. Splitter is slow then explosive: few splits before 20 s, then a late surge. Most Ricochet vs Splitter matches are a race between Ricochet's lead and Splitter's explosion, which is the crossing-curves shape 5.6 asks for.
