"use client";

import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ShopError({ reset }: { reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-50 px-6">
      <div className="max-w-md text-center">
        <TriangleAlert className="mx-auto size-10 text-red-600" />
        <h1 className="mt-5 text-2xl font-semibold text-brand-950">Shop entry could not load</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Please try again. The shop&apos;s private details remain protected while the directory recovers.
        </p>
        <Button className="mt-6" onClick={reset}>
          Try again
        </Button>
      </div>
    </main>
  );
}
