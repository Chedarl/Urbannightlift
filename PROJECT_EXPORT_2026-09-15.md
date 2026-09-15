# Urban Night Lift - Project Export & Development Handover
**Generated:** September 15, 2026  
**Repository:** github.com/Chedarl/Urbannightlift  
**Status:** Active Development (55 days old)

---

## PROJECT OVERVIEW

### What is Urban Night Lift?
A night-only delivery service platform for Yaoundé 6, Cameroon (8:00 PM – midnight). Mobile-first progressive web app serving four user roles in a single codebase with integrated AI assistance.

### Technology Stack
- **Frontend:** Next.js (App Router), TypeScript, Tailwind CSS
- **Backend:** Next.js API Routes, Node.js
- **Database:** PostgreSQL (Supabase in production)
- **Authentication:** Supabase Auth (staff login)
- **Storage:** Supabase Storage (proof photos, screenshots)
- **AI/ML:** Moonshot Kimi (vision, text analysis), Groq Whisper (transcription), Claude (optional backend)
- **Communication:** WhatsApp via `wa.me` deep links
- **Language:** Bilingual - English (default) + French
- **Package Manager:** npm

### Language Composition
- TypeScript: 96.1%
- HTML: 2.8%
- Other: 1.1%

---

## CORE FEATURES

### 1. **Customer App**
- Place & track orders (food, medicine, groceries, urgent items, errands, merchant deliveries)
- No account required for browsing
- Live order tracking with real-time rider location
- Direct calling to rider (no number shared)
- WhatsApp integration for order updates
- Multilingual support (EN/FR)

### 2. **Dispatcher/Admin Dashboard**
- Order management (review, approve/reject, assign riders)
- Manual payment verification
- Zone and pricing management
- Merchant verification and catalog management
- Rider status and assignment
- Operating mode control (OPEN/CLOSED)
- Staff management
- AI-assisted incident resolution

### 3. **Rider App**
- Native (Expo/React Native) for Android/iOS
- Background location tracking (motorcycle delivery)
- Job assignments with OTP verification
- Photo proof of delivery
- Earnings tracking
- Background notifications

### 4. **Merchant Directory**
- Pre-verified merchant catalog
- Menu management via photo capture (AI-powered)
- Pharmacy duty roster integration
- Product availability status
- No merchant login in current MVP

---

## KEY MODULES & ARCHITECTURE

### Database Schema
```
Core Tables:
- Order, Payment, Customer, User
- Merchant, MerchantProduct
- Rider, RiderLocation, Assignment
- Zone, ServiceLocation
- PharmacyDuty, PharmacyTonight
- OperatingSettings (singleton)
- AssistantTurn, AiCall, AddressResolutionLog
- DeliveryProof, StatusHistory
- RateLimitHit, NotificationLog
```

