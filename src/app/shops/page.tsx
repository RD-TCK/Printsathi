import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MarketingShell } from "@/components/marketing-site";

export const dynamic = "force-dynamic";
export const metadata = { title: "Find a print shop | PrintSaathi" };

export default async function ShopsPage() {
  const client = await createSupabaseServerClient();
  const result = client ? await client.from("public_shop_directory")
    .select("public_id, name, is_active, accepting_orders")
    .eq("is_active", true).order("name") : null;
  return <MarketingShell><section className="mx-auto max-w-4xl px-6 py-16">
    <h1 className="text-3xl font-bold">Find a print shop</h1>
    <p className="mt-3 text-muted">Choose your shop to upload documents, see its prices, and check printer availability. You can also scan the shop’s QR code.</p>
    {!result || result.error ? <p role="alert" className="mt-8">The shop directory is unavailable. Please try again shortly.</p> :
      result.data.length === 0 ? <p className="mt-8">No shops are listed yet.</p> :
      <div className="mt-8 grid gap-4 sm:grid-cols-2">{result.data.map(shop =>
        <Link key={shop.public_id} href={`/shop/${encodeURIComponent(shop.public_id)}`} className="rounded-xl border border-line bg-white p-5 hover:border-brand-600">
          <h2 className="font-semibold">{shop.name}</h2>
          <p className="mt-2 text-sm text-muted">{shop.accepting_orders ? "View prices and printer status" : "Orders currently paused"}</p>
        </Link>)}</div>}
  </section></MarketingShell>;
}
