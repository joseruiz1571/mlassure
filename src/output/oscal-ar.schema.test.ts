/**
 * Official-schema conformance (closes ISC-104 / TODO-oscal-validate).
 *
 * Validates generated Assessment Results documents against NIST's OWN
 * JSON Schema for OSCAL 1.1.2 — the external check the M2a advisor demanded
 * ("self-authored serializer + self-authored tests is a closed loop").
 *
 * The vendored schema's sha256 is pinned below: the file must remain
 * byte-identical to the official release asset
 * (github.com/usnistgov/OSCAL/releases/download/v1.1.2/oscal_assessment-results_schema.json).
 * Anyone "fixing" a conformance failure by editing the schema breaks the
 * pin — the same custody discipline the bundle layer enforces.
 */

import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { toOscalAssessmentResults } from "./oscal-ar.js";
import type { AssessmentReport, ControlResult } from "../runner/assessment-runner.js";
import type { ControlSet } from "../types.js";

const SCHEMA_PATH = join(
  import.meta.dir,
  "../../fixtures/schemas/oscal_assessment-results_schema-1.1.2.json"
);
const OFFICIAL_SCHEMA_SHA256 =
  "d033da70154cf6625ae46a746199e88e58f2928b1387dfac051d381b92f41b0d";

const schemaRaw = readFileSync(SCHEMA_PATH);
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
const validate = ajv.compile(JSON.parse(schemaRaw.toString("utf-8")));

function makeResult(overrides: Partial<ControlResult> = {}): ControlResult {
  return {
    controlId: "SI-6(1)",
    pattern: "synthesis",
    judgment: {
      controlId: "SI-6(1)",
      status: "satisfied",
      confidence: "high",
      rationale: "Data capture enabled and monitor scheduled.",
      evidenceCited: ["ev-1"],
      gaps: [],
    },
    evidenceCount: 1,
    iterations: 2,
    citedEvidence: [
      {
        id: "ev-1",
        source: "aws:sagemaker:describe-endpoint",
        sha256: "a".repeat(64),
        retrievedAt: "2026-07-23T00:00:00.000Z",
      },
    ],
    evidenceCoverage: 1,
    collectorsTagged: 1,
    collectorsCalled: 1,
    collectorsCited: 1,
    coverageConfidence: "high",
    ...overrides,
  };
}

function makeReport(results: ControlResult[]): AssessmentReport {
  return {
    targetName: "conformance-target",
    endpointName: "conformance-endpoint",
    controlSetVersion: "nist-subset-0.1.0",
    runAt: "2026-07-23T00:00:00.000Z",
    results,
  };
}

const CONTROL_SET: ControlSet = {
  version: "nist-subset-0.1.0",
  controls: [],
};

function expectConformant(report: AssessmentReport): void {
  const doc = toOscalAssessmentResults(report, CONTROL_SET);
  const valid = validate(JSON.parse(JSON.stringify(doc)));
  if (!valid) {
    throw new Error(
      `OSCAL AR document failed official 1.1.2 schema validation:\n` +
        JSON.stringify(validate.errors, null, 2)
    );
  }
}

describe("OSCAL AR official-schema conformance (ISC-104)", () => {
  it("vendored schema is byte-identical to the official NIST release asset", () => {
    expect(createHash("sha256").update(schemaRaw).digest("hex")).toBe(
      OFFICIAL_SCHEMA_SHA256
    );
  });

  it("happy-path document conforms", () => {
    expectConformant(makeReport([makeResult()]));
  });

  it("document with gaps and partially-satisfied status conforms", () => {
    expectConformant(
      makeReport([
        makeResult({
          judgment: {
            controlId: "AU-12(3)",
            status: "partially-satisfied",
            confidence: "medium",
            rationale: "Logging present, retention missing.",
            evidenceCited: ["ev-1"],
            gaps: ["No retention policy", "No log review cadence"],
          },
          controlId: "AU-12(3)",
        }),
      ])
    );
  });

  it("not-applicable and insufficient-evidence with zero evidence conform", () => {
    expectConformant(
      makeReport([
        makeResult({
          controlId: "SA-10",
          pattern: "attestation",
          judgment: {
            controlId: "SA-10",
            status: "insufficient-evidence",
            confidence: "high",
            rationale: "Requires human attestation.",
            evidenceCited: [],
            gaps: ["No reviewer sign-off artifact"],
          },
          citedEvidence: [],
          evidenceCount: 0,
        }),
        makeResult({
          controlId: "SC-99",
          judgment: {
            controlId: "SC-99",
            status: "not-applicable",
            confidence: "high",
            rationale: "Out of scope for this target.",
            evidenceCited: [],
            gaps: [],
          },
          citedEvidence: [],
        }),
      ])
    );
  });

  it("document with tag-provenance migration props conforms", () => {
    expectConformant(
      makeReport([
        makeResult({
          tagProvenance: [
            { pattern: "synthesis", assigned: "2026-06-10", rationale: "origin" },
            {
              pattern: "deterministic",
              assigned: "2026-07-19",
              supersedes: "synthesis",
              rationale: "code check landed",
            },
          ],
          pattern: "deterministic",
        }),
      ])
    );
  });

  it("multi-control document with mixed everything conforms", () => {
    expectConformant(
      makeReport([
        makeResult(),
        makeResult({
          controlId: "AC-6(9)",
          judgment: {
            controlId: "AC-6(9)",
            status: "not-satisfied",
            confidence: "low",
            rationale: "Role holds broad permissions.",
            evidenceCited: ["ev-1"],
            gaps: ["Wildcard IAM actions"],
          },
        }),
      ])
    );
  });
});
