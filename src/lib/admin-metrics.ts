export function summarizeJobs(
  jobs: Array<{
    status: string;
    total_amount: number | string;
    print_job_pages: Array<{ start_page: number; end_page: number }>;
  }>,
) {
  const completed = jobs.filter((job) => job.status === "completed");
  return {
    completed: completed.length,
    failed: jobs.filter((job) => job.status === "failed").length,
    pending: jobs.filter((job) => ["paid", "queued", "claimed", "printing", "print_submitted"].includes(job.status))
      .length,
    revenue: completed.reduce((sum, job) => sum + Number(job.total_amount || 0), 0),
    pages: completed.reduce(
      (sum, job) =>
        sum + job.print_job_pages.reduce((total, range) => total + range.end_page - range.start_page + 1, 0),
      0,
    ),
  };
}

export function agentOnline(
  agent: { status: string; is_revoked: boolean; last_heartbeat_at: string | null },
  now: number,
) {
  const age = now - Date.parse(agent.last_heartbeat_at || "");
  return !agent.is_revoked && agent.status === "online" && age >= 0 && age < 30000;
}
