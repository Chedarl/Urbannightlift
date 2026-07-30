# Getting the apps into the stores

Two apps, two stores, four listings. This is the order to do it in and the
things that will actually trip you up.

**Do Android first, all the way through, before touching Apple.** It costs $25
once instead of $99 a year, it needs no Mac, review takes hours rather than
days, and every mistake you make will be cheaper to fix. By the time you get to
Apple you will have written the listing copy and taken the screenshots already.

---

## What it costs

| | One-off | Yearly | Needs a Mac |
|---|---|---|---|
| Google Play | **$25** | — | No |
| Apple Developer | — | **$99** | Yes, or a cloud build |
| Firebase (push) | Free | Free | No |

The $25 covers your whole account, not per app, so both apps ship under it.
Apple's $99 is the same.

---

## Part 1 — Android

### 1. The developer account

Sign up at `play.google.com/console` with a Google account you will still
control in five years. **Not** a personal address you might lose.

Google now requires identity verification, and for a business account, a D-U-N-S
number. Individual accounts are simpler and are fine to start with — but note
that a new individual account must run a **closed test with 12 testers for 14
days** before it can go public. Start that clock early; it is the longest pole in
the whole process and it catches everyone out.

### 2. Signing keys

```bash
keytool -genkey -v -keystore unl-upload.jks -keyalg RSA \
  -keysize 2048 -validity 10000 -alias unl
```

**Back this file and its password up somewhere you will not lose them.** If you
lose the upload key you can ask Google to reset it; if you opt out of Play App
Signing and lose *that* key, you can never update the app again and must publish
a new listing under a new package name. Use Play App Signing — it is the default
and it exists precisely so this mistake is recoverable.

Keystores are gitignored in both app folders. Keep them in a password manager,
not the repo.

### 3. Building

Customer app:
```bash
cd mobile/customer
npm install && npm run add:android && npm run sync
npm run open:android          # Build > Generate Signed Bundle
```

Rider app:
```bash
cd mobile/rider
npm install
npx eas build --platform android --profile production
```

EAS builds in the cloud, so the rider app needs no local Android SDK. It is free
for a handful of builds a month, which is more than enough here.

### 4. The background-location review

**This is the only genuinely hard part of the Android submission, and it applies
to the rider app only.** Google reviews every app requesting
`ACCESS_BACKGROUND_LOCATION` by hand and rejects most of them.

They want three things:

1. **A prominent in-app disclosure** shown *before* the permission prompt,
   explaining what you collect and why. The app already does this — the two-step
   permission flow with the explanation is not decoration, it is the compliance
   requirement.
2. **A short video** showing the disclosure and the prompt as a user sees them.
   Screen-record it on a real phone; thirty seconds is plenty.
3. **A written justification.** Yours is straightforward and true:

   > Urban Night Lift is a night-time delivery service. The rider app shares the
   > rider's location with the customer waiting for that specific delivery, so
   > they can see it approaching on a live map. Riders keep the phone in a pocket
   > while riding a motorbike, so foreground-only location would stop updating
   > the moment the delivery began. Sharing starts when the rider accepts a
   > delivery and stops automatically when it is completed.

   That last sentence matters. Say it because it is true, and it is what
   separates this from the apps they reject.

Also required: a **privacy policy URL** (`https://urbannighlift.com/privacy`)
and an accurate **Data safety** form. Declare precise location, that it is
shared with the customer for the delivery, and that it is not sold. Do not
under-declare — a mismatch found later is far worse than a slow first review.

---

## Part 2 — iOS

Only start this once Android is live and you have seen real installs.

### 1. The account

`developer.apple.com/programs` — $99/year. An **Organization** account needs a
D-U-N-S number and takes days to a couple of weeks to verify; an **Individual**
account is immediate but publishes under your personal name. For a real business
the organization account is worth the wait.

### 2. Building without a Mac

You genuinely cannot sign an iOS build without macOS somewhere. Options, cheapest
first:

