import type { ControlItem, AssessmentTarget, Judgment, RawEvidence } from "../types.js";
import type { EvidenceProvider } from "../providers/evidence-provider.interface.js";
import { AWS_SAGEMAKER_FAMILY, type AwsProvider } from "../providers/aws-sagemaker.js";
import {
  POC_EVIDENCE_FAMILY,
  readStreamRecord,
  type PocCollector,
  type StreamRecord,
} from "../providers/poc-evidence.js";
import {
  schemaValidity,
  digestIdentification,
  duplicateKeys,
  stepContinuity,
  type RuleDecision,
} from "../providers/poc-evidence-rules.js";
import { executeCollector } from "../tools/executor.js";
import { EvidenceStore } from "../store/evidence-store.js";
import { validateCitations } from "../guard/citation-guard.js";
import { parseJudgment } from "../guard/judgment-validator.js";
import type { AssessControlResult } from "./agent.js";

/**
 * Same return shape as `assessControl()` (`AssessControlResult`), so `agent.ts`'s
 * dispatch can treat the LLM path and every code-determined path uniformly — no
 * caller needs to know which mechanism produced a given result.
 */
export type DeterministicCheckFn = (
  control: ControlItem,
  target: AssessmentTarget,
  provider: EvidenceProvider
) => Promise<AssessControlResult>;

/**
 * For collectors a check expects to yield at most one item. A list here is a
 * provider defect, and picking an element would let the rule run against
 * evidence chosen by accident — so it throws rather than guessing.
 */
async function collectSingle(
  provider: EvidenceProvider,
  collectorName: string,
  target: AssessmentTarget
): Promise<RawEvidence | null> {
  // Through the executor, never provider.collect() directly: the catalog guard
  // applies to code-run checks exactly as it does to model tool calls.
  const result = await executeCollector(collectorName, provider, target);
  if (Array.isArray(result)) {
    throw new Error(
      `Collector "${collectorName}" returned a list (${result.length} items) where a deterministic check expects a single evidence item`
    );
  }
  return result;
}

/**
 * Every deterministic check must run its judgment through the SAME guards the
 * LLM path is forced through (`parseJudgment`, `validateCitations`) before
 * returning — silent-failure-hunter finding: a hand-built Judgment literal
 * that skips both guards is only safe today because these two functions are
 * correct today. A future edit that introduces a mismatched cited id would
 * have had zero runtime signal without this. Centralized here so every
 * current and future deterministic check gets it automatically, not by each
 * author remembering to call both by hand.
 */
function finalizeJudgment(judgment: Judgment, store: EvidenceStore): Judgment {
  const parsed = parseJudgment(judgment, judgment.controlId);
  validateCitations(parsed, store);
  return parsed;
}

/**
 * Reads a required string field off an evidence payload, returning `null`
 * (never `undefined`, never silently coercing) if the field is missing or
 * not a string. Silent-failure-hunter finding: an unguarded `as` cast let a
 * malformed/unexpected payload shape (e.g. a real, non-fixture provider
 * returning different field names) silently evaluate `undefined === "X"` as
 * `false` and produce a confident, WRONG `not-satisfied` verdict instead of
 * an honest `insufficient-evidence` one. Every deterministic check must
 * route field reads through this (or the array-typed sibling below), never
 * a bare `as` cast.
 */
function readStringField(payload: unknown, field: string): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const v = (payload as Record<string, unknown>)[field];
  return typeof v === "string" ? v : null;
}

function readBooleanField(payload: unknown, field: string): boolean | null {
  if (typeof payload !== "object" || payload === null) return null;
  const v = (payload as Record<string, unknown>)[field];
  return typeof v === "boolean" ? v : null;
}

function readStringArrayField(payload: unknown, field: string): string[] | null {
  if (typeof payload !== "object" || payload === null) return null;
  const v = (payload as Record<string, unknown>)[field];
  if (!Array.isArray(v)) return null;
  return v.every((x) => typeof x === "string") ? v : null;
}

/** Present but unreadable in the expected shape — a real, if rare, condition distinct from `raw === null` ("nothing retrieved at all"). Both collapse to `insufficient-evidence`, but for a different, equally honest reason. */
function malformedEvidenceJudgment(control: ControlItem, collectorName: string, evidenceId: string, missingFields: string[]): Judgment {
  return {
    controlId: control.id,
    status: "insufficient-evidence",
    confidence: "high",
    rationale:
      `Evidence was retrieved from ${collectorName}, but it did not have the expected shape — ` +
      `missing or non-conforming field(s): ${missingFields.join(", ")}. Cannot evaluate the rule against malformed evidence.`,
    evidenceCited: [evidenceId],
    gaps: [`Evidence payload from ${collectorName} is missing or has the wrong type for: ${missingFields.join(", ")}.`],
  };
}

const KMS_CONFIG = "getKMSConfig" satisfies keyof AwsProvider;
const NETWORK_CONFIG = "getEndpointNetworkConfig" satisfies keyof AwsProvider;

