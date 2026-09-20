"use server";
import { hasSubscriptionAccess } from "@/lib/subscription";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { canManageShop, getShopContext } from "@/lib/shop-portal";
import { generatePairingCode } from "@/lib/agent/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const pricingSchema = z.object({
  colorMode: z.enum(["black_and_white", "color"]),
  paperSize: z.enum(["a4", "a3", "letter", "legal"]),
  minPages: z.coerce.number().int().min(1),
  maxPages: z.preprocess((value) => {
    if (value === "" || value === undefined || value === null || value === "0" || value === 0) return null;
    const parsed = Number(value);
    return isNaN(parsed) || parsed <= 0 ? null : parsed;
  }, z.number().int().min(1).nullable()),
  pricePerPage: z.coerce.number().min(0).max(100000),
});

function result(message: string, error = false): never {
  redirect(`/shop/pricing?${error ? "error" : "success"}=${encodeURIComponent(message)}`);
}

export async function createPricingRule(formData: FormData) {
  const context = await getShopContext();
  if (!context || !canManageShop(context)) result("You do not have permission to manage pricing.", true);
  const parsed = pricingSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success || (parsed.data.maxPages !== null && parsed.data.minPages > parsed.data.maxPages)) {
    result("Enter a valid page range and price.", true);
  }

  // Check if a rule already exists for this (shop_id, color_mode, paper_size, min_pages)
  const { data: existing } = await context.client
    .from("pricing_rules")
    .select("id, is_active")
    .eq("shop_id", context.shop.id)
    .eq("color_mode", parsed.data.colorMode)
    .eq("paper_size", parsed.data.paperSize)
    .eq("min_pages", parsed.data.minPages)
    .maybeSingle();

  if (existing) {
    if (existing.is_active) {
      result(`An active pricing rule already starts at page ${parsed.data.minPages}. Please edit or delete the existing rule.`, true);
    } else {
      // Inactive rule exists: update and reactivate to avoid PostgreSQL unique constraint collision
      const { error } = await context.client
        .from("pricing_rules")
        .update({
          max_pages: parsed.data.maxPages,
          price_per_page: parsed.data.pricePerPage,
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .eq("shop_id", context.shop.id);
      if (error) result(`Could not save pricing rule: ${error.message}`, true);
      revalidatePath("/shop/pricing");
      result("Pricing rule saved.");
    }
  }

  const { error } = await context.client.from("pricing_rules").insert({
    shop_id: context.shop.id,
    color_mode: parsed.data.colorMode,
    paper_size: parsed.data.paperSize,
    min_pages: parsed.data.minPages,
    max_pages: parsed.data.maxPages,
    price_per_page: parsed.data.pricePerPage,
    is_active: true,
  });
  if (error) result(`Could not save pricing rule: ${error.message}`, true);
  revalidatePath("/shop/pricing");
  result("Pricing rule saved.");
}

export async function deactivatePricingRule(formData: FormData) {
  const context = await getShopContext();
  if (!context || !canManageShop(context)) result("You do not have permission to manage pricing.", true);
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) result("Invalid pricing rule.", true);
  const { error } = await context.client
    .from("pricing_rules")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id.data)
    .eq("shop_id", context.shop.id);
  if (error) result(`Could not deactivate pricing rule: ${error.message}`, true);
  revalidatePath("/shop/pricing");
  result("Pricing rule deactivated.");
}

export async function deletePricingRule(formData: FormData) {
  const context = await getShopContext();
  if (!context || !canManageShop(context)) result("You do not have permission to manage pricing.", true);
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) result("Invalid pricing rule.", true);
  const { error } = await context.client
    .from("pricing_rules")
    .delete()
    .eq("id", id.data)
    .eq("shop_id", context.shop.id);
  if (error) result(`Could not delete pricing rule: ${error.message}`, true);
  revalidatePath("/shop/pricing");
  result("Pricing rule permanently deleted.");
}

