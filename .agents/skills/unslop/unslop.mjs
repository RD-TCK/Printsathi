#!/usr/bin/env node
// UNSLOP's dependency-free agent helper. Credentials never go to stdout.
import { createHash, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, rename, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

export class HelperError extends Error {}

const DEFAULT_ORIGIN = "https://www.unslop.live";
const KEY = /^unslop_(?:live|test)_[a-f0-9]{32}_[A-Za-z0-9_-]{43}$/;
const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const CODE = /^[A-Za-z0-9_-]{43}$/;

export function parseOrigin(value = DEFAULT_ORIGIN) {
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      ))
  )
    throw new HelperError(
      "Use an HTTPS UNSLOP origin, or a loopback HTTP origin for local development.",
    );
  return url.origin;
}

export function credentialPath(
  origin,
  directory = join(homedir(), ".config", "unslop"),
) {
  return join(
    directory,
    `${createHash("sha256").update(parseOrigin(origin)).digest("hex")}.json`,
  );
}

async function assertPrivateDirectory(directory) {
  if (typeof process.getuid !== "function")
    throw new HelperError(
      "This helper needs private Unix file permissions. Use your client's secret environment on this platform.",
    );
  const info = await lstat(directory);
  const parent = await lstat(dirname(directory));
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    info.uid !== process.getuid() ||
    info.mode & 0o077 ||
    !parent.isDirectory() ||
    parent.isSymbolicLink() ||
    parent.uid !== process.getuid() ||
    parent.mode & 0o022
  )
    throw new HelperError(
      "UNSLOP's credential directory must be owned by you with mode 0700, without symlinks.",
    );
}

async function privateDirectory(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await assertPrivateDirectory(directory);
}

export async function readPrivateJson(path) {
  let file;
  try {
    await assertPrivateDirectory(dirname(path));
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const info = await file.stat();
    if (
      !info.isFile() ||
      info.size > 16_384 ||
      typeof process.getuid !== "function" ||
      info.uid !== process.getuid() ||
      info.mode & 0o077 ||
      info.nlink !== 1
    )
      throw new HelperError(
        "UNSLOP credentials must be a private, owned file with mode 0600.",
      );
    return JSON.parse(await file.readFile("utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw new HelperError(
      "Could not safely read UNSLOP's private connection file.",
    );
  } finally {
    await file?.close();
  }
}

export async function writePrivateJson(path, value) {
  await privateDirectory(dirname(path));
  // Atomic replacement never follows a destination symlink or leaves partial JSON.
  const temporary = `${path}.${randomBytes(12).toString("hex")}.tmp`;
  let file;
  try {
    file = await open(
      temporary,
      constants.O_CREAT |
        constants.O_EXCL |
        constants.O_WRONLY |
        constants.O_NOFOLLOW,
      0o600,
    );
    await file.writeFile(JSON.stringify(value), "utf8");
    await file.sync();
    await file.close();
    file = null;
    await rename(temporary, path);
  } finally {
    await file?.close();
    await unlink(temporary).catch(() => {});
  }
}

export class ApiError extends HelperError {
  constructor(status, code, retryAfter = 60) {
    const action =
      {
        KEY_LIMIT:
          " Revoke an old connection in the UNSLOP dashboard, then run connect again.",
        CONNECTION_INVALID:
          " Run connect again for a fresh authorization link.",
        CONNECTION_UNAVAILABLE:
          " This server has not enabled agent connections yet.",
        API_KEY_REQUIRED: " Run connect to authorize your agent.",
      }[code] || "";
    super(`UNSLOP returned ${status} (${code}).${action}`);
    this.status = status;
    this.code = code;
    this.retryAfter = Number.isFinite(retryAfter)
      ? Math.max(5, Math.min(60, retryAfter))
      : 60;
  }
}

export async function api(
  origin,
  path,
  { method = "GET", body, key, idempotencyKey } = {},
) {
  const target = new URL(path, parseOrigin(origin));
  if (
    !path.startsWith("/v1/") ||
    target.origin !== origin ||
    target.username ||
    target.password ||
    target.search ||
    target.hash
  )
    throw new HelperError(
      "Only UNSLOP API paths on the connected origin are allowed.",
    );
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (key) {
    if (!KEY.test(key))
      throw new HelperError("The configured UNSLOP credential is invalid.");
    headers.Authorization = `Bearer ${key}`;
  }
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  let response;
  try {
    response = await fetch(target, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(
        method === "POST" && ["/v1/rewrites", "/v1/checks"].includes(path)
          ? 300_000
          : 20_000,
      ),
    });
  } catch {
    throw new HelperError(
      "UNSLOP could not be reached. No automatic retry was made; preserve the request and idempotency key for an unknown writing outcome.",
    );
  }
  let result;
  try {
    if (!response.body) throw new HelperError();
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 1_048_576) {
          await reader.cancel();
          throw new HelperError();
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HelperError(
      "UNSLOP returned an unreadable response. Preserve the original request; do not assume it failed before processing.",
    );
  }
  if (!response.ok)
    throw new ApiError(
      response.status,
      /^[A-Z0-9_]{1,80}$/.test(result?.error?.code)
        ? result.error.code
        : "REQUEST_FAILED",
      Number(response.headers.get("Retry-After") || 60),
    );
  return result;
}

