import { describe, it, expect } from "bun:test";
import { toNarrativeMarkdown } from "./narrative.js";
import type { AssessmentReport } from "../runner/assessment-runner.js";

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
      {
        controlId: "SA-10",
        pattern: "attestation",
        judgment: {
          controlId: "SA-10",
          status: "insufficient-evidence",
          confidence: "low",
          rationale: "No change-control evidence reachable from AWS for this control.",
          evidenceCited: [],
          gaps: [],
        },
        evidenceCount: 0,
        iterations: 4,
        citedEvidence: [],
        evidenceCoverage: 1,
        collectorsTagged: 0,
        collectorsCalled: 0,
        collectorsCited: 0,
        coverageConfidence: "high",
      },
      {
        controlId: "SC-7",
        pattern: "deterministic",
        judgment: {
          controlId: "SC-7",
          status: "not-satisfied",
          confidence: "high",
          rationale: "Endpoint is not deployed inside a VPC; boundary protection is absent.",
          evidenceCited: ["ev-network"],
          gaps: [],
        },
        evidenceCount: 1,
        iterations: 2,
        citedEvidence: [
          {
            id: "ev-network",
            source: "aws:sagemaker:describe-endpoint-network-config",
            sha256: "d".repeat(64),
            retrievedAt: "2026-06-24T05:57:00.000Z",
          },
        ],
        evidenceCoverage: 1,
        collectorsTagged: 1,
        collectorsCalled: 1,
        collectorsCited: 1,
        coverageConfidence: "high",
      },
      {
        controlId: "AC-2",
        pattern: "sufficiency",
        judgment: {
          controlId: "AC-2",
          status: "not-applicable",
          confidence: "high",
          rationale: "Control governs human account lifecycle management; this target has no human user accounts.",
          evidenceCited: [],
          gaps: [],
        },
        evidenceCount: 0,
        iterations: 1,
        citedEvidence: [],
        evidenceCoverage: 0,
        collectorsTagged: 1,
        collectorsCalled: 1,
        collectorsCited: 0,
        coverageConfidence: "low",
      },
    ],
  };
}

describe("toNarrativeMarkdown — document header", () => {
  it("first line is a top-level heading containing the target name", () => {
    const md = toNarrativeMarkdown(sampleReport());
    const firstLine = md.split("\n")[0]!;
    expect(firstLine.startsWith("# ")).toBe(true);
    expect(firstLine).toContain("fraud-detector-v2");
  });

  it("header contains the run timestamp as ISO-8601", () => {
    const report = sampleReport();
    const md = toNarrativeMarkdown(report);
    expect(md).toContain(report.runAt);
    expect(() => new Date(report.runAt).toISOString()).not.toThrow();
  });
});

describe("toNarrativeMarkdown — per-control sections", () => {
  it("emits exactly one control heading per result", () => {
    const report = sampleReport();
    const md = toNarrativeMarkdown(report);
    const controlHeadings = md
      .split("\n")
      .filter((line) => line.startsWith("## ") && line.includes(": "));
    expect(controlHeadings).toHaveLength(report.results.length);
  });

  it("each control heading contains its controlId and judgment status", () => {
    const md = toNarrativeMarkdown(sampleReport());
    expect(md).toContain("## SI-6(1): ✓ Satisfied");
    expect(md).toContain("## AU-12(3): ~ Partially Satisfied");
    expect(md).toContain("## SA-10: ? Insufficient Evidence");
    expect(md).toContain("## SC-7: ✗ Not Satisfied");
    expect(md).toContain("## AC-2: - Not Applicable");
  });

  it("each section renders both confidence values and the rationale verbatim", () => {
    const md = toNarrativeMarkdown(sampleReport());
    expect(md).toContain("**Confidence (evidence coverage):** high");
    expect(md).toContain("Data capture enabled and ModelQuality monitor scheduled.");
    expect(md).toContain("**Confidence (evidence coverage):** medium");
    expect(md).toContain("Logging present but retention period not configured.");
  });
});

describe("toNarrativeMarkdown — confidence provenance label (M3c)", () => {
  it("ISC-259: model self-reported label for non-attestation patterns", () => {
    const md = toNarrativeMarkdown(sampleReport());
    const si6Section = md.split("## SI-6(1)")[1]!.split("## AU-12(3)")[0]!;
    expect(si6Section).toContain("**Confidence (model self-reported):** high");
  });

  it("ISC-258: code-determined label for attestation-pattern controls", () => {
    const md = toNarrativeMarkdown(sampleReport());
    const sa10Section = md.split("## SA-10")[1]!.split("## SC-7")[0]!;
    expect(sa10Section).toContain("**Confidence (code-determined, attestation pattern):** low");
    expect(sa10Section).not.toContain("model self-reported");
  });
});

