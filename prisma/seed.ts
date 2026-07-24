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
      operatingStartHour: 20,
      operatingEndHour: 24,
      zoneNoticeEn: "Serving selected areas across Yaoundé.",
      zoneNoticeFr: "Disponible dans certains quartiers de Yaoundé.",
      mtnMerchantCode: "653077160",
      mtnUssdTemplate: "*126*4*857539*{amount}#",
    },
  });
  console.log("✓ OperatingSettings (mode=CLOSED)");
}

async function seedZones() {
  // Green = easy access (Biyem-Assi core), Yellow = harder/slightly further,
  // Red = far/difficult. Centroids are approximate Yaoundé coordinates used to
  // resolve a map-dropped pin to a zone/tier.
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
    // GREEN — 1000–1500
    { zoneName: "Biyem-Assi", description: "Biyem-Assi core — easy access", feeXaf: 1000, nightUrgencyFeeXaf: 500, medicineFeeXaf: 300, tier: "GREEN", centroidLat: 3.8421, centroidLng: 11.4921, safetyLevel: "SAFE", active: true },
    { zoneName: "Mendong", description: "Mendong", feeXaf: 1200, nightUrgencyFeeXaf: 500, medicineFeeXaf: 300, tier: "GREEN", centroidLat: 3.8331, centroidLng: 11.4785, safetyLevel: "SAFE", active: true },
    { zoneName: "Nsimeyong", description: "Nsimeyong", feeXaf: 1200, nightUrgencyFeeXaf: 500, medicineFeeXaf: 300, tier: "GREEN", centroidLat: 3.8360, centroidLng: 11.5031, safetyLevel: "SAFE", active: true },
    { zoneName: "Etoug-Ebe", description: "Etoug-Ebe", feeXaf: 1300, nightUrgencyFeeXaf: 500, medicineFeeXaf: 300, tier: "GREEN", centroidLat: 3.8480, centroidLng: 11.4892, safetyLevel: "SAFE", active: true },
    { zoneName: "Melen", description: "Melen / campus side", feeXaf: 1500, nightUrgencyFeeXaf: 500, medicineFeeXaf: 300, tier: "GREEN", centroidLat: 3.8585, centroidLng: 11.5015, safetyLevel: "SAFE", active: true },
    // YELLOW — 1600–2000
    { zoneName: "Simbock", description: "Simbock — slightly further", feeXaf: 1600, nightUrgencyFeeXaf: 700, medicineFeeXaf: 300, tier: "YELLOW", centroidLat: 3.8150, centroidLng: 11.4780, safetyLevel: "CAUTION", active: true },
    { zoneName: "Mvog-Mbi", description: "Mvog-Mbi", feeXaf: 1700, nightUrgencyFeeXaf: 700, medicineFeeXaf: 300, tier: "YELLOW", centroidLat: 3.8560, centroidLng: 11.5240, safetyLevel: "CAUTION", active: true },
    { zoneName: "Nkolbisson", description: "Nkolbisson — reduced night coverage", feeXaf: 1800, nightUrgencyFeeXaf: 700, medicineFeeXaf: 300, tier: "YELLOW", centroidLat: 3.8730, centroidLng: 11.4520, safetyLevel: "CAUTION", active: true, notes: "Confirm rider comfort before late pickups." },
    { zoneName: "Awae", description: "Awae escarpment side — harder access", feeXaf: 1800, nightUrgencyFeeXaf: 700, medicineFeeXaf: 300, tier: "YELLOW", centroidLat: 3.8450, centroidLng: 11.5500, safetyLevel: "CAUTION", active: true },
    { zoneName: "Centre-ville", description: "Yaoundé town centre", feeXaf: 2000, nightUrgencyFeeXaf: 700, medicineFeeXaf: 300, tier: "YELLOW", centroidLat: 3.8667, centroidLng: 11.5167, safetyLevel: "CAUTION", active: true },
    // RED — 2500+
    { zoneName: "Emana", description: "Emana — far north, difficult at night", feeXaf: 2500, nightUrgencyFeeXaf: 1000, medicineFeeXaf: 500, tier: "RED", centroidLat: 3.9300, centroidLng: 11.5300, safetyLevel: "RESTRICTED", active: true, notes: "Owner approval recommended." },
    { zoneName: "Odza", description: "Odza / airport side — far", feeXaf: 3000, nightUrgencyFeeXaf: 1000, medicineFeeXaf: 500, tier: "RED", centroidLat: 3.7920, centroidLng: 11.5480, safetyLevel: "RESTRICTED", active: true, notes: "Owner approval recommended." },
    { zoneName: "Outside Yaoundé", description: "Any area outside Yaoundé", feeXaf: 3500, nightUrgencyFeeXaf: 1000, medicineFeeXaf: 500, tier: "RED", centroidLat: 3.9500, centroidLng: 11.6000, safetyLevel: "NO_GO", active: false, notes: "Requires manual owner approval. Rejected by default." },
  ];
  for (const z of zones) {
    await prisma.zone.upsert({ where: { zoneName: z.zoneName }, update: { tier: z.tier, centroidLat: z.centroidLat, centroidLng: z.centroidLng, feeXaf: z.feeXaf }, create: z });
  }
  // Retire the legacy "Yaoundé 6"-named zone from v1 (hide from customers).
  await prisma.zone.updateMany({ where: { zoneName: "Outside Yaoundé 6" }, data: { active: false } });
  console.log(`✓ ${zones.length} zones (green/yellow/red)`);
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
  const admin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  // Look up by email first so re-running the seed never duplicates.
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listErr) throw listErr;
  const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (existing) return existing.id;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) throw error;
  return data.user.id;
}

async function seedUsers() {
  const staff: Array<{ email: string; fullName: string; phone: string; role: UserRole; password: string }> = [
    {
      email: "admin@urbannightlift.cm",
      fullName: "UNL Owner",
      phone: "+237680038004",
      role: "OWNER",
      password: process.env.SEED_ADMIN_PASSWORD ?? "change-me-now",
    },
    {
      email: "rider1@urbannightlift.cm",
      fullName: "UNL Rider One",
      phone: "+237698255474",
      role: "RIDER",
      password: process.env.SEED_RIDER_PASSWORD ?? "change-me-now",
    },
  ];
  for (const s of staff) {
    const authUserId = (await ensureAuthUser(s.email, s.password, s.fullName)) ?? `local-${s.email}`;
    await prisma.user.upsert({
      where: { email: s.email },
      update: { authUserId },
      create: { email: s.email, fullName: s.fullName, phone: s.phone, role: s.role, authUserId },
    });
    console.log(`✓ user ${s.email} (${s.role})`);
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
    if (!existing) await prisma.merchant.create({ data: m });
  }
  console.log(`✓ ${merchants.length} merchants`);
}

async function ensureStorageBuckets() {
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    console.warn("! Supabase env missing — skipping storage buckets");
    return;
  }
  const admin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  for (const bucket of ["order-screenshots", "delivery-proofs"]) {
    const { error } = await admin.storage.createBucket(bucket, {
      public: false,
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
  await seedUsers();
  await seedMerchants();
  await ensureStorageBuckets();
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
