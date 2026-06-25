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