async function storedKey(origin, file) {
  if (process.env.UNSLOP_API_KEY) {
    // Environment credentials have no implicit permission to leave their issuer.
    const issuer = parseOrigin(process.env.UNSLOP_API_ORIGIN || DEFAULT_ORIGIN);
    if (origin !== issuer)
      throw new HelperError(
        "The environment key belongs to another origin. Set UNSLOP_API_ORIGIN explicitly or use the existing connection for that origin.",
      );
    if (!KEY.test(process.env.UNSLOP_API_KEY))
      throw new HelperError("The configured UNSLOP_API_KEY is invalid.");
    return process.env.UNSLOP_API_KEY;
  }
  const saved = await readPrivateJson(file);
  if (!saved) return null;
  if (saved.origin !== origin || !KEY.test(saved.api_key))
    throw new HelperError("The saved UNSLOP connection is invalid.");
  return saved.api_key;
}

export async function verifyConnection(origin, key) {
  const project = await api(origin, "/v1/project", { key });
  const usage = await api(origin, "/v1/usage", { key });
  if (
    !project?.project ||
    !UUID.test(project.project.id) ||
    typeof project.project.name !== "string" ||
    !Number.isSafeInteger(project.project.context_version) ||
    !Number.isFinite(usage?.remaining)
  )
    throw new HelperError(
      "UNSLOP's connection checks returned an unexpected response.",
    );
  return {
    connected: true,
    project: {
      id: project.project.id,
      name: project.project.name,
      context_version: project.project.context_version,
    },
    remaining: usage.remaining,
  };
}

function openBrowser(url) {
  // No shell or interpolation: only a validated same-origin authorization URL.
  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "linux"
        ? "xdg-open"
        : null;
  if (!command) return;
  const child = spawn(command, [url], { stdio: "ignore", detached: true });
  child.on("error", () => {});
  child.unref();
}

async function connectionLock(file) {
  const path = `${file}.lock`;
  let handle;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      handle = await open(
        path,
        constants.O_CREAT |
          constants.O_EXCL |
          constants.O_WRONLY |
          constants.O_NOFOLLOW,
        0o600,
      );
      await handle.writeFile(JSON.stringify({ pid: process.pid }));
      await handle.close();
      return async () => {
        await unlink(path).catch(() => {});
      };
    } catch (error) {
      await handle?.close();
      if (error?.code !== "EEXIST")
        throw new HelperError(
          "Could not lock UNSLOP's private connection file.",
        );
      const lock = await readPrivateJson(path);
      if (!Number.isSafeInteger(lock?.pid) || lock.pid <= 0)
        throw new HelperError(
          "An invalid UNSLOP connection lock needs to be removed from the private config directory.",
        );
      try {
        process.kill(lock.pid, 0);
      } catch (probe) {
        if (probe?.code === "ESRCH") {
          await unlink(path);
          continue;
        }
      }
      throw new HelperError(
        "UNSLOP setup is already running. Finish its browser authorization first.",
      );
    }
  }
  throw new HelperError("UNSLOP setup is already running.");
}

export async function connect(origin, { noBrowser = false } = {}) {
  const file = credentialPath(origin);
  const existing = await storedKey(origin, file);
  if (existing) {
    try {
      return await verifyConnection(origin, existing);
    } catch (error) {
      if (
        !(error instanceof ApiError) ||
        error.status !== 401 ||
        process.env.UNSLOP_API_KEY
      )
        throw error;
      // An expired/revoked saved key can reconnect; an unavailable server cannot.
    }
  }
  await privateDirectory(dirname(file));
  const unlock = await connectionLock(file);
  try {
    const pendingPath = `${file}.pending`;
    let pending = await readPrivateJson(pendingPath);
    if (!pending || pending.expires_at <= Date.now()) {
      const verifier = randomBytes(32).toString("base64url");
      const started = await api(origin, "/v1/agent/connection", {
        method: "POST",
        body: {
          code_challenge: createHash("sha256")
            .update(verifier)
            .digest("base64url"),
          client_name: "Your AI agent",
        },
      });
      if (
        !UUID.test(started?.device_id) ||
        !Number.isInteger(started.expires_in) ||
        started.expires_in < 1 ||
        started.expires_in > 600 ||
        !Number.isInteger(started.interval) ||
        started.interval < 5 ||
        started.interval > 60
      )
        throw new HelperError("UNSLOP returned an invalid connection request.");
      pending = {
        origin,
        device_id: started.device_id,
        verifier,
        verification_uri_complete: started.verification_uri_complete,
        expires_at: Date.now() + started.expires_in * 1_000,
        interval: started.interval,
      };
      await writePrivateJson(pendingPath, pending);
    }
    const target = new URL(pending.verification_uri_complete);
    if (
      pending.origin !== origin ||
      !UUID.test(pending.device_id) ||
      !CODE.test(pending.verifier) ||
      !Number.isFinite(pending.expires_at) ||
      pending.expires_at > Date.now() + 600_000 ||
      !Number.isInteger(pending.interval) ||
      pending.interval < 5 ||
      pending.interval > 60 ||
      target.origin !== origin ||
      target.pathname !== "/connect" ||
      target.username ||
      target.password ||
      target.hash ||
      !CODE.test(target.searchParams.get("code") || "") ||
      [...target.searchParams.keys()].length !== 1
    )
      throw new HelperError("UNSLOP returned an invalid authorization link.");
    process.stderr.write(
      `Authorize UNSLOP with GitHub:\n${target.href}\nWaiting for your authorization. No key copying is needed.\n`,
    );
    if (!noBrowser) openBrowser(target.href);
    let interval = pending.interval;
    while (Date.now() < pending.expires_at) {
      await delay(interval * 1_000);
      if (Date.now() >= pending.expires_at) break;
      let result;
      try {
        result = await api(origin, "/v1/agent/connection/token", {
          method: "POST",
          body: {
            device_id: pending.device_id,
            code_verifier: pending.verifier,
          },
        });
        interval = pending.interval;
      } catch (error) {
        // Only the non-billable connection poll may back off automatically.
        if (error instanceof ApiError && error.status === 429) {
          interval = error.retryAfter;
          continue;
        }
        if (error instanceof ApiError && error.code === "CONNECTION_INVALID")
          await unlink(pendingPath);
        throw error;
      }
      if (result.status === "pending") continue;
      if (result.status !== "connected" || !KEY.test(result.api_key))
        throw new HelperError("UNSLOP returned an invalid connection result.");
      await writePrivateJson(file, {
        origin,
        api_key: result.api_key,
        key_id: result.key?.id,
      });
      await unlink(pendingPath);
      return await verifyConnection(origin, result.api_key);
    }
    throw new HelperError(
      "The connection link expired. Run connect again for a fresh link.",
    );
  } finally {
    await unlock();
  }
}

