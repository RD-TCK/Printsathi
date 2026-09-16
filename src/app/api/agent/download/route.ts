import { NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import path from "node:path";
import { getAgentDownloadUrl } from "@/lib/env";
export const runtime = "nodejs";
export async function GET() {
  const url = getAgentDownloadUrl();
  if (url) {
    try { const target = new URL(url); if (!["http:", "https:"].includes(target.protocol)) throw new Error(); return NextResponse.redirect(target); }
    catch { return NextResponse.json({ error: "Agent download URL is invalid." }, { status: 503 }); }
  }
  const binary = process.env.AGENT_BINARY_PATH || path.join(process.cwd(), "dist", "PrintSaathiAgent.exe");
  try {
    const info = await stat(/* turbopackIgnore: true */ binary);
    return new Response(Readable.toWeb(createReadStream(/* turbopackIgnore: true */ binary)) as ReadableStream, { headers: {
      "Content-Type": "application/octet-stream", "Content-Disposition": 'attachment; filename="PrintSaathiAgent.exe"',
      "Content-Length": String(info.size), "Cache-Control": "no-store",
    } });
  } catch { return NextResponse.json({ error: "Agent download is not available yet. Build it with npm run build:agent, or configure AGENT_DOWNLOAD_URL." }, { status: 503 }); }
}
