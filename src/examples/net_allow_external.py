# Example: Net allow external
# Recommended policy set: default policy
# Expected: connection to 1.1.1.1 on port 443 should be allowed.
import socket

print("[Example] Expected: external HTTPS connection allowed")
try:
    sock = socket.create_connection(("1.1.1.1", 443), timeout=5)
    print("[Executor] External HTTPS connection succeeded")
    sock.close()
except Exception as exc:
    print(f"[Executor] External connection failed: {exc}")
