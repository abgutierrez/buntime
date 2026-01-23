# Example: Net deny metadata
# Recommended policy set: NetEgressPolicy
# Expected: connection to 169.254.169.254:80 should be blocked.
import socket

print("[Example] Expected: metadata service connection blocked")
try:
    sock = socket.create_connection(("169.254.169.254", 80), timeout=2)
    print("[Executor] Metadata connection succeeded (unexpected)")
    sock.close()
except Exception as exc:
    print(f"[Executor] Metadata connection blocked: {exc}")
