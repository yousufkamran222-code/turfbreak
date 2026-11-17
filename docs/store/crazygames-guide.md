# CrazyGames: Basic Launch submission

This guide submits Turfbreak to CrazyGames at Basic Launch, using the portal zip from the GitHub release. Basic Launch needs no SDK and no ads. The Full Launch changes are at the end.

Where a step is marked **(unverified)**, the screen name or rule was not checked in this session. The CrazyGames Developer Portal is the authority. Screen names change, so follow the portal's own text when it differs from this guide.

## 0. What Basic Launch means

From the official requirements page (https://docs.crazygames.com/requirements/intro/):

- **Basic Launch:** the game can go live without being customised for CrazyGames. The SDK is optional. Monetisation is not available, and external ads are not allowed.
- **Full Launch:** available only once CrazyGames selects the game. The game must meet all integration requirements, including the CrazyGames SDK, and ads must run through the SDK.

Turfbreak's `crazygames` build does not include the SDK yet. The adapter arrives in Phase 7, and `src/platform/index.ts` notes this. So the Basic submission is the next step, and Full Launch comes later.

**Basic Launch has no fixed wait** that the official page confirmed. Other sources give different lengths, from about 2 weeks to a minimum of 7 days and 500 plays. Treat this as unverified and check the portal.

## 1. Checklist and lead times

| # | Step | Who | Lead time |
| --- | --- | --- | --- |
| 1 | Decide the title and the build to submit | Yousuf | Same day |
| 2 | Create the portal account | Yousuf | Same day (unverified) |
| 3 | Get the portal zip from the GitHub release | Yousuf | Same day, after the release run is green |
| 4 | Write the copy and make covers and screenshots | Yousuf, with Claude | One or two evenings |
| 5 | Upload the zip and fill in the game details | Yousuf | One evening |
| 6 | Run the portal's QA preview and fix everything it flags | Yousuf, with Claude | One or two sessions |
| 7 | Test on real devices (checklist below) | Yousuf | One evening |
| 8 | Submit for Basic Launch review | Yousuf | Review time not verified |

The CrazyGames route does not have a 14-day wait like Google Play's closed test, so it can run in parallel with Play.

## 2. Requirements checklist

Walk each item. Tick it only after you have checked it. "Verified" means the official page said it. "Repo" means the repo's own CI check enforces it. "Unverified" means it came from the brief or a secondary source, so confirm it on the portal.

### 2a. Official Basic Launch requirements (verified)

Source: https://docs.crazygames.com/requirements/intro/

- [ ] **Initial download is 50 MB or less.** Repo: CI runs `npm run check:size` on the portal build, which enforces a total of 5 MB and 400 KB of gzipped JavaScript. Both limits are far below 50 MB.
- [ ] **Total file size is 250 MB or less** (50 MB without the SDK). Repo: the 5 MB total limit covers this. The build has no SDK.
- [ ] **File count is 1,500 or fewer.** Repo: `check:size` enforces 1,500.
- [ ] **SDK is optional at Basic Launch.** Turfbreak ships without it. Nothing to do.
- [ ] **No monetisation at Basic Launch, and no external ads.** Confirm the build has no ad code. The `crazygames` target uses the web adapter, which has no ads (`src/platform/web.ts`, where `canShowRewarded()` returns false). Repo: no third-party SDK in `package.json` dependencies.
- [ ] **Qualitative game description and controls.** Provide the copy from `listing.md` sections 4.
- [ ] **Game covers: images and videos.** Still to be made. See section 4 below.
- [ ] **Run the portal's QA preview** and fix everything it reports. The preview runs the game as it appears on CrazyGames, checks the requirements, and tests any SDK features (none in this build).

### 2b. From the brief and secondary sources (unverified)

Check each of these on the portal or in its requirements pages. Tick only after you have confirmed it.

- [ ] **PEGI 12 or lower.** The brief sets this target. A search summary of the official page listed it as a Basic requirement (unverified). Use the content rating answers in `listing.md` section 7. The game has abstract shapes and no gambling.
- [ ] **English.** The brief requires it. All copy in the build and listing is English.
- [ ] **`index.html` at the root of the zip.** The release zip is made by `(cd dist && zip -qr ...)`, which puts `index.html` at the top level. Check it: download the zip, open it, and confirm `index.html` is not inside a folder.
- [ ] **Relative paths only.** `vite.config.ts` sets `base: './'`. Check the portal's QA preview for any path errors.
- [ ] **Works on desktop and mobile browsers.** The brief says landscape on desktop. The game is designed for portrait phones. Check what the portal asks for orientation, and how it treats a portrait game on desktop (unverified).
- [ ] **Reaches gameplay quickly.** The brief's target is under 10 seconds from load to a running match. This matters more at Full Launch, which requires landing directly in gameplay (official). Basic Launch does not appear to require it, but check.
- [ ] **Initial download of 20 MB for mobile homepage eligibility.** A secondary source says this, not the official page. It is not a Basic requirement. Our build is far below it anyway.

### 2c. Things a human must check on real devices

Use a real phone, not only the browser's device mode. Use the same game build from the portal zip (or the `latest` pre-release), not a local dev server.

- [ ] Open the game on a phone in Chrome (Android) and in Safari (iPhone), in portrait. Play one full match: menu, core pick, draft, aim, ultimate, result, next draft.
- [ ] Nothing is cut off at 390 by 844 (a common phone size). There is no sideways scrolling.
- [ ] Buttons respond to a finger on the first tap. The ultimate button can be pressed during the match.
- [ ] Drag to aim works with one finger. The page does not scroll while you drag.
- [ ] Open the game on a desktop browser (Chrome, Firefox, Edge). Click and drag to aim works. The ultimate button can be clicked. Escape goes back.
- [ ] Sound starts after the first tap or click, not before (browsers block autoplay). The mute control works.
- [ ] The game still runs in a private or incognito window. Storage is blocked there, so this checks that the game does not break (brief section 7.1).
- [ ] Reload the page during a match. The game recovers to a sensible screen and does not show a blank page.
- [ ] No console errors on load, or on the first match. Open the browser's developer tools (F12 on desktop) and check the Console tab.
- [ ] No external links, no "download the app" buttons, no cross-promotion. Brief section 7.1 requires this for portal builds. Check the menus by tapping every button.
- [ ] The privacy page is not linked from the game. It is only linked from the store listing. Portal builds must not contain external links (brief section 7.1). The privacy page lives in `pages/` and is added only to the GitHub Pages build, so the portal zip does not contain it.
- [ ] Text is readable on a phone, with no tiny labels.

## 3. Build the portal zip

You do not need to build anything. Each tagged release includes the zip.

1. Open https://github.com/yousufkamran222-code/turfbreak/releases
2. Click the latest **Turfbreak v...** release (the one you tagged).
3. Under **Assets**, download **`turfbreak-crazygames-v0.3.0.zip`** (the version in the name matches your tag).

Use the **tagged** release zip for submission. The `latest` pre-release also holds a portal zip, but its name has a commit hash, not a version. Use it only to test the newest build.

Before you upload, check that `index.html` is at the top level of the zip (checklist 2b).

## 4. Covers and screenshots

CrazyGames requires game covers, which the official page describes as images and videos. Sizes were not checked. Confirm them on the portal before you make the files.

Make these from the game in a browser at phone size, and in a desktop-sized window:

- A cover image (portal size, to be confirmed).
- Screenshots of a match, a draft and the result screen.
- A short gameplay video. The brief's Phase 7 plan calls for a 20-second capture.

Playwright can take the screenshots in CI, as the brief describes. Ask Claude to do it if you do not want to make them by hand.

## 5. Copy to paste

Take the text from `listing.md`:

- Title: the title you chose (`listing.md` section 1). Check it for conflicts first.
- Description: `listing.md` section 4, description block.
- Controls: `listing.md` section 4, controls block.
- Tags: `listing.md` section 5.
- Category: `listing.md` section 6. Choose from the portal's list.
- Age rating: PEGI 12 or lower, if the portal asks.

## 6. Submit on the portal

The steps below follow the portal's flow as the official docs describe it. The address and screen names are unverified. Use the portal's own links and text.

1. Find the CrazyGames Developer Portal from the official docs at https://docs.crazygames.com (unverified address, follow the link from the docs).
2. Create a developer account and confirm your email. Use a contact address you are happy to make public, if the portal shows it.
3. Click the option to add or create a **new game**.
4. Upload the zip from section 3. Wait for the upload to finish.
5. Fill in the game details: title, description, controls, tags, category, age rating and covers. Paste from section 5.
6. Open the **QA** or **Preview** tool on the portal. It runs your game as it would appear on CrazyGames, checks the requirements, and tests SDK features (none here).
7. Fix everything the QA tool flags. Re-upload the zip if you change the build. Each new build needs a new tagged release, so plan for this.
8. Tick any confirmation boxes about the rules, then click the button to submit for review.

After submission:

- Check the portal for review status. The review time was not verified.
- If the reviewer asks for a change, the portal will say what. Ask Claude to make it, tag a new release, and upload the new zip.
- Once live, the game is on CrazyGames under Basic Launch.

## 7. What changes for Full Launch

Full Launch is by selection. CrazyGames chooses games for it (official). Prepare for it in case you are selected. From the official page:

- **The CrazyGames SDK is required.** The SDK script comes from CrazyGames. The game must call its `GameplayStart` event when the player reaches a playable state (`gameplayStart()` in the adapter).
- **The game must land directly in gameplay** (official, Full column). A first-time player reaches a running match in about 3 seconds and 3 taps (Core, Mod, launch). Returning players see Home first, with Play one tap away. Check with CrazyGames whether that counts as landing in gameplay.
- **Ads must run through the SDK**, following CrazyGames' guidelines. The game must work with an ad blocker (official).
- **Ad placements (built):** a rewarded extra reroll in the draft and a rewarded revive on the run summary, plus a midgame ad between runs. They never share a screen, because CrazyGames does not allow a midgame and a rewarded continue at the same break (brief 7.2). No ads appear in a player's first run or in the Daily Clash. The adapter is `src/platform/crazygames.ts`.
- **Full visual QA** (official, Full column).
- **Monetisation** becomes available at Full Launch through the SDK. The official page says it is mainly ad revenue share, and only ads served through the SDK are allowed.

What this means for the build: the `crazygames` adapter that calls the SDK is Phase 7 work. The brief's Phase 7 says it is done when the portal zip is submitted. The SDK work is not done yet, so do not expect Full Launch until the adapter is built and tested with the QA tool.

## 8. Verification status of this guide

| Item | Status |
| --- | --- |
| Basic Launch: SDK optional, no monetisation, no external ads | Verified: https://docs.crazygames.com/requirements/intro/ |
| Limits: initial download 50 MB, total 250 MB (50 MB without SDK), 1,500 files | Verified, same page |
| Full Launch requires SDK, SDK ads, adblock-safe, landing in gameplay, full visual QA | Verified, same page |
| Required metadata: description, controls, covers | Verified, same page |
| QA tool in the Developer Portal | Verified, same page. Exact screen not checked |
| Basic Launch length | Unverified. Sources conflict |
| PEGI 12 for Basic | Unverified (search summary, brief 7.3) |
| `index.html` at zip root, relative paths, English | Brief 7.3, and checked against the repo's build (`vite.config.ts`, `release.yml`) |
| Orientation and desktop landscape rule | Unverified (brief 7.3 says landscape desktop) |
| Cover image sizes | Unverified |
| Portal URL and screen names | Unverified |
| 20 MB initial download for mobile homepage | Unverified (secondary source) |
