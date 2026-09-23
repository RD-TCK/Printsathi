import type { ReactNode } from "react";
import { ProtectedLayout } from "@/components/protected-layout";
import { ShopPortalShell } from "@/components/shop-portal-shell";
import { getShopContext } from "@/lib/shop-portal";

export default async function ShopOwnerLayout({ children }: { children: ReactNode }) {
  const context = await getShopContext();
  const { data: settings } = context
    ? await context.client
        .from("shop_settings")
        .select("accepting_orders")
        .eq("shop_id", context.shop.id)
        .maybeSingle()
    : { data: null };

  const initialAcceptingOrders = settings?.accepting_orders ?? true;

  return (
    <ProtectedLayout allowedRoles={["shop_owner", "shop_staff", "admin"]}>
      {context ? (
        <ShopPortalShell
          shopName={context.shop.name}
          publicId={context.shop.public_id}
          userName={context.profile.full_name}
          membershipRole={context.membership.role}
          initialAcceptingOrders={initialAcceptingOrders}
        >
          {children}
        </ShopPortalShell>
      ) : (
        children
      )}
    </ProtectedLayout>
  );
}
