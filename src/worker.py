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
from multiprocessing import shared_memory
import os
import linecache
from typing import Any
from contextlib import contextmanager


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


POLICY_PATH = os.environ.get("POLICY_PATH", "src/policies/active.json")
ORIGINAL_OPEN = builtins.open


def parse_int_env(name, default):
    try:
        return int(os.environ.get(name, str(default)))
    except ValueError:
        return default


LINE_PROFILE_ENABLED = os.environ.get("LINE_PROFILE") == "1"
LINE_PROFILE_SCOPE = os.environ.get("LINE_PROFILE_SCOPE", "policy")
LINE_PROFILE_TOP = parse_int_env("LINE_PROFILE_TOP", 20)
LINE_PROFILE_OUT = os.environ.get("LINE_PROFILE_OUT")

PERF_PROFILE_ENABLED = os.environ.get("PERF_PROFILE") == "1"
PERF_PROFILE_TOP = parse_int_env("PERF_PROFILE_TOP", 10)
PERF_PROFILE_OUT = os.environ.get("PERF_PROFILE_OUT")

POLICY_OPT_RAW = os.environ.get("POLICY_OPT", "")
POLICY_OPT_SET = set()
if POLICY_OPT_RAW:
    normalized = POLICY_OPT_RAW.replace("+", ",").replace("-", ",")
    POLICY_OPT_SET = {
        entry.strip().lower() for entry in normalized.split(",") if entry.strip()
    }

POLICY_CACHE_ENABLED = (
    os.environ.get("POLICY_CACHE") == "1" or "cache" in POLICY_OPT_SET
)
POLICY_PRECOMPILE_ENABLED = (
    os.environ.get("POLICY_PRECOMPILE") == "1" or "precompile" in POLICY_OPT_SET
)

POLICY_CACHE: dict[str, Any] = {"mtime_ns": None, "policy": None}


class PerfStats:
    def __init__(self, enabled):
        self.enabled = enabled
        self.stats = {}

    def reset(self):
        self.stats = {}

    def record(self, name, duration_ns):
        if not self.enabled:
            return
        entry = self.stats.get(name)
        if entry is None:
            entry = {"count": 0, "total_ns": 0, "max_ns": 0}
            self.stats[name] = entry
        entry["count"] += 1
        entry["total_ns"] += duration_ns
        if duration_ns > entry["max_ns"]:
            entry["max_ns"] = duration_ns

    def report(self, limit):
        items = sorted(
            self.stats.items(),
            key=lambda item: item[1]["total_ns"],
            reverse=True,
        )
        report = []
        for name, entry in items[:limit]:
            total_ms = entry["total_ns"] / 1_000_000
            avg_ms = total_ms / entry["count"] if entry["count"] else 0
            report.append(
                {
                    "name": name,
                    "count": entry["count"],
                    "total_ms": round(total_ms, 3),
                    "avg_ms": round(avg_ms, 3),
                    "max_ms": round(entry["max_ns"] / 1_000_000, 3),
                }
            )
        return report


class LineProfiler:
    def __init__(self, enabled, scope, top_n):
        self.enabled = enabled
        self.scope = scope
        self.top_n = top_n
        self.target_file = os.path.abspath(__file__)
        self.stats = {}
        self.frame_state = {}
        self.allowed_funcs = None
        if scope == "policy":
            self.allowed_funcs = {
                "load_active_policy",
                "match_fs_action",
                "match_net_action",
                "match_exec_action",
                "port_matches",
                "guarded_open",
                "guarded_listdir",
                "guarded_run",
                "guarded_create_connection",
            }

    def reset(self):
        self.stats = {}
        self.frame_state = {}

    def _should_trace(self, frame):
        filename = os.path.abspath(frame.f_code.co_filename)
        if filename != self.target_file:
            return False
        if self.allowed_funcs and frame.f_code.co_name not in self.allowed_funcs:
            return False
        return True

    def _add(self, line_no, duration_ns):
        entry = self.stats.get(line_no)
        if entry is None:
            entry = {"count": 0, "total_ns": 0}
            self.stats[line_no] = entry
        entry["count"] += 1
        entry["total_ns"] += duration_ns

    def trace(self, frame, event, arg):
        if not self._should_trace(frame):
            return None
        now = time.perf_counter_ns()
        frame_id = id(frame)
        if event == "call":
            self.frame_state[frame_id] = (frame.f_lineno, now)
            return self.trace
        if event == "line":
            prev_line, prev_time = self.frame_state.get(frame_id, (None, now))
            if prev_line is not None:
                self._add(prev_line, now - prev_time)
            self.frame_state[frame_id] = (frame.f_lineno, now)
            return self.trace
        if event in ("return", "exception"):
            prev_line, prev_time = self.frame_state.get(frame_id, (None, now))
            if prev_line is not None:
                self._add(prev_line, now - prev_time)
            self.frame_state.pop(frame_id, None)
            return self.trace
        return self.trace

    def start(self):
        if not self.enabled:
            return
        sys.settrace(self.trace)

    def stop(self):
        if not self.enabled:
            return
        now = time.perf_counter_ns()
        for line_no, last_time in self.frame_state.values():
            if line_no is not None:
                self._add(line_no, now - last_time)
        self.frame_state = {}
        sys.settrace(None)

    def report(self):
        items = sorted(
            self.stats.items(),
            key=lambda item: item[1]["total_ns"],
            reverse=True,
        )
        report = []
        for line_no, entry in items[: self.top_n]:
            line_text = linecache.getline(self.target_file, line_no).strip()
            total_ms = entry["total_ns"] / 1_000_000
            avg_ms = total_ms / entry["count"] if entry["count"] else 0
            report.append(
                {
                    "line": line_no,
                    "count": entry["count"],
                    "total_ms": round(total_ms, 3),
                    "avg_ms": round(avg_ms, 3),
                    "code": line_text,
                }
            )
        return report


