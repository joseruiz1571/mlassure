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

/**
 * One entry in a control's tag-provenance history (M3f) — an authority
 * record for a pattern-vocabulary assignment: what was assigned, when,
 * why, and (for migrations) what it superseded.
 *
 * `pattern` and `supersedes` are plain strings, not `AgentPattern`: a
 * historical record may legitimately hold a pattern name that has since
 * been retired from the registry, and typing it as `AgentPattern` would
 * make that history unloadable forever. Registry membership is enforced
 * only at the head of the history, which the loader requires to equal
 * the control's live `pattern` field (itself registry-validated).
 */
export type TagProvenanceRecord = {
  pattern: string;
  /** YYYY-MM-DD date the tag was assigned. */
  assigned: string;
  /** Why this tag — required. An assignment without a why is not an authority record. */
  rationale: string;
  /**
   * The pattern this record superseded. Absent on the origin record;
   * required on every later record, where it must equal the previous
   * record's `pattern` (the loader enforces the directional chain).
   */
  supersedes?: string;
};

/**
 * Structural guard for provenance histories at the point of CONSUMPTION.
 * The loader enforces these invariants at ingestion, but `ControlResult`
 * is a plain type any producer can construct — a renderer that trusts
 * loader invariants it cannot see would serialize literal "undefined"
 * into an auditor-facing artifact (silent-failure-hunter, M3f). Both
 * output renderers call this before rendering any provenance.
 */
export function assertProvenanceShape(
  records: TagProvenanceRecord[],
  controlId: string
): void {
  if (records.length === 0) {
    throw new Error(
      `Control "${controlId}": tagProvenance is an empty array — an empty history is corrupt data, not "no history"; refusing to render`
    );
  }
  records.forEach((rec, i) => {
    if (i === 0 && rec.supersedes !== undefined) {
      throw new Error(
        `Control "${controlId}": tagProvenance origin record carries "supersedes" (${rec.supersedes}) — structurally invalid history reached a renderer`
      );
    }
    if (i > 0 && rec.supersedes === undefined) {
      throw new Error(
        `Control "${controlId}": tagProvenance migration record (${rec.pattern}@${rec.assigned}) has no "supersedes" — structurally invalid history reached a renderer`
      );
    }
  });
}

export type ControlItem = {
  id: string;
  framework: string;
  pattern: AgentPattern;
  intent: string;
  collectors: string[];
  note?: string;
  /**
   * Optional tag-provenance history, oldest first. Array order is
   * authoritative for the migration chain; `assigned` dates must agree
   * with it (non-decreasing). When present it must be non-empty and its
   * head (last record) must match `pattern`.
   */
  tagProvenance?: TagProvenanceRecord[];
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
