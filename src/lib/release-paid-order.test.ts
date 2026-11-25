import { describe, expect, it, vi } from "vitest";
import { releasePaidOrder } from "./release-paid-order";

describe("releasePaidOrder lifecycle safety", () => {
  it("releases only unreleased jobs and never resets claimed/submitted/completed/odd_printed jobs", async () => {
    const jobUpdates: Array<{ id: string; payload: Record<string, unknown>; allowedStatuses: string[] }> = [];
    const orderUpdates: Array<{ payload: Record<string, unknown>; allowedStatuses: string[] }> = [];

    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === "print_jobs") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: "job-awaiting-double",
                    status: "awaiting_payment",
                    duplex_step: "none",
                    print_job_pages: [{ side_mode: "double_sided" }],
                  },
                  {
                    id: "job-awaiting-single",
                    status: "awaiting_payment",
                    duplex_step: "none",
                    print_job_pages: [{ side_mode: "single_sided" }],
                  },
                  {
                    id: "job-submitted-locked",
                    status: "print_submitted",
                    duplex_step: "odd_printed",
                    print_job_pages: [{ side_mode: "double_sided" }],
                  },
                  {
                    id: "job-completed-locked",
                    status: "completed",
                    duplex_step: "completed",
                    print_job_pages: [{ side_mode: "single_sided" }],
                  },
                ],
                error: null,
              }),
            }),
            update: vi.fn((payload: Record<string, unknown>) => ({
              eq: vi.fn((_col: string, jobId: string) => ({
                in: vi.fn(async (_statusCol: string, statuses: string[]) => {
                  jobUpdates.push({ id: jobId, payload, allowedStatuses: statuses });
                  return { error: null };
                }),
              })),
            })),
          };
        }
        if (table === "orders") {
          return {
            update: vi.fn((payload: Record<string, unknown>) => ({
              eq: vi.fn(() => ({
                in: vi.fn(async (_col: string, statuses: string[]) => {
                  orderUpdates.push({ payload, allowedStatuses: statuses });
                  return { error: null };
                }),
              })),
            })),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    };

    await releasePaidOrder(mockClient as never, "order-123");

    expect(orderUpdates).toHaveLength(1);
    expect(orderUpdates[0]).toEqual({
      payload: { status: "partially_printed" },
      allowedStatuses: ["draft", "awaiting_payment"],
    });

    // Only the two awaiting_payment jobs are touched; print_submitted/completed/odd_printed are untouched
    expect(jobUpdates.map((u) => u.id)).toEqual(["job-awaiting-double", "job-awaiting-single"]);
    expect(jobUpdates[0].payload.duplex_step).toBe("odd");
    expect(jobUpdates[1].payload.duplex_step).toBe("none");
    expect(jobUpdates[0].allowedStatuses).toEqual(["draft", "awaiting_payment"]);
  });
});
