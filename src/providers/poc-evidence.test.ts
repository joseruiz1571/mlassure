import { describe, it, expect } from "bun:test";
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, mkdirSync, symlinkSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  pocEvidenceProvider,
  pocProviderFromDescriptor,
  readStreamRecord,
  POC_EVIDENCE_FAMILY,
  POC_WORDING,
  type StreamRecordPayload,
} from "./poc-evidence.js";
import { DIGEST_WIDTHS, SIGNATURE_ALGS, convertsExactly } from "./poc-evidence-rules.js";
import { catalogProblems, type EvidenceProvider } from "./evidence-provider.interface.js";
import { loadTarget } from "./target-loader.js";
import { awsSageMakerProvider } from "./aws-sagemaker.js";
import { FixtureProvider } from "./fixture-provider.js";
import {
  POC_CONTROLS_PATH,
  POC_TARGET,
  pocProvider,
  runPocFixture,
  scriptedSynthesisLlm,
  streamPath,
} from "./poc-evidence.testkit.js";
import { loadControlSet } from "../loaders/control-loader.js";
import { assessControl, ControlSetFamilyError } from "../agent/agent.js";
import { buildSystemPrompt, buildInitialMessage } from "../agent/prompts.js";
import { buildToolDefs, SUBMIT_JUDGMENT_TOOL } from "../tools/registry.js";
import { runAssessment } from "../runner/assessment-runner.js";
import { CitationError } from "../guard/citation-guard.js";
import type { LlmProvider } from "../llm/llm-provider.interface.js";
import type { ControlItem, Judgment, RawEvidence } from "../types.js";

const SCHEMA_PATH = "fixtures/schemas/poc-evidence.schema.json";
const PINNED_SCHEMA_SHA256 = "92fe52b1a7f177fafc5d489aa560f50782f3fe6b45aa705e0371495062c3f32c";
const PINNED_COMMIT = "22c7b625be459f5eee7dd8690afd080b5141b8c6";

const controlSet = await loadControlSet(POC_CONTROLS_PATH);
function control(id: string): ControlItem {
  const c = controlSet.controls.find((x) => x.id === id);
  if (!c) throw new Error(`fixture control set has no ${id}`);
  return c;
}

/** Any LLM call from a code-run control is a defect. */
const NO_LLM: LlmProvider = {
  async complete() {
    throw new Error("a code-run control called the LLM");
  },
};

async function records(provider: EvidenceProvider): Promise<StreamRecordPayload[]> {
  const result = (await provider.collect("getEvidenceRecords", POC_TARGET)) as RawEvidence[];
  return result.map((e) => e.payload as StreamRecordPayload);
}

function tempStream(lines: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "mlassure-poc-"));
  const path = join(dir, "stream.jsonl");
  writeFileSync(path, lines.map((l) => `${l}\n`).join(""), "utf-8");
  return path;
}

const cleanLines = readFileSync(streamPath("clean"), "utf-8").trimEnd().split("\n");

describe("ISC-M8b-3: the vendored Proof-of-Control schema is pinned", () => {
  const bytes = readFileSync(SCHEMA_PATH);

  it("is byte-identical to the standard's file at the pinned commit", () => {
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(PINNED_SCHEMA_SHA256);
  });

  it("a one-byte change breaks the pin", () => {
    const changed = Buffer.from(bytes);
    changed[changed.length - 2] = changed[changed.length - 2]! ^ 1;
    expect(createHash("sha256").update(changed).digest("hex")).not.toBe(PINNED_SCHEMA_SHA256);
  });

  it("records source, commit, license and sha256 beside it", () => {
    const notice = readFileSync("fixtures/schemas/poc-evidence.schema.NOTICE.md", "utf-8");
    for (const needle of [
      "https://github.com/LFDT-ProofOfControl/ov-poc-standard",
      "schema/poc-evidence.schema.json",
      PINNED_COMMIT,
      "Apache License, Version 2.0",
      PINNED_SCHEMA_SHA256,
    ]) {
      expect(notice).toContain(needle);
    }
  });

  it("the 7.7.3 tag table is the schema's own digest pattern", () => {
    const schema = JSON.parse(bytes.toString("utf-8")) as {
      $defs: { digest: { pattern: string } };
    };
    const rebuilt = `^(${Object.entries(DIGEST_WIDTHS)
      .map(([tag, width]) => `${tag}:[0-9a-f]{${width}}`)
      .join("|")})$`;
    expect(rebuilt).toBe(schema.$defs.digest.pattern);
    expect(SIGNATURE_ALGS).toContain("EdDSA");
  });
});

