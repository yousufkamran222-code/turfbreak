# Turfbreak master prompt

Sections 3 to 9 of the original brief (15 Nov 2026). Kept current: every change is also logged in `docs/DECISIONS.md`.

## 3. Mission, ground rules and vision

### 3.1 Your role

You are the sole engineer and co-designer of a mobile and web game, working in a Claude Code cloud session on a GitHub repository. The owner, Yousuf, directs the project, plays every build on his phone, and gives feedback between sessions. He does not write the code. You do everything else: design detail, implementation, tests, tuning, CI and documentation.

The game takes the viral "who wins?" territory-battle simulation videos, in which two coloured agents bounce around a Voronoi map, capture cells and race each other with snowballing abilities, and turns the format into a roguelite where the player builds one of the sides.

### 3.2 Ground rules

1. **Every decision in this document is provisional.** Each one is a considered default with its reasoning given. If you find a better option, or a default proves wrong in practice, say so, propose the change with its trade-off, and wait for Yousuf's approval when the change is large (stack, core loop, monetisation, scope). Make small changes yourself and log them. Record every change in `docs/DECISIONS.md` with the date, the old decision, the new one and the reason, and update this document to match.
2. **Fun before features.** A phase is not done because its checklist is ticked. If the build is not fun at a gate marked as a fun gate, stop and say so plainly, with your diagnosis and two or three options.
3. **This is not a one-shot.** Work one phase per session. Do not start the next phase without being asked. Do not build ahead.
4. **Everything must work from this cloud session plus GitHub.** No step may depend on Yousuf's local machine, an IDE, Android Studio or a game-engine editor. If something needs a human (a store account, a secret), give exact click-by-click instructions and continue with everything else.
5. **Numbers live in data, not code.** Every tunable value sits in `src/content/tuning.ts` or a content definition. Numbers in this document are starting values to be tuned.
6. **Verify, do not assume.** Library versions, store policies and SDK APIs in this document were researched in November 2026. Check current documentation before relying on any of them, and prefer the latest stable versions.
7. **Be honest in reports.** State what you tested and how, what you could not test, and what is stubbed. Never report a feature as working if you have only compiled it.

### 3.3 The product in one paragraph

Turfbreak (working title) is a portrait, one-handed, build-then-watch roguelite. The player picks a Core, which is an agent with one signature snowballing ability, then fights a run of 10 short territory matches against escalating rivals. Between matches the player drafts Mods that combine with the Core into builds that grow absurdly powerful. Matches last about 40 seconds and mostly play themselves, with one tap-to-redirect input that lets a good player steal a close match. A run takes 6 to 10 minutes. The game ships as a web game for portals such as CrazyGames and as an Android app on Google Play, from one codebase.

### 3.4 Design pillars

Use these to settle any design question this document does not answer.

1. **"Who wins?" tension.** A match should be undecided for most of its length, with lead changes and late swings. A match decided in the first 10 seconds is a failed match, even for the winner.
2. **Breakable by design.** The best feeling in the game is finding a combination that seems unfair. Favour multiplicative synergies and uncapped scaling over safe, flat bonuses. Balance by raising the opposition, not by capping the player.
3. **Readable chaos.** The screen fills with lasers, splits and explosions, but the player can always answer two questions at a glance: who is winning, and why.
4. **Playing within 10 seconds.** No tutorial screens, no sign-in, no long menus. The first launch goes from load to a running match in under 10 seconds, and the game teaches by playing.
5. **Respect the player's time.** No grind, no energy timers, no punishing difficulty spikes, no forced ads. Unlocks come from doing interesting things.
6. **Clip-worthy.** Any match should look good as a vertical video. The game came from a video format and should feed it back.

### 3.5 What the game is not

- Not a sandbox simulator as its main mode. A sandbox exists, as an unlockable side mode.
- Not a real-time strategy game. The player never places buildings or commands units.
- Not real-time multiplayer. Any PvP is asynchronous and comes after v1.
- Not pay-to-win. Money never buys power.

### 3.6 Audience and platforms

- **Players:** people who watch simulation-battle shorts, players of Super Auto Pets, Balatro, Backpack Battles and Bloons, and portal players who want a 5-minute game.
- **Web:** portals (CrazyGames first, Poki and itch.io as candidates) on desktop and mobile browsers.
- **Android:** Google Play, phones first, tablets supported by scaling.
- **Content rating:** suitable for PEGI 12 or lower. Abstract shapes, no gore, no gambling mechanics, no real-money random rewards.

## 4. Tech stack and architecture

### 4.1 Stack

