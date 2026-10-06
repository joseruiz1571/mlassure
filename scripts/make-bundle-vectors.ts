#!/usr/bin/env bun
/**
 * Conformance-vector generator for the custody bundle format (M6, SPEC §7).
 *
 *   bun scripts/make-bundle-vectors.ts
 *
 * Deletes and regenerates `fixtures/bundles/positive/` and
 * `fixtures/bundles/negative/`. Everything that could vary between runs is
 * pinned — `createdAt`, `runAt`, `retrievedAt`, evidence UUIDs, report
 * content — so two runs produce byte-identical trees and a regeneration
 * shows up in `git diff` only when a vector actually changed.
 * (`fixtures/bundles/README.md` is hand-written and is left alone.)
 *
 * The positive vector is written by the real `writeEvidenceBundle`, so it is
 * a genuine writer output, not a hand-rolled imitation. Each negative vector
 * is a byte copy of that positive bundle with exactly ONE fault applied to
 * the bytes on disk. Where a fault changes something the root hash covers,
 * the root hash is recomputed with the exported `computeRootHash` so that
 * only the named check fires and the vector cannot pass for the wrong reason.
 *
 * Every vector's `errorPattern` is checked against the reference verifier's
 * real output before this script exits: a pattern that does not match a real
 * error is a hard failure here, not a surprise in the test suite.
 *
 * Layout note (SPEC §7): `negative/<name>/` IS the bundle directory, and its
 * expectation file sits BESIDE it as `negative/<name>.EXPECTED.json`. It
 * cannot live inside the bundle: V-12 admits no junk-file allowlist, so a
 * stray EXPECTED.json inside a vector would add an "unaccounted file"
 * violation to every negative vector and destroy the one-fault property.
 */

import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import {
  computeRootHash,
  verifyEvidenceBundle,
  writeEvidenceBundle,
  type BundleManifest,
  type ManifestMeta,
} from "../src/output/bundle.js";
import type { AssessmentReport, ControlResult } from "../src/runner/assessment-runner.js";
import type { Evidence } from "../src/types.js";

// ---------------------------------------------------------------------------
// Fixed inputs. Nothing here reads the clock, the filesystem, or randomUUID.
// ---------------------------------------------------------------------------

const REPO_ROOT = join(dirname(import.meta.dir));
const VECTORS_DIR = join(REPO_ROOT, "fixtures", "bundles");
const POSITIVE_DIR = join(VECTORS_DIR, "positive");
const NEGATIVE_DIR = join(VECTORS_DIR, "negative");
const POSITIVE_NAME = "fraud-detection-v2-clean";

const CREATED_AT = "2026-09-25T00:00:00.000Z";
const RUN_AT = "2026-09-25T00:00:00.000Z";
const RETRIEVED_AT = "2026-09-25T00:00:00.000Z";
const TARGET_NAME = "fraud-detection-v2";
const CONTROL_SET_VERSION = "nist-subset-1.0";

/** Fixed evidence ids — the bundle uses these as filenames (SPEC §3.2). */
const EV_ID_1 = "00000000-0000-4000-8000-000000000001";
const EV_ID_2 = "00000000-0000-4000-8000-000000000002";
const EV_ID_3 = "00000000-0000-4000-8000-000000000003";

function sha256Hex(buf: Uint8Array | string): string {
  return createHash("sha256").update(buf).digest("hex");
}

function evidence(id: string, source: string, payload: unknown): Evidence {
  return {
    id,
    source,
    retrievedAt: RETRIEVED_AT,
    // Content hash as computed at ingest — derived from the fixed payload, so
    // it is a real digest and still identical on every regeneration.
    sha256: sha256Hex(JSON.stringify(payload)),
    payload,
  };
}

