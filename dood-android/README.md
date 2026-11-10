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

## What is new in version 1.3 (blue look, native chat, more phone helpers; no server change)
Nothing from 1.2 was removed. Your DOOD server is not touched.

1. **Blue look.** A blue top bar, rounded cards, soft shadows and a smooth fade when pages change. The blue is applied by the app on top of DOOD, so DOOD's own pages look the same, only bluer.
2. **New bottom bar:** Home, Tasks, Chats, Reviews, More. The blue line slides under the page you are on. The round **+** button adds a task (press and hold it to speak a task). The little tab on the left edge still gives all the phone tools.
3. **Chats (native).** Opens like a chat app: list of chats with unread counts and search, pencil button to start a chat or a group, bubbles, day labels, new messages appear on their own every few seconds while the screen is open. Press and hold a message: *Make a task*, *Mark as a decision*, *Copy*. Uses the chat DOOD already has.
4. **Due-date reminders** (GST, TDS, PF/ESI, advance tax, TDS return, tax audit, ITR, GSTR-9): little tab > *Due-date reminders*. Alerts come 3 days before, 1 day before and on the day. Switch off any you do not need. Dates are the usual ones; the government sometimes extends them, so check the portal.
5. **Call or message someone:** little tab > *Call or message someone* > pick the person on a task, or search people. Then Call, WhatsApp or E-mail.
6. **Scan a document to PDF:** little tab > *Scan a document to PDF*. Take one or more photos, name the PDF, pick the task, and it is attached to that task. (If the upload fails, it offers to share the PDF.) The phone's camera app takes the photo, then the app cleans it to a high-contrast page.
7. **Missed-call follow-up** (optional): Phone settings > *Offer a follow-up after a missed call*. Needs the call-list permission. A missed or unanswered call gives an alert; tap it and DOOD's new-task box opens with "Call back ...".
8. **Meeting nudge** (optional): Phone settings > *Nudge me 10 minutes before a meeting*. Needs the calendar permission. Reads the calendar on the phone only.
9. **End-of-day wrap-up:** at the time you choose (default 6 pm, weekdays) it says how many are still due today and how many are overdue.
10. New blue welcome, lock, offline page and home-screen widget.

Limits: chat and the alerts are not instant when the app is closed (about every 15 minutes) until the push service is added on the server after your trial. The scanner uses the phone's own camera, so it does not draw page edges.

## Earlier: version 1.2 (phone only, no server change)
Everything here lives in the app on the phone. Your DOOD server is not touched, so you can use it during the trial.

1. **The small tab on the left edge of the screen** (a slim teal bar with three dots, halfway down). Tap it for: *Speak a new task*, *Phone reminders, quiet hours and lock*, *Reload DOOD*, *Change the DOOD address*.
2. **Doodu reminders on the phone.** Water, walk and a morning briefing ("3 overdue, 2 due today") arrive as phone alerts at the times you choose, even when DOOD is closed. They are off until you switch them on: small tab > Phone reminders > *Remind me on this phone*.
3. **Speak a new task.** Tap the small tab > *Speak a new task*, say it, and DOOD's new-task box opens with your words in it. You press Save. (This uses DOOD's normal "Ask AI" box, so it needs your AI key on the server.)
4. **Share to DOOD.** In WhatsApp, e-mail, Chrome or any app: Share > DOOD. The text opens in DOOD's new-task box. (Text only; sharing pictures or files is not in this version.)
5. **Long-press the DOOD icon** on the home screen for shortcuts: New task, Reviews, Calendar, Phone settings.
6. **Home-screen widget.** Long-press the home screen > Widgets > DOOD. It shows how many tasks are overdue and due today, refreshed about every 15 to 30 minutes. Tap it to open DOOD.
7. **Lock.** Small tab > Phone reminders... > *Lock DOOD*. The app then asks for your fingerprint, face, PIN or pattern when you open it (after 30 seconds away). The phone must already have a screen lock.
8. **Quiet hours.** No DOOD alerts and no reminders between the times you choose (for example 10 pm to 7 am). Alerts that came in during quiet hours appear afterwards.
9. **No internet.** A clearer "You seem to be offline" page, and DOOD opens again by itself when the connection returns.

Not in this version (needs the server): instant push alerts when the app is closed (alerts still arrive about every 15 minutes), and Doodu reminders that follow the settings you saved in the web app.

If reminders do not arrive on a phone from Xiaomi, Oppo, Vivo, Realme or Samsung: open the phone's Settings > Apps > DOOD > Battery and choose **Unrestricted** (or "Allow background activity").

## Earlier: version 1.1
- The **Email** buttons in DOOD (reminders, follow-ups, AI drafts) open your phone's e-mail app with the person, subject and message already filled.
- **WhatsApp** buttons open WhatsApp with the message typed. You only press Send.
- **Google Calendar sign-in** opens in the phone's browser, because Google does not allow sign-in inside an app window. After you allow it, come back to DOOD.
- A permanent **download link** on the repository's **Releases** page.

## Build the APK on GitHub (no programming tools needed)

### A. First time (new repository)
1. Sign in at github.com and click **New repository**. Name it `dood-android`, choose **Private**, click **Create repository**.
2. On the new repository page click **uploading an existing file**.
3. Unzip `dood-android-v1.2.zip` on your PC. Open the unzipped folder, select **everything inside it** (including the `app` folder and the `.github` folder) and drag it into the GitHub page. If the `.github` folder is not shown on your PC, turn on "Hidden items" in File Explorer > View.
   - If `.github` will not upload: click **Add file > Create new file**, type `.github/workflows/build-apk.yml` as the name, and paste in the contents of that file from the zip.
4. Click **Commit changes**.

### B. Updating (you already built an earlier version)
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
3. Updating from an earlier version? Just install over it: your address and sign-in stay. New install: open **DOOD**, type your DOOD address (for example `dood.yourcompany.in`), tap **Open DOOD**, and sign in.
4. Tap **Allow** when it asks about notifications.

## Notes

- The app is signed with a key stored in this repository, so a new build installs over the old one. This is fine for your own team's phones, but it is **not** a Google Play Store key. To publish on Google Play later, create a private key and keep it secret.
- The phone reminders (1.2) work even when DOOD is closed. The web app's own Doodu reminders still appear only while DOOD is open on the screen.
- Alerts arrive within about 15 minutes (an Android rule for background checks), not instantly. Battery-saver settings on some phones (Xiaomi, Oppo, Vivo, Samsung) may delay them; allow DOOD to run in the background.
- To change the address later: if DOOD cannot connect, tap **Change the DOOD address** on the error screen.
- Developers: open in Android Studio, or run `gradle assembleRelease` (Gradle 8.9, JDK 17).
