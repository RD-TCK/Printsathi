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
    const handleIncoming = (service as unknown as { handleIncomingMessage: (msg: unknown) => Promise<void> })
      .handleIncomingMessage.bind(service);

    // Message from a group should be ignored
    await expect(
      handleIncoming({
        key: { id: "msg_group", remoteJid: "120363401033312987@g.us", fromMe: false },
        message: { documentMessage: { fileName: "doc.pdf" } },
      })
    ).resolves.toBeUndefined();

    // Message with no content should be skipped
    await expect(
      handleIncoming({
        key: { id: "msg_empty", remoteJid: "174603523616967@lid", fromMe: false },
        message: null,
      })
    ).resolves.toBeUndefined();

    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });
});
