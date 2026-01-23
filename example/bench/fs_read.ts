const path = process.env.BENCH_PATH ?? "/tmp/bench.txt";
const iterations = Number(process.env.BENCH_ITER ?? "500");
const payload = "x".repeat(1024);
let errors = 0;

try {
  await Bun.write(path, payload);
} catch (error) {
  console.warn(`[Bench] write failed: ${error}`);
}

const start = performance.now();
for (let i = 0; i < iterations; i += 1) {
  try {
    await Bun.file(path).text();
  } catch {
    errors += 1;
  }
}
const elapsedMs = performance.now() - start;

console.log(`[Bench] fs_read elapsed_ms=${elapsedMs.toFixed(2)} errors=${errors}`);