describe("poc-evidence provider", () => {
  it("offers a usable catalog and the family's own wording", () => {
    const provider = pocProvider("clean");
    expect(provider.family).toBe(POC_EVIDENCE_FAMILY);
    expect(Object.keys(provider.collectors).sort()).toEqual([
      "getEvidenceRecords",
      "getTrustAssumptionDisclosure",
    ]);
    expect(catalogProblems(provider)).toEqual([]);
    expect(provider.wording).toBe(POC_WORDING);
  });

  it("returns one evidence item per record, keeping the raw text of each line", async () => {
    const got = await records(pocProvider("clean"));
    expect(got.map((r) => r.recordIndex)).toEqual([0, 1, 2, 3]);
    expect(got.map((r) => r.rawText)).toEqual(cleanLines);
    expect(got.every((r) => r.outcome === "parsed")).toBe(true);
    expect(got[0]!.stream).toBe(streamPath("clean"));
  });

  it("fixture records are unsigned", async () => {
    for (const r of await records(pocProvider("clean"))) {
      expect(r.outcome === "parsed" && Object.hasOwn(r.token as object, "signature")).toBe(false);
    }
  });

  it("ISC-M8b-2: a duplicate key is reported with key, path and record index, never resolved", async () => {
    const [first] = await records(pocProvider("duplicate-key"));
    expect(first!.outcome).toBe("duplicate-key");
    expect(first).toMatchObject({ recordIndex: 0, duplicateKey: "verdict", duplicateKeyPath: "$.poc_claims" });
    expect(Object.hasOwn(first!, "token")).toBe(false);
    // What a last-wins reader does with the same bytes: accepts them, silently.
    const laundered = JSON.parse(first!.rawText) as { poc_claims: { verdict: string } };
    expect(laundered.poc_claims.verdict).toBe("ALLOW");
    expect(first!.rawText).toContain(`"verdict": "DENY"`); // the reading a first-wins parser keeps
  });

  it("an empty stream is zero records, not an error", async () => {
    expect(await records(pocProvider("empty"))).toEqual([]);
  });

  it("a line that is not JSON is a record with outcome invalid-json", async () => {
    const got = await records(pocProvider(tempStream([cleanLines[0]!, "{not json"])));
    expect(got.map((r) => r.outcome)).toEqual(["parsed", "invalid-json"]);
  });

  it("whitespace-only lines are skipped, counted, and never shift a record's index", async () => {
    const got = await records(pocProvider("blank-lines"));
    expect(got.map((r) => [r.recordIndex, r.line])).toEqual([
      [0, 1],
      [1, 2],
      [2, 4],
      [3, 5],
    ]);
    expect(got.every((r) => r.blankLinesSkipped === 3)).toBe(true);
    expect(got.map((r) => r.rawText)).toEqual(cleanLines);
  });

  it("a UTF-8 byte-order mark stays in rawText and is ignored for parsing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mlassure-bom-"));
    const path = join(dir, "bom.jsonl");
    writeFileSync(path, Buffer.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d]));
    const [only] = await records(pocProvider(path));
    expect(only!.rawText).toBe("﻿{}");
    expect(only!.outcome).toBe("parsed");
    expect(only!.outcome === "parsed" && only!.token).toEqual({});
  });

  it("every number's written form is kept beside the parsed token", async () => {
    const [first] = await records(pocProvider("lossy-number"));
    expect(first!.outcome === "parsed" && first!.numbers).toContainEqual({
      path: "$.iat",
      written: "1754400000.0000000001",
    });
  });

  it("the disclosure collector returns the document text, or null when none was supplied", async () => {
    const withIt = (await pocProvider("clean").collect("getTrustAssumptionDisclosure", POC_TARGET)) as RawEvidence;
    expect((withIt.payload as { text: string }).text).toContain("## Claim register");
    expect(await pocProvider("clean", false).collect("getTrustAssumptionDisclosure", POC_TARGET)).toBeNull();
  });

  it("refuses a stream path that is not a file, naming it", () => {
    expect(() =>
      pocEvidenceProvider({ stream: { path: "fixtures/targets/poc-evidence/nope.jsonl", label: "nope.jsonl" } })
    ).toThrow(`stream "nope.jsonl"`);
  });

  it("the guarded reader names what is missing instead of casting", () => {
    expect(readStreamRecord(null)).toEqual({ problems: ["payload"] });
    expect(readStreamRecord({ recordIndex: -1, outcome: "parsed", token: {} })).toEqual({ problems: ["recordIndex"] });
    expect(readStreamRecord({ recordIndex: 0, outcome: "parsed" })).toEqual({ problems: ["token"] });
    expect(readStreamRecord({ recordIndex: 0, outcome: "parsed", token: {} })).toEqual({ problems: ["numbers"] });
    expect(readStreamRecord({ recordIndex: 0, outcome: "resolved" })).toEqual({ problems: ["outcome"] });
  });
});

