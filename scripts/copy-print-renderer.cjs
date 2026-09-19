const fs = require("node:fs");
const path = require("node:path");
const source = path.join(path.dirname(require.resolve("pdf-to-printer")), "SumatraPDF-3.4.6-32.exe");
const destinationJson = path.join(__dirname, "../dist/agent/renderer-data.json");
const destinationExe = path.join(__dirname, "../dist/agent/SumatraPDF.exe");
fs.mkdirSync(path.dirname(destinationJson), { recursive: true });
fs.writeFileSync(destinationJson, JSON.stringify({ base64: fs.readFileSync(source).toString("base64") }));
if (fs.existsSync(source)) {
  fs.copyFileSync(source, destinationExe);
}
const assetsSrc = path.join(__dirname, "../assets");
const assetsDst = path.join(__dirname, "../dist/assets");
if (fs.existsSync(assetsSrc)) {
  fs.mkdirSync(assetsDst, { recursive: true });
  for (const file of fs.readdirSync(assetsSrc)) {
    fs.copyFileSync(path.join(assetsSrc, file), path.join(assetsDst, file));
  }
}
console.log("Embedded PDF renderer module & app assets generated.");
