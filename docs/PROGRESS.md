# Progress

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
- Android: not built locally (no Android SDK in the cloud session). CI status is recorded below.

### Known issues and stubs
- `npm audit` reports 7 moderate advisories, all inside the typescript-eslint dev toolchain. Nothing ships to players.
- Ads, `happyMoment` and the gameplay events are no-ops on every target until Phase 7/8. `crazygames` uses the web adapter.
- App icon and splash are Capacitor defaults until Phase 5.
- `release.yml` is untested until the signing secrets exist (Phase 7).

### Next
Phase 1: the simulation (arena, runners, capture, Ricochet and Splitter, renderer, determinism tests, first lab command).
