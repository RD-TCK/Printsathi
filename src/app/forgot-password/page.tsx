import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/alert";
import { requestPasswordReset } from "@/app/actions/auth";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <p className="text-sm font-bold text-brand-600">PrintSathi</p>
          <h1 className="mt-2 text-2xl font-semibold text-brand-950">Reset your password</h1>
          <p className="mt-1 text-sm text-muted">
            Enter your email and we'll send you a link to reset your password.
          </p>
        </CardHeader>
        <CardContent>
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

          <form action={requestPasswordReset} className="space-y-5">
            <Input
              id="email"
              name="email"
              label="Account email address"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
            />
            <SubmitButton className="w-full" pendingLabel="Sending reset link...">
              Send reset link
            </SubmitButton>
          </form>

          <p className="mt-6 text-center text-sm text-muted">
            Remember your password?{" "}
            <Link className="font-semibold text-brand-700 hover:underline" href="/login">
              Back to sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
