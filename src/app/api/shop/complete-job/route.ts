import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const client = await createSupabaseServerClient();
  if (!client) {
    return NextResponse.json({ error: "Authentication not configured." }, { status: 503 });
  }

  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: member } = await client
    .from("shop_members")
    .select("shop_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member) {
    return NextResponse.json({ error: "Not a shop member." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { jobId, status = "completed", reason = null } = body;

  if (!jobId) {
    return NextResponse.json({ error: "Missing jobId." }, { status: 400 });
  }

  const adminClient = createSupabaseAdminClient() || client;

  // Update job status
  const updatePayload: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === "completed") {
    updatePayload.completed_at = new Date().toISOString();
  } else if (status === "failed") {
    updatePayload.failure_reason = reason || "Web print dispatch failed";
  }

  const { data, error } = await adminClient
    .from("print_jobs")
    .update(updatePayload)
    .eq("id", jobId)
    .eq("shop_id", member.shop_id)
    .select("id, status")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, job: data });
}
