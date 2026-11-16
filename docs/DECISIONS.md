# Decisions log

Every change to a decision in `MASTER_PROMPT.md`, newest first. Format: date, old decision, new decision, reason.

## 2026-11-16: Autonomous build-out (Stages A–D)

Yousuf asked for several hours of autonomous work to bring the game to "complete per the planning docs", with decisions made without him and recorded here, and with cheaper agents used for implementation and playtesting. The working plan and interface contracts are in `STAGE_PLAN.md`.

### Process
- **Fun gate treated as passed for building, not for shipping.** Yousuf never played the Gauntlet build before asking for the build-out. Agent playtests (Playwright runs, screenshots, lab numbers) stand in between stages. They can find bugs, confusion, pacing and balance problems; they cannot confirm fun. His own play test of the result is still required.
- **Phases 3 and 4 merged into Stage A.** Building four Cores and sixteen Mods first and then the rest would mean tuning rivals and runs twice. Stage A ships all 8 Cores and 30 Mods at once.
- **Parallel agents in git worktrees,** each owning disjoint files, coding against the contracts in `STAGE_PLAN.md`. Numbers live in each Core's or Mod's own definition so they do not collide in `tuning.ts`.

### Sim API (groundwork for Stage A)
- **Timers:** `ctx.after(seconds, fn)` replaces the Encore-only echo queue. Timers keep the identity of the hook that set them.
- **Per-cell shields and locks:** shield points absorb one capture attempt each, with a 0.3 s pause between attempts so a runner sitting on a cell does not burn through them in two steps. Locks make a cell untakeable until a step.
- **Also added:** teleport, steer (capped at 0.3 rad per call, no trig), `slowEnemy`, `cedeCells`, `boostCore` (each Core defines what "grow your signature by a factor" means, so Compound, Echo and Buzzer Beater work with every Core), `grantUltimate`, a `triggerDiscount` stat for Hair Trigger, Mod hooks `onCellLost`, `onCoreTrigger`, `onPickup`, `onStep`, `onLeadChange`, and `ModDef.run()` for economy Mods.
- **Match twists** (`MatchConfig.twist`): extra primaries, start share, start shields, duration, pickup rate. Bosses use these instead of new arena geometry (the brief's shrinking arena and wall cells would need collision changes for little gain).
- **Design changes from the brief's Core table:**
  - **Leech** no longer "steals a share of the enemy Core's stacks": stacks mean different things per Core, so a generic steal has no sensible effect. It now hunts: it steers toward the enemy primary, and each clash gives it permanent speed and slows the enemy.
  - **Phantom** blasts a small radius where it lands, so a jump is visible and worth something by itself.
- **Mods dropped from the brief's list:** Mirror Shard (copying another Core's signature at half strength needs every Core written twice) and the redirect-group Mods. Added in their place: Hoarder, Second Wind, Comeback, Quick Hands (ultimate recharge).

## 2026-11-15: Phase 2, after the second fun-gate play test

Yousuf's verdict on the redirect build: "doesn't feel satisfying or fun at all", and lose the redirect; "the game should be simple yet extremely satisfying and fun". His choices: in-match input is a combination of a launch aim and a once-per-match ultimate (mostly watching); next comes a satisfaction pass plus a mini draft; pickups stay in the arena and their effects also become Mods.

- **Redirect removed.** The tap-to-redirect is gone along with its cooldown, rules, controllers, tests and UI. Old (5.4): one redirect on a 5 s cooldown. New: aim the launch before each match, plus one ultimate per match. Agency moves to the draft, as in Super Auto Pets.
- **Ultimates per Core.** Ricochet **Spin**: the beam sweeps one full circle, capped at 300 long (uncapped, Spin decided matches early). Splitter **Burst**: one split per 3 owned, at least one (a flat 2–3 splits early made Splitter win about 86%). A Charge pickup restores the ultimate (it is now rarer, weight 1).
- **Ricochet's beam swings after every hit again,** as an explicit Core behaviour (`swingBeam`), not a world default. With no steering it is the Core's spectacle rather than noise competing with input. Values: beam +40 per hit (start 60); Splitter splits every 8 hits.
- **Pickups:** any runner grabs them, and beams snag them. With splits grabbing, pickups swung Ricochet vs Splitter from 57% to 35%; letting beams snag them restored about 49%.
- **Mods, first version (9):** Overclock, Growth Spurt, Chain Reaction, Afterburner, Shockwave, Bulwark, Magnet, Encore and Head Start, with three levels each. Hooks fire Core first, then Mods in slot order. The Head Start and Growth Spurt numbers were cut from the brief's after the Mod-impact report (see PROGRESS).
- **Gauntlet:** a five-round mini draft (pick a Core, draft 1 of 3 before every match, rivals get the same number of random picks). It tests whether building is the fun. It is not Phase 3's run (no hearts, bosses or saves).
- **Satisfaction pass:**
  - drag-to-aim with a bouncing preview
  - the ultimate button with slow motion, flash, banner and shockwave
  - capture-streak ticks that climb, with ×10/×25/×50/×100 callouts, chords and shake
  - a generated beat that gains layers in the last 10 s
  - a match-end freeze, confetti and a result drop-in
