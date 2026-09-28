import { describe, it, expect } from "bun:test";
import { validateCitations, CitationError, UncitedVerdictError } from "./citation-guard.js";
import { EvidenceStore } from "../store/evidence-store.js";
import type { Judgment } from "../types.js";

function makeStore(...ids: string[]): EvidenceStore {
  const store = new EvidenceStore();
  for (const id of ids) {
    store.add({ id, source: "test", retrievedAt: new Date().toISOString(), payload: { x: id } });
  }
  return store;
}

function makeJudgment(evidenceCited: string[]): Judgment {
  return {
    controlId: "TEST-1",
    status: "satisfied",
    confidence: "high",
    rationale: "Test rationale",
    evidenceCited,
    gaps: [],
  };
}

describe("validateCitations", () => {
  it("passes when all cited IDs are in the store", () => {
    const store = makeStore("id-a", "id-b");
    expect(() => validateCitations(makeJudgment(["id-a", "id-b"]), store)).not.toThrow();
  });

  it("passes when evidenceCited is empty", () => {
    const store = makeStore("id-a");
    // M8c: empty citations pass only for a verdict that asserts no conformance.
    expect(() => validateCitations({ ...makeJudgment([]), status: "insufficient-evidence" }, store)).not.toThrow();
  });

  it("M8c: satisfied or partially-satisfied with nothing cited is refused by name", () => {
    const store = makeStore("id-a");
    for (const status of ["satisfied", "partially-satisfied"] as const) {
      let caught: unknown;
      try {
        validateCitations({ ...makeJudgment([]), status }, store);
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(UncitedVerdictError);
      expect((caught as UncitedVerdictError).status).toBe(status);
      expect((caught as UncitedVerdictError).message).toContain(`"${status}" but cites no evidence`);
    }
  });

  it("M8c: not-satisfied, not-applicable and insufficient-evidence may cite nothing", () => {
    const store = makeStore("id-a");
    for (const status of ["not-satisfied", "not-applicable", "insufficient-evidence"] as const) {
      expect(() => validateCitations({ ...makeJudgment([]), status }, store)).not.toThrow();
    }
  });

  it("M8c: a phantom id is still a CitationError, checked before the uncited rule", () => {
    expect(() => validateCitations(makeJudgment(["phantom"]), makeStore())).toThrow(CitationError);
  });

  it("throws CitationError when an ID is not in the store", () => {
    const store = makeStore("id-a");
    expect(() => validateCitations(makeJudgment(["id-a", "not-in-store"]), store)).toThrow(
      CitationError
    );
  });

  it("CitationError message includes the invalid ID", () => {
    const store = makeStore("id-a");
    try {
      validateCitations(makeJudgment(["phantom-id"]), store);
      expect(true).toBe(false); // should not reach here
    } catch (e) {
      expect(e).toBeInstanceOf(CitationError);
      expect((e as CitationError).message).toContain("phantom-id");
      expect((e as CitationError).invalidId).toBe("phantom-id");
    }
  });

  it("throws on the first invalid ID it encounters", () => {
    const store = makeStore("good-id");
    let caught: CitationError | null = null;
    try {
      validateCitations(makeJudgment(["bad-1", "bad-2"]), store);
    } catch (e) {
      caught = e as CitationError;
    }
    expect(caught).toBeInstanceOf(CitationError);
    expect(caught?.invalidId).toBe("bad-1");
  });
});
