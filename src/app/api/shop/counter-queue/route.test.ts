import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET } from "./route";

const mockAdminClient = {
  from: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => mockAdminClient,
}));

vi.mock("@/lib/agent/auth", () => ({
  authenticateAgent: vi.fn().mockResolvedValue({
    shop: { id: "test-shop-id" },
    agent: { id: "test-agent-id" },
  }),
}));

describe("Counter Queue API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("filters out legacy %combined% documents and computes true total pages from raw documents", async () => {
    const mockOrder = {
      id: "order-1",
      public_id: "ord1",
      token_number: 2,
      status: "awaiting_payment",
      payment_mode: "counter",
      total_amount: 20,
      total_pages: 2, // Legacy overwritten total_pages
      color_pages: 0,
      black_and_white_pages: 10,
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      created_at: new Date().toISOString(),
      documents: [
        { id: "doc-1", original_filename: "UPITS_Day3_Report_27-09-2026.docx", page_count: 9 },
        { id: "doc-2", original_filename: "IMG-20261022-WA0002.jpg", page_count: 1 },
        { id: "doc-comb-1", original_filename: "Token #2 (All 2 pictures combined).pdf", page_count: 2 },
        { id: "doc-comb-2", original_filename: "Token #2 (All 2 pictures combined).pdf", page_count: 2 },
      ],
      print_jobs: [
        {
          id: "job-1",
          status: "queued",
          total_pages: 9,
          total_amount: 18,
          duplex_step: "none",
          print_job_pages: [{ side_mode: "single_sided", start_page: 1, end_page: 9, copies: 1 }],
        },
        {
          id: "job-2",
          status: "queued",
          total_pages: 1,
          total_amount: 2,
          duplex_step: "none",
          print_job_pages: [{ side_mode: "single_sided", start_page: 1, end_page: 1, copies: 1 }],
        },
      ],
    };

    mockAdminClient.from.mockImplementation((table: string) => {
      if (table === "shop_settings") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { payment_mode: "counter" } }),
        };
      }
      if (table === "orders") {
        const orderMock = vi.fn().mockImplementation(() => ({
          order: vi.fn().mockResolvedValue({ data: [mockOrder], error: null }),
        }));
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          order: orderMock,
        };
      }
      return {};
    });

    const request = new Request("http://localhost:3000/api/shop/counter-queue", {
      headers: { "x-agent-token": "valid-token" },
    });

    const response = await GET(request);
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.queue).toHaveLength(1);

    const item = json.queue[0];
    // True raw total pages: 9 (word doc) + 1 (jpg) = 10 pages
    expect(item.totalPages).toBe(10);
    // Legacy combined documents must be filtered out
    expect(item.documents).toHaveLength(2);
    expect(item.documents[0].filename).toBe("UPITS_Day3_Report_27-09-2026.docx");
    expect(item.documents[0].pageCount).toBe(9);
    expect(item.documents[1].filename).toBe("IMG-20261022-WA0002.jpg");
    expect(item.documents[1].pageCount).toBe(1);
  });
});
