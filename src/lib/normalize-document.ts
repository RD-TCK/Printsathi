import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

const execute = promisify(execFile);
const officeExtensions = new Set([".doc", ".docx", ".odt", ".rtf", ".ppt", ".pptx", ".odp", ".xls", ".xlsx", ".ods", ".txt", ".csv", ".md"]);
const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tif", ".tiff"]);

export async function normalizeDocument(file: File): Promise<{ bytes: Buffer; pageCount: number; filename: string }> {
  const extension = path.extname(file.name).toLowerCase();
  let bytes = Buffer.from(await file.arrayBuffer());
  if (imageExtensions.has(extension)) {
    const png = await sharp(bytes, { limitInputPixels: 40000000 }).rotate().flatten({ background: "white" }).png().toBuffer();
    const pdf = await PDFDocument.create();
    const image = await pdf.embedPng(png);
    const page = pdf.addPage([595.28, 841.89]);
    const scale = Math.min(523.28 / image.width, 769.89 / image.height);
    const width = image.width * scale; const height = image.height * scale;
    page.drawImage(image, { x: (595.28 - width) / 2, y: (841.89 - height) / 2, width, height });
    bytes = Buffer.from(await pdf.save());
  } else if (officeExtensions.has(extension)) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "printsaathi-convert-"));
    try {
      const input = path.join(directory, `source${extension === ".md" ? ".txt" : extension}`);
      await fs.writeFile(input, bytes);
      const profile = path.join(directory, "profile");
      await fs.mkdir(path.join(profile, "user"), { recursive: true });
      await fs.writeFile(path.join(profile, "user", "registrymodifications.xcu"),
        '<?xml version="1.0"?><oor:items xmlns:oor="http://openoffice.org/2001/registry"><item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item></oor:items>');
      const executable = process.env.LIBREOFFICE_PATH || (process.platform === "win32" ? "C:\\Program Files\\LibreOffice\\program\\soffice.exe" : "libreoffice");
      try {
        await execute(executable, [`-env:UserInstallation=${pathToFileURL(profile).href}`, "--headless", "--nologo", "--nodefault", "--norestore", "--convert-to", "pdf", "--outdir", directory, input], { timeout: 60000, windowsHide: true, maxBuffer: 1024 * 1024 });
        bytes = await fs.readFile(path.join(directory, "source.pdf"));
      } catch {
        throw new Error(`Could not convert ${file.name}. Install LibreOffice on the server and set LIBREOFFICE_PATH, or upload an exported PDF. Password-protected files are not supported.`);
      }
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  } else if (extension !== ".pdf") {
    throw new Error(`${file.name}: unsupported file type. Upload PDF, an image, Word, PowerPoint, Excel, OpenDocument, or text.`);
  }
  if (bytes.length > 50 * 1024 * 1024) throw new Error(`${file.name}: converted PDF exceeds 50 MB.`);
  let pdf;
  try { pdf = await PDFDocument.load(bytes); }
  catch { throw new Error(`${file.name} is damaged or password-protected. Upload a readable document.`); }
  const pageCount = pdf.getPageCount();
  if (pageCount < 1 || pageCount > 2000) throw new Error(`${file.name} must contain between 1 and 2,000 pages.`);
  return { bytes, pageCount, filename: file.name };
}
