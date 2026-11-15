# Progress

## Phase 2: agency (fun gate, 2026-11-15)

**Status: second play test.** After the first test Yousuf chose Redirect (5 s) and asked for less randomness and in-match upgrades. Both are built. The gate stays open until he has played this build; Phase 3 must not start before then.

### Done
- **Feedback fixes (round 1).** Rematch remounts the match. The setup screen starts on a random seed. Phase 1 always opened on seed 1 (a Ricochet win), which with the broken Rematch explains "Ricochet always wins". The lab shows 50.4% from side A and 49.2% from side B.
- **Input in the sim.** Timestamped redirect records, an applied-input log, replays from seed, Cores and log (tested to the same hash), charges and cooldown, an `onRedirect` hook, and per-match redirect rules for future Mods.
- **Input choice.** Redirect (5 s) is the input. Redirect+ and Hold to boost were tried and removed (see DECISIONS). No input stays on the debug switch for watching. Assist plays your redirect with a mediocre heuristic.
- **Feedback changes (round 2):**
  - **Ricochet's beam** sweeps only after a redirect; bounces snap it.
  - **Four pickups:** Surge, Blast, Charge and Shield. They spawn from the seed and only main runners grab them. They show as pulsing orbs with glyphs, a spawn ring, a collect burst, a Blast shockwave, effect chips under each name, and a sound.
- **Rival controller.** Bouncing 1,100-unit ray, sweep scoring for beams, pickup racing, reaction delay, aim error, a separate PRNG stream per side.
- **Tension.** Underdog boost (6% max); overtime surge measured and removed; lead changes with 3-cell hysteresis.
- **Juice and audio.**
  - Visual: staggered capture pops, pooled sparks, shake, hit-stop, rings for taps, spawns and blasts, a pulsing cooldown ring, a gauge bar, the "Tap to redirect" prompt at 5 s, and a territory-bar thump on lead changes.
  - Audio: synthesised hit runs, ticks, clash, trigger, redirect and pickup sounds, a final-10 s tick, stingers, and a mute toggle.
  - Speed: 1x/2x.
- **Lab.** `--control`, `--variant`, `--redirect-value`, `--tension`, and pickup stats (mean pickups; whether the side with more pickups wins). CI's smoke test runs both rivals redirecting.

### How it was verified
- **Tests:** `npm run check` passes all 61. New tests cover:
  - redirect, cooldown, replays from the log, rival cooldown, underdog cap, lead hysteresis
  - the beam snaps on a bounce and swings only after a redirect
  - pickups spawn on schedule, cap at 2, are identical per seed and can be switched off
  - each pickup's effect (Surge speed, Blast radius, Charge refill, Shield blocking captures)
- **Headless Chromium at 390×844:**
  - the prompt appears, a tap redirects, and the gauge recharges
  - pickups show on the map; a rival grab shows its SURGE chip
  - 2x works, and Rematch restarts
  - no console errors
- **Lab** (`docs/balance/phase2-core-matrix.md`, 1,000 seeds, both sides on the rival heuristic):

  | Pairing | Result | Target |
  | --- | --- | --- |
  | Ricochet vs Splitter | Ricochet wins 49.9% | 40–60% |
  | Ricochet mirror | Side 0 wins 49.5% | 48–52% |
  | Splitter mirror | Side 0 wins 47.8% | 48–52% |

  Ricochet vs Splitter, other metrics: decided early 6.1%, lead changes 8.0.
- **Redirect value** (`docs/balance/phase2-redirect.md`, 300 seeds, against a side with no input):

  | Pairing | Heuristic vs none | Aim value (heuristic vs random) | Target |
  | --- | --- | --- | --- |
  | Ricochet vs Ricochet | +49.8 pts | +11 pts | +10 to +20 |
  | Ricochet vs Splitter | +47.3 pts | +34 pts | +10 to +20 |
  | Splitter vs Splitter | +3.5 pts | +16 pts | +10 to +20 |

### What the numbers say
- **Ricochet** is now an input Core. Taps decide its sweeps, and where you aim matters a lot. Its redirect value is well above the brief's +10–20 target; that is a deliberate trade for agency. It also means a Ricochet that never redirects (rival rounds 1–3, No input) almost always loses.
- **Splitter** still gains little from redirecting (+3.5). Its pickups help (in mirrors the pickup leader wins 62%), but most of its power is in splits, which you can't steer. If Yousuf finds Splitter passive, cheap options are letting splits grab pickups, or a Mod or base rule where a redirect also turns splits.

### Known issues and stubs
- Underdog boost and controllers are tuned against the lab heuristic only.
- Juice intensity is a single tuning value; reduce-motion is Phase 5.
- The phone layout still has empty space above the arena (Phase 3 adds Mod slots).
- Events still allocate one object each.

### Next
Fun gate, second round. Yousuf plays this build: is Ricochet less random, do taps matter, are pickups fun, does Splitter feel passive? Then Phase 3: the run.

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

