import { shmOpen, shmUnlink, mmap, close } from "./ffi";
import { SharedRingBuffer } from "./ringbuffer";
import { unlink } from "node:fs";
import { NetworkProxy } from "../proxy";
import { type SandboxConfig } from "../config";
import { join } from "path";
import { MsgType, ResponseType } from "./protocol";

export type CheckCallback = (type: MsgType, payload: Uint8Array) => { allowed: boolean };

export class IPCServer {
  private shmFd: number;
  private shmPtr: number;
  private shmSize: number;
  private shmName: string;
  
  public py2bun: SharedRingBuffer;
  public bun2py: SharedRingBuffer;
  
  private socketPath: string;
  private server: any;
  private proxy: NetworkProxy | null = null;
  private processHandle: ReturnType<typeof Bun.spawn> | undefined;
  private sandboxPid: number | undefined; // Store PID for manual management
  private onMessage?: (data: Uint8Array) => void;
  private onCheck?: CheckCallback;
  private onStateChange?: (state: string, signal?: string, data?: any) => void;
  private sendState?: (state: string, signal?: string, data?: any) => void;
  
  constructor(
    shmName: string, 
    size: number = 1024 * 1024, 
    onMessage?: (data: Uint8Array) => void,
    onCheck?: CheckCallback
  ) {
    this.shmName = shmName;
    this.shmSize = size;
    this.onMessage = onMessage;
    this.onCheck = onCheck;
    
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

    const socketName = `bun-${Math.random().toString(36).slice(2)}.sock`;
    const socketDir = process.env.IPC_SOCKET_DIR ?? process.cwd();
    let socketPath = join(socketDir, socketName);
    if (socketPath.length >= 100) {
      const fallbackDir = process.env.IPC_SOCKET_FALLBACK_DIR ?? "/tmp";
      const fallbackPath = join(fallbackDir, socketName);
      console.warn(`[Bun] Socket path too long (${socketPath.length}), using ${fallbackPath}`);
      socketPath = fallbackPath;
    }
    this.socketPath = socketPath;
  }
  
