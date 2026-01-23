# Example: Net deny 192.168
# Recommended policy set: NetEgressPolicy
# Expected: connection to 192.168.1.1:80 should be blocked.
import socket

print("[Example] Expected: 192.168.0.0/16 connection blocked")
try:
    sock = socket.create_connection(("192.168.1.1", 80), timeout=2)
    print("[Executor] 192.168 connection succeeded (unexpected)")
    sock.close()
except Exception as exc:
    print(f"[Executor] 192.168 connection blocked: {exc}")
