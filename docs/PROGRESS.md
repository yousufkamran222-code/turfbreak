# Progress

## Phase 2: agency (fun gate, 2026-11-15)

**Status: waiting for Yousuf's input choice.** Phase 3 must not start until he has played at least 20 matches across the variants and chosen one, or rejected them all.

### Done
- **Feedback fixes.** Rematch now remounts the match: every match gets a fresh key, where Phase 1 keyed by Cores and seed, so a same-seed rematch did nothing. The setup screen starts on a random seed, and "New seed" picks a random one. Phase 1 always opened on seed 1, which Ricochet wins; that, plus the broken Rematch, explains "Ricochet always wins". The lab shows 50.4% from side A and 49.2% from side B over 1,000 seeds.
- **Input in the sim.** Timestamped input records, an applied-input log, replays from seed, Cores and log (tested to the same hash), redirect charges and cooldown, an `onRedirect` hook, and a redirect-as-hit option.
- **Four input variants** behind the debug switch on the setup screen: Redirect (5 s), Redirect+ (3 s, counts as a hit), Hold to boost, No input. The rival uses the same input when "Rival uses the input too" is on. "Assist" lets the game play your input with a deliberately mediocre heuristic.
- **Controllers.** A rival heuristic (bouncing 1,100-unit ray, 16 headings, reaction delay, aim error, separate PRNG stream per side), a random-aim baseline and a boost controller.
- **Tension tools.** Underdog boost (6% max); overtime surge built, measured and removed; lead changes with 3-cell hysteresis.
- **Juice.** Staggered capture pops, pooled sparks, trauma shake, hit-stop on primary clashes, a tap marker, and a pulsing cooldown ring around your runner. A cooldown or meter bar sits under the arena. "Tap to redirect" / "Hold to boost" appears at 5 s until first use, and the territory bar thumps on lead changes.
- **Audio** (WebAudio, no files): per-side pentatonic hit notes that climb, capture ticks, clash, trigger and redirect sounds, a final-10 s tick, a win/lose stinger, a mute toggle, and suspend on pause.
- **1x/2x speed toggle.**
- **Lab:** `--control`, `--variant`, `--redirect-value` (none, random-aim and heuristic on the same seeds) and `--tension` (underdog on and off). CI's 200-match smoke test now runs with both rivals redirecting.

### How it was verified
- `npm run check`: 53 tests pass. New tests cover:
  - redirect turn, charge and cooldown; ignored in other modes; counts as a hit when set
  - boost meter drain and refill
  - underdog boost capped and applied only to the trailing side
  - replays from the input log, both controller-recorded and queued live
  - the rival respects its cooldown
  - lead hysteresis
- **Headless Chromium at 390×844:**
  - the prompt appears at 5 s
  - a tap redirects and the gauge switches to RECHARGING
  - 2x works
  - the match ends, and Rematch restarts at 40 s
  - no console errors
  - screenshots reviewed: setup, prompt, after the tap, mid-match, result
- **Lab reports** in `docs/balance/phase2-*.md`, 300 seeds each (core matrix 1,000):

  | Variant | Value vs no input (R mirror / R vs S / S mirror) | Aim value (heuristic vs random) | R vs S when both use it | Decided early |
  | --- | --- | --- | --- | --- |
  | Redirect (5 s) | +2.7 / +6.5 / +0.2 | about 0 | 48.8% | 15.8% |
  | Redirect+ (3 s, hit) | +14.0 / +15.2 / +37.5 | +1 to +3 | 28.5% | 52% |
  | Hold to boost | +9.3 / +12.2 / +45.7 | n/a | – | – |

  Target value: +10 to +20.

  Core matrix, both sides redirecting with the rival heuristic (1,000 seeds):

  | Pairing | Result | Target |
  | --- | --- | --- |
  | Ricochet vs Splitter | Ricochet wins 50.3% | 40–60% |
  | Ricochet mirror | Side 0 wins 47.3% | 48–52% |
  | Splitter mirror | Side 0 wins 50.2% | 48–52% |

  Ricochet vs Splitter, other metrics: decided early 15.0% (target under 15%), lead changes 7.6.

