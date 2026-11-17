# Store readiness: start here

This folder has everything Yousuf needs to get Turfbreak onto Google Play (Android) and CrazyGames (web). Work through it in the order below. The guides are click-by-click and say what each step needs.

## The files

| File | What it is | Who uses it |
| --- | --- | --- |
| `README.md` | This page: the order of work and the open decisions | Everyone |
| `listing.md` | Title options, short and full descriptions, CrazyGames copy, tags, categories, content-rating answers | Yousuf, when filling in both stores |
| `play-console-guide.md` | Google Play: account, keystore, GitHub secrets, tagging a release, closed test, production | Yousuf |
| `crazygames-guide.md` | CrazyGames: Basic Launch submission, requirements checklist, device checks, Full Launch changes | Yousuf |
| `../../pages/privacy.html` | Privacy policy, served at https://yousufkamran222-code.github.io/turfbreak/privacy.html | Both stores need its URL |

## The order

Some steps wait on other people or on the calendar. Start those first.

1. **Decide the title.** Pick one from `listing.md` section 1 and check it for conflicts. "Turfbreak" is a working title.
2. **Start the slow things now.**
   - Create the Google Play developer account and complete identity verification (`play-console-guide.md` section 1).
   - Start recruiting 12 testers, plan for 15. They need Google accounts and must stay opted in for 14 days.
3. **Replace the privacy placeholder and deploy the page.** Put your real contact email in place of `CONTACT_EMAIL` in `pages/privacy.html`. Merge it, check the URL (`play-console-guide.md` section 2).
4. **Make the keystore and add the four GitHub secrets** (`play-console-guide.md` sections 4 and 5). Keep the keystore out of the repo, and back it up.
5. **Tag a release** (`play-console-guide.md` section 6). The GitHub Release then has the signed AAB for Play and the portal zip for CrazyGames.
6. **Submit to CrazyGames at Basic Launch** (`crazygames-guide.md`). This has no 14-day wait, so it can run alongside Play.
7. **Google Play: create the app and fill in the declarations.** Store listing, data safety, content rating, target audience (`play-console-guide.md` section 9). Use `listing.md` for the copy.
8. **Upload the AAB to the closed test** and wait for Google's review (`play-console-guide.md` section 8).
9. **Run the closed test for 14 days** with 12 or more testers opted in (`play-console-guide.md` section 8d).
10. **Apply for production access** (`play-console-guide.md` section 10). Google usually replies within 7 days.

Rough total for Play if you start now: 4 to 6 weeks, mostly waiting for testers and the 14 days.

## Decisions Yousuf needs to make

These are not for Claude to decide. Each one blocks a step above.

- [ ] **Title.** Choose one of the five in `listing.md` section 1, after a conflict check.
- [ ] **Contact email** for the privacy page and the store listing. Use a dedicated address, since Play shows it publicly.
- [ ] **Which build to ship first.** The current build is v0.3.0. It has the Gauntlet, two Cores and nine Mods, but not the full 10-match run in the brief (Phase 3). Phase 2's fun gate is not yet passed (`docs/PROGRESS.md`). Decide whether the first closed test is this build or a later one. The store copy describes the current build, so it must change if Phase 3 lands first.
- [ ] **Testers.** Names and Gmail addresses for 12 to 15 people, ideally people who will play daily.
- [ ] **Target audience.** The recommendation is 13 and over (`listing.md` section 8).

## Known gaps before submission

- The store graphics do not exist yet: the Play icon, feature graphic and phone screenshots, and the CrazyGames covers. The brief's Phase 7 covers these. See `listing.md` section 9.
- The CrazyGames SDK adapter is not built. Basic Launch does not need it. Full Launch does (`crazygames-guide.md` section 7).
- The privacy page has a placeholder, `CONTACT_EMAIL`, until it is replaced.

## Things to check in the stores

Some rules in these guides are marked unverified in the guide itself. Before you rely on one, check the store's own wording. The two most important ones are:

- **Google Play:** the 12-tester, 14-day closed-test rule is verified against Google's own help page. Identity verification details, the fee and the data safety wording were not.
- **CrazyGames:** the Basic and Full requirements are verified against the official requirements page. Basic Launch length and some display rules were not.

Each guide ends with a verification table listing what was checked and where.
