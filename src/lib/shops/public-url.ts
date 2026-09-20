import { getAppUrl } from "@/lib/env";

export function getShopCustomerUrl(publicIdentifier: string) {
  const baseUrl = getAppUrl() || "https://printiva.co.in";
  return new URL(`/shop/${encodeURIComponent(publicIdentifier)}`, baseUrl).toString();
}
