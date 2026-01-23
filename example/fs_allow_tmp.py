# Example: FS allow /tmp
# Recommended policy set: default or FSAllowlistPolicy
# Expected: listing /tmp should succeed.
import os

print("[Example] Expected: /tmp access allowed")
try:
    files = os.listdir("/tmp")
    print(f"[Executor] /tmp entries: {len(files)}")
except Exception as exc:
    print(f"[Executor] /tmp access denied: {exc}")
