const args = Bun.argv.slice(2);
const testFile = args[0];

if (!testFile) {
  throw new Error("Usage: run-bun-test.ts <test-file>");
}

const proc = await Bun.$`bun test ${testFile}`.nothrow();
if (proc.exitCode !== 0) {
  throw new Error("Test failed with exit code " + proc.exitCode);
}
