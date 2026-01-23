import { describe, expect, test } from "bun:test";
import type { Policy } from "./loader";
import { buildPolicySetMeta, mergePolicies, validatePolicySetInput } from "./set";

const basePolicy: Policy = {
    version: 1,
    plugins: { namespaces: true, landlock: true, seccomp: true },
    defaults: { fs: "deny", net: "allow", exec: "allow" },
    fs: {
        rules: [
            { action: "allow", path: "/tmp", perms: ["read_file"] },
        ],
    },
    audit: { enabled: true, events: ["connect"] },
};

const extraPolicy: Policy = {
    version: 1,
    plugins: { namespaces: false, landlock: true, seccomp: true },
    defaults: { fs: "allow", net: "deny", exec: "allow" },
    net: {
        rules: [
            { action: "deny", proto: "tcp", cidr: "0.0.0.0/0", ports: "443" },
        ],
    },
    exec: {
        rules: [
            { action: "allow", path: "/usr/bin/python3.12" },
        ],
    },
    antiEscape: { denySyscalls: ["ptrace"] },
    audit: { enabled: false, events: ["openat"] },
};

describe("policy set validation", () => {
    test("rejects invalid policy keys", () => {
        const result = validatePolicySetInput([basePolicy], ["", "extra"]);
        expect(result.ok).toBe(false);
    });

    test("accepts empty policy set", () => {
        const result = validatePolicySetInput([], []);
        expect(result.ok).toBe(true);
    });
});

describe("policy set merge", () => {
    test("merges defaults and rules", () => {
        const combined = mergePolicies([basePolicy, extraPolicy]);
        expect(combined.defaults.fs).toBe("deny");
        expect(combined.defaults.net).toBe("deny");
        expect(combined.fs?.rules.length).toBe(1);
        expect(combined.net?.rules.length).toBe(1);
        expect(combined.exec?.rules.length).toBe(1);
        expect(combined.audit?.events).toEqual(expect.arrayContaining(["connect", "openat"]));
    });
});

describe("policy set metadata", () => {
    test("summarizes policies", () => {
        const combined = mergePolicies([basePolicy, extraPolicy]);
        const meta = buildPolicySetMeta([basePolicy, extraPolicy], ["base", "extra"], combined, "apply");
        expect(meta.policyCount).toBe(2);
        expect(meta.defaults.fs).toBe("deny");
        expect(meta.rules.total).toBe(4);
        expect(meta.audit.enabled).toBe(true);
    });
});
