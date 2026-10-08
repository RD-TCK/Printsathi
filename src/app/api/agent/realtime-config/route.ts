import { NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/agent/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await authenticateAgent(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized agent." }, { status: 401 });
  }

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();

  return NextResponse.json({
    success: true,
    supabaseUrl,
    supabaseAnonKey,
  });
}
