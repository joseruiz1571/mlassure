import Ajv2020, { type ValidateFunction } from "ajv/dist/2020.js";
import pocSchema from "../../fixtures/schemas/poc-evidence.schema.json" with { type: "json" };
import type { StreamRecord } from "./poc-evidence.js";

/**
 * The four code-run Proof-of-Control rules (M8b), as pure functions over the
 * records of one non-empty stream. They decide; `deterministic-checks.ts`
 * turns a decision into a guarded Judgment. Each rule sorts records into
 * violations (the rule is broken), undetermined (the record cannot be read
 * for this rule), or clean, and the verdict follows one precedence:
 * any violation → not-satisfied; else any undetermined → insufficient-evidence;
 * else satisfied.
 */
export type RuleDecision = {
  status: "satisfied" | "not-satisfied" | "insufficient-evidence";
  rationale: string;
  gaps: string[];
  /** Positions in the input array whose evidence the judgment cites. */
  cite: number[];
};

type Sorted = { violations: Map<number, string[]>; undetermined: Map<number, string> };

function sorted(): Sorted {
  return { violations: new Map(), undetermined: new Map() };
}

function addViolation(s: Sorted, at: number, message: string): void {
  s.violations.set(at, [...(s.violations.get(at) ?? []), message]);
}

function decide(
  s: Sorted,
  records: readonly StreamRecord[],
  text: { satisfied: string; violated: string; undetermined: string }
): RuleDecision {
  const undetermined = [...s.undetermined.values()];
  if (s.violations.size > 0) {
    const messages = [...s.violations.values()].flat();
    return {
      status: "not-satisfied",
      rationale: `${text.violated} ${messages.join("; ")}.`,
      gaps: [...messages, ...undetermined],
      cite: [...s.violations.keys()],
    };
  }
  if (undetermined.length > 0) {
    return {
      status: "insufficient-evidence",
      rationale: `${text.undetermined} ${undetermined.join("; ")}.`,
      gaps: undetermined,
      cite: [...s.undetermined.keys()],
    };
  }
  return { status: "satisfied", rationale: text.satisfied, gaps: [], cite: records.map((_, i) => i) };
}

const label = (r: StreamRecord) => `record ${r.recordIndex}`;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// ---------------------------------------------------------------- C7.7.1

let validator: ValidateFunction | undefined;

/**
 * Compiled once, on first use. Formats are not asserted (`format: "uri"` is
 * an annotation here), matching the standard's own reference validator,
 * which runs JSON Schema 2020-12 without a format checker.
 */
function schemaValidator(): ValidateFunction {
  validator ??= new Ajv2020({ allErrors: true, validateFormats: false }).compile(pocSchema);
  return validator;
}

/**
 * Whether the number written as `written` (JSON number grammar) is exactly
 * the IEEE-754 double `Number(written)` gives. False on overflow (Infinity),
 * underflow (`1e-324` → 0) and precision loss (`9007199254740993` → …992).
 * `1754400000.0` is exact: its value, not its spelling, is what converts.
 * Compared as integers with BigInt, so the test itself loses nothing.
 */
export function convertsExactly(written: string): boolean {
  const m = /^-?(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(written);
  if (m === null) return false;
  const value = Number(written);
  if (!Number.isFinite(value)) return false;
  const digits = `${m[1]}${m[2] ?? ""}`.replace(/^0+/, "");
  if (digits === "") return value === 0;
  if (value === 0) return false;
  // Written: digits × 10^exp10. Double: mantissa × 2^exp2, read from its bits.
  const exp10 = BigInt(m[3] ?? "0") - BigInt((m[2] ?? "").length);
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, Math.abs(value));
  const bits = view.getBigUint64(0);
  const biased = Number((bits >> 52n) & 0x7ffn);
  const fraction = bits & ((1n << 52n) - 1n);
  const mantissa = biased === 0 ? fraction : fraction | (1n << 52n);
  const exp2 = BigInt(biased === 0 ? -1074 : biased - 1075);
  let left = BigInt(digits);
  let right = mantissa;
  if (exp10 >= 0n) left *= 10n ** exp10;
  else right *= 10n ** -exp10;
  if (exp2 >= 0n) right *= 2n ** exp2;
  else left *= 2n ** -exp2;
  return left === right;
}

