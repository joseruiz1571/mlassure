import { describe, it, expect } from "bun:test";
import { toOscalAssessmentResults } from "./oscal-ar.js";
import { OSCAL_VERSION, MLASSURE_NS } from "./oscal-types.js";
import type { AssessmentReport } from "../runner/assessment-runner.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sampleReport(): AssessmentReport {
  return {
    targetName: "fraud-detector-v2",
    endpointName: "fraud-detector-v2-endpoint",
    controlSetVersion: "nist-subset-1.0",
    runAt: "2026-06-24T06:00:00.000Z",
    results: [
      {
        controlId: "SI-6(1)",
        pattern: "synthesis",
        judgment: {
          controlId: "SI-6(1)",
          status: "satisfied",
          confidence: "high",
          rationale: "Data capture enabled and ModelQuality monitor scheduled.",
          evidenceCited: ["ev-endpoint", "ev-monitor"],
          gaps: [],
        },
        evidenceCount: 3,
        iterations: 2,
        citedEvidence: [
          {
            id: "ev-endpoint",
            source: "aws:sagemaker:describe-endpoint",
            sha256: "a".repeat(64),
            retrievedAt: "2026-06-24T05:59:00.000Z",
          },
          {
            id: "ev-monitor",
            source: "aws:sagemaker:list-monitoring-schedules",
            sha256: "b".repeat(64),
            retrievedAt: "2026-06-24T05:59:30.000Z",
          },
        ],
        evidenceCoverage: 1,
        collectorsTagged: 2,
        collectorsCalled: 2,
        collectorsCited: 2,
        coverageConfidence: "high",
      },
      {
        controlId: "AU-12(3)",
        pattern: "correlation",
        judgment: {
          controlId: "AU-12(3)",
          status: "partially-satisfied",
          confidence: "medium",
          rationale: "Logging present but retention period not configured.",
          evidenceCited: ["ev-logs"],
          gaps: ["No retention policy on audit logs"],
        },
        evidenceCount: 1,
        iterations: 3,
        citedEvidence: [
          {
            id: "ev-logs",
            source: "aws:cloudwatch:describe-log-groups",
            sha256: "c".repeat(64),
            retrievedAt: "2026-06-24T05:58:00.000Z",
          },
        ],
        evidenceCoverage: 0.5,
        collectorsTagged: 2,
        collectorsCalled: 2,
        collectorsCited: 1,
        coverageConfidence: "medium",
      },
    ],
  };
}

describe("toOscalAssessmentResults — document structure", () => {
  it("has a single top-level assessment-results key with a valid uuid", () => {
    const doc = toOscalAssessmentResults(sampleReport());
    expect(Object.keys(doc)).toEqual(["assessment-results"]);
    expect(doc["assessment-results"].uuid).toMatch(UUID_RE);
  });

  it("metadata carries title, oscal-version, last-modified, version", () => {
    const ar = toOscalAssessmentResults(sampleReport())["assessment-results"];
    expect(ar.metadata.title).toContain("fraud-detector-v2");
    expect(ar.metadata["oscal-version"]).toBe(OSCAL_VERSION);
    expect(ar.metadata.version.length).toBeGreaterThan(0);
    expect(() => new Date(ar.metadata["last-modified"]).toISOString()).not.toThrow();
    expect(new Date(ar.metadata["last-modified"]).toISOString()).toBe(
      ar.metadata["last-modified"]
    );
  });

  it("includes the required import-ap key", () => {
    const ar = toOscalAssessmentResults(sampleReport())["assessment-results"];
    expect(ar).toHaveProperty("import-ap");
    expect(typeof ar["import-ap"].href).toBe("string");
  });

  it("emits exactly one result whose start equals report.runAt", () => {
    const report = sampleReport();
    const ar = toOscalAssessmentResults(report)["assessment-results"];
    expect(ar.results).toHaveLength(1);
    expect(ar.results[0]!.start).toBe(report.runAt);
    expect(ar.results[0]!.uuid).toMatch(UUID_RE);
  });
});

