# Example: FS allow /etc
# Recommended policy set: unrestricted
# Expected: reading /etc directory should be allowed without policy.

import os

print("[Example] Expected: /etc access allowed (read-only)")
try:
    files = os.listdir("/etc")
    print(f"[Executor] /etc entries: {len(files)}")
except Exception as exc:
    print(f"[Executor] /etc access denied: {exc}")
