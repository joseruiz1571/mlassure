export type AgentPattern =
  | "synthesis"
  | "sufficiency"
  | "correlation"
  | "deterministic"
  | "attestation";

export const AGENT_PATTERNS: readonly AgentPattern[] = [
  "synthesis",
  "sufficiency",
  "correlation",
  "deterministic",
  "attestation",
];

/**
 * Two distinct questions that decoupled exactly as anticipated the moment a
 * second pattern (`deterministic`, M3d) gained a code-level bypass: which
 * patterns authored the judgment's confidence value (code vs. model), and
 * which pattern's insufficient-evidence verdict genuinely means "a human
 * must sign off" vs. "the model/code couldn't gather enough evidence."
 * `isCodeDetermined` is a pure derived function over `pattern` — never a
 * stored/cached flag — so it's structurally impossible for a result to
 * diverge from what actually produced it: both `attestation` (M3b) and
 * `deterministic` (M3d) are fail-loud-guaranteed to always be code-run,
 * never silently falling back to the LLM.
 */
export function isCodeDetermined(pattern: AgentPattern): boolean {
  return pattern === "attestation" || pattern === "deterministic";
}

/**
 * Unlike `isCodeDetermined`, this stays `attestation`-only: a `deterministic`
 * control's `not-satisfied`/`satisfied` verdict never needs a human-attestation
 * callout, and even its defensive `insufficient-evidence` path (null-collector
 * case) means "no evidence retrievable," not "a human must sign off."
 */
export function usesAttestationCallout(pattern: AgentPattern): boolean {
  return pattern === "attestation";
}

export type Evidence = {
  id: string;
  source: string;
  retrievedAt: string;
  sha256: string;
  payload: unknown;
};

export type RawEvidence = Omit<Evidence, "sha256">;

export type Judgment = {
  controlId: string;
  status:
    | "satisfied"
    | "partially-satisfied"
    | "not-satisfied"
    | "not-applicable"
    | "insufficient-evidence";
  confidence: "high" | "medium" | "low";
  rationale: string;
  evidenceCited: string[];
  gaps: string[];
};

export const JUDGMENT_STATUSES: readonly Judgment["status"][] = [
  "satisfied",
  "partially-satisfied",
  "not-satisfied",
  "not-applicable",
  "insufficient-evidence",
];

export const JUDGMENT_CONFIDENCES: readonly Judgment["confidence"][] = [
  "high",
  "medium",
  "low",
];

export type ControlItem = {
  id: string;
  framework: string;
  pattern: AgentPattern;
  intent: string;
  collectors: string[];
  note?: string;
};

export type ControlSet = {
  version: string;
  description?: string;
  controls: ControlItem[];
};

export type AssessmentTarget = {
  modelName: string;
  endpointName: string;
  [key: string]: unknown;
};
