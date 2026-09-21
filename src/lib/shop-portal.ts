import { createSupabaseServerClient, getCurrentProfile, getCurrentUser } from "@/lib/supabase/server";

export type ShopContext = {
  client: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;
  userId: string;
  profile: { id: string; role: string; full_name: string | null };
  shop: {
    id: string;
    public_id: string;
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    is_active: boolean;
  };
  membership: { role: "shop_owner" | "shop_staff" };
};

export async function getShopContext(): Promise<ShopContext | null> {
  const client = await createSupabaseServerClient();
  const user = await getCurrentUser();
  const profile = await getCurrentProfile();
  if (!client || !user || !profile || !["shop_owner", "shop_staff", "admin"].includes(profile.role)) return null;

  const { data: membership } = await client
    .from("shop_members")
    .select("shop_id, role")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!membership) {
    // If user has shop metadata from registration, auto-register their shop
    const metadata = user.user_metadata ?? {};
    if (metadata.shop_name && metadata.shop_slug) {
      try {
        const { data: newShop } = await client.rpc("register_shop", {
          shop_name: metadata.shop_name,
          shop_slug: metadata.shop_slug,
          shop_phone: metadata.shop_phone || null,
        });
        if (newShop) {
          return {
            client,
            userId: user.id,
            profile: { id: user.id, role: "shop_owner", full_name: profile.full_name },
            shop: newShop,
            membership: { role: "shop_owner" },
          };
        }
      } catch (e) {
        console.error("Auto-register shop in getShopContext failed:", e);
      }
    }
    return null;
  }

  const { data: shop } = await client
    .from("shops")
    .select("id, public_id, name, phone, email, address, is_active")
    .eq("id", membership.shop_id)
    .maybeSingle();

  if (!shop) return null;
  return { client, userId: user.id, profile, shop, membership: { role: membership.role } };
}

export function canManageShop(context: ShopContext) {
  return context.membership.role === "shop_owner" || context.profile.role === "admin";
}

export function formatStatus(value: string | null | undefined) {
  return (value ?? "unknown").replaceAll("_", " ").toUpperCase();
}

export function isHeartbeatFresh(lastHeartbeatAt: string | null | undefined, thresholdMs = 30000): boolean {
  if (!lastHeartbeatAt) return false;
  const heartbeatTime = new Date(lastHeartbeatAt).getTime();
  const currentTime = new Date().getTime();
  return currentTime - heartbeatTime < thresholdMs;
}
