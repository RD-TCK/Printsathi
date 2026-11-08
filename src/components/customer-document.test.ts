import { describe, it, expect } from "vitest";
import { isRealImageDoc } from "./customer-print-flow";

describe("isRealImageDoc", () => {
  it("strictly returns false for PDFs regardless of flags", () => {
    expect(isRealImageDoc({ filename: "2958565920.pdf" })).toBe(false);
    expect(isRealImageDoc({ filename: "ticket.PDF", isImage: true })).toBe(false);
    expect(isRealImageDoc({ filename: "document.pdf" })).toBe(false);
  });

  it("strictly returns false for Office and text documents", () => {
    expect(isRealImageDoc({ filename: "resume.docx" })).toBe(false);
    expect(isRealImageDoc({ filename: "report.doc" })).toBe(false);
    expect(isRealImageDoc({ filename: "spreadsheet.xlsx" })).toBe(false);
    expect(isRealImageDoc({ filename: "data.xls" })).toBe(false);
    expect(isRealImageDoc({ filename: "slides.pptx" })).toBe(false);
    expect(isRealImageDoc({ filename: "presentation.ppt" })).toBe(false);
    expect(isRealImageDoc({ filename: "notes.txt" })).toBe(false);
    expect(isRealImageDoc({ filename: "info.csv" })).toBe(false);
  });

  it("returns true for actual image formats", () => {
    expect(isRealImageDoc({ filename: "photo.jpg" })).toBe(true);
    expect(isRealImageDoc({ filename: "photo.jpeg" })).toBe(true);
    expect(isRealImageDoc({ filename: "screenshot.png" })).toBe(true);
    expect(isRealImageDoc({ filename: "banner.webp" })).toBe(true);
    expect(isRealImageDoc({ filename: "icon.bmp" })).toBe(true);
    expect(isRealImageDoc({ filename: "image.heic" })).toBe(true);
    expect(isRealImageDoc({ filename: "image.avif" })).toBe(true);
    expect(isRealImageDoc({ filename: "raw_image", isImage: true })).toBe(true);
  });

  it("returns false for null or empty documents", () => {
    expect(isRealImageDoc(null)).toBe(false);
    expect(isRealImageDoc(undefined)).toBe(false);
    expect(isRealImageDoc({ filename: "" })).toBe(false);
  });
});