async function checkSC28(
  control: ControlItem,
  target: AssessmentTarget,
  provider: EvidenceProvider
): Promise<AssessControlResult> {
  const store = new EvidenceStore();
  const raw = await collectSingle(provider, KMS_CONFIG, target);

  if (raw === null) {
    return {
      judgment: finalizeJudgment(
        {
          controlId: control.id,
          status: "insufficient-evidence",
          confidence: "high",
          rationale:
            "No KMS configuration evidence was retrievable for this target — there is nothing to check the encryption-at-rest rule against.",
          evidenceCited: [],
          gaps: ["No KMS configuration evidence exists for this target."],
        },
        store
      ),
      store,
      iterations: 0,
      calledCollectors: new Set(["getKMSConfig"]),
      citedCollectors: new Set(),
    };
  }

  const item = store.add(raw);
  const keyManager = readStringField(item.payload, "keyManager");

  if (keyManager === null) {
    return {
      judgment: finalizeJudgment(malformedEvidenceJudgment(control, "getKMSConfig", item.id, ["keyManager"]), store),
      store,
      iterations: 0,
      calledCollectors: new Set(["getKMSConfig"]),
      citedCollectors: new Set(["getKMSConfig"]),
    };
  }

  const satisfied = keyManager === "CUSTOMER";
  const judgment: Judgment = {
    controlId: control.id,
    status: satisfied ? "satisfied" : "not-satisfied",
    confidence: "high",
    rationale: satisfied
      ? "KMS key manager is CUSTOMER — model artifacts and endpoint volumes are encrypted with a customer-managed key, matching the control's exact rule."
      : `KMS key manager is "${keyManager}", not CUSTOMER — the control requires customer-managed keys, not AWS-managed ones.`,
    evidenceCited: [item.id],
    gaps: satisfied ? [] : ["Volume/artifact encryption uses an AWS-managed key, not a customer-managed key."],
  };

  return {
    judgment: finalizeJudgment(judgment, store),
    store,
    iterations: 0,
    calledCollectors: new Set(["getKMSConfig"]),
    citedCollectors: new Set(["getKMSConfig"]),
  };
}

async function checkSC7(
  control: ControlItem,
  target: AssessmentTarget,
  provider: EvidenceProvider
): Promise<AssessControlResult> {
  const store = new EvidenceStore();
  const raw = await collectSingle(provider, NETWORK_CONFIG, target);

  if (raw === null) {
    return {
      judgment: finalizeJudgment(
        {
          controlId: control.id,
          status: "insufficient-evidence",
          confidence: "high",
          rationale:
            "No network configuration evidence was retrievable for this target — there is nothing to check the boundary-protection rule against.",
          evidenceCited: [],
          gaps: ["No endpoint network configuration evidence exists for this target."],
        },
        store
      ),
      store,
      iterations: 0,
      calledCollectors: new Set(["getEndpointNetworkConfig"]),
      citedCollectors: new Set(),
    };
  }

  const item = store.add(raw);
  const isolated = readBooleanField(item.payload, "enableNetworkIsolation");
  const vpcId = readStringField(item.payload, "vpcId"); // null is a valid "no VPC" value, not malformed
  const securityGroupIds = readStringArrayField(item.payload, "securityGroupIds");

  const malformedFields: string[] = [];
  if (isolated === null) malformedFields.push("enableNetworkIsolation");
  if (securityGroupIds === null) malformedFields.push("securityGroupIds");
  // vpcId is allowed to be genuinely absent (null/undefined means "no VPC"), so it's
  // only "malformed" if present but not a string — checked separately below.
  const rawVpcId = (item.payload as Record<string, unknown>)?.vpcId;
  if (rawVpcId != null && typeof rawVpcId !== "string") malformedFields.push("vpcId");

  if (malformedFields.length > 0) {
    return {
      judgment: finalizeJudgment(malformedEvidenceJudgment(control, "getEndpointNetworkConfig", item.id, malformedFields), store),
      store,
      iterations: 0,
      calledCollectors: new Set(["getEndpointNetworkConfig"]),
      citedCollectors: new Set(["getEndpointNetworkConfig"]),
    };
  }

  const hasVpc = vpcId !== null;
  const hasSecurityGroup = securityGroupIds !== null && securityGroupIds.length > 0;
  const satisfied = isolated === true && hasVpc && hasSecurityGroup;

  const missing: string[] = [];
  if (isolated !== true) missing.push("network isolation is not enabled");
  if (!hasVpc) missing.push("no VPC is present");
  if (!hasSecurityGroup) missing.push("no security group is attached");

  const judgment: Judgment = {
    controlId: control.id,
    status: satisfied ? "satisfied" : "not-satisfied",
    confidence: "high",
    rationale: satisfied
      ? "Network isolation is enabled, a VPC is present, and at least one security group is attached — all three required conditions hold."
      : `Boundary protection is not satisfied: ${missing.join("; ")}.`,
    evidenceCited: [item.id],
    gaps: satisfied ? [] : missing,
  };

  return {
    judgment: finalizeJudgment(judgment, store),
    store,
    iterations: 0,
    calledCollectors: new Set(["getEndpointNetworkConfig"]),
    citedCollectors: new Set(["getEndpointNetworkConfig"]),
  };
}

