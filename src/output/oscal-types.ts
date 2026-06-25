/**
 * A focused, typed subset of the OSCAL Assessment Results (AR) model.
 *
 * This is not the full OSCAL schema — it is the slice mlassure emits. Field
 * names use OSCAL's kebab-case JSON convention (e.g. `oscal-version`,
 * `import-ap`, `last-modified`) so the output is consumable by OSCAL-aware
 * tooling without a translation step.
 *
 * Reference: NIST OSCAL Assessment Results model, 1.1.x.
 */

/** The OSCAL release this writer targets. */
export const OSCAL_VERSION = "1.1.2";

/** mlassure's namespace for non-core props (sha256, confidence, etc.). */
export const MLASSURE_NS = "https://mlassure.dev/ns/oscal";

export type OscalProp = {
  name: string;
  value: string;
  ns?: string;
  class?: string;
};

export type OscalMetadata = {
  title: string;
  "last-modified": string;
  version: string;
  "oscal-version": string;
};

/**
 * Required link to the assessment plan being executed. mlassure does not (yet)
 * emit an OSCAL assessment-plan, so `href` is an empty same-document reference;
 * AP linkage is a documented follow-up.
 */
export type OscalImportAp = {
  href: string;
  remarks?: string;
};

export type OscalRelevantEvidence = {
  href?: string;
  description: string;
  props?: OscalProp[];
};

export type OscalObservation = {
  uuid: string;
  title?: string;
  description: string;
  methods: string[];
  collected?: string;
  props?: OscalProp[];
  "relevant-evidence"?: OscalRelevantEvidence[];
};

export type OscalObjectiveStatus = {
  /** OSCAL objective status is binary. mlassure's 5-valued status is preserved in a prop. */
  state: "satisfied" | "not-satisfied";
  reason?: string;
};

export type OscalFindingTarget = {
  type: "objective-id" | "statement-id";
  "target-id": string;
  status: OscalObjectiveStatus;
};

export type OscalRelatedObservation = {
  "observation-uuid": string;
};

export type OscalFinding = {
  uuid: string;
  title: string;
  description: string;
  props?: OscalProp[];
  target: OscalFindingTarget;
  "related-observations"?: OscalRelatedObservation[];
  /**
   * Human-visible note. Used to make the lossy 5-status → binary-state
   * projection loud in a field every OSCAL consumer renders, not only in a
   * custom prop. Critical for `not-applicable`, which OSCAL cannot express.
   */
  remarks?: string;
};

export type OscalControlSelection = {
  "include-controls"?: { "control-id": string }[];
};

export type OscalReviewedControls = {
  "control-selections": OscalControlSelection[];
};

export type OscalResult = {
  uuid: string;
  title: string;
  description: string;
  start: string;
  "reviewed-controls": OscalReviewedControls;
  observations?: OscalObservation[];
  findings?: OscalFinding[];
};

export type OscalAssessmentResults = {
  "assessment-results": {
    uuid: string;
    metadata: OscalMetadata;
    "import-ap": OscalImportAp;
    results: OscalResult[];
  };
};