### Critical Files
| File | Purpose |
|------|---------|
| `prisma/schema.prisma` | Complete data model & RLS policies |
| `src/lib/orders/statusMachine.ts` | 15-step order workflow state machine |
| `src/lib/orders/statusLabels.ts` | Maps detailed statuses to 9 customer-facing labels |
| `src/lib/orders/fare.ts` | Distance-based pricing engine |
| `src/lib/whatsapp/buildOrderMessage.ts` | WhatsApp order message template |
| `src/lib/i18n/legal.ts` | Bilingual legal disclaimers |
| `src/middleware.ts` | Route protection gates (/admin/**, /rider/**) |
| `src/lib/ai/assistant/` | Safe AI context & action validation |
| `src/lib/merchants/complete.ts` | Merchant data completion rules |

### Key Dependencies
- Next.js 15.5.25
- Prisma ORM
- React 19
- TypeScript
- @react-pdf/renderer (PDF generation)
- Leaflet (maps)
- Supabase client
- Moonshot Kimi API
- Groq API (audio transcription)

---

## RECENT DEVELOPMENT ACTIVITY

### Latest Version: v50 (Released Sept 15, 2026)
**Major Additions:**
- Published pricing system with distance-based rates
- Order following customer throughout app (LiveOrderStrip)
- Customer-to-rider calling framework (pure modules, no UI yet)
- Order form redesign with sticky checkout bar
- First delivery waiver system
- Tip system (100% goes to rider)
- Three-tier calling modes (REQUEST_CALLBACK/DIRECT/DISABLED)

### v49 - Order Screen Redesign
- Pinned checkout bar (price always visible)
- Left-side category rail for food menus
- Density improvements (3 items per screen vs 2)
- Guest checkout without account requirement
- Merchant-style menu layout

### v48 - Migration Safety Critical
- **Issue:** Build never applied database migrations
- **Solution:** Predeploy script with verification suite
- **Impact:** Prevents future deployment regressions

### v47 - Pricing Model Redesign
- Replaced zone-only pricing with distance-based system
- Separated errand fees from delivery fees
- Time-based late-night premium (23:00+)
- Rider floor protection (minimum 500 XAF)

### v46 - Payment Method Fixes
- Fixed Orange Money blank page bug
- Verified payment methods before order creation
- Payment now placed on checkout screen with price

### v45 - Database Security (CRITICAL FIX)
- **Issue:** RLS was OFF, entire database readable/writable by anonymous users
- **Impact:** Every customer list, rider ID card, order OTP exposed
- **Solution:** RLS enabled + grants revoked + ALTER DEFAULT PRIVILEGES set

---

## CRITICAL ISSUES FOUND & FIXED

### Security Issues
1. **Database Exposure (v40)** - CRITICAL
   - Database open to anonymous users via PostgREST
   - Every table readable/writable with anon key
   - **Fixed:** RLS enabled, grants revoked, default privileges altered

2. **API Key Exposure (v108)** - CRITICAL
   - Kimi API key leaked in error messages
   - Key stored in database logs
   - **Fixed:** Secret redaction on error ingestion and output

3. **Missing Secrets (v131)**
   - WELCOME_LINK_SECRET, RATE_LIMIT_SALT not on settings panel
   - **Fixed:** Complete audit of all secrets added to boot check

4. **Image Optimization RCE (v40)**
   - Next.js Image Optimization vulnerability with AVIF
   - **Fixed:** Disabled optimizer; all images are raw `<img>` tags

### Data Integrity Issues
1. **Payment Processing (v46)**
   - Orange Money method hardcoded despite no merchant code
   - Customer got blank payment screen
   - **Fixed:** Dynamic method configuration based on setup

2. **Receipt Display (v41)** - CRITICAL
   - French number formatting (U+202F) rendered as "/" in PDFs
   - All receipts printed "125/000 XAF" instead of "125 000 XAF"
   - **Fixed:** Custom XAF formatter with proper character encoding

3. **Customer Names in PDFs (v41)**
   - Characters like Ɛ, Ɔ, ŋ (Cameroon languages) replaced with wrong letters
   - **Fixed:** PDF-safe text filtering with proper character folding

4. **Order Pricing (v38)**
   - Two pins entered but no price computed; fell through to manual review
   - **Fixed:** Distance pricing model now mandatory when both locations set

### Feature Gaps
1. **No Order Persistence (v50)**
   - Orders didn't follow customer between screens
   - **Fixed:** LiveOrderStrip component on every page

2. **Merchant Signup Impossible (v123)**
   - Required street address (Yaoundé has none)
   - **Fixed:** Changed to landmarks + quartier OR GPS coordinates

3. **Vision Features Non-Functional (v114)** - ALL 5 FEATURES
   - Moonshot doesn't accept remote image URLs
   - All menu photo, receipt reading, business capture broken since ship
   - **Fixed:** Download images to base64 data URIs before sending

4. **Lost Draft in Order Form (v37)**
   - "Just tell us what you need" AI intake parsed but never used
   - Customer typed message, form stayed blank
   - **Fixed:** Draft prefillings added to all 6 order forms

---

## TESTING & QUALITY ASSURANCE

### Test Suite Status
- **Total Suites:** 55+
- **Pass Rate:** 100% (when properly configured)
- **Database-Required Tests:** 7
- **Pure Suites:** 48+

### Key Verification Scripts
```
verify-all.mts                 # Main test runner with proper reporting
verify-schema-shipped.ts       # Ensures all schema fields have migrations
verify-fare.ts                 # Pricing logic (30 checks)
verify-payment-methods.ts      # Payment configuration consistency
verify-i18n.ts                 # Bilingual completeness
verify-design-tokens.ts        # CSS token usage and floors
verify-calls.ts                # Calling feature safety
verify-assistant.ts            # AI context and action safety (33 checks)
verify-merchant-capture.ts     # OCR draft validation (28 checks)
verify-db-exposure.ts          # Database security checks (network calls)
```

### Quality Standards
- All new features require corresponding test suites
- No feature ships without end-to-end verification
- Database migrations verified against schema before deploy
- PDF output validated byte-by-byte
- AI outputs sanitized before display/storage

---

## DEPLOYMENT & OPERATIONS

### Deployment Platform
- **Frontend/API:** Vercel
- **Database:** Supabase (PostgreSQL)
- **Storage:** Supabase Storage
- **CI/CD:** GitHub Actions

### Pre-Deployment Checklist
```bash
npm install
npx tsc --noEmit                # TypeScript check
npm run verify                  # Run all verification suites
npx next build --no-lint        # Production build
# (migrations auto-applied by predeploy.mjs)
```

### Environment Variables Required
```
DATABASE_URL, DIRECT_URL        # Supabase PostgreSQL
NEXT_PUBLIC_SUPABASE_URL        # Supabase endpoint
NEXT_PUBLIC_SUPABASE_ANON_KEY   # Supabase anon key
SUPABASE_SECRET_KEY             # Supabase server secret
SEED_ADMIN_PASSWORD             # Initial admin seed
SEED_RIDER_PASSWORD             # Initial rider seed
KIMI_API_KEY (or MOONSHOT_API_KEY)  # Moonshot API
KIMI_REASONING_EFFORT          # "low" (default) or "high"
GROQ_API_KEY                    # Groq transcription (optional)
MAPBOX_TOKEN or MAPTILER_KEY    # Maps/geocoding
RESEND_API_KEY                  # Email delivery
RATE_LIMIT_SALT                 # Rate limiting secret
WELCOME_LINK_SECRET             # Welcome card signing
FCM_SERVICE_ACCOUNT             # Firebase (push notifications)
CALL_CHANNEL_SECRET             # WebRTC call channel (v50+)
CRON_SECRET                     # GitHub Actions cron trigger
TEST_MODE                       # true for testing, false for production
```

### Database Seeding
```bash
npx prisma db seed
# Creates:
# - OperatingSettings (mode: CLOSED)
# - Yaoundé 6 zones (GREEN, YELLOW, RED)
# - Sample verified merchants
# - Staff accounts: admin@urbannightlift.cm, rider1@urbannightlift.cm
# - Storage buckets (order-screenshots, delivery-proofs, etc.)
```

### Scheduled Jobs
- **Watchman:** Every 10 minutes during operating window (17:00-04:00 UTC)
  - Detects stalled orders, sends URGENT alerts
  - Runs via GitHub Actions (not Vercel cron)
  
- **Housekeeping:** Nightly
  - Prunes old rate limit records
  - Deletes expired assistant conversations (30-day retention)

---

## MOBILE APPS

### Customer App (Web Shell - Capacitor)
- Wraps urbannightlift.com in native shell
- Push notifications via Firebase
- No offline mode (app requires network)
- Play Store & App Store deployment ready

### Rider App (Native - Expo/React Native)
- **Why Native:** Browser cannot track location when screen is off
- **Key Feature:** Background location service with foreground notification
- **Permission:** Tracks rider only during delivery, stops when completed
- **Testing:** Must test on real device (GPS/background tasks fail in emulator)

---

## KNOWN LIMITATIONS & MVP Scope

### Out of Scope (Future Versions)
- ❌ Branded order-image generation
- ❌ Real payment gateway/webhook integration
- ❌ WhatsApp Business API (using regular wa.me)
- ❌ Native mobile app builds (using Capacitor wrapper + Expo)
- ❌ Merchant login portal (admin-managed only)
- ❌ Distance-based dynamic pricing surcharge
- ❌ Automatic payment verification (manual only)
- ❌ Embedded Unicode TrueType fonts (still using WinAnsi)

### Constraints
- Max 25,000 XAF insured per parcel (declared values allowed)
- Rider floor: 500 XAF minimum per trip (enforced by system)
- No customer PINs, SMS codes, or bank passwords ever stored
- AI never executes actions (buttons only - user must confirm)
- No stock photos or invented merchant data
- Rate limiting: 40 public AI calls/hour, 1,200 signed-in/hour

---

## CONFIGURATION & SETUP GUIDE

### Development Setup
```bash
git clone https://github.com/Chedarl/Urbannightlift.git
cd Urbannightlift
npm install

# Setup local database
createdb urbannightlift_dev
# Update DATABASE_URL in .env.local

cp .env.example .env.local
# Fill in all required variables

npx prisma migrate dev
npx prisma db seed

npm run dev
# Runs on http://localhost:3000
```

### Seeded Test Accounts
| Role | Email | Password | Notes |
|------|-------|----------|-------|
| Owner/Admin | admin@urbannightlift.cm | `SEED_ADMIN_PASSWORD` | Full permissions |
| Rider | rider1@urbannightlift.cm | `SEED_RIDER_PASSWORD` | Delivery only |
| Customer | (email-less) | None | Guest ordering |

### Admin Panel
- **URL:** /admin/settings (OWNER only)
- **Features:** Operating mode, pricing, secrets audit, AI diagnostics, merchant roster, rider management

### Pages Overview
| Path | Purpose | Auth | Notes |
|------|---------|------|-------|
| / | Home (open/closed status) | None | Shows if operating |
| /order | Order form (all 7 services) | Optional | Guest or signed-in |
| /order/new | Service picker | Optional | Pick food/medicine/etc |
| /track | Live tracking | Optional (code or session) | Guest with code or signed-in |
| /help | Customer support chat | None | AI assistant |
| /admin/** | Dispatch console | OWNER/ADMIN | All operations |
| /rider/** | Rider job screen | RIDER | Delivery tracking |

---

## HANDOVER CHECKLIST FOR IT TEAM

### ✅ Code Review
- [ ] Review all 55+ test suites for coverage gaps
- [ ] Audit AI prompts for injection vulnerabilities
- [ ] Check database RLS policies against threat model
- [ ] Verify all secrets are environment-based (no repo literals)

### ✅ Deployment
- [ ] Verify all 8 environment secrets are in Vercel
- [ ] Confirm migration deployment in predeploy.mjs runs
- [ ] Test GitHub Actions cron with CRON_SECRET
- [ ] Validate database backup strategy

### ✅ Operations
- [ ] Set up monitoring for error rates and API quotas
- [ ] Configure Sentry or equivalent for error tracking
- [ ] Document runbook for common issues
- [ ] Plan capacity for scaling (current: untested)

### ✅ Security
- [ ] Rotate all API keys (Kimi, Groq, MapTiler, Resend, etc.)
- [ ] Enable database backups with retention policy
- [ ] Review PostgREST permissions quarterly
- [ ] Audit Supabase IAM roles and policies

### ✅ Maintenance
- [ ] Update Next.js when v16 releases (currently v15.5.25)
- [ ] Monitor npm audit for new vulnerabilities
- [ ] Plan TypeScript strict mode rollout
- [ ] Archive old design/mockup files (currently in design*/ folders)

