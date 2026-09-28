import { readFileSync, realpathSync, statSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import type { AssessmentTarget, RawEvidence } from "../types.js";
import {
  defineProvider,
  type EvidenceProvider,
  type FamilyWording,
} from "./evidence-provider.interface.js";
import { parseJsonStrict, DuplicateKeyError } from "../output/strict-json.js";

/**
 * The Proof-of-Control evidence family (M8b). The target is a stream of
 * evidence tokens, one JSON document per line (JSONL), plus an optional
 * trust-assumption disclosure document.
 *
 * The stream is read as raw text and every record is parsed here with the
 * strict parser. The CLI reads target files with `JSON.parse`, which resolves
 * a duplicate key last-wins and says nothing, so a token that reached this
 * provider through the target file would arrive already laundered and the
 * duplicate-key rule (C7.7.5) could never fail. The target file is therefore
 * only a descriptor that points at the stream.
 *
 * No signature is verified: `signature` is optional in the standard's schema,
 * and the fixture streams are unsigned.
 */
export const POC_EVIDENCE_FAMILY = "poc-evidence";

export type PocCollector = "getEvidenceRecords" | "getTrustAssumptionDisclosure";

export const POC_WORDING: FamilyWording = {
  task: "Your task is to assess whether a Proof-of-Control evidence stream, and the trust-assumption disclosure published with it, conform to a specific governance control.",
  tools: "You have access to evidence collector tools that retrieve the records of the evidence stream and the deployment's disclosure document.",
  initialMessage: (target) =>
    `Assess conformance for the evidence stream "${target.modelName}" (issuer: "${target.endpointName}").

Use the available evidence collector tools to gather relevant facts about this evidence stream and its disclosure. When you have sufficient evidence, call submit_judgment.

Remember: only cite evidence IDs that appear in tool responses you receive during this session.`,
  attestationEvidence: "automated collection from an evidence stream",
  evidenceScope:
    "Evidence scope: the stream and disclosure were supplied by the operator. Signatures were not verified, and production origin, completeness and selection were not assessed. These verdicts describe the files assessed; none says the system that produced them conforms to Proof-of-Control.",
};

/** A number in a record, as written in the raw text, at its strict-parser path (`$.poc_claims.step_index`). */
export type WrittenNumber = { path: string; written: string };

/**
 * One stream record as the `getEvidenceRecords` collector reports it. The
 * raw text is always kept, because the custody bundle must hold the bytes
 * that were judged: a duplicate key exists only there, and a number's
 * written form (`1e-324`, `9007199254740993`) exists only there too.
 */
export type StreamRecordPayload = {
  /** The stream path as the target descriptor wrote it. */
  stream: string;
  /** 0-based position among the stream's records; blank lines are not records. */
  recordIndex: number;
  /** 1-based line number of this record in the stream file. */
  line: number;
  /** Whitespace-only lines skipped in the whole stream, so none is hidden. */
  blankLinesSkipped: number;
  /** The line exactly as stored, a leading byte-order mark included. */
  rawText: string;
} & (
  | { outcome: "parsed"; token: unknown; numbers: WrittenNumber[] }
  | { outcome: "duplicate-key"; duplicateKey: string; duplicateKeyPath: string }
  | { outcome: "invalid-json"; error: string }
);

export type StreamRecord = { recordIndex: number } & (
  | { outcome: "parsed"; token: unknown; numbers: WrittenNumber[] }
  | { outcome: "duplicate-key"; key: string; path: string }
  | { outcome: "invalid-json"; error: string }
);

function readWrittenNumbers(v: unknown): WrittenNumber[] | null {
  if (!Array.isArray(v)) return null;
  const ok = v.every(
    (n) =>
      typeof n === "object" &&
      n !== null &&
      typeof (n as Record<string, unknown>)["path"] === "string" &&
      typeof (n as Record<string, unknown>)["written"] === "string"
  );
  return ok ? (v as WrittenNumber[]) : null;
}

/**
 * Guarded reader for a `getEvidenceRecords` payload. Returns the fields a
 * check may rely on, or the names of the ones that are missing or of the
 * wrong type; never a bare cast.
 */
export function readStreamRecord(
  payload: unknown
): { record: StreamRecord } | { problems: string[] } {
  if (typeof payload !== "object" || payload === null) return { problems: ["payload"] };
  const p = payload as Record<string, unknown>;
  const index = p["recordIndex"];
  if (typeof index !== "number" || !Number.isInteger(index) || index < 0) {
    return { problems: ["recordIndex"] };
  }
  switch (p["outcome"]) {
    case "parsed": {
      if (!Object.hasOwn(p, "token")) return { problems: ["token"] };
      const numbers = readWrittenNumbers(p["numbers"]);
      if (numbers === null) return { problems: ["numbers"] };
      return { record: { recordIndex: index, outcome: "parsed", token: p["token"], numbers } };
    }
    case "duplicate-key": {
      const key = p["duplicateKey"];
      const path = p["duplicateKeyPath"];
      if (typeof key !== "string" || typeof path !== "string") {
        return { problems: ["duplicateKey", "duplicateKeyPath"] };
      }
      return { record: { recordIndex: index, outcome: "duplicate-key", key, path } };
    }
    case "invalid-json": {
      const error = p["error"];
      return typeof error === "string"
        ? { record: { recordIndex: index, outcome: "invalid-json", error } }
        : { problems: ["error"] };
    }
    default:
      return { problems: ["outcome"] };
  }
}

function raw(source: string, payload: unknown): RawEvidence {
  return { id: randomUUID(), source, retrievedAt: new Date().toISOString(), payload };
}

// ignoreBOM: keep a byte-order mark in the decoded text, so rawText is what
// is stored; parsing skips it below.
const UTF8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const BOM = "﻿";
// JSON's own whitespace (RFC 8259): such a line holds no value, so it is no record.
const BLANK = /^[ \t\r]*$/;

/** Splits a JSONL stream into records. Whitespace-only lines, trailing ones included, are skipped and counted. */
function readStream(path: string, label: string): RawEvidence[] {
  let text: string;
  try {
    text = UTF8.decode(readFileSync(path));
  } catch (err) {
    throw new Error(
      `Evidence stream "${label}" could not be read as UTF-8: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  const lines = text.split("\n");
  const kept: { rawText: string; line: number }[] = [];
  let blankLinesSkipped = 0;
  lines.forEach((rawText, i) => {
    const content = i === 0 && rawText.startsWith(BOM) ? rawText.slice(1) : rawText;
    // The empty string after a final newline ends the last line; it is not a line.
    if (i === lines.length - 1 && rawText === "") return;
    if (BLANK.test(content)) {
      blankLinesSkipped++;
      return;
    }
    kept.push({ rawText, line: i + 1 });
  });

  return kept.map(({ rawText, line }, recordIndex) => {
    const base = { stream: label, recordIndex, line, blankLinesSkipped, rawText };
    const content = line === 1 && rawText.startsWith(BOM) ? rawText.slice(1) : rawText;
    const numbers: WrittenNumber[] = [];
    let payload: StreamRecordPayload;
    try {
      const token = parseJsonStrict(content, { onNumber: (written, at) => numbers.push({ path: at, written }) });
      payload = { ...base, outcome: "parsed", token, numbers };
    } catch (err) {
      payload =
        err instanceof DuplicateKeyError
          ? { ...base, outcome: "duplicate-key", duplicateKey: err.key, duplicateKeyPath: err.path }
          : { ...base, outcome: "invalid-json", error: err instanceof Error ? err.message : String(err) };
    }
    return raw("poc:evidence-stream:record", payload);
  });
}

export type PocSources = {
  /** Path to read, and the label evidence carries (the path as the descriptor wrote it). */
  stream: { path: string; label: string };
  disclosure?: { path: string; label: string };
};

function assertFile(path: string, what: string, label: string): void {
  let isFile = false;
  try {
    isFile = statSync(path).isFile();
  } catch {
    // reported below, naming both the label and where it resolved to
  }
  if (!isFile) {
    throw new Error(`Proof-of-Control target: ${what} "${label}" (resolved to ${path}) is not a readable file`);
  }
}

export function pocEvidenceProvider(sources: PocSources): EvidenceProvider {
  // Checked at construction so a mistyped path fails before any control runs.
  // An EMPTY stream is not an error: it is the "nothing to assess" case.
  assertFile(sources.stream.path, "stream", sources.stream.label);
  if (sources.disclosure) assertFile(sources.disclosure.path, "disclosure", sources.disclosure.label);

  const provider = defineProvider(POC_EVIDENCE_FAMILY, {
    getEvidenceRecords: {
      description:
        "Retrieves every record of the Proof-of-Control evidence stream, in stream order, one evidence item per record: its 0-based record index (whitespace-only lines are skipped, not counted, and their number is stated), its 1-based line number, the line's raw text exactly as stored, and either the parsed token with every number's written form or why it could not be parsed (a duplicate object key, with the key and its path, or invalid JSON). Signatures are not verified.",
      run: async () => readStream(sources.stream.path, sources.stream.label),
    },
    getTrustAssumptionDisclosure: {
      description:
        "Retrieves the deployment's trust-assumption disclosure document as text: its claim register (each claim and the mechanisms behind it) and the residual trust assumptions disclosed for each claim, with their subjects and categories. Returns null if no disclosure was supplied.",
      run: async () =>
        sources.disclosure
          ? raw("poc:trust-assumption-disclosure", {
              document: sources.disclosure.label,
              text: readFileSync(sources.disclosure.path, "utf-8"),
            })
          : null,
    },
  } satisfies Record<PocCollector, unknown>);
  return { ...provider, wording: POC_WORDING };
}

const DESCRIPTOR_KEYS = new Set(["family", "modelName", "endpointName", "stream", "disclosure"]);

/**
 * Resolves a path named by a descriptor, refusing anything outside the
 * descriptor's own directory. The descriptor may come from the assessed
 * party, and what it names is sent to the LLM and copied into the custody
 * bundle, so it must not reach the assessor's other files: no absolute
 * path, no `..` out, and no symlink out (checked after following links).
 * Returns the real path, which is what is read later.
 */
function confined(descriptorPath: string, field: string, label: string): { path: string; label: string } {
  const rule = `"${field}" must name a file inside the descriptor's directory`;
  const where = `Proof-of-Control target "${descriptorPath}"`;
  if (isAbsolute(label)) throw new Error(`${where}: ${rule}; "${label}" is an absolute path`);
  const base = realpathSync(dirname(resolve(descriptorPath)));
  // Lexically first, so `../` out is refused whether or not the target exists.
  if (!resolve(base, label).startsWith(base + sep)) {
    throw new Error(`${where}: ${rule}; "${label}" resolves to ${resolve(base, label)}`);
  }
  let real: string;
  try {
    real = realpathSync(resolve(base, label));
  } catch {
    throw new Error(`${where}: ${field} "${label}" (resolved to ${resolve(base, label)}) is not a readable file`);
  }
  // Then after following symlinks, so a link inside cannot point out.
  if (!real.startsWith(base + sep)) {
    throw new Error(`${where}: ${rule}; "${label}" resolves to ${real}`);
  }
  return { path: real, label };
}

/**
 * Builds the provider from a parsed target descriptor:
 * `{ family: "poc-evidence", modelName, endpointName, stream, disclosure? }`.
 * `modelName` names the stream and `endpointName` carries the issuer; both
 * feed the report fields every family shares. Paths resolve relative to the
 * descriptor file and must stay inside its directory. Unknown keys are
 * rejected: a misspelled `disclosure` would otherwise turn into a silent
 * "no disclosure supplied".
 */
export function pocProviderFromDescriptor(
  descriptor: AssessmentTarget,
  descriptorPath: string
): EvidenceProvider {
  const d = descriptor as Record<string, unknown>;
  const where = `Proof-of-Control target "${descriptorPath}"`;
  const unknown = Object.keys(d).filter((k) => !DESCRIPTOR_KEYS.has(k));
  if (unknown.length > 0) throw new Error(`${where} has unknown field(s): ${unknown.join(", ")}`);
  for (const field of ["modelName", "endpointName", "stream"]) {
    if (typeof d[field] !== "string" || (d[field] as string).trim() === "") {
      throw new Error(`${where} is missing a non-empty string "${field}"`);
    }
  }
  if (d["disclosure"] !== undefined && (typeof d["disclosure"] !== "string" || d["disclosure"].trim() === "")) {
    throw new Error(`${where}: "disclosure" must be a non-empty string when present`);
  }
  return pocEvidenceProvider({
    stream: confined(descriptorPath, "stream", d["stream"] as string),
    ...(typeof d["disclosure"] === "string"
      ? { disclosure: confined(descriptorPath, "disclosure", d["disclosure"]) }
      : {}),
  });
}
