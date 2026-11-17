# Progress

## Autonomous build-out, Stages A–D (16–17 Nov 2026)

**Status: feature-complete against the brief's Phases 3–7, pending Yousuf's own play test.** Yousuf asked for several hours of autonomous work. The plan and agent contracts are in `STAGE_PLAN.md`; every design call is in `DECISIONS.md` (sections dated 16 and 17 Nov). Agents (Sonnet and Haiku, a few on Opus early on) built in parallel git worktrees. I merged, verified and tuned.

### What the game has now
- **Content:**
  - **8 Cores,** each with its own signature, ultimate and boost behaviour: Ricochet, Splitter, Pulse, Bloom, Fortress, Phantom, Juggernaut, Leech.
  - **30 Mods,** three levels each: 12 common, 12 uncommon, 7 rare.
  - **4 pickups.**
- **The run:**
  - 10 rounds, 3 hearts, rerolls, skip and replace with a build cap of 6.
  - Bosses on rounds 5 and 10: The Twins, The Wall, The Landlord and The Marathon, each with a match twist.
  - Ascension tiers 1–8, and Endless after a won run.
- **In a match:** drag to aim the launch, then one ultimate per match.
- **Satisfaction layer:** streak callouts and climbing audio, ultimate slow motion, a generated beat, shields and teleports drawn and voiced, and a match-end freeze with confetti.
- **UI:**
  - Home (one tap to Play or Continue), a first-launch flow (about 3 s and 3 taps to a match), Core select and the draft (reroll, skip, replace; a one-time hint).
  - The VS card with named Mods and tap-to-inspect, plus boss twists.
  - The match HUD with a clock and Mod chips that flash, the run summary, and a pause overlay on the back button and on backgrounding.
  - Settings: music and effects volume, haptics, reduce motion, high contrast, auto-play, and version and commit.
  - A desktop layout with build panels and a trigger log.
- **Retention:**
  - Unlocks: start with 3 Cores and 14 Mods; 21 feats unlock the rest.
  - Collection with lifetime stats.
  - Daily Clash (seeded by date, an emoji share grid, a streak that is never punished).
  - Versus Lab, replay codes (`?replay=` links that reproduce a match exactly), and clip export (web).
- **Platforms:**
  - The CrazyGames SDK v3 adapter: loading and gameplay events, data, rewarded and midgame ads, and an adblock check.
  - Revive and rewarded-reroll rules, with no ads in the first run or in Daily.
  - App icon, splash and favicon from SVG.
  - A privacy page served from GitHub Pages only.
- **Store kit:** the listing, a Play Console guide, a CrazyGames guide and an index (`docs/store/`).

### How it was verified
- **`npm run check`: 209 tests.** They include:
  - a content matrix: every Core against every Core, and every Mod at levels 1 and 3, with invariants on every step
  - determinism and golden hashes
  - replay codes reproducing the original match's final state hash
  - run rules, revive and ad reroll, save migration v1→v2, and unlocks
  - a performance test: a maxed-out match averages 0.024 ms per step, with the 99th percentile under 2 ms
- **Lab** (`docs/balance/stageA*.md`, both sides on the rival heuristic):
  - **Core matrix:** every pairing 35–64%.
  - **Mod impact:** no Mod above 90% at level 3.
  - **Run win rate at Ascension 0:** random drafter 47%, synergy drafter 71% (target about 80%; see below).
  - **Ascension:** tier 4 about 41%, tier 8 about 8% (synergy drafter).
- **Agent playtests (Playwright, 390×844 and 1280×720, no console errors):**
  - first launch, draft, VS card, aim, match, result, summary, Endless
  - resume after a reload, pause, settings persisting, a corrupt save
  - Collection, Daily, Versus Lab, replay links
  - Round 1's findings (unnamed Mods on the VS card, unclear reroll and skip, a debug seed showing, a weak ultimate-ready state, the aim hint overlapping the arena) were fixed. A latent bug where hit-stop dropped sim time at 2x/4x was also fixed.

### Known gaps
- **Fun is unconfirmed.** Agents can find bugs and confusion, not fun. Yousuf's last verdict (on the redirect build) was "not fun". This build has not been played by him.
- **Synergy runs win 71%, not about 80%.** At Ascension 0 the lab player only matches an un-Modded rival in rounds 1–3, so smarter drafting cannot lift early rounds much. The fix would be stronger early draft impact or 4 hearts; it was left for Yousuf's feel.
- **Core spread in runs** (synergy, Ascension 0): Splitter 91% at the top, Bloom 57% at the bottom (after its buff).
- **A few Mods above 70% at level 1 on one Core:** Quick Hands on Phantom, Encore on Leech, Second Wind on Pulse.
- **Android:** clip export is hidden (needs `@capacitor/filesystem`). Frame rate and haptics are untested on a real phone with the new effects.
- **Replay codes** only play on the same major.minor version, so bump the minor whenever sim or content numbers change.
- **Release:** `release.yml` is still untested until the signing secrets exist. The CrazyGames adapter is untested inside the portal (needs the developer account and QA tool).

### Next (for Yousuf)
1. Play a few runs on the phone (web or APK) and say what feels good, flat or unfair.
2. Pick the title, then follow `docs/store/README.md`. Recruit 12 testers early (14-day closed test).
3. Add the signing secrets and ask for a `v0.x.0` tag to test `release.yml`.

