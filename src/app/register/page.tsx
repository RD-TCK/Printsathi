import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { RegisterForm } from "@/components/register-form";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12 sm:px-6">
      <Card className="w-full max-w-md shadow-xl border-slate-200">
        <CardHeader>
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-brand-600 tracking-wide uppercase">Printiva</p>
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
              7-Day Free Trial
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-bold text-brand-950">Create your shop account</h1>
          <p className="mt-1 text-sm text-muted">Set up your shop QR, connect your printer, and accept instant print orders.</p>
        </CardHeader>
        <CardContent>
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
    </main>
  );
}
