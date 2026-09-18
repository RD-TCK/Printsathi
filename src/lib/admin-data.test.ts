import { beforeEach, expect, it, vi } from "vitest";
import { getCurrentProfile } from "./supabase/server";
import { createSupabaseAdminClient } from "./supabase/admin";
import { loadAdminData, readAdminRows } from "./admin-data";
vi.mock("./supabase/server", () => ({ getCurrentProfile: vi.fn() }));
vi.mock("./supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
beforeEach(() => vi.resetAllMocks());
it.each([null, { role: "shop_owner" }, { role: "shop_staff" }, { role: "customer" }])(
  "does not open a privileged database connection for %j",
  async (profile) => {
    vi.mocked(getCurrentProfile).mockResolvedValue(profile as never);
    expect(await loadAdminData()).toBeNull();
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
  },
);
it("allows only an authenticated admin to request the privileged connection", async () => {
  vi.mocked(getCurrentProfile).mockResolvedValue({ role: "admin" } as never);
  vi.mocked(createSupabaseAdminClient).mockReturnValue(null);
  await expect(loadAdminData()).rejects.toThrow("not configured");
  expect(createSupabaseAdminClient).toHaveBeenCalledOnce();
});
it("reads beyond the first database page without truncating totals", async () => {
  const read = vi
    .fn()
    .mockResolvedValueOnce({ data: Array.from({ length: 500 }, (_, id) => ({ id })), error: null })
    .mockResolvedValueOnce({ data: [{ id: 500 }], error: null });
  expect(await readAdminRows(read)).toHaveLength(501);
  expect(read).toHaveBeenNthCalledWith(2, 500, 999);
});
it("rejects partial data when a later page fails", async () => {
  const read = vi
    .fn()
    .mockResolvedValueOnce({ data: Array(500).fill({ id: 1 }), error: null })
    .mockResolvedValueOnce({ data: null, error: { message: "Database unavailable" } });
  await expect(readAdminRows(read)).rejects.toThrow("Database unavailable");
});
