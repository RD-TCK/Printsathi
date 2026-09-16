const fs = require("node:fs");
const path = require("node:path");
const source = path.join(path.dirname(require.resolve("pdf-to-printer")), "SumatraPDF-3.4.6-32.exe");
const destination = path.join(__dirname, "../dist/agent/renderer-data.json");
fs.mkdirSync(path.dirname(destination), { recursive: true });
// Explicit JSON require works even when pkg asset globs fail on parentheses in workspace paths.
fs.writeFileSync(destination, JSON.stringify({ base64: fs.readFileSync(source).toString("base64") }));
console.log("Embedded PDF renderer module generated.");