  async start(
    command: string[],
    config: SandboxConfig,
    options: { env?: Record<string, string>; sandboxEnabled?: boolean } = {},
  ) {
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
            } else if (msg.trim() === "DATA" || msg.trim() === "CHECK") {
               that.handleData();
            } else {
               try {
                   const payload = JSON.parse(msg);
                    if (payload.type === "state" && that.onStateChange) {
                        that.onStateChange(payload.event, "WORKER_EVENT", payload);
                    }
               } catch {
                   // Ignore non-JSON worker messages.
               }
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

    const args = [...command, this.socketPath, this.shmName, this.shmSize.toString()];
    
    // Prepare environment variables for the sandbox
    const env: Record<string, string> = {
        ...process.env,
        "PYTHONUNBUFFERED": "1",
        ...(options.env ?? {}),
    };

    // Filter WORKER_ environment variables
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith("WORKER_") && value !== undefined) {
        const newKey = key.slice(7);
        env[newKey] = value;
      }
    }

    let proxyEnabled = false;
    const allowAllNetwork =
        config.network.policy === "allow_list" &&
        config.network.allow_list.includes("*") &&
        (config.network.deny_list ?? []).length === 0;
    if (config.network.enabled && !allowAllNetwork) {
        try {
            // Start Proxy
            this.proxy = new NetworkProxy(config, 8080);
            this.proxy.start();
            proxyEnabled = true;
            console.log("[Bun] Network Proxy started on port 8080");
        } catch (error: any) {
            console.warn(`[Bun] Network Proxy failed to start: ${error?.message ?? error}`);
        }
        if (proxyEnabled) {
            // Configure Proxy Environment Variables
            env["HTTP_PROXY"] = "http://169.254.1.1:8080";
            env["HTTPS_PROXY"] = "http://169.254.1.1:8080";
            env["http_proxy"] = "http://169.254.1.1:8080";
            env["https_proxy"] = "http://169.254.1.1:8080";
            // Also set NO_PROXY for localhost/127.0.0.1 just in case, though we have no localhost in sandbox
            env["NO_PROXY"] = "localhost,127.0.0.1";
        }
    } else if (config.network.enabled && allowAllNetwork) {
        console.log("[Bun] Network proxy skipped (allow-all)");
    }

    const sandboxEnabled = options.sandboxEnabled ?? true;

    if (process.platform === "linux" && sandboxEnabled) {
        try {
            console.log("[Bun] Using SandboxLauncher (Linux detected)");
            const { SandboxLauncher } = await import("../sandbox/launcher");
            const launcher = new SandboxLauncher();
            this.sandboxPid = launcher.spawnProcess(args, env);
            console.log(`[Bun] Sandbox Spawned Python PID ${this.sandboxPid}`);

            if (config.network.enabled && this.sandboxPid > 0) {
                 await this.setupNetwork(this.sandboxPid);
            }

        } catch (e: any) {
            console.warn(`[Bun] Sandbox failed (${e.message}), falling back to Bun.spawn`);
            this.processHandle = Bun.spawn(args, {
                stdin: "inherit",
                stdout: "inherit",
                stderr: "inherit",
                env,
            });
            console.log(`[Bun] Spawned Python PID ${this.processHandle.pid}`);
        }
    } else {
        this.processHandle = Bun.spawn(args, {
            stdin: "inherit",
            stdout: "inherit",
            stderr: "inherit",
            env,
        });
        console.log(`[Bun] Spawned Python PID ${this.processHandle.pid}`);
    }
  }

  private async setupNetwork(pid: number) {
      // Create veth pair
      // ip link add veth-bun type veth peer name veth-sb
      await Bun.spawn(["ip", "link", "add", "veth-bun", "type", "veth", "peer", "name", "veth-sb"]).exited;
      
      // Move veth-sb to sandbox namespace
      // ip link set veth-sb netns PID
      await Bun.spawn(["ip", "link", "set", "veth-sb", "netns", pid.toString()]).exited;
      
      // Configure host side
      // ip addr add 169.254.1.1/30 dev veth-bun
      await Bun.spawn(["ip", "addr", "add", "169.254.1.1/30", "dev", "veth-bun"]).exited;
      
      // ip link set veth-bun up
      await Bun.spawn(["ip", "link", "set", "veth-bun", "up"]).exited;
      
      // Configure sandbox side using nsenter
      // nsenter -t PID -n ip addr add 169.254.1.2/30 dev veth-sb
      await Bun.spawn(["nsenter", "-t", pid.toString(), "-n", "ip", "addr", "add", "169.254.1.2/30", "dev", "veth-sb"]).exited;
      
      // nsenter -t PID -n ip link set veth-sb up
      await Bun.spawn(["nsenter", "-t", pid.toString(), "-n", "ip", "link", "set", "veth-sb", "up"]).exited;
      
      // nsenter -t PID -n ip link set lo up
      await Bun.spawn(["nsenter", "-t", pid.toString(), "-n", "ip", "link", "set", "lo", "up"]).exited;
      
      // Add default route inside sandbox
      // nsenter -t PID -n ip route add default via 169.254.1.1
      await Bun.spawn(["nsenter", "-t", pid.toString(), "-n", "ip", "route", "add", "default", "via", "169.254.1.1"]).exited;
      
      console.log(`[Bun] Network Configured for PID ${pid}`);
  }
  
  handleData() {
    while (true) {
        const msg = this.py2bun.read();
        if (!msg) break;

        if (msg.length >= 5) {
            const type = msg[0] as MsgType;
            if (type === MsgType.STDOUT) {
                if (this.onMessage) {
                    this.onMessage(msg.subarray(5));
                }
                continue;
            }

            const reqId = new DataView(msg.buffer, msg.byteOffset, msg.byteLength).getUint32(1, true);
            const payload = msg.subarray(5);

            if (this.onCheck) {
                const result = this.onCheck(type, payload);
                if (!result.allowed) {
                    if (type === MsgType.FS_READ || type === MsgType.LISTDIR) {
                         console.error(`[Bun] Optimistic Violation (Type ${type})! Killing worker.`);
                         this.stop();
                         return;
                    }
                    this.sendResponse(reqId, ResponseType.DENY);
                } else {
                    if (type !== MsgType.FS_READ && type !== MsgType.LISTDIR) {
                        this.sendResponse(reqId, ResponseType.ALLOW);
                    }
                }
            }
            continue;
        }
        
        if (this.onMessage) {
            this.onMessage(msg);
        }
    }
  }

  sendResponse(reqId: number, type: ResponseType) {
    const buf = new Uint8Array(5);
    const view = new DataView(buf.buffer);
    view.setUint8(0, type);
    view.setUint32(1, reqId, true);
    this.send(buf);
  }

  sendOp(type: MsgType, payload: Uint8Array) {
    const buf = new Uint8Array(5 + payload.length);
    const view = new DataView(buf.buffer);
    view.setUint8(0, type);
    view.setUint32(1, 0, true);
    buf.set(payload, 5);
    return this.send(buf);
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

  setOnStateChange(callback: (state: string, signal?: string, data?: any) => void) {
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
            process.kill(this.sandboxPid, "SIGKILL");
        } catch {}
    }
    if (this.proxy) {
        this.proxy.stop();
        this.proxy = null;
    }
    if (this.server) this.server.stop();
    close(this.shmFd);
    shmUnlink(this.shmName);
    try { unlink(this.socketPath, () => {}); } catch {}
  }
}
