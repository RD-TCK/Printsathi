import "server-only";
import crypto from "node:crypto";
import Razorpay from "razorpay";
import { getRazorpayServerEnv } from "@/lib/env";

export function toPaise(rupees: number): number {
  return Math.round((rupees + Number.EPSILON) * 100);
}

export function fromPaise(paise: number): number {
  return Math.round(paise) / 100;
}

let razorpayInstance: Razorpay | null = null;
let lastKeyId: string | null = null;

export function getRazorpayClient(): {
  client: Razorpay;
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  isTestMode: boolean;
} | null {
  const env = getRazorpayServerEnv();
  if (!env) return null;

  if (!razorpayInstance || lastKeyId !== env.keyId) {
    razorpayInstance = new Razorpay({
      key_id: env.keyId,
      key_secret: env.keySecret,
    });
    lastKeyId = env.keyId;
  }

  return {
    client: razorpayInstance,
    keyId: env.keyId,
    keySecret: env.keySecret,
    webhookSecret: env.webhookSecret,
    isTestMode: env.isTestMode,
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

export async function createRazorpayOrder(params: CreateOrderParams): Promise<RazorpayOrderResult> {
  const razorpay = getRazorpayClient();
  if (!razorpay) {
    throw new Error("Razorpay payment gateway is not configured on the server.");
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

export function verifyPaymentSignature(params: PaymentSignatureParams): boolean {
  const { orderId, paymentId, signature } = params;
  if (!orderId || !paymentId || !signature) return false;

  const secret = params.keySecret || getRazorpayServerEnv()?.keySecret;
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

export function verifyWebhookSignature(params: WebhookSignatureParams): boolean {
  const { rawBody, signature } = params;
  if (!rawBody || !signature) return false;

  const secret = params.webhookSecret || getRazorpayServerEnv()?.webhookSecret;
  if (!secret) return false;

  try {
    const expectedSignature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

    if (expectedSignature.length !== signature.length) return false;

    return crypto.timingSafeEqual(Buffer.from(expectedSignature, "utf-8"), Buffer.from(signature, "utf-8"));
  } catch {
    return false;
  }
}

export async function fetchRazorpayPayment(paymentId: string) {
  const razorpay = getRazorpayClient();
  if (!razorpay) return null;

  try {
    const payment = await razorpay.client.payments.fetch(paymentId);
    return payment;
  } catch (error) {
    console.error(`Failed to fetch Razorpay payment ${paymentId}:`, error);
    return null;
  }
}

export async function fetchRazorpayOrder(orderId: string) {
  const razorpay = getRazorpayClient();
  if (!razorpay) return null;

  try {
    const order = await razorpay.client.orders.fetch(orderId);
    return order;
  } catch (error) {
    console.error(`Failed to fetch Razorpay order ${orderId}:`, error);
    return null;
  }
}