---

## CONTACT & KNOWLEDGE TRANSFER

### Original Developer
**Chedarl** - github.com/Chedarl  
- Familiar with entire codebase
- Recent work: v50 pricing/calling system
- Committed structured decisions with detailed commit messages

### Documentation
- **Commit Messages:** Each v-number commit has comprehensive notes
- **Inline Comments:** Code decisions explained at critical junctions
- **Schema:** `prisma/schema.prisma` documents columns and relationships
- **Verification:** Test suites serve as living documentation

### Getting Help
- Check test suite files (`scripts/verify-*.ts`) for intended behavior
- Search recent commits for similar problems solved
- Review `/admin/settings` diagnostics for AI/integration status

---

## NEXT STEPS FOR DEVELOPMENT TEAM

### High-Priority
1. Integrate real payment gateway (seams left in schema)
2. Complete WebRTC calling UI (backend ready in v50)
3. Add Merchant login (currently admin-only)
4. Implement WhatsApp Business API integration

### Medium-Priority
1. Build analytics dashboard for owner operations
2. Add multi-language support beyond EN/FR
3. Implement customer referral system (columns exist, UI pending)
4. Add rider incentive/bonus tracking

### Low-Priority
1. Optimize images with proper TrueType fonts (currently WinAnsi)
2. Add e-receipt with QR code
3. Build merchant marketplace feature
4. Implement surge pricing algorithm

