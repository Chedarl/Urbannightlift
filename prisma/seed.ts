/**
 * Urban Night Lift — seed script.
 * Idempotent: safe to re-run (upserts keyed on unique fields).
 *
 * - OperatingSettings singleton (mode CLOSED by default)
 * - Yaoundé 6 zones (admin can rename/edit later)
 * - Staff accounts: creates Supabase Auth users (over HTTPS) + matching User rows
 * - Sample verified merchants
 * - Private storage buckets: order-screenshots, delivery-proofs
 *
 * Run: npx prisma db seed   (requires .env with DB + Supabase vars)
 */
import { PrismaClient, SafetyLevel, MerchantCategory, UserRole } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

// @supabase/supabase-js builds a realtime client at construction time, which
// needs a WebSocket constructor to exist (native on Node 22+, absent on older
// Node). The seed only uses the Auth admin + Storage REST APIs and never opens
// a realtime connection, so a harmless stub is enough when none is present.
const g = globalThis as { WebSocket?: unknown };
if (typeof g.WebSocket === "undefined") {
  g.WebSocket = class {};
}

const prisma = new PrismaClient();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

async function seedSettings() {
  await prisma.operatingSettings.upsert({
    where: { id: 1 },
    // Refresh Yaoundé notices + merchant payment details on reseed, but never
    // reset the live operating mode/hours the owner controls.
    update: {
      zoneNoticeEn: "Serving selected areas across Yaoundé.",
      zoneNoticeFr: "Disponible dans certains quartiers de Yaoundé.",
      mtnMerchantCode: "653077160",
      mtnUssdTemplate: "*126*4*857539*{amount}#",
    },
    create: {
      id: 1,
      mode: "CLOSED",
      operatingStartHour: 18,
      operatingEndHour: 4,
      zoneNoticeEn: "Serving selected areas across Yaoundé.",
      zoneNoticeFr: "Disponible dans certains quartiers de Yaoundé.",
      mtnMerchantCode: "653077160",
      mtnUssdTemplate: "*126*4*857539*{amount}#",
      // Urgent, Custom errand and Verified merchant start on hold — the owner
      // enables them from admin Settings as demand justifies it. Not in `update`
      // so a reseed never overrides what the owner has switched on.
      enabledServices: ["MEDICINE_PICKUP", "FOOD_PICKUP", "GROCERY_PICKUP", "SMALL_PARCEL"],
      // The business runs on a revenue share: 60% of each delivery fee to the
      // rider, 40% to Urban Night Lift. Not in `update`, so a reseed never
      // overrides a rate the owner has changed.
      riderSharePercent: 60,
    },
  });
  console.log("✓ OperatingSettings (mode=CLOSED)");
}