PERF_STATS = PerfStats(PERF_PROFILE_ENABLED)
LINE_PROFILER = LineProfiler(LINE_PROFILE_ENABLED, LINE_PROFILE_SCOPE, LINE_PROFILE_TOP)
EXEC_SEQ = 0


@contextmanager
def perf_span(name):
    if not PERF_STATS.enabled:
        yield
        return
    start = time.perf_counter_ns()
    try:
        yield
    finally:
        PERF_STATS.record(name, time.perf_counter_ns() - start)


def emit_perf_report(exec_id):
    if not PERF_STATS.enabled:
        return
    payload = {
        "exec_id": exec_id,
        "top": PERF_STATS.report(PERF_PROFILE_TOP),
    }
    line = "[Perf] " + json.dumps(payload, separators=(",", ":"))
    if PERF_PROFILE_OUT:
        with ORIGINAL_OPEN(PERF_PROFILE_OUT, "a", encoding="utf-8") as handle:
            handle.write(line + "\n")
    else:
        print(line)


def emit_line_profile(exec_id):
    if not LINE_PROFILER.enabled:
        return
    payload = {
        "exec_id": exec_id,
        "scope": LINE_PROFILE_SCOPE,
        "top": LINE_PROFILER.report(),
    }
    line = "[LineProfile] " + json.dumps(payload, separators=(",", ":"))
    if LINE_PROFILE_OUT:
        with ORIGINAL_OPEN(LINE_PROFILE_OUT, "a", encoding="utf-8") as handle:
            handle.write(line + "\n")
    else:
        print(line)


def load_active_policy():
    with perf_span("policy.load"):
        if POLICY_CACHE_ENABLED:
            try:
                stat = os.stat(POLICY_PATH)
            except FileNotFoundError:
                POLICY_CACHE["policy"] = None
                POLICY_CACHE["mtime_ns"] = None
                return None
            cached = POLICY_CACHE.get("policy")
            cached_mtime = POLICY_CACHE.get("mtime_ns")
            if cached is not None and cached_mtime == stat.st_mtime_ns:
                return cached
        try:
            with ORIGINAL_OPEN(POLICY_PATH, "r", encoding="utf-8") as handle:
                policy = json.load(handle)
                if POLICY_PRECOMPILE_ENABLED:
                    precompile_policy(policy)
                if POLICY_CACHE_ENABLED:
                    POLICY_CACHE["policy"] = policy
                    try:
                        POLICY_CACHE["mtime_ns"] = os.stat(POLICY_PATH).st_mtime_ns
                    except FileNotFoundError:
                        POLICY_CACHE["mtime_ns"] = None
                return policy
        except FileNotFoundError:
            return None
        except Exception:
            return None


def parse_port_ranges(ports_value):
    ranges = []
    parts = [p.strip() for p in str(ports_value).split(",") if p.strip()]
    for part in parts:
        if "-" in part:
            try:
                start, end = part.split("-")
                ranges.append((int(start), int(end)))
            except ValueError:
                continue
        else:
            try:
                value = int(part)
                ranges.append((value, value))
            except ValueError:
                continue
    return ranges


