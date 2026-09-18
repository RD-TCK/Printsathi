import { NextResponse } from "next/server";
import { z } from "zod";
import { getShopContext, canManageShop } from "@/lib/shop-portal";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { activateSubscriptionPayment } from "@/lib/subscription-payment";

export async function POST(request: Request) {
  const context = await getShopContext();
  if (!context || !canManageShop(context)) return NextResponse.json({ error: "Permission denied." }, { status: 403 });
  const parsed = z.object({ paymentId: z.string().regex(/^pay_[a-zA-Z0-9]+$/) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid Razorpay payment ID." }, { status: 400 });
  const client = createSupabaseAdminClient();
  if (!client) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  try {
    // Fetch the captured payment and order from Razorpay; never trust browser ownership or amount.
    const periodEnd = await activateSubscriptionPayment(client, parsed.data.paymentId, { shopId: context.shop.id });
    return NextResponse.json({ success: true, periodEnd });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Activation failed. Do not pay again." }, { status: 409 });
  }
}
