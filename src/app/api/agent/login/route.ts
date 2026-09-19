import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { generateAgentToken, hashAgentToken } from "@/lib/agent/auth";

const agentLoginSchema = z.object({
  email: z.string().trim().email("Please enter a valid email address."),
  password: z.string().min(1, "Password is required."),
  agentName: z.string().min(1).max(100).optional(),
  version: z.string().max(50).optional(),
  machineInfo: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = agentLoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid login request payload.", details: parsed.error.format() }, { status: 400 });
  }

  const adminClient = createSupabaseAdminClient();
  if (!adminClient || !publicEnv.NEXT_PUBLIC_SUPABASE_URL || !publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: "Database service not configured." }, { status: 503 });
  }

  const { email, password, agentName = "Windows Agent", version = "1.0.0", machineInfo = {} } = parsed.data;

  // 1. Authenticate user credentials with a dedicated auth client so adminClient retains its service_role privileges
  const authClient = createClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
    email,
    password,
  });

  if (authError || !authData.user) {
    return NextResponse.json({ error: authError?.message || "Invalid email or password." }, { status: 401 });
  }

  const userId = authData.user.id;

  // 2. Lookup shop membership
  const { data: member } = await adminClient
    .from("shop_members")
    .select("shop_id, role")
    .eq("user_id", userId)
    .maybeSingle();

  let targetShopId = member?.shop_id;

  if (!targetShopId) {
    // Check if user has an admin profile or owns a shop
    const { data: profile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();

    if (profile?.role === "admin") {
      const { data: firstShop } = await adminClient
        .from("shops")
        .select("id")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      targetShopId = firstShop?.id;
    }
  }

  if (!targetShopId) {
    return NextResponse.json(
      { error: "No shop workspace found for this user account. Please create or configure a shop first." },
      { status: 403 },
    );
  }

  // 3. Verify shop
  const { data: shop, error: shopError } = await adminClient
    .from("shops")
    .select("id, name, public_id, is_active")
    .eq("id", targetShopId)
    .maybeSingle();

  if (shopError || !shop || !shop.is_active) {
    return NextResponse.json({ error: "Shop is inactive or could not be found." }, { status: 403 });
  }

  // 4. Generate Agent token
  const agentToken = generateAgentToken();
  const tokenHash = hashAgentToken(agentToken);

  const { data: newAgent, error: agentError } = await adminClient
    .from("desktop_agents")
    .insert({
      shop_id: shop.id,
      name: agentName,
      version,
      status: "online",
      auth_token_hash: tokenHash,
      machine_info: machineInfo,
      last_heartbeat_at: new Date().toISOString(),
      is_revoked: false,
    })
    .select("id, name, status, created_at")
    .single();

  if (agentError || !newAgent) {
    return NextResponse.json(
      { error: agentError?.message || "Failed to initialize desktop agent profile." },
      { status: 500 }
    );
  }

  // 5. Audit log
  await adminClient.from("audit_logs").insert({
    shop_id: shop.id,
    action: "agent_direct_login",
    entity_type: "desktop_agent",
    entity_id: newAgent.id,
    metadata: {
      user_id: userId,
      user_email: email,
      agent_id: newAgent.id,
      agent_name: agentName,
      version,
      machine_info: machineInfo,
    },
  });

  return NextResponse.json({
    success: true,
    agentId: newAgent.id,
    shopId: shop.id,
    shopName: shop.name,
    shopPublicId: shop.public_id,
    agentToken,
  });
}
