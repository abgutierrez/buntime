# Example: Exec deny bash
# Recommended policy set: default policy
# Expected: subprocess launch of bash should be denied.
import subprocess

print("[Example] Expected: bash exec denied")
try:
    result = subprocess.run(
        ["/bin/bash", "-c", "echo denied"], capture_output=True, text=True, check=True
    )
    print("[Executor] bash executed (unexpected)")
    print(result.stdout.strip())
except Exception as exc:
    print(f"[Executor] bash exec denied: {exc}")
