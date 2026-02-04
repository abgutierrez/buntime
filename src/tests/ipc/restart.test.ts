import { describe, expect, test, mock } from "bun:test";
import { type SandboxConfig } from "../../config";

class FakeSharedRingBuffer {
    head = 0;
    tail = 0;
    capacity = 1024;
    private queue: Uint8Array[] = [];
    constructor() {}
    write(data: Uint8Array) {
        this.queue.push(data);
        return data.length;
    }
    read() {
        return this.queue.shift() || null;
    }
}

mock.module("../../ipc/ffi", () => ({
    shmOpen: () => 1,
    shmUnlink: () => 0,
    mmap: () => 1024,
    munmap: () => 0,
    close: () => 0,
}));

mock.module("../../ipc/ringbuffer", () => ({
    SharedRingBuffer: FakeSharedRingBuffer,
}));

mock.module("../../proxy", () => ({
    NetworkProxy: class {
        start() {}
        stop() {}
    },
}));

const { IPCServer } = await import("../../ipc/server");
const { Supervisor } = await import("../../supervisor/supervisor");

const baseConfig: SandboxConfig = {
    security: { mode: "strict" },
    network: {
        enabled: false,
        policy: "allow_list",
        allow_list: [],
        deny_list: [],
        rate_limit: 5,
    },
    filesystem: { allow_write: false },
    resources: {
        memory_limit: 64,
        cpu_limit: 50,
    },
};

async function simulateWorkerReady(supervisor: any) {
    const socketPath = supervisor.ipcServer?.socketPath;
    if (!socketPath) return;
    const client = await Bun.connect({
        unix: socketPath,
        socket: { data() {} },
    });
    client.write("READY\n");
    client.end();
}

describe("Worker Restart & Lifecycle", () => {
    test("IPCServer tracks lifecycle state", () => {
        const server = new IPCServer("/test-state", 1024);
        expect(server.getState()).toBe("idle");
        server.stop();
        expect(server.getState()).toBe("stopped");
    });

    test("IPCServer.getState() returns killReason", () => {
        const server = new IPCServer("/test-kill", 1024);
        server.kill("policy-violation");
        expect(server.getState()).toBe("killed");
        expect(server.getKillReason()).toBe("policy-violation");
    });

    test("Supervisor.restartWorker() manages IPCServer lifecycle", async () => {
        const supervisor = new Supervisor({ sandboxEnabled: false, workerType: "bun" });
        
        const startPromise = supervisor.start(baseConfig);
        await new Promise(resolve => setTimeout(resolve, 50));
        await simulateWorkerReady(supervisor);
        await startPromise;
        
        const oldIpc = (supervisor as any).ipcServer;
        expect(oldIpc).toBeDefined();

        const restartPromise = (supervisor as any).restartWorker();
        await new Promise(resolve => setTimeout(resolve, 50));
        await simulateWorkerReady(supervisor);
        await restartPromise;
        
        const newIpc = (supervisor as any).ipcServer;
        expect(newIpc).toBeDefined();
        expect(newIpc).not.toBe(oldIpc);
        
        supervisor.stop();
    });

    test("Supervisor.restartWorker() emits lifecycle events", async () => {
        const supervisor = new Supervisor({ sandboxEnabled: false, workerType: "bun" });
        const events: Array<{type: string; data?: any}> = [];
        supervisor.onEvent((ev) => events.push(ev));
        
        const startPromise = supervisor.start(baseConfig);
        await new Promise(resolve => setTimeout(resolve, 50));
        await simulateWorkerReady(supervisor);
        await startPromise;
        events.length = 0;

        const restartPromise = (supervisor as any).restartWorker();
        await new Promise(resolve => setTimeout(resolve, 50));
        await simulateWorkerReady(supervisor);
        await restartPromise;
        
        const stateEvents = events.filter(e => e.type === "state");
        expect(stateEvents.some(e => e.data?.worker === "restarting")).toBe(true);
        expect(stateEvents.some(e => e.data?.signal === "RESTARTED")).toBe(true);
        
        supervisor.stop();
    });

    test("Supervisor.sendCode() rejects during restart", async () => {
        const supervisor = new Supervisor({ sandboxEnabled: false, workerType: "bun" });
        
        const startPromise = supervisor.start(baseConfig);
        await new Promise(resolve => setTimeout(resolve, 50));
        await simulateWorkerReady(supervisor);
        await startPromise;
        
        const restartPromise = (supervisor as any).restartWorker();
        
        const result = supervisor.sendCode("print(1)");
        expect(result).toBe(false);
        
        await new Promise(resolve => setTimeout(resolve, 50));
        await simulateWorkerReady(supervisor);
        await restartPromise;
        supervisor.stop();
    });

    test("Supervisor auto-restarts on policy-violation kill", async () => {
        const supervisor = new Supervisor({ sandboxEnabled: false, workerType: "bun" });
        let restartCalled = false;
        
        const originalRestart = (supervisor as any).restartWorker.bind(supervisor);
        (supervisor as any).restartWorker = async function() {
            restartCalled = true;
            return originalRestart();
        };

        const startPromise = supervisor.start(baseConfig);
        await new Promise(resolve => setTimeout(resolve, 50));
        await simulateWorkerReady(supervisor);
        await startPromise;
        
        const ipc = (supervisor as any).ipcServer;
        ipc.kill("policy-violation");
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        expect(restartCalled).toBe(true);
        supervisor.stop();
    });
});
