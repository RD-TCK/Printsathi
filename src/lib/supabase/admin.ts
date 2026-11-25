import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";

import { devMetricsFetch } from "./metrics";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedAdminClient: SupabaseClient<any, "public", any> | null = null;
let cachedAdminKey = "";

export function createSupabaseAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = publicEnv.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceRoleKey || !supabaseUrl) return null;

  const cacheKey = `${supabaseUrl}:${serviceRoleKey}`;
  if (cachedAdminClient && cachedAdminKey === cacheKey) {
    return cachedAdminClient;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cachedAdminClient = createClient<any>(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: devMetricsFetch },
  });
  cachedAdminKey = cacheKey;
  return cachedAdminClient;
}