describe("toNarrativeMarkdown — evidence rendering", () => {
  it("lists exactly one entry per cited evidence item, with id/source/sha256", () => {
    const md = toNarrativeMarkdown(sampleReport());
    expect(md).toContain("`ev-endpoint` — aws:sagemaker:describe-endpoint");
    expect(md).toContain(`sha256: \`${"a".repeat(64)}\``);
    expect(md).toContain("`ev-monitor` — aws:sagemaker:list-monitoring-schedules");
    expect(md).toContain(`sha256: \`${"b".repeat(64)}\``);
  });

  it("renders an explicit no-evidence statement when citedEvidence is empty", () => {
    const md = toNarrativeMarkdown(sampleReport());
    expect(md).toContain("_No evidence retrieved for this control._");
  });
});

describe("toNarrativeMarkdown — gaps and human attestation", () => {
  it("renders a Gaps subsection listing every gap when gaps is non-empty (M3c: heading no longer implies attestation)", () => {
    const md = toNarrativeMarkdown(sampleReport());
    expect(md).toContain("#### Gaps");
    expect(md).not.toContain("#### Gaps / Requires Human Attestation");
    expect(md).toContain("- No retention policy on audit logs");
  });

  it("does not render a Gaps subsection when gaps is empty", () => {
    const report = sampleReport();
    // SI-6(1) has no gaps.
    const md = toNarrativeMarkdown(report);
    const si6Section = md.split("## AU-12(3)")[0]!;
    expect(si6Section).not.toContain("#### Gaps");
  });

  it("ISC-256: renders the true human-attestation callout only for attestation-pattern insufficient-evidence", () => {
    const md = toNarrativeMarkdown(sampleReport());
    expect(md).toContain("**Requires human attestation.**");
    const sa10Section = md.split("## SA-10")[1]!;
    expect(sa10Section).toContain("Requires human attestation");
    const si6Section = md.split("## SI-6(1)")[1]!.split("## AU-12(3)")[0]!;
    expect(si6Section).not.toContain("Requires human attestation");
  });

  it("ISC-257/246: a non-attestation-pattern control reaching insufficient-evidence gets a distinct callout, never the attestation one", () => {
    const report: AssessmentReport = {
      targetName: "churn-predictor-v1",
      endpointName: "churn-predictor-endpoint",
      controlSetVersion: "nist-subset-1.0",
      runAt: "2026-07-19T00:00:00.000Z",
      results: [
        {
          controlId: "RA-3",
          pattern: "synthesis",
          judgment: {
            controlId: "RA-3",
            status: "insufficient-evidence",
            confidence: "high",
            rationale: "No model card evidence is retrievable for this target — nothing to synthesize.",
            evidenceCited: [],
            gaps: ["No model card artifact exists for this target."],
          },
          evidenceCount: 0,
          iterations: 2,
          citedEvidence: [],
          evidenceCoverage: 0,
          collectorsTagged: 1,
          collectorsCalled: 1,
          collectorsCited: 0,
          coverageConfidence: "low",
        },
      ],
    };
    const md = toNarrativeMarkdown(report);
    expect(md).toContain("**Insufficient evidence.**");
    // Case-insensitive and heading-inclusive: catches the true attestation callout
    // AND a stray "Gaps / Requires Human Attestation"-style heading, not just the
    // exact-case callout string (code-reviewer finding — a lowercase-only check
    // previously missed the capitalized gaps heading that said the same thing).
    expect(md.toLowerCase()).not.toContain("requires human attestation");
    expect(md).not.toContain("attestation` — conformance");
  });
});

