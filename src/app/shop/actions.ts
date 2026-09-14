"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { canManageShop, getShopContext } from "@/lib/shop-portal";
import { generatePairingCode } from "@/lib/agent/auth";

const pricingSchema = z.object({
  colorMode: z.enum(["black_and_white", "color"]),
  paperSize: z.enum(["a4", "a3", "letter", "legal"]),
  minPages: z.coerce.number().int().min(1),
  maxPages: z.preprocess(
    (value) => (value === "" || value === undefined ? null : value),
    z.coerce.number().int().min(1).nullable(),
  ),
  pricePerPage: z.coerce.number().min(0).max(100000),
});

function result(message: string, error = false): never {
  redirect(`/shop/pricing?${error ? "error" : "success"}=${encodeURIComponent(message)}`);
}

export async function createPricingRule(formData: FormData) {
  const context = await getShopContext();
  if (!context || !canManageShop(context)) result("You do not have permission to manage pricing.", true);
  const parsed = pricingSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success || (parsed.data.maxPages !== null && parsed.data.minPages > parsed.data.maxPages))
    result("Enter a valid page range and price.", true);
  const { data: conflict } = await context.client
    .from("pricing_rules")
    .select("id")
    .eq("shop_id", context.shop.id)
    .eq("color_mode", parsed.data.colorMode)
    .eq("paper_size", parsed.data.paperSize)
    .eq("min_pages", parsed.data.minPages)
    .eq("is_active", true)
    .maybeSingle();
  if (conflict) result("An active rule already starts at this page range.", true);
  const { error } = await context.client.from("pricing_rules").insert({
    shop_id: context.shop.id,
    color_mode: parsed.data.colorMode,
    paper_size: parsed.data.paperSize,
    min_pages: parsed.data.minPages,
    max_pages: parsed.data.maxPages,
    price_per_page: parsed.data.pricePerPage,
    is_active: true,
  });
  if (error) result("Could not save the pricing rule.", true);
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
    .update({ is_active: false })
    .eq("id", id.data)
    .eq("shop_id", context.shop.id);
  if (error) result("Could not deactivate the pricing rule.", true);
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
  if (error) result("Could not delete the pricing rule.", true);
  revalidatePath("/shop/pricing");
  result("Pricing rule permanently deleted.");
}

export async function updatePricingRule(formData: FormData) {
  const context = await getShopContext();
  if (!context || !canManageShop(context)) result("You do not have permission to manage pricing.", true);
  const id = z.string().uuid().safeParse(formData.get("id"));
  const parsed = pricingSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!id.success || !parsed.success || (parsed.data.maxPages !== null && parsed.data.minPages > parsed.data.maxPages))
    result("Enter a valid page range and price.", true);
  const { data: conflict } = await context.client
    .from("pricing_rules")
    .select("id")
    .eq("shop_id", context.shop.id)
    .eq("color_mode", parsed.data.colorMode)
    .eq("paper_size", parsed.data.paperSize)
    .eq("min_pages", parsed.data.minPages)
    .eq("is_active", true)
    .neq("id", id.data)
    .maybeSingle();
  if (conflict) result("An active rule already starts at this page range.", true);
  const { error } = await context.client
    .from("pricing_rules")
    .update({
      color_mode: parsed.data.colorMode,
      paper_size: parsed.data.paperSize,
      min_pages: parsed.data.minPages,
      max_pages: parsed.data.maxPages,
      price_per_page: parsed.data.pricePerPage,
    })
    .eq("id", id.data)
    .eq("shop_id", context.shop.id);
  if (error) result("Could not update the pricing rule.", true);
  revalidatePath("/shop/pricing");
  result("Pricing rule updated.");
}

export async function quickSetupPricing(formData: FormData) {
  const context = await getShopContext();
  if (!context || !canManageShop(context)) result("You do not have permission to manage pricing.", true);

  const colorModeRaw = formData.get("colorMode") as string;
  const colorMode = colorModeRaw === "color" ? "color" : "black_and_white";

  // Deactivate existing rules for this mode + A4
  await context.client
    .from("pricing_rules")
    .update({ is_active: false })
    .eq("shop_id", context.shop.id)
    .eq("color_mode", colorMode)
    .eq("paper_size", "a4")
    .eq("is_active", true);

  // Insert slab 1: 1–5 pages @ ₹5/page
  const { error: err1 } = await context.client.from("pricing_rules").insert({
    shop_id: context.shop.id,
    color_mode: colorMode,
    paper_size: "a4",
    min_pages: 1,
    max_pages: 5,
    price_per_page: 5,
    is_active: true,
  });
  if (err1) result("Could not create pricing rule (slab 1).", true);

  // Insert slab 2: 6+ pages @ ₹2/page
  const { error: err2 } = await context.client.from("pricing_rules").insert({
    shop_id: context.shop.id,
    color_mode: colorMode,
    paper_size: "a4",
    min_pages: 6,
    max_pages: null,
    price_per_page: 2,
    is_active: true,
  });
  if (err2) result("Could not create pricing rule (slab 2).", true);

  revalidatePath("/shop/pricing");
  result(`Quick pricing setup applied: 1–5 pages @ ₹5, 6+ pages @ ₹2 (${colorMode === "color" ? "Color" : "B&W"}, A4).`);
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
  const { error: settingsError } = await context.client
    .from("shop_settings")
    .update({ accepting_orders: parsed.data.acceptingOrders === "true" })
    .eq("shop_id", context.shop.id);
  if (shopError || settingsError) redirect("/shop/settings?error=Could+not+save+settings");
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

  // Set all shop printers to is_default = false, then set target printer to is_default = true
  await context.client.from("printers").update({ is_default: false }).eq("shop_id", context.shop.id);

  const { error } = await context.client
    .from("printers")
    .update({ is_default: true })
    .eq("id", printerId.data)
    .eq("shop_id", context.shop.id);

  if (error) {
    redirect("/shop/printer?error=Could+not+update+default+printer");
  }

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

  const { error } = await context.client
    .from("desktop_agents")
    .update({
      is_revoked: true,
      revoked_at: new Date().toISOString(),
      status: "offline",
    })
    .eq("id", agentId.data)
    .eq("shop_id", context.shop.id);

  if (error) {
    redirect("/shop/printer?error=Could+not+revoke+agent");
  }

  revalidatePath("/shop/printer");
  redirect("/shop/printer?success=Agent+access+revoked");
}
