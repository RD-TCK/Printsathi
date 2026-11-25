export function summarizeJobs(
  jobs: Array<{
    status: string;
    total_amount: number | string;
    print_job_pages: Array<{ start_page: number; end_page: number }>;
  }>,
) {
  let completed = 0;
  let failed = 0;
  let pending = 0;
  let revenue = 0;
  let pages = 0;

  for (const job of jobs) {
    if (job.status === "completed") {
      completed += 1;
      revenue += Number(job.total_amount || 0);
      for (const range of job.print_job_pages) {
        pages += range.end_page - range.start_page + 1;
      }
    } else if (job.status === "failed") {
      failed += 1;
    } else if (
      job.status === "paid" ||
      job.status === "queued" ||
      job.status === "claimed" ||
      job.status === "printing" ||
      job.status === "print_submitted"
    ) {
      pending += 1;
    }
  }

  return {
    completed,
    failed,
    pending,
    revenue,
    pages,
  };
}

export function agentOnline(
  agent: { status: string; is_revoked: boolean; last_heartbeat_at: string | null },
  now: number,
) {
  const age = now - Date.parse(agent.last_heartbeat_at || "");
  return !agent.is_revoked && agent.status === "online" && age >= 0 && age < 960000;
}
