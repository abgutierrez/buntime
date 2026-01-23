# Example: FS deny /etc/hosts
# Recommended policy set: FSAllowlistPolicy
# Expected: reading /etc/hosts should be denied by filesystem policy.

print("[Example] Expected: /etc/hosts access denied")
try:
    with open("/etc/hosts", "r", encoding="utf-8") as handle:
        content = handle.read(200)
    print("[Executor] /etc/hosts read succeeded (unexpected)")
    print(content)
except Exception as exc:
    print(f"[Executor] /etc/hosts access denied: {exc}")
