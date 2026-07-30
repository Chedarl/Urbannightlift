# Urban Night Lift — rider app

Native, Expo/React Native, Android and iOS.

## Why this one is native when the customer app is not

The customer app is a shell around the website, and that is the right call for
it. This one is not, for a single reason: **a browser cannot track a rider whose
phone is in their pocket.**

A web page's `watchPosition` is suspended when the screen sleeps or the tab is
backgrounded. That is a platform rule, not a bug we failed to fix — and it fires
at exactly the moment a rider starts riding. Every complaint about the live map
freezing traces back to it. A registered background task with an Android
foreground service keeps reporting with the screen off and the app closed, and
nothing available to a website does.

Everything else here follows from that. Since the app exists anyway, it also
gets reliable job alerts, the camera for receipts and proof, and a job screen
that works on one hand at a junction.

## What it talks to

Nothing new. It calls the same endpoints the website calls
(`/api/rider/me`, `/api/rider/jobs`, `/api/orders/[id]/status`, `/proof`,
`/goods`, `/location`), authenticated with the rider's **existing Supabase
account** as a bearer token. There is deliberately no mobile-only API and no
mobile-only identity: suspending a rider in the admin console has to take their
access away everywhere at once.

## Setting it up

```bash
cd mobile/rider
npm install
cp .env.example .env      # fill in the two Supabase values
npx expo run:android      # a real device — the emulator has no useful GPS
```

`EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` are the same
values the website uses. The anon key is public by design; the secret key must
never appear in this app.

## Testing the part that matters

Everything else can be checked at a desk. This cannot:

1. Sign in on a real Android phone and accept a job.
2. Confirm the permanent "delivery in progress" notification appears.
3. **Lock the screen and put the phone in your pocket.**
4. Ride, or walk, for ten minutes.
5. On another device, watch the customer tracking page. The marker must keep
   moving the whole time.
6. Walk through somewhere with no signal, then come back. The queued positions
   must arrive in one batch and the marker must catch up.
7. Mark the order delivered. The notification must disappear **by itself**, and
   the marker must stop.

Step 7 is not optional. Tracking somebody after their shift is a betrayal of the
permission they gave.

## Store notes

Both stores treat background location as sensitive and will ask what you use it
for. The answer is straightforward and true: *the customer is watching a live
map of their delivery arriving, and the rider's phone is in their pocket while
they ride.* Google requires a short video of the in-app disclosure and the
permission prompt. `docs/MOBILE-RELEASE.md` covers the rest.
