import { NextResponse } from "next/server";
import { z } from "zod";
import { getShopContext, canManageShop } from "@/lib/shop-portal";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createRazorpayOrder, getRazorpayClient, toPaise } from "@/lib/razorpay/server";

const createSubscriptionOrderSchema = z.object({
  plan: z.enum(["monthly", "yearly"]),
});

export async function POST(request: Request) {
  const context = await getShopContext();
  if (!context || !canManageShop(context)) {
    return NextResponse.json({ error: "Unauthorized or permission denied." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createSubscriptionOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid subscription plan selected." }, { status: 400 });
  }

  const razorpayConfig = getRazorpayClient();
  if (!razorpayConfig) {
    return NextResponse.json(
      { error: "Razorpay payment gateway is not configured on the server." },
      { status: 503 },
    );
  }

  const plan = parsed.data.plan;
  const amountRupees = plan === "monthly" ? 699 : 7499;
  const planDescription = plan === "monthly" ? "Shop Monthly Subscription (₹699/mo)" : "Shop Yearly Subscription (₹7,499/yr - 10% Discount)";
  const receipt = `sub_${context.shop.id.slice(0, 8)}_${Date.now()}`.slice(0, 40);

  try {
    const rzpOrder = await createRazorpayOrder({
      amountRupees,
      currency: "INR",
      receipt,
      notes: {
        shop_id: context.shop.id,
        shop_name: context.shop.name,
        plan_type: plan,
        purpose: "shop_subscription",
      },
    });

    return NextResponse.json({
      keyId: razorpayConfig.keyId,
      amount: rzpOrder.amount, // in paise
      amountRupees,
      currency: "INR",
      razorpayOrderId: rzpOrder.id,
      plan,
      planDescription,
      shopName: context.shop.name,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create Razorpay order for subscription." },
      { status: 500 },
    );
  }
}