### What the numbers say (for the fun gate)
- **The brief's redirect has too little effect in the lab:** 0 to 7 points against a target of 10 to 20. Where you aim makes almost no difference to the heuristic: random aim scores about the same. Territory is driven mostly by the Cores (beam sweeps, splits), and one runner's path is a small share of it.
- **Redirect+ and Boost have big value,** but almost none of it comes from aiming; it comes from pressing at all. Both also favour Splitter heavily (hit counting and speed multiply across its splits). Redirect+ pushes early-decided matches to 52%.
- **A human may aim better than the heuristic.** For example, a player can intercept the rival to bank a clash, or line up a sharp turn so Ricochet's beam sweeps. That is exactly what the play test decides. If none of the variants feels played, the next step is a new input design, not more tuning (see the options in the session report).

### Known issues and stubs
- Underdog boost and controllers are tuned against the lab heuristic only; real-player numbers come from Yousuf's play.
- Juice has a single intensity value in `tuning.juice`; the reduce-motion setting is Phase 5.
- The phone layout still has empty space above the arena (Phase 3 adds Mod slots).
- Events still allocate one object each (see Phase 1).

### Next
Fun gate. Yousuf plays at least 20 matches across the four variants and picks one, or none. Then Phase 3: the run.

## Phase 1: the simulation (2026-11-15)

### Done
- **Arena:** jittered grid of 182 cells with two Lloyd passes, Voronoi from d3-delaunay, centroids, sorted neighbours, shared edges, edge flags, a half-and-half seeded split.
- **Rules:** runners with wall bounce plus seeded jitter, enemy clashes, capture under the centre and by capture radius, a 40 s timer, buzzer, sudden death (with a 10 s fallback) and Wipeout. Lead changes are tracked.
- **Ability API, first version:** hooks `onMatchStart`, `onStep`, `onHit` and `onCapture`; a per-side context with additive and multiplicative stats, stacks, counters, `spawnRunner` (overflow converts to speed at 32 per side) and `triggered`. Ricochet and Splitter are pure data in `src/content/cores.ts`.
- **Typed event queue** (`CellCaptured`, `WallBounce`, `Clash`, `CoreTriggered`, `RunnerSpawned`, `RunnerOverflow`, `LeadChange`, `SuddenDeath`, `MatchEnded`), switched off in headless runs.
- **State hash** (FNV-1a over ownership, runners, stats, stacks and the PRNG state).
- **Renderer:** territory, faint cell edges, a bright frontier line, a glowing beam, runner shapes per Core, interpolation between sim steps.
- **UI (Preact plus signals):** a debug setup screen (two Cores and a seed), and the match screen with the VS header, live stack counters that flash on each trigger, timer, territory bar with half marker, READY countdown, result banner, Rematch / Next seed / Back. The Android back button returns from a match to setup.
- **Lab:** `npm run lab` runs any pairing or the full matrix over N seeds, playing each from both sides, and writes Markdown reports. CI now runs a 200-match smoke test with invariants checked on every step.

### How it was verified
- `npm run check`: 44 tests pass.
  - Arena: areas sum to the square, neighbours symmetric, one shared edge per pair, point lookup matches point-in-polygon on 500 points.
  - Rules: reflection, clash, same-side pass-through, capture, capture radius, wipeout, sudden death, time win.
  - Cores: beam growth, beam capture, beam swing, split cadence, overflow at the cap.
  - Determinism: identical hashes at every 2 s for repeated runs, different seeds differ, event recording does not change the result, golden final hashes for seeds 1–3.
  - Invariants on every step of 60 matches across all four pairings.
- **Balance** (`docs/balance/phase1-core-matrix.md`, 1,000 seeds):

  | Pairing | Result | Target |
  | --- | --- | --- |
  | Ricochet vs Splitter | Ricochet wins 49.8% | 40–60% |
  | Ricochet mirror | Side 0 wins 48.3% | 48–52% |
  | Splitter mirror | Side 0 wins 51.0% | 48–52% |

  Ricochet vs Splitter, other metrics: decided before half time 13.1% (target under 15%), median final lead change at 38.5 s.
