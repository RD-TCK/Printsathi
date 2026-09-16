const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const output = path.resolve("diagnostics/download-page.png");
fs.mkdirSync(path.dirname(output), { recursive: true });
const browser = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", [
  "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
  "--remote-debugging-port=9225", `--user-data-dir=${path.resolve("diagnostics/chrome-check")}`, "about:blank",
], { windowsHide: true, stdio: "ignore" });
let socket;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  let target;
  for (let i = 0; i < 40; i++) {
    try {
      const response = await fetch("http://127.0.0.1:9225/json/new?" + encodeURIComponent(process.argv[2] || "http://localhost:3001/download"), { method: "PUT" });
      target = await response.json(); break;
    } catch { await delay(250); }
  }
  assert(target, "Chrome did not start");
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0;
  const pending = new Map();
  socket.onmessage = event => { const data = JSON.parse(event.data); const request = pending.get(data.id); if (request) { pending.delete(data.id); if (data.error) request.reject(new Error(data.error.message)); else request.resolve(data.result); } };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const next = ++id; pending.set(next, { resolve, reject }); socket.send(JSON.stringify({ id: next, method, params })); });
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  let styles;
  for (let i = 0; i < 40; i++) {
    const result = await send("Runtime.evaluate", { expression: `(() => {
      const heading = document.querySelector('h1');
      const button = document.querySelector('a[href="/api/agent/download"]');
      if (!heading || !button) return null;
      return { background: getComputedStyle(heading.parentElement).backgroundColor, text: getComputedStyle(button).color, label: button.textContent, ready: document.readyState };
    })()`, returnByValue: true });
    styles = result.result.value;
    if (styles?.ready === "complete") break;
    await delay(500);
  }
  assert(styles, "Download page did not render");
  assert.equal(styles.background, "rgb(20, 83, 45)");
  assert.equal(styles.text, "rgb(20, 83, 45)");
  assert.match(styles.label, /Download Windows agent/);
  const screenshot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  fs.writeFileSync(output, Buffer.from(screenshot.data, "base64"));
  console.log("PASS visible download banner and button", JSON.stringify(styles));
  console.log(output);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { socket?.close(); browser.kill(); });
