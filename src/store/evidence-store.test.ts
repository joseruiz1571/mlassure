import { describe, it, expect } from "bun:test";
import { EvidenceStore } from "./evidence-store.js";
import type { RawEvidence } from "../types.js";

function makeRaw(id: string, payload: unknown = { x: 1 }): RawEvidence {
  return { id, source: "test:source", retrievedAt: new Date().toISOString(), payload };
}

describe("EvidenceStore", () => {
  it("add() stores an item and has() returns true", () => {
    const store = new EvidenceStore();
    const raw = makeRaw("ev-1");
    store.add(raw);
    expect(store.has("ev-1")).toBe(true);
  });

  it("has() returns false for an unknown id", () => {
    const store = new EvidenceStore();
    expect(store.has("not-there")).toBe(false);
  });

  it("bundle() returns all stored items", () => {
    const store = new EvidenceStore();
    store.add(makeRaw("ev-a", { a: 1 }));
    store.add(makeRaw("ev-b", { b: 2 }));
    const items = store.bundle();
    expect(items).toHaveLength(2);
    expect(items.map((e) => e.id).sort()).toEqual(["ev-a", "ev-b"]);
  });

  it("bundle() returns empty array when store is empty", () => {
    const store = new EvidenceStore();
    expect(store.bundle()).toEqual([]);
  });

  it("add() computes a 64-char hex sha256 from payload", () => {
    const store = new EvidenceStore();
    const evidence = store.add(makeRaw("ev-hash", { key: "value" }));
    expect(evidence.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("sha256 is deterministic for the same payload", () => {
    const store1 = new EvidenceStore();
    const store2 = new EvidenceStore();
    const payload = { stable: true, count: 42 };
    const e1 = store1.add(makeRaw("x", payload));
    const e2 = store2.add(makeRaw("x", payload));
    expect(e1.sha256).toBe(e2.sha256);
  });

  it("add() throws on duplicate id", () => {
    const store = new EvidenceStore();
    store.add(makeRaw("dup"));
    expect(() => store.add(makeRaw("dup"))).toThrow("Duplicate evidence id: dup");
  });

  it("size() reflects item count", () => {
    const store = new EvidenceStore();
    expect(store.size()).toBe(0);
    store.add(makeRaw("s1"));
    expect(store.size()).toBe(1);
    store.add(makeRaw("s2"));
    expect(store.size()).toBe(2);
  });
});
