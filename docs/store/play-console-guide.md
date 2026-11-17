# Google Play: click-by-click guide

This guide takes you from a new Google Play developer account to a closed test with 12 testers, and then to applying for production access. Follow it in order. Where a step is marked **(unverified)**, the screen or rule was not checked against Google's own pages in this session, so the Play Console's wording is the authority.

## 0. Checklist and lead times

Two things take calendar time, not effort: the 14-day closed test and finding 12 testers. Start both early.

| # | Step | Who | Lead time |
| --- | --- | --- | --- |
| 1 | Create a Google Play developer account and pay the fee | Yousuf | Same day |
| 2 | Identity verification (ID and phone) | Yousuf | Days. Google can take longer (unverified) |
| 3 | Recruit 12 testers with Google accounts | Yousuf | Start now. Plan for 2 to 4 weeks to find 12 people who will stay opted in. Estimate |
| 4 | Merge the privacy page and check its URL | Claude or Yousuf | The web deploy runs after merge. Under an hour, typically. Estimate |
| 5 | Make the keystore and add the four GitHub secrets | Yousuf | 30 minutes |
| 6 | Tag a release and wait for the Release workflow | Yousuf, with Claude | About 15 to 25 minutes per run. Estimate |
| 7 | Create the app, fill in the store listing and the declarations | Yousuf | One or two evenings |
| 8 | Upload the AAB to the closed test, and wait for Google's review | Yousuf | Review can take hours to days (unverified) |
| 9 | Keep 12 or more testers opted in for 14 days | Testers | 14 days, continuous. A tester who opts out and back in starts their days again from zero (official) |
| 10 | Apply for production | Yousuf | Google usually reviews within 7 days (official). It may ask for more testing |

Rough total if you start now: 4 to 6 weeks, mostly waiting for testers and the 14 days.

**The 12-tester rule (official, Google Play Console Help):** a personal developer account created after 13 November 2023 must have at least 12 testers opted in to a closed test for 14 days continuously before it can apply for production access. Only the closed testing track counts. Internal testing does not. Source: https://support.google.com/googleplay/android-developer/answer/14151465

Recruit 15, not 12. If one tester leaves, the clock on the test is at risk.

**Target API level (official, Google Play Console Help):** new apps and app updates must target Android 16 (API 36) or higher from 31 August 2026. The app's `targetSdkVersion` is 36 in `android/variables.gradle`, so it meets this. Source: https://support.google.com/googleplay/android-developer/answer/11926878

### What to have ready

