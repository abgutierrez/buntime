import { describe, expect, test } from "bun:test";
import { ptr } from "bun:ffi";
import { SharedRingBuffer } from "../../ipc/ringbuffer";

const HEADER_SIZE = 64;

function createRing(size = 256) {
    const backing = new Uint8Array(size);
    const address = Number(ptr(backing));
    const ring = new SharedRingBuffer(address, size);
    ring.capacity = size - HEADER_SIZE;
    ring.head = 0;
    ring.tail = 0;
    return { ring, backing };
}

describe("SharedRingBuffer", () => {
    test("returns null when empty", () => {
        const { ring } = createRing();
        expect(ring.read()).toBeNull();
    });

    test("writes and reads payload", () => {
        const { ring } = createRing();
        const payload = new Uint8Array([1, 2, 3, 4]);
        const written = ring.write(payload);
        expect(written).toBe(payload.length);
        const read = ring.read();
        expect(read).not.toBeNull();
        expect(Array.from(read ?? [])).toEqual([1, 2, 3, 4]);
        expect(ring.read()).toBeNull();
    });

    test("returns 0 when full", () => {
        const { ring } = createRing(96);
        const payload = new Uint8Array(40);
        const written = ring.write(payload);
        expect(written).toBe(0);
    });

    test("handles wraparound", () => {
        const { ring } = createRing(256);
        ring.head = ring.capacity - 12;
        ring.tail = ring.capacity - 12;
        const payload = new Uint8Array(20).fill(7);
        const written = ring.write(payload);
        expect(written).toBe(payload.length);
        const read = ring.read();
        expect(read).not.toBeNull();
        expect(read?.length).toBe(payload.length);
        expect(read?.every((value) => value === 7)).toBe(true);
        expect(ring.read()).toBeNull();
    });
});
