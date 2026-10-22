import { describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { combineOrderDocumentsForPrint } from "./order-document-combiner";

describe("order-document-combiner", () => {
  it("skips combining when order has only 1 document", async () => {
    const mockClient: any = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: "doc-1",
                    storage_path: "shops/s1/orders/o1/documents/doc-1/source.pdf",
                    original_filename: "sample.pdf",
                    mime_type: "application/pdf",
                    page_count: 3,
                    size_bytes: 1024,
                  },
                ],
                error: null,
              }),
            }),
          }),
        }),
      }),
    };

    const result = await combineOrderDocumentsForPrint(mockClient, {
      shopId: "s1",
      orderId: "o1",
      tokenNumber: 1,
    });

    expect(result.success).toBe(true);
    expect(result.combined).toBe(false);
    expect(result.totalPages).toBe(3);
  });

  it("successfully combines multiple PDFs into a single continuous print job", async () => {
    // Generate two 1-page valid test PDFs
    const pdf1 = await PDFDocument.create();
    pdf1.addPage([595.28, 841.89]);
    const pdf1Bytes = await pdf1.save();

    const pdf2 = await PDFDocument.create();
    pdf2.addPage([595.28, 841.89]);
    const pdf2Bytes = await pdf2.save();

    const mockDocs = [
      {
        id: "doc-1",
        storage_path: "shops/s1/orders/o1/documents/doc-1/source.pdf",
        original_filename: "pic1.jpg",
        mime_type: "application/pdf",
        page_count: 1,
        size_bytes: pdf1Bytes.length,
      },
      {
        id: "doc-2",
        storage_path: "shops/s1/orders/o1/documents/doc-2/source.pdf",
        original_filename: "pic2.jpg",
        mime_type: "application/pdf",
        page_count: 1,
        size_bytes: pdf2Bytes.length,
      },
    ];

    let insertedJob: any = null;
    let insertedPages: any = null;
    let deletedJobsOrderId: string | null = null;
    let uploadedPdfBytes: Uint8Array | null = null;

    const mockClient: any = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "documents") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({ data: mockDocs, error: null }),
                  ilike: vi.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            }),
            delete: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ error: null }),
            }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        if (table === "print_jobs") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [{ id: "old-job-1" }], error: null }),
            }),
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation((col: string, val: string) => {
                deletedJobsOrderId = val;
                return Promise.resolve({ error: null });
              }),
            }),
            insert: vi.fn().mockImplementation((job: any) => {
              insertedJob = job;
              return Promise.resolve({ error: null });
            }),
          };
        }
        if (table === "print_job_pages") {
          return {
            delete: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ error: null }),
            }),
            insert: vi.fn().mockImplementation((pages: any) => {
              insertedPages = pages;
              return Promise.resolve({ error: null });
            }),
          };
        }
        if (table === "orders") {
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            }),
          };
        }
        return {};
      }),
      storage: {
        from: vi.fn().mockReturnValue({
          download: vi.fn().mockImplementation((pathStr: string) => {
            if (pathStr.includes("doc-1")) {
              return Promise.resolve({
                data: { arrayBuffer: () => Promise.resolve(pdf1Bytes.buffer) },
                error: null,
              });
            }
            if (pathStr.includes("doc-2")) {
              return Promise.resolve({
                data: { arrayBuffer: () => Promise.resolve(pdf2Bytes.buffer) },
                error: null,
              });
            }
            return Promise.resolve({ data: null, error: new Error("Not found") });
          }),
          upload: vi.fn().mockImplementation((pathStr: string, bytes: any) => {
            uploadedPdfBytes = bytes;
            return Promise.resolve({ error: null });
          }),
          remove: vi.fn().mockResolvedValue({ error: null }),
        }),
      },
    };

    const result = await combineOrderDocumentsForPrint(mockClient, {
      shopId: "s1",
      orderId: "o1",
      tokenNumber: 42,
      totalAmount: 20,
      targetJobStatus: "queued",
    });

    expect(result.success).toBe(true);
    expect(result.combined).toBe(true);
    expect(result.totalPages).toBe(2);

    // Verify exactly ONE print_job was created
    expect(insertedJob).not.toBeNull();
    expect(insertedJob.total_pages).toBe(2);
    expect(insertedJob.status).toBe("queued");
    expect(insertedJob.order_id).toBe("o1");

    // Verify print_job_pages specifies the full combined range (1 to 2)
    expect(insertedPages).toHaveLength(1);
    expect(insertedPages[0].start_page).toBe(1);
    expect(insertedPages[0].end_page).toBe(2);
    expect(insertedPages[0].copies).toBe(1);

    // Verify old jobs were cleanly replaced
    expect(deletedJobsOrderId).toBe("o1");

    // Verify the uploaded PDF is valid and has exactly 2 pages
    expect(uploadedPdfBytes).not.toBeNull();
    const loadedCombined = await PDFDocument.load(uploadedPdfBytes!);
    expect(loadedCombined.getPageCount()).toBe(2);
  });

  it("handles multi-copies configuration correctly by collating pages into continuous print job", async () => {
    const pdf1 = await PDFDocument.create();
    pdf1.addPage([595.28, 841.89]);
    const pdf1Bytes = await pdf1.save();

    const pdf2 = await PDFDocument.create();
    pdf2.addPage([595.28, 841.89]);
    const pdf2Bytes = await pdf2.save();

    const mockDocs = [
      {
        id: "doc-1",
        storage_path: "shops/s1/orders/o1/documents/doc-1/source.pdf",
        original_filename: "doc1.pdf",
        page_count: 1,
      },
      {
        id: "doc-2",
        storage_path: "shops/s1/orders/o1/documents/doc-2/source.pdf",
        original_filename: "doc2.pdf",
        page_count: 1,
      },
    ];

    let uploadedPdfBytes: Uint8Array | null = null;
    let insertedJob: any = null;

    const mockClient: any = {
      from: vi.fn().mockImplementation((table: string) => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: mockDocs, error: null }),
              ilike: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
        delete: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ error: null }),
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
        insert: vi.fn().mockImplementation((data: any) => {
          if (table === "print_jobs") insertedJob = data;
          return Promise.resolve({ error: null });
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
      })),
      storage: {
        from: vi.fn().mockReturnValue({
          download: vi.fn().mockImplementation((pathStr: string) => {
            if (pathStr.includes("doc-1")) {
              return Promise.resolve({
                data: { arrayBuffer: () => Promise.resolve(pdf1Bytes.buffer) },
                error: null,
              });
            }
            return Promise.resolve({
              data: { arrayBuffer: () => Promise.resolve(pdf2Bytes.buffer) },
              error: null,
            });
          }),
          upload: vi.fn().mockImplementation((pathStr: string, bytes: any) => {
            uploadedPdfBytes = bytes;
            return Promise.resolve({ error: null });
          }),
          remove: vi.fn().mockResolvedValue({ error: null }),
        }),
      },
    };

    // User wants 2 copies of doc-1 and 1 copy of doc-2 (total = 2 + 1 = 3 pages)
    const result = await combineOrderDocumentsForPrint(mockClient, {
      shopId: "s1",
      orderId: "o1",
      tokenNumber: 99,
      configurations: [
        {
          documentId: "doc-1",
          ranges: [{ startPage: 1, endPage: 1, copies: 2 }],
        },
        {
          documentId: "doc-2",
          ranges: [{ startPage: 1, endPage: 1, copies: 1 }],
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.totalPages).toBe(3);
    expect(insertedJob.total_pages).toBe(3);

    const loadedCombined = await PDFDocument.load(uploadedPdfBytes!);
    expect(loadedCombined.getPageCount()).toBe(3);
  });
});
