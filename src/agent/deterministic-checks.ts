import type { ControlItem, AssessmentTarget, Judgment } from "../types.js";
import type { AwsProvider } from "../providers/aws-provider.interface.js";
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
  provider: AwsProvider
) => Promise<AssessControlResult>;

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
 * malformed/unexpected payload shape (e.g. a real, non-fixture AwsProvider
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

async function checkSC28(
  control: ControlItem,
  target: AssessmentTarget,
  provider: AwsProvider
): Promise<AssessControlResult> {
  const store = new EvidenceStore();
  const raw = await provider.getKMSConfig(target);

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
  provider: AwsProvider
): Promise<AssessControlResult> {
  const store = new EvidenceStore();
  const raw = await provider.getEndpointNetworkConfig(target);

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

/**
 * Per-control-ID registry, not per-pattern — each deterministic control's rule
 * is genuinely different code, mirroring how collectors are dispatched by name
 * rather than by a declarative rule DSL (no eval, no dynamic rule language
 * anywhere in this codebase; this doesn't start one).
 *
 * Scope is deliberately capped at these 2 controls (M3d advisor decision) —
 * do not add a 3rd/4th without a fresh scoping pass.
 */
export const DETERMINISTIC_CHECKS: Record<string, DeterministicCheckFn> = {
  "SC-28": checkSC28,
  "SC-7": checkSC7,
};