- **Speed:** sim about 5 ms per 40 s match in Node, around 2 µs per step, far inside the 2 ms per step budget. Not yet measured on a phone.
- **Browser:** headless Chromium at 390×844 and 1280×720. Played seed 1 to the end: no console errors, about 60 fps in headless (not representative of a phone). The browser result (98–84) matched the golden hash computed in Node. I reviewed screenshots of setup, mid-match, late match and result.
- **Bundle:** 69 KB total, 25 KB JS gzipped.

### Known issues and stubs
- **Lead-change count is noisy.** It counts every strict-leader flip, so near-ties inflate it (10–17 per match). Add hysteresis in Phase 2 before tuning the tension tools on it.
- **Events allocate one object each.** That's fine at Phase 1 counts, but worth pooling if the phone profile in Phase 5 shows GC pauses.
- **Not yet built:** player input, underdog boost and overtime surge (Phase 2), and juice and audio (Phase 2 and 5).
- **Not yet verified on a real phone:** 60 fps and the APK.
- **The phone layout has empty space** above and below the arena. Phase 3's Mod slots and redirect bar fill it.

### Next
Phase 2: agency (fun gate). Redirect input with cooldown, rival redirect heuristic, underdog boost and overtime surge tuned on the tension metrics, first juice pass, the 2x toggle, alternative inputs behind a debug switch, and the redirect-value lab report.

## Phase 0: foundations and pipeline (2026-11-15)

### Done
- Brief saved as `docs/MASTER_PROMPT.md`; `CLAUDE.md`, `DECISIONS.md`, `DESIGN.md` written.
- Vite + strict TypeScript app: a fixed 60 Hz stepper with interpolated rendering draws a bouncing dot on a full-screen canvas. Tapping redirects the dot and fires a light haptic. The top line shows version, commit, platform and a launch counter.
- Seeded PRNG (sfc32 with splitmix32 seeding, separate streams) in `src/sim/rng.ts`, plus `tuning.ts`.
- Versioned save with an ordered migration table and a corrupt-save fallback (`src/meta/save.ts`). Phase 0 stores only the launch counter.
- Platform adapter (`src/platform`): `web` (localStorage, vibrate, visibility pause, Escape as back) and `android` (Preferences, Haptics, Share, App pause/resume/back; back exits when nothing handles it). Chosen at build time by `VITE_PLATFORM`; the web bundle contains no Capacitor code.
- ESLint (strict typescript-eslint) with sim-purity rules and a rule that only `src/platform` imports Capacitor. Vitest with 21 tests.
- Capacitor 8.6 Android project for `com.yousufkamran.turfbreak` (SDK 36, minSdk 24), portrait lock, committed debug keystore, release signing from environment variables.
- Workflows: `ci.yml`, `web.yml` (Pages and portal zip), `android.yml` (debug APK), `release.yml` (signed AAB and APK on `v*` tags). Builds go to a rolling `latest` pre-release.

### How it was verified
- `npm run check` passes locally: lint, typecheck, 21 tests (PRNG golden sequence and stream separation, dot stays in bounds and is deterministic, stepper maths, save fallback on 9 corrupt inputs, back-handler order).
- Built the web target and loaded it in headless Chromium at 390x844 and 1280x720: renders, no console errors, tap works, launch counter goes 1 → 2 across a reload.
- Size: 8.6 KB total, 3.6 KB JS gzipped.
- Android: not built locally (no Android SDK in the cloud session). CI is the check.
- CI on `main` at fd167e0: `ci.yml`, `web.yml` and `android.yml` all green. The Pages site returns the built page (HTTP 200). The `latest` pre-release holds `turfbreak-debug-fd167e0.apk` (4.1 MB) and `turfbreak-crazygames-fd167e0.zip` (4.8 KB).
- Not yet verified: installing the APK on a phone, and a second APK installing over the first. These need Yousuf's phone.

### Links
- Web: https://yousufkamran222-code.github.io/turfbreak/
- APK and portal zip: https://github.com/yousufkamran222-code/turfbreak/releases/tag/latest

### Known issues and stubs
- `npm audit` reports 7 moderate advisories, all inside the typescript-eslint dev toolchain. Nothing ships to players.
- Ads, `happyMoment` and the gameplay events are no-ops on every target until Phase 7/8. `crazygames` uses the web adapter.
- App icon and splash are Capacitor defaults until Phase 5.
- `release.yml` is untested until the signing secrets exist (Phase 7).