## Phase 2: agency (fun gate, 2026-11-15)

**Status: third play test, on the Gauntlet.** Two rounds of play testing rejected the tap-to-redirect ("doesn't feel satisfying or fun at all"). Yousuf chose a mostly-watched match with a launch aim and one ultimate, pickups that stay and also become Mods, and a satisfaction pass plus a mini draft. Phase 3 must not start until he says matches are satisfying and drafting is fun.

### Done (this round)
- **Inputs.** The redirect and all its code are removed. Now: drag to aim the launch, with a dotted preview through two bounces and an auto-launch after 4 s. Then one ultimate per match from a big button.
- **Ultimates.** Ricochet Spin (one full beam circle, reach up to 300). Splitter Burst (one split per 3 owned, at least one). Charge pickups restore the ultimate.
- **Rival AI.** Aims its launch by scoring headings. Fires its ultimate on a per-Core value (enemy cells in the Spin disc; splits owned), or 6 s before the buzzer. Auto-play uses the same code.
- **Ricochet's beam** swings back to trailing after every hit, as Core behaviour, and snags pickups.
- **Pickups:** any runner grabs them.
- **Mods, first version (9):** Overclock, Growth Spurt, Chain Reaction, Afterburner, Shockwave, Bulwark, Magnet, Encore, Head Start. Three levels each, slot-ordered hooks, interval hooks, and Mod chips in the HUD that flash when a Mod fires.
- **Gauntlet:** a five-round mini draft from the menu. Pick a Core, draft 1 of 3 (or skip) before each match, then a run summary. Rivals get a random Core and the same number of random picks. A debug quick match stays below it.
- **Satisfaction pass:**
  - Ultimate: slow motion, flash, banner, shockwave and whoosh.
  - Capture streaks: climbing ticks and ×10/×25/×50/×100 callouts with chords and shake.
  - Music: a generated beat that intensifies in the final 10 s.
  - Match end: a freeze, confetti and a result drop-in.
  - Also: pickup and blast rings and a launch sound.
- **Bug fixes the lab found:**
  - Speed could run away to about 10¹⁷ (speed → hits → overflow → speed). Speed is now capped at 1,800 and overflow is additive.
  - Fast runners skipped cells. Captures now sample along the whole step.
  - Match-start events (Head Start) were dropped before the HUD saw them.

### How it was verified
- **Tests:** `npm run check` passes all 73. New tests cover:
  - launch and ultimate inputs, replays from the log, and rival launch plus ultimate before the deadline
  - Spin, Burst, once-per-match ultimates, beam snap and swing
  - any-runner pickups, Charge restoring the ultimate
  - a content matrix (every Mod × level × Core runs a full match with invariants on every step, and its trigger fires)
  - Mod hook order, Encore, interval Mods, the draft (distinct offers, level-ups, full build only offers upgrades, rival builds)
  - the speed cap, and match-start events
- **Headless Chromium at 390×844.** I played the Gauntlet from the menu through Core pick, draft, aiming (preview drawn), launch, ultimate (banner, callouts), match end, result and the next round's draft. No console errors. Screenshots reviewed.
- **Lab** (`docs/balance/phase2b-*.md`, both sides on the rival heuristic):

  | Pairing | Result | Target |
  | --- | --- | --- |
  | Ricochet vs Splitter (1,000 seeds) | Ricochet wins 46.5% | 40–60% |
  | Ricochet mirror | Side 0 wins 50.3% | 48–52% |
  | Splitter mirror | Side 0 wins 50.9% | 48–52% |

- **Mod impact** (Mod on one side of a mirror, 150 seeds):
  - Every common Mod at level 1 is within +17 points (target under +25).
  - **Overclock** is the standout "broken" pick: Splitter L1 87%, L3 96%; Ricochet 68–81%. It is uncommon now, so it will show up less often.
  - Strong for Splitter: Encore (rare) 69–81%, Afterburner 60–75%, Magnet 64–75%.

### Known issues (for the play test and Phase 4)
- **Too many matches decided early.** Ricochet vs Splitter is decided before half time (passed 70% and won) in 30% of matches, against a target of 15%. Ricochet mirrors are at 17.5%. Ricochet's beam sweeps build early leads that hold. Splitter mirrors are fine at 2.3%.
- **Launch aim and ultimate timing barely change outcomes in the lab:** −3 to +3 points for Ricochet. That's consistent with the new design (choices live in the draft), but it means the match itself is a spectacle, not a skill test. Yousuf's play decides whether that is right.
- **Splitter's ultimate timing:** the rival's Burst timing is worse than random (firing at 3 splits). Firing at 1 split made the rival stronger but tipped Ricochet to 35%, so the later timing stays.
- **Not built yet:** reroll, hearts, bosses, saves, Ascension. These are Phase 3.
- **Not verified:** frame rate on a real phone with the new effects, and the beat on Android audio.

### Next
Fun gate, third round: Yousuf plays the Gauntlet several times. Are matches satisfying to watch, is drafting fun, which Mods feel great and which are dead? Then Phase 3, the full run, built on the Gauntlet.

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

