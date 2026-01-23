# Example: Exec deny /bin/sh
# Recommended policy set: ExecPolicy
# Expected: subprocess launch of /bin/sh should be denied.
import subprocess

print("[Example] Expected: /bin/sh exec denied")
try:
    result = subprocess.run(
        ["/bin/sh", "-c", "echo denied"], capture_output=True, text=True, check=True
    )
    print("[Executor] /bin/sh executed (unexpected)")
    print(result.stdout.strip())
except Exception as exc:
    print(f"[Executor] /bin/sh exec denied: {exc}")
