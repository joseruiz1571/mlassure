/**
 * Custody-chain tests (M3g). The verifier's fail-loud modes each get their
 * own asserting test — a passing "good bundle verifies" alone proves nothing
 * about tamper detection. Cosign signing is tested empirically with an
 * ephemeral key in a temp dir (never in the repo tree); the suite SKIPS
 * LOUDLY (named reason) when cosign is not installed, never silently.
 */

import { describe, it, expect, afterAll } from "bun:test";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  writeEvidenceBundle,
  verifyEvidenceBundle,
  computeRootHash,
  ALLOWED_UNMANIFESTED,
  type BundleManifest,
} from "./bundle.js";
import type { AssessmentReport, ControlResult } from "../runner/assessment-runner.js";
import type { Evidence } from "../types.js";

const root = mkdtempSync(join(tmpdir(), "mlassure-bundle-test-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

let dirCounter = 0;
function freshDir(): string {
  return join(root, `bundle-${dirCounter++}`);
}

function makeEvidence(source: string): Evidence {
  return {
    id: randomUUID(),
    source,
    retrievedAt: "2026-07-22T00:00:00.000Z",
    sha256: "c".repeat(64),
    payload: { some: "aws-config", nested: [1, 2, 3] },
  };
}

function makeReport(): { report: AssessmentReport; evidence: Evidence[] } {
  const ev1 = makeEvidence("aws:sagemaker:describe-endpoint");
  const ev2 = makeEvidence("aws:iam:get-role");
  const result: ControlResult = {
    controlId: "SI-6(1)",
    pattern: "synthesis",
    judgment: {
      controlId: "SI-6(1)",
      status: "satisfied",
      confidence: "high",
      rationale: "ok",
      evidenceCited: [ev1.id],
      gaps: [],
    },
    evidenceCount: 2,
    iterations: 2,
    citedEvidence: [
      { id: ev1.id, source: ev1.source, sha256: ev1.sha256, retrievedAt: ev1.retrievedAt },
    ],
    evidenceCoverage: 1,
    collectorsTagged: 1,
    collectorsCalled: 1,
    collectorsCited: 1,
    coverageConfidence: "high",
    retrievedEvidence: [ev1, ev2],
  };
  return {
    report: {
      targetName: "custody-target",
      endpointName: "custody-endpoint",
      controlSetVersion: "test-1.0",
      runAt: "2026-07-22T00:00:00.000Z",
      results: [result],
    },
    evidence: [ev1, ev2],
  };
}

describe("writeEvidenceBundle (M3g)", () => {
  it("writes report.json that round-trips to the in-memory report", () => {
    const { report } = makeReport();
    const dir = freshDir();
    writeEvidenceBundle(report, dir);
    const parsed = JSON.parse(readFileSync(join(dir, "report.json"), "utf-8"));
    expect(parsed).toEqual(JSON.parse(JSON.stringify(report)));
  });

  it("writes one evidence file per retrieved item, cited-or-not, with controlId and cited flag", () => {
    const { report, evidence } = makeReport();
    const dir = freshDir();
    writeEvidenceBundle(report, dir);
    for (const ev of evidence) {
      const wrapped = JSON.parse(
        readFileSync(join(dir, `evidence/${ev.id.toLowerCase()}.json`), "utf-8")
      );
      expect(wrapped.controlId).toBe("SI-6(1)");
      expect(wrapped.evidence).toEqual(JSON.parse(JSON.stringify(ev)));
      expect(wrapped.cited).toBe(ev.id === report.results[0]!.judgment.evidenceCited[0]);
    }
  });

  it("includes oscal.json and narrative.md when provided", () => {
    const { report } = makeReport();
    const dir = freshDir();
    writeEvidenceBundle(report, dir, {
      oscal: { "assessment-results": { fake: true } },
      narrative: "# fake narrative\n",
    });
    expect(JSON.parse(readFileSync(join(dir, "oscal.json"), "utf-8"))).toEqual({
      "assessment-results": { fake: true },
    });
    expect(readFileSync(join(dir, "narrative.md"), "utf-8")).toBe("# fake narrative\n");
  });

  it("manifest lists every file except itself, with rootHash matching the canonical construction", () => {
    const { report } = makeReport();
    const dir = freshDir();
    const manifest = writeEvidenceBundle(report, dir, { narrative: "n" });
    expect(manifest.files.some((f) => f.path === "manifest.json")).toBe(false);
    expect(manifest.files.map((f) => f.path).sort()).toEqual(
      ["report.json", "narrative.md", ...report.results[0]!.retrievedEvidence!.map(
        (e) => `evidence/${e.id.toLowerCase()}.json`
      )].sort()
    );
    expect(manifest.rootHash).toBe(
      computeRootHash(
        {
          bundleFormatVersion: manifest.bundleFormatVersion,
          algorithm: manifest.algorithm,
          createdAt: manifest.createdAt,
          targetName: manifest.targetName,
          controlSetVersion: manifest.controlSetVersion,
        },
        manifest.files
      )
    );
    expect(manifest.algorithm).toBe("sha256");
    expect(manifest.bundleFormatVersion).toBe("1");
    expect(manifest.targetName).toBe("custody-target");
    expect(manifest.controlSetVersion).toBe("test-1.0");
  });

  it("refuses a non-empty target directory", () => {
    const { report } = makeReport();
    const dir = freshDir();
    writeEvidenceBundle(report, dir);
    expect(() => writeEvidenceBundle(report, dir)).toThrow(/exists and is not empty/);
  });

  it("throws when a result lacks retrievedEvidence — custody cannot bundle what was not retained", () => {
    const { report } = makeReport();
    delete (report.results[0] as { retrievedEvidence?: unknown }).retrievedEvidence;
    expect(() => writeEvidenceBundle(report, freshDir())).toThrow(
      /no retrievedEvidence/
    );
  });

  it("throws on a non-UUID evidence id — never smuggled into a filename", () => {
    const { report } = makeReport();
    report.results[0]!.retrievedEvidence![0]!.id = "../escape";
    expect(() => writeEvidenceBundle(report, freshDir())).toThrow(/not a UUID/);
  });
});

describe("verifyEvidenceBundle (M3g) — fail-loud modes", () => {
  function writtenBundle(): string {
    const { report } = makeReport();
    const dir = freshDir();
    writeEvidenceBundle(report, dir, { narrative: "# n\n" });
    return dir;
  }

  it("passes on an untampered bundle", () => {
    const dir = writtenBundle();
    const res = verifyEvidenceBundle(dir);
    expect(res.errors).toEqual([]);
    expect(res.ok).toBe(true);
    expect(res.checkedFiles).toBe(4); // report + 2 evidence + narrative
  });

  it("fails naming the file on a single-byte tamper", () => {
    const dir = writtenBundle();
    const target = join(dir, "narrative.md");
    writeFileSync(target, "# N\n"); // one byte flipped
    const res = verifyEvidenceBundle(dir);
    expect(res.ok).toBe(false);
    expect(res.errors.join("\n")).toMatch(/hash mismatch: narrative\.md/);
  });

  it("fails loudly when manifest.json is absent (unverifiable, not 'empty pass')", () => {
    const dir = writtenBundle();
    unlinkSync(join(dir, "manifest.json"));
    const res = verifyEvidenceBundle(dir);
    expect(res.ok).toBe(false);
    expect(res.errors.join("\n")).toMatch(/unverifiable/);
  });

  it("fails naming the path when a manifested file is missing on disk", () => {
    const dir = writtenBundle();
    unlinkSync(join(dir, "narrative.md"));
    const res = verifyEvidenceBundle(dir);
    expect(res.ok).toBe(false);
    expect(res.errors.join("\n")).toMatch(/missing file listed in manifest: narrative\.md/);
  });

  it("fails on an unaccounted extra file — including .DS_Store-class junk, no allowlist", () => {
    const dir = writtenBundle();
    writeFileSync(join(dir, ".DS_Store"), "junk");
    const res = verifyEvidenceBundle(dir);
    expect(res.ok).toBe(false);
    expect(res.errors.join("\n")).toMatch(/unaccounted file in bundle: \.DS_Store/);
  });

  it("exempts EXACTLY the signature artifacts from extra-file detection", () => {
    const dir = writtenBundle();
    for (const name of ALLOWED_UNMANIFESTED) {
      if (!existsSync(join(dir, name))) writeFileSync(join(dir, name), "sig-artifact");
    }
    expect(verifyEvidenceBundle(dir).ok).toBe(true);
    writeFileSync(join(dir, "manifest.sig.bundle.evil"), "not exempt");
    expect(verifyEvidenceBundle(dir).ok).toBe(false);
  });

  it("fails when the manifest's stored rootHash disagrees with its own entries", () => {
    const dir = writtenBundle();
    const manifestPath = join(dir, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as BundleManifest;
    manifest.rootHash = "0".repeat(64);
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    const res = verifyEvidenceBundle(dir);
    expect(res.ok).toBe(false);
    expect(res.errors.join("\n")).toMatch(/rootHash mismatch/);
  });

  it("fails on a symlink inside the bundle — never traversed, never counted", () => {
    const dir = writtenBundle();
    symlinkSync("/etc/hosts", join(dir, "evidence", "link"));
    const res = verifyEvidenceBundle(dir);
    expect(res.ok).toBe(false);
    expect(res.errors.join("\n")).toMatch(/symlink inside bundle: evidence\/link/);
  });

  it("rejects an empty-files manifest — a gutted bundle never verifies 'OK — 0 files'", () => {
    const dir = freshDir();
    const emptyMeta = {
      bundleFormatVersion: "1",
      algorithm: "sha256" as const,
      createdAt: "2026-07-23T00:00:00.000Z",
      targetName: "gutted",
      controlSetVersion: "x",
    };
    const manifest = { ...emptyMeta, files: [], rootHash: computeRootHash(emptyMeta, []) };
    require("node:fs").mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest));
    const res = verifyEvidenceBundle(dir);
    expect(res.ok).toBe(false);
    expect(res.errors.join("\n")).toMatch(/lists zero files/);
  });

  it("rejects manifest entries that escape the bundle (absolute, ..) and duplicates — violations, not crashes", () => {
    const dir = writtenBundle();
    const manifestPath = join(dir, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as BundleManifest;
    manifest.files.push({ path: "/etc/passwd", sha256: "a".repeat(64), bytes: 1 });
    manifest.files.push({ path: "../outside.txt", sha256: "b".repeat(64), bytes: 1 });
    manifest.files.push({ ...manifest.files[0]! }); // duplicate of report.json
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    const res = verifyEvidenceBundle(dir);
    expect(res.ok).toBe(false);
    const all = res.errors.join("\n");
    expect(all).toMatch(/escapes the bundle.*proof of tampering/);
    expect(all).toMatch(/duplicates path/);
  });

  it("treats malformed manifest entries as violations, never unhandled exceptions", () => {
    const dir = writtenBundle();
    const manifestPath = join(dir, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as BundleManifest;
    (manifest.files as unknown[]).push({}, { path: 42 }, { path: "x.json", sha256: "nope" });
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    const res = verifyEvidenceBundle(dir); // must not throw
    expect(res.ok).toBe(false);
    const all = res.errors.join("\n");
    expect(all).toMatch(/is not an object|has no path string/);
    expect(all).toMatch(/has no valid sha256/);
  });

  it("catches metadata tampering even when the attacker recomputes rootHash (report.json cross-check)", () => {
    const dir = writtenBundle();
    const manifestPath = join(dir, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as BundleManifest;
    manifest.targetName = "SOMEONE-ELSES-MODEL";
    manifest.rootHash = computeRootHash(
      {
        bundleFormatVersion: manifest.bundleFormatVersion,
        algorithm: manifest.algorithm,
        createdAt: manifest.createdAt,
        targetName: manifest.targetName,
        controlSetVersion: manifest.controlSetVersion,
      },
      manifest.files
    );
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    const res = verifyEvidenceBundle(dir);
    expect(res.ok).toBe(false);
    expect(res.errors.join("\n")).toMatch(/disagrees with report\.json/);
  });

  it("catches metadata tampering WITHOUT rootHash recompute (metadata is inside the root hash)", () => {
    const dir = writtenBundle();
    const manifestPath = join(dir, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as BundleManifest;
    manifest.targetName = "SOMEONE-ELSES-MODEL"; // rootHash left stale
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    const res = verifyEvidenceBundle(dir);
    expect(res.ok).toBe(false);
    expect(res.errors.join("\n")).toMatch(/rootHash mismatch/);
  });

  it("flags an empty directory inside the bundle as unaccounted structure", () => {
    const dir = writtenBundle();
    require("node:fs").mkdirSync(join(dir, "evidence-extra"));
    const res = verifyEvidenceBundle(dir);
    expect(res.ok).toBe(false);
    expect(res.errors.join("\n")).toMatch(/empty directory inside bundle: evidence-extra/);
  });

  it("never reports ok with any error present (aggregate fail-loud)", () => {
    const dir = writtenBundle();
    writeFileSync(join(dir, "extra.txt"), "x");
    writeFileSync(join(dir, "narrative.md"), "tampered");
    const res = verifyEvidenceBundle(dir);
    expect(res.ok).toBe(false);
    expect(res.errors.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Cosign authenticity chain — empirical, ephemeral key, temp dir only.
// Skips LOUDLY when cosign is absent (never a silent pass).
// ---------------------------------------------------------------------------

const cosignPresent = Bun.which("cosign") !== null;
if (!cosignPresent) {
  console.warn(
    "SKIPPING cosign authenticity tests: cosign is not installed on this machine — install cosign to run ISC-396/397/413."
  );
}

// A silent skip on CI would lose all authenticity coverage behind a green
// check (hunter, M3g). Environments that must have cosign set REQUIRE_COSIGN=1,
// turning an absent cosign into a FAILING test, not a skipped one.
describe.skipIf(process.env["REQUIRE_COSIGN"] !== "1")("cosign presence gate (REQUIRE_COSIGN=1)", () => {
  it("cosign must be installed when REQUIRE_COSIGN=1", () => {
    expect(cosignPresent).toBe(true);
  });
});

async function cosign(args: string[], cwd: string): Promise<{ exitCode: number; stderr: string }> {
  const proc = Bun.spawn(["cosign", ...args], {
    cwd,
    env: { ...process.env, COSIGN_PASSWORD: "" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;
  const stderr = await new Response(proc.stderr).text();
  return { exitCode, stderr };
}

describe.skipIf(!cosignPresent)("cosign authenticity chain (M3g, empirical)", () => {
  it("ephemeral-key sign → verify passes; tampered manifest and wrong key both fail", async () => {
    const { report } = makeReport();
    const dir = freshDir();
    writeEvidenceBundle(report, dir);

    const keyDirA = mkdtempSync(join(tmpdir(), "mlassure-cosign-a-"));
    const keyDirB = mkdtempSync(join(tmpdir(), "mlassure-cosign-b-"));
    try {
      expect((await cosign(["generate-key-pair"], keyDirA)).exitCode).toBe(0);
      expect((await cosign(["generate-key-pair"], keyDirB)).exitCode).toBe(0);

      const manifest = join(dir, "manifest.json");
      const sigBundle = join(dir, "manifest.sig.bundle");
      const sign = await cosign(
        ["sign-blob", "--key", join(keyDirA, "cosign.key"), "--yes", "--bundle", sigBundle, manifest],
        dir
      );
      expect(sign.exitCode).toBe(0);

      // Good signature verifies (exit code captured directly, never piped).
      const good = await cosign(
        ["verify-blob", "--key", join(keyDirA, "cosign.pub"), "--bundle", sigBundle, manifest],
        dir
      );
      expect(good.exitCode).toBe(0);

      // Signature artifact in the bundle does not break bundle verification.
      expect(verifyEvidenceBundle(dir).ok).toBe(true);

      // Wrong key fails (ISC-413 — a good-sig test alone proves nothing).
      const wrongKey = await cosign(
        ["verify-blob", "--key", join(keyDirB, "cosign.pub"), "--bundle", sigBundle, manifest],
        dir
      );
      expect(wrongKey.exitCode).not.toBe(0);

      // Tampered manifest fails against the original signature (ISC-397).
      const m = JSON.parse(readFileSync(manifest, "utf-8")) as BundleManifest;
      m.targetName = "TAMPERED";
      writeFileSync(manifest, JSON.stringify(m, null, 2));
      const tampered = await cosign(
        ["verify-blob", "--key", join(keyDirA, "cosign.pub"), "--bundle", sigBundle, manifest],
        dir
      );
      expect(tampered.exitCode).not.toBe(0);
    } finally {
      rmSync(keyDirA, { recursive: true, force: true });
      rmSync(keyDirB, { recursive: true, force: true });
    }
  }, 60000);
});
