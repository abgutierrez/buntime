import { IPCServer } from "./ipc/server";

const shmName = "/bun_ipc_test";
const server = new IPCServer(shmName, 1024 * 1024); // 1MB

await server.start("src/worker.py");

// Run for 5 seconds then stop
await new Promise(resolve => setTimeout(resolve, 5000));

server.stop();
console.log("Done");
