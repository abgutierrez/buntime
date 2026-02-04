const testFile = process.env.TEST_FILE;

if (!testFile) {
  throw new Error("Missing TEST_FILE environment variable");
}

const proc = await Bun.$`bun test ${testFile}`.nothrow();
console.log(proc.stdout.toString());
console.error(proc.stderr.toString());
if (proc.exitCode !== 0) {
  throw new Error("Test failed with exit code " + proc.exitCode);
}
