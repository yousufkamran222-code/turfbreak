# Turfbreak

Build-then-watch territory roguelite. TypeScript + Vite + Canvas 2D, wrapped for Android with Capacitor.

## Read first
- `docs/MASTER_PROMPT.md`: the brief. Every decision in it is provisional.
- `docs/PROGRESS.md`: where the last session stopped and what comes next.
- `docs/DECISIONS.md`: every change to the brief, dated. Log new ones there and update the brief to match.

## Commands
- `npm run dev`: local dev server
- `npm run check`: lint + typecheck + tests (run before every push)
- `npm run build:web` / `build:crazygames` / `build:android`: build one target into `dist/`
- `npm run check:size`: bundle budget check against `dist/`
- `npm run lab -- --a ricochet --b splitter --seeds 500 [--matrix] [--control rival:none] [--variant redirect] [--redirect-value] [--tension] [--smoke] [--report docs/balance/x.md]`: headless balance lab (flags documented at the top of `tools/lab.ts`)
- `npx cap sync android`: copy `dist/` into the Android project (after `build:android`)

## Rules that are easy to break
- `src/sim` is pure: no DOM, timers, `Date`, `Math.random`, trigonometry or `Set` iteration. ESLint enforces most of this.
- A deliberate sim change updates the golden hashes (`npx vitest run -u`) in the same commit, with the reason in the message.
- Only `src/platform` may import `@capacitor/*` or any SDK.
- Tunable numbers live in `src/content/tuning.ts` or content definitions, not in code.
- Gradle does not run in cloud sessions (no Android SDK). CI is the source of truth for Android builds.
- `android/app/debug.keystore` is committed on purpose (stable debug signature). Never commit a release keystore.
- One phase per session. Work on a branch, open a PR, merge to `main` when CI is green.
