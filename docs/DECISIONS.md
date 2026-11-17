# Decisions log

Every change to a decision in `MASTER_PROMPT.md`, newest first. Format: date, old decision, new decision, reason.

## 2026-11-17: Playtest round 1 fixes

- **Stuck 2x match: not reproduced.** Playwright runs (2x toggled during aiming, 3 s into the match, 40 rapid toggles, and during the ultimate slow-motion) all counted the timer down and ended the match. One latent bug was real and fixed: when a hit-stop began part-way through a frame at 2x or 4x, the frame's remaining steps were consumed without running, and the stepper was reset during hit-stop, so sim time was lost. `FixedStepper.advance` now lets the callback return `false` to stop the frame without consuming the step, and the session no longer resets the stepper during hit-stop. Unit tests added. Most likely the original stall was the driver (a pulsing `transform` also made the ultimate button "unstable" for Playwright clicks, so the ready pulse now uses only shadow and brightness).
- **VS card shows Mods by name.** Each Mod is a 44 px row: glyph, short name, level, two columns when there is room, for both sides. Tapping one opens a popover with its full text on that side's card; the 2 s auto-start waits while it is open, and a tap anywhere closes it (instead of starting the match).
- **Draft hint once.** `draftHintSeen` lives in the existing `turfbreak.ui` prefs key and is kept through Core changes. The skip button reads "Skip (+1 reroll)".
- **Seed hidden in matches** except the Debug quick match and the Versus Lab (`showSeed`).
- **Ultimate button states:** ready (filled in the player's colour, pulsing, "TAP: NAME" with description), aiming (dashed outline in the player's colour, "Ready after launch", full-contrast text), used ("Used", or "Ready in Ns" when the player has Quick Hands; the count is display-only, mirrored from the Mod's numbers; pickup recharges are not predicted).
- **Aim hint** is a one-line row between the arena and the ultimate button, with a draining ring for the auto-launch instead of a digit. The row keeps its height after launch so the arena does not resize.
- **Top HUD:** names on one line at 12 px; timer is a clock with a "LEFT" label ("AIM", "SUDDEN DEATH" and "FINAL" stay words).
- **Magnet glyph** is now "∩" (a horseshoe, flat like the others), replacing the colour emoji.
- **Desktop layout** (6.4) built as described in the brief: panels appear at 900 px and up in landscape; the in-header Mod chips are hidden there as the left panel lists them. The trigger log comes from the session's `CoreTriggered` and `ModTriggered` events (`hud.log`, last 8, Core triggers use a "◈" icon).
- **6.6 rewritten** to the real first-launch flow (Core, first draft with hint, VS card, aim, match; about 3 s and 3 taps).

## 2026-11-17: Ascension reordered

- **Old order:** rival AI from round 1 at tier 2, and 2 hearts at tier 6. That made a cliff at tier 2 (synergy run win rate 71% → 43%), and tier 8 at about 3%.
- **New ramp, one rule per tier:**
  1. Rivals carry +1 Mod.
  2. No starting reroll.
  3. Bosses on rounds 4, 7 and 10.
  4. Rival AI from round 1.
  5. Rival Mods +1 level.
  6. Sharper rival AI.
  7. Drafts offer one fewer Mod (this replaced "rivals carry another Mod").
  8. 2 hearts.
- **Measured** (30 runs per Core, synergy drafter): tier 4 averages 41% and tier 8 about 8% (0–23% per Core). The tier 8 lab player is a heuristic, so skilled players should do better. Bloom is the weakest Core at every tier and needs a buff.

## 2026-11-17: Stage C (retention features, Phase 6)

- **Starting roster.** Old (Stage A): Ricochet, Splitter and 9 Mods. New: Ricochet, Splitter, Pulse and 14 Mods (Overclock, Growth Spurt, Chain Reaction, Shockwave, Head Start, Clash Engine, Wall Hugger, Scorched Trail, Ramparts, Underdog, Front Runner, Scavenger, Echo, Decoy); only one pickup Mod (Shockwave) is in it. Saves are merged, never trimmed: an existing save keeps everything it had and gains the new starters.
- **One feat per locked item (21).** Feats are functions in `src/content/unlocks.ts` of a per-match summary (counted in the UI layer by `src/ui/matchStats.ts` from sim events and the final world), the run state and lifetime stats. Thresholds were set from 300 random matches so match-level feats hold in roughly 5 to 35% of matches. Table in the Stage C report and in the code. Versus Lab, replays and the debug match never unlock anything.
- **Lifetime stats.** `stats.byCore` holds runs, run wins, best margin, longest beam (Ricochet only), most splits alive (Splitter only), fastest Wipeout and best Endless round; plus global `runsCompleted`, `ultimates`, `pickups`, `wipeouts`. No save version bump: every field falls back on its own.
- **Daily Clash.** Seed is FNV-1a of `turfbreak-daily-YYYY-MM-DD`; the Core is every Core in turn by day number, and the offer pool is every Mod (not the player's unlocks) so everyone sees the same offers. The first run *finished* on a day is the scored one; quitting leaves the attempt open (the run is identical on retry, so nothing is gained but nothing is punished). A day change mid-run counts for the day it started. Daily never raises Ascension and has no Endless. Streak is shown from 2 days and never reset as a punishment (it just restarts). Date maths avoids `Date`, so `src/content` stays clock-free.
- **Versus Lab** opens after the first completed run (won or lost). Both sides use the rival heuristic. Sides are labelled neutrally.
- **Replay codes** are a binary record (varints, float64 launch vectors for bit-exact replay, 16-bit checksum) in base64url, about 80 to 150 characters. Indices use the sorted id lists, so a code only plays on the same major.minor; other versions get a friendly refusal. **Rule: bump the minor version whenever content or sim numbers change in a way that alters matches**, or old codes will replay differently. A test replays a match headlessly and compares the final `hashWorld`.
- **Platform additions:** `copy(text)` (clipboard fallback when there is no share sheet), `canShareFiles` and `share({ file })` (web: share sheet or download). Android cannot share files yet: it needs `@capacitor/filesystem` (not installed), so Save clip is hidden there.
- **Clip export** keeps two staggered MediaRecorders, each restarted when 16 s old, because a WebM cannot be trimmed from the front; Save clip returns the older one (8 to 16 s). Everything is feature-detected and guarded.

## 2026-11-17: Run UI (Phase 3 screens and settings)

- **Home keeps the chosen Core and Ascension, so Play is one tap.** Old (6.5): Home, then Core select. New: Home shows the last-used Core (tap it to change) and an Ascension stepper, and Play starts a run at once. The choice is stored under its own storage key (`turfbreak.ui`), not in the save document, so the save version stays 2. First launch still shows "WHO WINS?" and skips Home.
- **Continue and New run.** With a run in progress, Home offers Continue as the big button and New run (which replaces the saved run) below it. The run is saved after every state change; Continue always restarts the current match from its VS card (the match seed is saved with the rival).
- **Stats and Ascension are written when a match ends.** `bestRound` is the round reached (the next round once a draft opens). Winning a run at tier T sets the Core's best Ascension to T+1 (cap 8) if that is higher; an Endless loss never counts a second win. Quitting a run clears it and counts as neither a win nor a loss.
- **Back button.** Screens register a handler (`src/ui/back.ts`); in a match back opens the pause overlay (Resume / Quit run), elsewhere it goes back to Home, and on Home and the first-launch pick nothing handles it, so the platform exits. Backgrounding the app also opens the pause overlay.
- **Reduce motion** zeroes `fx.intensity` (`src/render/fx.ts`), which juice, the renderer and the session read instead of `tuning.juice.intensity`: no shake, hit-stop, slow-mo, flash or capture pop flash, and CSS animations are off. **High contrast** stripes side 1's cells with a dark diagonal pattern, thickens the frontier and stripes the territory bar.
- **Audio buses.** The synth has separate music (the beat) and effects buses under the existing master, driven by the two volume settings. Mute still sits on the master.
- **The Gauntlet prototype is gone.** The debug quick match remains under Home > Debug.

## 2026-11-17: Stage A balance pass (Mods, Cores, run scaling)

Reports: `docs/balance/stageA2-*.md`.

- **Mods nerfed to the targets** (common L1 at most about 70%, rare L3 at most about 90%): Overclock, Compound, Echo, Buzzer Beater, Head Start, Wall Hugger, Scorched Trail, Ramparts, Landmines, Front Runner, Glass Cannon, Decoy, Bulwark, Quick Hands, Second Wind; Growth Spurt raised.
- **Behaviour changes.** Ramparts and Front Runner shield a limited number of cells per tick (they shielded the whole territory). Echo has a cooldown (Juggernaut triggers every second). Scorched Trail locks only the first 4 captures of a step, so shockwaves and blasts do not become untouchable. Glass Cannon cedes less (46-48% start). Compound and Buzzer Beater use longer intervals and smaller boosts. Encore echoes 5 s apart (1.5 s stacked Stampede and hurt Juggernaut).
- **Splitter's boost accumulates fractional splits** (it spawned at least one per boost, so any boost Mod gave 93-98%).
- **Core nudges.** Bloom start chance 0.44 to 0.56 and per-capture gain 0.004 to 0.006; Fortress shield wave every 155 captures (was 140).
- **Bosses.** The Twins are now Pulse with two main runners on both sides (Splitter with a one-sided extra runner won 90%). The Wall: every cell shielded once for both sides, and you start with 47%. Landlord unchanged at 38%.
- **Rival scaling.** Rivals take no Mods until round 8 and no controller until round 9 (bosses always have one), at most one pick. With a controller from round 3 the lab's random drafter won 17-25%. Ascension tier 2 (controllers from round 1) is therefore a large step.
- **Lab.** `--cores`, `--mods`, `--levels` for `--mod-impact`; the runs report adds win rate by round and by opponent; the synergy drafter now picks the Mods that measure best on its Core (level 2 vs no Mods, 40 seeds), economy Mods last, instead of guessing from groups.

## 2026-11-16: Autonomous build-out (Stages A–D)

Yousuf asked for several hours of autonomous work to bring the game to "complete per the planning docs", with decisions made without him and recorded here, and with cheaper agents used for implementation and playtesting. The working plan and interface contracts are in `STAGE_PLAN.md`.

### Process
- **Fun gate treated as passed for building, not for shipping.** Yousuf never played the Gauntlet build before asking for the build-out. Agent playtests (Playwright runs, screenshots, lab numbers) stand in between stages. They can find bugs, confusion, pacing and balance problems; they cannot confirm fun. His own play test of the result is still required.
- **Phases 3 and 4 merged into Stage A.** Building four Cores and sixteen Mods first and then the rest would mean tuning rivals and runs twice. Stage A ships all 8 Cores and 30 Mods at once.
- **Parallel agents in git worktrees,** each owning disjoint files, coding against the contracts in `STAGE_PLAN.md`. Numbers live in each Core's or Mod's own definition so they do not collide in `tuning.ts`.

### Stage A content (agent results, merged 17 Nov)
- **Ricochet and Splitter were weakened** so the six new Cores could compete. Discrete blasts (Pulse, Phantom) could not keep up with a continuous beam that grew to about 1,000 long.
  - Ricochet: beam +11 per hit (was +40).
  - Splitter: a split every 12 hits (was 8), splits at 0.75 size and 0.5 speed (was 0.7 and 0.7).
- **Fortress's wave fires every 140 captures, not every 10.** At 10 it won 90% or more against most Cores. Its strength now rests on its ultimate, Bastion (+2 shield on every cell and a 3 s lock), with a cell cap of 1.
- **Core matrix** (300 seeds each way, both sides on the rival heuristic): every pairing is between 34% and 66%. Bloom vs Fortress (34/66) is the one pairing outside the 35–65 band. Report: `docs/balance/stageA-core-matrix.md`.
- **Ten Mods were weakened from the plan's numbers** because they won 80% or more at level 1. They include Scorched Trail, Underdog, Front Runner, Clash Engine, Glass Cannon and Comeback; each change is listed in the Mods agent's notes in `docs/balance/stageA-mod-impact.md`. Critical Mass also gives speed, because as written it only fired when its side was already winning.
- **The run (`src/run/run.ts`):**
  - Losing round 10 ends the run as a loss even with hearts left (the brief: beating round 10 wins it).
  - A seventh Mod must replace one in a full build.
  - Wipeout rerolls count only on a win.
  - Endless keeps the current hearts and has a boss every 5 rounds.
  - Starting unlocks are Ricochet, Splitter and the nine original Mods (Stage C revisits this).

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