| Layer | Choice | Reasoning | Alternative if this proves wrong |
| --- | --- | --- | --- |
| Language | TypeScript, strict mode | Type safety across a data-heavy ability system | None |
| Build | Vite, with `base: './'` | Fast, small output; relative paths are required by portals, GitHub Pages subpaths and Capacitor | esbuild directly |
| Engine | None | The game is polygons, lines and particles. An engine adds megabytes, load time and an editor you cannot run here | Phaser, only if scene management becomes a burden |
| Arena rendering | Canvas 2D | About 200 polygons and a few hundred particles is well inside its budget | PixiJS behind the same renderer interface, if profiling on a real phone shows Canvas 2D cannot hold 60 fps |
| Menus and HUD | DOM with Preact and `@preact/signals` | Responsive layout, text and accessibility come free; about 5 KB | Vanilla DOM |
| Voronoi | `d3-delaunay` | Small, fast, gives polygons, neighbours and point lookup | Hand-rolled jittered grid |
| Tests | Vitest; Playwright for screenshots | Sim runs in Node; screenshots let you check the UI yourself | None |
| Tool runner | `tsx` (dev only) | Runs the TypeScript lab and tools without a build step | Node's own type stripping, once imports carry extensions |
| Android wrapper | Capacitor 8 or newer | Wraps the same web build; standard Gradle project; targets SDK 36 | Trusted Web Activity |
| Runtime | Node 22, JDK 21 in CI | Required by Capacitor 8 | Match whatever the current Capacitor needs |
| Package manager | npm with a committed lockfile | Zero setup in cloud sessions and CI | pnpm |

Keep runtime dependencies to this list. Adding one needs a line in `docs/DECISIONS.md` saying why.

### 4.2 Repository layout

```
/
  CLAUDE.md                 short: conventions, commands, pointers to docs
  docs/
    MASTER_PROMPT.md        this document, kept current
    DECISIONS.md            dated log of every changed decision
    PROGRESS.md             per-session handoff: done, verified how, next
    DESIGN.md               living design detail as it firms up
    balance/                generated balance-lab reports
  src/
    sim/                    pure deterministic simulation, no DOM
      rng.ts  arena.ts  world.ts  step.ts  abilities.ts  events.ts  hash.ts
    content/                data only
      tuning.ts  cores.ts  mods.ts  rivals.ts  bosses.ts  ascension.ts
    run/                    run state machine, draft, rival generation
    render/                 canvas renderer, particles, camera shake
    audio/                  WebAudio synth and mixer
    ui/                     Preact screens and HUD
    meta/                   save, unlocks, daily, stats, replay codes
    platform/               adapter interface and one file per platform
    main.ts
  tools/
    lab.ts                  headless balance lab
    replay-check.ts         golden replay verification
  tests/
  android/                  Capacitor project, committed
  .github/workflows/
```

### 4.3 Architecture rules

1. **The simulation is pure.** Code in `src/sim` never touches the DOM, timers, `Date`, `Math.random` or any global. It takes a match config, a seed and an input list, and advances in fixed steps of 1/60 s. It runs unchanged in Node.
2. **One-way data flow.** The sim owns the state. The renderer, audio and UI read state and consume a typed event queue (`CellCaptured`, `WallBounce`, `Clash`, `CoreTriggered`, `ModTriggered`, `RunnerSpawned`, `MatchEnded` and so on). They never write to the sim. Player input enters only as timestamped input records.
3. **Determinism.** Same version, seed, builds and inputs must produce the same state hash at every step. Use one seeded PRNG (for example sfc32 or mulberry32) with separate streams for arena generation, simulation and cosmetics. Iterate arrays in fixed order; never iterate a `Set` or object keys in sim code. Cosmetic randomness (particles, shake) uses its own stream and never affects the sim.
4. **Determinism caveat.** Floating-point results of `Math.sin` and similar can differ between JavaScript engines. Chrome and Android WebView share V8, so treat cross-engine equality as a goal, not a guarantee. Sim code uses no trigonometry at all (ESLint enforces this): turn headings with `rotateSmall` and draw random directions by rejection sampling. Stamp replay codes with the game version.
5. **Content is data.** A Core or Mod is a declarative object: id, name, text template, rarity, tags, per-level values, and hooks written against the ability API in section 5.5. Adding a Mod must not require touching the sim loop.
6. **Render is interpolated.** Fixed sim step, variable render rate, with interpolation between the last two sim states. Speed-up runs more sim steps per frame.
7. **Saves are versioned.** One JSON document with a `version` field, migrations in order, and a corrupt-save fallback that never crashes the game. All storage goes through the platform adapter.
8. **Platform code is isolated.** Nothing outside `src/platform` references Capacitor, the CrazyGames SDK or any store API. The target is chosen at build time with `VITE_PLATFORM=web|crazygames|android`, so unused SDKs are not bundled.

### 4.4 Budgets

| Budget | Target |
| --- | --- |
| Web build, total | Under 5 MB; JavaScript under 400 KB gzipped |
| Load to first interactive frame | Under 3 s on a mid-range phone over 4G |
| Frame rate | 60 fps on a four-year-old mid-range Android phone |
| Sim step | Under 2 ms on that phone at the content caps |
| Content caps | 300 cells, 32 runners per side, pooled particles with a hard cap |
| Hot loops | No allocations per frame; no `shadowBlur`; glow comes from pre-rendered sprites and additive blending |

CI fails when the bundle budget is exceeded.

## 5. Simulation and game design

All numbers here are starting values in `tuning.ts`. Tune them with the balance lab (section 7.6) and with Yousuf's play feedback.

### 5.1 Arena

- Logical space is a 1000 by 1000 square, independent of screen size.
- Generate about 180 seed points with a jittered grid or Poisson-disc sampling from the arena PRNG stream, apply two rounds of Lloyd relaxation, and build the Voronoi diagram clipped to the square.
- Precompute per cell: polygon, centroid, neighbour list, and whether it touches the arena edge.
- Ownership is a typed array, one byte per cell: side 0, side 1, with a reserved value for neutral cells so later modes can use them.
- Initial split: draw a line through the centre at a seeded angle, sort cells by signed distance to it, and give each side exactly half.
- Point-to-cell lookup uses the Delaunay `find` with the previous cell as the hint.

