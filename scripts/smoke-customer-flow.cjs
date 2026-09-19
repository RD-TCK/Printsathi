// Exercises a real upload and estimate, then removes only its own unpaid fixture.
require("@next/env").loadEnvConfig(process.cwd());
const assert = require("node:assert/strict");
const { createClient } = require("@supabase/supabase-js");
const { PDFDocument } = require("pdf-lib");
const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const base = process.env.PRINTIVA_SERVER_URL || "http://localhost:3000";

async function main() {
  const { data: shops, error } = await client.from("shops").select("id, public_id, shop_settings(accepting_orders), subscriptions(status, trial_end)").eq("is_active", true);
  if (error) throw error;
  const shop = shops.find(s => {
    const settings = Array.isArray(s.shop_settings) ? s.shop_settings[0] : s.shop_settings;
    const sub = Array.isArray(s.subscriptions) ? s.subscriptions[0] : s.subscriptions;
    return settings?.accepting_orders && (sub?.status === "active" || (sub?.status === "trial" && new Date(sub.trial_end) > new Date()));
  });
  assert(shop, "An active shop with a valid subscription is needed for the upload smoke test.");
  const pdf = await PDFDocument.create();
  pdf.addPage().drawText("Printiva upload smoke test - not for printing");
  pdf.addPage();
  const form = new FormData();
  form.set("shopIdentifier", shop.public_id);
  form.append("files", new Blob([await pdf.save()], { type: "application/pdf" }), "printsaathi-smoke-test.pdf");
  let order;
  try {
    const upload = await fetch(`${base}/api/customer/upload`, { method: "POST", body: form });
    const payload = await upload.json();
    assert.equal(upload.status, 200, payload.error);
    order = payload;
    assert.equal(order.documents[0].pageCount, 2);
    console.log("PASS real PDF upload, private storage, and page counting");
    const response = await fetch(`${base}/api/customer/estimate`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopIdentifier: shop.public_id, accessToken: order.accessToken,
        configurations: [{ orderId: order.orderId, documentId: order.documents[0].id,
          ranges: [{ startPage: 1, endPage: 2, colorMode: "black_and_white", paperSize: "a4" }] }] }),
    });
    const estimate = await response.json();
    assert.equal(response.status, 200, estimate.error);
    assert.equal(estimate.totalPages, 2);
    assert.equal(typeof estimate.total, "number");
    console.log("PASS server pricing and selected page totals");
    const tracking = await fetch(`${base}/api/customer/track?id=${encodeURIComponent(order.orderPublicId)}`);
    const tracked = await tracking.json();
    assert.equal(tracking.status, 200);
    assert.equal(tracked.status, "draft");
    console.log("PASS public order tracking");
  } finally {
    if (order) {
      const { data: documents, error: readError } = await client.from("documents").select("storage_path").eq("order_id", order.orderId);
      if (readError) throw readError;
      if (documents.length) {
        const { error: storageError } = await client.storage.from("print-documents").remove(documents.map(d => d.storage_path));
        if (storageError) throw storageError;
      }
      const { error: deleteError } = await client.from("orders").delete().eq("id", order.orderId).eq("status", "draft");
      if (deleteError) throw deleteError;
      console.log("Removed the smoke test's unpaid order and document");
    }
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
