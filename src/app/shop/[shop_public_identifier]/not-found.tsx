import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ShopNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-50 px-6">
      <div className="max-w-md text-center">
        <SearchX className="mx-auto size-10 text-brand-600" />
        <h1 className="mt-5 text-2xl font-semibold text-brand-950">Shop not found</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          This QR link does not match a PrintSathi shop. Check the scan or ask the shop for its current link.
        </p>
        <Button asChild className="mt-6">
          <Link href="/">Return to PrintSathi</Link>
        </Button>
      </div>
    </main>
  );
}
