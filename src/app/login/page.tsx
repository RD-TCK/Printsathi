import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/alert";
import { Logo } from "@/components/ui/logo";
import { AuthBackgroundDecoration } from "@/components/auth-background-decoration";
import { signIn } from "@/app/actions/auth";
import { NO_INDEX } from "@/lib/seo";

export const metadata = {
  title: "Shop Owner Login",
  description: "Sign in to your Printiva shop dashboard.",
  robots: NO_INDEX,
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
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
                Shop Owner Portal
              </span>
            </div>
            <h1 className="mt-3 text-2xl font-bold tracking-tight text-brand-950">Welcome back</h1>
            <p className="mt-1 text-sm text-muted">Sign in to manage your shop, orders, and printers.</p>
          </CardHeader>
          <CardContent className="p-6 sm:p-8 pt-2">
            {params.error ? (
              <Alert tone="error" className="mb-5">
                {params.error}
              </Alert>
            ) : null}
            {params.message ? (
              <Alert tone="success" className="mb-5">
                {params.message}
              </Alert>
            ) : null}
            <form action={signIn} className="space-y-4">
              <Input
                id="email"
                name="email"
                label="Email address"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                required
              />
              <div className="space-y-1.5">
                <Input
                  id="password"
                  name="password"
                  label="Password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  required
                />
                <div className="flex justify-end">
                  <Link href="/forgot-password" className="text-xs font-semibold text-brand-700 hover:underline">
                    Forgot password?
                  </Link>
                </div>
              </div>

              {/* High-visibility primary button */}
              <SubmitButton
                size="lg"
                className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-12 text-sm rounded-xl shadow-md shadow-emerald-700/20 active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer"
                pendingLabel="Signing in..."
              >
                <span>Sign in</span>
                <ArrowRight className="size-4" />
              </SubmitButton>
            </form>
            <p className="mt-6 text-center text-sm text-muted">
              New to Printiva?{" "}
              <Link className="font-semibold text-brand-700 hover:underline" href="/register">
                Create a shop account
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
