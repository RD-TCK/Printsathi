import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";

export async function createSupabaseServerClient() {
  if (!publicEnv.NEXT_PUBLIC_SUPABASE_URL || !publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;
  const cookieStore = await cookies();
  return createServerClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookieOptions: {
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, {
              ...options,
              maxAge: 60 * 60 * 24 * 365,
              path: "/",
              sameSite: "lax",
              secure: process.env.NODE_ENV === "production",
            }),
          );
        } catch {
          return;
        }
      },
    },
  });
}

export async function getCurrentUser() {
  const client = await createSupabaseServerClient();
  if (!client) return null;
  const {
    data: { user },
  } = await client.auth.getUser();
  return user;
}

export async function getCurrentProfile() {
  const client = await createSupabaseServerClient();
  if (!client) return null;
  const user = await getCurrentUser();
  if (!user) return null;

  const { data } = await client.from("profiles").select("id, role, full_name").eq("id", user.id).maybeSingle();
  if (data) return data;

  // Fallback: If profile row is missing or being initialized
  const { data: membership } = await client
    .from("shop_members")
    .select("role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  const inferredRole = membership?.role || (user.user_metadata?.shop_name ? "shop_owner" : "customer");
  const inferredName = (user.user_metadata?.full_name as string) || null;

  try {
    await client.from("profiles").upsert({
      id: user.id,
      role: inferredRole,
      full_name: inferredName,
    });
  } catch {
    // Non-blocking
  }

  return {
    id: user.id,
    role: inferredRole,
    full_name: inferredName,
  };
}
