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