export function schemaValidity(records: readonly StreamRecord[]): RuleDecision {
  const s = sorted();
  const validate = schemaValidator();
  records.forEach((r, at) => {
    if (r.outcome === "invalid-json") {
      addViolation(s, at, `${label(r)} is not a JSON document (${r.error})`);
      return;
    }
    if (r.outcome === "duplicate-key") {
      s.undetermined.set(
        at,
        `${label(r)} has a duplicate key "${r.key}" at ${r.path}, so it has no single reading to validate (PoC-7.7.5 reports the key)`
      );
      return;
    }
    // The schema sees converted numbers. Where conversion changed a value,
    // a pass or a fail would be about a number the record does not hold.
    const lossy = r.numbers.filter((n) => !convertsExactly(n.written));
    if (lossy.length > 0) {
      s.undetermined.set(
        at,
        `${label(r)} holds a number whose written form does not survive conversion exactly, so the schema would judge a different value: ` +
          lossy.map((n) => `${n.path} written ${n.written}`).join(", ")
      );
    } else if (!validate(r.token)) {
      for (const e of validate.errors ?? []) {
        addViolation(s, at, `${label(r)} fails the schema at ${e.instancePath || "(root)"}: ${e.message ?? e.keyword} (schema path ${e.schemaPath})`);
      }
    }
  });
  return decide(s, records, {
    satisfied: `All ${records.length} records validate against the pinned Proof-of-Control evidence schema (poc-evidence.schema.json, JSON Schema 2020-12).`,
    violated: "Not every record validates against the pinned Proof-of-Control evidence schema:",
    undetermined: "No record fails the pinned schema, but not every record could be validated:",
  });
}

// ---------------------------------------------------------------- C7.7.3 (digest discovery)

const DIGEST_KEY = /_(hash|digest)$/;
const DIGEST_LIST_KEY = /_(hashes|digests)$/;

/** Paths the schema types as digests: checked whatever their value's type. */
const SCHEMA_DIGEST_PATHS = new Set([
  ...["agbom_digest", "chain_head", "merkle_root", "policy_bundle_hash", "canonical_snapshot_hash", "path_summary_hash"].map(
    (c) => `poc_claims.${c}`
  ),
  "submods.attestation.measurement",
]);

/**
 * Every value in the token recognised as a digest, with its path: the
 * schema's digest claims, any string under a key ending `_hash` or
 * `_digest`, and any string in an array under a key ending `_hashes` or
 * `_digests`, at any depth, the token's top level included. A digest under
 * another name is not recognised.
 */
function digestCandidates(token: unknown): [string, unknown][] {
  const found: [string, unknown][] = [];
  const visit = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, i) => visit(item, `${path}[${i}]`));
      return;
    }
    if (!isObject(value)) return;
    for (const [key, item] of Object.entries(value)) {
      const at = path === "" ? key : `${path}.${key}`;
      if (SCHEMA_DIGEST_PATHS.has(at) || (typeof item === "string" && DIGEST_KEY.test(key))) {
        found.push([at, item]);
      } else if (Array.isArray(item) && DIGEST_LIST_KEY.test(key)) {
        item.forEach((entry, i) => {
          if (typeof entry === "string") found.push([`${at}[${i}]`, entry]);
          else visit(entry, `${at}[${i}]`);
        });
      } else {
        visit(item, at);
      }
    }
  };
  visit(token, "");
  return found;
}

// ---------------------------------------------------------------- C7.7.3

/**
 * Algorithm tag → hex width, as the pinned schema's `$defs/digest` pattern
 * states it. A test rebuilds that pattern from this table and compares it to
 * the schema's string, so the two cannot drift apart silently.
 */
export const DIGEST_WIDTHS: Readonly<Record<string, number>> = {
  "sha-256": 64,
  "sha-384": 96,
  "sha-512": 128,
  "sha3-256": 64,
};

/** Signature algorithms the pinned schema allows in `poc_claims.alg`. */
export const SIGNATURE_ALGS: readonly string[] = pocSchema.$defs.pocClaims.properties.alg.enum;

