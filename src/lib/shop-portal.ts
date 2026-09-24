import { createSupabaseServerClient, getCurrentProfile, getCurrentUser } from "@/lib/supabase/server";
import { ensureShopForUser } from "@/lib/ensure-shop";

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
  if (!client || !user || !profile) return null;

  let { data: membership } = await client
    .from("shop_members")
    .select("shop_id, role")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!membership) {
    // Auto-register shop if metadata exists
    if (user.user_metadata?.shop_name) {
      await ensureShopForUser(client, user);
      const { data: newMembership } = await client
        .from("shop_members")
        .select("shop_id, role")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      membership = newMembership;
    }
  }

  if (!membership) return null;

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

export function getISTStartOfDay(date = new Date()): Date {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  const parts = formatter.formatToParts(date);
  const year = parseInt(parts.find((p) => p.type === "year")?.value || String(date.getFullYear()), 10);
  const month = parseInt(parts.find((p) => p.type === "month")?.value || String(date.getMonth() + 1), 10) - 1;
  const day = parseInt(parts.find((p) => p.type === "day")?.value || String(date.getDate()), 10);

  const istMidnightUtc = Date.UTC(year, month, day, 0, 0, 0) - (5 * 60 + 30) * 60 * 1000;
  return new Date(istMidnightUtc);
}

export function getISTDateString(date: Date | string = new Date()): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function formatISTDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return (
    d.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }) + " IST"
  );
}

