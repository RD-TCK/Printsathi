import { describe, it, expect, vi } from "vitest";
import { GET } from "./route";

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(),
}));

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

describe("GET /api/customer/order-readiness", () => {
  it("returns 400 when orderId or accessToken is missing", async () => {
    const req = new Request("http://localhost:3000/api/customer/order-readiness");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Missing");
  });

  it("returns 403 when access token does not match order", async () => {
    (createSupabaseAdminClient as any).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      }),
    });

    const req = new Request("http://localhost:3000/api/customer/order-readiness?orderId=ord-123&accessToken=test-token-1234567890");
    const res = await GET(req);
    expect(res.status).toBe(403);
  });
});