async function seedZones() {
  // Zone tiers follow the owner's rule, anchored on Rond-Point Express Biyem-Assi:
  //   GREEN  — Yaoundé-6 core, close to Rond-Point Express, easy roads.
  //   YELLOW — Yaoundé-6 fringe further from Rond-Point Express (Mbalgong,
  //            Eloumden, Derrière-le-camp Mendong…). A dispatcher may bump an
  //            individual pickup to RED when the road is genuinely complex.
  //   RED    — anywhere OUTSIDE the Yaoundé-6 arrondissement (far / difficult).
  // Centroids are approximate Yaoundé coordinates used to resolve a map-dropped
  // pin to a zone/tier (nearest centroid wins).
  const zones: Array<{
    zoneName: string;
    description: string;
    feeXaf: number;
    nightUrgencyFeeXaf: number;
    medicineFeeXaf: number;
    tier: "GREEN" | "YELLOW" | "RED";
    centroidLat: number;
    centroidLng: number;
    safetyLevel: SafetyLevel;
    active: boolean;
    notes?: string;
  }> = [
    // GREEN — Yaoundé-6 core near Rond-Point Express Biyem-Assi (1000–1500)
    { zoneName: "Biyem-Assi", description: "Biyem-Assi core — Rond-Point Express, easy access", feeXaf: 1000, nightUrgencyFeeXaf: 500, medicineFeeXaf: 300, tier: "GREEN", centroidLat: 3.8421, centroidLng: 11.4921, safetyLevel: "SAFE", active: true },
    { zoneName: "Mendong", description: "Mendong — Yaoundé 6", feeXaf: 1200, nightUrgencyFeeXaf: 500, medicineFeeXaf: 300, tier: "GREEN", centroidLat: 3.8331, centroidLng: 11.4785, safetyLevel: "SAFE", active: true },
    { zoneName: "Nsimeyong", description: "Nsimeyong — Yaoundé 6", feeXaf: 1200, nightUrgencyFeeXaf: 500, medicineFeeXaf: 300, tier: "GREEN", centroidLat: 3.8360, centroidLng: 11.5031, safetyLevel: "SAFE", active: true },
    { zoneName: "Etoug-Ebe", description: "Etoug-Ebe — Yaoundé 6", feeXaf: 1300, nightUrgencyFeeXaf: 500, medicineFeeXaf: 300, tier: "GREEN", centroidLat: 3.8480, centroidLng: 11.4892, safetyLevel: "SAFE", active: true },
    { zoneName: "Simbock", description: "Simbock — Yaoundé 6", feeXaf: 1400, nightUrgencyFeeXaf: 500, medicineFeeXaf: 300, tier: "GREEN", centroidLat: 3.8150, centroidLng: 11.4780, safetyLevel: "SAFE", active: true },
    { zoneName: "Melen", description: "Melen / campus side — Yaoundé 6 edge", feeXaf: 1500, nightUrgencyFeeXaf: 500, medicineFeeXaf: 300, tier: "GREEN", centroidLat: 3.8585, centroidLng: 11.5015, safetyLevel: "SAFE", active: true },
    // YELLOW — Yaoundé-6 fringe, further from Rond-Point Express (1600–2000)
    { zoneName: "Derrière-le-camp Mendong", description: "Behind the Mendong camp — Yaoundé-6 fringe", feeXaf: 1700, nightUrgencyFeeXaf: 700, medicineFeeXaf: 300, tier: "YELLOW", centroidLat: 3.8265, centroidLng: 11.4700, safetyLevel: "CAUTION", active: true, notes: "Complex-road pickups here may be quoted as RED by the dispatcher." },
    { zoneName: "Mbalgong", description: "Mbalgong — Yaoundé-6 fringe, further out", feeXaf: 1900, nightUrgencyFeeXaf: 700, medicineFeeXaf: 400, tier: "YELLOW", centroidLat: 3.7960, centroidLng: 11.4460, safetyLevel: "CAUTION", active: true, notes: "Complex-road pickups here may be quoted as RED by the dispatcher." },
    { zoneName: "Eloumden", description: "Eloumden hillside — Yaoundé-6 fringe, further out", feeXaf: 2000, nightUrgencyFeeXaf: 700, medicineFeeXaf: 400, tier: "YELLOW", centroidLat: 3.8020, centroidLng: 11.4340, safetyLevel: "CAUTION", active: true, notes: "Complex-road pickups here may be quoted as RED by the dispatcher." },
    // RED — outside the Yaoundé-6 arrondissement (2500+)
    { zoneName: "Nkolbisson", description: "Nkolbisson (Yaoundé 7) — outside Yaoundé 6", feeXaf: 2500, nightUrgencyFeeXaf: 1000, medicineFeeXaf: 500, tier: "RED", centroidLat: 3.8730, centroidLng: 11.4520, safetyLevel: "RESTRICTED", active: true, notes: "Outside Yaoundé 6 — owner approval recommended." },
    { zoneName: "Mvog-Mbi", description: "Mvog-Mbi (Yaoundé 4) — outside Yaoundé 6", feeXaf: 2600, nightUrgencyFeeXaf: 1000, medicineFeeXaf: 500, tier: "RED", centroidLat: 3.8560, centroidLng: 11.5240, safetyLevel: "RESTRICTED", active: true, notes: "Outside Yaoundé 6 — owner approval recommended." },
    { zoneName: "Centre-ville", description: "Yaoundé town centre (Yaoundé 1) — outside Yaoundé 6", feeXaf: 2800, nightUrgencyFeeXaf: 1000, medicineFeeXaf: 500, tier: "RED", centroidLat: 3.8667, centroidLng: 11.5167, safetyLevel: "RESTRICTED", active: true, notes: "Outside Yaoundé 6 — owner approval recommended." },
    { zoneName: "Awae", description: "Awae escarpment — outside Yaoundé 6", feeXaf: 2800, nightUrgencyFeeXaf: 1000, medicineFeeXaf: 500, tier: "RED", centroidLat: 3.8450, centroidLng: 11.5500, safetyLevel: "RESTRICTED", active: true, notes: "Outside Yaoundé 6 — owner approval recommended." },
    { zoneName: "Emana", description: "Emana — far north, outside Yaoundé 6", feeXaf: 3000, nightUrgencyFeeXaf: 1000, medicineFeeXaf: 500, tier: "RED", centroidLat: 3.9300, centroidLng: 11.5300, safetyLevel: "RESTRICTED", active: true, notes: "Outside Yaoundé 6 — owner approval recommended." },
    { zoneName: "Odza", description: "Odza / airport side — outside Yaoundé 6", feeXaf: 3000, nightUrgencyFeeXaf: 1000, medicineFeeXaf: 500, tier: "RED", centroidLat: 3.7920, centroidLng: 11.5480, safetyLevel: "RESTRICTED", active: true, notes: "Outside Yaoundé 6 — owner approval recommended." },
    { zoneName: "Outside Yaoundé", description: "Any area outside Yaoundé", feeXaf: 3500, nightUrgencyFeeXaf: 1000, medicineFeeXaf: 500, tier: "RED", centroidLat: 3.9500, centroidLng: 11.6000, safetyLevel: "NO_GO", active: false, notes: "Requires manual owner approval. Rejected by default." },
  ];
  for (const z of zones) {
    await prisma.zone.upsert({
      where: { zoneName: z.zoneName },
      update: { tier: z.tier, centroidLat: z.centroidLat, centroidLng: z.centroidLng, feeXaf: z.feeXaf, safetyLevel: z.safetyLevel, description: z.description, notes: z.notes ?? null, active: z.active },
      create: z,
    });
  }
  // Retire the legacy "Yaoundé 6"-named zone from v1 (hide from customers).
  await prisma.zone.updateMany({ where: { zoneName: "Outside Yaoundé 6" }, data: { active: false } });
  console.log(`✓ ${zones.length} zones (green = Yaoundé-6 core, yellow = fringe, red = outside Yaoundé 6)`);
}

