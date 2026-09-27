import { describe, it, expect } from "bun:test";
import { parseJsonStrict, DuplicateKeyError, StrictJsonSyntaxError } from "./strict-json.js";

describe("parseJsonStrict (M6) — duplicate keys are violations, not last-wins", () => {
  it("agrees with JSON.parse on well-formed documents", () => {
    const docs = [
      `{"a":1,"b":[1,2.5,-3e2,"x\\n\\u00e9",true,false,null],"c":{"d":{}}}`,
      `  [ ]  `,
      `"str"`,
      `0`,
      `-0.5E-3`,
      `{"\\"quoted\\" key":"v"}`,
    ];
    for (const d of docs) {
      expect(parseJsonStrict(d)).toEqual(JSON.parse(d));
    }
  });

  it("throws DuplicateKeyError naming key and path at the top level", () => {
    let caught: unknown;
    try {
      parseJsonStrict(`{"rootHash":"a","rootHash":"b"}`);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(DuplicateKeyError);
    expect((caught as DuplicateKeyError).key).toBe("rootHash");
    expect((caught as DuplicateKeyError).path).toBe("$");
    // The thing JSON.parse would have done silently:
    expect(JSON.parse(`{"rootHash":"a","rootHash":"b"}`).rootHash).toBe("b");
  });

  it("throws DuplicateKeyError for a duplicate nested inside an array element", () => {
    let caught: unknown;
    try {
      parseJsonStrict(`{"files":[{"path":"a","path":"b"}]}`);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(DuplicateKeyError);
    expect((caught as DuplicateKeyError).key).toBe("path");
    expect((caught as DuplicateKeyError).path).toBe("$.files[0]");
  });

  it("treats keys as distinct only by exact string — escaped forms collapse", () => {
    // "a" is "a": the same key spelled two ways is still a duplicate.
    expect(() => parseJsonStrict(`{"a":1,"\\u0061":2}`)).toThrow(DuplicateKeyError);
  });

  it("keeps a \"__proto__\" member as an own key, as JSON.parse does", () => {
    const doc = `{"__proto__":{"verdict":"ALLOW"},"a":1}`;
    const parsed = parseJsonStrict(doc) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual(["__proto__", "a"]);
    expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
    expect(parsed).toEqual(JSON.parse(doc));
  });

  it("rejects malformed input with a StrictJsonSyntaxError, never silently", () => {
    for (const bad of [`{"a":1,}`, `{"a" 1}`, `[1 2]`, `{"a":tru}`, `"unterminated`, `01`, `{"a":1} x`, ``]) {
      expect(() => parseJsonStrict(bad)).toThrow(StrictJsonSyntaxError);
    }
  });
});
