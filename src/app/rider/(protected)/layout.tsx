import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { RiderShell } from "@/components/rider/RiderShell";

export const dynamic = "force-dynamic";

// Rider-scoped manifest so an installed rider app opens on the dashboard,
// separate from the customer app (which uses the root /manifest.json).
export const metadata: Metadata = {
  manifest: "/rider-manifest.json",
  title: "Urban Night Lift — Rider",
  appleWebApp: { capable: true, title: "UNL Rider", statusBarStyle: "black-translucent" },
};

export default async function ProtectedRiderLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(["RIDER"]);
  if (!user) redirect("/rider/login");

  return <RiderShell userName={user.fullName}>{children}</RiderShell>;
}
