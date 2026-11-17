# Turfbreak store listing kit

Copy for Google Play and CrazyGames, plus the content-rating answers. Use this with `play-console-guide.md` and `crazygames-guide.md`.

**Read first: the copy describes the build as it is now (v0.3.0).** That build has two Cores, nine Mods and the five-round Gauntlet. The full 10-match run in brief section 3.3 is Phase 3 and is not built. Phase 2's fun gate is also still open, so Yousuf should decide when the listing goes live. When Phase 3 ships, rewrite the descriptions to match.

Character limits used here: Google Play title 30 characters, short description 80, full description 4,000. The CrazyGames description limit was not found on the official page, so the CrazyGames text is kept short on purpose.

## 1. Title options

Pick one. Each is 30 characters or fewer, which fits Google Play.

| # | Title | Characters | Notes |
| --- | --- | --- | --- |
| 1 | Turfbreak | 9 | The working title. Shortest, and the name the game already uses. |
| 2 | Turfbreak: Territory Roguelite | 30 | Says what the game is. Uses the full limit. |
| 3 | Turfbreak: Build the Battle | 27 | Leans on the build-then-watch idea. |
| 4 | Turfbreak: Who Wins? | 20 | Uses design pillar 1, the "who wins?" tension. |
| 5 | Claim & Clash Roguelite | 23 | Fallback if "Turfbreak" conflicts with another game. |

**"Turfbreak" is a working title and must be checked before it goes on a store page.** This was not checked in this session. Before choosing, search:

- Google Play, the App Store and the CrazyGames catalogue for games with the same or a similar name.
- The public trademark databases for your country (for example the USPTO and EUIPO search tools) for "Turfbreak" in the games or software classes.

Changing the title later is possible, but it is easier to decide now, before the first closed test.

## 2. Short descriptions (80 characters or fewer)

These go in the Google Play "Short description" field. Each is under 80 characters.

1. Build a side, draft Mods, then watch two agents race to claim the map. (70)
2. Pick a Core, draft Mods, and watch short territory battles decide who wins. (75)
3. Aim one launch, fire one ultimate, and watch who takes the most territory. (74)

Option 1 is the most direct. Option 3 is the most accurate about the one-touch play, because aiming and the ultimate are the only actions in a match.

## 3. Google Play full description (4,000 characters or fewer)

Paste the text between the two lines into the "Full description" field.

```text
Turfbreak is a short territory game. Two coloured runners bounce around a map of cells and claim every cell they touch. A match lasts about 40 seconds and plays itself. Your choices decide which side you build.

HOW A MATCH WORKS
- Before a match, drag to aim your launch. Your runner bounces off the walls and claims territory as it goes. If you wait, it launches on its own after 4 seconds.
- Once per match, press the ultimate button to fire your Core's signature ability. Choosing the moment is up to you.
- Pickups appear on the map for 10 seconds. Whoever grabs one gets a temporary boost.
- The territory bar shows who leads. Mod chips flash when one of your upgrades fires.

CHOOSE A CORE
This version has two Cores:
- Ricochet: a beam trails behind the runner. Its ultimate, Spin, sweeps the beam around the whole map.
- Splitter: the runner splits into a swarm as it captures. Its ultimate, Burst, splits it again.

DRAFT MODS
Before each match you can pick one of three Mods, or skip. Mods stack with your Core. Each has three levels. The nine Mods are Overclock, Growth Spurt, Chain Reaction, Afterburner, Shockwave, Bulwark, Magnet, Encore and Head Start.

GAUNTLET
A five-round run from the menu. Pick a Core, draft before each match, and face rivals with their own builds. A summary at the end shows how the run went.

ABOUT THIS VERSION
- No accounts, no sign-in and no tutorial screens. You learn by playing.
- No ads and no purchases.
- Your save stays on your device. Turfbreak collects no personal data.
- Abstract shapes and colours only. No people, no blood, no gambling. The draft is a free choice. Nothing is bought or wagered.
- This is an early version. More content is in development.
```

