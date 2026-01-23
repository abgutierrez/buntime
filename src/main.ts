import { Supervisor } from "./supervisor/supervisor";
import { startDebugUi } from "./debug-ui/server";

const args = new Set(Bun.argv.slice(2));
const debugUiEnabled = args.has("--debug-ui") || process.env.DEBUG_UI === "1";

console.log("[Main] Starting Supervisor...");

const supervisor = new Supervisor({ workerType: "python" });

await supervisor.start();
if (debugUiEnabled) {
  startDebugUi(supervisor, {
    port: Number(process.env.PORT) || 3000,
  });
}

process.on("SIGINT", () => {
  console.log("\n[Main] Shutting down...");
  supervisor.stop();
  process.exit(0);
});
