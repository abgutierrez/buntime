import socket
import sys
import struct
import time
import io
import traceback
import json
import builtins
import subprocess
import ipaddress
import os
from multiprocessing import shared_memory
from typing import Any
from contextlib import contextmanager

# Protocol Constants
MSG_TYPE_STDOUT = 0x00
MSG_TYPE_FS_READ = 0x01
MSG_TYPE_FS_WRITE = 0x02
MSG_TYPE_NET_CONNECT = 0x03
MSG_TYPE_EXEC = 0x04
MSG_TYPE_LISTDIR = 0x05
MSG_TYPE_CODE = 0x20

RESP_ALLOW = 0x10
RESP_DENY = 0x11


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


class PolicyClient:
    def __init__(self, bun2py, py2bun, sock):
        self.bun2py = bun2py
        self.py2bun = py2bun
        self.sock = sock
        self.req_id = 1

    def _next_id(self):
        self.req_id = (self.req_id + 1) & 0xFFFFFFFF
        return self.req_id

    def send_optimistic(self, type_code, payload_bytes):
        req_id = self._next_id()
        # [Type: 1][ReqID: 4][Payload: N]
        header = struct.pack("<BI", type_code, req_id)
        msg = header + payload_bytes

        while True:
            n = self.py2bun.write(msg)
            if n > 0:
                break
            time.sleep(0.001)

        try:
            self.sock.sendall(b"CHECK\n")
        except BrokenPipeError:
            pass

    def send_sync(self, type_code, payload_bytes):
        req_id = self._next_id()
        header = struct.pack("<BI", type_code, req_id)
        msg = header + payload_bytes

        while True:
            n = self.py2bun.write(msg)
            if n > 0:
                break
            time.sleep(0.001)

        try:
            self.sock.sendall(b"CHECK\n")
        except BrokenPipeError:
            return False  # Socket dead

        # Block waiting for response
        start_time = time.time()
        while True:
            resp = self.bun2py.read()
            if resp is None:
                if time.time() - start_time > 5.0:
                    # Timeout
                    return False
                time.sleep(0.001)
                continue

            # [Type: 1][ReqID: 4]
            if len(resp) < 5:
                continue

            r_type = resp[0]
            r_req_id = struct.unpack_from("<I", resp, 1)[0]

            if r_req_id == req_id:
                if r_type == RESP_ALLOW:
                    return True
                return False
            else:
                # Unexpected message (maybe CODE?), ignore or requeue?
                # In sync mode, we shouldn't receive CODE.
                pass


class ShmOut:
    def __init__(self, ring_buffer, sock):
        self.rb = ring_buffer
        self.sock = sock

    def write(self, text):
        if not text:
            return 0
        data = text.encode("utf-8")

        # [Type: 1][ReqID: 4][Data]
        # STDOUT type = 0x00, ReqID = 0 (ignored)
        header = struct.pack("<BI", MSG_TYPE_STDOUT, 0)
        full_msg = header + data

        total_written = 0
        while True:
            n = self.rb.write(full_msg)
            if n > 0:
                try:
                    self.sock.sendall(b"DATA\n")
                except BrokenPipeError:
                    break
                return len(data)  # Pretend we wrote the text length
            else:
                time.sleep(0.001)

    def flush(self):
        pass


ORIGINAL_OPEN = builtins.open
GLOBAL_POLICY_CLIENT = None


def install_policy_hooks(policy_client):
    global GLOBAL_POLICY_CLIENT
    GLOBAL_POLICY_CLIENT = policy_client

    original_open = builtins.open
    original_listdir = os.listdir
    original_run = subprocess.run
    original_create_connection = socket.create_connection

    def guarded_open(path, mode="r", *args, **kwargs):
        # Determine if write
        is_write = any(flag in mode for flag in ["w", "a", "+", "x"])
        path_bytes = str(path).encode("utf-8")

        if is_write:
            # Sync
            allowed = policy_client.send_sync(MSG_TYPE_FS_WRITE, path_bytes)
            if not allowed:
                raise PermissionError(f"policy denied write: {path}")
        else:
            # Optimistic
            policy_client.send_optimistic(MSG_TYPE_FS_READ, path_bytes)

        return original_open(path, mode, *args, **kwargs)

    def guarded_listdir(path="."):
        path_bytes = str(path).encode("utf-8")
        policy_client.send_optimistic(MSG_TYPE_LISTDIR, path_bytes)
        return original_listdir(path)

    def guarded_run(cmd, *args, **kwargs):
        cmd_str = (
            cmd[0] if isinstance(cmd, (list, tuple)) and cmd else str(cmd).split(" ")[0]
        )
        cmd_bytes = str(cmd_str).encode("utf-8")

        allowed = policy_client.send_sync(MSG_TYPE_EXEC, cmd_bytes)
        if not allowed:
            raise PermissionError(f"policy denied exec: {cmd_str}")

        return original_run(cmd, *args, **kwargs)

    def guarded_create_connection(address, *args, **kwargs):
        host, port = address
        payload = f"{host}:{port}".encode("utf-8")

        allowed = policy_client.send_sync(MSG_TYPE_NET_CONNECT, payload)
        if not allowed:
            raise PermissionError(f"policy denied net: {host}:{port}")

        return original_create_connection(address, *args, **kwargs)

    builtins.open = guarded_open
    os.listdir = guarded_listdir
    subprocess.run = guarded_run
    socket.create_connection = guarded_create_connection


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

    shm = None
    names_to_try = [
        shm_name,
        "/" + shm_name if not shm_name.startswith("/") else shm_name,
        shm_name.lstrip("/"),
    ]

    for name in set(names_to_try):
        try:
            shm = shared_memory.SharedMemory(name=name)
            break
        except FileNotFoundError:
            pass

    if shm is None:
        print(f"[Python] SHM not found")
        return

    ring_size = shm_size // 2
    bun2py = SharedRingBuffer(shm.buf, 0, ring_size)
    py2bun = SharedRingBuffer(shm.buf, ring_size, ring_size)

    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)

    connected = False
    for i in range(30):
        try:
            sock.connect(socket_path)
            connected = True
            break
        except Exception:
            time.sleep(0.1)

    if not connected:
        return

    sock.sendall(b"READY\n")

    policy_client = PolicyClient(bun2py, py2bun, sock)
    install_policy_hooks(policy_client)

    global_context = {}
    global_context["__name__"] = "__main__"
    global_context["__builtins__"] = builtins

    output_capture = ShmOut(py2bun, sock)

    try:
        while True:
            msg = bun2py.read()
            if msg is None:
                time.sleep(0.001)
                continue

            # [Type: 1][ReqID: 4][Payload: N]
            if len(msg) < 5:
                continue

            msg_type = msg[0]
            # Skip ReqID (bytes 1-5)
            payload = msg[5:]

            if msg_type != MSG_TYPE_CODE:
                # Ignore other messages in main loop
                continue

            code_str = payload.decode("utf-8")
            send_state(sock, "code_received", {"code_length": len(code_str)})

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
            except Exception as e:
                exc_type, exc_value, exc_traceback = sys.exc_info()
                type_name = exc_type.__name__ if exc_type else "Exception"
                error_msg = f"{type_name}: {exc_value}"
                send_state(sock, "exception", {"error": error_msg})
                lines = traceback.format_exception(exc_type, exc_value, exc_traceback)
                print("".join(lines))
            finally:
                sys.stdout = original_stdout

    except KeyboardInterrupt:
        pass
    finally:
        sock.close()
        shm.close()


if __name__ == "__main__":
    main()
