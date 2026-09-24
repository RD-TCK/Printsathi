import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentProfile } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { clearShopDataAction } from "./actions";

vi.mock("@/lib/supabase/server", () => ({ getCurrentProfile: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

describe("clearShopDataAction", () => {
  const mockFrom = vi.fn();
  const mockStorage = {
    from: vi.fn().mockReturnValue({
      remove: vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
  };

  const createQueryMock = (data: any = []) => {
    const q: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: data?.[0] || data, error: null }),
      then: (resolve: any) => Promise.resolve({ data, error: null }).then(resolve),
    };
    return q;
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mockStorage.from.mockReturnValue({
      remove: vi.fn().mockResolvedValue({ data: [], error: null }),
    });
  });

  it("rejects without valid 'CLEAR' confirmation text", async () => {
    const res = await clearShopDataAction({
      shopId: "shop-1",
      confirmationText: "WRONG",
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/CLEAR/);
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("rejects non-admin profiles", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ role: "shop_owner" } as never);
    const res = await clearShopDataAction({
      shopId: "shop-1",
      confirmationText: "CLEAR",
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Unauthorized/);
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("rejects if admin client is not configured", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ role: "admin" } as never);
    vi.mocked(createSupabaseAdminClient).mockReturnValue(null);

    const res = await clearShopDataAction({
      shopId: "shop-1",
      confirmationText: "CLEAR",
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Admin database connection not configured/);
  });

  it("successfully clears a single shop's jobs and analytics data", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ role: "admin" } as never);

    const mockClient = {
      from: mockFrom,
      storage: mockStorage,
    };
    vi.mocked(createSupabaseAdminClient).mockReturnValue(mockClient as never);

    mockFrom.mockImplementation((table: string) => {
      if (table === "shops") {
        return createQueryMock({ id: "shop-1", name: "Test Shop" });
      }
      if (table === "orders") {
        return createQueryMock([{ id: "order-1" }]);
      }
      if (table === "print_jobs") {
        return createQueryMock([{ id: "job-1" }]);
      }
      if (table === "documents") {
        return createQueryMock([{ id: "doc-1", storage_path: "path/to/doc.pdf" }]);
      }
      if (table === "payments") {
        return createQueryMock([{ id: "pay-1" }]);
      }
      return createQueryMock([]);
    });

    const res = await clearShopDataAction({
      shopId: "shop-1",
      confirmationText: "CLEAR",
    });

    expect(res.success).toBe(true);
    expect(res.deleted?.orders).toBe(1);
    expect(res.deleted?.jobs).toBe(1);
    expect(res.deleted?.documents).toBe(1);
    expect(mockStorage.from).toHaveBeenCalledWith("print-documents");
  });

  it("successfully clears all platform shops data when shopId is 'all'", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ role: "admin" } as never);

    const mockClient = {
      from: mockFrom,
      storage: mockStorage,
    };
    vi.mocked(createSupabaseAdminClient).mockReturnValue(mockClient as never);

    mockFrom.mockImplementation((table: string) => {
      if (table === "orders") {
        return createQueryMock([{ id: "order-1" }, { id: "order-2" }]);
      }
      if (table === "print_jobs") {
        return createQueryMock([{ id: "job-1" }, { id: "job-2" }]);
      }
      if (table === "documents") {
        return createQueryMock([{ id: "doc-1", storage_path: "path/1.pdf" }]);
      }
      if (table === "payments") {
        return createQueryMock([{ id: "pay-1" }]);
      }
      return createQueryMock([]);
    });

    const res = await clearShopDataAction({
      shopId: "all",
      confirmationText: "CLEAR",
    });

    expect(res.success).toBe(true);
    expect(res.deleted?.orders).toBe(2);
    expect(res.deleted?.jobs).toBe(2);
    expect(res.deleted?.documents).toBe(1);
  });
});
