import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { availablePrinters, isPhysical } from "@/lib/printer-availability";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type OnlinePrinterInfo = {
  id: string;
  name: string;
  isColor: boolean;
  paperSizes: string[];
  isDefault: boolean;
  status: "ready" | "offline";
};

export type PublicShop = {
  public_id: string;
  name: string;
  is_active: boolean;
  accepting_orders: boolean;
  status: "available" | "unavailable" | "inactive";
  printer_status: "ready" | "offline" | "not_connected";
  has_bw_printer: boolean;
  has_color_printer: boolean;
  bw_printer_status: "ready" | "offline" | "not_connected";
  color_printer_status: "ready" | "offline" | "not_connected";
  online_printers: OnlinePrinterInfo[];
};

export type PublicPricingRule = {
  color_mode: "black_and_white" | "color";
  paper_size: "a4" | "a3" | "letter" | "legal";
  min_pages: number;
  max_pages: number | null;
  price_per_page: number;
};

export async function getPublicShop(
  publicIdentifier: string,
): Promise<{ shop: PublicShop | null; configured: boolean }> {
  const client = await createSupabaseServerClient();
  if (!client) return { shop: null, configured: false };
  const { data, error } = await client
    .from("public_shop_directory")
    .select("public_id, name, is_active, accepting_orders, status")
    .eq("public_id", publicIdentifier)
    .maybeSingle();
  if (error) throw new Error("Unable to load shop directory");
  if (!data) return { shop: null, configured: true };

  // Fetch shop's internal ID and printers to check real-time color vs B&W connectivity
  let hasBw = false;
  let hasColor = false;
  let bwStatus: "ready" | "offline" | "not_connected" = "not_connected";
  let colorStatus: "ready" | "offline" | "not_connected" = "not_connected";
  let overallPrinterStatus: "ready" | "offline" | "not_connected" = "not_connected";
  const onlinePrinters: OnlinePrinterInfo[] = [];

  const inventoryClient = createSupabaseAdminClient() || client;
  const { data: shopRecord } = await inventoryClient.from("shops").select("id").eq("public_id", publicIdentifier).maybeSingle();

  if (shopRecord) {
    const [{ data: agents }, { data: printers }] = await Promise.all([
      inventoryClient
        .from("desktop_agents")
        .select("id, status, last_heartbeat_at")
        .eq("shop_id", shopRecord.id)
        .eq("is_revoked", false)
        .order("last_heartbeat_at", { ascending: false })
        ,
      inventoryClient
        .from("printers")
        .select("id, name, driver_name, desktop_agent_id, status, is_online, is_default, capabilities, last_seen_at")
        .eq("shop_id", shopRecord.id),
    ]);

    const printerList = (printers ?? []).filter(isPhysical);
    const available = new Set(availablePrinters(printerList, agents || []).map((p) => p.id));
    if (printerList.length > 0) {
      for (const p of printerList) {
        const isOnline = available.has(p.id);
        const caps = (p.capabilities ?? {}) as { colorSupport?: boolean; paperSizes?: string[] };
        const isColor = Boolean(caps.colorSupport);
        const paperSizes = Array.isArray(caps.paperSizes) ? caps.paperSizes : ["A4"];

        if (isColor) {
          hasColor = true;
          if (isOnline) {
            colorStatus = "ready";
          } else if (colorStatus !== "ready") {
            colorStatus = "offline";
          }
        } else {
          hasBw = true;
          if (isOnline) {
            bwStatus = "ready";
          } else if (bwStatus !== "ready") {
            bwStatus = "offline";
          }
        }

        if (isOnline) {
          onlinePrinters.push({
            id: p.id,
            name: p.name,
            isColor,
            paperSizes,
            isDefault: Boolean(p.is_default),
            status: "ready",
          });
        }
      }

      // If there's an online color printer, it can also print B&W
      if (hasColor && colorStatus === "ready" && bwStatus !== "ready") {
        hasBw = true;
        bwStatus = "ready";
      }

      if (bwStatus === "ready" || colorStatus === "ready") {
        overallPrinterStatus = "ready";
      } else if (bwStatus === "offline" || colorStatus === "offline") {
        overallPrinterStatus = "offline";
      }
    }
  }

  const isActive = data.is_active !== false;
  const isAccepting = data.accepting_orders !== false;

  const shop: PublicShop = {
    public_id: data.public_id,
    name: data.name,
    is_active: isActive,
    accepting_orders: isAccepting,
    status: isActive && isAccepting ? "available" : "inactive",
    printer_status: overallPrinterStatus,
    has_bw_printer: hasBw,
    has_color_printer: hasColor,
    bw_printer_status: bwStatus,
    color_printer_status: colorStatus,
    online_printers: onlinePrinters,
  };

  return { shop, configured: true };
}

export async function getPublicPricing(publicIdentifier: string): Promise<PublicPricingRule[]> {
  const client = await createSupabaseServerClient();
  if (!client) return [];
  const { data } = await client
    .from("public_shop_pricing")
    .select("color_mode, paper_size, min_pages, max_pages, price_per_page")
    .eq("public_id", publicIdentifier)
    .order("color_mode")
    .order("paper_size")
    .order("min_pages");
  return (data ?? []) as PublicPricingRule[];
}
