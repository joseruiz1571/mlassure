import { randomUUID } from "node:crypto";
import type { AssessmentReport, ControlResult } from "../runner/assessment-runner.js";
import type { ControlSet, Judgment } from "../types.js";
import { assertProvenanceShape } from "../types.js";
import {
  OSCAL_VERSION,
  MLASSURE_NS,
  type OscalAssessmentResults,
  type OscalFinding,
  type OscalObservation,
  type OscalProp,
} from "./oscal-types.js";

/**
 * OSCAL objective status is binary (`satisfied` | `not-satisfied`), but
 * mlassure renders a 5-valued judgment. The mapping is deliberately
 * FAIL-CLOSED: only a literal `satisfied` judgment maps to OSCAL `satisfied`.
 * Every other status — including `partially-satisfied` and
 * `insufficient-evidence` — maps to `not-satisfied`, so the OSCAL consumer is
 * never told a control passed unless mlassure unambiguously said so. The full
 * 5-value precision is preserved in the `judgment-status` prop (no information
 * is destroyed by the projection).
 *
 * `not-applicable` is the sharp edge: it is a definite out-of-scope
 * determination, NOT a failure, but OSCAL's binary state cannot express it.
 * We project it to `not-satisfied` (never `satisfied` — that would assert
 * compliance for something not assessed) and attach a loud `remarks` on the
 * finding so no consumer reading the standard fields mistakes it for a control
 * that was tested and failed. See `findingRemarks`.
 */
function toObjectiveState(status: Judgment["status"]): "satisfied" | "not-satisfied" {
  return status === "satisfied" ? "satisfied" : "not-satisfied";
}

/**
 * When the binary OSCAL state diverges from mlassure's nuanced verdict, return
 * a human-readable remark making the real determination unmistakable in a field
 * every OSCAL renderer shows. `satisfied` judgments need no remark.
 */
function findingRemarks(status: Judgment["status"]): string | undefined {
  if (status === "satisfied") return undefined;
  if (status === "not-applicable") {
    return (
      "mlassure determined this control NOT-APPLICABLE to the target. " +
      "OSCAL objective status is binary and cannot represent N/A; it is " +
      "recorded as not-satisfied to avoid asserting compliance, but this is " +
      "an out-of-scope determination, not a control failure. " +
      "See the judgment-status prop."
    );
  }
  return (
    `mlassure verdict: ${status}. OSCAL objective status is binary; this ` +
    `verdict is projected to not-satisfied. See the judgment-status prop.`
  );
}

/**
 * OSCAL token datatypes forbid parentheses, so the SP 800-53 print form
 * "SI-6(1)" is not a legal control-id — NIST's own catalogs write it
 * "si-6.1" (lowercase, dotted enhancement). Found by validating against the
 * official 1.1.2 schema (ISC-104): our 40+ self-authored OSCAL tests never
 * caught it, which is exactly why the external check exists. Fail-loud when
 * the mapped id still isn't a valid token — never emit a known-invalid id.
 * The raw print-form id is preserved on each finding as a
 * `source-control-id` prop (prop VALUES are free strings).
 */
export function toOscalControlId(controlId: string): string {
  const mapped = controlId.toLowerCase().replace(/\((\d+)\)/g, ".$1");
  if (!/^(\p{L}|_)(\p{L}|\p{N}|[.\-_])*$/u.test(mapped)) {
    throw new Error(
      `toOscalControlId: "${controlId}" maps to "${mapped}", which is not a valid OSCAL token — refusing to emit a schema-invalid control-id.`
    );
  }
  return mapped;
}

function buildObservations(result: ControlResult): OscalObservation[] {
  return result.citedEvidence.map((ev) => ({
    uuid: randomUUID(),
    title: `Evidence ${ev.id}`,
    description: `Collected from ${ev.source} for control ${result.controlId}.`,
    // Configuration evidence is gathered by examination of the target's state.
    methods: ["EXAMINE"],
    collected: ev.retrievedAt,
    props: [
      { name: "sha256", value: ev.sha256, ns: MLASSURE_NS },
      { name: "evidence-id", value: ev.id, ns: MLASSURE_NS },
    ],
  }));
}

