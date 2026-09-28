/**
 * The Proof-of-Control family through the output layer (M8b): each control's
 * `notAssessed` reaches the narrative and the OSCAL finding, no SageMaker
 * wording reaches either, a nist-subset run gains nothing new, and a custody
 * bundle from a PoC run verifies under format 1.
 */
import { describe, it, expect, afterAll } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  runPocFixture,
  pocProvider,
  scriptedSynthesisLlm,
  POC_CONTROLS_PATH,
  POC_TARGET,
} from "../providers/poc-evidence.testkit.js";
import { loadControlSet } from "../loaders/control-loader.js";
import { runAssessment } from "../runner/assessment-runner.js";
import { awsSageMakerProvider } from "../providers/aws-sagemaker.js";
import { FixtureProvider } from "../providers/fixture-provider.js";
import type { LlmProvider } from "../llm/llm-provider.interface.js";
import { toNarrativeMarkdown } from "./narrative.js";
import { toOscalAssessmentResults } from "./oscal-ar.js";
import { writeEvidenceBundle, verifyEvidenceBundle, BUNDLE_FORMAT_VERSION } from "./bundle.js";

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

describe("ISC-M8b-11: every PoC control's notAssessed reaches both outputs", () => {
  it("each result carries its notAssessed, and the narrative and OSCAL finding render it", async () => {
    const { report, controlSet } = await runPocFixture();
    const narrative = toNarrativeMarkdown(report, controlSet);
    const oscal = toOscalAssessmentResults(report, controlSet);
    const findings = oscal["assessment-results"].results[0]!.findings ?? [];

    expect(controlSet.controls).toHaveLength(6);
    for (const c of controlSet.controls) {
      const text = c.notAssessed!;
      expect(text).toMatch(/^Requirements? \(quoted\): (10\.2\.1 )?"Verify that/);
      expect(text).toMatch(/did not assess|assessed none of it/);
      expect(c.note).toBeUndefined();
      const result = report.results.find((r) => r.controlId === c.id)!;
      expect(result.notAssessed).toBe(text);
      expect(narrative).toContain(`**Not assessed:** ${text}`);
      const finding = findings.find((f) => f.title.startsWith(`${c.id}:`))!;
      expect(finding.props!.filter((p) => p.name === "not-assessed").map((p) => p.value)).toEqual([text]);
    }
  });

  it("a PoC run's narrative and OSCAL carry no SageMaker wording", async () => {
    const { report, controlSet } = await runPocFixture();
    const narrative = toNarrativeMarkdown(report, controlSet);
    expect(narrative).toContain("cannot be determined from automated evidence collection under any circumstance");
    expect(narrative).toContain("**Target reference:** https://verifier.example/poc");
    expect(narrative).not.toMatch(/AWS|SageMaker|Endpoint/);
    expect(JSON.stringify(toOscalAssessmentResults(report, controlSet))).not.toMatch(/AWS|SageMaker|Endpoint/);
  });
});

/** Submits insufficient-evidence at once, citing nothing, for whichever control it is asked about. */
const INSTANT_LLM: LlmProvider = {
  async complete(params) {
    const controlId = /\nID: (.+)\n/.exec(params.systemPrompt)![1]!;
    return {
      stopReason: "tool_use",
      content: [
        {
          type: "tool_use",
          id: "tu-1",
          name: "submit_judgment",
          input: { controlId, status: "insufficient-evidence", confidence: "low", rationale: "scripted", evidenceCited: [], gaps: [] },
        },
      ],
    };
  },
};

/** Every finding prop name the OSCAL writer emitted before M8b. */
const PRE_M8B_PROPS = new Set([
  "source-control-id",
  "judgment-status",
  "confidence",
  "pattern",
  "evidence-coverage",
  "coverage-confidence",
  "gap",
  "pattern-assigned",
  "pattern-migration",
]);

describe("report wording follows the provider when the control file is silent", () => {
  it("PoC controls without `family:`, run on the PoC provider, still get family-neutral wording", async () => {
    const { family: _declared, ...silent } = await loadControlSet(POC_CONTROLS_PATH);
    expect(Object.hasOwn(silent, "family")).toBe(false);
    const { llm } = scriptedSynthesisLlm();
    const report = await runAssessment(silent, POC_TARGET, pocProvider("clean"), llm);
    expect(report.family).toBe("poc-evidence");
    const narrative = toNarrativeMarkdown(report, silent);
    expect(narrative).not.toMatch(/AWS|SageMaker|Endpoint/);
    expect(narrative).toContain("cannot be determined from automated evidence collection");
  });
});

describe("M8b adds nothing to a nist-subset run's outputs", () => {
  it("report, narrative and OSCAL carry no new key, prop or line", async () => {
    const controlSet = await loadControlSet("fixtures/controls/nist-subset.yaml");
    const provider = awsSageMakerProvider(new FixtureProvider("fixtures/targets/model-clean.json"));
    const report = await runAssessment(
      controlSet,
      { modelName: "fraud-detection-v2", endpointName: "fraud-detection-endpoint" },
      provider,
      INSTANT_LLM
    );

    expect(Object.hasOwn(report, "family")).toBe(false);
    for (const r of report.results) expect(Object.hasOwn(r, "notAssessed")).toBe(false);
    expect(JSON.stringify(report)).not.toContain("notAssessed");

    const narrative = toNarrativeMarkdown(report, controlSet);
    expect(narrative).not.toContain("Not assessed");
    expect(narrative).not.toContain("Target reference");
    expect(narrative).not.toContain("Deliberate insufficient-evidence case"); // SA-10's note stays unrendered
    expect(narrative).toContain("**Endpoint:** fraud-detection-endpoint  ");
    expect(narrative).toContain("cannot be determined from automated AWS evidence under any circumstance");

    const oscal = toOscalAssessmentResults(report, controlSet);
    const names = (oscal["assessment-results"].results[0]!.findings ?? []).flatMap((f) =>
      (f.props ?? []).map((p) => p.name)
    );
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(PRE_M8B_PROPS.has(name)).toBe(true);
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

const SCOPE =
  "Evidence scope: the stream and disclosure were supplied by the operator. Signatures were not verified, and production origin, completeness and selection were not assessed. These verdicts describe the files assessed; none says the system that produced them conforms to Proof-of-Control.";

describe("M8c: a Proof-of-Control report carries its own scope", () => {
  it("the report carries the evidence-scope sentence and each result its framework string", async () => {
    const { report, controlSet } = await runPocFixture();
    expect(report.evidenceScope).toBe(SCOPE);
    for (const c of controlSet.controls) {
      expect(report.results.find((r) => r.controlId === c.id)!.framework).toBe(c.framework);
    }
  });

  it("ISC-M8c-5: the narrative prints checked property and framework before the not-assessed line, and the scope once", async () => {
    const { report, controlSet } = await runPocFixture();
    const narrative = toNarrativeMarkdown(report, controlSet);
    expect(narrative.split(SCOPE)).toHaveLength(2); // exactly once
    expect(narrative.indexOf(SCOPE)).toBeLessThan(narrative.indexOf("## Summary"));
    for (const c of controlSet.controls) {
      const section = narrative.slice(narrative.indexOf(`## ${c.id}:`));
      const checked = section.indexOf(`**Checked:** ${c.intent.trim().replace(/\s+/g, " ")}`);
      const judged = section.indexOf(`**Judged against:** ${c.framework}`);
      const notAssessed = section.indexOf("**Not assessed:**");
      expect(checked).toBeGreaterThan(0);
      expect(judged).toBeGreaterThan(checked);
      expect(notAssessed).toBeGreaterThan(judged);
    }
  });

  it("ISC-M8c-6: every finding with notAssessed carries remarks, a satisfied one included, and the AR validates", async () => {
    const { report, controlSet } = await runPocFixture();
    const findings = toOscalAssessmentResults(report, controlSet)["assessment-results"].results[0]!.findings ?? [];
    for (const c of controlSet.controls) {
      const finding = findings.find((f) => f.title.startsWith(`${c.id}:`))!;
      expect(finding.remarks).toContain(`Not assessed: ${c.notAssessed!}`);
    }
    const satisfied = findings.find((f) => f.title === "PoC-7.7.5: satisfied")!;
    expect(satisfied.remarks).toBe(`Satisfied for the evidence assessed only. Not assessed: ${controlSet.controls.find((c) => c.id === "PoC-7.7.5")!.notAssessed!}`);
    const attestation = findings.find((f) => f.title.startsWith("PoC-7.3.2:"))!;
    // An existing verdict remark is kept, the not-assessed text added after it.
    expect(attestation.remarks).toStartWith("mlassure verdict: insufficient-evidence.");
    expect(attestation.remarks).toContain("\n\nNot assessed: ");
    // Schema validity of this document is asserted in oscal-ar.schema.test.ts (ISC-M8b-12), which renders the same run.
  });

  it("ISC-M8c-13: the OSCAL result carries the evidence scope in its description and remarks", async () => {
    const { report, controlSet } = await runPocFixture();
    const result = toOscalAssessmentResults(report, controlSet)["assessment-results"].results[0]!;
    expect(report.evidenceScope).toBe(SCOPE);
    expect(result.remarks).toBe(SCOPE);
    expect(result.description.endsWith(SCOPE)).toBe(true);
    expect(result.description.split(SCOPE)).toHaveLength(2);
    // Schema validity with these fields present is asserted in oscal-ar.schema.test.ts, which renders the same run.
  });

  it("a nist-subset run carries neither framework nor evidenceScope, and its findings no not-assessed remark", async () => {
    const controlSet = await loadControlSet("fixtures/controls/nist-subset.yaml");
    const provider = awsSageMakerProvider(new FixtureProvider("fixtures/targets/model-clean.json"));
    const report = await runAssessment(
      controlSet,
      { modelName: "fraud-detection-v2", endpointName: "fraud-detection-endpoint" },
      provider,
      INSTANT_LLM
    );
    expect(Object.hasOwn(report, "evidenceScope")).toBe(false);
    for (const r of report.results) expect(Object.hasOwn(r, "framework")).toBe(false);
    const narrative = toNarrativeMarkdown(report, controlSet);
    expect(narrative).not.toContain("**Checked:**");
    expect(narrative).not.toContain("Evidence scope");
    const sageMakerResult = toOscalAssessmentResults(report, controlSet)["assessment-results"].results[0]!;
    expect(Object.hasOwn(sageMakerResult, "remarks")).toBe(false);
    expect(sageMakerResult.description).toBe(
      "Agentic control assessment of fraud-detection-v2 (fraud-detection-endpoint) against control set " + controlSet.version + "."
    );
    const remarks = (toOscalAssessmentResults(report, controlSet)["assessment-results"].results[0]!.findings ?? []).map((f) => f.remarks ?? "");
    for (const r of remarks) expect(r).not.toContain("Not assessed");
  });
});
