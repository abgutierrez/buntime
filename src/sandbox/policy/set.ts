import type { DefaultAction, ExecRule, FsRule, NetRule, Policy } from "./loader";

export type PolicySetSource = "apply" | "run" | "boot" | "unknown";

export interface PolicySetMeta {
    policyKeys: string[];
    policyCount: number;
    defaults: {
        fs: DefaultAction;
        net: DefaultAction;
        exec: DefaultAction;
    };
    rules: {
        fs: number;
        net: number;
        exec: number;
        antiEscape: number;
        total: number;
    };
    audit: {
        enabled: boolean;
        events: string[];
    };
    source: PolicySetSource;
    appliedAt: string;
}

export interface PolicySetValidation {
    ok: boolean;
    errors: string[];
}

export function buildOpenPolicy(): Policy {
    return {
        version: 1,
        plugins: { namespaces: false, landlock: false, seccomp: false },
        defaults: { fs: "allow", net: "allow", exec: "allow" },
    };
}

function mergeDefault(a: DefaultAction, b: DefaultAction) {
    return a === "deny" || b === "deny" ? "deny" : "allow";
}

export function validatePolicySetInput(policies: Policy[], policyKeys?: string[]): PolicySetValidation {
    const errors: string[] = [];

    if (!Array.isArray(policies)) {
        errors.push("Policies must be provided as an array.");
    }

    if (policyKeys) {
        if (policyKeys.length !== policies.length) {
            errors.push("policyKeys length must match policies length.");
        }
        const seen = new Set<string>();
        for (const key of policyKeys) {
            if (!key) {
                errors.push("policyKeys cannot include empty values.");
                break;
            }
            if (seen.has(key)) {
                errors.push(`Duplicate policy key: ${key}`);
                break;
            }
            seen.add(key);
        }
    }

    if (policies.length > 0) {
        for (const policy of policies) {
            if (policy?.version !== 1) {
                errors.push("Only kernel schema policies (version: 1) can be combined.");
                break;
            }
        }
    }

    return { ok: errors.length === 0, errors };
}

export function mergePolicies(policies: Policy[]): Policy {
    const combined: Policy = {
        version: 1,
        plugins: { namespaces: false, landlock: false, seccomp: false },
        defaults: { fs: "allow", net: "allow", exec: "allow" },
    };

    const fsRules: FsRule[] = [];
    const netRules: NetRule[] = [];
    const execRules: ExecRule[] = [];
    const denySyscalls = new Set<string>();
    const auditEvents = new Set<string>();
    let auditEnabled = false;

    for (const policy of policies) {
        if (policy.version !== 1) {
            throw new Error("Only kernel schema policies can be combined right now");
        }

        combined.plugins.namespaces ||= policy.plugins.namespaces;
        combined.plugins.landlock ||= policy.plugins.landlock;
        combined.plugins.seccomp ||= policy.plugins.seccomp;

        combined.defaults.fs = mergeDefault(combined.defaults.fs, policy.defaults.fs);
        combined.defaults.net = mergeDefault(combined.defaults.net, policy.defaults.net);
        combined.defaults.exec = mergeDefault(combined.defaults.exec, policy.defaults.exec);

        if (policy.fs?.rules) {
            fsRules.push(...policy.fs.rules);
        }
        if (policy.net?.rules) {
            netRules.push(...policy.net.rules);
        }
        if (policy.exec?.rules) {
            execRules.push(...policy.exec.rules);
        }
        if (policy.antiEscape?.denySyscalls) {
            for (const syscall of policy.antiEscape.denySyscalls) {
                denySyscalls.add(syscall);
            }
        }
        if (policy.audit) {
            auditEnabled = auditEnabled || policy.audit.enabled;
            for (const event of policy.audit.events || []) {
                auditEvents.add(event);
            }
        }
    }

    if (fsRules.length) combined.fs = { rules: fsRules };
    if (netRules.length) combined.net = { rules: netRules };
    if (execRules.length) combined.exec = { rules: execRules };
    if (denySyscalls.size) combined.antiEscape = { denySyscalls: Array.from(denySyscalls) };
    if (auditEnabled || auditEvents.size) {
        combined.audit = { enabled: auditEnabled, events: Array.from(auditEvents) };
    }

    return combined;
}

export function buildPolicySetMeta(
    policies: Policy[],
    policyKeys: string[] | undefined,
    combined: Policy,
    source: PolicySetSource,
): PolicySetMeta {
    const keys = policyKeys && policyKeys.length ? policyKeys : policies.map((_, idx) => `policy-${idx + 1}`);
    const rulesFs = combined.fs?.rules?.length ?? 0;
    const rulesNet = combined.net?.rules?.length ?? 0;
    const rulesExec = combined.exec?.rules?.length ?? 0;
    const rulesAntiEscape = combined.antiEscape?.denySyscalls?.length ?? 0;
    const totalRules = rulesFs + rulesNet + rulesExec + rulesAntiEscape;

    return {
        policyKeys: keys,
        policyCount: policies.length,
        defaults: {
            fs: combined.defaults.fs,
            net: combined.defaults.net,
            exec: combined.defaults.exec,
        },
        rules: {
            fs: rulesFs,
            net: rulesNet,
            exec: rulesExec,
            antiEscape: rulesAntiEscape,
            total: totalRules,
        },
        audit: {
            enabled: combined.audit?.enabled ?? false,
            events: combined.audit?.events ?? [],
        },
        source,
        appliedAt: new Date().toISOString(),
    };
}
