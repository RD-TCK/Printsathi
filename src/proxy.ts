import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!publicEnv.NEXT_PUBLIC_SUPABASE_URL || !publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return response;
  }

  // Fast path: if there are no Supabase auth cookies, return immediately (0ms)
  const allCookies = request.cookies.getAll();
  const hasAuthCookie = allCookies.some(
    (c) => c.name.startsWith("sb-") && (c.name.includes("auth-token") || c.name.includes("access-token")),
  );

  if (!hasAuthCookie) {
    return response;
  }

  const client = createServerClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookieOptions: {
      maxAge: 60 * 60 * 24 * 365, // 1 year persistence
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, {
            ...options,
            maxAge: 60 * 60 * 24 * 365,
            path: "/",
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
          }),
        );
      },
    },
  });

  // Refresh auth token safely with short timeout so proxy never blocks or lags page transitions
  try {
    const authPromise = client.auth.getUser();
    const timeoutPromise = new Promise<{ data: { user: null }; error: Error }>((resolve) =>
      setTimeout(() => resolve({ data: { user: null }, error: new Error("Auth timeout") }), 500)
    );
    await Promise.race([authPromise, timeoutPromise]);
  } catch {
    // Ignore refresh failures in proxy
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