- **EAS Build** (`eas build --platform ios`). Builds and signs in the cloud and
  handles certificates for you. The free tier is slow but works; ~$29/month if
  you need speed. This is the practical answer, and it works for the Capacitor
  app too via a custom build config.
- A borrowed Mac for a couple of hours.
- A rented cloud Mac (MacStadium and similar), around $30/month.

### 3. What Apple will push back on

**The customer app is a web view.** Guideline 4.2 rejects apps that are only a
website in a frame. Do not pretend otherwise — lead with what the app adds, in
the review notes:

> The app delivers order notifications through APNs. On the mobile web these are
> unavailable to our customers unless they first add the site to their Home
> Screen, which almost none do — so an iPhone customer currently cannot be told
> their delivery has arrived. The app also provides offline handling and native
> ordering flows.

If it is rejected anyway, the fastest route is to make the customer app do one
genuinely native thing it cannot do on the web — the camera for payment proof is
the obvious candidate — and resubmit. **The rider app will not have this
problem**; background location is unambiguously native.

**Background location** needs `UIBackgroundModes: location` (already set) and a
clear purpose string (already written). Apple reads these strings; ours says
what actually happens.

**Sign in with Apple** is required if you offer other third-party sign-in. We
don't — riders use email and password, customers use a phone number and PIN — so
this does not apply. Keep it that way unless you add Google sign-in, at which
point it becomes mandatory.

---

## Part 3 — Push (both platforms, both apps)

Free, and the main reason the customer app exists.

1. `console.firebase.google.com` → new project.
2. Add an Android app per package: `com.urbannightlift.customer` and
   `com.urbannightlift.rider`. Download each `google-services.json` into the
   matching `android/app/`.
3. For iOS: add iOS apps, create an **APNs key** (`.p8`) in the Apple Developer
   portal under Keys, and upload it to Firebase. One key covers both apps.
4. Project settings → Service accounts → **Generate new private key**. Put that
   JSON into `FCM_SERVICE_ACCOUNT` in Vercel. Base64-encoding it first is
   usually easier than getting a multi-line private key through the environment
   editor intact.

Until step 4, the server sends Web Push only and never errors.

**None of these files go in the repo.** They are already gitignored. The service
account in particular can send a notification to every device we know about.

---

## Part 4 — The listings

Write these once and reuse them across all four.

**Customer app — short description**
> Night delivery across Yaoundé. Food, pharmacy and parcels, 6 PM to 4 AM.

**Customer app — full description**
> Urban Night Lift delivers across Yaoundé when everything else is closed —
> from 6 PM to 4 AM, every night.
>
> Order food from a restaurant, medicine from a pharmacy, or send a parcel
> across town. Watch your rider approach on a live map. Pay with MTN MoMo,
> Orange Money or cash at the door.
>
> • You see the price before you order, not after.
> • On food and pharmacy runs you set the most we may spend, and we charge you
>   what the shop charged — our earning is the delivery fee, never a markup.
> • A code at the door proves your order reached you.
> • Share your delivery with someone so a friend can watch you get home safely.

**Rider app — short description**
> For Urban Night Lift riders. Tonight's jobs, your earnings, your route.

Rider app listings should say plainly that it is **not for customers** — it
saves you support messages from people who installed the wrong one.

**Screenshots.** Both stores want a handful per device size. Take them on a real
phone with real-looking data — never lorem ipsum, and never a customer's actual
name or number. The order flow, the tracking map with a rider on it, and the
receipt are the three that sell it.

---

## Part 5 — After it is live

- **Version bumps.** Android needs `versionCode` to increase on every upload,
  even for a resubmission. Forgetting this is the single most common upload
  rejection.
- **The customer app updates itself.** It loads the live site, so most fixes
  reach it without a store release at all. Only shell changes — plugins,
  permissions, icons — need a new build.
- **The rider app does not.** It is real native code, so every change is a build
  and a release. Keep it small and change it rarely; that is part of why it only
  does the four things it does.
- **Watch the first week of reviews.** In this market, a one-star review saying
  "asks for location all the time" is answered by explaining what the customer
  sees. Answer it publicly; other people read the reply.
