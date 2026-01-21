import socket
import sys
import struct
import time
import io
import traceback
import json
from multiprocessing import shared_memory
import os


class SharedRingBuffer:
    def __init__(self, shm_buf, offset, size):
        self.buf = shm_buf
        self.offset = offset
        self.total_size = size
        self.header_size = 64
        self.capacity_offset = 8

    def _read_header(self):
        base = self.offset
        head = struct.unpack_from("<I", self.buf, base)[0]
        tail = struct.unpack_from("<I", self.buf, base + 4)[0]
        capacity = struct.unpack_from("<I", self.buf, base + 8)[0]
        return head, tail, capacity

    def _write_head(self, val):
        struct.pack_into("<I", self.buf, self.offset, val)

    def _write_tail(self, val):
        struct.pack_into("<I", self.buf, self.offset + 4, val)

    def _write_capacity(self, val):
        struct.pack_into("<I", self.buf, self.offset + 8, val)

    def write(self, data):
        data_len = len(data)
        head, tail, cap = self._read_header()

        size = (tail - head + cap) % cap
        available = cap - size - 1

        if available < 4 + data_len:
            return 0

        len_bytes = struct.pack("<I", data_len)
        self._write_raw(len_bytes, tail, cap)
        tail = (tail + 4) % cap

        self._write_raw(data, tail, cap)
        tail = (tail + data_len) % cap

        self._write_tail(tail)
        return data_len

    def _write_raw(self, bytes_data, start_offset, cap):
        data_offset = self.offset + self.header_size
        bytes_len = len(bytes_data)

        first_chunk = min(bytes_len, cap - start_offset)
        self.buf[
            data_offset + start_offset : data_offset + start_offset + first_chunk
        ] = bytes_data[:first_chunk]

        if first_chunk < bytes_len:
            remaining = bytes_len - first_chunk
            self.buf[data_offset : data_offset + remaining] = bytes_data[first_chunk:]

    def read(self):
        head, tail, cap = self._read_header()

        if head == tail:
            return None

        size = (tail - head + cap) % cap
        if size < 4:
            return None

        len_bytes = self._read_raw(4, head, cap)
        msg_len = struct.unpack("<I", len_bytes)[0]

        if size < 4 + msg_len:
            return None

        head = (head + 4) % cap

        payload = self._read_raw(msg_len, head, cap)

        head = (head + msg_len) % cap
        self._write_head(head)

        return payload

    def _read_raw(self, length, start_offset, cap):
        data_offset = self.offset + self.header_size
        first_chunk = min(length, cap - start_offset)

        chunk1 = self.buf[
            data_offset + start_offset : data_offset + start_offset + first_chunk
        ]
        result = bytes(chunk1)

        if first_chunk < length:
            remaining = length - first_chunk
            chunk2 = self.buf[data_offset : data_offset + remaining]
            result += bytes(chunk2)

        return result


class ShmOut:
    def __init__(self, ring_buffer, sock):
        self.rb = ring_buffer
        self.sock = sock

    def write(self, text):
        if not text:
            return 0
        data = text.encode("utf-8")
        total_written = 0
        while total_written < len(data):
            chunk = data[total_written:]
            n = self.rb.write(chunk)
            if n > 0:
                total_written += n
                try:
                    self.sock.sendall(b"DATA\n")
                except BrokenPipeError:
                    break
            else:
                time.sleep(0.001)
        return total_written

    def flush(self):
        pass


def send_state(sock, event, data=None):
    state = {"type": "state", "event": event}
    if data is not None:
        state["data"] = data
    state_json = json.dumps(state)
    sock.sendall(state_json.encode("utf-8") + b"\n")


def main():
    if len(sys.argv) < 4:
        print("Usage: python3 worker.py <socket_path> <shm_name> <shm_size>")
        return

    socket_path = sys.argv[1]
    shm_name = sys.argv[2]
    shm_size = int(sys.argv[3])

    print(f"[Python] Connecting to {socket_path}...")

    shm = None
    names_to_try = [
        shm_name,
        "/" + shm_name if not shm_name.startswith("/") else shm_name,
        shm_name.lstrip("/"),
    ]

    for name in set(names_to_try):  # Use set to remove duplicates
        try:
            shm = shared_memory.SharedMemory(name=name)
            print(f"[Python] Connected to SHM: {name}")
            break
        except FileNotFoundError:
            pass

    if shm is None:
        print(f"[Python] SHM not found. Tried: {names_to_try}")
        return

    ring_size = shm_size // 2
    bun2py = SharedRingBuffer(shm.buf, 0, ring_size)
    py2bun = SharedRingBuffer(shm.buf, ring_size, ring_size)

    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)

    connected = False
    for i in range(10):
        try:
            sock.connect(socket_path)
            connected = True
            break
        except FileNotFoundError:
            time.sleep(0.1)

    if not connected:
        print(f"[Python] Could not connect to {socket_path}")
        print(f"[Python] /tmp content: {os.listdir('/tmp')}")
        return

    sock.sendall(b"READY\n")

    print("[Python] Worker Loop Started")

    global_context = {}
    try:
        while True:
            msg = bun2py.read()
            if msg is None:
                time.sleep(0.001)
                continue

            code_str = bytes(msg).decode("utf-8")
            send_state(sock, "code_received", {"code_length": len(code_str)})

            output_capture = ShmOut(py2bun, sock)
            original_stdout = sys.stdout
            sys.stdout = output_capture

            try:
                send_state(sock, "exec_start")
                try:
                    result = None
                    try:
                        result = eval(code_str, global_context)
                        if result is not None:
                            print(result)
                    except SyntaxError:
                        exec(code_str, global_context)
                    send_state(sock, "exec_end", {"success": True})
                except KeyboardInterrupt:
                    send_state(sock, "interrupted")
                    print("\n[Execution Interrupted]")
            except Exception as e:
                exc_type, exc_value, exc_traceback = sys.exc_info()
                error_msg = f"{exc_type.__name__}: {exc_value}"
                send_state(sock, "exception", {"error": error_msg})
                lines = traceback.format_exception(exc_type, exc_value, exc_traceback)
                print("".join(lines))
            finally:
                sys.stdout = original_stdout
    except KeyboardInterrupt:
        pass
    finally:
        del bun2py
        del py2bun
        sock.close()
        shm.close()


if __name__ == "__main__":
    main()
