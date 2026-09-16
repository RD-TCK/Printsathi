require("@next/env").loadEnvConfig(process.cwd());
const { createClient } = require("@supabase/supabase-js");
const { randomUUID, randomBytes, createHash } = require("node:crypto");
const assert = require("node:assert/strict");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const base = process.argv[2] || "http://localhost:3001";
const id = randomUUID();
const token = randomBytes(32).toString("hex");
async function main() {
  const { data: shop, error } = await db.from("shops").select("id").eq("is_active", true).limit(1).single();
  if (error) throw error;
  try {
    const { error: agentError } = await db.from("desktop_agents").insert({
      id, shop_id: shop.id, name: "Temporary heartbeat smoke test", status: "offline",
      auth_token_hash: createHash("sha256").update(token).digest("hex"), is_revoked: false,
    });
    if (agentError) throw agentError;
    const printer = { name: `Smoke test ${id}`, systemIdentifier: `smoke_${id}`, status: "offline", isDefault: false,
      capabilities: { colorSupport: false, paperSizes: ["A4"] } };
    async function heartbeat(printers) {
      const response = await fetch(`${base}/api/agent/heartbeat`, { method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ printers, currentJobId: null, version: "smoke-test" }) });
      const body = await response.json(); assert.equal(response.status, 200, body.error);
    }
    await heartbeat([printer]);
    await heartbeat([{ ...printer, isDefault: true }]);
    const { data: saved, error: readError } = await db.from("printers").select("is_default, is_online, capabilities, last_seen_at")
      .eq("shop_id", shop.id).eq("desktop_agent_id", id).single();
    if (readError) throw readError;
    assert.equal(saved.is_default, false, "Heartbeat must preserve the owner's default selection");
    assert.equal(saved.is_online, false);
    assert.equal(saved.capabilities.colorSupport, false);
    assert(saved.last_seen_at);
    await heartbeat([]);
    console.log("PASS real heartbeat registration, B&W capabilities, default preservation, and empty inventory");
  } finally {
    const { error: printerError } = await db.from("printers").delete().eq("desktop_agent_id", id).eq("shop_id", shop.id);
    if (printerError) throw printerError;
    const { error: agentError } = await db.from("desktop_agents").delete().eq("id", id).eq("shop_id", shop.id);
    if (agentError) throw agentError;
    console.log("Removed temporary offline test agent and printer");
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
