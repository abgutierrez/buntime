import { toml } from "bun";

export interface SandboxConfig {
    security: {
        mode: "strict" | "monitor";
    };
    network: {
        enabled: boolean;
        policy: "allow_list" | "deny_all";
        allow_list: string[];
        rate_limit: number;
    };
    filesystem: {
        allow_write: boolean;
    };
    resources: {
        memory_limit: number;
        cpu_limit: number;
    };
}

export async function loadConfig(path: string = "config.toml"): Promise<SandboxConfig> {
    try {
        const file = Bun.file(path);
        if (await file.exists()) {
            const content = await file.text();
            // @ts-ignore - Bun types for TOML might be missing in older versions or incomplete
            return toml(content) as SandboxConfig;
        }
    } catch (e) {
        console.warn(`[Config] Failed to load ${path}, using defaults. Error: ${e}`);
    }

    // Default Configuration
    return {
        security: { mode: "strict" },
        network: {
            enabled: true,
            policy: "deny_all",
            allow_list: [],
            rate_limit: 5
        },
        filesystem: { allow_write: false },
        resources: {
            memory_limit: 64,
            cpu_limit: 50
        }
    };
}