export async function updatePricingRule(formData: FormData) {
  const context = await getShopContext();
  if (!context || !canManageShop(context)) result("You do not have permission to manage pricing.", true);
  const id = z.string().uuid().safeParse(formData.get("id"));
  const parsed = pricingSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!id.success || !parsed.success || (parsed.data.maxPages !== null && parsed.data.minPages > parsed.data.maxPages)) {
    result("Enter a valid page range and price.", true);
  }

  // Check if another rule exists with the same min_pages
  const { data: conflict } = await context.client
    .from("pricing_rules")
    .select("id, is_active")
    .eq("shop_id", context.shop.id)
    .eq("color_mode", parsed.data.colorMode)
    .eq("paper_size", parsed.data.paperSize)
    .eq("min_pages", parsed.data.minPages)
    .neq("id", id.data)
    .maybeSingle();

  if (conflict) {
    if (conflict.is_active) {
      result(`Another active rule already starts at page ${parsed.data.minPages}.`, true);
    } else {
      // Delete inactive duplicate to satisfy Postgres unique constraint
      await context.client.from("pricing_rules").delete().eq("id", conflict.id).eq("shop_id", context.shop.id);
    }
  }

  const { error } = await context.client
    .from("pricing_rules")
    .update({
      color_mode: parsed.data.colorMode,
      paper_size: parsed.data.paperSize,
      min_pages: parsed.data.minPages,
      max_pages: parsed.data.maxPages,
      price_per_page: parsed.data.pricePerPage,
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id.data)
    .eq("shop_id", context.shop.id);
  if (error) result(`Could not update pricing rule: ${error.message}`, true);
  revalidatePath("/shop/pricing");
  result("Pricing rule updated.");
}

export async function updateShopSettings(formData: FormData) {
  const context = await getShopContext();
  if (!context || !canManageShop(context)) redirect("/shop/settings?error=Permission+denied");
  const parsed = z
    .object({
      name: z.string().trim().min(2).max(160),
      phone: z.string().trim().max(30),
      email: z.string().trim().email().or(z.literal("")),
      address: z.string().trim().max(300),
      isActive: z.enum(["true", "false"]),
      acceptingOrders: z.enum(["true", "false"]),
      paymentMode: z.enum(["online", "counter", "both"]).default("both"),
    })
    .safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect("/shop/settings?error=Check+the+settings+fields");

  const { error: shopError } = await context.client
    .from("shops")
    .update({
      name: parsed.data.name,
      phone: parsed.data.phone || null,
      email: parsed.data.email || null,
      address: parsed.data.address || null,
      is_active: parsed.data.isActive === "true",
    })
    .eq("id", context.shop.id);

  // Check if shop_settings row exists
  const { data: existingSettings } = await context.client
    .from("shop_settings")
    .select("shop_id")
    .eq("shop_id", context.shop.id)
    .maybeSingle();

  let settingsError = null;
  if (existingSettings) {
    const { error } = await context.client
      .from("shop_settings")
      .update({
        accepting_orders: parsed.data.acceptingOrders === "true",
        payment_mode: parsed.data.paymentMode,
      })
      .eq("shop_id", context.shop.id);
    settingsError = error;
  } else {
    // Upsert using admin client to ensure missing settings row is created
    const admin = createSupabaseAdminClient();
    if (admin) {
      const { error } = await admin
        .from("shop_settings")
        .upsert(
          {
            shop_id: context.shop.id,
            accepting_orders: parsed.data.acceptingOrders === "true",
            payment_mode: parsed.data.paymentMode,
          },
          { onConflict: "shop_id" }
        );
      settingsError = error;
    } else {
      const { error } = await context.client
        .from("shop_settings")
        .insert({
          shop_id: context.shop.id,
          accepting_orders: parsed.data.acceptingOrders === "true",
          payment_mode: parsed.data.paymentMode,
        });
      settingsError = error;
    }
  }

  if (shopError || settingsError) {
    const errorMsg = shopError?.message || settingsError?.message || "Could not save settings";
    redirect(`/shop/settings?error=${encodeURIComponent(errorMsg)}`);
  }

  revalidatePath("/shop", "layout");
  redirect("/shop/settings?success=Settings+saved");
}