### 5.2 Runners and capture

A runner is a moving agent belonging to a side. Each side starts with one primary runner at the centroid of its territory, heading toward the enemy side within a seeded 30-degree spread.

| Property | Start value | Notes |
| --- | --- | --- |
| Speed | 420 units/s | Constant unless modified |
| Body radius | 14 units | Used for runner collisions |
| Capture radius | 0 | 0 means only the cell under the centre is captured; growth effects raise it |

- **Movement:** straight lines. On hitting an arena wall the runner reflects, then its heading is jittered by up to 4 degrees from the sim PRNG so paths never settle into a loop.
- **Clash:** enemy runners that overlap bounce off each other along the collision normal. Runners on the same side pass through each other.
- **Capture:** each step, the enemy cell under a runner's centre flips to the runner's side, as does any enemy cell whose centroid is within the capture radius. Shielded cells lose a shield point instead.
- **Hit:** a wall bounce or a clash. Hits and captures are counted separately per side, and both are available as triggers. Several Cores scale on hits.

### 5.3 Match flow

1. A VS card shows both builds (section 6.5). Tap to start, or it auto-starts after 2 seconds.
2. A 1.5-second countdown.
3. The match runs for 40 seconds.
4. At the buzzer, the side with more cells wins. A tie goes to sudden death: the next capture wins.
5. Holding every cell at any time is a Wipeout, an instant win with a bonus (one extra reroll).

Tension tools, all mild at first and all tunable:

- **Underdog boost:** the trailing side's runners gain speed in proportion to the deficit, up to 15%.
- **Overtime surge:** in the last 10 seconds, capture radius effects and Core triggers are amplified for both sides, so late swings are possible.

The lab measures whether these produce the tension in pillar 1. Remove either if it is not needed.

### 5.4 Player input

- **Redirect:** tapping anywhere in the arena turns the player's primary runner to head straight at the tap point. It has a 5-second cooldown, shown as a ring on the runner and a bar under the arena. The first charge is ready at match start.
- **Why this input:** it is one-handed, needs no tutorial, and has real skill in it: aim through a dense enemy cluster, line up a long wall-to-wall path, intercept the enemy runner to bank a clash, or dodge one.
- **Rival redirect:** rivals also redirect, driven by a simple heuristic (aim at the largest enemy cluster in range) with error and reaction delay that shrink in later rounds. In rounds 1 to 3 rivals do not redirect.
- **Speed:** a 1x and 2x toggle. Player matches cannot be skipped.
- **Assist:** a settings option lets the game use the player's redirect with a mediocre heuristic, for accessibility and for players who want to watch.

Phase 2 tests this input against alternatives before anything is built on it.

### 5.5 Ability system

Cores and Mods are built from triggers, counters and effects.

- **Hooks:** `onMatchStart`, `onStep`, `onHit`, `onWallBounce`, `onClash`, `onCapture`, `onCellLost`, `onRedirect`, `onInterval(seconds)`, `onLastSeconds(seconds)`, `onLeadChange`.
- **Context API given to hooks:** read-only views of the world, plus a small set of mutators: `addStat`, `mulStat`, `addStacks`, `spawnRunner`, `captureCells`, `captureRadius`, `shieldCells`, `lockCells`, `fireBeam`, `pushRunner`, `teleportRunner`, `schedule`, and the sim PRNG. Hooks may not mutate the world any other way.
- **Stats:** speed, body radius, capture radius, beam length, trigger thresholds, cooldowns. Each stat has an additive layer and a multiplicative layer; additive applies first.
- **Stacks:** each Core has one named stack counter (laser length, splits, pulse radius). Mods that say "your Core's stacks" act on it, which is how one Mod works with every Core.
- **Order:** hooks fire in a fixed order: Core first, then Mods in slot order. Slot order is therefore a build decision.
- **Overflow, not caps:** scaling should feel unbounded. Where a hard performance cap exists (32 runners per side), convert overflow into another stat (extra splits become speed) and show it.
- **Every trigger is visible:** each Core or Mod activation emits an event so the HUD can flash that Mod's icon. Players learn what their build does by watching it fire.

### 5.6 Cores

Each Core is a colour, a shape, a name and one signature ability. The HUD shows its live stack counter. Phase 3 ships the first four; Phase 4 completes the set.

