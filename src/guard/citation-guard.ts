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

export function validateCitations(
  judgment: Judgment,
  store: EvidenceStore
): void {
  for (const id of judgment.evidenceCited) {
    if (!store.has(id)) {
      throw new CitationError(id);
    }
  }
}