export async function generateAgentPairingCode() {
  const context = await getShopContext();
  if (!context || !canManageShop(context)) {
    redirect("/shop/printer?error=Permission+denied");
  }

  const { displayCode, codeHash } = generatePairingCode();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 minutes

  const { error } = await context.client.from("agent_pairing_codes").insert({
    shop_id: context.shop.id,
    created_by: context.profile.id,
    code_hash: codeHash,
    display_code: displayCode,
    expires_at: expiresAt,
  });

  if (error) {
    redirect("/shop/printer?error=Could+not+generate+pairing+code");
  }

  revalidatePath("/shop/printer");
  redirect(`/shop/printer?pairingCode=${encodeURIComponent(displayCode)}&expires=${encodeURIComponent(expiresAt)}`);
}

export async function setDefaultPrinter(formData: FormData) {
  const context = await getShopContext();
  if (!context || !canManageShop(context)) {
    redirect("/shop/printer?error=Permission+denied");
  }

  const printerId = z.string().uuid().safeParse(formData.get("printerId"));
  if (!printerId.success) {
    redirect("/shop/printer?error=Invalid+printer+selected");
  }

  // Owner authorization is checked above. Browser RLS intentionally makes
  // printer state read-only, so use the server client and retain the shop filter.
  const admin = createSupabaseAdminClient();
  if (!admin) redirect("/shop/printer?error=Printer+management+is+not+configured");
  const { data: updated, error } = await admin
    .from("printers")
    .update({ is_default: true })
    .eq("id", printerId.data)
    .eq("shop_id", context.shop.id)
    .select("id").maybeSingle();

  if (error || !updated) {
    redirect("/shop/printer?error=Could+not+update+default+printer");
  }
  const { error: clearError } = await admin.from("printers").update({ is_default: false })
    .eq("shop_id", context.shop.id).neq("id", updated.id);
  if (clearError) redirect("/shop/printer?error=Could+not+clear+the+previous+default+printer");

  revalidatePath("/shop/printer");
  redirect("/shop/printer?success=Default+printer+updated");
}

export async function revokeAgent(formData: FormData) {
  const context = await getShopContext();
  if (!context || !canManageShop(context)) {
    redirect("/shop/printer?error=Permission+denied");
  }

  const agentId = z.string().uuid().safeParse(formData.get("agentId"));
  if (!agentId.success) {
    redirect("/shop/printer?error=Invalid+agent+identifier");
  }

  const admin = createSupabaseAdminClient();
  if (!admin) redirect("/shop/printer?error=Agent+management+is+not+configured");
  const { data: revoked, error } = await admin
    .from("desktop_agents")
    .update({
      is_revoked: true,
      revoked_at: new Date().toISOString(),
      status: "offline",
    })
    .eq("id", agentId.data)
    .eq("shop_id", context.shop.id)
    .select("id").maybeSingle();

  if (error || !revoked) {
    redirect("/shop/printer?error=Could+not+revoke+agent");
  }

  revalidatePath("/shop/printer");
  redirect("/shop/printer?success=Agent+access+revoked");
}

export async function updateShopBillingMode(formData: FormData) {
  const context = await getShopContext();
  if (!context || !canManageShop(context)) {
    redirect("/shop/subscription?error=Permission+denied");
  }

  const mode = z.enum(["customer_fee", "shop_subscription"]).safeParse(formData.get("billingMode"));
  if (!mode.success) {
    redirect("/shop/subscription?error=Invalid+billing+mode");
  }

  if (mode.data === "shop_subscription") {
    const { data: subscription } = await context.client.from("subscriptions")
      .select("status, trial_end, current_period_end").eq("shop_id", context.shop.id).maybeSingle();
    if (!hasSubscriptionAccess(subscription)) redirect("/shop/subscription?error=Choose+a+plan+and+pay+to+activate+subscription+billing");
  }

  const { error } = await context.client
    .from("shop_settings")
    .update({ billing_mode: mode.data })
    .eq("shop_id", context.shop.id);

  if (error) {
    redirect("/shop/subscription?error=Could+not+update+billing+mode");
  }

  revalidatePath("/shop/subscription");
  redirect("/shop/subscription?success=Billing+mode+updated");
}

