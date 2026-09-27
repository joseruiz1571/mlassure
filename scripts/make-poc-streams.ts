#!/usr/bin/env bun
/**
 * Fixture-stream generator for the Proof-of-Control control family (M8b).
 *
 *   bun scripts/make-poc-streams.ts --standard <path to an ov-poc-standard checkout>
 *
 * Rewrites `fixtures/targets/poc-evidence/streams/*.jsonl` from the standard's
 * published test vectors (`schema/vectors/`, Apache-2.0). Each source vector
 * is checked against the sha256 it had at commit 22c7b62 before it is used,
 * so the streams can only be regenerated from that revision's bytes.
 *
 * Records are built as TEXT, never by parse-and-reserialize: a duplicate key
 * survives only in the raw bytes, and a JSON round trip would launder it.
 * Every record is the vector's text with
 *   - the `"signature": …` line removed (fixture streams are unsigned; a
 *     signature over a record changed in any way would be a forged one), and
 *   - line breaks and indentation removed, so one token is one JSONL line.
 * Derived records additionally have named fields replaced, each replacement
 * asserted to hit exactly once. `fixtures/targets/poc-evidence/README.md` lists them.
 *
 * Each negative stream is the clean stream with exactly ONE fault. The
 * script refuses to write anything if a record does not parse the way its
 * stream expects (the duplicate-key record must be refused by the strict
 * parser and accepted by JSON.parse; every other record must parse strictly).
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseJsonStrict, DuplicateKeyError } from "../src/output/strict-json.js";

const PINNED_COMMIT = "22c7b625be459f5eee7dd8690afd080b5141b8c6";

const SOURCES = {
  "allow-read": {
    path: "positive/allow-read.json",
    sha256: "e484386b702d653214d90207e718e91f5d4b4e5f0c33511bc6842ac47d17cbde",
  },
  "deny-path-composition": {
    path: "positive/deny-path-composition.json",
    sha256: "509f442d9aaca7ebd627be1e35776fa274b1082c20be3a8690e66fcd4312a585",
  },
  "modify-bound": {
    path: "positive/modify-bound.json",
    sha256: "2ed0a3b7b340a39f094ca2c1b85fa6f2ca552621a6007a6cd2ea1b6d3dae023a",
  },
  "hardware-attested": {
    path: "positive/hardware-attested.json",
    sha256: "a00c8a1a19f585e50df9d1f006435ef45552be972d1f343ad8158414081446e8",
  },
  "duplicate-key": {
    path: "negative/duplicate-key.json",
    sha256: "8bc0eea550c1d6446ab07fb2fe34db1802e1fc913023868264fe6de85612e353",
  },
  "untagged-digest": {
    path: "negative/untagged-digest.json",
    sha256: "411918d047edf9a91111b384bebfe586cd285ce4bc3d35fc87dad6b97be6747e",
  },
  "digest-alg-width-mismatch": {
    path: "negative/digest-alg-width-mismatch.json",
    sha256: "553f6e86796e583243dc51c66fa13cb58a10593aab4821747980d673476170af",
  },
  "missing-policy-bundle-hash": {
    path: "negative/missing-policy-bundle-hash.json",
    sha256: "59dbf24178fd7c69bfa9e02c68b7687cd108e0ceae49b1e56d865b1efff8b0c4",
  },
} as const;

type SourceName = keyof typeof SOURCES;

function fail(message: string): never {
  console.error(`make-poc-streams: ${message}`);
  process.exit(1);
}

function standardDir(): string {
  const i = process.argv.indexOf("--standard");
  const dir = i === -1 ? undefined : process.argv[i + 1];
  if (!dir) fail("usage: bun scripts/make-poc-streams.ts --standard <ov-poc-standard checkout>");
  return resolve(dir);
}

function readVector(root: string, name: SourceName): string {
  const { path, sha256 } = SOURCES[name];
  const bytes = readFileSync(join(root, "schema", "vectors", path));
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== sha256) {
    fail(`${path} has sha256 ${actual}, not the ${sha256} it had at ${PINNED_COMMIT}; check out that commit`);
  }
  return bytes.toString("utf-8");
}

/** One vector file → one JSONL record: signature line dropped, whitespace between lines dropped. */
function toRecord(name: string, text: string): string {
  const lines = text.split("\n");
  const kept = lines.filter((l) => !/^\s*"signature": "[0-9a-f]+",$/.test(l));
  if (kept.length !== lines.length - 1) {
    fail(`${name}: expected exactly one "signature" line followed by another member`);
  }
  return kept.map((l) => l.trim()).join("");
}

