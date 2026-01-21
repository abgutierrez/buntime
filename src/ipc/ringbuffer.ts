import { toArrayBuffer, type Pointer } from "bun:ffi";

export class SharedRingBuffer {
  private headerView: DataView;
  private dataView: Uint8Array;

  constructor(ptrAddr: number, size: number) {
    if (ptrAddr === 0) throw new Error("Invalid pointer");

    const buffer = toArrayBuffer(ptrAddr as unknown as Pointer, 0, size);
    this.headerView = new DataView(buffer, 0, 64);
    this.dataView = new Uint8Array(buffer, 64, size - 64);
  }

  get head(): number {
    return this.headerView.getUint32(0, true);
  }

  set head(val: number) {
    this.headerView.setUint32(0, val, true);
  }

  get tail(): number {
    return this.headerView.getUint32(4, true);
  }

  set tail(val: number) {
    this.headerView.setUint32(4, val, true);
  }

  get capacity(): number {
    return this.headerView.getUint32(8, true);
  }

  set capacity(val: number) {
    this.headerView.setUint32(8, val, true);
  }

  write(data: Uint8Array): number {
    const len = data.length;
    const cap = this.capacity;
    const tail = this.tail;
    const head = this.head;

    const totalLen = 4 + len;
    const size = (tail - head + cap) % cap;
    const available = cap - size - 1;

    if (totalLen > available) return 0;

    const lenBytes = new Uint8Array(4);
    new DataView(lenBytes.buffer).setUint32(0, len, true);

    this.writeRaw(lenBytes, tail, cap);
    this.writeRaw(data, (tail + 4) % cap, cap);

    this.tail = (tail + totalLen) % cap;
    return len;
  }

  read(): Uint8Array | null {
    const cap = this.capacity;
    const head = this.head;
    const tail = this.tail;

    if (head === tail) return null;

    const size = (tail - head + cap) % cap;
    if (size < 4) return null;

    const lenBytes = this.readRaw(4, head, cap);
    const msgLen = new DataView(lenBytes.buffer).getUint32(0, true);
    if (size < 4 + msgLen) return null;

    const payload = this.readRaw(msgLen, (head + 4) % cap, cap);
    this.head = (head + 4 + msgLen) % cap;
    return payload;
  }

  private writeRaw(bytes: Uint8Array, start: number, cap: number) {
    const firstChunk = Math.min(bytes.length, cap - start);
    this.dataView.set(bytes.subarray(0, firstChunk), start);
    if (firstChunk < bytes.length) {
      this.dataView.set(bytes.subarray(firstChunk), 0);
    }
  }

  private readRaw(length: number, start: number, cap: number): Uint8Array {
    const result = new Uint8Array(length);
    const firstChunk = Math.min(length, cap - start);
    result.set(this.dataView.subarray(start, start + firstChunk), 0);
    if (firstChunk < length) {
      result.set(this.dataView.subarray(0, length - firstChunk), firstChunk);
    }
    return result;
  }
}
