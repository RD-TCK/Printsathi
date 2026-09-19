"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppUrl } from "@/lib/env";

const credentialsSchema = z.object({
  email: z.string().trim().email("Please enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters long."),
});

const registrationSchema = credentialsSchema.extend({
  fullName: z.string().trim().min(1, "Please enter your name.").max(120, "Name cannot exceed 120 characters."),
  shopName: z.string().trim().min(2, "Shop name must be at least 2 characters.").max(160, "Shop name cannot exceed 160 characters."),
  shopSlug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, "Shop URL slug must be at least 2 characters.")
    .max(80, "Shop URL slug cannot exceed 80 characters.")
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Shop URL slug must only contain lowercase letters, numbers, and hyphens (e.g., 'central-print-shop').",
    ),
  shopPhone: z.string().trim().max(30).optional(),
});

function readFields(formData: FormData) {
  return Object.fromEntries(
    Array.from(formData.entries()).map(([key, value]) => [key, typeof value === "string" ? value : ""]),
  );
}

function loginError(message: string): never {
  redirect(`/login?error=${encodeURIComponent(message)}`);
}

export async function signIn(formData: FormData) {
  const parsed = credentialsSchema.safeParse(readFields(formData));
  if (!parsed.success) {
    const errorMsg = parsed.error.issues[0]?.message || "Enter a valid email and password.";
    loginError(errorMsg);
  }
  const client = await createSupabaseServerClient();
  if (!client) loginError("Authentication is not configured yet.");
  const { error } = await client.auth.signInWithPassword(parsed.data);
  if (error) loginError("Email or password is incorrect.");
  const {
    data: { user },
  } = await client.auth.getUser();
  const metadata = user?.user_metadata ?? {};
  if (metadata.shop_name && metadata.shop_slug) {
    await client.rpc("register_shop", {
      shop_name: metadata.shop_name,
      shop_slug: metadata.shop_slug,
      shop_phone: metadata.shop_phone || null,
    });
  }
  const { data: profile } = await client.from("profiles").select("role").eq("id", user?.id ?? "").maybeSingle();
  redirect(profile?.role === "customer" ? "/customer" : profile?.role === "admin" ? "/admin" : "/shop");
}

export async function signUpShopOwner(formData: FormData) {
  const fields = readFields(formData);
  if (typeof fields.shopSlug === "string") {
    fields.shopSlug = fields.shopSlug.trim().toLowerCase().replace(/\s+/g, "-");
  }

  const parsed = registrationSchema.safeParse(fields);
  if (!parsed.success) {
    const errorMsg = parsed.error.issues[0]?.message || "Please check the form fields and try again.";
    redirect(`/register?error=${encodeURIComponent(errorMsg)}`);
  }
  const client = await createSupabaseServerClient();
  if (!client) redirect("/register?error=Authentication+is+not+configured+yet.");
  const { data, error } = await client.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${getAppUrl()}/auth/callback?next=/shop`,
      data: {
        full_name: parsed.data.fullName,
        shop_name: parsed.data.shopName,
        shop_slug: parsed.data.shopSlug,
        shop_phone: parsed.data.shopPhone || null,
      },
    },
  });
  if (error || !data.user)
    redirect(`/register?error=${encodeURIComponent(error?.message ?? "Unable to create account.")}`);
  if (!data.session) redirect("/login?message=Check+your+email+to+confirm+your+account+before+continuing.");
  const { error: shopError } = await client.rpc("register_shop", {
    shop_name: parsed.data.shopName,
    shop_slug: parsed.data.shopSlug,
    shop_phone: parsed.data.shopPhone || null,
  });
  if (shopError) redirect(`/register?error=${encodeURIComponent(shopError.message)}`);
  redirect("/shop");
}

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  const parsed = z.string().email("Please enter a valid email address.").safeParse(email);
  if (!parsed.success) {
    redirect(`/forgot-password?error=${encodeURIComponent(parsed.error.issues[0]?.message || "Invalid email.")}`);
  }

  const client = await createSupabaseServerClient();
  if (!client) redirect("/forgot-password?error=Authentication+service+not+configured.");

  const { error } = await client.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${getAppUrl()}/auth/callback?next=/reset-password`,
  });

  if (error) {
    redirect(`/forgot-password?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/forgot-password?success=Password+reset+link+has+been+sent+to+your+email.");
}

export async function updateUserPassword(formData: FormData) {
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (password.length < 8) {
    redirect("/reset-password?error=Password+must+be+at+least+8+characters+long.");
  }

  if (password !== confirmPassword) {
    redirect("/reset-password?error=Passwords+do+not+match.");
  }

  const client = await createSupabaseServerClient();
  if (!client) redirect("/reset-password?error=Authentication+service+not+configured.");

  const { error } = await client.auth.updateUser({ password });
  if (error) {
    redirect(`/reset-password?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/login?message=Password+updated+successfully.+Please+sign+in+with+your+new+password.");
}

export async function signOut() {
  const client = await createSupabaseServerClient();
  if (client) await client.auth.signOut();
  redirect("/login");
}