describe("target descriptors", () => {
  it("resolve stream and disclosure relative to the descriptor file", async () => {
    const { target, provider } = loadTarget("fixtures/targets/poc-stream-clean.json");
    expect(provider.family).toBe(POC_EVIDENCE_FAMILY);
    expect(target.modelName).toBe("reference-agent-evidence-stream");
    const got = await records(provider);
    expect(got).toHaveLength(4);
    expect(got[0]!.stream).toBe("poc-evidence/streams/clean.jsonl");
  });

  it("reject unknown fields and missing required ones", () => {
    const base = { family: "poc-evidence", modelName: "s", endpointName: "i", stream: "poc-evidence/streams/clean.jsonl" };
    const at = "fixtures/targets/x.json";
    expect(() => pocProviderFromDescriptor({ ...base, disclosur: "d.md" }, at)).toThrow("unknown field(s): disclosur");
    const { stream: _omit, ...noStream } = base;
    expect(() => pocProviderFromDescriptor(noStream, at)).toThrow(`missing a non-empty string "stream"`);
  });

  it("cannot name a file outside the descriptor's directory: ../, absolute path, or a symlink out", () => {
    const outside = mkdtempSync(join(tmpdir(), "mlassure-outside-"));
    writeFileSync(join(outside, "secret.jsonl"), "{}\n");
    const dir = mkdtempSync(join(tmpdir(), "mlassure-descriptor-"));
    mkdirSync(join(dir, "sub"));
    writeFileSync(join(dir, "sub", "ok.jsonl"), "{}\n");
    symlinkSync(join(outside, "secret.jsonl"), join(dir, "link.jsonl"));
    const at = join(dir, "t.json");
    const d = (stream: string, disclosure?: string) => ({
      family: "poc-evidence",
      modelName: "s",
      endpointName: "i",
      stream,
      ...(disclosure !== undefined ? { disclosure } : {}),
    });
    const rule = `must name a file inside the descriptor's directory`;

    expect(() => pocProviderFromDescriptor(d("../../package.json"), at)).toThrow(rule);
    // From the repo's own targets directory, where ../../package.json exists.
    expect(() => pocProviderFromDescriptor(d("../../package.json"), "fixtures/targets/x.json")).toThrow(
      `${rule}; "../../package.json" resolves to`
    );
    expect(() => pocProviderFromDescriptor(d(join(outside, "secret.jsonl")), at)).toThrow(`${rule}; "${join(outside, "secret.jsonl")}" is an absolute path`);
    expect(() => pocProviderFromDescriptor(d("link.jsonl"), at)).toThrow(`${rule}; "link.jsonl" resolves to`);
    expect(() => pocProviderFromDescriptor(d("sub/ok.jsonl", "../../package.json"), at)).toThrow(`"disclosure" ${rule}`);
    expect(pocProviderFromDescriptor(d("sub/ok.jsonl"), at).family).toBe(POC_EVIDENCE_FAMILY);
  });

  it("ISC-M8b-1: an absent family selects aws-sagemaker; an unknown one is an error naming it", () => {
    expect(loadTarget("fixtures/targets/model-clean.json").provider.family).toBe("aws-sagemaker");
    const dir = mkdtempSync(join(tmpdir(), "mlassure-target-"));
    const path = join(dir, "t.json");
    writeFileSync(path, JSON.stringify({ family: "poc-evidnce", modelName: "x", endpointName: "y" }));
    expect(() => loadTarget(path)).toThrow(`unknown family "poc-evidnce"`);
  });
});

