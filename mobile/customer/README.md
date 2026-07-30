# Urban Night Lift — customer app

A native shell around `urbannighlift.com`, for the Play Store and the App Store.

## What this is, and what it deliberately isn't

The site is server-rendered on every route, so there is nothing static to bundle.
The shell therefore points at the live site. That is not a shortcut — it means
**a fix reaches the app the moment it reaches the web**, with no store review in
between. For a business trading 6 PM to 4 AM, waiting two days for Apple to
approve a bug fix is not an acceptable failure mode.

The honest trade-off: with no network there is no app. `www/index.html` is the
offline screen, bundled into the binary, that says so in both languages instead
of showing a white page.

**This is not the rider app.** Riders get `mobile/rider`, which is genuinely
native, because background location cannot be done in a WebView — and background
location is the entire reason riders need an app rather than a browser.

## Setting it up the first time

You need Node, and Android Studio for Android. iOS additionally needs a Mac with
Xcode; there is no way around that, though a cloud build service can stand in
(see `docs/MOBILE-RELEASE.md`).

```bash
cd mobile/customer
npm install
npm run add:android      # creates android/ — commit it
npm run add:ios          # macOS only; creates ios/ — commit it
npm run sync             # after any config or plugin change
npm run open:android     # opens Android Studio
```

`android/` and `ios/` are generated once and then **committed**, because you will
edit them: icons, splash art, signing config, and the notification channel all
live in there.

## Icons and splash

Source art lives in `public/icons/` in the web app. Capacitor does not generate
platform icons for you; the usual tool is `@capacitor/assets`:

```bash
npx @capacitor/assets generate --iconBackgroundColor '#0a0710' --splashBackgroundColor '#0a0710'
```

It expects `assets/icon.png` (1024×1024) and `assets/splash.png` (2732×2732).

## Push notifications

Push is the main thing this adds over the installed PWA — on iPhone especially,
where Web Push only works if the customer first did Share → Add to Home Screen,
which almost nobody does.

It needs a Firebase project, which is free:

1. Create one at console.firebase.google.com.
2. Add an Android app with package name `com.urbannightlift.customer`; download
   `google-services.json` into `android/app/`.
3. For iOS, add an iOS app, upload your APNs key from the Apple Developer
   portal, and download `GoogleService-Info.plist` into `ios/App/App/`.
4. Create a service account (Project settings → Service accounts → Generate new
   private key) and put the JSON into the server's `FCM_SERVICE_ACCOUNT`
   environment variable in Vercel. Base64-encoding it is fine and usually easier
   than pasting a multi-line private key.

Until that variable is set the server sends Web Push only and never errors —
same behaviour as before this app existed.

**Never commit `google-services.json`, the `.plist`, or the service-account JSON.**
They are already covered by `.gitignore`.

## Releasing

See `docs/MOBILE-RELEASE.md` for store accounts, signing keys, listing copy and
the submission walkthrough.