function buildReport(): AssessmentReport {
  const ev1 = evidence(EV_ID_1, "aws:sagemaker:describe-endpoint", {
    EndpointName: "fraud-detection-v2-prod",
    EndpointStatus: "InService",
    DataCaptureConfig: { EnableCapture: true, InitialSamplingPercentage: 100 },
  });
  const ev2 = evidence(EV_ID_2, "aws:sagemaker:describe-monitoring-schedule", {
    MonitoringScheduleName: "fraud-detection-v2-model-quality",
    MonitoringScheduleStatus: "Scheduled",
    ScheduleExpression: "cron(0 * ? * * *)",
  });
  const ev3 = evidence(EV_ID_3, "aws:iam:get-role", {
    RoleName: "fraud-detection-v2-execution",
    AssumeRolePolicyDocument: { Version: "2012-10-17", Statement: [] },
  });

  const si6: ControlResult = {
    controlId: "SI-6(1)",
    controlIntent:
      "The model's outputs are monitored on a schedule and deviations are surfaced for review.",
    pattern: "synthesis",
    judgment: {
      controlId: "SI-6(1)",
      status: "satisfied",
      confidence: "high",
      rationale:
        "Data capture is enabled at 100 percent and an hourly model-quality monitoring schedule is Scheduled against the InService endpoint.",
      evidenceCited: [EV_ID_1, EV_ID_2],
      gaps: [],
    },
    evidenceCount: 2,
    iterations: 2,
    citedEvidence: [
      { id: ev1.id, source: ev1.source, sha256: ev1.sha256, retrievedAt: ev1.retrievedAt },
      { id: ev2.id, source: ev2.source, sha256: ev2.sha256, retrievedAt: ev2.retrievedAt },
    ],
    evidenceCoverage: 1,
    collectorsTagged: 2,
    collectorsCalled: 2,
    collectorsCited: 2,
    coverageConfidence: "high",
    retrievedEvidence: [ev1, ev2],
  };

  // A second control whose retrieved evidence was NOT cited — custody covers
  // what the assessor saw, not only what it used (SPEC §2).
  const ac6: ControlResult = {
    controlId: "AC-6(1)",
    controlIntent: "The endpoint's execution role grants no more privilege than it needs.",
    pattern: "sufficiency",
    judgment: {
      controlId: "AC-6(1)",
      status: "insufficient-evidence",
      confidence: "low",
      rationale:
        "The execution role was retrieved but its attached policies were not, so least privilege cannot be judged.",
      evidenceCited: [],
      gaps: ["attached and inline policy documents for the execution role"],
    },
    evidenceCount: 1,
    iterations: 1,
    citedEvidence: [],
    evidenceCoverage: 0,
    collectorsTagged: 2,
    collectorsCalled: 1,
    collectorsCited: 0,
    coverageConfidence: "low",
    retrievedEvidence: [ev3],
  };

  return {
    targetName: TARGET_NAME,
    endpointName: "fraud-detection-v2-prod",
    controlSetVersion: CONTROL_SET_VERSION,
    runAt: RUN_AT,
    results: [si6, ac6],
    llmModel: "claude-sonnet-4-6",
    llmTemperature: 0.1,
  };
}

const OSCAL_DOC = {
  "assessment-results": {
    uuid: "00000000-0000-4000-8000-00000000a001",
    metadata: {
      title: `mlassure assessment results — ${TARGET_NAME}`,
      "last-modified": CREATED_AT,
      version: "1",
      "oscal-version": "1.1.2",
    },
    "import-ap": { href: `#${CONTROL_SET_VERSION}` },
    results: [
      {
        uuid: "00000000-0000-4000-8000-00000000a002",
        title: "mlassure agentic control assessment",
        description: "Conformance-vector fixture. Not a real assessment.",
        start: RUN_AT,
        "reviewed-controls": {
          "control-selections": [{ "include-controls": [{ "control-id": "si-6.1" }, { "control-id": "ac-6.1" }] }],
        },
      },
    ],
  },
};

const NARRATIVE = `# Assurance narrative — ${TARGET_NAME}

Control set \`${CONTROL_SET_VERSION}\`, assessed ${RUN_AT}.

- **SI-6(1) — satisfied (high).** Data capture at 100 percent, hourly model-quality schedule.
- **AC-6(1) — insufficient evidence (low).** Execution role retrieved, attached policies were not.

This narrative is a conformance-vector fixture. The verdicts inside it are
illustrative; a verified bundle proves custody of bytes, never sound judgment.
`;

// ---------------------------------------------------------------------------
// Manifest surgery helpers. Faults are applied to the BYTES ON DISK.
// ---------------------------------------------------------------------------