describe("toOscalAssessmentResults — findings", () => {
  it("emits one finding per control result, each with a valid uuid and target-id", () => {
    const report = sampleReport();
    const result = toOscalAssessmentResults(report)["assessment-results"].results[0]!;
    expect(result.findings).toHaveLength(report.results.length);
    const targetIds = result.findings!.map((f) => f.target["target-id"]).sort();
    expect(targetIds).toEqual(["AU-12(3)", "SI-6(1)"]);
    for (const f of result.findings!) {
      expect(f.uuid).toMatch(UUID_RE);
    }
  });

  it("maps status fail-closed: only 'satisfied' becomes OSCAL 'satisfied'", () => {
    const result = toOscalAssessmentResults(sampleReport())["assessment-results"]
      .results[0]!;
    const si6 = result.findings!.find((f) => f.target["target-id"] === "SI-6(1)")!;
    const au12 = result.findings!.find((f) => f.target["target-id"] === "AU-12(3)")!;
    expect(si6.target.status.state).toBe("satisfied");
    // partially-satisfied must NOT read as satisfied
    expect(au12.target.status.state).toBe("not-satisfied");
  });

  it("preserves the raw 5-value judgment status in a prop and the reason", () => {
    const result = toOscalAssessmentResults(sampleReport())["assessment-results"]
      .results[0]!;
    const au12 = result.findings!.find((f) => f.target["target-id"] === "AU-12(3)")!;
    const statusProp = au12.props!.find((p) => p.name === "judgment-status");
    expect(statusProp!.value).toBe("partially-satisfied");
    expect(statusProp!.ns).toBe(MLASSURE_NS);
    expect(au12.target.status.reason).toBe("partially-satisfied");
  });

  it("handles not-applicable explicitly: not-satisfied state, never satisfied, loud remarks", () => {
    const report = sampleReport();
    report.results[1]!.judgment.status = "not-applicable";
    report.results[1]!.judgment.gaps = [];
    const result = toOscalAssessmentResults(report)["assessment-results"].results[0]!;
    const au12 = result.findings!.find((f) => f.target["target-id"] === "AU-12(3)")!;
    // N/A must never read as satisfied, and the raw status is preserved.
    expect(au12.target.status.state).toBe("not-satisfied");
    expect(au12.props!.find((p) => p.name === "judgment-status")!.value).toBe(
      "not-applicable"
    );
    // The determination must be loud in a standard human-visible field.
    expect(au12.remarks).toBeDefined();
    expect(au12.remarks).toContain("NOT-APPLICABLE");
  });

  it("a satisfied finding carries no remarks; a non-satisfied finding does", () => {
    const result = toOscalAssessmentResults(sampleReport())["assessment-results"]
      .results[0]!;
    const si6 = result.findings!.find((f) => f.target["target-id"] === "SI-6(1)")!;
    const au12 = result.findings!.find((f) => f.target["target-id"] === "AU-12(3)")!;
    expect(si6.remarks).toBeUndefined();
    expect(au12.remarks).toBeDefined();
  });

  it("carries confidence and gaps as findings props, and rationale as description", () => {
    const result = toOscalAssessmentResults(sampleReport())["assessment-results"]
      .results[0]!;
    const au12 = result.findings!.find((f) => f.target["target-id"] === "AU-12(3)")!;
    expect(au12.props!.find((p) => p.name === "confidence")!.value).toBe("medium");
    expect(au12.props!.filter((p) => p.name === "gap").map((p) => p.value)).toEqual([
      "No retention policy on audit logs",
    ]);
    expect(au12.description).toContain("retention period not configured");
  });

  it("carries evidence-coverage and coverage-confidence as additive props alongside the unchanged self-reported confidence (M2c)", () => {
    const result = toOscalAssessmentResults(sampleReport())["assessment-results"]
      .results[0]!;
    const si6 = result.findings!.find((f) => f.target["target-id"] === "SI-6(1)")!;
    const au12 = result.findings!.find((f) => f.target["target-id"] === "AU-12(3)")!;
    expect(si6.props!.find((p) => p.name === "confidence")!.value).toBe("high");
    expect(si6.props!.find((p) => p.name === "evidence-coverage")!.value).toBe("1");
    expect(si6.props!.find((p) => p.name === "coverage-confidence")!.value).toBe("high");
    expect(au12.props!.find((p) => p.name === "confidence")!.value).toBe("medium");
    expect(au12.props!.find((p) => p.name === "evidence-coverage")!.value).toBe("0.5");
    expect(au12.props!.find((p) => p.name === "coverage-confidence")!.value).toBe("medium");
  });

  it("ISC-260: carries the raw pattern as an additive prop, for both attestation and non-attestation findings", () => {
    const report: AssessmentReport = {
      targetName: "fraud-detector-v2",
      endpointName: "fraud-detector-v2-endpoint",
      controlSetVersion: "nist-subset-1.0",
      runAt: "2026-06-24T06:00:00.000Z",
      results: [
        {
          controlId: "SA-10",
          pattern: "attestation",
          judgment: {
            controlId: "SA-10",
            status: "insufficient-evidence",
            confidence: "high",
            rationale:
              'This control\'s pattern is "attestation": conformance cannot be determined from automated AWS evidence collection under any circumstance, so no collectors were invoked and no LLM assessment was run.',
            evidenceCited: [],
            gaps: ["Requires human attestation — see the control's intent for the specific sign-off required."],
          },
          evidenceCount: 0,
          iterations: 0,
          citedEvidence: [],
          evidenceCoverage: 1,
          collectorsTagged: 0,
          collectorsCalled: 0,
          collectorsCited: 0,
          coverageConfidence: "high",
        },
      ],
    };
    const result = toOscalAssessmentResults(sampleReport())["assessment-results"].results[0]!;
    const si6 = result.findings!.find((f) => f.target["target-id"] === "SI-6(1)")!;
    expect(si6.props!.find((p) => p.name === "pattern")!.value).toBe("synthesis");

    const attestationResult = toOscalAssessmentResults(report)["assessment-results"].results[0]!;
    const sa10 = attestationResult.findings!.find((f) => f.target["target-id"] === "SA-10")!;
    expect(sa10.props!.find((p) => p.name === "pattern")!.value).toBe("attestation");
    // "confidence" is still emitted, but a consumer must check "pattern" to know
    // this one is code-determined, not the model's self-report.
    expect(sa10.props!.find((p) => p.name === "confidence")!.value).toBe("high");
  });
});