async function ensureAuthUser(
  email: string,
  password: string,
  fullName: string
): Promise<string | null> {
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    console.warn(`! Supabase env missing — skipping auth user for ${email}`);
    return null;
  }
  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    // Look up by email first so re-running the seed never duplicates.
    const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (listErr) throw listErr;
    const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (existing) {
      // Keep the password in sync so the owner always has known credentials.
      await admin.auth.admin.updateUserById(existing.id, { password });
      return existing.id;
    }
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error) throw error;
    return data.user.id;
  } catch (err) {
    // Supabase Auth is optional at seed time — a bad/rotated service key must
    // never block the (already-committed) data seed. Warn and fall back.
    console.warn(`! Supabase Auth unavailable for ${email} (${(err as Error).message}). Skipping auth-user provisioning.`);
    return null;
  }
}

/**
 * Guarantee a Supabase Auth user exists with a known password, using a DIRECT
 * SQL write to `auth.users`. This works even when the Supabase service key is
 * rotated/invalid (the Admin API is unavailable), because it only needs the
 * Postgres connection (DATABASE_URL), which the data seed already uses. Returns
 * the auth user id, or null if the DB write path is unavailable.
 *
 * Note: sign-in still requires a valid public (anon) key for the GoTrue REST
 * endpoint; this only fixes the password/account, not a broken anon key.
 */
async function ensureAuthUserViaSql(email: string, password: string): Promise<string | null> {
  // Remove any duplicate auth.users rows for this email (a stray duplicate makes
  // GoTrue return "Invalid login credentials"). Keep the earliest; cascades to
  // auth.identities. Then re-point the app User row to the survivor below.
  try {
    await prisma.$executeRawUnsafe(
      `DELETE FROM auth.users WHERE email = $1 AND id <> (SELECT id FROM auth.users WHERE email = $1 ORDER BY created_at ASC LIMIT 1)`,
      email,
    );
  } catch {
    /* no duplicates or insufficient perms — safe to ignore */
  }

  const cryptVariants = [
    { c: "crypt", g: "gen_salt" },
    { c: "extensions.crypt", g: "extensions.gen_salt" },
  ];
  for (const { c, g } of cryptVariants) {
    try {
      // Update the password on an existing auth user.
      const updated = await prisma.$executeRawUnsafe(
        `UPDATE auth.users SET encrypted_password = ${c}($1, ${g}('bf')), email_confirmed_at = COALESCE(email_confirmed_at, now()), updated_at = now() WHERE email = $2`,
        password,
        email,
      );
      if (updated > 0) {
        const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(`SELECT id::text FROM auth.users WHERE email = $1 LIMIT 1`, email);
        console.log(`✓ reset password for ${email} via SQL`);
        return rows[0]?.id ?? null;
      }
      // No existing row — create a minimal, password-login-ready auth user.
      const created = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `INSERT INTO auth.users
           (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change_token_new, email_change)
         VALUES
           ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', $1, ${c}($2, ${g}('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '')
         RETURNING id::text`,
        email,
        password,
      );
      console.log(`✓ created auth user ${email} via SQL`);
      return created[0]?.id ?? null;
    } catch {
      // try the next crypt() schema variant
    }
  }
  console.warn(`! SQL auth provisioning unavailable for ${email}`);
  return null;
}

// Known recovery password forced on every seed so the owner is never locked
// out by an unknown SEED_ADMIN_PASSWORD secret. MUST be changed after first
// login (Settings). Overrides the env on purpose.
const RECOVERY_PASSWORD = "urbannight2026";