function readManifest(dir: string): BundleManifest {
  return JSON.parse(readFileSync(join(dir, "manifest.json"), "utf-8")) as BundleManifest;
}

/** Same serialization the writer uses, so untouched members keep their bytes. */
function writeManifest(dir: string, manifest: BundleManifest): void {
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf-8");
}

function metaOf(manifest: BundleManifest): ManifestMeta {
  return {
    bundleFormatVersion: manifest.bundleFormatVersion,
    algorithm: manifest.algorithm,
    createdAt: manifest.createdAt,
    targetName: manifest.targetName,
    controlSetVersion: manifest.controlSetVersion,
  };
}

/** Mutate the manifest and re-seal its rootHash over the mutated metadata + entries. */
function reseal(dir: string, mutate: (manifest: BundleManifest) => void): void {
  const manifest = readManifest(dir);
  mutate(manifest);
  manifest.rootHash = computeRootHash(metaOf(manifest), manifest.files);
  writeManifest(dir, manifest);
}

/** Mutate the manifest and leave rootHash exactly as written. */
function editManifestOnly(dir: string, mutate: (manifest: BundleManifest) => void): void {
  const manifest = readManifest(dir);
  mutate(manifest);
  writeManifest(dir, manifest);
}

/** Point a manifest entry at the current bytes of its file, then re-seal. */
function remanifestFile(dir: string, relPath: string): void {
  const buf = readFileSync(join(dir, relPath));
  reseal(dir, (manifest) => {
    const entry = manifest.files.find((f) => f.path === relPath);
    if (entry === undefined) {
      throw new Error(`remanifestFile: "${relPath}" is not in the manifest`);
    }
    entry.sha256 = sha256Hex(buf);
    entry.bytes = buf.byteLength;
  });
}

/**
 * Insert a duplicate of a top-level key BEFORE the real one, so a last-wins
 * `JSON.parse` would have accepted the document and returned the original
 * value. That is the whole point of V-2: the fault is invisible to a lenient
 * reader and must be rejected anyway.
 */
function duplicateTopLevelKey(file: string, key: string, rawValueJson: string): void {
  const text = readFileSync(file, "utf-8");
  const needle = `\n  "${key}": `;
  const at = text.indexOf(needle);
  if (at === -1) {
    throw new Error(`duplicateTopLevelKey: no top-level "${key}" member in ${file}`);
  }
  writeFileSync(file, `${text.slice(0, at)}\n  "${key}": ${rawValueJson},${text.slice(at)}`, "utf-8");
}

/** First-occurrence literal replacement, with a fail-loud miss. */
function replaceOnce(file: string, find: string, replaceWith: string): void {
  const text = readFileSync(file, "utf-8");
  if (!text.includes(find)) {
    throw new Error(`replaceOnce: ${JSON.stringify(find)} not found in ${file}`);
  }
  writeFileSync(file, text.replace(find, replaceWith), "utf-8");
}

// ---------------------------------------------------------------------------
// The negative vectors: one fault each.
// ---------------------------------------------------------------------------

type Vector = {
  name: string;
  check: string;
  errorPattern: string;
  description: string;
  apply: (dir: string) => void;
};

