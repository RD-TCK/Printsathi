import { exec } from "node:child_process";
import { agentDaemon } from "./daemon";
import { AgentWebServer } from "./ui";
import { logger } from "./logger";

export async function main() {
  const args = process.argv.slice(2);
  let pairingCode: string | null = null;
  let port = 4321;
  let serviceMode = false; // run headless as a Windows Service (no web UI)

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--pair" && args[i + 1]) {
      pairingCode = args[i + 1];
      i++;
    } else if (args[i] === "--port" && args[i + 1]) {
      port = parseInt(args[i + 1], 10) || 4321;
      i++;
    } else if (args[i] === "--service") {
      // Headless mode: used by NSSM Windows Service installation.
      serviceMode = true;
    }
  }

  logger.info(`Starting PrintSaathi Windows Desktop Agent${serviceMode ? " [Service Mode]" : ""}...`);

  // Start background daemon (printer discovery, job polling, heartbeat)
  await agentDaemon.start();

  // If pairing code provided via CLI
  if (pairingCode) {
    try {
      await agentDaemon.pair(pairingCode);
    } catch (err) {
      logger.error("CLI Pairing failed:", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (!serviceMode) {
    // Interactive mode: start the local web dashboard
    const webServer = new AgentWebServer(port);
    const assignedPort = await webServer.start();
    const dashboardUrl = `http://127.0.0.1:${assignedPort}`;
    logger.info(`PrintSaathi Agent dashboard: ${dashboardUrl}`);

    // Automatically open the graphical interface in the default browser
    try {
      if (process.platform === "win32") {
        exec(`start "" "${dashboardUrl}"`);
      } else if (process.platform === "darwin") {
        exec(`open "${dashboardUrl}"`);
      } else {
        exec(`xdg-open "${dashboardUrl}"`);
      }
    } catch {
      // Browser auto-launch failed silently, dashboard remains accessible via URL
    }

    const shutdown = () => {
      logger.info("Gracefully shutting down agent...");
      agentDaemon.stop();
      webServer.stop();
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } else {
    // Service mode: keep process alive; NSSM handles restart on crash.
    logger.info("Running in headless service mode (NSSM). Dashboard at http://127.0.0.1:4321 via tray app.");
    const shutdown = () => {
      logger.info("Gracefully shutting down agent service...");
      agentDaemon.stop();
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    // Keep the process alive
    setInterval(() => {}, 60_000);
  }
}

if (typeof require !== "undefined" && require.main === module) {
  main().catch((err) => {
    console.error("Fatal error starting agent:", err);
    process.exit(1);
  });
}
