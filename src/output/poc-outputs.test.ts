/**
 * The Proof-of-Control family through the output layer (M8b): the control
 * note reaches the narrative and the OSCAL finding, no SageMaker wording
 * reaches either, and a custody bundle from a PoC run verifies under format 1.
 */
import { describe, it, expect, afterAll } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPocFixture } from "../providers/poc-evidence.testkit.js";
import { toNarrativeMarkdown } from "./narrative.js";
import { toOscalAssessmentResults } from "./oscal-ar.js";
import { writeEvidenceBundle, verifyEvidenceBundle, BUNDLE_FORMAT_VERSION } from "./bundle.js";

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

describe("ISC-M8b-11: every PoC control's note reaches both outputs", () => {
  it("each result carries its note, and the narrative and OSCAL finding render it", async () => {
    const { report, controlSet } = await runPocFixture();
    const narrative = toNarrativeMarkdown(report, controlSet);
    const oscal = toOscalAssessmentResults(report, controlSet);
    const findings = oscal["assessment-results"].results[0]!.findings ?? [];

    expect(controlSet.controls).toHaveLength(6);
    for (const c of controlSet.controls) {
      expect(c.note).toBeDefined();
      expect(c.note!).toMatch(/^Requirements? \(quoted\): (10\.2\.1 )?"Verify that/);
      expect(c.note!).toMatch(/did not assess|assessed none of it/);
      const result = report.results.find((r) => r.controlId === c.id)!;
      expect(result.controlNote).toBe(c.note!);
      expect(narrative).toContain(`**Control note:** ${c.note!}`);
      const finding = findings.find((f) => f.title.startsWith(`${c.id}:`))!;
      expect(finding.props!.filter((p) => p.name === "control-note").map((p) => p.value)).toEqual([c.note!]);
    }
  });

  it("the attestation callout for a PoC run does not name AWS", async () => {
    const { report, controlSet } = await runPocFixture();
    const narrative = toNarrativeMarkdown(report, controlSet);
    expect(narrative).toContain("cannot be determined from automated evidence collection under any circumstance");
    expect(narrative).not.toMatch(/AWS|SageMaker/);
    expect(JSON.stringify(toOscalAssessmentResults(report, controlSet))).not.toMatch(/AWS|SageMaker/);
  });

  it("a report without a family keeps the SageMaker callout wording", async () => {
    const { report, controlSet } = await runPocFixture();
    const { family: _family, ...legacy } = report;
    const { family: _f, ...legacySet } = controlSet;
    expect(toNarrativeMarkdown(legacy, legacySet)).toContain("cannot be determined from automated AWS evidence under any circumstance");
  });
});

describe("ISC-M8b-13: a bundle from a PoC run verifies, format still 1", () => {
  for (const stream of ["clean", "duplicate-key"]) {
    it(`${stream}.jsonl`, async () => {
      const { report, controlSet } = await runPocFixture(stream);
      const dir = join(mkdtempSync(join(tmpdir(), "mlassure-poc-bundle-")), "bundle");
      dirs.push(dir);
      const manifest = writeEvidenceBundle(report, dir, {
        oscal: toOscalAssessmentResults(report, controlSet),
        narrative: toNarrativeMarkdown(report, controlSet),
      });
      expect(BUNDLE_FORMAT_VERSION).toBe("1");
      expect(manifest.bundleFormatVersion).toBe("1");
      const verified = verifyEvidenceBundle(dir);
      expect(verified.errors).toEqual([]);
      expect(verified.ok).toBe(true);

      if (stream === "duplicate-key") {
        // Custody keeps the bytes that were judged: the record's raw text,
        // both readings included, is inside the bundle.
        const evidence = readdirSync(join(dir, "evidence")).map((f) =>
          readFileSync(join(dir, "evidence", f), "utf-8")
        );
        expect(evidence.some((e) => e.includes(`\\"verdict\\": \\"DENY\\"`) && e.includes(`\\"verdict\\": \\"ALLOW\\"`))).toBe(true);
      }
    });
  }
});
