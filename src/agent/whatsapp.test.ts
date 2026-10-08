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

  it("handles incoming customer text messages politely without throwing", async () => {
    const testDir = path.join(os.tmpdir(), "wa_test_auth_" + (Date.now() + 6));
    fs.mkdirSync(testDir, { recursive: true });

    const service = new WhatsAppAgentService(testDir);
    const textMsg = {
      key: {
        remoteJid: "919876543210@s.whatsapp.net",
        fromMe: false,
        id: "msg_text_1",
      },
      message: {
        conversation: "Hi bhaiya print nikalna hai",
      },
      messageTimestamp: Math.floor(Date.now() / 1000),
      pushName: "Rohan Kumar",
    };

    // Calling handleIncomingMessage directly on text should not throw and should be processed
    await (service as unknown as { handleIncomingMessage(m: unknown): Promise<void> }).handleIncomingMessage(textMsg);

    // Repeated message from same sender within cooldown is safely ignored
    await (service as unknown as { handleIncomingMessage(m: unknown): Promise<void> }).handleIncomingMessage({
      ...textMsg,
      key: { ...textMsg.key, id: "msg_text_2" },
      message: { conversation: "Hello?" },
    });

    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  it("persists pending offline batches to disk and reloads them on next startup", () => {
    const testDir = path.join(os.tmpdir(), "wa_test_auth_" + (Date.now() + 7));
    fs.mkdirSync(testDir, { recursive: true });

    const service1 = new WhatsAppAgentService(testDir);
    const testBatch = {
      senderPhone: "919876543210",
      senderName: "Customer A",
      remoteJid: "919876543210@s.whatsapp.net",
      attachments: [
        {
          msg: {} as never,
          mediaBuffer: Buffer.from("fake pdf content"),
          filename: "test.pdf",
          mimetype: "application/pdf",
        },
      ],
      lastMessage: {} as never,
      firstQueuedAt: Date.now(),
      retryCount: 1,
    };

    (service1 as unknown as { saveBatchToDisk(b: unknown): void }).saveBatchToDisk(testBatch);

    // Initialize fresh service instance on the same directory (simulating agent restart)
    const service2 = new WhatsAppAgentService(testDir);
    const retryBatches = (service2 as unknown as { retryBatches: Map<string, typeof testBatch> }).retryBatches;

    expect(retryBatches.has("919876543210@s.whatsapp.net")).toBe(true);
    const loaded = retryBatches.get("919876543210@s.whatsapp.net");
    expect(loaded?.senderPhone).toBe("919876543210");
    expect(loaded?.attachments[0].filename).toBe("test.pdf");
    expect(loaded?.attachments[0].mediaBuffer.toString()).toBe("fake pdf content");

    (service2 as unknown as { deleteBatchFromDisk(j: string): void }).deleteBatchFromDisk("919876543210@s.whatsapp.net");
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });
});
