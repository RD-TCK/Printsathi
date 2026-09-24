import "server-only";
import crypto from "node:crypto";
import Razorpay from "razorpay";
import { getRazorpayServerEnv } from "@/lib/env";
import type { SupabaseClient } from "@supabase/supabase-js";

export function toPaise(rupees: number): number {
  return Math.round((rupees + Number.EPSILON) * 100);
}

export function fromPaise(paise: number): number {
  return Math.round(paise) / 100;
}

export interface RazorpayCredentials {
  keyId: string;
  keySecret: string;
  webhookSecret?: string;
  isTestMode?: boolean;
}

const clientCache = new Map<string, Razorpay>();

export function getRazorpayClient(credentials?: RazorpayCredentials | null): {
  client: Razorpay;
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  isTestMode: boolean;
} | null {
  if (credentials && credentials.keyId && credentials.keySecret) {
    const cacheKey = `${credentials.keyId}:${credentials.keySecret}`;
    let instance = clientCache.get(cacheKey);
    if (!instance) {
      instance = new Razorpay({
        key_id: credentials.keyId,
        key_secret: credentials.keySecret,
      });
      clientCache.set(cacheKey, instance);
    }

    const isTest = credentials.isTestMode !== undefined 
      ? credentials.isTestMode 
      : credentials.keyId.startsWith("rzp_test_");

    return {
      client: instance,
      keyId: credentials.keyId,
      keySecret: credentials.keySecret,
      webhookSecret: credentials.webhookSecret || "",
      isTestMode: isTest,
    };
  }

  // Fallback to Platform Admin environment variables
  const env = getRazorpayServerEnv();
  if (!env) return null;

  const cacheKey = `platform:${env.keyId}:${env.keySecret}`;
  let instance = clientCache.get(cacheKey);
  if (!instance) {
    instance = new Razorpay({
      key_id: env.keyId,
      key_secret: env.keySecret,
    });
    clientCache.set(cacheKey, instance);
  }

  return {
    client: instance,
    keyId: env.keyId,
    keySecret: env.keySecret,
    webhookSecret: env.webhookSecret,
    isTestMode: env.isTestMode,
  };
}

/**
 * Specifically returns the Platform Admin Razorpay client for subscription fee collections.
 */
export function getPlatformRazorpayClient() {
  return getRazorpayClient(null);
}

/**
 * Safely fetches custom Razorpay credentials configured by a shop owner in shop_settings.
 * Returns null if the shop hasn't configured custom keys.
 */
export async function getShopRazorpayCredentials(
  adminClient: SupabaseClient,
  shopId: string,
): Promise<RazorpayCredentials | null> {
  const { data: settings, error } = await adminClient
    .from("shop_settings")
    .select("razorpay_key_id, razorpay_key_secret, razorpay_webhook_secret")
    .eq("shop_id", shopId)
    .maybeSingle();

  if (error || !settings) return null;
  if (!settings.razorpay_key_id || !settings.razorpay_key_secret) return null;

  return {
    keyId: settings.razorpay_key_id.trim(),
    keySecret: settings.razorpay_key_secret.trim(),
    webhookSecret: settings.razorpay_webhook_secret?.trim() || undefined,
    isTestMode: settings.razorpay_key_id.startsWith("rzp_test_"),
  };
}

export interface CreateOrderParams {
  amountRupees: number;
  currency?: string;
  receipt: string;
  notes?: Record<string, string>;
}

export interface RazorpayOrderResult {
  id: string;
  amount: number; // in paise
  amountRupees: number;
  currency: string;
  receipt: string;
  status: string;
  notes: Record<string, string>;
}

export async function createRazorpayOrder(
  params: CreateOrderParams,
  credentials?: RazorpayCredentials | null,
): Promise<RazorpayOrderResult> {
  const razorpay = getRazorpayClient(credentials);
  if (!razorpay) {
    throw new Error("Razorpay payment gateway is not configured for this shop.");
  }

  const amountPaise = toPaise(params.amountRupees);
  if (amountPaise <= 0 || !Number.isFinite(amountPaise)) {
    throw new Error("Invalid order amount. Amount must be greater than zero.");
  }

  const currency = params.currency ?? "INR";

  const order = await razorpay.client.orders.create({
    amount: amountPaise,
    currency,
    receipt: params.receipt.slice(0, 40), // Razorpay receipt max length 40 chars
    notes: params.notes ?? {},
  });

  return {
    id: order.id,
    amount: Number(order.amount),
    amountRupees: fromPaise(Number(order.amount)),
    currency: order.currency,
    receipt: typeof order.receipt === "string" ? order.receipt : params.receipt,
    status: order.status,
    notes: (order.notes as Record<string, string>) || {},
  };
}

export interface PaymentSignatureParams {
  orderId: string;
  paymentId: string;
  signature: string;
  keySecret?: string;
}

export function verifyPaymentSignature(
  params: PaymentSignatureParams,
  credentials?: RazorpayCredentials | null,
): boolean {
  const { orderId, paymentId, signature } = params;
  if (!orderId || !paymentId || !signature) return false;

  const secret = params.keySecret || credentials?.keySecret || getRazorpayServerEnv()?.keySecret;
  if (!secret) return false;

  try {
    const expectedSignature = crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");

    if (expectedSignature.length !== signature.length) return false;

    return crypto.timingSafeEqual(Buffer.from(expectedSignature, "utf-8"), Buffer.from(signature, "utf-8"));
  } catch {
    return false;
  }
}

export interface WebhookSignatureParams {
  rawBody: string | Buffer;
  signature: string;
  webhookSecret?: string;
}

export function verifyWebhookSignature(
  params: WebhookSignatureParams,
  credentials?: RazorpayCredentials | null,
): boolean {
  const { rawBody, signature } = params;
  if (!rawBody || !signature) return false;

  const secret = params.webhookSecret || credentials?.webhookSecret || getRazorpayServerEnv()?.webhookSecret;
  if (!secret) return false;

  try {
    const expectedSignature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

    if (expectedSignature.length !== signature.length) return false;

    return crypto.timingSafeEqual(Buffer.from(expectedSignature, "utf-8"), Buffer.from(signature, "utf-8"));
  } catch {
    return false;
  }
}

export async function fetchRazorpayPayment(
  paymentId: string,
  credentials?: RazorpayCredentials | null,
) {
  const razorpay = getRazorpayClient(credentials);
  if (!razorpay) return null;

  try {
    const payment = await razorpay.client.payments.fetch(paymentId);
    return payment;
  } catch (error) {
    console.error(`Failed to fetch Razorpay payment ${paymentId}:`, error);
    return null;
  }
}

export async function fetchRazorpayOrder(
  orderId: string,
  credentials?: RazorpayCredentials | null,
) {
  const razorpay = getRazorpayClient(credentials);
  if (!razorpay) return null;

  try {
    const order = await razorpay.client.orders.fetch(orderId);
    return order;
  } catch (error) {
    console.error(`Failed to fetch Razorpay order ${orderId}:`, error);
    return null;
  }
}
