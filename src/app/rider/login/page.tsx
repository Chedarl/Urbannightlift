import type { Metadata } from "next";
import { LoginForm } from "@/components/shared/LoginForm";
import { InstallPrompt } from "@/components/shared/InstallPrompt";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  manifest: "/rider-manifest.json",
  title: "Urban Night Lift — Rider login",
  appleWebApp: { capable: true, title: "UNL Rider", statusBarStyle: "black-translucent" },
};

export default function RiderLoginPage() {
  return (
    <>
      <LoginForm subtitle="Rider access" />
      <div className="mx-auto flex max-w-sm justify-center px-6 pb-10">
        <InstallPrompt variant="rider" />
      </div>
    </>
  );
}
