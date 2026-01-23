const url = process.env.BENCH_URL ?? "http://example.com";
const iterations = Number(process.env.BENCH_ITER ?? "50");
const timeoutMs = Number(process.env.BENCH_TIMEOUT_MS ?? "1000");
let errors = 0;

const start = performance.now();
for (let i = 0; i < iterations; i += 1) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    await response.arrayBuffer();
  } catch {
    errors += 1;
  } finally {
    clearTimeout(timeout);
  }
}
const elapsedMs = performance.now() - start;

console.log(`[Bench] net_fetch elapsed_ms=${elapsedMs.toFixed(2)} errors=${errors}`);