const VECTORS: Vector[] = [
  {
    name: "missing-manifest",
    check: "V-1",
    errorPattern: "^no manifest\\.json in ",
    description:
      "manifest.json deleted — the state a crash before the last write leaves behind. The bundle is unverifiable, not merely wrong.",
    apply: (dir) => unlinkSync(join(dir, "manifest.json")),
  },
  {
    name: "duplicate-key-manifest",
    check: "V-2",
    errorPattern: '^manifest\\.json contains a duplicate object key "rootHash" at \\$',
    description:
      'A second top-level "rootHash" member inserted BEFORE the real one. JSON.parse would have accepted this document and returned the genuine root hash, so a lenient verifier sees nothing wrong; strict parsing must reject a manifest that can mean two things to two readers.',
    apply: (dir) =>
      duplicateTopLevelKey(join(dir, "manifest.json"), "rootHash", `"${"0".repeat(64)}"`),
  },
  {
    name: "duplicate-key-report",
    check: "V-2",
    errorPattern: '^report\\.json contains a duplicate object key "targetName" at \\$',
    description:
      'A second top-level "targetName" member inserted BEFORE the real one in report.json, then report.json re-manifested (sha256 + bytes) and rootHash re-sealed, so integrity and completeness both pass and the strict parse is the ONLY violation. V-2 applies to report.json because V-11 reads it.',
    apply: (dir) => {
      duplicateTopLevelKey(join(dir, "report.json"), "targetName", '"attacker-renamed"');
      remanifestFile(dir, "report.json");
    },
  },
  {
    name: "unsupported-format-version",
    check: "V-4",
    errorPattern: '^unsupported bundleFormatVersion "2"',
    description:
      'bundleFormatVersion set to "2" with rootHash re-sealed over the new metadata, so V-10 stays quiet. A verifier implements a fixed set of versions and refuses the rest rather than guessing at a format it does not know.',
    apply: (dir) =>
      reseal(dir, (manifest) => {
        manifest.bundleFormatVersion = "2";
      }),
  },
  {
    name: "unknown-algorithm",
    check: "V-5",
    errorPattern: '^unrecognized digest algorithm "sha1"',
    description:
      'algorithm set to "sha1" with rootHash re-sealed over the new metadata. The digest identifier is mandatory and never assumed: a verifier handed an algorithm it does not implement rejects the manifest instead of hashing with sha256 and hoping.',
    apply: (dir) =>
      reseal(dir, (manifest) => {
        (manifest as { algorithm: string }).algorithm = "sha1";
      }),
  },
  {
    name: "missing-algorithm",
    check: "V-5",
    errorPattern: "^unrecognized digest algorithm undefined",
    description:
      "The algorithm member removed entirely, with rootHash re-sealed over the metadata as it now reads. An absent digest identifier is the same violation as an unknown one — the verifier must not fall back to its own default.",
    apply: (dir) =>
      reseal(dir, (manifest) => {
        delete (manifest as { algorithm?: unknown }).algorithm;
      }),
  },
  {
    name: "empty-files",
    check: "V-6",
    errorPattern: "^manifest lists zero files",
    description:
      "files[] emptied and rootHash re-sealed over it — the gutted-bundle attack. Without this check a verifier reports OK with zero files verified; the writer always bundles report.json, so an empty file list is proof the manifest was not produced by mlassure.",
    apply: (dir) =>
      reseal(dir, (manifest) => {
        manifest.files = [];
      }),
  },
  {
    name: "path-escape",
    check: "V-7",
    errorPattern: '^manifest files\\[\\d+\\] path "\\.\\./outside\\.json" escapes the bundle',
    description:
      'An entry with path "../outside.json" appended, rootHash re-sealed. Manifest entries are untrusted input: a verifier must reject an escaping path BEFORE it touches the filesystem, or a hostile manifest points verification at files outside the bundle.',
    apply: (dir) =>
      reseal(dir, (manifest) => {
        manifest.files.push({ path: "../outside.json", sha256: "b".repeat(64), bytes: 1 });
      }),
  },
  {
    name: "uppercase-hex",
    check: "V-7",
    errorPattern:
      '^manifest files\\[\\d+\\] \\("narrative\\.md"\\) has no valid sha256 \\(64 lowercase hex\\)',
    description:
      "narrative.md's manifest digest uppercased. A digest that must be case-folded before comparison is two byte strings pretending to be one, so uppercase hex is a violation rather than a normalization. Expected companion: because the entry fails shape validation it is never added to the accounted-paths set, so V-12 also reports narrative.md as an unaccounted file. The named check is V-7.",
    apply: (dir) =>
      reseal(dir, (manifest) => {
        const entry = manifest.files.find((f) => f.path === "narrative.md");
        if (entry === undefined) throw new Error("uppercase-hex: narrative.md not manifested");
        entry.sha256 = entry.sha256.toUpperCase();
      }),
  },
  {
    name: "no-report-listed",
    check: "V-8",
    errorPattern: "^manifest does not list report\\.json",
    description:
      "The report.json entry removed from files[] with rootHash re-sealed, while report.json itself stays on disk. Every mlassure bundle contains a report, so a manifest that does not commit to it is not describing an mlassure bundle. Expected companion: report.json is now unmanifested content in the directory, so V-12 also reports it as an unaccounted file. The named check is V-8.",
    apply: (dir) =>
      reseal(dir, (manifest) => {
        manifest.files = manifest.files.filter((f) => f.path !== "report.json");
      }),
  },
  {
    name: "missing-roothash",
    check: "V-3",
    errorPattern: '^manifest\\.json is missing "files" or "rootHash"',
    description:
      "The rootHash member removed entirely. Without a stored commitment there is nothing to recompute against; this is not a custody manifest at all, and V-3 is terminal.",
    apply: (dir) =>
      editManifestOnly(dir, (manifest) => {
        delete (manifest as { rootHash?: unknown }).rootHash;
      }),
  },
  {
    name: "duplicate-path",
    check: "V-7",
    errorPattern: '^manifest files\\[\\d+\\] duplicates path "narrative\\.md"',
    description:
      "The narrative.md entry listed twice (identical digest and size), rootHash re-sealed over the doubled entry list. Duplicate entries inflate the verified-file count; the second occurrence is a shape violation before any file is read.",
    apply: (dir) =>
      reseal(dir, (manifest) => {
        const entry = manifest.files.find((f) => f.path === "narrative.md");
        if (entry === undefined) throw new Error("duplicate-path: narrative.md not manifested");
        manifest.files.push({ ...entry });
      }),
  },
  {
    name: "tampered-file",
    check: "V-9",
    errorPattern: "^hash mismatch: report\\.json",
    description:
      'A verdict flipped inside report.json after the manifest was written ("satisfied" to "not-satisfied"), manifest untouched. This is the core tamper-evidence case: the document still parses, still carries the right targetName, and is still the right shape — only the bytes changed, and the digest names the file.',
    apply: (dir) =>
      replaceOnce(join(dir, "report.json"), '"status": "satisfied"', '"status": "not-satisfied"'),
  },
  {
    name: "missing-file",
    check: "V-9",
    errorPattern: "^missing file listed in manifest: narrative\\.md",
    description:
      "narrative.md deleted from disk while the manifest still commits to it. Silent removal of covered content is a custody violation, not a smaller bundle.",
    apply: (dir) => unlinkSync(join(dir, "narrative.md")),
  },
  {
    name: "roothash-mismatch",
    check: "V-10",
    errorPattern: "^rootHash mismatch: manifest stores ",
    description:
      "rootHash replaced with 64 zeroes, every entry left correct. The manifest is internally inconsistent: its stored commitment does not match the recomputation over its own metadata and entries.",
    apply: (dir) =>
      editManifestOnly(dir, (manifest) => {
        manifest.rootHash = "0".repeat(64);
      }),
  },
  {
    name: "metadata-disagrees-report",
    check: "V-11",
    errorPattern:
      '^manifest targetName "fraud-detection-v3" disagrees with report\\.json "fraud-detection-v2"',
    description:
      "manifest targetName changed to fraud-detection-v3 and rootHash re-sealed, so the manifest is internally consistent and every file digest still matches. Only the cross-check against the hash-covered report.json catches it: an attacker who recomputes the root hash must also edit report.json, which V-9 then names.",
    apply: (dir) =>
      reseal(dir, (manifest) => {
        manifest.targetName = "fraud-detection-v3";
      }),
  },
  {
    name: "extra-file",
    check: "V-12",
    errorPattern: "^unaccounted file in bundle: \\.DS_Store",
    description:
      "A .DS_Store dropped into the bundle root. There is no junk-file allowlist — an allowlist is an attacker's hiding spot — so unaccounted content fails completeness no matter how ordinary its name looks. The only exemptions are the five signature-artifact names, exact-match (manifest.json, manifest.sig.bundle, manifest.json.sig, cosign.pub, rekor.json).",
    apply: (dir) => writeFileSync(join(dir, ".DS_Store"), "Bud1\u0000fixture\n", "utf-8"),
  },
  {
    name: "unparseable-report",
    check: "V-11",
    errorPattern: "^report\\.json cannot be parsed:",
    description:
      "report.json replaced with text that is not JSON, then re-manifested (sha256 + bytes) and rootHash re-sealed, so the digest matches and V-9 is quiet. V-11 reads report.json to bind targetName and controlSetVersion; a file that cannot be parsed for this check is a violation, not a skip. This is a clarification of V-11, not a new check. Duplicate keys keep the V-2 wording (see duplicate-key-report).",
    apply: (dir) => {
      writeFileSync(join(dir, "report.json"), "this is not json\n", "utf-8");
      remanifestFile(dir, "report.json");
    },
  },
  {
    name: "nested-report",
    check: "V-11",
    errorPattern: "^report\\.json cannot be parsed: JSON nesting exceeds 256",
    description:
      "report.json replaced with an object nested past the strict parser's depth limit (256), then re-manifested so the digest matches. The parser must fail with a named nesting error rather than overflowing the stack, and V-11 must report that failure instead of skipping the metadata check.",
    apply: (dir) => {
      let s = "";
      for (let i = 0; i < 300; i++) s += '{"a":';
      s += "1";
      for (let i = 0; i < 300; i++) s += "}";
      writeFileSync(join(dir, "report.json"), s, "utf-8");
      remanifestFile(dir, "report.json");
    },
  },
];

