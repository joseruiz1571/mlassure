import type { Judgment } from "../types.js";
import { JUDGMENT_STATUSES, JUDGMENT_CONFIDENCES } from "../types.js";

export class JudgmentShapeError extends Error {
  constructor(controlId: string, reason: string) {
    super(`Agent submitted an invalid judgment for control "${controlId}": ${reason}`);
    this.name = "JudgmentShapeError";
  }
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

/**
 * The LLM tool-call `input` is `unknown` at the SDK boundary, but agent.ts
 * previously did a bare `as Judgment` cast there — a compile-time-only
 * guarantee that lets a hallucinated status, an omitted field, or a string
 * where an array was expected pass straight through. citation-guard.ts only
 * checks evidence-id membership; nothing previously checked the rest of the
 * shape. Every downstream consumer (OSCAL writer, narrative renderer) then
 * trusted that shape as real, which is how a malformed status reached the
 * narrative renderer as `"undefined undefined"` instead of failing loud at
 * the actual point of ingestion. This is the fix at that point.
 */
export function parseJudgment(raw: unknown, controlId: string): Judgment {
  if (typeof raw !== "object" || raw === null) {
    throw new JudgmentShapeError(controlId, "submit_judgment input is not an object");
  }
  const j = raw as Record<string, unknown>;

  if (typeof j.controlId !== "string" || j.controlId.trim().length === 0) {
    throw new JudgmentShapeError(controlId, "controlId is missing or empty");
  }
  if (
    typeof j.status !== "string" ||
    !JUDGMENT_STATUSES.includes(j.status as Judgment["status"])
  ) {
    throw new JudgmentShapeError(
      controlId,
      `status "${String(j.status)}" is not one of ${JUDGMENT_STATUSES.join(", ")}`
    );
  }
  if (
    typeof j.confidence !== "string" ||
    !JUDGMENT_CONFIDENCES.includes(j.confidence as Judgment["confidence"])
  ) {
    throw new JudgmentShapeError(
      controlId,
      `confidence "${String(j.confidence)}" is not one of ${JUDGMENT_CONFIDENCES.join(", ")}`
    );
  }
  if (typeof j.rationale !== "string" || j.rationale.trim().length === 0) {
    throw new JudgmentShapeError(controlId, "rationale is missing or empty");
  }
  if (!isStringArray(j.evidenceCited)) {
    throw new JudgmentShapeError(controlId, "evidenceCited is not a string array");
  }
  if (!isStringArray(j.gaps)) {
    throw new JudgmentShapeError(controlId, "gaps is not a string array");
  }

  return {
    controlId: j.controlId,
    status: j.status as Judgment["status"],
    confidence: j.confidence as Judgment["confidence"],
    rationale: j.rationale,
    evidenceCited: j.evidenceCited,
    gaps: j.gaps,
  };
}
