# Decisions log

Every change to a decision in `MASTER_PROMPT.md`, newest first. Format: date, old decision, new decision, reason.

## 2026-11-15: Phase 0

- **Application ID.** Set to `com.yousufkamran.turfbreak`, confirmed by Yousuf. It cannot change after publishing.
- **TypeScript 6.0, not the latest 7.0.** Old: "prefer the latest stable versions". New: pin `typescript ~6.0.3`. Reason: TypeScript 7.0.2 is out, but `typescript-eslint` 8.72 supports only TypeScript below 6.1. Revisit when typescript-eslint supports 7.
- **Platform interface gains lifecycle hooks.** Old: the 7.1 sketch had no pause, resume or back events. New: `onPause`, `onResume` and `onBack(cb => handled)` on `Platform`. Reason: rule 4.3.8 keeps Capacitor inside `src/platform`, so the game needs a platform-neutral way to hear the back button and app backgrounding (6.4).
- **Added runtime dependency `@capacitor/share`.** The 7.1 table names the Share plugin for Android; it was missing from the 4.1 dependency list.
- **`crazygames` target uses the web adapter until Phase 7.** It builds and zips today; the SDK adapter is Phase 7 work.
- **Preact, `@preact/signals` and `d3-delaunay` are not installed yet.** Phase 0 has no menus and no Voronoi. They arrive with the phases that use them, so nothing unused sits in the lockfile.
- **Release `versionCode` is the release workflow's run number plus 100000.** Old: "versionCode comes from the workflow run number". Reason: release and debug builds come from different workflows with separate run counters. The offset keeps release codes above every debug code and still increasing for Play.
- **Main branch flow.** `main` was created with an initial commit; each phase is built on a branch and merged by pull request once CI is green (Yousuf's choice).