export function validateRequest(method, path, idempotencyKey) {
  const allowed =
    (method === "GET" &&
      (["/v1/project", "/v1/usage", "/v1/patterns"].includes(path) ||
        (path.startsWith("/v1/checks/") &&
          UUID.test(path.slice("/v1/checks/".length))))) ||
    (method === "PATCH" && path === "/v1/project") ||
    (method === "POST" && ["/v1/checks", "/v1/rewrites"].includes(path));
  if (!allowed)
    throw new HelperError(
      "Use a supported UNSLOP project, usage, patterns, check or rewrite endpoint.",
    );
  if (method === "POST" && !UUID.test(idempotencyKey || ""))
    throw new HelperError(
      "Supply --idempotency-key=<UUID> for a writing request; save it with the original payload for recovery.",
    );
}

async function readInput() {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > 32_768)
      throw new HelperError(
        "The JSON body exceeds 32 KB. Split the artifact explicitly.",
      );
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HelperError("Provide the JSON request body on stdin.");
  }
}

export async function main(args = process.argv.slice(2)) {
  if (Number(process.versions.node.split(".")[0]) < 22)
    throw new HelperError("UNSLOP's helper requires Node.js 22 or later.");
  const values = args.filter((arg) => !arg.startsWith("--"));
  const options = args.filter((arg) => arg.startsWith("--"));
  if (
    options.some(
      (arg) =>
        !arg.startsWith("--origin=") &&
        !arg.startsWith("--idempotency-key=") &&
        arg !== "--no-browser" &&
        arg !== "--help",
    )
  )
    throw new HelperError("Unknown option. Use --help for usage.");
  if (!values.length || options.includes("--help")) {
    process.stdout.write(
      "UNSLOP agent helper\n  connect [--origin=https://www.unslop.live] [--no-browser]\n  request GET /v1/project\n  request POST /v1/rewrites --idempotency-key=<UUID> < draft.json\n  request PATCH /v1/project < approved-context.json\nSecrets are stored privately outside the project and are never printed.\n",
    );
    return;
  }
  const option = (prefix) => {
    const matches = options.filter((value) => value.startsWith(prefix));
    if (matches.length > 1)
      throw new HelperError("Do not repeat command options.");
    return matches[0]?.slice(prefix.length);
  };
  const origin = parseOrigin(option("--origin=") || DEFAULT_ORIGIN);
  if (values[0] === "connect" && values.length === 1) {
    process.stdout.write(
      `${JSON.stringify(await connect(origin, { noBrowser: options.includes("--no-browser") }))}\n`,
    );
    return;
  }
  if (values[0] !== "request" || values.length !== 3)
    throw new HelperError(
      "Use connect or request METHOD /v1/path. Run --help for usage.",
    );
  const [, method, path] = values;
  const idempotencyKey = option("--idempotency-key=");
  validateRequest(method, path, idempotencyKey);
  const key = await storedKey(origin, credentialPath(origin));
  if (!key)
    throw new HelperError(
      "Connect UNSLOP first: run this helper with connect.",
    );
  const body = method === "GET" ? undefined : await readInput();
  const result = await api(origin, path, { method, key, body, idempotencyKey });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof HelperError ? error.message : "UNSLOP could not complete the request."}\n`,
    );
    process.exitCode = 1;
  });
}
