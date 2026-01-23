# Example: Exec deny cat
# Recommended policy set: ExecPolicy
# Expected: subprocess launch of /bin/cat should be denied.
import subprocess

print("[Example] Expected: /bin/cat exec denied")
try:
    result = subprocess.run(
        ["/bin/cat", "--version"], capture_output=True, text=True, check=True
    )
    print("[Executor] /bin/cat executed (unexpected)")
    print(result.stdout.strip())
except Exception as exc:
    print(f"[Executor] /bin/cat exec denied: {exc}")
