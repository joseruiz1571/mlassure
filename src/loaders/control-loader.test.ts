/**
 * Tag-provenance loader tests (M3f). Every directional-chain invariant is
 * exercised with synthetic control YAML — the real fixture carries only
 * origin records (its tags have never migrated), so a green run against it
 * proves almost none of the seven invariants. Synthetic data covers the
 * rest; the fixture test at the bottom pins the real file's honesty
 * properties (8 origin records, zero fabricated migrations).
 */

import { describe, it, expect, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadControlSet } from "./control-loader.js";

const dir = mkdtempSync(join(tmpdir(), "mlassure-loader-test-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let fileCounter = 0;
async function loadYaml(yaml: string) {
  const p = join(dir, `controls-${fileCounter++}.yaml`);
  writeFileSync(p, yaml);
  return loadControlSet(p);
}

function controlYaml(provenanceBlock: string, livePattern = "synthesis"): string {
  return `
version: "0.0.1-test"
controls:
  - id: "TEST-1"
    framework: "test"
    pattern: ${livePattern}
    intent: "test control"
    collectors: []
${provenanceBlock}
`;
}

describe("control loader — tagProvenance (M3f)", () => {
  it("loads a control without tagProvenance unchanged (backward compat)", async () => {
    const set = await loadYaml(controlYaml(""));
    expect(set.controls[0]!.tagProvenance).toBeUndefined();
  });

  it("parses a valid origin-only record into typed provenance", async () => {
    const set = await loadYaml(
      controlYaml(`    tagProvenance:
      - pattern: synthesis
        assigned: "2026-06-10"
        rationale: "origin"`)
    );
    const prov = set.controls[0]!.tagProvenance!;
    expect(prov).toHaveLength(1);
    expect(prov[0]!).toEqual({
      pattern: "synthesis",
      assigned: "2026-06-10",
      rationale: "origin",
    });
  });

  it("parses a valid directional migration chain", async () => {
    const set = await loadYaml(
      controlYaml(
        `    tagProvenance:
      - pattern: synthesis
        assigned: "2026-06-10"
        rationale: "origin"
      - pattern: deterministic
        assigned: "2026-07-19"
        supersedes: synthesis
        rationale: "code check landed"`,
        "deterministic"
      )
    );
    const prov = set.controls[0]!.tagProvenance!;
    expect(prov).toHaveLength(2);
    expect(prov[1]!.supersedes).toBe("synthesis");
  });

  it("permits pattern re-adoption (A → B → A is documented-legal)", async () => {
    const set = await loadYaml(
      controlYaml(`    tagProvenance:
      - pattern: synthesis
        assigned: "2026-01-01"
        rationale: "origin"
      - pattern: sufficiency
        assigned: "2026-02-01"
        supersedes: synthesis
        rationale: "trial migration"
      - pattern: synthesis
        assigned: "2026-03-01"
        supersedes: sufficiency
        rationale: "migration reverted — re-adoption"`)
    );
    expect(set.controls[0]!.tagProvenance).toHaveLength(3);
  });

  it("permits same-day consecutive records (non-decreasing, not strict)", async () => {
    const set = await loadYaml(
      controlYaml(
        `    tagProvenance:
      - pattern: synthesis
        assigned: "2026-07-19"
        rationale: "origin"
      - pattern: deterministic
        assigned: "2026-07-19"
        supersedes: synthesis
        rationale: "same-day migration"`,
        "deterministic"
      )
    );
    expect(set.controls[0]!.tagProvenance).toHaveLength(2);
  });

  it("permits a retired (non-registry) pattern name in a HISTORICAL record", async () => {
    const set = await loadYaml(
      controlYaml(`    tagProvenance:
      - pattern: retired-legacy-pattern
        assigned: "2026-01-01"
        rationale: "origin under a vocabulary since retired"
      - pattern: synthesis
        assigned: "2026-02-01"
        supersedes: retired-legacy-pattern
        rationale: "migrated to current vocabulary"`)
    );
    expect(set.controls[0]!.tagProvenance![0]!.pattern).toBe("retired-legacy-pattern");
  });

  const throwCases: Array<{ name: string; yaml: string; live?: string; msg: RegExp }> = [
    {
      name: "empty tagProvenance array",
      yaml: `    tagProvenance: []`,
      msg: /present but empty/,
    },
    {
      name: "non-string pattern in a record",
      yaml: `    tagProvenance:
      - pattern: 42
        assigned: "2026-06-10"
        rationale: "x"`,
      msg: /non-empty string "pattern"/,
    },
    {
      name: "malformed assigned date",
      yaml: `    tagProvenance:
      - pattern: synthesis
        assigned: "June 10, 2026"
        rationale: "x"`,
      msg: /valid YYYY-MM-DD/,
    },
    {
      name: "impossible calendar date (2026-13-45)",
      yaml: `    tagProvenance:
      - pattern: synthesis
        assigned: "2026-13-45"
        rationale: "x"`,
      msg: /valid YYYY-MM-DD/,
    },
    {
      name: "missing rationale",
      yaml: `    tagProvenance:
      - pattern: synthesis
        assigned: "2026-06-10"`,
      msg: /non-empty "rationale"/,
    },
    {
      name: "empty rationale",
      yaml: `    tagProvenance:
      - pattern: synthesis
        assigned: "2026-06-10"
        rationale: "   "`,
      msg: /non-empty "rationale"/,
    },
    {
      name: "supersedes on the origin record",
      yaml: `    tagProvenance:
      - pattern: synthesis
        assigned: "2026-06-10"
        supersedes: sufficiency
        rationale: "x"`,
      msg: /origin record must not carry "supersedes"/,
    },
    {
      name: "missing supersedes on a later record",
      yaml: `    tagProvenance:
      - pattern: sufficiency
        assigned: "2026-06-10"
        rationale: "x"
      - pattern: synthesis
        assigned: "2026-07-19"
        rationale: "x"`,
      msg: /must name "supersedes"/,
    },
    {
      name: "broken migration chain (supersedes ≠ previous pattern)",
      yaml: `    tagProvenance:
      - pattern: sufficiency
        assigned: "2026-06-10"
        rationale: "x"
      - pattern: synthesis
        assigned: "2026-07-19"
        supersedes: correlation
        rationale: "x"`,
      msg: /broken migration chain/,
    },
    {
      name: "decreasing chronological order",
      yaml: `    tagProvenance:
      - pattern: sufficiency
        assigned: "2026-07-19"
        rationale: "x"
      - pattern: synthesis
        assigned: "2026-06-10"
        supersedes: sufficiency
        rationale: "x"`,
      msg: /non-decreasing chronological order/,
    },
    {
      name: "head-of-history drift (last record ≠ live pattern)",
      yaml: `    tagProvenance:
      - pattern: sufficiency
        assigned: "2026-06-10"
        rationale: "x"`,
      msg: /history head must match the live tag/,
    },
    {
      name: "unknown key on a record (misspelled supersedes on origin)",
      yaml: `    tagProvenance:
      - pattern: synthesis
        assigned: "2026-06-10"
        rationale: "x"
        superceded: sufficiency`,
      msg: /unknown field\(s\) superceded/,
    },
    {
      name: "interior line breaks in rationale (YAML literal block)",
      yaml: `    tagProvenance:
      - pattern: synthesis
        assigned: "2026-06-10"
        rationale: |
          line one

          line two`,
      msg: /interior line breaks/,
    },
    {
      name: "reserved character in pattern",
      yaml: `    tagProvenance:
      - pattern: "legacy→name"
        assigned: "2026-06-10"
        rationale: "x"`,
      msg: /reserved character/,
    },
    {
      name: "reserved character in supersedes",
      yaml: `    tagProvenance:
      - pattern: sufficiency
        assigned: "2026-06-10"
        rationale: "x"
      - pattern: synthesis
        assigned: "2026-07-19"
        supersedes: "sufficiency@old"
        rationale: "x"`,
      msg: /reserved character/,
    },
  ];

  for (const tc of throwCases) {
    it(`throws on ${tc.name}`, async () => {
      await expect(loadYaml(controlYaml(tc.yaml, tc.live ?? "synthesis"))).rejects.toThrow(
        tc.msg
      );
    });

    it(`error for ${tc.name} names the offending control id`, async () => {
      await expect(loadYaml(controlYaml(tc.yaml, tc.live ?? "synthesis"))).rejects.toThrow(
        /TEST-1/
      );
    });
  }

  it("trims the trailing newline YAML folded scalars append to rationale", async () => {
    const set = await loadYaml(
      controlYaml(`    tagProvenance:
      - pattern: synthesis
        assigned: "2026-06-10"
        rationale: >
          folded scalar rationale`)
    );
    expect(set.controls[0]!.tagProvenance![0]!.rationale).toBe(
      "folded scalar rationale"
    );
  });

  it("real fixture: all 8 controls carry an origin record and zero fabricated migrations", async () => {
    const set = await loadControlSet("fixtures/controls/nist-subset.yaml");
    expect(set.controls).toHaveLength(8);
    for (const c of set.controls) {
      expect(c.tagProvenance).toHaveLength(1);
      expect(c.tagProvenance![0]!.supersedes).toBeUndefined();
      expect(c.tagProvenance![0]!.pattern).toBe(c.pattern);
      // Real history only: origin dates are the introducing commits' dates.
      expect(["2026-06-10", "2026-07-19"]).toContain(c.tagProvenance![0]!.assigned);
      // Rationale cites the introducing commit SHA, not invented narrative.
      expect(c.tagProvenance![0]!.rationale).toMatch(/9b00bbf|cffefdc/);
    }
  });
});
