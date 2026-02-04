import { describe, expect, test, mock } from "bun:test";
import { type SandboxConfig } from "../../config";

class FakeSharedRingBuffer {
    static nextWriteResult: number | null = null;
    head = 0;
    tail = 0;
    capacity = 128;
    private queue: Uint8Array[] = [];

    constructor(ptrAddr: number, size: number) {
        void ptrAddr;
        void size;
    }

    write(data: Uint8Array): number {
        if (FakeSharedRingBuffer.nextWriteResult !== null) {
            const result = FakeSharedRingBuffer.nextWriteResult;
            FakeSharedRingBuffer.nextWriteResult = null;
            return result;
        }
        const totalLen = data.length + 4;
        const used = (this.tail - this.head + this.capacity) % this.capacity;
        const available = this.capacity - used - 1;
        if (totalLen > available) return 0;
        this.queue.push(data);
        this.tail = (this.tail + totalLen) % this.capacity;
        return data.length;
    }

    read(): Uint8Array | null {
        const next = this.queue.shift();
        if (!next) return null;
        this.head = (this.head + next.length + 4) % this.capacity;
        return next;
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

function waitFor(predicate: () => boolean, timeoutMs = 1500): Promise<void> {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
            if (predicate()) {
                resolve();
                return;
            }
            if (Date.now() - start > timeoutMs) {
                reject(new Error("Timed out waiting for condition"));
                return;
            }
            setTimeout(tick, 10);
        };
        tick();
    });
}

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

describe("IPCServer", () => {
    test("handleData drains ring buffer and emits messages", () => {
        const messages: Uint8Array[] = [];
        const server = new IPCServer("/ipc-test", 1024, (data) => messages.push(data));

        server.py2bun.write(new Uint8Array([1]));
        server.py2bun.write(new Uint8Array([2, 3]));
        server.handleData();

        expect(messages.map((msg) => Array.from(msg))).toEqual([[1], [2, 3]]);
        server.stop();
    });

    test("send returns false when ring buffer is full", () => {
        const server = new IPCServer("/ipc-test", 1024);
        FakeSharedRingBuffer.nextWriteResult = 0;
        const result = server.send(new Uint8Array([1, 2]));
        expect(result).toBe(false);
        server.stop();
    });

    test("start wires READY/DATA and worker state events", async () => {
        const events: Array<{ state: string; signal?: string }> = [];
        const messages: Uint8Array[] = [];
        const server = new IPCServer("/ipc-test", 1024, (data) => messages.push(data));
        server.setOnStateChange((state, signal) => events.push({ state, signal }));

        try {
            await server.start(["/usr/bin/true"], baseConfig, { sandboxEnabled: false });
            server.py2bun.write(new Uint8Array([9]));

            const socketPath = (server as unknown as { socketPath: string }).socketPath;
            const clientSocket = await Bun.connect({
                unix: socketPath,
                socket: {
                    data() {},
                },
            });

            clientSocket.write("READY\n");
            clientSocket.write("DATA\n");
            clientSocket.write('{"type":"state","event":"Started"}\n');
            clientSocket.end();

            await waitFor(() => events.length >= 4);
            await waitFor(() => messages.length >= 1);

            expect(events).toEqual([
                { state: "Python Connected", signal: "READY" },
                { state: "Ready", signal: "READY" },
                { state: "Started", signal: "WORKER_EVENT" },
                { state: "Disconnected", signal: "CLOSE" },
            ]);
            expect(messages.map((msg) => Array.from(msg))).toEqual([[9]]);
        } finally {
            server.stop();
        }
    });
});
