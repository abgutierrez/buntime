# Example: FS deny /etc/hostname
# Recommended policy set: fs-allowlist policy
# Expected: reading /etc/hostname should be denied by fs-allowlist policy.

print("[Example] Expected: /etc/hostname access denied")
try:
    with open("/etc/hostname", "r", encoding="utf-8") as handle:
        content = handle.read(200)
    print("[Executor] /etc/hostname read succeeded (unexpected)")
    print(content)
except FileNotFoundError:
    print("[Executor] /etc/hostname file not found (expected - deny)")
except PermissionError as exc:
    print(f"[Executor] /etc/hostname access denied: {exc}")
except Exception as exc:
    print(f"[Executor] /etc/hostname access error: {exc}")
