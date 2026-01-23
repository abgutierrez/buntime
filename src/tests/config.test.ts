import { describe, expect, test } from "bun:test";
import { join } from "path";
import { loadConfig } from "../config";

describe("loadConfig", () => {
    test("returns defaults when file is missing", async () => {
        const config = await loadConfig("config.missing.json");
        expect(config.security.mode).toBe("strict");
        expect(config.network.enabled).toBe(true);
        expect(config.network.allow_list).toEqual(["*"]);
        expect(config.filesystem.allow_write).toBe(false);
    });

    test("loads config from file", async () => {
        const tmpPath = join(process.cwd(), ".tmp-config.json");
        const payload = {
            security: { mode: "monitor" },
            network: {
                enabled: false,
                policy: "allow_list",
                allow_list: ["example.com"],
                deny_list: ["*"],
                rate_limit: 2,
            },
            filesystem: { allow_write: true },
            resources: { memory_limit: 128, cpu_limit: 75 },
        };
        await Bun.write(tmpPath, JSON.stringify(payload));
        try {
            const config = await loadConfig(tmpPath);
            expect(config.security.mode).toBe("monitor");
            expect(config.network.enabled).toBe(false);
            expect(config.network.allow_list).toEqual(["example.com"]);
            expect(config.filesystem.allow_write).toBe(true);
        } finally {
            await Bun.file(tmpPath).delete();
        }
    });
});
