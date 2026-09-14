import { NextResponse } from "next/server";
import { getAgentDownloadUrl } from "@/lib/env";

/**
 * GET /api/agent/download
 *
 * Redirects to the latest PrintSaathi Windows Desktop Agent release on
 * GitHub. Override the destination with the AGENT_DOWNLOAD_URL env var
 * (useful for self-hosted deployments that serve the binary directly).
 */
export async function GET() {
  const url = getAgentDownloadUrl();
  return NextResponse.redirect(url, { status: 302 });
}
