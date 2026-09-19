import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/alert";
import { signIn } from "@/app/actions/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <p className="text-sm font-bold text-brand-600">Printiva</p>
          <h1 className="mt-2 text-2xl font-semibold text-brand-950">Welcome back</h1>
          <p className="mt-1 text-sm text-muted">Sign in to manage your printing workspace.</p>
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
          <form action={signIn} className="space-y-5">
            <Input id="email" name="email" label="Email address" type="email" autoComplete="email" required />
            <div className="space-y-1">
              <Input
                id="password"
                name="password"
                label="Password"
                type="password"
                autoComplete="current-password"
                required
              />
              <div className="flex justify-end">
                <Link
                  href="/forgot-password"
                  className="text-xs font-semibold text-brand-700 hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
            </div>
            <SubmitButton className="w-full" pendingLabel="Signing in...">
              Sign in
            </SubmitButton>
          </form>
          <p className="mt-6 text-center text-sm text-muted">
            New to Printiva?{" "}
            <Link className="font-semibold text-brand-700 hover:underline" href="/register">
              Create an account
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
