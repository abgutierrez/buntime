# Example: Hello World
# Expected: prints runtime info and a simple calculation.
import os
import sys

print("[Example] Expected: environment info and math output")
print(f"[Executor] Python {sys.version.split()[0]} running...")
print(f"[Executor] PID: {os.getpid()}")
print(f"[Executor] CWD: {os.getcwd()}")
print("[Executor] Calculation: 25 * 4 =", 25 * 4)
