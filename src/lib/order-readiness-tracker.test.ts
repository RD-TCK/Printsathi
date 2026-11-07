import { describe, it, expect, beforeEach } from "vitest";
import {
  recordAgentDocumentPrecached,
  areOrderDocumentsPrecached,
  getPrecachedDocumentsCount,
} from "./order-readiness-tracker";

describe("order-readiness-tracker", () => {
  it("tracks documents pre-cached by desktop agent", () => {
    const orderId = "order-test-101";
    const doc1 = "doc-aaa";
    const doc2 = "doc-bbb";

    expect(areOrderDocumentsPrecached(orderId, [doc1, doc2])).toBe(false);
    expect(getPrecachedDocumentsCount(orderId)).toBe(0);

    recordAgentDocumentPrecached(orderId, doc1);
    expect(areOrderDocumentsPrecached(orderId, [doc1, doc2])).toBe(false);
    expect(getPrecachedDocumentsCount(orderId)).toBe(1);

    recordAgentDocumentPrecached(orderId, doc2);
    expect(areOrderDocumentsPrecached(orderId, [doc1, doc2])).toBe(true);
    expect(getPrecachedDocumentsCount(orderId)).toBe(2);
  });

  it("handles empty document list", () => {
    expect(areOrderDocumentsPrecached("any-order", [])).toBe(true);
  });
});
