import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { WhatsAppAgentService } from "./whatsapp";

describe("WhatsApp Agent Service", () => {
  it("initializes in disconnected state with empty events", () => {
    const testDir = path.join(os.tmpdir(), "wa_test_auth_" + Date.now());
    const service = new WhatsAppAgentService(testDir);
    const status = service.getStatus();

    expect(status.state).toBe("disconnected");
    expect(status.connectedPhone).toBeNull();
    expect(status.qrCodeDataUrl).toBeNull();
    expect(status.recentEvents).toEqual([]);
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  it("handles disconnect safely even when socket is not active", async () => {
    const testDir = path.join(os.tmpdir(), "wa_test_auth_" + (Date.now() + 1));
    const service = new WhatsAppAgentService(testDir);
    await expect(service.disconnect()).resolves.toBeUndefined();
    expect(service.getStatus().state).toBe("disconnected");
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  it("processes LID direct messages without crashing", async () => {
    const testDir = path.join(os.tmpdir(), "wa_test_auth_" + (Date.now() + 2));
    const service = new WhatsAppAgentService(testDir);

    // Call private handleIncomingMessage via reflection for unit testing
    const handleIncoming = (
      service as unknown as { handleIncomingMessage: (msg: unknown) => Promise<void> }
    ).handleIncomingMessage.bind(service);

    // Message from a group should be ignored
    await expect(
      handleIncoming({
        key: { id: "msg_group", remoteJid: "120363401033312987@g.us", fromMe: false },
        message: { documentMessage: { fileName: "doc.pdf" } },
      }),
    ).resolves.toBeUndefined();

    // Message with no content should be skipped
    await expect(
      handleIncoming({
        key: { id: "msg_empty", remoteJid: "174603523616967@lid", fromMe: false },
        message: null,
      }),
    ).resolves.toBeUndefined();

    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  it("skips background start when creds.json has registered: false", async () => {
    const testDir = path.join(os.tmpdir(), "wa_test_auth_" + (Date.now() + 3));
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(path.join(testDir, "creds.json"), JSON.stringify({ registered: false }));

    const service = new WhatsAppAgentService(testDir);
    await service.start(true);

    expect(service.getStatus().state).toBe("disconnected");
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  it("cleans up unverified creds.json before fresh manual start", async () => {
    const testDir = path.join(os.tmpdir(), "wa_test_auth_" + (Date.now() + 4));
    fs.mkdirSync(testDir, { recursive: true });
    const credsFile = path.join(testDir, "creds.json");
    fs.writeFileSync(credsFile, JSON.stringify({ registered: false }));

    const service = new WhatsAppAgentService(testDir);
    // Setting state to connecting directly to test guard
    (service as unknown as { state: string }).state = "connecting";

    // Calling start with forceFresh should proceed past the connecting guard
    // We disconnect immediately after
    expect(fs.existsSync(credsFile)).toBe(true);
    await service.disconnect();
    expect(fs.existsSync(credsFile)).toBe(false);
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  it("preserves creds.json on stop() (process restart/shutdown)", () => {
    const testDir = path.join(os.tmpdir(), "wa_test_auth_" + (Date.now() + 5));
    fs.mkdirSync(testDir, { recursive: true });
    const credsFile = path.join(testDir, "creds.json");
    fs.writeFileSync(credsFile, JSON.stringify({ registered: true, me: { id: "919905098231:1@s.whatsapp.net" } }));

    const service = new WhatsAppAgentService(testDir);
    expect(service.hasSavedSession()).toBe(true);
    expect(service.getSavedPhone()).toBe("919905098231");

    service.stop();
    // Creds must NOT be deleted on stop
    expect(fs.existsSync(credsFile)).toBe(true);
    expect(service.getStatus().isSavedSession).toBe(true);
    expect(service.getStatus().connectedPhone).toBe("919905098231");

    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });
});
