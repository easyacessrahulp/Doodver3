# DOOD for Android (APK)

A small Android app that opens **your own DOOD server** full-screen, like a normal app.

What it adds on top of opening DOOD in Chrome:
- Its own icon and full-screen window, pull down to refresh.
- Choose files / take photos for uploads, and use the microphone (Speak buttons).
- Saves backups and exports to the phone's **Downloads** folder.
- **Phone alerts**: about every 15 minutes it checks your DOOD notifications and shows them as normal phone alerts (works on a plain `http://` office address too). Tap an alert to open that item.
- WhatsApp, e-mail and phone links open the right app. (New in 1.1: DOOD's Email button opens your phone's e-mail app with the message ready.)
- Works with your DOOD address (https online address, or the office address like `http://192.168.1.20:3000`). You type it once.

Needs Android 10 or newer. It does not contain any DOOD data; everything stays on your server.

## What is new in version 1.1
- The **Email** buttons in DOOD (reminders, follow-ups, AI drafts) now open your phone's e-mail app (Gmail app or any other) with the person, subject and message already filled.
- **WhatsApp** buttons open WhatsApp with the message typed. You only press Send.
- **Google Calendar sign-in** opens in the phone's browser, because Google does not allow sign-in inside an app window. After you allow it, come back to DOOD.
- A permanent **download link**: after each build, the APK is also on the repository's **Releases** page, so you can open it on the phone and tap **DOOD.apk**.
- Everything new in DOOD itself (dashboard, calendar, reviews, recognition, Doodu) needs no new APK. It comes from your server, so upgrading the server is enough.

## Build the APK on GitHub (no programming tools needed)

### A. First time (new repository)
1. Sign in at github.com and click **New repository**. Name it `dood-android`, choose **Private**, click **Create repository**.
2. On the new repository page click **uploading an existing file**.
3. Unzip `dood-android-v1.1.zip` on your PC. Open the unzipped folder, select **everything inside it** (including the `app` folder and the `.github` folder) and drag it into the GitHub page. If the `.github` folder is not shown on your PC, turn on "Hidden items" in File Explorer > View.
   - If `.github` will not upload: click **Add file > Create new file**, type `.github/workflows/build-apk.yml` as the name, and paste in the contents of that file from the zip.
4. Click **Commit changes**.

### B. Updating (you already built version 1.0)
1. Open your `dood-android` repository on github.com.
2. Click **Add file > Upload files**. Drag in everything from the unzipped folder again (the `app` folder and the `.github` folder). GitHub replaces the old files with the new ones.
3. Click **Commit changes**.

### C. Then, for both
1. Click the **Actions** tab. A run called "Build DOOD APK" starts by itself (about 5 to 8 minutes). If it does not, click **Build DOOD APK** on the left, then **Run workflow**.
2. When it shows a green tick, there are two ways to get the file:
   - **Easiest on the phone:** go back to the repository's main page, click **Releases** (on the right side), open **DOOD APK (latest)** and tap **DOOD.apk**.
   - **On the PC:** click the run, scroll to **Artifacts**, download **DOOD-apk** and unzip it to get `DOOD.apk`.
3. If the run shows a red cross, click it, copy the red error text, and send it to Claude to fix.
4. If the Releases step shows an orange warning but the green tick is there, ignore it and use the Artifacts download.
   - To fix it for good: repository **Settings > Actions > General > Workflow permissions** > choose **Read and write permissions** > Save.

## Install on a phone

1. Get `DOOD.apk` onto the phone (the Releases link above, WhatsApp, e-mail or USB cable).
2. Tap it. If Android asks, allow **Install unknown apps** for the app you opened it from.
3. Updating from 1.0? Just install over it: your address and sign-in stay. New install: open **DOOD**, type your DOOD address (for example `dood.yourcompany.in`), tap **Open DOOD**, and sign in.
4. Tap **Allow** when it asks about notifications.

## Notes

- The app is signed with a key stored in this repository, so a new build installs over the old one. This is fine for your own team's phones, but it is **not** a Google Play Store key. To publish on Google Play later, create a private key and keep it secret.
- Doodu's water, walk and briefing reminders appear while DOOD is open on the screen. They are not sent when the app is closed.
- Alerts arrive within about 15 minutes (an Android rule for background checks), not instantly. Battery-saver settings on some phones (Xiaomi, Oppo, Vivo, Samsung) may delay them; allow DOOD to run in the background.
- To change the address later: if DOOD cannot connect, tap **Change the DOOD address** on the error screen.
- Developers: open in Android Studio, or run `gradle assembleRelease` (Gradle 8.9, JDK 17).