| Core | Colour | Signature | Stack shown |
| --- | --- | --- | --- |
| Ricochet | Crimson | Trails a straight beam behind it; after each turn the beam swings back to trailing, capturing every cell it sweeps. The beam grows 38 units per hit (starts at 60) | Beam length |
| Splitter | Magenta | Every 7 hits (splits' hits count too), spawns a smaller, slower, permanent split runner | Splits |
| Pulse | Cyan | Every 5 hits, emits a shockwave that captures in a radius; the radius grows each pulse | Pulse radius |
| Bloom | Green | Cells it captures spread to one adjacent enemy cell after 2 seconds; the spread chance grows per capture | Spread chance |
| Fortress | Gold | Every 10 captures, its whole territory gains a shield point | Shields granted |
| Phantom | Violet | Every 6 seconds, teleports to the enemy cell furthest from any runner; the interval shortens each jump | Jump interval |
| Juggernaut | Orange | Capture radius grows with every 8 captures; speed drops slightly as it grows | Size |
| Leech | Teal | On a clash, steals a share of the enemy Core's stacks and converts them to speed | Stolen stacks |

Design each Core so its growth curve has a different shape: Ricochet is linear and steady, Splitter is slow then explosive, Pulse is bursty, Bloom compounds. Matches are interesting when curves cross.

### 5.7 Mods

- A build holds up to 6 Mods. Taking a seventh means replacing one.
- Rarities: common, uncommon, rare. Later rounds offer more rares.
- Picking a Mod the player already owns levels it up, to a maximum of level 3. Each level raises its numbers.
- Phase 3 ships 16 Mods; v1 ships 30 or more. The list below is a starting set. Change, cut and add freely, keeping pillar 2 in mind: prefer Mods that change what a build does over Mods that add a percentage.

| Mod | Group | Effect at level 1 |
| --- | --- | --- |
| Overclock | Scaling | Gain 3% speed per hit for the rest of the match |
| Growth Spurt | Scaling | Gain 1 capture radius per 6 captures |
| Compound | Scaling | Every 10 seconds, multiply your Core's stacks by 1.25 |
| Echo | Trigger | Every third Core trigger fires twice |
| Hair Trigger | Trigger | Your Core's "every N hits" needs one hit fewer |
| Clash Engine | Trigger | A clash counts as 3 hits |
| Wall Hugger | Trigger | Each wall bounce also captures the 3 enemy cells nearest the bounce |
| Head Start | Trigger | Begin each match with 8 hits already counted |
| Chain Reaction | Territory | Each capture has a 12% chance to flip an adjacent enemy cell; this can chain |
| Scorched Trail | Territory | Cells you capture cannot be retaken for 2 seconds |
| Bulwark | Territory | Your cells with no enemy neighbour take two touches to flip |
| Encircle | Territory | Enemy cells with no enemy neighbour flip to you |
| Landmines | Territory | Every 8 seconds, mine one of your cells; an enemy runner that touches it is thrown back and nearby cells return to you |
| Critical Mass | Territory | The first time you hold 65% of the map, capture everything in a large radius around your runner |
| Quick Hands | Redirect | Redirect cooldown is 30% shorter |
| Slingshot | Redirect | After a redirect, double speed for 1.5 seconds |
| Shockwave Tap | Redirect | A redirect emits a capture pulse at the runner |
| Twin Tap | Redirect | Redirect holds two charges and also turns your splits |
| Underdog | Timing | While behind, gain 25% speed |
| Buzzer Beater | Timing | In the final 8 seconds, your Core triggers twice as often |
| Front Runner | Timing | While ahead, your frontier cells are shielded |
| Scavenger | Economy | Gain a reroll after every win |
| Collector | Economy | After winning by 20 or more cells, the next draft offers 4 Mods |
| Glass Cannon | Wild | Gain 60% speed; start each match with 40% of the map |
| Mirror Shard | Wild | Copy the rival Core's signature at half strength |
| Decoy | Wild | Start with a slow extra runner that rival redirects prefer to target |

### 5.8 The run

1. **Start:** pick a Core from those unlocked, then pick 1 of 3 Mods. Round 1 begins at once.
2. **Rounds:** 10 rounds. Each is one match against a generated rival.
3. **Hearts:** the player has 3. Losing a match costs one and the run continues to the next round. The run ends at zero hearts or after round 10.
4. **Draft:** after every match, win or lose, pick 1 of 3 Mods. The player may reroll the offer by spending a reroll, or skip the pick to gain a reroll. Start with 1 reroll.
5. **Bosses:** rounds 5 and 10 are bosses, each with a hand-authored build and an arena twist (for example a shrinking arena, neutral wall cells, or a rival that starts with two runners). Beating round 10 wins the run.
6. **Rivals:** a rival is a Core plus Mods. Mod count and levels scale with the round. Draw rival builds from hand-authored archetype lists per Core so they are coherent, not random piles. Name every rival by colour and Core in capitals, as the videos do.
7. **Ascension:** winning a run unlocks the next tier, up to 8. Each tier adds one rule: rivals carry an extra Mod, rivals redirect better, the player starts with 2 hearts, and so on.
8. **Endless:** after a winning run the player may continue against rivals that keep scaling until the hearts run out. This is where broken builds get to show off.

Target pacing: a full run takes 6 to 10 minutes. The time between the end of one match and the start of the next should be under 15 seconds for a player who decides quickly.

## 6. Game feel, UX and retention

### 6.1 Visual direction

- **Look:** dark background, flat saturated colour per side, thin lighter cell edges, and a bright frontier line wherever the two territories meet. Everything is drawn in code; there are no image assets in the arena.
- **Identity:** follow the genre's conventions (VS header, territory bar, capital-letter names) but give the game its own typography, palette and layout. Do not copy any specific creator's branding, names or overlay design.
- **Runners:** each Core has its own geometric shape as well as its colour, so sides are never told apart by colour alone.
- **Readability first:** when effects pile up, cells and the frontier stay legible. Effects draw above cells at reduced opacity; the territory bar is always visible.
- **Colour-blind safety:** check every Core pair for contrast. Offer a high-contrast setting that adds a pattern to one side's cells.

### 6.2 Juice

Build these as a layer on the event queue, each with an intensity setting and a global "reduce motion" switch.

- Cell capture: a flash and a short scale pop, staggered when many flip at once so waves read as waves.
- Hits: a small camera shake, a spark burst, and a few frames of hit-stop on clashes.
- Core triggers: a distinct effect per Core plus a flash of its HUD counter.
- Lead change: the territory bar thumps and the leading side's name pulses.
- Final 10 seconds: the timer turns urgent and the audio intensifies.
- Match end: the last frame freezes for a beat, then the result banner drops in. A Wipeout gets its own, bigger moment.

### 6.3 Audio

- Synthesise everything with WebAudio. Ship no audio files in v1.
- Each side plays notes from its own pentatonic scale. Consecutive hits climb the scale and reset after a pause, so a build that is firing fast is heard as a rising run.
- Captures are soft ticks, rate-limited so a 30-cell wave does not clip.
- A simple generated beat runs under matches and gains layers in the final 10 seconds.
- Start audio only after the first user gesture. Mute and pause on tab hide, app background and during ads. Separate music and effects volume settings.
- On Android, add light haptics for clashes, Core triggers and the result, with a setting to turn them off.

### 6.4 Layout

- **Portrait reference:** 390 by 844. From the top: VS header with both build cards and live stack counters, the territory bar with counts and a half marker, the square arena at full width, then the player's Mod slots and the redirect cooldown bar.
- **Desktop and landscape:** the arena is centred and height-limited, with the player's build on the left and the rival's build and a trigger log on the right. Portals require a good desktop presentation.
- **Scaling:** the arena scales to the largest square that fits. Cap device pixel ratio at 2.
- **Android:** lock to portrait, handle edge-to-edge insets with safe-area padding, handle the back button (back from a match opens pause; back from home exits), and pause when the app is backgrounded.
- **Touch:** every tap target is at least 44 px. Nothing important sits in the top corners.

### 6.5 Screens

| Screen | Contents |
| --- | --- |
| Home | Play, Daily Clash, Versus Lab, Collection, Settings. One tap from launch to a run |
| Core select | Unlocked Cores with one-line signature text; locked ones show an unlock hint |
| VS card | Both names, Cores and Mod icons, round number, hearts |
| Match | As in 6.4, plus pause and the speed toggle |
| Result and draft | Win or loss banner, one highlight stat, then 3 Mod cards with reroll and skip |
| Run summary | Rounds won, final build, best moment, share button, play again |
| Collection | Cores and Mods found, with stats and unlock hints |
| Settings | Volumes, haptics, reduce motion, high contrast, redirect assist, build version and commit hash |

A Mod card shows the name, a procedural icon, one line of effect text with its numbers filled in, its group tag and its level. Long-press or hover shows detail.

### 6.6 Onboarding

- First launch shows one screen: "WHO WINS?" with two Cores to pick from. The pick becomes the player's Core and the match starts.
- Five seconds in, a single pulsing prompt says "Tap to redirect". It disappears after the first tap.
- The first draft carries one line: "Pick a Mod. It stays for the whole run."
- Everything else is taught by short contextual hints, one line each, shown once, never blocking play.
- There is no tutorial mode and no forced reading.

### 6.7 Retention systems

Each of these gives a reason to come back without a backend and without grind.

| System | What it is | Phase |
| --- | --- | --- |
| Unlocks | New Cores and Mods unlock through specific feats ("win a match with 6 splits alive"). The Collection shows hints | 6 |
| Ascension | Eight difficulty tiers, per Core | 4 |
| Endless | Keep going after a winning run; best round is recorded per Core | 4 |
| Daily Clash | One seeded run per UTC day with a fixed Core and fixed draft offers. One scored attempt. Result is a compact shareable text block | 6 |
| Versus Lab | Unlocks after the first completed run. Pick any two builds from unlocked content and watch them fight, with speed and skip controls | 6 |
| Replay codes | A compact code holding version, seed, both builds and the redirect inputs. Web builds accept it as a URL parameter | 6 |
| Clip export | Record a match to video with `canvas.captureStream` and `MediaRecorder` where the browser supports it; feature-detect and hide the button otherwise. Android shares through the system sheet | 6 |
| Lifetime stats | Records per Core: best margin, longest beam, most splits, fastest Wipeout | 6 |

Do not add daily login rewards, energy, timers, loot boxes or streak penalties. A Daily Clash streak may be shown but never punished.

### 6.8 Privacy and analytics

Collect no personal data in v1. Keep an `analytics.track(event, props)` interface that is a no-op by default, so a privacy-respecting provider can be added later with one adapter. This keeps the Play data-safety form and portal reviews simple.

## 7. Platforms, CI/CD, testing and balance

### 7.1 Platform adapter

One interface, one implementation per target, selected at build time. Sketch:

```ts
interface Platform {
  id: 'web' | 'crazygames' | 'android';
  init(): Promise<void>;
  loadingFinished(): void;
  gameplayStart(): void;          // match begins or resumes
  gameplayStop(): void;           // menus, draft, pause
  happyMoment(): void;            // run won, Wipeout
  canShowRewarded(): boolean;
  showRewarded(): Promise<'rewarded' | 'dismissed' | 'unavailable'>;
  showInterstitial(): Promise<void>;
  storageGet(key: string): Promise<string | null>;
  storageSet(key: string, value: string): Promise<void>;
  haptic(kind: 'light' | 'medium' | 'heavy'): void;
  share(payload: { text?: string; url?: string; file?: Blob }): Promise<boolean>;
}
```

| Target | Storage | Ads | Notes |
| --- | --- | --- | --- |
| `web` | localStorage, wrapped in try/catch | None | Used for GitHub Pages, itch.io and CrazyGames Basic Launch |
| `crazygames` | SDK data module if available, else localStorage | SDK midgame and rewarded only | Loads the SDK script; calls loading and gameplay events |
| `android` | Capacitor Preferences | Stubbed until Phase 8 | Haptics, Share, App (back button, pause and resume) plugins |

Rules for every target:

- The game pauses and mutes while an ad shows and recovers cleanly from an ad error or an ad blocker.
- A rewarded-ad button appears only when `canShowRewarded()` is true. The game is fully playable without ever watching an ad.
- No ads of any kind during a player's first run.
- Portal builds contain no external links, no other ad code and no cross-promotion.

### 7.2 Monetisation plan

Nothing here is built before Phase 7, but the design leaves room for it.

| Placement | Type | Where |
| --- | --- | --- |
| Extra reroll at a draft | Rewarded | Once per draft |
| Revive: restore one heart | Rewarded | Once per run, at zero hearts |
| Between runs | Interstitial or midgame | After the run summary, never between rounds |
| Remove ads | One-time purchase, Android | Phase 8, optional |

CrazyGames does not allow a midgame ad and a rewarded continue at the same break, so the revive offer and the between-run ad must never share a screen. Check the current CrazyGames ad requirements before implementing.

### 7.3 Store requirements to design for now

- **CrazyGames:** initial download at most 50 MB (aim for under 5 MB), at most 1,500 files, `index.html` at the zip root, relative paths only, English, PEGI 12, works on desktop in landscape and on mobile, reaches gameplay quickly. Basic Launch needs no SDK; Full Launch requires it. Re-read the current requirements pages in Phase 7.
- **Google Play:** an Android App Bundle signed with a release key, target API level at the current Play minimum (36 at the time of writing), a privacy policy URL, the data-safety form, a content rating, store graphics. A personal developer account created after 13 November 2023 must run a closed test with 12 testers opted in for 14 continuous days before production access. Tell Yousuf to start recruiting testers early.
- **App identity:** ask Yousuf for the application ID before creating the Android project (suggest `com.<his-handle>.turfbreak`). It cannot change after publishing.

### 7.4 CI/CD

Four workflows. All use Node 22 with npm caching. Use concurrency groups so a new push cancels an older run of the same workflow.

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `ci.yml` | Every push and pull request | `npm ci`, lint, typecheck, unit tests, determinism tests, a 200-match balance smoke test, web build, bundle-size check |
| `web.yml` | Push to `main`, manual | Builds the `web` target and deploys it to GitHub Pages. Builds the `crazygames` target, zips it, and uploads it as an artifact and to the rolling release |
| `android.yml` | Push to `main`, manual | JDK 21 (Temurin), builds the `android` web target, `npx cap sync android`, `./gradlew assembleDebug` with Gradle caching, uploads the APK as an artifact and to the rolling release |
| `release.yml` | Tag `v*` | Builds a signed release AAB and APK from secrets, plus the portal zip, and attaches all three to a GitHub Release |

Details that matter:

- **Rolling release.** Keep one pre-release named `latest` that always holds the newest debug APK and portal zip, with the short commit hash in each file name. Yousuf installs from that page on his phone.
- **Stable debug signature.** A fresh CI runner generates a new debug keystore each time, so each APK would refuse to install over the last and saves would be lost. Commit a dedicated debug keystore to the repo, point the debug signing config at it, and say clearly in a comment that it is for debug builds only.
- **Release signing.** `release.yml` reads `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`. If any is missing it fails with a message naming the missing secret. The release keystore is never committed. Give Yousuf the exact commands to create it and add the secrets.
- **Versioning.** `versionName` comes from `package.json`. `versionCode` comes from the workflow run number. The Settings screen shows version and commit hash so Yousuf always knows which build he is testing.
- **Android project.** Create it once with `npx cap add android` and commit the `android/` directory. Creating it needs only npm. Do not try to run Gradle in the cloud session unless the Android SDK is present; CI is the source of truth for Android builds.
- **Icons and splash.** Generate from one SVG with `@capacitor/assets` and commit the output.
- **Pages.** Deploy with the official Pages actions. Tell Yousuf to set the Pages source to GitHub Actions in the repository settings.
- **Verify the pipeline yourself.** After pushing workflow changes, check the runs with `gh run list` and `gh run view --log-failed`, and fix failures until all are green. If `gh` cannot reach the runs, ask Yousuf to paste the failing log.

### 7.5 Testing

| Kind | What it covers |
| --- | --- |
| Unit | Arena generation, reflection, clash, capture, each hook, stat layering, draft logic, rival generation, save migration |
| Invariants | After every step in randomised matches: ownership counts sum to the cell count, no NaN, every runner inside the arena, caps respected |
| Determinism | The same seed, builds and inputs give the same state hash at the end and at sampled steps, across repeated runs |
| Golden replays | A handful of stored replays with expected final hashes. A deliberate sim change updates them in the same commit, with the reason in the message |
| Content matrix | Every Mod with every Core, at every level, runs a full match without throwing, and its trigger fires at least once where it should |
| Performance | A worst-case build at the content caps stays inside the sim-step budget |
| UI smoke | Playwright loads the web build, plays through first launch to the first draft, and saves screenshots at 390 by 844 and 1280 by 720 |

Look at the screenshots yourself before reporting UI work as done. If Playwright cannot install a browser in the cloud session, run the UI smoke job in CI, upload the screenshots as artifacts, and download them to review.

### 7.6 Balance lab

`tools/lab.ts` runs matches and whole runs headlessly and writes Markdown reports to `docs/balance/`. It is the main tool for tuning, and it is why the simulation must be pure.

It reports:

- **Core matrix:** win rate of every Core against every other, with no Mods, over at least 500 seeds each.
- **Mod impact:** the change in win rate from adding each Mod to each Core, at each level. This finds dead Mods and broken pairs.
- **Tension metrics:** mean lead changes per match, the time of the final lead change, the share of matches where one side passed 70% of the map before half time, and the margin distribution.
- **Redirect value:** win rate with no redirect, random redirect and the heuristic redirect on the same seeds.
- **Run outcomes:** run win rate per ascension tier for a random drafter and for a synergy-seeking drafter.

Starting targets:

| Metric | Target |
| --- | --- |
| Core against itself | 48% to 52% |
| Any Core against any other, no Mods | 40% to 60% |
| Mean lead changes per even match | 2 or more |
| Even matches effectively decided before half time | Under 15% |
| Heuristic redirect against no redirect | 10 to 20 points of win rate |
| Random drafter, tier 0 run win rate | 35% to 50% |
| Synergy drafter, tier 0 run win rate | About 80% |
| Largest win-rate impact of any common Mod at level 1 | Under 25 points |

The lab measures balance, not fun. A build that is strong, visible and satisfying may stay strong; raise the rivals instead. Treat the numbers as a check on Yousuf's play feedback, not a replacement for it.

## 8. Build plan

Nine phases, one per session or more. Phases 0 to 3 are the MVP and should fit in one to two weeks. Each phase ends with a build Yousuf plays on his phone. Phases marked **fun gate** need his explicit go-ahead before the next begins.

### Phase 0: foundations and pipeline

Goal: an empty game that builds, tests and ships to both targets on every push.

- Scaffold the repository as in 4.2. Save this document as `docs/MASTER_PROMPT.md`. Write `CLAUDE.md`, `DECISIONS.md`, `PROGRESS.md`.
- A Vite app that draws a bouncing dot on a full-screen canvas at 60 fps with the fixed-step loop, and shows version and commit hash.
- The platform adapter interface with the `web` and `android` implementations (storage, haptics, back button).
- Vitest running with one real test. Lint and typecheck configured.
- Ask Yousuf for the application ID, then create and commit the Capacitor Android project with the debug keystore.
- All of `ci.yml`, `web.yml` and `android.yml` green. `release.yml` written and documented, untested until secrets exist.

Done when: the Pages URL shows the dot on Yousuf's phone browser, the APK from the `latest` release installs and shows the same, and a second APK installs over the first without uninstalling.

### Phase 1: the simulation

Goal: a watchable match that looks like the videos.

- Arena generation, runners, reflection, clashes, capture, match timer and win rules (5.1 to 5.3).
- Two Cores hard-wired through a first version of the ability hooks: Ricochet and Splitter.
- The canvas renderer: cells, frontier line, runners, beam, splits.
- The VS header with live stack counters and the territory bar.
- Seeded determinism with the state hash, unit and invariant tests, and a first `lab` command that runs N headless matches and prints win rate and lead changes.
- A debug screen: pick two Cores and a seed, watch, rematch.

Done when: Ricochet against Splitter is close to even over 500 seeds, determinism tests pass, and the match holds 60 fps on Yousuf's phone.

### Phase 2: agency (fun gate)

Goal: prove that a match is fun to play, not only to watch.

- Redirect input with cooldown feedback, and the rival redirect heuristic.
- Underdog boost and overtime surge, tuned with the lab's tension metrics.
- First juice pass: capture pops, shake, sparks, hit-stop, synthesised hit notes and capture ticks.
- The 2x speed toggle.
- Behind a debug switch, two alternative inputs for comparison: hold to boost speed on a meter, and no input at all.
- The redirect-value report in the lab.

Done when: Yousuf has played at least 20 matches across the input variants and chosen one. If none is fun, stop and propose new input designs before continuing. Do not build the run loop on an input that is not fun.

### Phase 3: the run (fun gate, MVP)

Goal: the full loop, small but complete.

- The full ability system (5.5) with 4 Cores and 16 Mods chosen to show the widest range of interactions.
- The run state machine: Core select, first draft, 10 rounds, hearts, drafts with reroll and skip, two bosses, run summary.
- Rival generation from archetype lists, with round scaling.
- Home screen, VS card, result and draft screen, Mod cards, trigger flashes on Mod icons.
- Versioned saves: run in progress, settings, basic stats.
- First-launch flow as in 6.6.
- Content-matrix tests and the run-outcome lab report.

Done when: Yousuf finishes a run and wants another. Ask him which builds felt strongest and which Mods he never picked.

### Phase 4: content and balance

- All 8 Cores, 30 or more Mods, Mod levels, rarities weighted by round.
- Ascension tiers and Endless.
- Full lab reports committed, with tuning passes until the targets in 7.6 are met or consciously waived in `DECISIONS.md`.
- More boss twists; at least four bosses in rotation.

Done when: every Core has at least two distinct winning build styles according to the lab and to Yousuf.

### Phase 5: feel and polish

- Full audio: scales per side, generated beat, final-seconds layers, stingers.
- Second juice pass, reduce-motion and high-contrast settings, redirect assist.
- Desktop and landscape layout. Safe-area handling. Haptics.
- Performance pass on a real phone, with a worst-case build.
- App icon, splash and a simple logo, all generated from SVG.
- UI smoke screenshots reviewed at both sizes.

Done when: a stranger handed the phone can play a run with no explanation.

### Phase 6: retention

- Unlock feats and the Collection screen. Decide the starting roster (suggest 3 Cores and about 14 Mods unlocked at first launch).
- Daily Clash with its share text.
- Versus Lab.
- Replay codes and the URL parameter.
- Clip export where supported.
- Lifetime stats.

Done when: there is a visible reason to open the game tomorrow.

### Phase 7: store readiness

- The `crazygames` adapter against the current SDK, tested with their QA tool, plus a requirements checklist walked item by item.
- Rewarded and between-run placements wired through the adapter (7.2).
- `release.yml` tested end to end once Yousuf adds the signing secrets.
- A privacy policy page served from GitHub Pages.
- Store listing kit: title options, short and full descriptions, screenshots and a feature graphic generated with Playwright, a 20-second gameplay capture.
- Step-by-step guides for Yousuf: Play Console setup, closed test with 12 testers, CrazyGames Basic Launch submission.

Done when: a signed AAB is uploaded to a closed test and the portal zip is submitted.

### Phase 8: after launch (each item optional and separately approved)

- Android ads through AdMob and a remove-ads purchase.
- Asynchronous ghosts: fight other players' saved builds, which needs a small backend. Propose options and costs first.
- Leaderboards for Daily Clash.
- Other portals (Poki, itch.io), localisation, iOS.

## 9. Working protocol

### 9.1 Every session

1. Read `CLAUDE.md`, `docs/PROGRESS.md`, `docs/DECISIONS.md` and the sections of this document that the phase touches.
2. Before writing code, post a plan of 5 to 10 lines: what you will build, in what order, and anything you intend to change from this document.
3. Work on a branch named for the phase. Commit small, with conventional commit messages. Run lint, typecheck and tests before each push.
4. Open a pull request, wait for CI, and merge to `main` when it is green so the phone builds update. If you cannot merge, ask Yousuf to.
5. Confirm the `web.yml` and `android.yml` runs on `main` succeeded.
6. Update `docs/PROGRESS.md`: what was done, how each item was verified, known issues, what is stubbed, and what comes next.
7. End with a short report to Yousuf: the two links (Pages and the `latest` release), up to 8 specific things to try on his phone, and any open questions.

### 9.2 Deciding and asking

- **Decide yourself and log it:** tuning values, naming, file structure, minor UX details, test design, any choice that is cheap to reverse.
- **Ask first:** changing the stack, the core loop, the input scheme, the scope of a phase, monetisation, anything that touches a store account, and anything that deletes player data.
- **When Yousuf gives feedback on a build,** make the smallest change that addresses it. Do not rewrite working systems unless he asks or the feedback cannot be met otherwise, and say so first.
- **When you disagree with this document or with feedback,** say so once, clearly, with the reason and an alternative. Then follow his call.

### 9.3 Code standards

- TypeScript strict, no `any` in sim or content code.
- Small modules with one job. No dead code, no commented-out code, no speculative abstractions for phases that have not started.
- Comments explain why, not what.
- No magic numbers outside `tuning.ts` and content definitions.
- Every bug fix in the sim comes with a test that would have caught it.

### 9.4 Definition of done, for any phase

- The phase's "done when" line is met and you have said how you checked it.
- CI is green on `main`, and both the web build and the APK are current.
- No console errors in a full play-through.
- Budgets in 4.4 hold.
- `PROGRESS.md`, `DECISIONS.md` and this document reflect reality.

### 9.5 Kickoff messages

Yousuf starts each session with one of these.

**Phase 0**

```
This is a new project. The full brief follows below this message. Save it as
docs/MASTER_PROMPT.md, then carry out Phase 0 only. Every decision in the brief
is a default you may challenge. Before you scaffold anything, ask me for the
application ID and tell me which repository settings I need to change. Finish by
giving me the Pages URL and the APK link, and confirm all workflows are green.

[paste sections 3 to 9]
```

**Phases 1 to 8**

```
Read CLAUDE.md, docs/PROGRESS.md, docs/DECISIONS.md and docs/MASTER_PROMPT.md.
Carry out Phase N only. Post your plan first, then build. My feedback on the
last build:
- ...
Finish with the two build links and a list of what I should test.
```

**Feedback-only session**

```
Read CLAUDE.md and docs/PROGRESS.md. No new phase. Fix or tune only these,
with the smallest changes that work:
- ...
```
