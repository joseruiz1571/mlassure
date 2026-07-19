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
 * Two distinct questions that happen to coincide today (only `attestation`
 * bypasses the LLM loop) but must not be conflated: which pattern authored
 * the judgment's confidence value (code vs. model), and which pattern's
 * insufficient-evidence verdict genuinely means "a human must sign off" vs.
 * "the model couldn't gather enough evidence." Kept as separate named
 * functions, not one shared boolean, so the day `AgentPattern` gains a
 * member that decouples them there is exactly one place each to edit —
 * not a grep across every call site for the right string literal.
 */
export function isCodeDetermined(pattern: AgentPattern): boolean {
  return pattern === "attestation";
}

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
