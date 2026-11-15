# Design notes

Living design detail as it firms up. The brief (`MASTER_PROMPT.md` sections 5 and 6) is the baseline; this file records how it was actually built and why.

## Simulation (Phase 1)

- **Arena.** 13 × 14 jittered grid (182 cells), jitter 0.85, two Lloyd passes, Voronoi clipped to 1000 × 1000. Shared edges between neighbours are precomputed for the frontier line. The starting split sorts cells by signed distance to a seeded line through the centre and gives each side exactly 91.
- **Step order.** Core `onStep` hooks (side 0 then 1), move every runner (wall bounce plus jitter), resolve enemy clashes in index order, then captures: the cell under each runner, then capture radius, then the beam. Capture order alternates direction each step. Then wipeout check, lead tracking and the buzzer. Runners spawned during a step start moving on the next one.
- **Clash.** Enemy runners that overlap are pushed apart. If they are closing, each one's velocity component along the normal is reflected, and both sides count a hit. Speed stays a stat, never stored on the runner.
- **Beam.** A beam is a world feature any side can have (`beamLength` stat). It is a straight line from the primary runner along `(bx, by)`, clipped at the walls. Each step the beam turns toward straight-behind-the-runner at up to `swingRate`, then captures every enemy cell under samples spaced 24 units apart. Ricochet grows the beam on every hit.
- **Splits.** Spawned at the parent's position with a random heading. Over the per-side cap of 32, each extra spawn becomes +2% side speed (overflow), shown as a spawn that did not appear.
- **Sudden death.** A tie at the buzzer continues until the next capture. If none comes within 10 s, the side with more hits wins, then a seeded coin.

## Look (Phase 1)

- Territory is the side's colour mixed 38% toward the background; edges are white at 10%; the frontier is white at 90%.
- Runners are drawn 1.7× (primary) or 1.4× (split) their collision radius so they read on a phone. Primaries have a white outline.
- The beam is drawn additively: a wide faint pass for glow and a bright core, with no `shadowBlur`.
- Ricochet is a diamond and Splitter a hexagon, so the sides differ by shape as well as colour.

## Balance notes

- Ricochet's curve is steady and front-loaded: it usually leads mid-match. Splitter is slow then explosive: few splits before 20 s, then a late surge. Most Ricochet vs Splitter matches are a race between Ricochet's lead and Splitter's explosion, which is the crossing-curves shape 5.6 asks for.
