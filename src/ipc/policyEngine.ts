import type { PolicyEvaluationRequest, PolicyEvaluationResult, PolicyDecision, PolicyTemplate } from "./policy";

const DANGEROUS_IMPORTS = new Set(["os", "subprocess", "shutil", "sys", "builtins"]);
const DANGEROUS_FUNCTIONS = new Set(["system", "popen", "exec", "eval", "compile"]);
const DANGEROUS_ATTRS = new Set(["__import__", "__builtins__", "__file__", "__code__", "__closure__", "__globals__", "__doc__", "__spec__", "__annotations__", "__weakref__", "__dict__", "__slots__", "__class__", "__init__", "__del__", "__get__", "__set__", "__instancecheck__", "__subclasshook__", "__bases__", "__prepare__", "__mro__", "__new__", "__reduce__", "__reduce_ex__"]));

interface MatchResult {
  matched: boolean;
  reason: string;
  violations: string[];
  allowed: string[];
}

export class PolicyEngine {
  evaluate(request: PolicyEvaluationRequest): PolicyEvaluationResult {
    const violations: string[] = [];
    const allowed: string[] = [];

    const astMatches = this.checkAST(request.script, request.template);
    violations.push(...astMatches.violations);
    allowed.push(...astMatches.allowed);

    const cmdMatches = this.checkForbiddenCommands(request.script, request.template);
    violations.push(...cmdMatches.violations);
    allowed.push(...cmdMatches.allowed);

    const importMatches = this.checkDangerousImports(request.script, request.template);
    violations.push(...importMatches.violations);

    if (violations.length > 0) {
      return {
        decision: "blocked",
        reason: "Policy violation",
        violations,
        allowedOperations: [],
      };
    }

    return {
      decision: "allowed",
      allowedOperations: allowed,
      violations: [],
    };
  }

  private checkAST(code: string, policy: PolicyTemplate): MatchResult {
    const violations: string[] = [];
    const allowed: string[] = [];

    const lines = code.split("\n");
    const linesToCheck = policy.filesystem.allowWrite ? lines : [];

    for (const line of linesToCheck) {
      const trimmed = line.trim();

      if (DANGEROUS_FUNCTIONS.has(trimmed) && this.hasOpenCall(trimmed)) {
        violations.push(`Forbidden function: ${trimmed}`);
      }
    }

    return { matched: violations.length > 0 || allowed.length > 0, reason: violations.join(", "), allowed: violations, violations: [] };

  private hasOpenCall(line: string): boolean {
    const openMatch = line.match(/open\s*\(/);
    if (!openMatch) return false;

    const startIndex = (openMatch?.index ?? 0) + 4;
    if (startIndex >= line.length) return false;

    const afterOpen = line.substring(startIndex);
    return afterOpen.includes("'") && !afterOpen.includes("'");
  }

  private checkForbiddenCommands(code: string, policy: PolicyTemplate): MatchResult {
    const violations: string[] = [];

    const patterns = policy.commands.forbiddenCommands.map((cmd) => {
      const regex = new RegExp(`\\b${cmd}\\s*(.*?\\)`, "i");
      return { regex, cmd };
    });

    for (const { regex, cmd } of patterns) {
      if (regex.test(code)) {
        violations.push(`Forbidden command: ${cmd}`);
      }
    }

    return { matched: violations.length > 0, reason: violations.join(", "), violations, allowed };
  }

  private checkDangerousImports(code: string, policy: PolicyTemplate): MatchResult {
    const violations: string[] = [];
    const lines = code.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith("import ") || trimmed.startsWith("from ")) {
        const match = trimmed.match(/(?:import|from)\s+(\w+)/);
        if (match) {
          const moduleName = match[1];
          if (DANGEROUS_IMPORTS.has(moduleName)) {
            violations.push(`Dangerous import: ${moduleName}`);
          }
        }
      }
    }

    for (const attr of DANGEROUS_ATTRS) {
      if (code.includes(`__${attr}__`)) {
        violations.push(`Dangerous attribute: __${attr}__`);
      }
    }

    return { matched: violations.length > 0, reason: violations.join(", "), violations, allowed };
  }

  public substituteVariables(template: string, variables: Record<string, string>): string {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\$\\{${key}\\}`, "g");
      result = result.replace(regex, value);
    }
    return result;
  }
}