def precompile_policy(policy):
    compiled = {}
    fs_rules = policy.get("fs", {}).get("rules", [])
    if fs_rules:
        compiled_fs = []
        for rule in fs_rules:
            perms = rule.get("perms", [])
            compiled_fs.append(
                {
                    "action": rule.get("action", "allow"),
                    "path": rule.get("path"),
                    "perms_set": set(perms),
                }
            )
        compiled["fs_rules"] = compiled_fs

    net_rules = policy.get("net", {}).get("rules", [])
    if net_rules:
        compiled_net = []
        for rule in net_rules:
            cidr = rule.get("cidr")
            if not cidr:
                continue
            try:
                network = ipaddress.ip_network(cidr, strict=False)
            except ValueError:
                continue
            compiled_net.append(
                {
                    "action": rule.get("action", "allow"),
                    "proto": rule.get("proto"),
                    "network": network,
                    "port_ranges": parse_port_ranges(rule.get("ports", "")),
                }
            )
        compiled["net_rules"] = compiled_net

    exec_rules = policy.get("exec", {}).get("rules", [])
    if exec_rules:
        exec_map = {}
        for rule in exec_rules:
            path = rule.get("path")
            if not path:
                continue
            exec_map.setdefault(path, []).append(rule.get("action", "allow"))
        compiled["exec_rules"] = exec_map

    if compiled:
        policy["_compiled"] = compiled


def resolve_action(actions, fallback):
    with perf_span("policy.resolve"):
        if "deny" in actions:
            return "deny"
        if "warn" in actions:
            return "warn"
        if "allow" in actions:
            return "allow"
        return fallback


def match_fs_action(policy, path, perm):
    with perf_span("policy.fs.match"):
        if not policy:
            return "allow"

        actions = []
        compiled = policy.get("_compiled") if POLICY_PRECOMPILE_ENABLED else None
        if compiled and "fs_rules" in compiled:
            for rule in compiled["fs_rules"]:
                rule_path = rule.get("path")
                perms = rule.get("perms_set", set())
                if rule_path and path.startswith(rule_path) and perm in perms:
                    actions.append(rule.get("action", "allow"))
        else:
            fs_rules = policy.get("fs", {}).get("rules", [])
            for rule in fs_rules:
                rule_path = rule.get("path")
                perms = rule.get("perms", [])
                if rule_path and path.startswith(rule_path) and perm in perms:
                    actions.append(rule.get("action", "allow"))

        defaults = policy.get("defaults", {})
        fallback = defaults.get("fs", "allow")
        return resolve_action(actions, fallback)


def match_net_action(policy, ip, port, proto):
    with perf_span("policy.net.match"):
        if not policy:
            return "allow"

        actions = []
        compiled = policy.get("_compiled") if POLICY_PRECOMPILE_ENABLED else None
        if compiled and "net_rules" in compiled:
            try:
                address = ipaddress.ip_address(ip)
            except ValueError:
                address = None
            if address is not None:
                for rule in compiled["net_rules"]:
                    if rule.get("proto") != proto:
                        continue
                    if address not in rule.get("network"):
                        continue
                    ranges = rule.get("port_ranges", [])
                    if not port_matches_ranges(ranges, port):
                        continue
                    actions.append(rule.get("action", "allow"))
        else:
            net_rules = policy.get("net", {}).get("rules", [])
            for rule in net_rules:
                if rule.get("proto") != proto:
                    continue
                cidr = rule.get("cidr")
                if not cidr:
                    continue
                try:
                    net = ipaddress.ip_network(cidr, strict=False)
                    if ipaddress.ip_address(ip) not in net:
                        continue
                except ValueError:
                    continue
                ports = str(rule.get("ports", ""))
                if not port_matches(ports, port):
                    continue
                actions.append(rule.get("action", "allow"))

        defaults = policy.get("defaults", {})
        fallback = defaults.get("net", "allow")
        return resolve_action(actions, fallback)


def port_matches(ports_value, port):
    with perf_span("policy.net.ports"):
        parts = [p.strip() for p in ports_value.split(",") if p.strip()]
        for part in parts:
            if "-" in part:
                try:
                    start, end = part.split("-")
                    if int(start) <= port <= int(end):
                        return True
                except ValueError:
                    continue
            else:
                try:
                    if int(part) == port:
                        return True
                except ValueError:
                    continue
        return False


def port_matches_ranges(ranges, port):
    for start, end in ranges:
        if start <= port <= end:
            return True
    return False