function buildFinding(
  result: ControlResult,
  observationUuids: string[]
): OscalFinding {
  const j = result.judgment;
  const props: OscalProp[] = [
    // The raw SP 800-53 print-form id ("SI-6(1)") — target-id below carries
    // the OSCAL token form ("si-6.1"); this prop keeps the two linkable.
    { name: "source-control-id", value: result.controlId, ns: MLASSURE_NS },
    { name: "judgment-status", value: j.status, ns: MLASSURE_NS },
    // "confidence" is the model's self-report for every pattern EXCEPT the
    // code-determined ones (`attestation` M3b, `deterministic` M3d — see
    // `isCodeDetermined` in types.ts), whose judgment is code-generated —
    // the "pattern" prop below lets a machine consumer derive that exception
    // rather than trusting this field's provenance blindly.
    // coverage-confidence is the deterministic value (M2c) — additive, never a replacement.
    { name: "confidence", value: j.confidence, ns: MLASSURE_NS },
    { name: "pattern", value: result.pattern, ns: MLASSURE_NS },
    { name: "evidence-coverage", value: String(result.evidenceCoverage), ns: MLASSURE_NS },
    { name: "coverage-confidence", value: result.coverageConfidence, ns: MLASSURE_NS },
  ];
  for (const gap of j.gaps) {
    props.push({ name: "gap", value: gap, ns: MLASSURE_NS });
  }

  // Tag provenance (M3f) — strictly additive: a provenance-free control set
  // produces byte-identical props to pre-M3f output. `pattern-assigned` is
  // the date the CURRENT tag (the history head) was assigned; each migration
  // gets one `pattern-migration` prop, emitted in stable chronological order
  // (array order is loader-validated), value encoding from→to@date so a
  // consumer keying multiple same-name props can still distinguish them.
  // undefined = legitimately absent (zero new props). Anything PRESENT is
  // shape-asserted first: an empty array or broken supersedes chain means
  // loader invariants were bypassed, and silently normalizing that to
  // "absent" (or serializing "undefined→x") would corrupt the artifact.
  if (result.tagProvenance !== undefined) {
    assertProvenanceShape(result.tagProvenance, result.controlId);
    const head = result.tagProvenance[result.tagProvenance.length - 1]!;
    props.push({ name: "pattern-assigned", value: head.assigned, ns: MLASSURE_NS });
    for (const rec of result.tagProvenance.slice(1)) {
      props.push({
        name: "pattern-migration",
        value: `${rec.supersedes}→${rec.pattern}@${rec.assigned}`,
        ns: MLASSURE_NS,
      });
    }
  }

  const finding: OscalFinding = {
    uuid: randomUUID(),
    title: `${result.controlId}: ${j.status}`,
    description: j.rationale,
    props,
    target: {
      // Known simplification, disclosed rather than faked: mlassure assesses
      // at CONTROL granularity, so target-id carries the catalog control id
      // ("si-6.1"), not a true per-objective id ("si-6.1_obj.N" — those live
      // in a catalog/AP join this tool doesn't perform). "objective-id" is
      // the closer of the two schema-allowed target types. A future
      // catalog-join slice could emit real objective ids.
      type: "objective-id",
      "target-id": toOscalControlId(result.controlId),
      status: {
        state: toObjectiveState(j.status),
        // Preserve the precise mlassure verdict the binary state cannot express.
        reason: j.status,
      },
    },
  };

  if (observationUuids.length > 0) {
    finding["related-observations"] = observationUuids.map((uuid) => ({
      "observation-uuid": uuid,
    }));
  }

  const remarks = findingRemarks(j.status);
  if (remarks) {
    finding.remarks = remarks;
  }

  return finding;
}

/**
 * Serialize an mlassure {@link AssessmentReport} into an OSCAL Assessment
 * Results document. Pure function — no I/O, no clock reads beyond the report's
 * own `runAt` for the result `start`. The optional `controlSet` only enriches
 * the document title; the report alone is sufficient.
 */
export function toOscalAssessmentResults(
  report: AssessmentReport,
  controlSet?: ControlSet
): OscalAssessmentResults {
  const observations: OscalObservation[] = [];
  const findings: OscalFinding[] = [];

  for (const result of report.results) {
    const obs = buildObservations(result);
    observations.push(...obs);
    findings.push(buildFinding(result, obs.map((o) => o.uuid)));
  }

  const controlSetLabel = controlSet?.version ?? report.controlSetVersion;
  const nowIso = new Date().toISOString();

  return {
    "assessment-results": {
      uuid: randomUUID(),
      metadata: {
        title: `mlassure Assessment Results — ${report.targetName}`,
        "last-modified": nowIso,
        version: "0.1.0",
        "oscal-version": OSCAL_VERSION,
      },
      // Required by the OSCAL AR schema. mlassure emits no assessment-plan, so
      // this is an empty same-document reference; AP linkage is a follow-up.
      "import-ap": {
        href: "",
        remarks:
          "No assessment plan; results generated directly by mlassure. " +
          "import-ap is schema-required, so an empty same-document reference is used.",
      },
      results: [
        {
          uuid: randomUUID(),
          title: `mlassure run ${report.runAt}`,
          description:
            `Agentic control assessment of ${report.targetName} ` +
            `(${report.endpointName}) against control set ${controlSetLabel}.`,
          start: report.runAt,
          "reviewed-controls": {
            "control-selections": [
              {
                "include-controls": report.results.map((r) => ({
                  "control-id": toOscalControlId(r.controlId),
                })),
              },
            ],
          },
          // The AR schema requires minItems 1 — a run whose controls cited no
          // evidence must OMIT the key, not emit an empty array (ISC-104).
          ...(observations.length > 0 ? { observations } : {}),
          findings,
        },
      ],
    },
  };
}