/**
 * The verdict of each deterministic control on each fixture stream. Every
 * negative stream breaks one rule; where one fault is visible to two rules
 * (an untagged digest also fails the schema pattern), both are listed.
 */
const EXPECTED: Record<string, Record<string, Judgment["status"]>> = {
  //                            7.7.1                     7.7.3                     7.7.5                     7.6.2
  clean: { "PoC-7.7.1": "satisfied", "PoC-7.7.3": "satisfied", "PoC-7.7.5": "satisfied", "PoC-7.6.2": "satisfied" },
  empty: {
    "PoC-7.7.1": "insufficient-evidence",
    "PoC-7.7.3": "insufficient-evidence",
    "PoC-7.7.5": "insufficient-evidence",
    "PoC-7.6.2": "insufficient-evidence",
  },
  "step-gap": { "PoC-7.7.1": "satisfied", "PoC-7.7.3": "satisfied", "PoC-7.7.5": "satisfied", "PoC-7.6.2": "not-satisfied" },
  "step-repeat": { "PoC-7.7.1": "satisfied", "PoC-7.7.3": "satisfied", "PoC-7.7.5": "satisfied", "PoC-7.6.2": "not-satisfied" },
  "step-descending": { "PoC-7.7.1": "satisfied", "PoC-7.7.3": "satisfied", "PoC-7.7.5": "satisfied", "PoC-7.6.2": "not-satisfied" },
  "duplicate-key": {
    "PoC-7.7.1": "insufficient-evidence",
    "PoC-7.7.3": "insufficient-evidence",
    "PoC-7.7.5": "not-satisfied",
    "PoC-7.6.2": "insufficient-evidence",
  },
  "untagged-digest": { "PoC-7.7.1": "not-satisfied", "PoC-7.7.3": "not-satisfied", "PoC-7.7.5": "satisfied", "PoC-7.6.2": "satisfied" },
  "digest-alg-width-mismatch": { "PoC-7.7.1": "not-satisfied", "PoC-7.7.3": "not-satisfied", "PoC-7.7.5": "satisfied", "PoC-7.6.2": "satisfied" },
  "schema-invalid": { "PoC-7.7.1": "not-satisfied", "PoC-7.7.3": "satisfied", "PoC-7.7.5": "satisfied", "PoC-7.6.2": "satisfied" },
  "step-index-float": {
    "PoC-7.7.1": "satisfied", // 1.0 converts exactly; the schema alone judges it
    "PoC-7.7.3": "satisfied",
    "PoC-7.7.5": "satisfied",
    "PoC-7.6.2": "insufficient-evidence",
  },
  "lossy-number": {
    "PoC-7.7.1": "insufficient-evidence",
    "PoC-7.7.3": "satisfied",
    "PoC-7.7.5": "satisfied",
    "PoC-7.6.2": "satisfied",
  },
  "blank-lines": { "PoC-7.7.1": "satisfied", "PoC-7.7.3": "satisfied", "PoC-7.7.5": "satisfied", "PoC-7.6.2": "satisfied" },
};

const STREAMS_DIR = "fixtures/targets/poc-evidence/streams";

async function judge(id: string, stream: string) {
  return assessControl(control(id), POC_TARGET, pocProvider(stream), NO_LLM);
}

