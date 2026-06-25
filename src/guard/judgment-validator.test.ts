import { describe, it, expect } from "bun:test";
import { parseJudgment, JudgmentShapeError } from "./judgment-validator.js";

function validRaw(): Record<string, unknown> {
  return {
    controlId: "SI-6(1)",
    status: "satisfied",
    confidence: "high",
    rationale: "Data capture enabled and monitor scheduled.",
    evidenceCited: ["ev-1"],
    gaps: [],
  };
}

describe("parseJudgment — happy path", () => {
  it("returns a Judgment unchanged when every field is well-formed", () => {
    const judgment = parseJudgment(validRaw(), "SI-6(1)");
    expect(judgment).toEqual({
      controlId: "SI-6(1)",
      status: "satisfied",
      confidence: "high",
      rationale: "Data capture enabled and monitor scheduled.",
      evidenceCited: ["ev-1"],
      gaps: [],
    });
  });
});

describe("parseJudgment — fails loud on malformed shape", () => {
  it("throws JudgmentShapeError when input is not an object", () => {
    expect(() => parseJudgment("not an object", "SI-6(1)")).toThrow(JudgmentShapeError);
    expect(() => parseJudgment(null, "SI-6(1)")).toThrow(JudgmentShapeError);
  });

  it("throws on an unrecognized status", () => {
    const raw = { ...validRaw(), status: "compliant" };
    expect(() => parseJudgment(raw, "SI-6(1)")).toThrow(/status "compliant" is not one of/);
  });

  it("throws on a missing status", () => {
    const raw = validRaw();
    delete raw.status;
    expect(() => parseJudgment(raw, "SI-6(1)")).toThrow(/status "undefined" is not one of/);
  });

  it("throws on an unrecognized confidence", () => {
    const raw = { ...validRaw(), confidence: "very-high" };
    expect(() => parseJudgment(raw, "SI-6(1)")).toThrow(/confidence "very-high" is not one of/);
  });

  it("throws on an empty rationale", () => {
    const raw = { ...validRaw(), rationale: "" };
    expect(() => parseJudgment(raw, "SI-6(1)")).toThrow(/rationale is missing or empty/);
  });

  it("throws on a whitespace-only rationale", () => {
    const raw = { ...validRaw(), rationale: "   " };
    expect(() => parseJudgment(raw, "SI-6(1)")).toThrow(/rationale is missing or empty/);
  });

  it("throws when gaps is a string instead of an array", () => {
    const raw = { ...validRaw(), gaps: "No retention policy" };
    expect(() => parseJudgment(raw, "SI-6(1)")).toThrow(/gaps is not a string array/);
  });

  it("throws when evidenceCited is undefined", () => {
    const raw = validRaw();
    delete raw.evidenceCited;
    expect(() => parseJudgment(raw, "SI-6(1)")).toThrow(/evidenceCited is not a string array/);
  });

  it("throws when evidenceCited contains a non-string element", () => {
    const raw = { ...validRaw(), evidenceCited: ["ev-1", 42] };
    expect(() => parseJudgment(raw, "SI-6(1)")).toThrow(/evidenceCited is not a string array/);
  });

  it("throws on a missing controlId", () => {
    const raw = validRaw();
    delete raw.controlId;
    expect(() => parseJudgment(raw, "SI-6(1)")).toThrow(/controlId is missing or empty/);
  });

  it("error message names the control being assessed", () => {
    try {
      parseJudgment({ ...validRaw(), status: "compliant" }, "AU-12(3)");
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(JudgmentShapeError);
      expect((err as Error).message).toContain("AU-12(3)");
    }
  });
});