The text above is 1,711 characters, under the 4,000 limit. Google Play counts characters the same way, but re-check with any character counter after you edit it.

## 4. CrazyGames description and controls

The CrazyGames developer portal asks for a description and controls (official requirements page, see `crazygames-guide.md`). The length limit was not found, so keep to these lengths.

**Description (about 300 characters):**

```text
Turfbreak is a short territory game. Two coloured runners bounce around a map and claim every cell they touch. Aim the launch, fire your Core's ultimate once per match, and draft Mods between matches. Each match lasts about 40 seconds. Play the five-round Gauntlet from the menu.
```

**Controls:**

```text
Mouse: click and drag to aim the launch before a match. Click the ultimate button once per match. In the draft, click a Mod to take it, or click Skip.
Touch: drag to aim, tap the ultimate button, and tap a Mod to take it.
Keyboard: Escape goes back.
```

Confirm the mouse and touch lines on a desktop browser and a phone before you submit. The keyboard line reflects the code in `src/platform/web.ts`, which handles only Escape.

## 5. Tags (10)

roguelite, roguelike, territory, strategy, arcade, simulation, auto battler, casual, short games, build

Google Play may limit how many tags it shows or accepts. Use the first five if it does.

## 6. Category suggestions

- **Google Play:** Strategy. Arcade is the alternative. Google Play accepts one category per app.
- **CrazyGames:** Strategy or Arcade. The category list was not checked against the portal, so choose from its dropdown.

## 7. Content rating questionnaire (IARC)

Google Play asks you to complete the IARC questionnaire in the Play Console. The answers below are the honest ones for this build. Answer the same way in the questionnaire and do not round them down.

| Question area | Answer | Why |
| --- | --- | --- |
| Category | Game | It is a game. |
| Violence | Yes, cartoon or abstract only | Coloured shapes collide and burst, and there are explosions and shockwaves. No people, animals, blood or injury. Answer Yes to the cartoon or fantasy violence question and No to realistic or graphic violence. |
| Sexual content or nudity | No | None. |
| Profanity or crude humour | No | None. |
| Controlled substances | No | None. |
| Gambling, real or simulated | No | Nothing is bought or wagered. The draft is a free choice of Mods. |
| User-generated content, chat or sharing | No | No chat, no uploads, no user content. |
| Location sharing | No | None. |
| Personal data collected or shared | No | See the data safety answers in `play-console-guide.md`. |
| In-app purchases | No | None in this version. |
| Ads | No (Android) | The Android build has no ads. The portal builds are rated separately by CrazyGames. |

The result is a rating from the IARC system. The brief's target is PEGI 12 or lower. Check that the result is at or below 12. If it is higher, do not change an honest answer to get a lower rating. Ask in the Play Console help which answer caused it.

The exact questions and wording are set by Google and the IARC system and may differ from this table. The table lists what each answer should be.

## 8. Target audience and other Play declarations

- **Target age group:** 13 and over. This is a recommendation based on the PEGI 12 target. It also keeps the app out of the "Designed for Families" programme. The Families rules were not checked in this session.
- **Ads:** No.
- **App access:** All functionality is available without special access.
- **News app, government app, financial features, health:** No to each.

## 9. Graphics still to make

Google Play needs graphics that are not in this repo yet. The brief lists them under Phase 7. Each has to be made before the store page can be submitted.

- App icon, 512 by 512 PNG.
- Feature graphic, 1024 by 500.
- Phone screenshots, at least two. Use the 390 by 844 layout from the UI smoke test.
- Optional: a short gameplay video, for example the 20-second capture in the brief.
- CrazyGames covers: images and videos, as the portal's requirements page lists them. Sizes were not checked.

The size requirements for Google Play graphics were not verified in this session. Check them in the Play Console before exporting.

## 10. Character counts

Measured when this kit was written. Re-check after any edit with a character counter.

| Text | Limit | Count |
| --- | --- | --- |
| Google Play full description | 4,000 | 1,711 |
| Short description options | 80 | 70, 75, 74 |
| Title options | 30 | 9 to 30 (see section 1) |
| CrazyGames description | not found | 279 |
