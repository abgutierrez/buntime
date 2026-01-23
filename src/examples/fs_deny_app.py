# Example: FS deny /app
# Recommended policy set: FSAllowlistPolicy
# Expected: reading /app directory should be denied by filesystem policy.

print("[Example] Expected: /app access denied")
try:
    with open("/app/test.txt", "r", encoding="utf-8") as handle:
        content = handle.read(200)
    print("[Executor] /app read succeeded (unexpected)")
    print(content)
except FileNotFoundError:
    print("[Executor] /app file not found (expected - deny)")
except PermissionError as exc:
    print(f"[Executor] /app access denied: {exc}")
except Exception as exc:
    print(f"[Executor] /app access error: {exc}")
