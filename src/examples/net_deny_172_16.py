# Example: Net deny 172.16
# Recommended policy set: NetEgressPolicy
# Expected: connection to 172.16.0.1:80 should be blocked.
import socket

print("[Example] Expected: 172.16.0.0/12 connection blocked")
try:
    sock = socket.create_connection(("172.16.0.1", 80), timeout=2)
    print("[Executor] 172.16 connection succeeded (unexpected)")
    sock.close()
except Exception as exc:
    print(f"[Executor] 172.16 connection blocked: {exc}")
