import type { ReactNode } from "react";
import { ProtectedLayout } from "@/components/protected-layout";
import { ShopPortalShell } from "@/components/shop-portal-shell";
import { getShopContext } from "@/lib/shop-portal";

export default async function ShopOwnerLayout({ children }: { children: ReactNode }) {
  const context = await getShopContext();
  return (
    <ProtectedLayout allowedRoles={["shop_owner", "shop_staff", "admin"]}>
      {context ? (
        <ShopPortalShell
          shopName={context.shop.name}
          userName={context.profile.full_name}
          membershipRole={context.membership.role}
        >
          {children}
        </ShopPortalShell>
      ) : (
        children
      )}
    </ProtectedLayout>
  );
}
