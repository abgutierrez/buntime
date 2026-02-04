import { describe, expect, test } from "bun:test";
import { IPCServer } from "../../ipc/server";
import { type SandboxConfig } from "../../config";
import { unlinkSync, existsSync } from "node:fs";

const baseConfig: SandboxConfig = {
  security: { mode: "strict" },
  network: {
    enabled: false,
    policy: "allow_list",
    allow_list: [],
    deny_list: [],
    rate_limit: 5,
  },
  filesystem: { allow_write: false },
  resources: {
    memory_limit: 64,
    cpu_limit: 50,
  },
};

type WorkerEnvOptions = { env?: Record<string, string>; sandboxEnabled?: boolean };

async function runWorkerAndGetEnv(
  server: IPCServer,
  config: SandboxConfig,
  options: WorkerEnvOptions,
  keys: string[],
) {
  const tempFile = `env-output-${Math.random().toString(36).slice(2)}.json`;
  const workerScriptFile = `temp-worker-${Math.random().toString(36).slice(2)}.ts`;

  try {
    const workerScript = `
import { writeFileSync } from "node:fs";
const keys = ${JSON.stringify(keys)};
const filteredEnv: Record<string, string | undefined> = {};
for (const key of keys) {
  if (key in process.env) filteredEnv[key] = process.env[key];
}
writeFileSync("${tempFile}", JSON.stringify(filteredEnv));
process.exit(0);
`;
    await Bun.write(workerScriptFile, workerScript);
    await server.start(["bun", "run", workerScriptFile], config, options);

    let output: Record<string, string | undefined> | undefined;
    for (let i = 0; i < 50; i += 1) {
      if (existsSync(tempFile)) {
        try {
          const content = await Bun.file(tempFile).text();
          output = JSON.parse(content) as Record<string, string | undefined>;
          break;
        } catch {}
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return output;
  } finally {
    if (existsSync(workerScriptFile)) unlinkSync(workerScriptFile);
    if (existsSync(tempFile)) unlinkSync(tempFile);
  }
}

describe("Worker Env Propagation", () => {
  test("WORKER_ env vars are propagated as stripped vars", async () => {
    const shmName = "/test-env-" + Math.random().toString(36).slice(2);
    const server = new IPCServer(shmName, 1024 * 1024);

    const testKey = "WORKER_TEST_PROPAGATION_" + Math.random().toString(36).slice(2).toUpperCase();
    const testValue = "value-" + Math.random().toString(36).slice(2);
    const expectedKey = testKey.slice(7);

    process.env[testKey] = testValue;

    try {
      const output = await runWorkerAndGetEnv(
        server,
        baseConfig,
        { sandboxEnabled: false },
        [testKey, expectedKey],
      );

      expect(output).toBeDefined();
      expect(output?.[expectedKey]).toBe(testValue);
      expect(output?.[testKey]).toBe(testValue);
    } finally {
      server.stop();
      delete process.env[testKey];
    }
  });

  test("WORKER_ env vars from process.env are propagated even if not in options.env", async () => {
    const shmName = "/test-env-2-" + Math.random().toString(36).slice(2);
    const server = new IPCServer(shmName, 1024 * 1024);

    const testKey = "WORKER_SECOND_TEST_" + Math.random().toString(36).slice(2).toUpperCase();
    const testValue = "second-value";
    const expectedKey = testKey.slice(7);

    process.env[testKey] = testValue;

    try {
      const output = await runWorkerAndGetEnv(
        server,
        baseConfig,
        { sandboxEnabled: false, env: { OTHER_VAR: "foo" } },
        [expectedKey, "OTHER_VAR"],
      );

      expect(output).toBeDefined();
      expect(output?.[expectedKey]).toBe(testValue);
      expect(output?.OTHER_VAR).toBe("foo");
    } finally {
      server.stop();
      delete process.env[testKey];
    }
  });

  test("WORKER_ env vars override options.env for the same stripped key", async () => {
    const shmName = "/test-env-3-" + Math.random().toString(36).slice(2);
    const server = new IPCServer(shmName, 1024 * 1024);

    const testKey = "WORKER_PRECEDENCE_TEST";
    const testValue = "worker-value";
    const expectedKey = "PRECEDENCE_TEST";
    const optionsValue = "options-value";

    process.env[testKey] = testValue;

    try {
      const output = await runWorkerAndGetEnv(
        server,
        baseConfig,
        { sandboxEnabled: false, env: { [expectedKey]: optionsValue } },
        [expectedKey],
      );

      expect(output).toBeDefined();
      expect(output?.[expectedKey]).toBe(testValue);
    } finally {
      server.stop();
      delete process.env[testKey];
    }
  });
});
