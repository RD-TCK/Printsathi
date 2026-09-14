import { publicEnv } from "@/lib/env";

export function getShopCustomerUrl(publicIdentifier: string) {
  return new URL(`/shop/${encodeURIComponent(publicIdentifier)}`, publicEnv.NEXT_PUBLIC_APP_URL).toString();
}
