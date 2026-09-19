import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ start: vi.fn(), exec: vi.fn() }));
vi.mock("./daemon", () => ({ agentDaemon: { start: mocks.start } }));
vi.mock("./ui", () => ({ AgentWebServer: vi.fn() }));
vi.mock("./logger", () => ({ logger: { info: vi.fn() } }));
vi.mock("./print-executor", () => ({ checkPrintBackend: vi.fn() }));
vi.mock("node:child_process", () => ({ exec: mocks.exec }));
import { main } from "./index";
const originalArgs = process.argv;
afterEach(() => { process.argv = originalArgs; vi.unstubAllGlobals(); vi.resetAllMocks(); });
describe("downloaded agent startup", () => {
  it("reopens an existing agent instead of crashing on a second launch", async () => {
    process.argv = ["node", "agent"];
    mocks.start.mockRejectedValue(new Error("Another Printiva agent is already running."));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ isPaired: false, printers: [] }) }));
    await expect(main()).resolves.toBeUndefined();
    expect(mocks.exec).toHaveBeenCalledWith('start "" "http://127.0.0.1:4321"');
  });
  it("does not hide unrelated startup failures", async () => {
    mocks.start.mockRejectedValue(new Error("Access denied"));
    await expect(main()).rejects.toThrow("Access denied");
    expect(mocks.exec).not.toHaveBeenCalled();
  });
});