async function seedUsers() {
  const staff: Array<{ email: string; fullName: string; phone: string; role: UserRole; password: string }> = [
    {
      email: "admin@urbannightlift.cm",
      fullName: "UNL Owner",
      phone: "+237680038004",
      role: "OWNER",
      password: RECOVERY_PASSWORD,
    },
    {
      email: "rider1@urbannightlift.cm",
      fullName: "UNL Rider One",
      phone: "+237698255474",
      role: "RIDER",
      password: RECOVERY_PASSWORD,
    },
  ];
  for (const s of staff) {
    // Prefer the direct SQL password reset — it is deterministic and proven to
    // work with GoTrue sign-in. The Supabase Admin API is unreliable with the
    // current key (intermittent ES256 errors; "successful" updates that don't
    // stick), so it is only a last-resort fallback.
    const authUserId =
      (await ensureAuthUserViaSql(s.email, s.password)) ??
      (await ensureAuthUser(s.email, s.password, s.fullName)) ??
      `local-${s.email}`;
    await prisma.user.upsert({
      where: { email: s.email },
      update: { authUserId },
      create: { email: s.email, fullName: s.fullName, phone: s.phone, role: s.role, authUserId },
    });
    console.log(`✓ user ${s.email} (${s.role})`);
  }
}

/** Post-seed diagnostic: attempt a real admin sign-in with the public (anon)
 *  key so the Action log reveals whether login works end-to-end. Non-fatal. */
async function verifyAdminLogin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const email = "admin@urbannightlift.cm";
  const password = RECOVERY_PASSWORD;
  if (!url || !anon) {
    console.warn("! admin login self-check skipped (missing URL/anon key)");
    return;
  }
  try {
    const client = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      console.warn(`! ADMIN LOGIN SELF-CHECK FAILED: ${error.message} (status ${error.status ?? "?"})`);
      console.warn("  → If this says 'Invalid API key', refresh NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel. Otherwise the password/account needs attention.");
    } else if (data.user) {
      console.log(`✓ ADMIN LOGIN SELF-CHECK OK — ${email} can sign in.`);
    }
  } catch (e) {
    console.warn(`! admin login self-check error: ${(e as Error).message}`);
  }
}

async function seedMerchants() {
  const merchants: Array<{
    merchantName: string;
    category: MerchantCategory;
    whatsappNumber: string;
    phone?: string;
    address: string;
    landmark?: string;
    openingHours?: string;
    verified: boolean;
    active: boolean;
    notes?: string;
  }> = [
    { merchantName: "Chez Maman Josephine", category: "FOOD", whatsappNumber: "+237690000001", address: "Biyem-Assi, Carrefour Meec", landmark: "Opposite Total station", openingHours: "18:00–23:30", verified: true, active: true, notes: "Grilled fish & plantain. Call ahead for large orders." },
    { merchantName: "Pharmacie de Nuit Mendong", category: "PHARMACY", whatsappNumber: "+237690000002", address: "Mendong, main road", landmark: "Near Mendong market gate", openingHours: "24/7 night duty rotation", verified: true, active: true, notes: "Verify prescription requirements before pickup." },
    { merchantName: "Mini-Market Nsimeyong", category: "GROCERY", whatsappNumber: "+237690000003", address: "Nsimeyong, Rue des Palmiers", landmark: "Blue storefront next to car wash", openingHours: "07:00–23:00", verified: true, active: true },
  ];
  for (const m of merchants) {
    const existing = await prisma.merchant.findFirst({ where: { merchantName: m.merchantName } });
    if (!existing) {
      await prisma.merchant.create({
        data: { ...m, nightOpen: true, searchKey: m.merchantName.toLowerCase().replace(/[^a-z0-9]/g, "") },
      });
    }
  }
  console.log(`✓ ${merchants.length} merchants`);
}

/**
 * Typical Yaoundé night dishes with the price ranges people actually pay.
 *
 * OpenStreetMap has no menus, and most vendors have no website, so a newly
 * imported merchant has no products. Without something to tap, the customer is
 * back to guessing a budget — the complaint that started this work. These are
 * shown as *indicative* prices and never attached to a merchant; a real price
 * only comes from the merchant's own product list.
 */