function replaceOnce(name: string, record: string, from: string, to: string): string {
  const at = record.indexOf(from);
  if (at === -1 || record.indexOf(from, at + 1) !== -1) {
    fail(`${name}: expected exactly one occurrence of ${from}`);
  }
  return record.slice(0, at) + to + record.slice(at + from.length);
}

const root = standardDir();
const rec = (name: SourceName) => toRecord(name, readVector(root, name));

// The clean stream: agent ref-1 at steps 0, 1, 2 and agent ref-2 at step 0.
const allowRead = rec("allow-read"); //                     ref-1 step 0
const deny = rec("deny-path-composition"); //               ref-1 step 1
let ref2 = rec("hardware-attested"); //                     ref-2 step 0
ref2 = replaceOnce("ref-2", ref2, `"agent_id": "did:web:example.org:agents:ref-1"`, `"agent_id": "did:web:example.org:agents:ref-2"`);
ref2 = replaceOnce("ref-2", ref2, `"nonce": "n-00000001"`, `"nonce": "n-00000011"`);
let modify = rec("modify-bound"); //                        ref-1 step 2
modify = replaceOnce("step-2", modify, `"step_index": 0,`, `"step_index": 2,`);
modify = replaceOnce("step-2", modify, `"tree_size": 1,`, `"tree_size": 3,`);
modify = replaceOnce("step-2", modify, `"nonce": "n-00000001"`, `"nonce": "n-00000003"`);

const clean = [allowRead, ref2, deny, modify];
const replaceFirst = (record: string) => [record, ...clean.slice(1)];

const STREAMS: Record<string, string[]> = {
  clean,
  empty: [],
  // 7.6.2 — the standard's auditor-evidence test: remove one record.
  "step-gap": [allowRead, ref2, modify],
  "step-repeat": [...clean, modify],
  "step-descending": [...clean, deny],
  // One vector-derived fault each, in place of record 0 (ref-1, step 0).
  "duplicate-key": replaceFirst(rec("duplicate-key")),
  "untagged-digest": replaceFirst(rec("untagged-digest")),
  "digest-alg-width-mismatch": replaceFirst(rec("digest-alg-width-mismatch")),
  "schema-invalid": replaceFirst(rec("missing-policy-bundle-hash")),
  // Numbers whose written form is not what a converted value shows.
  // step_index written 1.0: converts to the integer 1, but is not written as one.
  "step-index-float": [allowRead, ref2, replaceOnce("step-1.0", deny, `"step_index": 1,`, `"step_index": 1.0,`), modify],
  // iat written with a fraction a double cannot hold: converts to 1754400000.
  "lossy-number": replaceFirst(replaceOnce("iat", allowRead, `"iat": 1754400000,`, `"iat": 1754400000.0000000001,`)),
  // Whitespace-only lines are not records: one mid-stream, two extra at the end.
  "blank-lines": [allowRead, ref2, "   ", deny, modify, "", ""],
};

const BLANK = /^[ \t\r]*$/;

for (const [stream, records] of Object.entries(STREAMS)) {
  records.forEach((line, i) => {
    if (BLANK.test(line)) return;
    const where = `${stream}.jsonl line ${i + 1}`;
    const isDuplicate = stream === "duplicate-key" && i === 0;
    let parsed: unknown;
    try {
      parsed = parseJsonStrict(line);
    } catch (err) {
      if (isDuplicate && err instanceof DuplicateKeyError) {
        JSON.parse(line); // a last-wins parser must accept it, or the fixture proves nothing
        return;
      }
      fail(`${where} does not parse strictly: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (isDuplicate) fail(`${where} was meant to hold a duplicate key but parsed cleanly`);
    if (Object.hasOwn(parsed as object, "signature")) fail(`${where} still carries a signature`);
  });
}

const outDir = join(import.meta.dir, "..", "fixtures", "targets", "poc-evidence", "streams");
mkdirSync(outDir, { recursive: true });
for (const [stream, records] of Object.entries(STREAMS)) {
  const text = records.map((r) => `${r}\n`).join("");
  writeFileSync(join(outDir, `${stream}.jsonl`), text, "utf-8");
  const blank = records.filter((r) => BLANK.test(r)).length;
  console.log(`  ${stream}.jsonl  ${records.length - blank} record(s)${blank > 0 ? `, ${blank} blank line(s)` : ""}`);
}
