/**
 * Conformance vectors (M6, SPEC.md §7; Proof-of-Control C7.7.4).
 *
 * Every positive vector must verify with zero violations and its rootHash
 * must be reproducible from its own manifest. Every negative vector must be
 * rejected FOR THE REASON IT WAS WRITTEN TO TEST — an error pattern from its
 * EXPECTED.json must match at least one actual violation. A rejection on
 * some other ground is a failed test: it does not demonstrate the named
 * check exists. The suite also fails if the fixture tree is missing or
 * thinner than it should be, so a deleted directory cannot pass vacuously.
 */
import { describe, it, expect } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { computeRootHash, verifyEvidenceBundle, type BundleManifest } from "./bundle.js";

const VECTORS = join(import.meta.dir, "../../fixtures/bundles");
const POSITIVE = join(VECTORS, "positive");
const NEGATIVE = join(VECTORS, "negative");

type Expected = { check: string; errorPattern: string; description: string };

function dirs(root: string): string[] {
  return readdirSync(root).filter((n) => statSync(join(root, n)).isDirectory()).sort();
}

const positives = dirs(POSITIVE);
const negatives = dirs(NEGATIVE);

describe("conformance vectors — fixture tree", () => {
  it("has at least 1 positive and at least 12 negative vectors (never passes vacuously)", () => {
    expect(positives.length).toBeGreaterThanOrEqual(1);
    expect(negatives.length).toBeGreaterThanOrEqual(12);
  });

  it("every negative vector has an EXPECTED.json beside it naming check + errorPattern", () => {
    for (const name of negatives) {
      const p = join(NEGATIVE, `${name}.EXPECTED.json`);
      expect(existsSync(p), `missing ${name}.EXPECTED.json`).toBe(true);
      const e = JSON.parse(readFileSync(p, "utf-8")) as Expected;
      expect(e.check).toMatch(/^V-\d+$/);
      expect(typeof e.errorPattern).toBe("string");
      expect(e.errorPattern.length).toBeGreaterThan(0);
    }
  });

  it("has no orphan EXPECTED.json without a vector directory", () => {
    const orphans = readdirSync(NEGATIVE)
      .filter((n) => n.endsWith(".EXPECTED.json"))
      .map((n) => n.replace(/\.EXPECTED\.json$/, ""))
      .filter((n) => !negatives.includes(n));
    expect(orphans).toEqual([]);
  });
});

describe("conformance vectors — positive", () => {
  for (const name of positives) {
    const dir = join(POSITIVE, name);
    it(`${name}: verifies with zero violations`, () => {
      const r = verifyEvidenceBundle(dir);
      expect(r.errors).toEqual([]);
      expect(r.ok).toBe(true);
      expect(r.checkedFiles).toBeGreaterThan(0);
    });
    it(`${name}: rootHash is reproducible from its own manifest (SPEC §4.1, §7 clause c)`, () => {
      const m = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf-8")) as BundleManifest;
      const recomputed = computeRootHash(
        {
          bundleFormatVersion: m.bundleFormatVersion,
          algorithm: m.algorithm,
          createdAt: m.createdAt,
          targetName: m.targetName,
          controlSetVersion: m.controlSetVersion,
        },
        m.files
      );
      expect(recomputed).toBe(m.rootHash);
    });
  }
});

describe("conformance vectors — negative (rejected for the stated reason)", () => {
  for (const name of negatives) {
    const dir = join(NEGATIVE, name);
    const expectedPath = join(NEGATIVE, `${name}.EXPECTED.json`);
    it(`${name}`, () => {
      const expected = JSON.parse(readFileSync(expectedPath, "utf-8")) as Expected;
      const r = verifyEvidenceBundle(dir);
      expect(r.ok, `${name} verified OK — the fault did not take effect`).toBe(false);
      const re = new RegExp(expected.errorPattern);
      const hit = r.errors.some((e) => re.test(e));
      expect(
        hit,
        `${name} (${expected.check}) was rejected for the WRONG reason.\n` +
          `expected /${expected.errorPattern}/\nactual errors:\n${r.errors.map((e) => `  - ${e}`).join("\n")}`
      ).toBe(true);
    });
  }
});