describe("deterministic Proof-of-Control controls (ISC-M8b-4 to -7)", () => {
  for (const [stream, row] of Object.entries(EXPECTED)) {
    for (const [id, status] of Object.entries(row)) {
      it(`${id} on ${stream}.jsonl → ${status}`, async () => {
        const result = await judge(id, stream);
        expect(result.judgment.status).toBe(status);
        expect(result.judgment.confidence).toBe("high");
        expect(result.iterations).toBe(0);
        expect([...result.calledCollectors]).toEqual(["getEvidenceRecords"]);
        for (const cited of result.judgment.evidenceCited) expect(result.store.has(cited)).toBe(true);
        if (status === "satisfied") {
          expect(result.judgment.evidenceCited).toHaveLength(result.store.size());
          expect(result.judgment.gaps).toEqual([]);
        } else {
          expect(result.judgment.gaps.length).toBeGreaterThan(0);
        }
      });
    }
  }

  it("the matrix and the streams on disk name the same set, in both directions", () => {
    const onDisk = readdirSync(STREAMS_DIR)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => f.slice(0, -".jsonl".length))
      .sort();
    const expected = Object.keys(EXPECTED).sort();
    // A stream on disk with no expectation, or an expectation with no stream, fails here.
    expect(onDisk.filter((s) => !expected.includes(s))).toEqual([]);
    expect(expected.filter((s) => !onDisk.includes(s))).toEqual([]);
    const readme = readFileSync("fixtures/targets/poc-evidence/README.md", "utf-8");
    for (const stream of onDisk) expect(readme).toContain(`${stream}.jsonl`);
  });

  it("ISC-M8b-4: 7.7.1 names the record and the failing schema path", async () => {
    const { judgment } = await judge("PoC-7.7.1", "schema-invalid");
    expect(judgment.rationale).toContain("record 0 fails the schema at /poc_claims");
    expect(judgment.rationale).toContain("policy_bundle_hash");
    expect(judgment.rationale).toContain("schema path #/required");
  });

  it("ISC-M8b-4: 7.7.1 on a line that is not JSON is not-satisfied", async () => {
    const r = await assessControl(control("PoC-7.7.1"), POC_TARGET, pocProvider(tempStream(["{not json"])), NO_LLM);
    expect(r.judgment.status).toBe("not-satisfied");
    expect(r.judgment.rationale).toContain("record 0 is not a JSON document");
  });

  it("ISC-M8b-5: 7.7.3 names the claim for an untagged digest and for a width mismatch", async () => {
    const untagged = await judge("PoC-7.7.3", "untagged-digest");
    expect(untagged.judgment.rationale).toContain(
      "record 0: poc_claims.chain_head is an untagged digest (no algorithm identifier)"
    );
    const width = await judge("PoC-7.7.3", "digest-alg-width-mismatch");
    expect(width.judgment.rationale).toContain(
      "record 0: poc_claims.chain_head is tagged sha-384, which implies 96 hex characters, but carries 64"
    );
  });

  it("ISC-M8b-5: 7.7.3 checks the sha-384 measurement and extension digests, and requires alg", async () => {
    const clean = await judge("PoC-7.7.3", "clean");
    expect(clean.judgment.rationale).toContain("(29 digests:"); // 4 records × (6 claims + measurement), plus dispatched_snapshot_hash
    expect(clean.judgment.rationale).toContain("Every claim recognised as a digest by name");
    const noAlg = cleanLines[0]!.replace(`"alg": "EdDSA",`, "");
    const md5 = cleanLines[0]!.replace(`"agbom_digest": "sha-256:`, `"agbom_digest": "md5:`);
    const ext = cleanLines[0]!.replace(`"reason":`, `"vendor_context_digest": "abc","reason":`);
    for (const [line, expected] of [
      [noAlg, "record 0: poc_claims.alg is absent"],
      [md5, `record 0: poc_claims.agbom_digest carries unrecognised algorithm tag "md5"`],
      [ext, "record 0: poc_claims.vendor_context_digest is an untagged digest"],
    ] as const) {
      expect(line).not.toBe(cleanLines[0]);
      const r = await assessControl(control("PoC-7.7.3"), POC_TARGET, pocProvider(tempStream([line])), NO_LLM);
      expect(r.judgment.status).toBe("not-satisfied");
      expect(r.judgment.rationale).toContain(expected);
    }
  });

  it("7.7.3 finds digests by name at any depth, top level and arrays included, naming the full path", async () => {
    const nested = cleanLines[0]!.replace(`"reason":`, `"ext": {"inner_hash": "abc"},"reason":`);
    const list = cleanLines[0]!.replace(`"reason":`, `"input_hashes": ["abc"],"reason":`);
    const top = cleanLines[0]!.replace(`"nonce":`, `"payload_hash": "abc","nonce":`);
    for (const [line, path] of [
      [nested, "poc_claims.ext.inner_hash"],
      [list, "poc_claims.input_hashes[0]"],
      [top, "payload_hash"],
    ] as const) {
      expect(line).not.toBe(cleanLines[0]);
      const r = await assessControl(control("PoC-7.7.3"), POC_TARGET, pocProvider(tempStream([line])), NO_LLM);
      expect(r.judgment.status).toBe("not-satisfied");
      expect(r.judgment.rationale).toContain(`record 0: ${path} is an untagged digest`);
    }
  });

  it("7.7.3 has no vacuous pass: a record with alg and no digest is insufficient-evidence", async () => {
    const line = JSON.stringify({ poc_claims: { alg: "EdDSA", step_index: 0 } });
    const r = await assessControl(control("PoC-7.7.3"), POC_TARGET, pocProvider(tempStream([line])), NO_LLM);
    expect(r.judgment.status).toBe("insufficient-evidence");
    expect(r.judgment.rationale).toContain("no claim recognised as a digest by name was found in the 1 records");
  });

  it("7.7.1: a number that does not survive conversion is insufficient-evidence, naming path and written form", async () => {
    for (const [from, to, path] of [
      [`"iat": 1754400000,`, `"iat": 1e-324,`, "$.iat written 1e-324"],
      [`"tree_size": 1,`, `"tree_size": 9007199254740993,`, "$.poc_claims.tree_size written 9007199254740993"],
    ] as const) {
      const line = cleanLines[0]!.replace(from, to);
      expect(line).not.toBe(cleanLines[0]);
      const r = await assessControl(control("PoC-7.7.1"), POC_TARGET, pocProvider(tempStream([line])), NO_LLM);
      expect(r.judgment.status).toBe("insufficient-evidence");
      expect(r.judgment.rationale).toContain(path);
    }
    const exact = cleanLines[0]!.replace(`"iat": 1754400000,`, `"iat": 1754400000.0,`);
    const r = await assessControl(control("PoC-7.7.1"), POC_TARGET, pocProvider(tempStream([exact])), NO_LLM);
    expect(r.judgment.status).toBe("satisfied"); // the schema alone judges an exact float
  });

  it("7.6.2 reads step_index only as plain decimal digits, naming the written form", async () => {
    for (const written of ["1.0", "1e0", "1e-324"]) {
      const lines = [...cleanLines];
      lines[2] = lines[2]!.replace(`"step_index": 1,`, `"step_index": ${written},`);
      const r = await assessControl(control("PoC-7.6.2"), POC_TARGET, pocProvider(tempStream(lines)), NO_LLM);
      expect(r.judgment.status).toBe("insufficient-evidence");
      expect(r.judgment.rationale).toContain(`record 2 writes poc_claims.step_index as ${written}, not as plain decimal digits`);
    }
  });

  it("7.6.2 names a step above 2^53 exactly", async () => {
    const lines = [...cleanLines];
    lines[2] = lines[2]!.replace(`"step_index": 1,`, `"step_index": 9007199254740993,`);
    const r = await assessControl(control("PoC-7.6.2"), POC_TARGET, pocProvider(tempStream(lines)), NO_LLM);
    expect(r.judgment.status).toBe("not-satisfied");
    expect(r.judgment.rationale).toContain(
      "record 2 has step_index 9007199254740993 where 1 was expected, so steps 1–9007199254740992 are missing"
    );
  });

  it("convertsExactly: exact values pass, underflow, overflow and precision loss fail", () => {
    for (const w of ["0", "-0", "1", "1.0", "1e0", "0.5", "1754400000.0", "9007199254740992", "1.5e3", "0.0e999"]) {
      expect([w, convertsExactly(w)]).toEqual([w, true]);
    }
    for (const w of ["1e-324", "1e400", "9007199254740993", "0.1", "1754400000.0000000001"]) {
      expect([w, convertsExactly(w)]).toEqual([w, false]);
    }
  });

  it("ISC-M8b-6: 7.7.5 names the key, its path and the record", async () => {
    const { judgment } = await judge("PoC-7.7.5", "duplicate-key");
    expect(judgment.rationale).toContain(`record 0 contains the object key "verdict" twice at $.poc_claims`);
  });

  it("ISC-M8b-7: 7.6.2 names the gap left by deleting one record", async () => {
    const { judgment } = await judge("PoC-7.6.2", "step-gap");
    expect(judgment.rationale).toContain(
      "agent did:web:example.org:agents:ref-1: record 2 has step_index 2 where 1 was expected, so step 1 is missing"
    );
  });

  it("ISC-M8b-7: 7.6.2 names a repeated and a descending index", async () => {
    expect((await judge("PoC-7.6.2", "step-repeat")).judgment.rationale).toContain("record 4 repeats step_index 2");
    expect((await judge("PoC-7.6.2", "step-descending")).judgment.rationale).toContain(
      "record 4 has step_index 1 after step_index 2, so the sequence descends"
    );
  });

  it("ISC-M8b-7: 7.6.2 on the clean stream reports each agent's range", async () => {
    const { judgment } = await judge("PoC-7.6.2", "clean");
    expect(judgment.rationale).toContain("did:web:example.org:agents:ref-1 0–2");
    expect(judgment.rationale).toContain("did:web:example.org:agents:ref-2 0–0");
  });

  it("a malformed collector payload is insufficient-evidence naming the field, not a verdict", async () => {
    const lying: EvidenceProvider = {
      ...pocProvider("clean"),
      async collect() {
        return [{ id: "ev-1", source: "poc", retrievedAt: "t", payload: { recordIndex: 0, outcome: "parsed" } }];
      },
    };
    const r = await assessControl(control("PoC-7.6.2"), POC_TARGET, lying, NO_LLM);
    expect(r.judgment.status).toBe("insufficient-evidence");
    expect(r.judgment.gaps.join(" ")).toContain("token");
  });
});

