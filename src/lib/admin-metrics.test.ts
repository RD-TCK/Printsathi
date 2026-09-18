import { expect, it } from "vitest";
import { summarizeJobs, agentOnline } from "./admin-metrics";

it("keeps failed and submitted pages and revenue out of successful print totals", () => {
  const jobs = ["completed", "failed", "print_submitted"].map((status) => ({
    status,
    total_amount: "20.50",
    print_job_pages: [
      { start_page: 2, end_page: 5 },
      { start_page: 10, end_page: 10 },
    ],
  }));
  expect(summarizeJobs(jobs)).toEqual({ completed: 1, failed: 1, pending: 1, revenue: 20.5, pages: 5 });
});
it("does not treat revoked or stale devices as connected", () => {
  const now = Date.parse("2026-09-18T12:00:00Z");
  const agent = { status: "online", is_revoked: false, last_heartbeat_at: new Date(now - 1000).toISOString() };
  expect(agentOnline(agent, now)).toBe(true);
  expect(agentOnline({ ...agent, is_revoked: true }, now)).toBe(false);
  expect(agentOnline({ ...agent, last_heartbeat_at: new Date(now - 30000).toISOString() }, now)).toBe(false);
  expect(agentOnline({ ...agent, last_heartbeat_at: null }, now)).toBe(false);
});
