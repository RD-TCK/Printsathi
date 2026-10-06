const path = require("path");
const fs = require("fs");
const os = require("os");
const { execSync, spawn } = require("child_process");
const asar = require("@electron/asar");

async function main() {
  const agentExePath = "D:\\updated\\Printiva Desktop Agent\\Printiva Desktop Agent.exe";
  const asarPath = "D:\\updated\\Printiva Desktop Agent\\resources\\app.asar";
  const sourceAgentDist = path.resolve(__dirname, "..", "dist", "agent");

  if (!fs.existsSync(asarPath)) {
    console.error("Target asar file not found at:", asarPath);
    process.exit(1);
  }

  console.log("1. Stopping running Printiva Desktop Agent process...");
  try {
    execSync('taskkill /IM "Printiva Desktop Agent.exe" /F', { stdio: "ignore" });
    console.log("   Process stopped.");
  } catch {
    console.log("   No active process found to stop.");
  }

  // Wait 1.5 seconds for file handles to be released
  await new Promise((r) => setTimeout(r, 1500));

  const tempExtractDir = path.join(os.tmpdir(), "printiva_asar_patch_" + Date.now());
  console.log("2. Extracting app.asar to temporary directory:", tempExtractDir);
  asar.extractAll(asarPath, tempExtractDir);

  console.log("3. Copying updated dist/agent files into extracted app...");
  const destAgentDist = path.join(tempExtractDir, "dist", "agent");
  fs.cpSync(sourceAgentDist, destAgentDist, { recursive: true, force: true });

  console.log("4. Backing up original app.asar to app.asar.bak...");
  const backupPath = asarPath + ".bak";
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(asarPath, backupPath);
  }

  console.log("5. Packing updated app.asar...");
  await asar.createPackage(tempExtractDir, asarPath);
  console.log("   app.asar updated successfully! Size:", fs.statSync(asarPath).size, "bytes");

  console.log("6. Cleaning up temporary files...");
  try {
    fs.rmSync(tempExtractDir, { recursive: true, force: true });
  } catch (err) {
    console.warn("   Cleanup warning:", err.message);
  }

  console.log("7. Restarting Printiva Desktop Agent...");
  if (fs.existsSync(agentExePath)) {
    const child = spawn(agentExePath, [], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    console.log("   Printiva Desktop Agent launched successfully in background.");
  } else {
    console.warn("   Agent exe not found at:", agentExePath);
  }

  console.log("Done! Agent patched and restarted.");
}

main().catch((err) => {
  console.error("Fatal error patching agent:", err);
  process.exit(1);
});