describe("ISC-M8b-8: PoC-7.3.2 is attestation", () => {
  it("returns insufficient-evidence with zero LLM calls and zero collector calls", async () => {
    const collected: string[] = [];
    const inner = pocProvider("clean");
    const counting: EvidenceProvider = {
      ...inner,
      async collect(name, target) {
        collected.push(name);
        return inner.collect(name, target);
      },
    };
    let llmCalls = 0;
    const llm: LlmProvider = {
      async complete() {
        llmCalls++;
        throw new Error("unreachable");
      },
    };
    const only = { ...controlSet, controls: [control("PoC-7.3.2")] };
    const report = await runAssessment(only, POC_TARGET, counting, llm);
    expect(report.results[0]!.judgment.status).toBe("insufficient-evidence");
    expect(llmCalls).toBe(0);
    expect(collected).toEqual([]);
    expect(report.results[0]!.judgment.rationale).toContain("automated collection from an evidence stream");
  });
});

describe("ISC-M8b-9: PoC-10.2 is synthesis over the disclosure", () => {
  it("runs the agent loop over the disclosure and the records and cites only retrieved evidence", async () => {
    const { llm, calls } = scriptedSynthesisLlm();
    const r = await assessControl(control("PoC-10.2"), POC_TARGET, pocProvider("clean"), llm);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.tools.map((t) => t.name)).toEqual([
      "getTrustAssumptionDisclosure",
      "getEvidenceRecords",
      "submit_judgment",
    ]);
    expect(r.judgment.status).toBe("satisfied");
    expect(r.judgment.evidenceCited).toHaveLength(5); // the disclosure + four records
    expect([...r.citedCollectors].sort()).toEqual(["getEvidenceRecords", "getTrustAssumptionDisclosure"]);
  });

  it("the citation guard rejects a phantom evidence id", async () => {
    const { llm } = scriptedSynthesisLlm((ids) => [...ids, "phantom-id"]);
    await expect(assessControl(control("PoC-10.2"), POC_TARGET, pocProvider("clean"), llm)).rejects.toBeInstanceOf(
      CitationError
    );
  });
});

