# Example: Exec deny ls
# Recommended policy set: ExecPolicy
# Expected: subprocess launch of /bin/ls should be denied.
import subprocess

print("[Example] Expected: /bin/ls exec denied")
try:
    result = subprocess.run(
        ["/bin/ls", "/tmp"], capture_output=True, text=True, check=True
    )
    print("[Executor] /bin/ls executed (unexpected)")
    print(result.stdout.strip())
except Exception as exc:
    print(f"[Executor] /bin/ls exec denied: {exc}")
