import { NextResponse } from "next/server";
import { getPublicShop } from "@/lib/shops/public-lookup";
import { getRazorpayServerEnv } from "@/lib/env";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ identifier: string }> }) {
  try {
    const { identifier } = await params;
    const { shop } = await getPublicShop(identifier);
    if (!shop) return NextResponse.json({ error: "Shop unavailable" }, { status: 404 });
    return NextResponse.json(
      { shop, paymentsReady: Boolean(shop.has_custom_razorpay || getRazorpayServerEnv()) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch { return NextResponse.json({ error: "Could not refresh connection status" }, { status: 503 }); }
}