describe("toNarrativeMarkdown — summary and anti-criteria", () => {
  it("includes a summary section with a count per status value", () => {
    const md = toNarrativeMarkdown(sampleReport());
    expect(md).toContain("## Summary");
    expect(md).toContain("- Satisfied: 1");
    expect(md).toContain("- Partially Satisfied: 1");
    expect(md).toContain("- Insufficient Evidence: 1");
    expect(md).toContain("- Not Satisfied: 1");
    expect(md).toContain("- Not Applicable: 1");
  });

  it("never renders an evidence id absent from that result's citedEvidence", () => {
    const report = sampleReport();
    const md = toNarrativeMarkdown(report);
    // AU-12(3) only cited ev-logs; ev-endpoint/ev-monitor must not appear in its section.
    const au12Section = md.split("## AU-12(3)")[1]!.split("## SA-10")[0]!;
    expect(au12Section).not.toContain("ev-endpoint");
    expect(au12Section).not.toContain("ev-monitor");
  });

  it("never labels a non-satisfied control as Satisfied in the rendered status", () => {
    const md = toNarrativeMarkdown(sampleReport());
    const headings = md.split("\n").filter((l) => l.startsWith("## ") && l.includes(": "));
    const nonSatisfiedIds = ["AU-12(3)", "SA-10", "SC-7", "AC-2"];
    for (const id of nonSatisfiedIds) {
      const heading = headings.find((l) => l.startsWith(`## ${id}`))!;
      // "Not Satisfied" itself contains the substring "Satisfied" — assert the
      // exact icon+label pair, not a loose substring match, so a regression that
      // mislabels "not-satisfied" as "✓ Satisfied" is actually caught.
      expect(heading).not.toContain(": ✓ Satisfied");
    }
    const sc7Heading = headings.find((l) => l.startsWith("## SC-7"))!;
    expect(sc7Heading).toBe("## SC-7: ✗ Not Satisfied");
  });
});

describe("toNarrativeMarkdown — hardening against malformed judgment data", () => {
  it("throws rather than silently rendering an unrecognized status", () => {
    const report = sampleReport();
    // @ts-expect-error — simulating an unvalidated/hallucinated status reaching the renderer
    report.results[0]!.judgment.status = "compliant";
    expect(() => toNarrativeMarkdown(report)).toThrow(/unrecognized judgment status/);
  });

  it("renders an explicit missing-rationale marker instead of a blank gap", () => {
    const report = sampleReport();
    report.results[0]!.judgment.rationale = "";
    const md = toNarrativeMarkdown(report);
    expect(md).toContain("[MISSING: agent did not provide a rationale");
  });

  it("renders an explicit missing-gap marker instead of a bare dash", () => {
    const report = sampleReport();
    report.results[1]!.judgment.gaps = [""];
    const md = toNarrativeMarkdown(report);
    expect(md).toContain("- **[MISSING: empty gap description from agent]**");
    expect(md).not.toContain("\n- \n");
  });

  it("falls back to an explicit UNKNOWN marker when controlSetVersion is absent and no controlSet is passed", () => {
    const report = sampleReport();
    // @ts-expect-error — simulating a malformed/hand-constructed report
    report.controlSetVersion = undefined;
    const md = toNarrativeMarkdown(report);
    expect(md).toContain("UNKNOWN (control set version not recorded)");
    expect(md).not.toContain("**Control set:** undefined");
  });
});

describe("toNarrativeMarkdown — confidence-as-coverage (M2c)", () => {
  it("renders both confidence values on two distinct lines for every control (label is pattern-aware as of M3c)", () => {
    const md = toNarrativeMarkdown(sampleReport());
    for (const id of ["SI-6(1)", "AU-12(3)", "SC-7", "AC-2"]) {
      const section = md.split(`## ${id}`)[1]!.split(/\n## /)[0]!;
      expect(section).toContain("**Confidence (evidence coverage):**");
      expect(section).toContain("**Confidence (model self-reported):**");
    }
    // SA-10 is attestation-pattern — its second line is labeled code-determined, not model self-reported.
    const sa10Section = md.split("## SA-10")[1]!.split(/\n## /)[0]!;
    expect(sa10Section).toContain("**Confidence (evidence coverage):**");
    expect(sa10Section).toContain("**Confidence (code-determined, attestation pattern):**");
  });

  it("never omits the self-reported line even when it matches the coverage value exactly", () => {
    const md = toNarrativeMarkdown(sampleReport());
    // SI-6(1): coverageConfidence "high", judgment.confidence "high" — identical values, both lines must still appear.
    const si6Section = md.split("## SI-6(1)")[1]!.split(/\n## /)[0]!;
    expect(si6Section).toContain("**Confidence (evidence coverage):** high");
    expect(si6Section).toContain("**Confidence (model self-reported):** high");
  });

  it("shows a real divergence when coverage and self-report disagree", () => {
    const md = toNarrativeMarkdown(sampleReport());
    // AC-2: coverageConfidence "low" (0/1 tagged collectors cited), judgment.confidence "high" (self-reported).
    const ac2Section = md.split("## AC-2")[1]!.split(/\n## /)[0]!;
    expect(ac2Section).toContain("**Confidence (evidence coverage):** low");
    expect(ac2Section).toContain("**Confidence (model self-reported):** high");
  });
});
