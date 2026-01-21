import Ajv from "ajv";
import policySchema from "./schema.json";
import path from "path";
// @ts-ignore - node-cidr uses CommonJS exports
const nodeCidr = require("node-cidr");

export type FsPerm = "read_file" | "write_file" | "execute" | "read_dir" | "write_dir" | "remove_dir" | "remove_file" | "make_char" | "make_dir" | "make_reg" | "make_sock" | "make_fifo" | "make_block" | "make_sym";
export type Action = "allow" | "deny" | "warn";
export type DefaultAction = "allow" | "deny";

export interface FsRule {
    action: Action;
    path: string;
    perms: FsPerm[];
}

export interface NetRule {
    action: Action;
    proto: "tcp" | "udp";
    cidr: string;
    ports: string;
}

export interface ExecRule {
    action: Action;
    path: string;
    sha256?: string;
}

export interface Policy {
    version: 1;
    plugins: {
        namespaces: boolean;
        landlock: boolean;
        seccomp: boolean;
    };
    defaults: {
        fs: DefaultAction;
        net: DefaultAction;
        exec: DefaultAction;
    };
    fs?: { rules: FsRule[] };
    net?: { rules: NetRule[] };
    exec?: { rules: ExecRule[] };
    antiEscape?: { denySyscalls: string[] };
}

export interface PortRange {
    from: number;
    to: number;
}

export interface NormalizedNetRule extends Omit<NetRule, 'ports'> {
    ports: PortRange[];
}

export interface NormalizedPolicy extends Omit<Policy, 'net'> {
    net?: { rules: NormalizedNetRule[] };
}


export class PolicyLoader {
    private ajv: Ajv;

    constructor() {
        this.ajv = new Ajv({ useDefaults: true });
    }

    public async load(policyPath: string): Promise<NormalizedPolicy> {
        const policyFile = Bun.file(policyPath);
        if (!await policyFile.exists()) {
            throw new Error(`Policy file not found at: ${policyPath}`);
        }
        const policy = await policyFile.json() as Policy;

        this.validate(policy);
        return this.normalize(policy);
    }

    private validate(policy: Policy): void {
        const validate = this.ajv.compile<Policy>(policySchema);
        if (!validate(policy)) {
            const errorMessages = (validate.errors ?? []).map(e => `${e.instancePath} ${e.message}`).join(', ');
            throw new Error(`Policy validation failed: ${errorMessages}`);
        }

        if (policy.net?.rules) {
            for (const rule of policy.net.rules) {
                if (nodeCidr.cidr.validate(rule.cidr) !== null) {
                    throw new Error(`Invalid CIDR in net rule: ${rule.cidr}`);
                }
            }
        }
    }

    private normalize(policy: Policy): NormalizedPolicy {
        const finalPolicy: Partial<NormalizedPolicy> = {
            version: policy.version,
            plugins: policy.plugins,
            defaults: policy.defaults,
        };

        if (policy.fs?.rules) {
            const fsRules = policy.fs.rules.map(rule => ({
                ...rule,
                path: path.normalize(rule.path),
            }));

            for (const rule of fsRules) {
                if (path.isAbsolute(rule.path)) {
                    rule.path = path.resolve(rule.path);
                }
            }

            finalPolicy.fs = { rules: fsRules };
        }

        if (policy.net?.rules) {
            finalPolicy.net = {
                rules: policy.net.rules.map(rule => ({
                    ...rule,
                    ports: this.parsePorts(rule.ports),
                })),
            };
        }

        return finalPolicy as NormalizedPolicy;
    }

    private parsePorts(portStr: string): PortRange[] {
        const ranges: PortRange[] = [];
        const parts = portStr.split(',');

        for (const part of parts) {
            if (part.includes('-')) {
                const [fromStr, toStr] = part.split('-');
                const from = Number(fromStr);
                const to = Number(toStr);
                if (fromStr == null || toStr == null || isNaN(from) || isNaN(to) || from > to || from < 0 || to > 65535) {
                    throw new Error(`Invalid port range: ${part}`);
                }
                ranges.push({ from, to });
            } else {
                const port = Number(part);
                if (part == null || isNaN(port) || port < 0 || port > 65535) {
                    throw new Error(`Invalid port: ${part}`);
                }
                ranges.push({ from: port, to: port });
            }
        }
        return ranges;
    }
}
