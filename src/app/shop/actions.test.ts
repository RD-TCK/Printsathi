import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ context: vi.fn(), manage: vi.fn(), admin: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/shop-portal", () => ({ getShopContext: mocks.context, canManageShop: mocks.manage }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: mocks.admin }));
vi.mock("@/lib/agent/auth", () => ({ generatePairingCode: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(url);
  },
}));
import { setDefaultPrinter, updateShopSettings } from "./actions";
const printerId = "11111111-1111-4111-8111-111111111111";
describe("owner printer configuration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.context.mockResolvedValue({
      shop: { id: "owner-shop" },
      client: {
        from: () => {
          throw new Error("Read-only client must not write printers");
        },
      },
    });
    mocks.manage.mockReturnValue(true);
    mocks.admin.mockReturnValue({ from: mocks.from });
  });
  it("uses the authorized server client and scopes writes to the owner's shop", async () => {
    const query = { update: vi.fn(), eq: vi.fn(), neq: vi.fn(), select: vi.fn(), maybeSingle: vi.fn() };
    query.update.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.select.mockReturnValue(query);
    query.neq.mockResolvedValue({ error: null });
    query.maybeSingle.mockResolvedValue({ data: { id: printerId }, error: null });
    mocks.from.mockReturnValue(query);
    const form = new FormData();
    form.set("printerId", printerId);
    await expect(setDefaultPrinter(form)).rejects.toThrow("success=Default+printer+updated");
    expect(query.eq).toHaveBeenCalledWith("shop_id", "owner-shop");
    expect(query.neq).toHaveBeenCalledWith("id", printerId);
  });
  it("rejects staff before using elevated database access", async () => {
    mocks.manage.mockReturnValue(false);
    await expect(setDefaultPrinter(new FormData())).rejects.toThrow("Permission+denied");
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("does not claim success when no printer row was updated", async () => {
    const query = { update: vi.fn(), eq: vi.fn(), select: vi.fn(), maybeSingle: vi.fn() };
    query.update.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.select.mockReturnValue(query);
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.from.mockReturnValue(query);
    const form = new FormData();
    form.set("printerId", printerId);
    await expect(setDefaultPrinter(form)).rejects.toThrow("error=Could+not+update");
  });
});

describe("owner shop settings configuration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.manage.mockReturnValue(true);
  });

  it("updates shop and settings with allow_double_sided option", async () => {
    const shopUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    const settingsUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    const settingsSelect = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { shop_id: "owner-shop", razorpay_key_secret: null, razorpay_webhook_secret: null },
            error: null,
          }),
        }),
      }),
      update: settingsUpdate,
    };

    const client = {
      from: vi.fn((table: string) => {
        if (table === "shops") return { update: shopUpdate };
        if (table === "shop_settings") return settingsSelect;
        throw new Error(`Unexpected table ${table}`);
      }),
    };

    mocks.context.mockResolvedValue({ shop: { id: "owner-shop", name: "My Shop" }, client });

    const form = new FormData();
    form.set("name", "Print Fast");
    form.set("phone", "+919876543210");
    form.set("email", "owner@print.com");
    form.set("address", "123 Market St");
    form.set("isActive", "true");
    form.set("acceptingOrders", "true");
    form.set("paymentMode", "both");
    form.set("allowDoubleSided", "false");

    await expect(updateShopSettings(form)).rejects.toThrow("success=Settings+saved");
    expect(settingsUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        allow_double_sided: false,
        accepting_orders: true,
        payment_mode: "both",
      }),
    );
  });
});
