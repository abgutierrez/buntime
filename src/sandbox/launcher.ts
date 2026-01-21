import { dlopen, FFIType, ptr, CString } from "bun:ffi";

// From <linux/sched.h>
const CLONE_NEWNS = 0x00020000;    // New mount namespace
const CLONE_NEWUTS = 0x04000000;   // New UTS namespace
const CLONE_NEWIPC = 0x08000000;   // New IPC namespace
const CLONE_NEWUSER = 0x10000000;  // New user namespace
const CLONE_NEWPID = 0x20000000;   // New PID namespace
const CLONE_NEWNET = 0x40000000;   // New network namespace

// Try different libc locations to handle different architectures
const libcPaths = [
    "libc.so.6",           // Common on most systems
    "libc.so",              // Fallback
    "/lib/x86_64-linux-gnu/libc.so.6",  // Debian/Ubuntu x86_64
    "/lib/aarch64-linux-gnu/libc.so.6", // Debian/Ubuntu ARM64
];

let libc: ReturnType<typeof dlopen> | null = null;

 for (const libPath of libcPaths) {
    try {
        libc = dlopen(libPath, {
            unshare: {
                args: [FFIType.i32],
                returns: FFIType.i32,
            },
            mount: {
                args: [FFIType.cstring, FFIType.cstring, FFIType.cstring, FFIType.u64, FFIType.cstring],
                returns: FFIType.i32,
            },
            fork: {
                args: [],
                returns: FFIType.i32,
            },
            execvp: {
                args: [FFIType.cstring, FFIType.ptr],
                returns: FFIType.i32,
            },
            _exit: {
                args: [FFIType.i32],
                returns: FFIType.void,
            },
            waitpid: {
                args: [FFIType.i32, FFIType.ptr, FFIType.i32],
                returns: FFIType.i32,
            },
            strerror: {
                args: [FFIType.i32],
                returns: FFIType.cstring,
            }
        });
        break;
    } catch (e) {
        // Continue to next path
    }
}

if (!libc) {
    throw new Error("Failed to load libc library. Tried paths: " + libcPaths.join(", "));
}

export class SandboxLauncher {

    constructor() {
        if (process.platform !== "linux") {
            throw new Error("SandboxLauncher is only supported on Linux.");
        }
    }

    public spawnProcess(cmd: string[]) {
        if (!libc) throw new Error("libc not loaded");

        // 1. Unshare namespaces (User, Mount, PID, Net)
        // Note: CLONE_NEWNET will isolate network (no access unless configured)
        // Removed CLONE_NEWUSER to avoid Docker conflict for now
        const flags = CLONE_NEWNS | CLONE_NEWPID | CLONE_NEWNET;
        const res = libc.symbols.unshare(flags);
        if (res !== 0) {
             throw new Error(`unshare failed: ${res}`);
        }

        // 2. Fork
        const pid = libc.symbols.fork();
        if (pid < 0) {
            throw new Error("fork failed");
        }

        if (pid === 0) {
            // --- CHILD PROCESS ---
            
            // Prepare argv
            const buffers = cmd.map(s => Buffer.from(s + "\0"));
            const argv = new BigUint64Array(cmd.length + 1);
            buffers.forEach((b, i) => argv[i] = BigInt(ptr(b)));
            argv[cmd.length] = 0n;

            const cmdBuf = Buffer.from(cmd[0] + "\0");
            
            // Execute
            libc.symbols.execvp(ptr(cmdBuf), ptr(argv));
            
            // If we get here, exec failed
            libc.symbols._exit(127);
        }

        // --- PARENT PROCESS ---
        return pid;
    }

    public async createNamespaces() {
        // Legacy method, kept for reference but logic moved to spawnProcess
        console.log("[Launcher] Legacy createNamespaces called - usage is deprecated in favor of spawnProcess");
    }
    
    public async launch(pythonPath: string, scriptPath: string) {
        // This will be the main entry point
        await this.createNamespaces();
        
        // --- Future steps ---
        // 2. Set up root filesystem (mounts)
        // 3. Apply Landlock policy
        // 4. Apply seccomp policy
        // 5. Fork and exec the python process
        
        console.log("[Launcher] Sandbox setup complete (for now). Ready to launch process.");
    }
}
