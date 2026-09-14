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
  return data;
}