/** Why a digest-typed value is not an identified digest, or null when it is. */
function digestProblem(value: unknown): string | null {
  if (typeof value !== "string") return "is not a string";
  const colon = value.indexOf(":");
  if (colon === -1) return "is an untagged digest (no algorithm identifier)";
  const tag = value.slice(0, colon);
  const hex = value.slice(colon + 1);
  if (!Object.hasOwn(DIGEST_WIDTHS, tag)) return `carries unrecognised algorithm tag "${tag}"`;
  // Hex CASE is canonical form (C7.7.2), not algorithm identification; the
  // schema check (PoC-7.7.1) reports it for the claims the schema types.
  if (!/^[0-9a-fA-F]+$/.test(hex)) return `has a non-hexadecimal value after "${tag}:"`;
  const width = DIGEST_WIDTHS[tag]!;
  if (hex.length !== width) return `is tagged ${tag}, which implies ${width} hex characters, but carries ${hex.length}`;
  return null;
}

export function digestIdentification(records: readonly StreamRecord[]): RuleDecision {
  const s = sorted();
  let digests = 0;
  records.forEach((r, at) => {
    if (r.outcome !== "parsed") {
      s.undetermined.set(at, `${label(r)} could not be parsed (${r.outcome}), so its digests could not be read`);
      return;
    }
    const token = isObject(r.token) ? r.token : {};
    const claims = isObject(token["poc_claims"]) ? token["poc_claims"] : {};

    // The claim set is open (`dispatched_snapshot_hash` is an extension in
    // the standard's own vectors), so digests are found by name anywhere in
    // the token. An absent schema claim is a schema matter, not this rule's.
    for (const [where, value] of digestCandidates(token)) {
      digests++;
      const problem = digestProblem(value);
      if (problem !== null) addViolation(s, at, `${label(r)}: ${where} ${problem}`);
    }

    const alg = claims["alg"];
    if (alg === undefined) {
      addViolation(s, at, `${label(r)}: poc_claims.alg is absent, so the signature algorithm is unidentified`);
    } else if (typeof alg !== "string" || !SIGNATURE_ALGS.includes(alg)) {
      addViolation(s, at, `${label(r)}: poc_claims.alg ${JSON.stringify(alg)} is not a signature algorithm the schema names`);
    }
  });
  // No vacuous pass: a stream in which nothing was recognised as a digest
  // has shown nothing about how its digests are identified.
  if (s.violations.size === 0 && digests === 0) {
    const undetermined = [...s.undetermined.values()];
    const none = `no claim recognised as a digest by name was found in the ${records.length} records, so no digest was checked`;
    return {
      status: "insufficient-evidence",
      rationale: `No algorithm identifier is missing or unrecognised, but ${[none, ...undetermined].join("; ")}.`,
      gaps: [none, ...undetermined],
      cite: records.map((_, i) => i),
    };
  }
  return decide(s, records, {
    satisfied: `Every claim recognised as a digest by name in the ${records.length} records (${digests} digests: the schema's digest claims, submods.attestation.measurement, and any string under a key ending _hash or _digest, or in an array under a key ending _hashes or _digests, at any depth) carries a recognised algorithm tag at the width that tag implies, and every record names its signature algorithm in poc_claims.alg.`,
    violated: "Not every digest or signature in the stream carries a usable algorithm identifier:",
    undetermined: "No identified digest is malformed, but not every record could be read:",
  });
}

// ---------------------------------------------------------------- C7.7.5

export function duplicateKeys(records: readonly StreamRecord[]): RuleDecision {
  const s = sorted();
  records.forEach((r, at) => {
    if (r.outcome === "duplicate-key") {
      addViolation(s, at, `${label(r)} contains the object key "${r.key}" twice at ${r.path}`);
    } else if (r.outcome === "invalid-json") {
      s.undetermined.set(at, `${label(r)} is not valid JSON (${r.error}), so it could not be checked for duplicate keys`);
    }
  });
  return decide(s, records, {
    satisfied: `None of the ${records.length} records contains a duplicate object key; each was read from the stream's raw text by a parser that refuses duplicates rather than resolving them last-wins.`,
    violated: "The stream holds a record that means different things to different parsers:",
    undetermined: "No duplicate key was found, but not every record could be checked:",
  });
}