def match_exec_action(policy, path):
    with perf_span("policy.exec.match"):
        if not policy:
            return "allow"

        actions = []
        compiled = policy.get("_compiled") if POLICY_PRECOMPILE_ENABLED else None
        if compiled and "exec_rules" in compiled:
            actions = compiled["exec_rules"].get(path, [])
        else:
            exec_rules = policy.get("exec", {}).get("rules", [])
            for rule in exec_rules:
                if rule.get("path") == path:
                    actions.append(rule.get("action", "allow"))

        defaults = policy.get("defaults", {})
        fallback = defaults.get("exec", "allow")
        return resolve_action(actions, fallback)


def mode_to_perm(mode):
    with perf_span("policy.fs.mode"):
        if any(flag in mode for flag in ["w", "a", "+", "x"]):
            return "write_file"
        return "read_file"


def install_policy_hooks(global_context):
    original_open = builtins.open
    original_listdir = os.listdir
    original_run = subprocess.run
    original_create_connection = socket.create_connection

    def guarded_open(path, mode="r", *args, **kwargs):
        with perf_span("hook.open"):
            if os.path.abspath(path) == os.path.abspath(POLICY_PATH):
                return ORIGINAL_OPEN(path, mode, *args, **kwargs)
            policy = load_active_policy()
            perm = mode_to_perm(mode)
            action = match_fs_action(policy, path, perm)
            if action == "deny":
                raise PermissionError("policy denied")
            if action == "warn":
                print(f"[Audit] warn fs {path}")
            return original_open(path, mode, *args, **kwargs)

    def guarded_listdir(path="."):
        with perf_span("hook.listdir"):
            policy = load_active_policy()
            action = match_fs_action(policy, path, "read_dir")
            if action == "deny":
                raise PermissionError("policy denied")
            if action == "warn":
                print(f"[Audit] warn fs {path}")
            return original_listdir(path)

    def guarded_run(cmd, *args, **kwargs):
        with perf_span("hook.exec"):
            policy = load_active_policy()
            path = (
                cmd[0]
                if isinstance(cmd, (list, tuple)) and cmd
                else str(cmd).split(" ")[0]
            )
            action = match_exec_action(policy, path)
            if action == "deny":
                raise PermissionError("policy denied")
            if action == "warn":
                print(f"[Audit] warn exec {path}")
            return original_run(cmd, *args, **kwargs)

    def guarded_create_connection(address, *args, **kwargs):
        with perf_span("hook.net"):
            policy = load_active_policy()
            host, port = address
            action = match_net_action(policy, host, port, "tcp")
            if action == "deny":
                raise PermissionError("policy denied")
            if action == "warn":
                print(f"[Audit] warn net tcp {host}:{port}")
            return original_create_connection(address, *args, **kwargs)

    builtins.open = guarded_open
    os.listdir = guarded_listdir
    subprocess.run = guarded_run
    socket.create_connection = guarded_create_connection

    global_context["__builtins__"] = builtins


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
    for i in range(30):
        try:
            sock.connect(socket_path)
            connected = True
            break
        except FileNotFoundError:
            time.sleep(0.1)
        except Exception as e:
            print(f"[Python] Connection error (attempt {i}): {e}")
            time.sleep(0.1)

    if not connected:
        print(f"[Python] Could not connect to {socket_path}")
        try:
            # Debugging: check what IS in /app or socket directory
            dirname = os.path.dirname(socket_path)
            if not dirname:
                dirname = "."
            print(f"[Python] Listing directory {dirname}: {os.listdir(dirname)}")
        except Exception as e:
            print(f"[Python] Listing directory failed: {e}")
        return

    sock.sendall(b"READY\n")

    print("[Python] Worker Loop Started")

    global_context = {}
    install_policy_hooks(global_context)
    global_context["__name__"] = "__main__"
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

            global EXEC_SEQ
            exec_id = 0
            try:
                send_state(sock, "exec_start")
                PERF_STATS.reset()
                LINE_PROFILER.reset()
                LINE_PROFILER.start()
                EXEC_SEQ += 1
                exec_id = EXEC_SEQ
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
                type_name = exc_type.__name__ if exc_type else "Exception"
                error_msg = f"{type_name}: {exc_value}"
                send_state(sock, "exception", {"error": error_msg})
                lines = traceback.format_exception(exc_type, exc_value, exc_traceback)
                print("".join(lines))
            finally:
                LINE_PROFILER.stop()
                emit_perf_report(exec_id)
                emit_line_profile(exec_id)
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
