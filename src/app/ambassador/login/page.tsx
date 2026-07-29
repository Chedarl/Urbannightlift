import Link from "next/link";
import { redirect } from "next/navigation";
import { getAmbassadorId } from "@/lib/auth/ambassador";
import { AmbassadorLoginForm } from "@/components/ambassador/AmbassadorLoginForm";
import { Logo } from "@/components/shared/Logo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ambassador sign in — Urban Night Lift" };

export default async function AmbassadorLoginPage() {
  if (await getAmbassadorId()) redirect("/ambassador/dashboard");

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4 py-10">
      <div className="text-center">
        <Logo height={34} className="mx-auto" />
        <h1 className="mt-4 font-display text-2xl font-bold">Ambassador sign in</h1>
        <p className="mt-1 text-sm text-mist-400">See who you brought in and what you have earned.</p>
      </div>

      <AmbassadorLoginForm />

      <p className="text-center text-xs text-mist-500">
        Not an ambassador yet?{" "}
        <Link href="/ambassador/join" className="text-gold-300 hover:text-gold-200">
          Apply here
        </Link>
      </p>
    </div>
  );
}
