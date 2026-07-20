import { randomUUID } from "node:crypto";
import type { AssessmentReport, ControlResult } from "../runner/assessment-runner.js";
import type { ControlSet, Judgment } from "../types.js";
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

  const finding: OscalFinding = {
    uuid: randomUUID(),
    title: `${result.controlId}: ${j.status}`,
    description: j.rationale,
    props,
    target: {
      type: "objective-id",
      "target-id": result.controlId,
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
                  "control-id": r.controlId,
                })),
              },
            ],
          },
          observations,
          findings,
        },
      ],
    },
  };
}
