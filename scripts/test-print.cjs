// Run after npm run build:agent:tsc. Sends one diagnostic page, without creating a paid job.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { PDFDocument } = require("pdf-lib");
const { prepareAndPrintDocument } = require("../dist/agent/print-executor");

async function main() {
  const printer = process.argv[2];
  if (!printer) throw new Error('Usage: node scripts/test-print.cjs "Windows printer name"');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "printsaathi-diagnostic-"));
  const file = path.join(directory, "PrintSaathi-test.pdf");
  try {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);
    page.drawText("PrintSaathi printer test", { x: 60, y: 760, size: 22 });
    page.drawText("If you can read this page, the PDF printing path is working.", { x: 60, y: 720, size: 12 });
    page.drawText(new Date().toISOString(), { x: 60, y: 690, size: 12 });
    fs.writeFileSync(file, await pdf.save());
    const result = await prepareAndPrintDocument(
      file,
      {
        id: "diagnostic-test",
        totalPages: 1,
        pagesConfig: [{ startPage: 1, endPage: 1, colorMode: "black_and_white", paperSize: "a4" }],
      },
      printer,
    );
    console.log(JSON.stringify(result, null, 2));
    if (!result.success) process.exitCode = 1;
  } finally {
    if (fs.existsSync(file)) fs.unlinkSync(file);
    fs.rmdirSync(directory);
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
