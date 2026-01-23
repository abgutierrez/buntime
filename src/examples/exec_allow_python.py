# Example: Exec allow Python
# Recommended policy set: ExecPolicy
# Expected: /usr/bin/python3.12 exec allowed.
import os
import subprocess

python_bin = (
    "/usr/bin/python3.12"
    if os.path.exists("/usr/bin/python3.12")
    else "/usr/bin/python3"
)
print("[Example] Expected: python exec allowed")
try:
    result = subprocess.run(
        [python_bin, "-c", "print('ok')"],
        capture_output=True,
        text=True,
        check=True,
    )
    print("[Executor] Python exec output:", result.stdout.strip())
except Exception as exc:
    print(f"[Executor] Python exec denied: {exc}")
