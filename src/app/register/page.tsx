import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { signUpShopOwner } from "@/app/actions/auth";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <p className="text-sm font-bold text-brand-600">PrintSathi</p>
          <h1 className="mt-2 text-2xl font-semibold text-brand-950">Create your shop account</h1>
          <p className="mt-1 text-sm text-muted">Start with a 15-day free trial when onboarding is available.</p>
        </CardHeader>
        <CardContent>
          {params.error ? (
            <Alert tone="error" className="mb-5">
              {params.error}
            </Alert>
          ) : null}
          <form action={signUpShopOwner} className="space-y-5">
            <Input id="name" name="fullName" label="Your name" autoComplete="name" placeholder="e.g. John Doe" required />
            <Input id="email" name="email" label="Work email" type="email" autoComplete="email" placeholder="you@example.com" required />
            <Input
              id="password"
              name="password"
              label="Password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              hint="Must be at least 8 characters"
              required
            />
            <Input id="shopName" name="shopName" label="Shop name" autoComplete="organization" placeholder="e.g. Central Print Hub" required />
            <Input
              id="shopSlug"
              name="shopSlug"
              label="Shop URL slug"
              placeholder="e.g. central-print-hub"
              pattern="^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$"
              hint="Lowercase letters, numbers, and hyphens (e.g. my-shop)"
              title="Letters, numbers, and hyphens only (e.g. my-print-shop)."
              required
            />
            <Button className="w-full" type="submit">
              Create account
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted">
            Already registered?{" "}
            <Link className="font-semibold text-brand-700 hover:underline" href="/login">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