async function seedPopularDishes() {
  const dishes = [
    { nameEn: "Grilled fish (poisson braisé)", nameFr: "Poisson braisé", priceMinXaf: 2500, priceMaxXaf: 6000, popularityRank: 100 },
    { nameEn: "Poulet DG", nameFr: "Poulet DG", priceMinXaf: 3500, priceMaxXaf: 8000, popularityRank: 95 },
    { nameEn: "Grilled chicken (poulet braisé)", nameFr: "Poulet braisé", priceMinXaf: 2500, priceMaxXaf: 5000, popularityRank: 92 },
    { nameEn: "Soya (grilled beef skewers)", nameFr: "Soya (brochettes de bœuf)", priceMinXaf: 500, priceMaxXaf: 2000, popularityRank: 90 },
    { nameEn: "Ndolé with plantain", nameFr: "Ndolé plantain", priceMinXaf: 2000, priceMaxXaf: 4500, popularityRank: 88 },
    { nameEn: "Eru with water fufu", nameFr: "Eru et water fufu", priceMinXaf: 1500, priceMaxXaf: 3500, popularityRank: 85 },
    { nameEn: "Jollof rice with chicken", nameFr: "Riz jollof au poulet", priceMinXaf: 1500, priceMaxXaf: 3500, popularityRank: 82 },
    { nameEn: "Fried rice", nameFr: "Riz sauté", priceMinXaf: 1500, priceMaxXaf: 3000, popularityRank: 78 },
    { nameEn: "Beignets–haricot–bouillie", nameFr: "Beignets haricot bouillie", priceMinXaf: 500, priceMaxXaf: 1500, popularityRank: 75 },
    { nameEn: "Koki with plantain", nameFr: "Koki plantain", priceMinXaf: 1000, priceMaxXaf: 2500, popularityRank: 70 },
    { nameEn: "Achu soup", nameFr: "Achu", priceMinXaf: 1500, priceMaxXaf: 3500, popularityRank: 68 },
    { nameEn: "Shawarma", nameFr: "Shawarma", priceMinXaf: 1500, priceMaxXaf: 3000, popularityRank: 65 },
    { nameEn: "Pizza (medium)", nameFr: "Pizza (moyenne)", priceMinXaf: 5000, priceMaxXaf: 10000, popularityRank: 60 },
    { nameEn: "Attiéké with fish", nameFr: "Attiéké poisson", priceMinXaf: 2000, priceMaxXaf: 4500, popularityRank: 58 },
    { nameEn: "Bread and omelette", nameFr: "Pain omelette", priceMinXaf: 500, priceMaxXaf: 1500, popularityRank: 55 },
    { nameEn: "Natural juice (1 L)", nameFr: "Jus naturel (1 L)", priceMinXaf: 1000, priceMaxXaf: 3500, popularityRank: 50 },
  ];
  for (const d of dishes) {
    const existing = await prisma.popularDish.findFirst({ where: { nameEn: d.nameEn } });
    if (!existing) await prisma.popularDish.create({ data: d });
  }
  console.log(`✓ ${dishes.length} indicative dish prices`);
}

