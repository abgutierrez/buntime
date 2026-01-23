import { IPCServer } from "../ipc/server";
import { loadConfig } from "../config";

const shmName = "/execution-policies-bun";
const server = new IPCServer(shmName, 1024 * 1024); // 1MB
const config = await loadConfig();

await server.start(["python3", "src/worker.py"], config);

// Run for 5 seconds then stop
await new Promise((resolve) => setTimeout(resolve, 5000));

server.stop();
console.log("Done");
