# Decisions log

Every change to a decision in `MASTER_PROMPT.md`, newest first. Format: date, old decision, new decision, reason.

## 2026-11-15: Phase 1

- **Ricochet's beam swings instead of tracing the path.** Old (5.6): "trails a beam behind it that captures cells it sweeps". First build: the beam followed the runner's exact path. The lab showed that this only re-covers cells the runner has just taken, and Ricochet won 0% against Splitter at every value tried. New: a straight beam trails behind the runner, and after each turn it swings back to trailing at `beam.swingRate` (6 rad/s), sweeping an arc. Area per bounce grows with the square of beam length, and the swing is very visible. It is still "a beam behind it that captures what it sweeps"; this is the reading the lab supports.
- **Phase 1 Core values.** Ricochet: beam starts at 60 and grows 38 per hit (brief: 12). Splitter: a split every 7 hits (brief: 4), with splits at 0.7 size and 0.7 speed. Reason: at the brief's values Splitter's splits fed its own growth and took the map by 20–25 s every game. With these values Ricochet wins 49.8% over 2,000 games, 12–13% of matches are decided before half time, and the median final lead change comes at 38.5 s. Report: `docs/balance/phase1-core-matrix.md`.
- **Splits' hits count toward the next split.** The brief does not say. Counting them is what makes Splitter "slow then explosive"; the higher threshold keeps the explosion late.
- **Capture order alternates by step.** Runners resolve captures front to back on even steps and back to front on odd ones, so neither side always gets the last word on a contested cell.
- **No trigonometry in the sim, enforced by ESLint.** Headings turn with `rotateSmall` (a Taylor series renormalised with `sqrt`) and random directions come from rejection sampling. This makes rule 4.3.4 a lint error rather than a guideline. Arena generation (d3-delaunay) uses only `+ - * /` and robust predicates.
- **Mirror matches recolour side B.** When both sides run the same Core, side B uses the Core's alternate colour and name (for example SCARLET RICOCHET), so the sides are never told apart by shape alone.
- **`@typescript-eslint/no-non-null-assertion` is off.** It conflicts with `noUncheckedIndexedAccess` in hot typed-array loops, where `!` is the honest choice and `?? 0` would add a branch to every read.
- **Added `tsx` (dev only)** to run the TypeScript lab tool without a build step. **Added Preact, `@preact/signals` and `d3-delaunay`** as planned in 4.1, now that the screens and arena exist.
- **Lead-change count is noisy.** It counts every flip of the strict leader, so near-ties inflate it (10–17 per match). It still meets "≥ 2", but Phase 2 should add hysteresis before using it to tune the tension tools.

## 2026-11-15: Phase 0

- **Application ID.** Set to `com.yousufkamran.turfbreak`, confirmed by Yousuf. It cannot change after publishing.
- **TypeScript 6.0, not the latest 7.0.** Old: "prefer the latest stable versions". New: pin `typescript ~6.0.3`. Reason: TypeScript 7.0.2 is out, but `typescript-eslint` 8.72 supports only TypeScript below 6.1. Revisit when typescript-eslint supports 7.
- **Platform interface gains lifecycle hooks.** Old: the 7.1 sketch had no pause, resume or back events. New: `onPause`, `onResume` and `onBack(cb => handled)` on `Platform`. Reason: rule 4.3.8 keeps Capacitor inside `src/platform`, so the game needs a platform-neutral way to hear the back button and app backgrounding (6.4).
- **Added runtime dependency `@capacitor/share`.** The 7.1 table names the Share plugin for Android; it was missing from the 4.1 dependency list.
- **`crazygames` target uses the web adapter until Phase 7.** It builds and zips today; the SDK adapter is Phase 7 work.
- **Preact, `@preact/signals` and `d3-delaunay` are not installed yet.** Phase 0 has no menus and no Voronoi. They arrive with the phases that use them, so nothing unused sits in the lockfile.
- **Release `versionCode` is the release workflow's run number plus 100000.** Old: "versionCode comes from the workflow run number". Reason: release and debug builds come from different workflows with separate run counters. The offset keeps release codes above every debug code and still increasing for Play.
- **Main branch flow.** `main` was created with an initial commit; each phase is built on a branch and merged by pull request once CI is green (Yousuf's choice).
