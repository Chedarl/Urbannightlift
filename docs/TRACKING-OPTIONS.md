# Real-time tracking options for Urban Night Lift (Cameroon)

This note answers the owner's question: *"Is there a paid software or GPS device we can
integrate in Cameroon to track the parcel or the driver in real time?"* It also explains
what the app does today so you can decide when (and whether) to pay for more.

## What the app does today — phone GPS, **₣0/month**
Every rider already carries a smartphone. When a rider opens their order and taps
**"Share my live location"**, the phone's GPS streams their position to the order, and the
customer's tracking page shows a moving marker with an "updated N ago" label. Tiles come
from a free map service; there is no monthly cost and nothing to install on the bikes.

This is now the recommended default. The v8 changes made it reliable:
- the customer map no longer shows a blank box — it says *"waiting for the rider to start
  sharing"* until the rider is live;
- the rider gets clear feedback (permission blocked, needs https, timeout, send failed) and
  the share **auto-resumes** if they leave and reopen the order;
- dispatch can see the rider's last-known position in the admin order view.

**Limitation:** it only works while the rider has the order open and sharing turned on, and
it can't help if a phone is off or stolen. That's what the paid options below solve.

## When to consider paid GPS — and the best fit for Cameroon

### Option A (recommended next step): hardware GPS trackers on the motorbikes + Traccar
A small GSM/GPS tracker wired to each bike reports its position continuously — even when the
phone is off — and doubles as **anti-theft / recovery**.
- **Devices:** Concox / GT06-class trackers are widely available in Cameroon, roughly
  **15,000–40,000 XAF per unit**, each needing a cheap data SIM (MTN/Orange).
- **Software:** **Traccar** is a free, open-source tracking server that supports these
  devices out of the box and gives you a live fleet map. Self-host it cheaply (a small VPS)
  for near-zero software cost, or use Traccar's hosted plan.
- **Why this fits:** low per-bike cost, works without the rider doing anything, and protects
  the bikes themselves — the biggest real-world risk for a night delivery fleet.

### Option B: turnkey local installer (fully paid, with support in Cameroon)
If you'd rather not self-host, a local vendor installs the units and gives you a ready web +
mobile dashboard.
- **E-Tech Electronixs & Accessories** (Douala/Yaoundé) advertises GPS tracking installation
  for vehicles and bikes with real-time location, covering Cameroon. A local installer means
  on-the-ground support, SIM handling, and no server to maintain — you pay per device +
  a monthly subscription.

### Option C: global fleet SaaS (Samsara, One Step GPS, Matrack, etc.)
Enterprise-grade dashboards, but priced and supported for larger fleets and heavier vehicles.
**Overkill and hard to support locally at launch** — revisit only if you scale to a big fleet.

## Recommendation
1. **Now:** stay on the fixed phone-GPS tracking (Option "today") — ₣0 and already live.
2. **As you grow / if theft is a concern:** add **Concox + Traccar** (Option A) on the bikes
   for always-on tracking and recovery, or hand it to a **local installer** (Option B) if you
   prefer paid support over self-hosting.
3. **Skip** global SaaS (Option C) until the fleet is large enough to justify it.

The app keeps the customer-facing tracking map the same in every case — a hardware tracker
would simply feed the rider position more reliably; no rebuild of the customer experience is
needed.
