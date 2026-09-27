import type { RawEvidence, AssessmentTarget } from "../types.js";

export type CollectorResult = RawEvidence | null | RawEvidence[];

export type CollectorSpec = {
  /** Shown to the model as the tool description — say what the collector returns. */
  description: string;
};

/**
 * The one provider interface the agent, the runner and the tools depend on
 * (M8a). A target family (SageMaker, a Proof-of-Control token stream, ...)
 * is a catalog of named collectors plus a way to run one by name; control
 * sets reference collectors by those names.
 *
 * Collector names are strings, so the compiler cannot check a control set
 * against a provider. `runAssessment()`'s preflight does that instead and
 * aborts before any control is assessed. Inside a family, keep the names
 * compiler-checked (see `aws-sagemaker.ts` for the pattern).
 */
export interface EvidenceProvider {
  /** Stable family identifier, e.g. "aws-sagemaker". */
  readonly family: string;
  /** Every collector this provider offers, keyed by collector name. */
  readonly collectors: Readonly<Record<string, CollectorSpec>>;
  /** Runs one collector. Throws on a name that is not in `collectors`. */
  collect(name: string, target: AssessmentTarget): Promise<CollectorResult>;
}

/**
 * Own-property check, never `in`: `"constructor" in {}` is true, and a model
 * that emits a tool call named after an inherited key must get "Unknown
 * tool", not a call into Object.prototype.
 */
export function hasCollector(provider: EvidenceProvider, name: string): boolean {
  return Object.hasOwn(provider.collectors, name);
}

/** The name the agent loop reserves for its own exit tool. */
export const RESERVED_TOOL_NAME = "submit_judgment";

// Collector names are sent to the model as tool names, so they follow the
// tool-name grammar: letters, digits, underscore and hyphen, 1 to 64 long.
const COLLECTOR_NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;

/** Every reason a catalog cannot be offered to the model as tools. Empty means usable. */
export function catalogProblems(provider: EvidenceProvider): string[] {
  return Object.keys(provider.collectors).flatMap((name) => {
    if (name === RESERVED_TOOL_NAME) {
      return [`"${name}" is reserved for the judgment tool`];
    }
    if (!COLLECTOR_NAME_RE.test(name)) {
      return [`"${name}" is not a valid tool name (letters, digits, _ and -, 1 to 64 characters)`];
    }
    return [];
  });
}

export type CollectorDefinition = CollectorSpec & {
  run(target: AssessmentTarget): Promise<CollectorResult>;
};

/**
 * Builds a provider from ONE table, so the catalog the model sees and the
 * code that runs cannot drift apart: a collector with a description and no
 * implementation, or the reverse, is not expressible.
 */
export function defineProvider(
  family: string,
  definitions: Readonly<Record<string, CollectorDefinition>>
): EvidenceProvider {
  const collectors: Record<string, CollectorSpec> = {};
  for (const [name, def] of Object.entries(definitions)) {
    collectors[name] = { description: def.description };
  }
  const provider: EvidenceProvider = {
    family,
    collectors,
    async collect(name, target) {
      if (!Object.hasOwn(definitions, name)) {
        throw new Error(`Unknown collector tool: "${name}"`);
      }
      return definitions[name]!.run(target);
    },
  };
  const problems = catalogProblems(provider);
  if (problems.length > 0) {
    throw new Error(`Provider "${family}" has an unusable collector catalog: ${problems.join("; ")}`);
  }
  return provider;
}