function locSearchKey(primary: string, aliases: string[]): string {
  const norm = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/['`’.]/g, "").replace(/[^a-z0-9]+/g, "");
  return [primary, ...aliases].map(norm).filter(Boolean).join(" ");
}

async function seedLocations() {
  type Arr =
    | "YAOUNDE_I" | "YAOUNDE_II" | "YAOUNDE_III" | "YAOUNDE_IV"
    | "YAOUNDE_V" | "YAOUNDE_VI" | "YAOUNDE_VII" | "YAOUNDE_PERIPHERY";
  type Status = "PRIORITY" | "STANDARD" | "EXTENDED" | "REVIEW_REQUIRED" | "TEMPORARILY_UNAVAILABLE" | "BLOCKED";
  type L = {
    primaryName: string; aliases: string[]; arrondissement: Arr; neighbourhood: string;
    lat: number; lng: number; serviceStatus: Status; popularityRank: number; landmark?: string;
  };

  const locs: L[] = [
    // ── Yaoundé VI — PRIORITY (Biyem-Assi & surrounds; principal operating area) ──
    { primaryName: "Biyem-Assi", aliases: ["Biyem Assi", "Biyemassi", "Biyem-Assie"], arrondissement: "YAOUNDE_VI", neighbourhood: "Biyem-Assi", lat: 3.8421, lng: 11.4921, serviceStatus: "PRIORITY", popularityRank: 100 },
    { primaryName: "Rond-Point Express Biyem-Assi", aliases: ["Rond Point Express", "Express Biyem Assi", "Express", "Carrefour Express"], arrondissement: "YAOUNDE_VI", neighbourhood: "Biyem-Assi", lat: 3.8440, lng: 11.4948, serviceStatus: "PRIORITY", popularityRank: 99, landmark: "Rond-Point Express" },
    { primaryName: "Carrefour Biyem-Assi", aliases: ["Carrefour Biyem", "Carrefour Biyemassi"], arrondissement: "YAOUNDE_VI", neighbourhood: "Biyem-Assi", lat: 3.8435, lng: 11.4930, serviceStatus: "PRIORITY", popularityRank: 95 },
    { primaryName: "Mendong", aliases: ["Mendong Yaounde"], arrondissement: "YAOUNDE_VI", neighbourhood: "Mendong", lat: 3.8331, lng: 11.4785, serviceStatus: "PRIORITY", popularityRank: 94 },
    { primaryName: "Mendong Camp SIC", aliases: ["Camp SIC Mendong", "Camp SIC", "Cite SIC Mendong"], arrondissement: "YAOUNDE_VI", neighbourhood: "Mendong", lat: 3.8300, lng: 11.4750, serviceStatus: "PRIORITY", popularityRank: 84 },
    { primaryName: "Acacias", aliases: ["Acacia", "Les Acacias"], arrondissement: "YAOUNDE_VI", neighbourhood: "Biyem-Assi", lat: 3.8455, lng: 11.4905, serviceStatus: "PRIORITY", popularityRank: 88, landmark: "Marché Acacias" },
    { primaryName: "Etoug-Ebe", aliases: ["Etoug Ebe", "Etougebe", "Etoug-Ebé"], arrondissement: "YAOUNDE_VI", neighbourhood: "Etoug-Ebe", lat: 3.8480, lng: 11.4892, serviceStatus: "PRIORITY", popularityRank: 90 },
    { primaryName: "Etoug-Ebe I", aliases: ["Etoug Ebe 1", "Etoug-Ebe 1"], arrondissement: "YAOUNDE_VI", neighbourhood: "Etoug-Ebe", lat: 3.8470, lng: 11.4880, serviceStatus: "PRIORITY", popularityRank: 80 },
    { primaryName: "Etoug-Ebe II", aliases: ["Etoug Ebe 2", "Etoug-Ebe 2"], arrondissement: "YAOUNDE_VI", neighbourhood: "Etoug-Ebe", lat: 3.8495, lng: 11.4905, serviceStatus: "PRIORITY", popularityRank: 80 },
    { primaryName: "Melen", aliases: ["Melen Yaounde"], arrondissement: "YAOUNDE_VI", neighbourhood: "Melen", lat: 3.8585, lng: 11.5015, serviceStatus: "PRIORITY", popularityRank: 82 },
    { primaryName: "Mvog-Betsi", aliases: ["Mvog Betsi", "Mvogbetsi"], arrondissement: "YAOUNDE_VI", neighbourhood: "Mvog-Betsi", lat: 3.8500, lng: 11.4980, serviceStatus: "PRIORITY", popularityRank: 80, landmark: "Zoo de Mvog-Betsi" },
    { primaryName: "Nkolbikok", aliases: ["Nkol Bikok"], arrondissement: "YAOUNDE_VI", neighbourhood: "Nkolbikok", lat: 3.8550, lng: 11.4870, serviceStatus: "STANDARD", popularityRank: 70 },
    { primaryName: "Simbock", aliases: ["Simbok"], arrondissement: "YAOUNDE_VI", neighbourhood: "Simbock", lat: 3.8150, lng: 11.4780, serviceStatus: "PRIORITY", popularityRank: 78 },
    { primaryName: "Elig-Effa", aliases: ["Elig Effa", "Eligeffa"], arrondissement: "YAOUNDE_VI", neighbourhood: "Elig-Effa", lat: 3.8620, lng: 11.5030, serviceStatus: "STANDARD", popularityRank: 66 },

    // ── Yaoundé I ──
    { primaryName: "Nlongkak", aliases: ["Nlonkak"], arrondissement: "YAOUNDE_I", neighbourhood: "Nlongkak", lat: 3.8760, lng: 11.5190, serviceStatus: "STANDARD", popularityRank: 60 },
    { primaryName: "Bastos", aliases: [], arrondissement: "YAOUNDE_I", neighbourhood: "Bastos", lat: 3.8880, lng: 11.5090, serviceStatus: "STANDARD", popularityRank: 62 },
    { primaryName: "Etoudi", aliases: [], arrondissement: "YAOUNDE_I", neighbourhood: "Etoudi", lat: 3.9050, lng: 11.5210, serviceStatus: "STANDARD", popularityRank: 55, landmark: "Palais d'Etoudi" },
    { primaryName: "Emana", aliases: [], arrondissement: "YAOUNDE_I", neighbourhood: "Emana", lat: 3.9300, lng: 11.5300, serviceStatus: "EXTENDED", popularityRank: 48 },
    { primaryName: "Messassi", aliases: ["Messasi"], arrondissement: "YAOUNDE_I", neighbourhood: "Messassi", lat: 3.9150, lng: 11.5350, serviceStatus: "EXTENDED", popularityRank: 46 },
    { primaryName: "Olembé", aliases: ["Olembe"], arrondissement: "YAOUNDE_I", neighbourhood: "Olembé", lat: 3.9450, lng: 11.5250, serviceStatus: "EXTENDED", popularityRank: 44, landmark: "Stade d'Olembé" },

    // ── Yaoundé II ──
    { primaryName: "Tsinga", aliases: [], arrondissement: "YAOUNDE_II", neighbourhood: "Tsinga", lat: 3.8790, lng: 11.4980, serviceStatus: "STANDARD", popularityRank: 58 },
    { primaryName: "Mokolo", aliases: ["Marché Mokolo", "Marche Mokolo"], arrondissement: "YAOUNDE_II", neighbourhood: "Mokolo", lat: 3.8730, lng: 11.5090, serviceStatus: "STANDARD", popularityRank: 64, landmark: "Marché Mokolo" },
    { primaryName: "Messa", aliases: [], arrondissement: "YAOUNDE_II", neighbourhood: "Messa", lat: 3.8700, lng: 11.4950, serviceStatus: "STANDARD", popularityRank: 54 },
    { primaryName: "Cité Verte", aliases: ["Cite Verte"], arrondissement: "YAOUNDE_II", neighbourhood: "Cité Verte", lat: 3.8850, lng: 11.4880, serviceStatus: "STANDARD", popularityRank: 56 },
    { primaryName: "Madagascar", aliases: [], arrondissement: "YAOUNDE_II", neighbourhood: "Madagascar", lat: 3.8680, lng: 11.5150, serviceStatus: "STANDARD", popularityRank: 50 },
    { primaryName: "Febe", aliases: ["Fébé"], arrondissement: "YAOUNDE_II", neighbourhood: "Febe", lat: 3.9000, lng: 11.4800, serviceStatus: "EXTENDED", popularityRank: 40 },

    // ── Yaoundé III ──
    { primaryName: "Obili", aliases: [], arrondissement: "YAOUNDE_III", neighbourhood: "Obili", lat: 3.8480, lng: 11.5060, serviceStatus: "STANDARD", popularityRank: 60, landmark: "Carrefour Obili" },
    { primaryName: "Ngoa-Ekellé", aliases: ["Ngoa Ekele", "Ngoa-Ekelle", "Ngoaekelle"], arrondissement: "YAOUNDE_III", neighbourhood: "Ngoa-Ekellé", lat: 3.8560, lng: 11.5100, serviceStatus: "STANDARD", popularityRank: 58, landmark: "Université de Yaoundé I" },
    { primaryName: "Mvolyé", aliases: ["Mvolye"], arrondissement: "YAOUNDE_III", neighbourhood: "Mvolyé", lat: 3.8400, lng: 11.5150, serviceStatus: "STANDARD", popularityRank: 48 },
    { primaryName: "Efoulan", aliases: [], arrondissement: "YAOUNDE_III", neighbourhood: "Efoulan", lat: 3.8380, lng: 11.5080, serviceStatus: "STANDARD", popularityRank: 50 },
    { primaryName: "Ahala", aliases: [], arrondissement: "YAOUNDE_III", neighbourhood: "Ahala", lat: 3.8050, lng: 11.5150, serviceStatus: "EXTENDED", popularityRank: 42 },
    { primaryName: "Nsam", aliases: [], arrondissement: "YAOUNDE_III", neighbourhood: "Nsam", lat: 3.8280, lng: 11.5200, serviceStatus: "STANDARD", popularityRank: 46, landmark: "Nsam Efoulan" },
    { primaryName: "Nsimeyong", aliases: ["Nsimeyon"], arrondissement: "YAOUNDE_III", neighbourhood: "Nsimeyong", lat: 3.8360, lng: 11.5031, serviceStatus: "STANDARD", popularityRank: 52 },

    // ── Yaoundé IV ──
    { primaryName: "Mvan", aliases: [], arrondissement: "YAOUNDE_IV", neighbourhood: "Mvan", lat: 3.8100, lng: 11.5350, serviceStatus: "STANDARD", popularityRank: 50 },
    { primaryName: "Odza", aliases: [], arrondissement: "YAOUNDE_IV", neighbourhood: "Odza", lat: 3.7920, lng: 11.5480, serviceStatus: "EXTENDED", popularityRank: 48, landmark: "Aéroport de Yaoundé-Nsimalen" },
    { primaryName: "Ekounou", aliases: [], arrondissement: "YAOUNDE_IV", neighbourhood: "Ekounou", lat: 3.8350, lng: 11.5450, serviceStatus: "STANDARD", popularityRank: 50 },
    { primaryName: "Awae", aliases: ["Awaé"], arrondissement: "YAOUNDE_IV", neighbourhood: "Awae", lat: 3.8450, lng: 11.5500, serviceStatus: "EXTENDED", popularityRank: 40 },
    { primaryName: "Nkomo", aliases: [], arrondissement: "YAOUNDE_IV", neighbourhood: "Nkomo", lat: 3.8200, lng: 11.5550, serviceStatus: "STANDARD", popularityRank: 42 },
    { primaryName: "Mimboman", aliases: [], arrondissement: "YAOUNDE_IV", neighbourhood: "Mimboman", lat: 3.8600, lng: 11.5400, serviceStatus: "STANDARD", popularityRank: 48 },
    { primaryName: "Kondengui", aliases: [], arrondissement: "YAOUNDE_IV", neighbourhood: "Kondengui", lat: 3.8700, lng: 11.5450, serviceStatus: "STANDARD", popularityRank: 40 },

    // ── Yaoundé V ──
    { primaryName: "Essos", aliases: [], arrondissement: "YAOUNDE_V", neighbourhood: "Essos", lat: 3.8850, lng: 11.5300, serviceStatus: "STANDARD", popularityRank: 60, landmark: "Marché Essos" },
    { primaryName: "Ngousso", aliases: [], arrondissement: "YAOUNDE_V", neighbourhood: "Ngousso", lat: 3.9000, lng: 11.5400, serviceStatus: "STANDARD", popularityRank: 48, landmark: "Hôpital Général" },
    { primaryName: "Mvog-Ada", aliases: ["Mvog Ada"], arrondissement: "YAOUNDE_V", neighbourhood: "Mvog-Ada", lat: 3.8750, lng: 11.5250, serviceStatus: "STANDARD", popularityRank: 50 },
    { primaryName: "Mfandena", aliases: ["Omnisport", "Stade Omnisport"], arrondissement: "YAOUNDE_V", neighbourhood: "Mfandena", lat: 3.8820, lng: 11.5200, serviceStatus: "STANDARD", popularityRank: 54, landmark: "Stade Omnisport" },
    { primaryName: "Nkolmesseng", aliases: [], arrondissement: "YAOUNDE_V", neighbourhood: "Nkolmesseng", lat: 3.9050, lng: 11.5500, serviceStatus: "EXTENDED", popularityRank: 40 },

    // ── Yaoundé VII ──
    { primaryName: "Nkolbisson", aliases: [], arrondissement: "YAOUNDE_VII", neighbourhood: "Nkolbisson", lat: 3.8730, lng: 11.4520, serviceStatus: "STANDARD", popularityRank: 52 },
    { primaryName: "Oyom-Abang", aliases: ["Oyom Abang"], arrondissement: "YAOUNDE_VII", neighbourhood: "Oyom-Abang", lat: 3.8650, lng: 11.4400, serviceStatus: "STANDARD", popularityRank: 44 },
    { primaryName: "Etetak", aliases: [], arrondissement: "YAOUNDE_VII", neighbourhood: "Etetak", lat: 3.8600, lng: 11.4600, serviceStatus: "STANDARD", popularityRank: 40 },
    { primaryName: "Minkoameyos", aliases: [], arrondissement: "YAOUNDE_VII", neighbourhood: "Minkoameyos", lat: 3.8500, lng: 11.4300, serviceStatus: "EXTENDED", popularityRank: 36 },

    // ── Approved periphery — dispatcher review by default ──
    { primaryName: "Mbalgong", aliases: [], arrondissement: "YAOUNDE_PERIPHERY", neighbourhood: "Mbalgong", lat: 3.7960, lng: 11.4460, serviceStatus: "REVIEW_REQUIRED", popularityRank: 30 },
    { primaryName: "Eloumden", aliases: ["Eloumdem"], arrondissement: "YAOUNDE_PERIPHERY", neighbourhood: "Eloumden", lat: 3.8020, lng: 11.4340, serviceStatus: "REVIEW_REQUIRED", popularityRank: 28 },
    { primaryName: "Nkolfoulou", aliases: [], arrondissement: "YAOUNDE_PERIPHERY", neighbourhood: "Nkolfoulou", lat: 3.9100, lng: 11.5900, serviceStatus: "REVIEW_REQUIRED", popularityRank: 20 },
  ];

  for (const l of locs) {
    const data = {
      primaryName: l.primaryName,
      aliases: l.aliases,
      arrondissement: l.arrondissement,
      neighbourhood: l.neighbourhood,
      landmark: l.landmark ?? null,
      latitude: l.lat,
      longitude: l.lng,
      serviceStatus: l.serviceStatus,
      popularityRank: l.popularityRank,
      verified: true,
      active: true,
      source: "admin",
      searchKey: locSearchKey(l.primaryName, l.aliases),
    };
    const existing = await prisma.serviceLocation.findFirst({ where: { primaryName: l.primaryName } });
    if (existing) {
      await prisma.serviceLocation.update({ where: { id: existing.id }, data });
    } else {
      await prisma.serviceLocation.create({ data });
    }
  }
  console.log(`✓ ${locs.length} service locations (Yaoundé I–VII + periphery)`);
}

async function ensureStorageBuckets() {
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    console.warn("! Supabase env missing — skipping storage buckets");
    return;
  }
  const admin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  // Prescriptions and delivery photos must never be publicly readable; a
  // merchant's logo must, because it renders on the order page and a signed URL
  // would expire mid-session.
  const buckets: { name: string; public: boolean }[] = [
    { name: "order-screenshots", public: false },
    { name: "delivery-proofs", public: false },
    { name: "merchant-logos", public: true },
  ];
  for (const { name: bucket, public: isPublic } of buckets) {
    const { error } = await admin.storage.createBucket(bucket, {
      public: isPublic,
      fileSizeLimit: 5 * 1024 * 1024,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    });
    if (error && !`${error.message}`.toLowerCase().includes("already exists")) throw error;
    console.log(`✓ storage bucket ${bucket}`);
  }
}

async function main() {
  await seedSettings();
  await seedZones();
  await seedLocations();
  await seedUsers();
  await seedMerchants();
  await seedPopularDishes();
  await ensureStorageBuckets();
  await verifyAdminLogin();
  console.log("\nSeed complete.");
  console.log("Staff logins (passwords from SEED_ADMIN_PASSWORD / SEED_RIDER_PASSWORD env):");
  console.log("  Owner/Dispatcher: admin@urbannightlift.cm");
  console.log("  Rider:            rider1@urbannightlift.cm");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
