import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { RegisterForm } from "@/components/register-form";
import { Logo } from "@/components/ui/logo";
import { AuthBackgroundDecoration } from "@/components/auth-background-decoration";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Register Your Print Shop — ₹100 for a 7-Day Trial",
  description:
    "Create a Printiva shop account in minutes. Get your shop QR code, set per-page prices, connect your Windows printer, and start accepting paid print orders.",
  path: "/register",
});

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return (
    <main className="relative isolate min-h-screen flex items-center justify-center px-4 py-12 sm:px-6 overflow-hidden bg-gradient-to-br from-emerald-100/50 via-[#f2faf5] to-lime-100/60">
      {/* Translucent floating printer emojis & light lime/green ambient tint */}
      <AuthBackgroundDecoration />

      <div className="w-full max-w-md relative z-10">
        {/* Brand Header */}
        <div className="mb-6 text-center">
          <Link href="/" className="inline-flex items-center gap-2.5 group">
            <Logo size={36} className="transition-transform group-hover:scale-105" />
            <span className="text-2xl font-bold tracking-tight text-brand-950">
              Print<span className="text-emerald-600">iva</span>
            </span>
          </Link>
        </div>

        <Card className="shadow-xl shadow-emerald-950/5 border border-emerald-100/90 bg-white/95 backdrop-blur-md rounded-3xl overflow-hidden">
          <CardHeader className="p-6 sm:p-8 pb-3 border-b-0">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-emerald-700 tracking-wider uppercase bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 rounded-full">
                7-Day Free Onboarding
              </span>
              <span className="rounded-full bg-emerald-100/90 px-2.5 py-0.5 text-xs font-bold font-mono text-emerald-800 border border-emerald-300/80">
                ₹100 Trial
              </span>
            </div>
            <h1 className="mt-3 text-2xl font-bold tracking-tight text-brand-950">Create your shop account</h1>
            <p className="mt-1 text-sm text-muted">
              Set up your shop QR, connect your printer, and accept instant print orders.
            </p>
          </CardHeader>
          <CardContent className="p-6 sm:p-8 pt-2">
            {params.error ? (
              <Alert tone="error" className="mb-5">
                {params.error}
              </Alert>
            ) : null}

            <RegisterForm />

            <p className="mt-6 text-center text-sm text-muted">
              Already registered?{" "}
              <Link className="font-semibold text-brand-700 hover:underline" href="/login">
                Sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
