# Example: Net deny RFC1918
# Recommended policy set: NetEgressPolicy
# Expected: connection to 10.0.0.1:80 should be blocked.
import socket

print("[Example] Expected: RFC1918 egress blocked")
try:
    sock = socket.create_connection(("10.0.0.1", 80), timeout=2)
    print("[Executor] RFC1918 connection succeeded (unexpected)")
    sock.close()
except Exception as exc:
    print(f"[Executor] RFC1918 connection blocked: {exc}")
