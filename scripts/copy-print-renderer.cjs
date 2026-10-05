const fs = require("node:fs");
const path = require("node:path");
const source = path.join(path.dirname(require.resolve("pdf-to-printer")), "SumatraPDF-3.4.6-32.exe");
const destinationJson = path.join(__dirname, "../dist/agent/renderer-data.json");
const destinationExe = path.join(__dirname, "../dist/agent/SumatraPDF.exe");
fs.mkdirSync(path.dirname(destinationJson), { recursive: true });
fs.writeFileSync(destinationJson, JSON.stringify({ base64: fs.readFileSync(source).toString("base64") }));
if (fs.existsSync(source)) {
  try {
    fs.copyFileSync(source, destinationExe);
  } catch (err) {
    // If the binary is already in dist/agent/ and locked by a background process, keep the existing one
    if (!fs.existsSync(destinationExe)) {
      throw err;
    }
  }
}
const assetsSrc = path.join(__dirname, "../assets");
const assetsDst = path.join(__dirname, "../dist/assets");
if (fs.existsSync(assetsSrc)) {
  fs.mkdirSync(assetsDst, { recursive: true });
  for (const file of fs.readdirSync(assetsSrc)) {
    fs.copyFileSync(path.join(assetsSrc, file), path.join(assetsDst, file));
  }
}
try {
  const pkgJsonPath = path.join(__dirname, "../node_modules/whatsapp-rust-bridge/package.json");
  if (fs.existsSync(pkgJsonPath)) {
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
    if (!pkgJson.main || !pkgJson.exports?.["."]?.require) {
      pkgJson.main = "./dist/index.js";
      if (!pkgJson.exports) pkgJson.exports = {};
      if (!pkgJson.exports["."]) pkgJson.exports["."] = {};
      pkgJson.exports["."].require = "./dist/index.js";
      pkgJson.exports["."].default = "./dist/index.js";
      fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 4));
    }
  }
} catch {
  // ignore
}
console.log("Embedded PDF renderer module & app assets generated.");
