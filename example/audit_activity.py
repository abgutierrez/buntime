import os
import socket
import subprocess

print("[Example] Expected: syscall activity (openat/execve/connect)")

try:
    with open("/etc/hosts", "r", encoding="utf-8") as handle:
        handle.read(64)
    print("[Executor] /etc/hosts read succeeded")
except Exception as exc:
    print(f"[Executor] /etc/hosts read failed: {exc}")

try:
    subprocess.run(["/bin/echo", "audit"], capture_output=True, text=True, check=True)
    print("[Executor] /bin/echo executed")
except Exception as exc:
    print(f"[Executor] /bin/echo exec failed: {exc}")

try:
    sock = socket.create_connection(("1.1.1.1", 443), timeout=2)
    sock.close()
    print("[Executor] connect succeeded")
except Exception as exc:
    print(f"[Executor] connect failed: {exc}")

try:
    os.makedirs("/tmp/audit", exist_ok=True)
    with open("/tmp/audit/touch.txt", "w", encoding="utf-8") as handle:
        handle.write("audit")
    print("[Executor] /tmp write succeeded")
except Exception as exc:
    print(f"[Executor] /tmp write failed: {exc}")