- A Google account for the developer. Use one you will keep for years.
- A government-issued photo ID (passport, driver's licence or national ID card). The name must match the account name exactly (unverified, from secondary sources).
- A payment card for the one-time developer registration fee. The amount is shown in the Console. It was not checked in this session.
- An Android phone for the device check, if the Console asks for it (unverified).
- A contact email address you are happy to make public. Play shows it on the store page. Use a dedicated address, not a personal one.
- Java JDK 21 installed, to run `keytool` (step 5).
- Owner or admin access to the GitHub repo `yousufkamran222-code/turfbreak`.
- The privacy page live at https://yousufkamran222-code.github.io/turfbreak/privacy.html (step 4).

## 1. Create the developer account

1. Open https://play.google.com/console and sign in with the developer Google account.
2. Accept the Developer Distribution Agreement.
3. Choose **Personal** as the account type. Choose **Organization** only if you have a registered company with a D-U-N-S number.
4. Pay the one-time registration fee.
5. Fill in the developer profile: public developer name, email address and phone number. The developer name and email are shown on the store page.
6. Complete **identity verification**: follow the prompts to upload a photo of your ID and confirm your phone number. The name must match the account name (unverified).
7. If the Console asks you to verify the device, install the Google Play Console app on your Android phone and sign in (unverified).
8. Wait for the verification email or status change. You cannot create apps until this is done.

If verification fails, the Console shows a reason. The most common one is a name mismatch. Fix the name on the account to match the ID, or use a clearer photo.

## 2. Make the privacy page live

The privacy page is `pages/privacy.html` in the repo. It is served by GitHub Pages at:

**https://yousufkamran222-code.github.io/turfbreak/privacy.html**

Before this step, the page has a placeholder you must replace: `CONTACT_EMAIL`. Use the same contact address you will give Google Play.

**Option A (simplest, ask Claude):** ask Claude in a session to replace `CONTACT_EMAIL` with your address and open a pull request. Merge the pull request once the checks pass.

**Option B (GitHub website):**

1. Open https://github.com/yousufkamran222-code/turfbreak/blob/main/pages/privacy.html
2. Click the pencil icon (Edit this file).
3. Find `CONTACT_EMAIL`, replace it with your address, and remove the highlight. The highlight is the `<span class="placeholder">` tag around it.
4. Click **Commit changes**. Choose **Create a new branch for this commit and start a pull request**, then open the pull request.
5. Wait for the CI checks to pass, then click **Merge pull request**.

After the merge, the **Web** workflow deploys the page. To check it:

1. Open the repo's **Actions** tab and wait for the **Web** run to show a green tick.
2. Open the privacy URL above on your phone. It should show a dark page with your contact email.

If it is not there after the Web run is green, the GitHub Pages source may be wrong. Go to the repo's **Settings > Pages** and set **Source** to **GitHub Actions**.

## 3. Create the app in Play Console

1. In Play Console, click **Create app**.
2. **App name:** type the title you chose from `listing.md` section 1. It can be up to 30 characters. Check the name for conflicts before you commit.
3. **Default language:** English (United States), or English (United Kingdom) if you prefer.
4. **App or game:** Game.
5. **Free or paid:** Free.
6. Tick the two declarations: the developer programme policies, and the US export laws.
7. Click **Create app**.

The package name is set by the first upload and cannot change. It is `com.yousufkamran.turfbreak`. Google Play will show it in the Console after the first upload.

## 4. Generate the release keystore

This key signs the app before it is uploaded. Once it is set up, every future upload must be signed with it. Losing it is a serious problem. Treat it like a bank password.

### 4a. Install Java (once)

1. Go to https://adoptium.net and download **Temurin JDK 21** for your computer (the same version the CI uses).
2. Run the installer and accept the defaults.
3. Open a new terminal window after installing, so the `keytool` command is found.

### 4b. Create a folder for the key, outside the repo

- **Windows:** open PowerShell and run `mkdir $HOME\turfbreak-keys` then `cd $HOME\turfbreak-keys`.
- **macOS and Linux:** open Terminal and run `mkdir -p ~/turfbreak-keys && cd ~/turfbreak-keys`.

Keep this folder out of the repo. The repo's `.gitignore` already ignores `*.jks` files, but keep the key outside it anyway.

### 4c. Run keytool

Run this command exactly. It works the same on Windows, macOS and Linux:

```text
keytool -genkeypair -v -storetype PKCS12 -keystore turfbreak-release.jks -alias turfbreak -keyalg RSA -keysize 2048 -validity 10000
```

It asks several questions:

1. **Enter keystore password:** choose a strong password. Write it down now. This is `ANDROID_KEYSTORE_PASSWORD`.
2. **Re-enter the password.**
3. **First and last name, organisational unit, organisation, city, state, country code:** fill these in with your own details. They are stored in the certificate and are not shown on the store page.
4. **Is ... correct?** type `yes`.
5. **Enter key password:** keytool may not ask this. If it does, type the same password as the keystore password. With the PKCS12 format, both passwords must match. Write it down as `ANDROID_KEY_PASSWORD`.

The alias is `turfbreak`. This is `ANDROID_KEY_ALIAS`.

Check the key was made:

```text
keytool -list -keystore turfbreak-release.jks
```

Enter the password. The output should list one entry called `turfbreak`.

### 4d. Back up the key

- Copy `turfbreak-release.jks` to a second place you control, such as an encrypted USB stick.
- Save the password and alias in a password manager.
- Never send the `.jks` file by email, chat or upload it to GitHub. The repo's release workflow needs it only as a secret (step 5).

## 5. Add the four GitHub secrets

The **Release** workflow (`.github/workflows/release.yml`) reads exactly these four secret names. Type them exactly as shown, in capitals, with underscores.

| Secret name | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | The keystore file, converted to text (step 5a) |
| `ANDROID_KEYSTORE_PASSWORD` | The keystore password from step 4c |
| `ANDROID_KEY_ALIAS` | `turfbreak` |
| `ANDROID_KEY_PASSWORD` | The key password from step 4c (the same as the keystore password) |

### 5a. Convert the keystore to text (base64)

GitHub stores secrets as text, so the `.jks` file has to be converted. Do this from the `turfbreak-keys` folder in step 4b.

**Windows (PowerShell):**

```text
[Convert]::ToBase64String([IO.File]::ReadAllBytes("$HOME\turfbreak-keys\turfbreak-release.jks")) | Set-Clipboard
```

The text is now on your clipboard. Do not use Command Prompt. This command needs PowerShell.

**macOS (Terminal):**

```text
base64 -i turfbreak-release.jks | tr -d '\n' | pbcopy
```

The text is now on your clipboard.

**Linux (Terminal):**

```text
base64 -w 0 turfbreak-release.jks > keystore-base64.txt
```

Open `keystore-base64.txt` in a text editor, select all, and copy. Then delete the file. It contains your key.

### 5b. Add the secrets on GitHub

1. Open https://github.com/yousufkamran222-code/turfbreak
2. Click **Settings** (the tab on the repo, not your account settings).
3. In the left menu, under **Secrets and variables**, click **Actions**.
4. Click **New repository secret**.
5. Under **Name**, type `ANDROID_KEYSTORE_BASE64`. Under **Secret**, paste the base64 text from step 5a.
6. Click **Add secret**.
7. Repeat for the other three names and values.

You should see four secrets in the list. GitHub does not show the values again. If one is wrong, delete it and add it again.

## 6. Tag a release

The **Release** workflow runs when a tag starts with `v`. It also checks that the tag matches the version in `package.json`.

- The tag must be `v` plus the version. The current version is `0.3.0`, so the tag is `v0.3.0`.
- To check the version, look at the top of `package.json` in the repo, or the version shown on the repo's main page.
- If you change the version, change `package.json` first, merge it to `main`, and then tag.

**Do not create the release yourself.** The workflow creates the GitHub Release. If you create one by hand with the same tag, the workflow fails with "release already exists".

**Create the tag.** Ask Claude in a session: "Tag `main` as `v0.3.0` and push the tag." Claude will create and push only the tag. The version number is the one from `package.json`.

Once the tag is pushed:

1. Open https://github.com/yousufkamran222-code/turfbreak/actions
2. Find the run named **Release** for the tag. It can take a minute to appear.
3. Click it and wait for the run to show a green tick. This takes about 15 to 25 minutes.

### If the run fails

The run shows which step failed. Common causes:

| Message | Cause | Fix |
| --- | --- | --- |
| `Missing repository secret ANDROID_...` | A secret is missing or misspelled | Go back to step 5b and check the name |
| `Tag v... does not match package.json version` | The tag and `package.json` differ | Fix the version, then tag again with a new version |
| `Keystore was tampered with, or password was incorrect` | The password secret does not match the key | Re-add `ANDROID_KEYSTORE_PASSWORD` and `ANDROID_KEY_PASSWORD` |
| `a release with the same tag name already exists` | A release was made by hand, or a previous run got that far | Delete the release and the tag, then tag again. Or bump the version and tag the new version (simpler) |
| A test step fails | A code problem, not a setup problem | Ask Claude to read the log |

Use a new version number for each Play upload where you can. Play refuses an upload whose version code was already used. The version code is set by the workflow run number, so each new run gets a higher code. Re-running the same run does not.

## 7. Download the AAB

When the Release run is green:

1. Open https://github.com/yousufkamran222-code/turfbreak/releases
2. Click the release named **Turfbreak v0.3.0** (or your version).
3. Under **Assets**, download **`turfbreak-v0.3.0.aab`**.

Do not upload the `.apk` file to Play. The `.apk` is for installing directly on a phone. Play needs the `.aab`.

The same release also holds `turfbreak-crazygames-v0.3.0.zip` for CrazyGames. See `crazygames-guide.md`.

## 8. Create the closed test

### 8a. Set up Play App Signing

Google Play App Signing is the default for new apps (unverified in this session). On your first upload, accept it. Google keeps its own signing key for the store. Your keystore from step 4 becomes the **upload key**. Keep the keystore safe either way.

### 8b. Create the track and upload the AAB

1. In the left menu, go to **Testing > Closed testing**.
2. Click **Create track**, or open the existing closed track. Name it `Closed test` if asked.
3. Click **Create new release**.
4. Click **Upload** and choose `turfbreak-v0.3.0.aab`.
5. Wait for the upload to finish. Play reads the file and shows the version code and name.
6. Under **Release name**, type the version from `package.json`, for example `0.5.0`.
7. Under **Release notes**, type a short summary in plain English, for example: "Closed test. Please play a run on your phone once a day and tell us what felt slow, confusing or unfair."
8. Click **Save**, then **Review release**, then **Start rollout to closed testing**.

Google reviews the release before it reaches testers. This can take a few hours to a few days (unverified).

### 8c. Add testers

1. In the closed track, open the **Testers** tab.
2. Create an email list. Type or paste the Gmail addresses of your testers, one per line. Each tester needs a Google account.
3. Save the list and make sure it is selected for the track.
4. Copy the **opt-in link** shown on the page. Send it to your testers.

Each tester:

1. Opens the opt-in link on their phone while signed in to the Google account on the list.
2. Taps **Become a tester**.
3. Taps the install link on the same page to install the app from Google Play.

Their status changes to opted in once they accept. Keep the opt-in link and the list. Testers must stay opted in for 14 days in a row.

### 8d. Watch the 14-day clock

- The Console's closed-test page shows how many testers are opted in.
- Do not remove a tester from the list during the test.
- Do not stop the rollout.
- Ask testers to keep the app installed. The production form asks about tester engagement, so real play and feedback help.
- If the count drops below 12, add testers right away. The requirement is 12 testers opted in continuously for the preceding 14 days (official). A day with fewer than 12 testers does not count toward that.

## 9. Fill in the store listing and declarations

Work through the Console's **Dashboard** task list. The task names may change, but they cover the items below.

### 9a. App content: privacy policy

- Privacy policy URL: `https://yousufkamran222-code.github.io/turfbreak/privacy.html`

### 9b. App content: ads, access and declarations

- **Ads:** No, this app does not contain ads.
- **App access:** All functionality is available without special access.
- **News app:** No.
- **Government app:** No.
- **Financial features:** No.
- **Health:** No.

### 9c. App content: target audience

- **Target age group:** 13 and over. This is recommended in `listing.md` section 8. It also keeps the app out of the Families programme.

### 9d. App content: content rating

1. Go to **App content > Content rating**, click **Start questionnaire**.
2. Enter a contact email.
3. Choose **Game** as the category.
4. Answer each question using the table in `listing.md` section 7. Answer honestly. The violence answer is Yes (cartoon or abstract), because the game has explosions.
5. Click **Save**, then **Calculate rating**, then **Apply rating**.
6. Check the rating. The brief's target is PEGI 12 or lower. If the result is higher, check which answer caused it. Do not change an honest answer to get a lower rating.

### 9e. App content: data safety

Go to **App content > Data safety** and click **Start**. The answers for this build are:

| Question | Answer |
| --- | --- |
| Does your app collect or share any of the required user data types? | No |
| Is any data collected by your app encrypted in transit? | Answer only if the form asks. It applies to data that is sent, and this app sends none. |
| Can users request that their data is deleted? | The form may not ask. If it does: data is saved on the device only, and uninstalling the app deletes it. |
| Privacy policy URL | `https://yousufkamran222-code.github.io/turfbreak/privacy.html` |

The app's Android build uses Capacitor plugins for haptics, storage, sharing and the app lifecycle. None of them send data to the developer. The build has no analytics or ad SDK.

Check the data safety answers again whenever a new version adds analytics, ads, sign-in or purchases. The brief's Phase 8 may add ads or a purchase, which changes these answers.

The exact question wording in the Play form was not checked in this session. Answer the question that is asked, using the facts above.

### 9f. Main store listing

Go to **Grow > Store presence > Main store listing** and fill in:

- **App name:** the title you chose.
- **Short description:** one of the three options in `listing.md` section 2.
- **Full description:** paste the text from `listing.md` section 3.
- **App icon:** 512 by 512 PNG. Still to be made (see `listing.md` section 9).
- **Feature graphic:** 1024 by 500. Still to be made.
- **Phone screenshots:** at least two. Still to be made.
- **Category:** Strategy (`listing.md` section 6).
- **Tags:** from `listing.md` section 5.
- **Contact details:** your contact email, and optionally a website. These are shown on the store page.

Save the listing. Google may show a warning for missing graphics. You cannot apply for production until the required graphics are in place.

### 9g. Pricing and distribution

- **Pricing:** Free.
- **Countries and regions:** keep the default unless you want to limit them.
- **Consent:** tick the content guidelines and US export law boxes.

### 9h. In-app products

This version has none. Confirm the Console says there are no in-app products.

## 10. Apply for production access

You can apply only after the closed test has run for 14 days with 12 or more testers opted in (official).

1. Go to the **Dashboard**. When the criteria are met, an **Apply for production** button appears on the page.
2. Click it and fill in the three sections (official):
   - **About your closed test:** how you recruited testers, how engaged they were, and a summary of their feedback.
   - **About your app or game:** target audience, what the game offers, and an estimate of first-year installs.
   - **About your production readiness:** what you changed based on testing, and why you think the app is ready.
3. Submit. Google usually reviews within 7 days, though it can take longer (official). It may reply that you need to keep the closed test running, if you had fewer than 12 testers or too little engagement.

Source for the three sections and the review time: https://support.google.com/googleplay/android-developer/answer/14151465

### 10a. Release to production

When Google approves:

1. Go to **Production** in the left menu, then **Create new release**.
2. Upload an AAB with a higher version code than the closed test. Tag a new version first if needed (step 6).
3. Fill in the release notes and click **Review release**, then **Start rollout to production**.

Google may take time to review the production release (unverified). Plan for it.

## 11. Quick reference

- Repo: https://github.com/yousufkamran222-code/turfbreak
- Privacy page: https://yousufkamran222-code.github.io/turfbreak/privacy.html
- Release workflow: `.github/workflows/release.yml`
- Secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`
- Store copy and ratings answers: `docs/store/listing.md`
- Index and order of work: `docs/store/README.md`

## 12. Verification status of this guide

| Item | Status |
| --- | --- |
| 12-tester, 14-day closed-test rule for personal accounts created after 13 Nov 2023 | Verified, Google Play Console Help: https://support.google.com/googleplay/android-developer/answer/14151465 |
| Production application: three sections, review usually within 7 days | Verified, same page |
| Target API 36 from 31 Aug 2026 | Verified, search summary of https://support.google.com/googleplay/android-developer/answer/11926878 |
| Identity verification with government photo ID and phone; name match | Unverified (secondary sources only) |
| Play Console device check with the Console app on Android | Unverified |
| Registration fee amount | Unverified |
| Play App Signing as the default for new apps | Unverified |
| Data safety, content rating and listing field names | Unverified (general knowledge). Check the Console wording |
| Google Play graphic sizes | Unverified |
| Lead times marked "estimate" | Estimates, not measured |
| Android developer verification for sideloading (relevant to installing debug APKs) | Partly verified. Enforcement began 30 Sept 2026 only in Brazil, Indonesia, Singapore and Thailand, and wider enforcement is planned for 2027. Downloading an APK from a website is not subject to it, according to secondary sources. Unverified in detail |
