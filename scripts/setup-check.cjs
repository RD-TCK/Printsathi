const { loadEnvConfig } = require("@next/env");
const fs = require("node:fs");
const path = require("node:path");
loadEnvConfig(process.cwd());
let missing = false;
function check(label, ready, help) { console.log(`${ready ? "OK" : "SETUP"} ${label}${ready ? "" : ": " + help}`); if (!ready) missing = true; }
for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"]) {
  check(key, Boolean(process.env[key] && !/your_|placeholder/.test(process.env[key])), "Set in .env.local (value hidden)");
}
check("Office document conversion", fs.existsSync(process.env.LIBREOFFICE_PATH || "C:/Program Files/LibreOffice/program/soffice.exe"), "Install LibreOffice and set LIBREOFFICE_PATH to its executable");
check("Agent download", Boolean(process.env.AGENT_DOWNLOAD_URL || fs.existsSync(process.env.AGENT_BINARY_PATH || path.join("dist", "PrintivaAgent.exe"))), "Run npm run build:agent on Windows or set AGENT_DOWNLOAD_URL");
console.log("Also apply supabase/migrations in filename order and configure the Razorpay webhook; see SETUP.md.");
process.exitCode = missing ? 1 : 0;

