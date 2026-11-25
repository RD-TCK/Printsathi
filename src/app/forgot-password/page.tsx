import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/alert";
import { Logo } from "@/components/ui/logo";
import { AuthBackgroundDecoration } from "@/components/auth-background-decoration";
import { requestPasswordReset } from "@/app/actions/auth";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
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
            <span className="text-[11px] font-bold text-emerald-700 tracking-wider uppercase bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 rounded-full inline-block w-fit">
              Account Recovery
            </span>
            <h1 className="mt-3 text-2xl font-bold tracking-tight text-brand-950">Reset your password</h1>
            <p className="mt-1 text-sm text-muted">
              Enter your email and we&apos;ll send you a link to reset your password.
            </p>
          </CardHeader>
          <CardContent className="p-6 sm:p-8 pt-2">
            {params.error ? (
              <Alert tone="error" className="mb-5">
                {params.error}
              </Alert>
            ) : null}
            {params.success ? (
              <Alert tone="success" className="mb-5">
                {params.success}
              </Alert>
            ) : null}

            <form action={requestPasswordReset} className="space-y-4">
              <Input
                id="email"
                name="email"
                label="Account email address"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                required
              />
              <SubmitButton
                size="lg"
                className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-12 text-sm rounded-xl shadow-md shadow-emerald-700/20 active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer"
                pendingLabel="Sending reset link..."
              >
                <span>Send reset link</span>
                <ArrowRight className="size-4" />
              </SubmitButton>
            </form>

            <p className="mt-6 text-center text-sm text-muted">
              Remember your password?{" "}
              <Link className="font-semibold text-brand-700 hover:underline inline-flex items-center gap-1" href="/login">
                <ArrowLeft className="size-3" /> Back to sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
