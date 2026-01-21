import { shmOpen, shmUnlink, mmap, close } from "./ffi";
import { SharedRingBuffer } from "./ringbuffer";
import { unlink } from "node:fs";
import { SandboxLauncher } from "../sandbox/launcher"; // Import Launcher

export class IPCServer {
  private shmFd: number;
  private shmPtr: number;
  private shmSize: number;
  private shmName: string;
  
  public py2bun: SharedRingBuffer;
  public bun2py: SharedRingBuffer;
  
  private socketPath: string;
  private server: any;
  private processHandle: ReturnType<typeof Bun.spawn> | undefined;
  private sandboxPid: number | undefined; // Store PID for manual management
  private onMessage?: (data: Uint8Array) => void;
  private onStateChange?: (state: string, signal?: string) => void;
  private sendState?: (state: string, signal?: string) => void;
  
  constructor(shmName: string, size: number = 1024 * 1024, onMessage?: (data: Uint8Array) => void) {
    this.shmName = shmName;
    this.shmSize = size;
    this.onMessage = onMessage;
    
    shmUnlink(shmName);
    
    this.shmFd = shmOpen(shmName, size);
    if (this.shmFd < 0) throw new Error("Failed to shm_open");
    
    this.shmPtr = mmap(this.shmFd, size);
    if (this.shmPtr === 0) throw new Error("Failed to mmap");
    
    const ringSize = Math.floor(size / 2);
    
    this.bun2py = new SharedRingBuffer(this.shmPtr, ringSize);
    this.py2bun = new SharedRingBuffer(this.shmPtr + ringSize, ringSize);
    
    this.bun2py.capacity = ringSize - 64;
    this.bun2py.head = 0;
    this.bun2py.tail = 0;
    
    this.py2bun.capacity = ringSize - 64;
    this.py2bun.head = 0;
    this.py2bun.tail = 0;

    this.socketPath = `/tmp/bun-python-${Math.random().toString(36).slice(2)}.sock`;
  }
  
  async start(pythonScript: string) {
    console.log("[Bun] Starting IPC Server...");

    try { unlink(this.socketPath, () => {}); } catch {}

    const that = this;

    this.server = Bun.listen({
      unix: this.socketPath,
      socket: {
        open(socket) {
          console.log("[Bun] Python connected!");
          if (that.onStateChange) that.onStateChange("Python Connected", "READY");
        },
        data(socket, data) {
          const text = new TextDecoder().decode(data);
          const messages = text.split("\n").filter(x => x.trim().length > 0);

          for (const msg of messages) {
            if (msg.trim() === "READY") {
               console.log("[Bun] Python is ready");
               if (that.onStateChange) that.onStateChange("Ready", "READY");
            } else if (msg.trim() === "DATA") {
               that.handleData();
            }
          }
        },
        close() {
          console.log("[Bun] Python disconnected");
          if (that.onStateChange) that.onStateChange("Disconnected", "CLOSE");
        },
        error(err) {
            console.error("[Bun] Socket error", err);
        }
      }
    });

    console.log(`[Bun] Socket created at ${this.socketPath}`);

    const args = ["python3", pythonScript, this.socketPath, this.shmName, this.shmSize.toString()];

    if (process.platform === "linux") {
        try {
            console.log("[Bun] Using SandboxLauncher (Linux detected)");
            const launcher = new SandboxLauncher();
            this.sandboxPid = launcher.spawnProcess(args);
            console.log(`[Bun] Sandbox Spawned Python PID ${this.sandboxPid}`);
        } catch (e: any) {
            console.warn(`[Bun] Sandbox failed (${e.message}), falling back to Bun.spawn`);
            this.processHandle = Bun.spawn(args, {
                stdin: "inherit",
                stdout: "inherit",
                stderr: "inherit",
            });
            console.log(`[Bun] Spawned Python PID ${this.processHandle.pid}`);
        }
    } else {
        this.processHandle = Bun.spawn(args, {
            stdin: "inherit",
            stdout: "inherit",
            stderr: "inherit",
        });
        console.log(`[Bun] Spawned Python PID ${this.processHandle.pid}`);
    }
  }
  
  handleData() {
    while (true) {
        const msg = this.py2bun.read();
        if (!msg) break;
        
        if (this.onMessage) {
            this.onMessage(msg);
        }
    }
  }
  
  send(data: Uint8Array) {
    const written = this.bun2py.write(data);
    if (written === 0) {
        console.warn("[Bun] Ring buffer full!");
        return false;
    }
    return true;
  }

  interrupt() {
    if (this.processHandle) {
      this.processHandle.kill("SIGINT");
      console.log("[Bun] Sent SIGINT to Python");
    }
  }

  setOnStateChange(callback: (state: string, signal?: string) => void) {
    this.onStateChange = callback;
  }

  getMemoryState() {
    const bun2pySize = (this.bun2py.tail - this.bun2py.head + this.bun2py.capacity) % this.bun2py.capacity;
    const py2bunSize = (this.py2bun.tail - this.py2bun.head + this.py2bun.capacity) % this.py2bun.capacity;

    return {
      shmName: this.shmName,
      shmSize: this.shmSize,
      bun2py: {
        head: this.bun2py.head,
        tail: this.bun2py.tail,
        capacity: this.bun2py.capacity,
        used: bun2pySize,
        free: this.bun2py.capacity - bun2pySize - 1,
        usagePercent: ((bun2pySize / (this.bun2py.capacity - 1)) * 100).toFixed(1),
      },
      py2bun: {
        head: this.py2bun.head,
        tail: this.py2bun.tail,
        capacity: this.py2bun.capacity,
        used: py2bunSize,
        free: this.py2bun.capacity - py2bunSize - 1,
        usagePercent: ((py2bunSize / (this.py2bun.capacity - 1)) * 100).toFixed(1),
      },
    };
  }

  stop() {
    if (this.processHandle) this.processHandle.kill();
    if (this.sandboxPid) {
        try {
            // @ts-ignore
            process.kill(this.sandboxPid, "SIGKILL");
        } catch {}
    }
    if (this.server) this.server.stop();
    close(this.shmFd);
    shmUnlink(this.shmName);
    try { unlink(this.socketPath, () => {}); } catch {}
  }
}
