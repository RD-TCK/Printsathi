export interface WhatsAppReplyDocument {
  filename: string;
  pageCount: number;
}

export interface WhatsAppReplyChunk {
  configUrl: string;
  documents: WhatsAppReplyDocument[];
}

export interface WhatsAppSkippedFile {
  filename: string;
  reason: string;
}

/** Formats a page count with proper singular/plural grammar. */
export function formatPageCountLabel(count: number): string {
  const safeCount = Math.max(1, Math.round(count || 1));
  return `${safeCount} ${safeCount === 1 ? "page" : "pages"}`;
}

function formatBrandHeader(shopName?: string | null): string {
  const trimmed = shopName?.trim();
  return trimmed ? `*${trimmed}* · Printiva` : "*Printiva*";
}

/** Builds a clean rejection message for non-printable WhatsApp media (audio, video, stickers). */
export function buildWhatsAppMediaRejectReply(): string {
  return [
    "*Unsupported Format*",
    "",
    "We can only print PDF, Word (.docx/.doc), PowerPoint, Excel, TXT, or photos (JPG/PNG).",
    "Please send a printable document or image instead.",
  ].join("\n");
}

/** Builds a clean rejection message for unsupported document files (.zip, .exe, .html, etc.). */
export function buildWhatsAppFileRejectReply(filename: string): string {
  return [
    "*Unsupported File Format*",
    "",
    `*${filename}* cannot be printed.`,
    "Please send a PDF, Word (.docx/.doc), PowerPoint, Excel, TXT, or photo (JPG/PNG).",
  ].join("\n");
}

/** Builds a clean notice when downloading an attachment from WhatsApp fails. */
export function buildWhatsAppDownloadErrorReply(filename: string): string {
  return `Could not download *${filename}* from WhatsApp. Please send the file again.`;
}

/** Builds a concise, human-friendly reply for incoming plain-text customer messages. */
export function buildWhatsAppTextReply(options: {
  shopName?: string | null;
  activeConfigUrl?: string;
}): string {
  const header = formatBrandHeader(options.shopName);
  if (options.activeConfigUrl) {
    return [
      "Print & pay here:",
      options.activeConfigUrl,
      "",
      header,
      "Send another PDF, Word file, or photo anytime to start a new order.",
    ].join("\n");
  }

  return [
    header,
    "Send your PDF, Word (.docx), or photos here to get your print & payment link.",
  ].join("\n");
}

/** Builds the primary customer confirmation message with link first, then documents and details. */
export function buildWhatsAppBatchSuccessReply(options: {
  shopName?: string | null;
  chunks: WhatsAppReplyChunk[];
  skippedFiles?: WhatsAppSkippedFile[];
}): string {
  const { shopName, chunks, skippedFiles = [] } = options;
  const header = formatBrandHeader(shopName);
  const sections: string[] = [];

  if (chunks.length === 1) {
    const { configUrl, documents: docs } = chunks[0];
    const totalPages = docs.reduce((sum, d) => sum + (d.pageCount || 1), 0);

    if (docs.length === 1) {
      const doc = docs[0];
      sections.push(
        "Print & pay here:",
        configUrl,
        "",
        header,
        `• ${doc.filename} (${formatPageCountLabel(doc.pageCount)})`,
      );
    } else {
      const fileLines = docs.map((d, i) => `${i + 1}. ${d.filename} (${formatPageCountLabel(d.pageCount)})`);
      sections.push(
        "Print & pay here:",
        configUrl,
        "",
        `${header} · ${docs.length} files (${formatPageCountLabel(totalPages)})`,
        ...fileLines,
      );
    }
  } else {
    const totalDocs = chunks.reduce((sum, c) => sum + c.documents.length, 0);
    const totalPages = chunks.reduce(
      (sum, c) => sum + c.documents.reduce((dSum, d) => dSum + (d.pageCount || 1), 0),
      0,
    );

    sections.push(
      `${header} · ${chunks.length} orders (${totalDocs} files · ${formatPageCountLabel(totalPages)})`,
    );

    let docIndex = 1;
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkPages = chunk.documents.reduce((sum, d) => sum + (d.pageCount || 1), 0);
      const fileLines = chunk.documents.map(
        (d) => `${docIndex++}. ${d.filename} (${formatPageCountLabel(d.pageCount)})`,
      );
      const countLabel = `${chunk.documents.length} ${chunk.documents.length === 1 ? "file" : "files"}`;
      sections.push(
        "",
        `*Order ${i + 1}:* ${chunk.configUrl}`,
        `${countLabel} · ${formatPageCountLabel(chunkPages)}:`,
        ...fileLines,
      );
    }
  }

  if (skippedFiles.length > 0) {
    const skippedWord = skippedFiles.length === 1 ? "file" : "files";
    sections.push(
      "",
      `Skipped ${skippedFiles.length} ${skippedWord}:`,
      ...skippedFiles.map((f) => `• ${f.filename} — ${f.reason}`),
    );
  }

  return sections.join("\n");
}

/** Builds a clean message when every file in a batch fails validation or conversion. */
export function buildWhatsAppBatchFailureReply(skippedFiles: WhatsAppSkippedFile[]): string {
  const lines = [
    "Could not process your files:",
    "",
    ...skippedFiles.map((f) => `• ${f.filename} — ${f.reason}`),
    "",
    "Please send an unlocked PDF, Word (.docx), or JPG/PNG photo.",
  ];
  return lines.join("\n");
}

/** Maps a batch processing error string into a concise customer-facing WhatsApp reply. */
export function buildWhatsAppFallbackErrorReply(errorMsg: string, isTransientNetwork: boolean): string {
  const normalized = errorMsg.toLowerCase();
  if (normalized.includes("password") || normalized.includes("encrypted") || normalized.includes("damaged")) {
    return "Your file is password-protected or damaged. Please unlock it and send it again.";
  }
  if (normalized.includes("unsupported file type")) {
    return "This file format is not supported. Please send a PDF, Word (.docx), or JPG/PNG photo.";
  }
  if (normalized.includes("413") || normalized.includes("payload too large")) {
    return "This file exceeds the 50 MB limit. Please send a compressed PDF or image.";
  }
  if (normalized.includes("word") || normalized.includes("docx") || normalized.includes("export your word")) {
    return "Could not convert this Word file. Please export it as a PDF and send it again.";
  }
  if (isTransientNetwork) {
    return "Connection dropped while uploading your file. Please send it again or check at the counter.";
  }
  return "Could not process your file. Please send a PDF, Word (.docx), or JPG/PNG photo.";
}
