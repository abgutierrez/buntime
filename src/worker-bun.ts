import { shmOpen, mmap, close } from "./ipc/ffi";
import { SharedRingBuffer } from "./ipc/ringbuffer";

const argv = Bun.argv;
if (argv.length < 5) {
  console.error("Usage: bun worker-bun.ts <socket_path> <shm_name> <shm_size>");
  process.exit(1);
}

const socketPath = argv[2] ?? "";
const shmName = argv[3] ?? "";
const shmSize = Number(argv[4] ?? "0");

const namesToTry = [
  shmName,
  shmName.startsWith("/") ? shmName.slice(1) : `/${shmName}`,
  shmName.replace(/^\/+/, ""),
];
let shmFd = -1;
for (const candidate of new Set(namesToTry)) {
  if (!candidate) continue;
  shmFd = shmOpen(candidate, 0);
  if (shmFd >= 0) {
    break;
  }
}
if (shmFd < 0) {
  console.error("[BunWorker] Failed to open shared memory");
  process.exit(1);
}

const shmPtr = mmap(shmFd, shmSize);
if (!shmPtr) {
  console.error("[BunWorker] Failed to mmap shared memory");
  process.exit(1);
}

const ringSize = Math.floor(shmSize / 2);
const bun2worker = new SharedRingBuffer(shmPtr, ringSize);
const worker2bun = new SharedRingBuffer(shmPtr + ringSize, ringSize);

if (bun2worker.capacity === 0) {
  bun2worker.capacity = ringSize - 64;
}
if (worker2bun.capacity === 0) {
  worker2bun.capacity = ringSize - 64;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const socket = await Bun.connect({
  unix: socketPath,
  socket: {
    data() {},
    error(_, error) {
      console.error("[BunWorker] Socket error", error);
    },
  },
});

function sendLine(line: string) {
  socket.write(line);
}

function sendState(event: string, data?: Record<string, unknown>) {
  const payload = { type: "state", event, data };
  sendLine(JSON.stringify(payload) + "\n");
}

async function writeOutput(text: string) {
  if (!text) return;
  const data = encoder.encode(text);
  let offset = 0;
  while (offset < data.length) {
    const written = worker2bun.write(data.subarray(offset));
    if (written > 0) {
      offset += written;
      sendLine("DATA\n");
    } else {
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
  }
}

const originalLog = console.log;
const originalError = console.error;
console.log = (...args: unknown[]) => {
  void writeOutput(args.map(String).join(" ") + "\n");
};
console.error = (...args: unknown[]) => {
  void writeOutput(args.map(String).join(" ") + "\n");
};

sendLine("READY\n");

while (true) {
  const msg = bun2worker.read();
  if (!msg) {
    await new Promise((resolve) => setTimeout(resolve, 1));
    continue;
  }

  const code = decoder.decode(msg);
  sendState("code_received", { code_length: code.length });

  try {
    sendState("exec_start");
    let result: unknown;
    try {
      const runner = new Function(`return (async () => {\n${code}\n})()`);
      result = runner();
      if (result instanceof Promise) {
        result = await result;
      }
    } catch (error) {
      result = undefined;
      throw error;
    }
    if (result !== undefined) {
      await writeOutput(String(result) + "\n");
    }
    sendState("exec_end", { success: true });
  } catch (error: any) {
    sendState("exception", { error: error?.message ?? String(error) });
    await writeOutput(`${error?.stack ?? error}\n`);
  }
}

console.log = originalLog;
console.error = originalError;
close(shmFd);
