import type { SupabaseClient, User } from "@supabase/supabase-js";

export async function ensureShopForUser(
  client: SupabaseClient,
  user: User,
  explicitShop?: { shopName?: string; shopSlug?: string; shopPhone?: string | null }
): Promise<string | null> {
  const metadata = user.user_metadata ?? {};
  const shopName = (explicitShop?.shopName || metadata.shop_name || "My Print Shop").trim();
  let baseSlug = (explicitShop?.shopSlug || metadata.shop_slug || shopName)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!baseSlug || baseSlug.length < 2) {
    baseSlug = "shop";
  }

  const shopPhone = explicitShop?.shopPhone || metadata.shop_phone || null;

  // 1. Check if user already has an active shop membership
  const { data: existingMember } = await client
    .from("shop_members")
    .select("shop_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (existingMember?.shop_id) {
    return existingMember.shop_id;
  }

  // 2. Try registering the shop with the desired slug
  let currentSlug = baseSlug;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const { data: newShop, error } = await client.rpc("register_shop", {
        shop_name: shopName,
        shop_slug: currentSlug,
        shop_phone: shopPhone,
      });

      if (!error && newShop) {
        return newShop.id;
      }

      if (error && error.message.toLowerCase().includes("already in use")) {
        // Slug collision: append random unique suffix and retry
        const suffix = Math.floor(100 + Math.random() * 900);
        currentSlug = `${baseSlug.slice(0, 70)}-${suffix}`;
      } else if (error) {
        break;
      }
    } catch {
      break;
    }
  }

  return null;
}
