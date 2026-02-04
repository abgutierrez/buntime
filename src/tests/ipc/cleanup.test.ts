import { describe, expect, test, mock } from "bun:test";

class FakeSharedRingBuffer {
    head = 0;
    tail = 0;
    capacity = 1024;
    constructor() {}
    write() { return 0; }
    read() { return null; }
}

const ffiMocks = {
    shmOpen: mock(() => 1),
    shmUnlink: mock(() => 0),
    mmap: mock(() => 1024),
    munmap: mock(() => 0),
    close: mock(() => 0),
};

mock.module("../../ipc/ffi", () => ffiMocks);

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

describe("IPCServer Cleanup", () => {
    test("stop() calls munmap before close", () => {
        const server = new IPCServer("/test-cleanup", 1024);
        
        ffiMocks.munmap.mockClear();
        ffiMocks.close.mockClear();
        
        server.stop();
        
        expect(ffiMocks.munmap).toHaveBeenCalled();
        expect(ffiMocks.close).toHaveBeenCalled();
    });
});