// ---------------------------------------------------------------------------
// Generate.
// ---------------------------------------------------------------------------

function generate(): void {
  rmSync(POSITIVE_DIR, { recursive: true, force: true });
  rmSync(NEGATIVE_DIR, { recursive: true, force: true });
  mkdirSync(POSITIVE_DIR, { recursive: true });
  mkdirSync(NEGATIVE_DIR, { recursive: true });

  const positiveDir = join(POSITIVE_DIR, POSITIVE_NAME);
  writeEvidenceBundle(buildReport(), positiveDir, {
    oscal: OSCAL_DOC,
    narrative: NARRATIVE,
    createdAt: CREATED_AT,
  });

  const positive = verifyEvidenceBundle(positiveDir);
  if (!positive.ok) {
    throw new Error(
      `positive vector does not verify:\n${positive.errors.map((e) => `  - ${e}`).join("\n")}`
    );
  }
  console.log(
    `positive/${POSITIVE_NAME}: OK — ${positive.checkedFiles} files, root ${positive.rootHash}`
  );
  console.log(
    `  files: ${readManifest(positiveDir)
      .files.map((f) => f.path)
      .join(", ")}`
  );
  console.log("");

  for (const vector of VECTORS) {
    const dir = join(NEGATIVE_DIR, vector.name);
    cpSync(positiveDir, dir, { recursive: true });
    vector.apply(dir);
    writeFileSync(
      join(NEGATIVE_DIR, `${vector.name}.EXPECTED.json`),
      `${JSON.stringify(
        { check: vector.check, errorPattern: vector.errorPattern, description: vector.description },
        null,
        2
      )}\n`,
      "utf-8"
    );

    // Self-check: the pattern must match the reference verifier's REAL output.
    const result = verifyEvidenceBundle(dir);
    if (result.ok) {
      throw new Error(`negative/${vector.name} verified OK — the fault did not take effect`);
    }
    const re = new RegExp(vector.errorPattern);
    const matched = result.errors.filter((e) => re.test(e));
    if (matched.length === 0) {
      throw new Error(
        `negative/${vector.name} (${vector.check}) was rejected for the WRONG reason — ` +
          `no error matched /${vector.errorPattern}/.\nActual errors:\n` +
          result.errors.map((e) => `  - ${e}`).join("\n")
      );
    }
    console.log(`negative/${vector.name} (${vector.check}) — ${result.errors.length} violation(s)`);
    for (const e of result.errors) {
      console.log(`  ${re.test(e) ? "→" : "·"} ${e}`);
    }
  }

  console.log("");
  console.log(
    `generated 1 positive and ${VECTORS.length} negative vectors in ${VECTORS_DIR.replace(`${REPO_ROOT}/`, "")}`
  );
  if (!existsSync(join(VECTORS_DIR, "README.md"))) {
    console.log("note: fixtures/bundles/README.md is missing (hand-written, not generated)");
  }
  const strays = readdirSync(NEGATIVE_DIR).filter(
    (n) => !n.endsWith(".EXPECTED.json") && !VECTORS.some((v) => v.name === n)
  );
  if (strays.length > 0) {
    throw new Error(`unexpected entries left in negative/: ${strays.join(", ")}`);
  }
}

generate();