// ---------------------------------------------------------------- C7.6.2

/**
 * Per `agent_id`, in stream order, `step_index` rises by exactly 1 from the
 * first index the stream shows for that agent (M8c: the standard's auditor
 * evidence computes continuity "over a sampled window", so a window need not
 * start at 0). The price: records before the first one leave no gap, as
 * records after the last one never did. Any record that cannot be read for the rule makes the verdict
 * insufficient-evidence even when a gap is visible elsewhere: the unreadable
 * record may be the missing step.
 */
export function stepContinuity(records: readonly StreamRecord[]): RuleDecision {
  const s = sorted();
  // Steps are read from their WRITTEN form as BigInt, never from the parsed
  // number: `1.0`, `1e0` and `1e-324` all convert to integers, and a step
  // above 2^53 converts to a neighbour, so the converted value would report
  // a sequence the record does not hold.
  const steps: { at: number; agent: string; step: bigint; r: StreamRecord }[] = [];
  records.forEach((r, at) => {
    if (r.outcome !== "parsed") {
      s.undetermined.set(at, `${label(r)} could not be parsed (${r.outcome}), so its agent and step are unknown`);
      return;
    }
    const token = isObject(r.token) ? r.token : {};
    const claims = isObject(token["poc_claims"]) ? token["poc_claims"] : {};
    const agent = claims["agent_id"];
    const forms = r.numbers.filter((n) => n.path === "$.poc_claims.step_index").map((n) => n.written);
    if (typeof agent !== "string" || agent === "" || typeof claims["step_index"] !== "number" || forms.length !== 1) {
      s.undetermined.set(at, `${label(r)} lacks a readable poc_claims.agent_id and a single numeric poc_claims.step_index`);
      return;
    }
    const written = forms[0]!;
    if (!/^[0-9]+$/.test(written)) {
      s.undetermined.set(at, `${label(r)} writes poc_claims.step_index as ${written}, not as plain decimal digits`);
      return;
    }
    steps.push({ at, agent, step: BigInt(written), r });
  });
  if (s.undetermined.size > 0) {
    const undetermined = [...s.undetermined.values()];
    return {
      status: "insufficient-evidence",
      rationale: `The per-agent sequence cannot be reconstructed: ${undetermined.join("; ")}.`,
      gaps: undetermined,
      cite: [...s.undetermined.keys()],
    };
  }

  const last = new Map<string, bigint>();
  // The range the stream shows per agent: its first index and its highest.
  const seen = new Map<string, { first: bigint; high: bigint }>();
  for (const { at, agent, step, r } of steps) {
    const range = seen.get(agent);
    seen.set(agent, range === undefined ? { first: step, high: step } : { first: range.first, high: step > range.high ? step : range.high });
    const prev = last.get(agent);
    const expected = prev === undefined ? step : prev + 1n;
    if (step === expected) {
      last.set(agent, step);
    } else if (step > expected) {
      const missing = step - 1n === expected ? `step ${expected} is missing` : `steps ${expected}–${step - 1n} are missing`;
      addViolation(s, at, `agent ${agent}: ${label(r)} has step_index ${step} where ${expected} was expected, so ${missing}`);
      last.set(agent, step);
    } else if (step === prev) {
      addViolation(s, at, `agent ${agent}: ${label(r)} repeats step_index ${step}`);
    } else {
      addViolation(s, at, `agent ${agent}: ${label(r)} has step_index ${step} after step_index ${prev}, so the sequence descends`);
    }
  }
  const ranges = [...seen.entries()].map(([agent, { first, high }]) => `${agent} ${first}–${high}`).join(", ");
  return decide(s, records, {
    satisfied: `For each of the ${seen.size} agent_id values in the ${records.length} records, step_index rises by exactly 1 in stream order from the first index the stream shows for that agent (ranges seen: ${ranges}); no sequence shows a gap, repeat or descent. Records before the first index or after the last one shown would leave no gap.`,
    violated: `The per-agent step_index sequence is broken (ranges seen: ${ranges}):`,
    undetermined: "The per-agent sequence cannot be reconstructed:",
  });
}
