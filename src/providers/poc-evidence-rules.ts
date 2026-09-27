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

export function schemaValidity(records: readonly StreamRecord[]): RuleDecision {
  const s = sorted();
  const validate = schemaValidator();
  records.forEach((r, at) => {
    if (r.outcome === "invalid-json") {
      addViolation(s, at, `${label(r)} is not a JSON document (${r.error})`);
    } else if (r.outcome === "duplicate-key") {
      s.undetermined.set(
        at,
        `${label(r)} has a duplicate key "${r.key}" at ${r.path}, so it has no single reading to validate (PoC-7.7.5 reports the key)`
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

/** The digest-typed members of `poc_claims` the schema names. */
export const SCHEMA_DIGEST_CLAIMS = [
  "agbom_digest",
  "chain_head",
  "merkle_root",
  "policy_bundle_hash",
  "canonical_snapshot_hash",
  "path_summary_hash",
] as const;

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

    // Schema-named digest claims, plus extension claims named like digests
    // (the claim set is open: `dispatched_snapshot_hash` is one in the
    // standard's own vectors). An absent claim is a schema matter, not this rule's.
    const names = new Set<string>(SCHEMA_DIGEST_CLAIMS);
    for (const key of Object.keys(claims)) {
      if (key.endsWith("_hash") || key.endsWith("_digest")) names.add(key);
    }
    const checked: [string, unknown][] = [...names]
      .filter((n) => Object.hasOwn(claims, n))
      .map((n) => [`poc_claims.${n}`, claims[n]]);
    const submods = isObject(token["submods"]) ? token["submods"] : {};
    const attestation = isObject(submods["attestation"]) ? submods["attestation"] : {};
    if (Object.hasOwn(attestation, "measurement")) {
      checked.push(["submods.attestation.measurement", attestation["measurement"]]);
    }

    for (const [where, value] of checked) {
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
  return decide(s, records, {
    satisfied: `Every digest-typed claim in the ${records.length} records (${digests} digests) carries a recognised algorithm tag at the width that tag implies, and every record names its signature algorithm in poc_claims.alg.`,
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
 * Per `agent_id`, in stream order, `step_index` starts at 0 and rises by
 * exactly 1. Any record that cannot be read for the rule makes the verdict
 * insufficient-evidence even when a gap is visible elsewhere: the unreadable
 * record may be the missing step.
 */
export function stepContinuity(records: readonly StreamRecord[]): RuleDecision {
  const s = sorted();
  const steps: { at: number; agent: string; step: number; r: StreamRecord }[] = [];
  records.forEach((r, at) => {
    if (r.outcome !== "parsed") {
      s.undetermined.set(at, `${label(r)} could not be parsed (${r.outcome}), so its agent and step are unknown`);
      return;
    }
    const token = isObject(r.token) ? r.token : {};
    const claims = isObject(token["poc_claims"]) ? token["poc_claims"] : {};
    const agent = claims["agent_id"];
    const step = claims["step_index"];
    if (typeof agent !== "string" || agent === "" || typeof step !== "number" || !Number.isInteger(step) || step < 0) {
      s.undetermined.set(at, `${label(r)} lacks a readable poc_claims.agent_id and non-negative integer poc_claims.step_index`);
      return;
    }
    steps.push({ at, agent, step, r });
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

  const last = new Map<string, number>();
  for (const { at, agent, step, r } of steps) {
    const prev = last.get(agent);
    const expected = prev === undefined ? 0 : prev + 1;
    if (step === expected) {
      last.set(agent, step);
    } else if (step > expected) {
      const missing = step - 1 === expected ? `step ${expected} is missing` : `steps ${expected}–${step - 1} are missing`;
      addViolation(s, at, `agent ${agent}: ${label(r)} has step_index ${step} where ${expected} was expected, so ${missing}`);
      last.set(agent, step);
    } else if (step === prev) {
      addViolation(s, at, `agent ${agent}: ${label(r)} repeats step_index ${step}`);
    } else {
      addViolation(s, at, `agent ${agent}: ${label(r)} has step_index ${step} after step_index ${prev}, so the sequence descends`);
    }
  }
  const ranges = [...last.entries()].map(([agent, top]) => `${agent} 0–${top}`).join(", ");
  return decide(s, records, {
    satisfied: `For each of the ${last.size} agent_id values in the ${records.length} records, step_index starts at 0 and rises by exactly 1 in stream order (${ranges}); no sequence shows a gap, repeat or descent.`,
    violated: "The per-agent step_index sequence is broken:",
    undetermined: "The per-agent sequence cannot be reconstructed:",
  });
}
