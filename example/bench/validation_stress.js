const benchPath = process.env.BENCH_PATH ?? "/tmp/bench.txt";
const fsOps = Number(process.env.BENCH_FS_OPS ?? "200");
const writeEvery = Number(process.env.BENCH_FS_WRITE_EVERY ?? "10");
const netOps = Number(process.env.BENCH_NET_OPS ?? "10");
const timeoutMs = Number(process.env.BENCH_NET_TIMEOUT_MS ?? "300");

const allowHost = process.env.BENCH_ALLOW_HOST ?? "localhost";
const denyHost = process.env.BENCH_DENY_HOST ?? "127.0.0.1";
const targetPort = Number(process.env.BENCH_TARGET_PORT ?? "9");

const proxyUrl =
  process.env.BENCH_PROXY_URL ??
  process.env.HTTP_PROXY ??
  process.env.HTTPS_PROXY ??
  "";

let proxy = null;
let proxyError = null;
if (proxyUrl) {
  try {
    proxy = new URL(proxyUrl);
  } catch (error) {
    proxyError = String(error);
  }
}
const proxyHost = proxy?.hostname ?? "";
const proxyPort = Number(proxy?.port ?? (proxy?.protocol === "https:" ? "443" : "80"));
const proxyMode = proxy ? "proxy" : "direct";

/**
 * @returns {Promise<{ statusCode: number | null; error?: string }>}
 */
async function connectViaProxy(host, port) {
  if (!proxyHost || !proxyPort) {
    return { statusCode: null, error: "proxy_not_configured" };
  }

  const request = `CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n\r\n`;
  const decoder = new TextDecoder();

  return new Promise((resolve) => {
    let buffer = "";
    let settled = false;
    let activeSocket = null;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      activeSocket?.end();
      resolve({ statusCode: null, error: "timeout" });
    }, timeoutMs);

    const socketPromise = Bun.connect({
      hostname: proxyHost,
      port: proxyPort,
      socket: {
        open(sock) {
          activeSocket = sock;
          sock.write(request);
        },
        data(sock, data) {
          buffer += decoder.decode(data);
          const lineEnd = buffer.indexOf("\r\n");
          if (lineEnd === -1 || settled) return;
          const statusLine = buffer.slice(0, lineEnd);
          const statusCode = Number(statusLine.split(" ")[1] ?? "");
          settled = true;
          clearTimeout(timeout);
          sock.end();
          resolve({ statusCode: Number.isFinite(statusCode) ? statusCode : null });
        },
        error(_sock, error) {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          resolve({ statusCode: null, error: String(error) });
        },
        close() {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          resolve({ statusCode: null, error: "closed" });
        },
      },
    });
    socketPromise.catch((error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ statusCode: null, error: String(error) });
    });
  });
}

/**
 * @returns {Promise<{ statusCode: number | null; error?: string }>}
 */
async function directFetch(host, port) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`http://${host}:${port}/`, { signal: controller.signal });
    return { statusCode: response.status };
  } catch (error) {
    return { statusCode: null, error: String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

async function runNetworkOps() {
  let allowed = 0;
  let denied = 0;
  let errors = 0;

  for (let i = 0; i < netOps; i += 1) {
    const host = i % 2 === 0 ? allowHost : denyHost;
    const result = proxy
      ? await connectViaProxy(host, targetPort)
      : await directFetch(host, targetPort);

    if (result.statusCode === 200) {
      allowed += 1;
    } else if (result.statusCode === 403) {
      denied += 1;
    } else {
      errors += 1;
    }
  }

  return { allowed, denied, errors };
}

async function runFileOps() {
  const payload = "x".repeat(1024);
  let reads = 0;
  let writes = 0;
  let errors = 0;

  for (let i = 0; i < fsOps; i += 1) {
    if (i % writeEvery === 0) {
      try {
        await Bun.write(benchPath, payload);
        writes += 1;
      } catch {
        errors += 1;
      }
    }

    try {
      await Bun.file(benchPath).text();
      reads += 1;
    } catch {
      errors += 1;
    }
  }

  return { reads, writes, errors };
}

const fsStart = performance.now();
const fsStats = await runFileOps();
const fsElapsedMs = performance.now() - fsStart;

const netStart = performance.now();
const netStats = await runNetworkOps();
const netElapsedMs = performance.now() - netStart;

const meta = {
  proxyMode,
  proxyError: proxyError ?? undefined,
  benchPath,
  allowHost,
  denyHost,
  targetPort,
  fsOps,
  fsReads: fsStats.reads,
  fsWrites: fsStats.writes,
  fsErrors: fsStats.errors,
  netOps,
  netAllowed: netStats.allowed,
  netDenied: netStats.denied,
  netErrors: netStats.errors,
  fsElapsedMs: Number(fsElapsedMs.toFixed(2)),
  netElapsedMs: Number(netElapsedMs.toFixed(2)),
};

console.log(`[BenchMeta] ${JSON.stringify(meta)}`);
console.log(
  `[Bench] validation_stress fs_ms=${fsElapsedMs.toFixed(2)} net_ms=${netElapsedMs.toFixed(
    2,
  )} fs_errors=${fsStats.errors} net_errors=${netStats.errors}`,
);
