import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { EmailOtpType } from "@supabase/supabase-js";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") || "/shop";

  // If Supabase returned an error in query parameters (e.g., otp_expired)
  const errorDescription = searchParams.get("error_description");
  if (errorDescription) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(errorDescription)}`
    );
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.redirect(
      `${origin}/login?error=Authentication+service+not+configured.`
    );
  }

  let sessionSuccess = false;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      sessionSuccess = true;
    }
  } else if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type });
    if (!error) {
      sessionSuccess = true;
    }
  }

  if (sessionSuccess) {
    // If user has shop metadata from registration, make sure their shop is registered
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const metadata = user?.user_metadata ?? {};
      if (metadata.shop_name && metadata.shop_slug) {
        await supabase.rpc("register_shop", {
          shop_name: metadata.shop_name,
          shop_slug: metadata.shop_slug,
          shop_phone: metadata.shop_phone || null,
        });
      }
    } catch {
      // Non-blocking: getShopContext will also auto-register if missing
    }

    return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(
    `${origin}/login?error=Invalid+or+expired+authentication+link.+Please+sign+in+directly.`
  );
}