describe("toOscalAssessmentResults — observations and provenance", () => {
  it("emits one observation per cited evidence item across all controls", () => {
    const report = sampleReport();
    const result = toOscalAssessmentResults(report)["assessment-results"].results[0]!;
    const totalCited = report.results.reduce(
      (n, r) => n + r.citedEvidence.length,
      0
    );
    expect(result.observations).toHaveLength(totalCited);
    for (const o of result.observations!) {
      expect(o.uuid).toMatch(UUID_RE);
      expect(o.methods.length).toBeGreaterThan(0);
    }
  });

  it("carries the sha256 of every cited evidence item as an observation prop", () => {
    const result = toOscalAssessmentResults(sampleReport())["assessment-results"]
      .results[0]!;
    const hashes = result
      .observations!.map((o) => o.props!.find((p) => p.name === "sha256")!.value)
      .sort();
    expect(hashes).toEqual(["a".repeat(64), "b".repeat(64), "c".repeat(64)]);
  });

  it("sets observation.collected to the evidence retrievedAt", () => {
    const result = toOscalAssessmentResults(sampleReport())["assessment-results"]
      .results[0]!;
    const collected = result.observations!.map((o) => o.collected).sort();
    expect(collected).toEqual([
      "2026-06-24T05:58:00.000Z",
      "2026-06-24T05:59:00.000Z",
      "2026-06-24T05:59:30.000Z",
    ]);
  });

  it("links each finding to observations whose uuids all resolve in the result", () => {
    const result = toOscalAssessmentResults(sampleReport())["assessment-results"]
      .results[0]!;
    const obsUuids = new Set(result.observations!.map((o) => o.uuid));
    for (const f of result.findings!) {
      for (const ro of f["related-observations"] ?? []) {
        expect(obsUuids.has(ro["observation-uuid"])).toBe(true);
      }
    }
    // SI-6(1) cited two evidence items → two related observations
    const si6 = result.findings!.find((f) => f.target["target-id"] === "SI-6(1)")!;
    expect(si6["related-observations"]).toHaveLength(2);
  });

  it("never fabricates an observation: observation count equals cited count exactly", () => {
    const report = sampleReport();
    // Drop one control's citations entirely; observations must drop with it.
    report.results[1]!.citedEvidence = [];
    report.results[1]!.judgment.evidenceCited = [];
    const result = toOscalAssessmentResults(report)["assessment-results"].results[0]!;
    expect(result.observations).toHaveLength(2); // only SI-6(1)'s two remain
    const au12 = result.findings!.find((f) => f.target["target-id"] === "AU-12(3)")!;
    expect(au12["related-observations"] ?? []).toHaveLength(0);
  });

  it("round-trips through JSON without structural loss", () => {
    const doc = toOscalAssessmentResults(sampleReport());
    const round = JSON.parse(JSON.stringify(doc));
    expect(round).toEqual(doc);
  });
});
