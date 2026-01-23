# Example: Exec deny curl
# Recommended policy set: ExecPolicy
# Expected: subprocess launch of /usr/bin/curl should be denied.
import subprocess

print("[Example] Expected: /usr/bin/curl exec denied")
try:
    result = subprocess.run(
        ["/usr/bin/curl", "--version"], capture_output=True, text=True, check=True
    )
    print("[Executor] /usr/bin/curl executed (unexpected)")
    print(result.stdout.strip())
except Exception as exc:
    print(f"[Executor] /usr/bin/curl exec denied: {exc}")
