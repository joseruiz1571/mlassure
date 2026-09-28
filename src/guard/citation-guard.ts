import type { Judgment } from "../types.js";
import type { EvidenceStore } from "../store/evidence-store.js";

export class CitationError extends Error {
  constructor(public readonly invalidId: string) {
    super(
      `Judgment cites evidence id "${invalidId}" that was not retrieved in this run`
    );
    this.name = "CitationError";
  }
}

/**
 * Verdicts that assert some conformance (M8c). `partially-satisfied` is one:
 * it says part of the control holds. The other three may cite nothing,
 * since "nothing exists to retrieve" is a legitimate finding.
 */
const ASSERTS_CONFORMANCE: ReadonlySet<Judgment["status"]> = new Set([
  "satisfied",
  "partially-satisfied",
]);

/**
 * Thrown when a judgment asserts conformance with nothing cited (M8c). The
 * agent loop returns this one to the model as the `submit_judgment` result
 * so it can collect and cite, or submit an honest verdict; a code-run check
 * lets it propagate, because there it is a defect. Never downgraded.
 */
export class UncitedVerdictError extends Error {
  constructor(
    public readonly controlId: string,
    public readonly status: Judgment["status"]
  ) {
    super(
      `Judgment for control "${controlId}" is "${status}" but cites no evidence. A verdict that asserts conformance must cite at least one evidence id retrieved in this session; if nothing supports it, the verdict is not "${status}".`
    );
    this.name = "UncitedVerdictError";
  }
}

export function validateCitations(
  judgment: Judgment,
  store: EvidenceStore
): void {
  for (const id of judgment.evidenceCited) {
    if (!store.has(id)) {
      throw new CitationError(id);
    }
  }
  if (judgment.evidenceCited.length === 0 && ASSERTS_CONFORMANCE.has(judgment.status)) {
    throw new UncitedVerdictError(judgment.controlId, judgment.status);
  }
}
