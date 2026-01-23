# Example: Exec deny bun
# Recommended policy set: exec-policy
# Expected: subprocess launch of bun should be denied.
import subprocess

print("[Example] Expected: bun exec denied")
try:
    result = subprocess.run(
        ["bun", "--version"], capture_output=True, text=True, check=True
    )
    print("[Executor] bun executed (unexpected)")
    print(result.stdout.strip())
except Exception as exc:
    print(f"[Executor] bun exec denied: {exc}")
