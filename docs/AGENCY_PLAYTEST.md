# v0.7 agency comparison and balance gate

Classic remains the default in normal web, portal and Android builds. No gameplay variant has been selected and no final balance tuning has been applied.

## Get a comparison build

On this change's GitHub Actions CI run, download `turfbreak-agency-playtest-web` or `turfbreak-agency-playtest-apk`. These are CI artifacts, not published releases. The APK uses `com.yousufkamran.turfbreak.playtest`, so it coexists with the normal app and has separate preferences.

For local browser use:

```sh
npm ci
npm run build:playtest
npm run preview
```

For a local Android build (requires Android SDK):

```sh
npm run build:playtest:android
npx cap sync android
cd android
./gradlew assembleDebug -PagencyPlaytest -PversionName=0.7.0
```

Open **Agency playtest** on Home or the first-launch screen. Keep the same seed, Core and first draft pick when comparing variants. The comparison uses your unlocked roster and settings; it writes neither normal progress nor Daily results. Each visit starts a fresh temporary run. **Exit playtest** returns to the selector. A reload discards the temporary run. Backgrounding retains a pending choice and opens the usual pause menu.

- **Classic:** aim the launch, then use the ultimate. Pickups and Mods can still restore it.
- **Recharge:** an empty ultimate recharges after 12 seconds of simulation time. Charge pickups and Quick Hands still work. Passive recharge never stacks a charge while one is available.
- **Tactical:** at halftime, the match pauses. Inspect the arena and choose +20% speed for 6 seconds, shield for 3 seconds, or ultimate readiness. The rival chooses too; both effects resolve together. This happens once, without a choice timer.

## Playtest sheet

Play at least three matched seeds on the phone, including the same Core across all three variants. Try an early ultimate and one saved for a late swing. Compare both the first match and several rounds of drafting.

For each variant record scores from 1–5:

| Variant / seed / Core | Fun | Control | Clarity | Pacing | Want another run? |
| --- | --- | --- | --- | --- | --- |
| Classic | | | | | |
| Recharge | | | | | |
| Tactical | | | | | |

Also record a moment that felt satisfying, a moment that felt unfair, whether you understood what changed the outcome, and any phone audio, haptic or frame-rate issues. Choose **classic**, **recharge**, **tactical**, or **none yet**, with one sentence explaining why.

**Gate:** gameplay selection and final balance tuning wait for Yousuf's choice. Automated match results cannot decide enjoyment.

## Balance protocol after selection

Use seeds 1–200 for tuning and reserve 10001–10500 for final validation. Run the same candidate and baseline seeds. Check starting unlocks and the full collection, with no rewarded advantages. The lab's synergy affinity model is trained on seeds 1–40; it must never train on the held-out validation range.

```sh
npm run lab -- --runs --seeds 200 --start 1 --ruleset classic --roster full --report docs/balance/candidate-runs.md
npm run lab -- --runs --seeds 200 --start 1 --ruleset classic --roster starting
npm run lab -- --matrix --seeds 200 --ruleset classic --smoke
npm run lab -- --mod-impact --seeds 200 --levels 1,3 --ruleset classic
npm run lab -- --economy-impact --seeds 200 --ruleset classic
npm run lab -- --input-value --seeds 200 --ruleset classic
npm run lab -- --tension --seeds 200 --ruleset classic
```

Replace `classic` with the selected ruleset; repeat whole-run reports at Ascension 4 and 8. Economy reports force the economy Mod as the first draft pick versus a normal synergy draft, including that opportunity cost. The five-seed economy report in this change only verifies the tool; it is not balance evidence.

Targets remain: Ascension 0 aggregate random 35–50%, synergy 75–85%; per-Core synergy 65–90% with spread at most 15 points; bare-Core pairings 35–65%, mirrors 45–55%; level-1 combat Mod advantage at most 25 points; level-3 combat Mod mirror win rate at most 90%; early-decided matches at most 15% aggregate. Ascension 4 targets 30–50%, tier 8 targets 5–15%, with aggregate difficulty non-increasing within sampling uncertainty.

Tune Core outliers first, then repeat-ultimate combinations, early draft strength, rivals/bosses and finally Ascension/Endless. Preserve 10 rounds and 3 starting hearts. Report unmet targets explicitly. Run Wilson intervals describe independent seeds within a Core; pooled Cores and side-swapped games are not independent samples.

## Verification still requiring external access

Physical-phone simulation/frame timing, audio and haptics; CrazyGames portal SDK behavior; and signed AAB/APK release delivery remain separate checks. Record device model, Android/browser version, build SHA, simulation p50/p99 and rendered frame p50/p99. Desktop timing and headless Chromium do not establish the 2 ms phone simulation target. No signed release or portal publishing is part of this change.
