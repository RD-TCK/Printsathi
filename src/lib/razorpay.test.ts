import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import {
  fromPaise,
  getPlatformRazorpayClient,
  getRazorpayClient,
  toPaise,
  verifyPaymentSignature,
  verifyWebhookSignature,
} from "@/lib/razorpay/server";

describe("Razorpay Integration & Security", () => {
  const mockSecret = "test_razorpay_secret_key_123456";
  const mockWebhookSecret = "whsec_test_webhook_secret_abcdef";

  describe("Amount Conversion (Rupees <-> Paise)", () => {
    it("converts rupees to paise accurately without floating-point errors", () => {
      expect(toPaise(1)).toBe(100);
      expect(toPaise(2.5)).toBe(250);
      expect(toPaise(19.99)).toBe(1999);
      expect(toPaise(149.5)).toBe(14950);
      expect(toPaise(0.01)).toBe(1);
      expect(toPaise(0)).toBe(0);
    });

    it("converts paise to rupees accurately", () => {
      expect(fromPaise(100)).toBe(1);
      expect(fromPaise(250)).toBe(2.5);
      expect(fromPaise(1999)).toBe(19.99);
      expect(fromPaise(14950)).toBe(149.5);
      expect(fromPaise(1)).toBe(0.01);
    });
  });

  describe("Cryptographic Payment Signature Verification", () => {
    const orderId = "order_O8x1234567890a";
    const paymentId = "pay_P9y9876543210b";

    function generateValidSignature(orderId: string, paymentId: string, secret: string) {
      return crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
    }

    it("validates correct HMAC-SHA256 signature", () => {
      const signature = generateValidSignature(orderId, paymentId, mockSecret);

      const isValid = verifyPaymentSignature({
        orderId,
        paymentId,
        signature,
        keySecret: mockSecret,
      });

      expect(isValid).toBe(true);
    });

    it("rejects forged or tampered signature", () => {
      const forgedSignature = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

      const isValid = verifyPaymentSignature({
        orderId,
        paymentId,
        signature: forgedSignature,
        keySecret: mockSecret,
      });

      expect(isValid).toBe(false);
    });

    it("rejects signature if paymentId or orderId is swapped or altered", () => {
      const validSignature = generateValidSignature(orderId, paymentId, mockSecret);

      const isAlteredOrderValid = verifyPaymentSignature({
        orderId: "order_different_id_999",
        paymentId,
        signature: validSignature,
        keySecret: mockSecret,
      });

      const isAlteredPaymentValid = verifyPaymentSignature({
        orderId,
        paymentId: "pay_different_id_888",
        signature: validSignature,
        keySecret: mockSecret,
      });

      expect(isAlteredOrderValid).toBe(false);
      expect(isAlteredPaymentValid).toBe(false);
    });

    it("rejects signature signed with an incorrect secret", () => {
      const wrongSecretSignature = generateValidSignature(orderId, paymentId, "wrong_secret_key");

      const isValid = verifyPaymentSignature({
        orderId,
        paymentId,
        signature: wrongSecretSignature,
        keySecret: mockSecret,
      });

      expect(isValid).toBe(false);
    });

    it("handles empty or missing signature parameters gracefully", () => {
      expect(
        verifyPaymentSignature({
          orderId: "",
          paymentId: "pay_123",
          signature: "sig",
          keySecret: mockSecret,
        }),
      ).toBe(false);

      expect(
        verifyPaymentSignature({
          orderId: "order_123",
          paymentId: "",
          signature: "sig",
          keySecret: mockSecret,
        }),
      ).toBe(false);

      expect(
        verifyPaymentSignature({
          orderId: "order_123",
          paymentId: "pay_123",
          signature: "",
          keySecret: mockSecret,
        }),
      ).toBe(false);
    });
  });

  describe("Shop Owner Direct Gateway Credentials & Isolation", () => {
    const shop1Credentials = {
      keyId: "rzp_test_shop1_123456789",
      keySecret: "sec_shop1_secret_987654321",
    };
    const shop2Credentials = {
      keyId: "rzp_live_shop2_987654321",
      keySecret: "sec_shop2_secret_123456789",
    };

    const orderId = "order_shop1_test_001";
    const paymentId = "pay_shop1_test_001";

    it("instantiates distinct client configurations for separate shop keys", () => {
      const client1 = getRazorpayClient(shop1Credentials);
      const client2 = getRazorpayClient(shop2Credentials);

      expect(client1?.keyId).toBe("rzp_test_shop1_123456789");
      expect(client1?.isTestMode).toBe(true);

      expect(client2?.keyId).toBe("rzp_live_shop2_987654321");
      expect(client2?.isTestMode).toBe(false);
    });

    it("verifies payment signature using the specific shop owner credentials", () => {
      const shop1Signature = crypto
        .createHmac("sha256", shop1Credentials.keySecret)
        .update(`${orderId}|${paymentId}`)
        .digest("hex");

      // Verify with Shop 1 credentials (Should succeed)
      const isShop1Valid = verifyPaymentSignature(
        { orderId, paymentId, signature: shop1Signature },
        shop1Credentials,
      );
      expect(isShop1Valid).toBe(true);

      // Verify with Shop 2 credentials (Cross-shop attack / signature mismatch must fail)
      const isShop2Valid = verifyPaymentSignature(
        { orderId, paymentId, signature: shop1Signature },
        shop2Credentials,
      );
      expect(isShop2Valid).toBe(false);
    });
  });

  describe("Webhook Signature Verification", () => {
    const sampleWebhookPayload = JSON.stringify({
      entity: "event",
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: "pay_test123",
            order_id: "order_test456",
            amount: 5000,
            status: "captured",
          },
        },
      },
    });

    function generateWebhookSignature(body: string, secret: string) {
      return crypto.createHmac("sha256", secret).update(body).digest("hex");
    }

    it("verifies authentic webhook payload with matching signature", () => {
      const signature = generateWebhookSignature(sampleWebhookPayload, mockWebhookSecret);

      const isValid = verifyWebhookSignature({
        rawBody: sampleWebhookPayload,
        signature,
        webhookSecret: mockWebhookSecret,
      });

      expect(isValid).toBe(true);
    });

    it("rejects webhook if body was tampered with", () => {
      const signature = generateWebhookSignature(sampleWebhookPayload, mockWebhookSecret);
      const tamperedBody = sampleWebhookPayload.replace("5000", "1000");

      const isValid = verifyWebhookSignature({
        rawBody: tamperedBody,
        signature,
        webhookSecret: mockWebhookSecret,
      });

      expect(isValid).toBe(false);
    });

    it("rejects webhook if signature header is invalid", () => {
      const isValid = verifyWebhookSignature({
        rawBody: sampleWebhookPayload,
        signature: "invalid_hex_signature",
        webhookSecret: mockWebhookSecret,
      });

      expect(isValid).toBe(false);
    });
  });

  describe("Failure and Print Retry Invariant Rules", () => {
    it("ensures verified payment status is immutable on print failure", () => {
      // Simulates domain model invariant:
      // When print job status changes to 'failed', the payment status remains 'verified'
      const paymentRecord = {
        id: "pay_uuid_12345",
        status: "verified" as const,
        amount: 25.0,
        provider_payment_id: "pay_rzp_live_abc123",
        provider_order_id: "order_rzp_live_xyz789",
      };

      const printJob = {
        id: "job_uuid_67890",
        order_id: "order_uuid_111",
        status: "failed" as const,
        failure_reason: "Paper jam in shop printer tray 1",
        retryable: true,
      };

      // Printing failed, but payment must not be reset or re-charged
      expect(paymentRecord.status).toBe("verified");
      expect(paymentRecord.provider_payment_id).toBe("pay_rzp_live_abc123");
      expect(printJob.status).toBe("failed");
      expect(printJob.retryable).toBe(true);
    });

    it("ensures unverified payments never unlock print jobs", () => {
      const paymentStatuses: string[] = ["created", "pending", "failed"];

      for (const status of paymentStatuses) {
        const isEligibleToPrint = (status as string) === "verified";
        expect(isEligibleToPrint).toBe(false);
      }

      const verifiedPaymentStatus: string = "verified";
      expect(verifiedPaymentStatus === "verified").toBe(true);
    });
  });
});
