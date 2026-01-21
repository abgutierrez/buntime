import { dlopen, FFIType, ptr, CString } from "bun:ffi";

// From <linux/sched.h>
const CLONE_NEWNS = 0x00020000;    // New mount namespace
const CLONE_NEWUTS = 0x04000000;   // New UTS namespace
const CLONE_NEWIPC = 0x08000000;   // New IPC namespace
const CLONE_NEWUSER = 0x10000000;  // New user namespace
const CLONE_NEWPID = 0x20000000;   // New PID namespace
const CLONE_NEWNET = 0x40000000;   // New network namespace

// From <sys/mount.h>
const MS_BIND = 4096;
const MS_REC = 16384;
const MS_PRIVATE = 262144;
const MS_RDONLY = 1;

// From <sys/prctl.h>
const PR_SET_PDEATHSIG = 1;

// Signals
const SIGKILL = 9;

// Try different libc locations to handle different architectures
const libcPaths = [
    "libc.so.6",           // Common on most systems
    "libc.so",              // Fallback
    "/lib/x86_64-linux-gnu/libc.so.6",  // Debian/Ubuntu x86_64
    "/lib/aarch64-linux-gnu/libc.so.6", // Debian/Ubuntu ARM64
];

let libc: any = null;

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
            umount2: {
                args: [FFIType.cstring, FFIType.i32],
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
            prctl: {
                args: [FFIType.i32, FFIType.u64, FFIType.u64, FFIType.u64, FFIType.u64],
                returns: FFIType.i32,
            },
            chroot: {
                args: [FFIType.cstring],
                returns: FFIType.i32,
            },
            chdir: {
                args: [FFIType.cstring],
                returns: FFIType.i32,
            },
            mkdir: {
                args: [FFIType.cstring, FFIType.i32],
                returns: FFIType.i32,
            },
            setenv: {
                args: [FFIType.cstring, FFIType.cstring, FFIType.i32],
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

    public spawnProcess(cmd: string[], env: Record<string, string> = {}): number {
        if (!libc) throw new Error("libc not loaded");

        // Step 1: Fork the first time (Child 1)
        // This isolates the unshare calls from the Bun process
        const pid1 = libc.symbols.fork();
        
        if (pid1 < 0) throw new Error("fork failed");

        if (pid1 > 0) {
            // Parent (Bun) returns the PID of Child 1
            // Child 1 will act as the supervisor for the sandbox
            return pid1;
        }

        // --- CHILD 1: SANDBOX SUPERVISOR ---
        
        // 1. Unshare namespaces
        // We create new namespaces for Mount, IPC, PID, Net, UTS
        // CLONE_NEWNET ensures NO network interfaces exist (except lo, which is down)
        // CLONE_NEWPID means the next fork will be PID 1 in the new namespace
        const flags = CLONE_NEWNS | CLONE_NEWIPC | CLONE_NEWPID | CLONE_NEWNET | CLONE_NEWUTS;
        const res = libc.symbols.unshare(flags);
        if (res !== 0) {
             // We can't easily log to JS console here as we are in a forked process sharing stdout
             // But stdout is inherited, so console.error might work or mix
             const err = `[Sandbox] unshare failed: ${res} (Hint: Docker requires --privileged or --cap-add=SYS_ADMIN)\n`;
             process.stdout.write(err);
             libc.symbols._exit(1);
        }

        // 2. Prepare Mounts (Private Mount Namespace)
        // We need to mark the root propagation as private so our mounts don't leak
        const mountRes = libc.symbols.mount(
            Buffer.from("none\0"), 
            Buffer.from("/\0"), 
            Buffer.from("0\0"), 
            BigInt(MS_REC | MS_PRIVATE), 
            Buffer.from("\0")
        );
        
        if (mountRes !== 0) {
             process.stdout.write("[Sandbox] Failed to make root private\n");
             libc.symbols._exit(1);
        }

        // 3. Fork again (Child 2)
        // This process will be PID 1 in the new PID namespace
        const pid2 = libc.symbols.fork();

        if (pid2 < 0) {
            process.stdout.write("[Sandbox] fork #2 failed\n");
            libc.symbols._exit(1);
        }

        if (pid2 > 0) {
            // --- CHILD 1 CONTINUES ---
            // Wait for Child 2 to finish
            const statusPtr = new Int32Array(1); // dummy buffer
            libc.symbols.waitpid(pid2, ptr(statusPtr), 0);
            
            // When Child 2 exits, Child 1 exits
            libc.symbols._exit(0);
        }

        // --- CHILD 2: THE ACTUAL SANDBOXED PROCESS ---
        
        // Safety: Die if parent (Child 1) dies
        libc.symbols.prctl(PR_SET_PDEATHSIG, BigInt(SIGKILL), 0n, 0n, 0n);

        // --- PHASE C: FILESYSTEM ISOLATION ---
        this.setupFilesystem();

        // Apply Environment Variables
        for (const [key, value] of Object.entries(env)) {
            const k = Buffer.from(key + "\0");
            const v = Buffer.from(value + "\0");
            libc.symbols.setenv(ptr(k), ptr(v), 1);
        }

        // Prepare argv for execvp
        const buffers = cmd.map(s => Buffer.from(s + "\0"));
        const argv = new BigUint64Array(cmd.length + 1);
        buffers.forEach((b, i) => argv[i] = BigInt(ptr(b)));
        argv[cmd.length] = 0n;

        const cmdBuf = Buffer.from(cmd[0] + "\0");
        
        // Execute Python
        libc.symbols.execvp(ptr(cmdBuf), ptr(argv));
        
        // If we get here, exec failed
        process.stdout.write("[Sandbox] execvp failed\n");
        libc.symbols._exit(127);
        
        return 0; // Unreachable
    }

    private setupFilesystem() {
        // For Phase C, we will create a minimal root filesystem in /tmp
        // and chroot into it.
        
        const newRoot = "/tmp/sandbox_" + Math.random().toString(36).slice(2);
        
        // mkdir -p newRoot
        if (libc.symbols.mkdir(Buffer.from(newRoot + "\0"), 0o755) !== 0) {
            // process.stdout.write(`[Sandbox] Failed to mkdir ${newRoot}\n`);
            // Ignore error if exists (rudimentary)
        }

        // Helper for bind mounts
        const bindMount = (src: string, dest: string, readOnly: boolean = true) => {
            const destPath = `${newRoot}${dest}`;
            
            // Ensure dest exists (simple/dumb recursive mkdir emulation needed or just assume parents exist)
            // For now, assuming top-level dirs like /lib, /usr exist or we create them
            // We'll just try to create the leaf directory
            libc.symbols.mkdir(Buffer.from(destPath + "\0"), 0o755);

            const flags = BigInt(MS_BIND | MS_REC | (readOnly ? MS_RDONLY : 0));
            const res = libc.symbols.mount(
                Buffer.from(src + "\0"),
                Buffer.from(destPath + "\0"),
                Buffer.from("none\0"),
                flags,
                Buffer.from("\0")
            );
            if (res !== 0) {
                // process.stdout.write(`[Sandbox] Failed to bind mount ${src} -> ${destPath}\n`);
            }
        };

        // Create essential structure
        const dirs = ["/lib", "/lib64", "/usr", "/bin", "/etc", "/tmp", "/proc", "/sys", "/dev"];
        for (const d of dirs) {
            libc.symbols.mkdir(Buffer.from(newRoot + d + "\0"), 0o755);
        }

        // Mount essential paths (Read-Only)
        bindMount("/lib", "/lib");
        bindMount("/lib64", "/lib64");
        bindMount("/usr", "/usr");
        bindMount("/bin", "/bin");
        bindMount("/etc", "/etc"); // Needed for python DNS/SSL/User
        
        // Dev is needed for /dev/null, /dev/random, etc.
        bindMount("/dev", "/dev", false); // Often needs to be RW? Or use specific devices.
        // For safety, we should strictly mount only null/random/urandom/zero.
        // But for now, bind mounting host /dev is easiest to get Python running.

        // Mount /tmp (RW)
        bindMount("/tmp", "/tmp", false);

        // Mount current working directory (project root) so python can find the script
        const cwd = process.cwd();
        // We need to mount the CWD to the SAME path inside chroot so relative paths work?
        // Or we just mount it to /app
        libc.symbols.mkdir(Buffer.from(newRoot + cwd + "\0"), 0o755); // Try to recreate path
        // Simple hack: Re-create the deep path? 
        // For now, let's just mount the CWD to `newRoot + cwd`
        // We need to create the directory hierarchy... that's annoying in C/FFI without a helper.
        // Let's assume the script is in `src`. 
        
        // BETTER APPROACH:
        // Mount the entire project root.
        bindMount(cwd, cwd, false); // Allow RW for now for IPC socket/shm
        
        // Pivot Root (or Chroot)
        const chrootRes = libc.symbols.chroot(Buffer.from(newRoot + "\0"));
        if (chrootRes !== 0) {
             process.stdout.write(`[Sandbox] chroot failed\n`);
             libc.symbols._exit(1);
        }

        const chdirRes = libc.symbols.chdir(Buffer.from("/\0"));
        if (chdirRes !== 0) {
             process.stdout.write(`[Sandbox] chdir failed\n`);
             libc.symbols._exit(1);
        }
    }
}