/**
 * What the model is sent for this family, pinned like the SageMaker capture:
 * every control's system prompt and tool definitions, and the first message.
 */
function pocLlmInputs() {
  const provider = pocProvider("clean");
  const tools: Record<string, unknown> = {};
  const prompts: Record<string, string> = {};
  for (const c of controlSet.controls) {
    tools[c.id] = buildToolDefs(c.collectors, provider);
    prompts[c.id] = buildSystemPrompt(c, POC_WORDING);
  }
  return { tools, prompts, initial: buildInitialMessage(POC_TARGET, POC_WORDING), submit: SUBMIT_JUDGMENT_TOOL };
}

/** SageMaker vocabulary that must not reach a Proof-of-Control prompt or report. */
const FOREIGN = /AWS|SageMaker|endpoint|\bmodel\b/i;

describe("ISC-M8b-10: prompts are family-supplied", () => {
  it("the PoC capture matches the pinned file", () => {
    const pinned = JSON.parse(readFileSync("fixtures/parity/poc-llm-inputs.json", "utf-8")) as unknown;
    expect(pocLlmInputs() as unknown).toEqual(pinned);
  });

  it("no PoC prompt, tool description or first message carries SageMaker vocabulary", () => {
    const capture = JSON.stringify(pocLlmInputs());
    expect(capture.match(FOREIGN)).toBeNull();
  });

  it("the prompts actually sent in a PoC run use the family's wording", async () => {
    const { calls } = await runPocFixture();
    expect(calls.length).toBe(2);
    expect(calls[0]!.systemPrompt).toBe(buildSystemPrompt(control("PoC-10.2"), POC_WORDING));
    expect(JSON.stringify(calls[0]!.messages[0])).toContain("evidence stream");
    expect(JSON.stringify(calls.map((c) => [c.systemPrompt, c.tools, c.messages[0]])).match(FOREIGN)).toBeNull();
  });

  it("no code-generated rationale or gap on any fixture stream carries SageMaker vocabulary", async () => {
    for (const stream of Object.keys(EXPECTED)) {
      const { report } = await runPocFixture(stream);
      for (const r of report.results) {
        if (r.pattern === "synthesis") continue; // scripted model text, not code-generated
        expect(`${r.judgment.rationale} ${r.judgment.gaps.join(" ")}`.match(FOREIGN)).toBeNull();
      }
    }
  });
});

describe("control-set family (M8b preflight)", () => {
  it("a PoC control set against the SageMaker provider aborts before any control runs", async () => {
    const sagemaker = awsSageMakerProvider(new FixtureProvider("fixtures/targets/model-clean.json"));
    await expect(runAssessment(controlSet, POC_TARGET, sagemaker, NO_LLM)).rejects.toBeInstanceOf(
      ControlSetFamilyError
    );
  });

  it("a PoC run records its family on the report", async () => {
    const { report } = await runPocFixture();
    expect(report.family).toBe(POC_EVIDENCE_FAMILY);
    expect(report.results.map((r) => [r.controlId, r.judgment.status])).toEqual([
      ["PoC-7.7.1", "satisfied"],
      ["PoC-7.7.3", "satisfied"],
      ["PoC-7.7.5", "satisfied"],
      ["PoC-7.6.2", "satisfied"],
      ["PoC-7.3.2", "insufficient-evidence"],
      ["PoC-10.2", "satisfied"],
    ]);
  });
});