const POC_RECORDS = "getEvidenceRecords" satisfies PocCollector;

/** For collectors that yield one item per record: null is an empty list, a single item a list of one. */
async function collectAll(
  provider: EvidenceProvider,
  collectorName: string,
  target: AssessmentTarget
): Promise<RawEvidence[]> {
  const result = await executeCollector(collectorName, provider, target);
  if (result === null) return [];
  return Array.isArray(result) ? result : [result];
}

/**
 * Shared shape of the four Proof-of-Control checks (M8b): collect every
 * stream record, read each payload through the guarded reader, hand the
 * records to a pure rule (`poc-evidence-rules.ts`), and turn its decision
 * into a Judgment that goes through `finalizeJudgment` like every other check.
 * The same three outcomes as `checkSC28`: nothing retrieved, malformed, evaluated.
 */
async function checkPocStream(
  control: ControlItem,
  target: AssessmentTarget,
  provider: EvidenceProvider,
  rule: (records: readonly StreamRecord[]) => RuleDecision
): Promise<AssessControlResult> {
  const store = new EvidenceStore();
  const items = (await collectAll(provider, POC_RECORDS, target)).map((r) => store.add(r));
  const called = new Set([POC_RECORDS]);

  if (items.length === 0) {
    return {
      judgment: finalizeJudgment(
        {
          controlId: control.id,
          status: "insufficient-evidence",
          confidence: "high",
          rationale:
            "The evidence stream holds no records — there is nothing to check the rule against.",
          evidenceCited: [],
          gaps: ["The evidence stream is empty."],
        },
        store
      ),
      store,
      iterations: 0,
      calledCollectors: called,
      citedCollectors: new Set(),
    };
  }

  const records: StreamRecord[] = [];
  for (const item of items) {
    const read = readStreamRecord(item.payload);
    if ("problems" in read) {
      return {
        judgment: finalizeJudgment(malformedEvidenceJudgment(control, POC_RECORDS, item.id, read.problems), store),
        store,
        iterations: 0,
        calledCollectors: called,
        citedCollectors: new Set([POC_RECORDS]),
      };
    }
    records.push(read.record);
  }

  const decision = rule(records);
  const judgment: Judgment = {
    controlId: control.id,
    status: decision.status,
    confidence: "high",
    rationale: decision.rationale,
    evidenceCited: decision.cite.map((at) => items[at]!.id),
    gaps: decision.gaps,
  };
  return {
    judgment: finalizeJudgment(judgment, store),
    store,
    iterations: 0,
    calledCollectors: called,
    citedCollectors: judgment.evidenceCited.length > 0 ? new Set([POC_RECORDS]) : new Set(),
  };
}

/**
 * A registered check names the family it was written for and every collector
 * it runs. Both are verified by `runAssessment()`'s preflight: control ids
 * are not unique across families, and a check reaches for collectors by name
 * no matter what the control's own `collectors` list says.
 */
export type DeterministicCheck = {
  family: string;
  requires: readonly string[];
  run: DeterministicCheckFn;
};

/** Collector names are compiler-checked against the family's typed surface. */
function sageMakerCheck(
  requires: readonly (keyof AwsProvider)[],
  run: DeterministicCheckFn
): DeterministicCheck {
  return { family: AWS_SAGEMAKER_FAMILY, requires, run };
}

/** Every Proof-of-Control check reads the stream records and nothing else. */
function pocCheck(rule: (records: readonly StreamRecord[]) => RuleDecision): DeterministicCheck {
  return {
    family: POC_EVIDENCE_FAMILY,
    requires: [POC_RECORDS],
    run: (control, target, provider) => checkPocStream(control, target, provider, rule),
  };
}

/**
 * Per-control-ID registry, not per-pattern — each deterministic control's rule
 * is genuinely different code, mirroring how collectors are dispatched by name
 * rather than by a declarative rule DSL (no eval, no dynamic rule language
 * anywhere in this codebase; this doesn't start one).
 *
 * M3d capped this at the two SageMaker checks pending a fresh scoping pass;
 * the M8b scoping (one claim per check, each with its falsifier) added the
 * four Proof-of-Control checks. A further check needs the same.
 */
export const DETERMINISTIC_CHECKS: Record<string, DeterministicCheck> = {
  "SC-28": sageMakerCheck([KMS_CONFIG], checkSC28),
  "SC-7": sageMakerCheck([NETWORK_CONFIG], checkSC7),
  "PoC-7.7.1": pocCheck(schemaValidity),
  "PoC-7.7.3": pocCheck(digestIdentification),
  "PoC-7.7.5": pocCheck(duplicateKeys),
  "PoC-7.6.2": pocCheck(stepContinuity),
};

/** Own-property lookup: a control id of "constructor" has no check. */
export function findDeterministicCheck(
  controlId: string
): DeterministicCheck | undefined {
  return Object.hasOwn(DETERMINISTIC_CHECKS, controlId)
    ? DETERMINISTIC_CHECKS[controlId]
    : undefined;
}
