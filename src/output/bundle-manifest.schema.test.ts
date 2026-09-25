/**
 * The manifest schema is the machine-readable half of SPEC.md §4
 * (Proof-of-Control C7.7.1: the claim set is defined by a published schema,
 * and the implementation's own output validates against it). This test is
 * what keeps SPEC.md, the schema, and the writer from drifting apart.
 */
import { describe, it, expect, afterAll } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { writeEvidenceBundle } from "./bundle.js";
import type { AssessmentReport, ControlResult } from "../runner/assessment-runner.js";

const schemaPath = join(import.meta.dir, "../../fixtures/schemas/bundle-manifest.schema.json");
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
const validate = ajv.compile(JSON.parse(readFileSync(schemaPath, "utf-8")));

const root = mkdtempSync(join(tmpdir(), "mlassure-manifest-schema-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function report(): AssessmentReport {
  const ev = {
    id: "00000000-0000-4000-8000-0000000000aa",
    source: "aws:sagemaker:describe-endpoint",
    retrievedAt: "2026-09-25T00:00:00.000Z",
    sha256: "a".repeat(64),
    payload: { k: "v" },
  };
  const result: ControlResult = {
    controlId: "SC-28",
    pattern: "deterministic",
    judgment: { controlId: "SC-28", status: "satisfied", confidence: "high", rationale: "ok", evidenceCited: [ev.id], gaps: [] },
    evidenceCount: 1,
    iterations: 0,
    citedEvidence: [{ id: ev.id, source: ev.source, sha256: ev.sha256, retrievedAt: ev.retrievedAt }],
    evidenceCoverage: 1,
    collectorsTagged: 1,
    collectorsCalled: 1,
    collectorsCited: 1,
    coverageConfidence: "high",
    retrievedEvidence: [ev],
  };
  return { targetName: "t", endpointName: "e", controlSetVersion: "cs-1", runAt: "2026-09-25T00:00:00.000Z", results: [result] };
}

describe("bundle manifest schema (M6, C7.7.1)", () => {
  it("the writer's own manifest validates against fixtures/schemas/bundle-manifest.schema.json", () => {
    const dir = join(root, "b1");
    writeEvidenceBundle(report(), dir, { createdAt: "2026-09-25T00:00:00.000Z", oscal: { x: 1 }, narrative: "# n" });
    const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf-8"));
    const ok = validate(manifest);
    expect(ok, JSON.stringify(validate.errors, null, 2)).toBe(true);
  });

  it("rejects what SPEC §4 forbids: extra members, uppercase hex, escaping paths, missing algorithm", () => {
    const dir = join(root, "b2");
    writeEvidenceBundle(report(), dir, { createdAt: "2026-09-25T00:00:00.000Z" });
    const good = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf-8"));
    const bad = [
      { ...good, extra: 1 },
      { ...good, rootHash: good.rootHash.toUpperCase() },
      { ...good, files: [{ ...good.files[0], path: "../x" }, ...good.files.slice(1)] },
      (() => { const { algorithm: _a, ...rest } = good; return rest; })(),
      { ...good, algorithm: "sha1" },
      { ...good, files: [] },
    ];
    for (const m of bad) expect(validate(m)).toBe(false);
  });
});