- **Speed cap and additive overflow (bug fix).** Speed feeds hits and hits feed speed (Overclock, overflow), so speed reached about 10¹⁷ and late Splitter swarms jittered at the walls. Runner speed is now capped at 1,800 units/s, and overflow adds 2% of base speed instead of multiplying. A new invariant and test cover it.
- **Fast runners capture along their path (bug fix).** Above about 30 units per step, runners skipped cells. Captures now sample along the whole step.
- **Match-start events reach the first step (bug fix).** Head Start's trigger was being cleared before the HUD saw it.
- **"Decided early" lab metric** now requires that the side that passed 70% before half time also won. With big sweeps, sides often pass 70% and still lose.

## 2026-11-15: Phase 2, after the first fun-gate play test

Yousuf's feedback: matches felt too random because of Ricochet's beam, which made it hard to see whether inputs mattered. He suggested temporary upgrades during a match. His choices: beam sweeps only on redirect; pickups grabbed by steering; Redirect (5 s) as the input.

- **Ricochet's beam sweeps only after a redirect.** Old: it swung after every wall bounce and clash, so bounce luck decided the biggest swings. New: bounces and clashes snap it straight behind with no sweep; a redirect starts a swing that sweeps until the beam trails again. Result: Ricochet's redirect is worth +47 to +50 points over not redirecting, and aiming well (against random aim) is worth +11 to +35. Without redirects Ricochet now loses almost every game, so a Ricochet rival in rounds 1–3 (no redirects, 5.4) will be weak; revisit in Phase 3.
- **In-match pickups added** (new, not in the brief): Surge, Blast, Charge and Shield, defined in `src/content/pickups.ts`.
  - The first spawns at 3 s, then one every 6 s at a seeded cell centre away from both primaries. At most 2 are on the map, and each lasts 10 s.
  - Only primary runners grab them, so steering decides who gets them.
  - Pickups are temporary and in-match; Mods (Phase 3) stay permanent for a run.
  - In mirror matches the side with more pickups wins 50–62% of games.
- **Input settled on Redirect (5 s).** Redirect+ and Hold to boost are removed, along with their code. No input stays for watching, assist and rivals in rounds 1–3. The redirect rules stay configurable for Mods.
- **Rival AI:** scores the cells a Ricochet swing would sweep (weight 0.4), and races for pickups worth 24 cells minus 1 per 70 units of distance. These weights bring Ricochet vs Splitter to 49.9% with both sides redirecting.

## 2026-11-15: Phase 2

- **Overtime surge removed.** Old (5.3): "in the last 10 seconds, capture radius effects and Core triggers are amplified". The lab (both sides on the rival heuristic) showed that it does not help tension: the final lead change already comes at about 38 s, and early-decided matches were unchanged. It also skews balance: doubling hit triggers feeds Splitter's late explosion, and Ricochet fell from about 50% to 25–29%. 5.3 says to remove a tool that is not needed. The urgent timer and audio in the last 10 s stay, as presentation only.
- **Underdog boost kept at 6%, not 15%.** At 15% it cancelled out skill: the redirect heuristic was worth −5 to −1 points, because playing well made the rival faster. At 6% it still lifts lead changes (6.3 to 7.6 for Ricochet vs Splitter) and cuts early-decided matches from 21% to 16%.
- **Lead changes use a 3-cell hysteresis.** A side takes the lead only when 3 cells ahead. This fixes the noisy Phase 1 metric and stops the territory-bar thump from flickering.
- **Redirect rules are per-match config** (`MatchConfig.redirect`) with defaults in `tuning.input.redirect`. This lets the debug switch compare variants without code changes. Added `onRedirect` to the hooks and `'redirect'` as a hit kind.
- **Input variants for the fun gate:** Redirect (the brief's: 5 s), Redirect+ (3 s, each redirect counts as a hit), Hold to boost (×1.6 on a 2 s meter that refills in 6 s) and No input. The rival uses the same input as the player. Yousuf picks one after playing; see PROGRESS for the lab numbers behind each.
- **Controllers run inside the sim,** each side on its own PRNG stream (`ai0`, `ai1`). Rival redirects are therefore deterministic and replayable, and one side's AI never shifts the other's.
- **The rival looks 1,100 units ahead** along its bouncing path (was 520). A redirect shapes about 5 s of travel, and the longer ray roughly doubled the heuristic's value for Ricochet.
- **Setup screen starts on a random seed.** Phase 1 always opened on seed 1, which Ricochet wins, so repeated tests looked one-sided.

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
