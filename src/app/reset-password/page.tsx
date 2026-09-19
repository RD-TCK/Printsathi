import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/alert";
import { updateUserPassword } from "@/app/actions/auth";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <p className="text-sm font-bold text-brand-600">PrintSathi</p>
          <h1 className="mt-2 text-2xl font-semibold text-brand-950">Set new password</h1>
          <p className="mt-1 text-sm text-muted">Enter your new account password below.</p>
        </CardHeader>
        <CardContent>
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

          <form action={updateUserPassword} className="space-y-5">
            <Input
              id="password"
              name="password"
              label="New password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              hint="Must be at least 8 characters"
              required
            />
            <Input
              id="confirmPassword"
              name="confirmPassword"
              label="Confirm new password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
            <SubmitButton className="w-full" pendingLabel="Updating password...">
              Update password
            </SubmitButton>
          </form>

          <p className="mt-6 text-center text-sm text-muted">
            <Link className="font-semibold text-brand-700 hover:underline" href="/login">
              Back to sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