---

## VERSION HISTORY (Last 20 Releases)

| Version | Date | Focus |
|---------|------|-------|
| v50 | 2026-09-15 | Pricing, calling framework, order persistence |
| v49 | 2026-09-15 | Order redesign, shop-like UI |
| v48 | 2026-09-14 | Migration safety |
| v47 | 2026-09-14 | Distance pricing, tracking fixes |
| v46 | 2026-09-14 | Payment method fixes |
| v45 | 2026-09-14 | Database RLS security |
| v44 | 2026-09-14 | Design tokens validation |
| v43 | 2026-09-14 | Design system implementation |
| v42 | 2026-09-14 | Next.js security update |
| v41 | 2026-09-14 | PDF rendering fixes (French, encoding) |
| v40 | 2026-09-14 | CRITICAL: DB security, image optimization removal |
| v39 | 2026-09-14 | Auto-assignment suggestion, watchman |
| v38 | 2026-09-14 | Full system audit, 7 critical bugs fixed |
| v37 | 2026-09-14 | Distance pricing, intake prefill |
| v36+ | Earlier | Foundation work |

**[View full commit history on GitHub](https://github.com/Chedarl/Urbannightlift/commits/main)**

---

## SUPPORT & TROUBLESHOOTING

### Common Issues

**"Database migration failed"**
- Ensure DATABASE_URL and DIRECT_URL are correct
- Check Supabase is running and accessible
- Verify SCHEMA hasn't been manually modified

**"Kimi key rejected"**
- Check key is set in Vercel (not GitHub Actions)
- Visit `/admin/settings` → AI panel for diagnostics
- Verify key is from correct endpoint (api.moonshot.ai vs api.moonshot.cn)

**"Vision features return empty"**
- Ensure MOONSHOT_API_KEY or KIMI_API_KEY is configured
- Check image is valid PNG/JPEG (< 2000px, < 10MB)
- Verify bucket is on allow-list (merchant-captures, order-screenshots, etc.)

**"Tracking map shows no destination"**
- Delivery address may not have geocoded
- System falls back to zone center (dashed circle)
- Confirm customer entered valid landmark or GPS coordinates

---

**Document Generated:** September 15, 2026  
**Next Review:** Recommended before next major release  
**Status:** Ready for team handover
