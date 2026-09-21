"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppUrl } from "@/lib/env";
import { ensureShopForUser } from "@/lib/ensure-shop";

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

function registerError(message: string): never {
  redirect(`/register?error=${encodeURIComponent(message)}`);
}

export async function signIn(formData: FormData) {
  const parsed = credentialsSchema.safeParse(readFields(formData));
  if (!parsed.success) {
    const errorMsg = parsed.error.issues[0]?.message || "Enter a valid email and password.";
    loginError(errorMsg);
  }

  const client = await createSupabaseServerClient();
  if (!client) loginError("Authentication service is not configured yet.");

  const { data: authData, error } = await client.auth.signInWithPassword(parsed.data);
  if (error) {
    const msg = (error.message || "").toLowerCase();
    if (msg.includes("email not confirmed")) {
      loginError("Please check your email inbox to confirm your account before signing in.");
    } else if (msg.includes("invalid login credentials") || msg.includes("invalid_grant")) {
      loginError("Invalid email address or password.");
    } else {
      loginError(error.message || "Sign in failed. Please try again.");
    }
  }

  const user = authData?.user;
  if (!user) loginError("User account not found.");

  // If user has shop metadata, ensure their shop is registered and ready
  if (user.user_metadata?.shop_name) {
    await ensureShopForUser(client, user);
  }

  const { data: profile } = await client.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const { data: membership } = await client.from("shop_members").select("shop_id").eq("user_id", user.id).limit(1).maybeSingle();

  if (profile?.role === "admin") {
    redirect("/admin");
  } else if (profile?.role === "shop_owner" || profile?.role === "shop_staff" || membership || user.user_metadata?.shop_name) {
    redirect("/shop");
  } else {
    redirect("/customer");
  }
}

export async function signUpShopOwner(formData: FormData) {
  const fields = readFields(formData);
  if (typeof fields.shopSlug === "string") {
    fields.shopSlug = fields.shopSlug
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  const parsed = registrationSchema.safeParse(fields);
  if (!parsed.success) {
    const errorMsg = parsed.error.issues[0]?.message || "Please check the form fields and try again.";
    registerError(errorMsg);
  }

  const client = await createSupabaseServerClient();
  if (!client) registerError("Authentication service is not configured yet.");

  const appUrl = getAppUrl();
  const { data, error } = await client.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${appUrl}/auth/callback?next=/shop`,
      data: {
        full_name: parsed.data.fullName,
        shop_name: parsed.data.shopName,
        shop_slug: parsed.data.shopSlug,
        shop_phone: parsed.data.shopPhone || null,
      },
    },
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("already registered") || msg.includes("already exists")) {
      registerError("An account with this email already exists. Please sign in instead.");
    } else {
      registerError(error.message || "Unable to create account. Please try again.");
    }
  }

  if (!data?.user) {
    registerError("Account creation could not be completed. Please try again.");
  }

  // If email confirmation is required by Supabase:
  if (!data.session) {
    redirect("/login?message=Account+created+successfully!+Please+check+your+email+to+confirm+your+account+before+signing+in.");
  }

  // If session is immediately active, ensure shop is created with collision fallback
  await ensureShopForUser(client, data.user, {
    shopName: parsed.data.shopName,
    shopSlug: parsed.data.shopSlug,
    shopPhone: parsed.data.shopPhone,
  });

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

  redirect("/forgot-password?success=Password+reset+link+has+been+sent+to+your+email.+Please+check+your+inbox.");
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

  redirect("/login?message=Password+updated+successfully!+Please+sign+in+with+your+new+password.");
}

export async function signOut() {
  const client = await createSupabaseServerClient();
  if (client) await client.auth.signOut();
  redirect("/login");
}
