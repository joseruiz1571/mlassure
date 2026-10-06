/**
 * M9: rekor.json inclusion proof. Two layers, kept distinct:
 *   - synthetic: a test log key, so the root-vs-index lesson can be forced
 *   - recorded: a hashedrekord entry actually accepted by the public Rekor
 *     log on 2026-10-06, re-verified offline against the vendored log key.
 *     No maintainer credential is used. The signing private key was discarded.
 */
import { describe, it, expect, afterAll } from "bun:test";
import { createHash, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { mkdtempSync, cpSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { leafHash, merkleRoot, inclusionProof } from "./merkle.js";
import {
  checkpointBody,
  signCheckpointNote,
  entryTimestampPayload,
  signEntryTimestamp,
  spkiSha256,
  verifyRekorAnchor,
  REKOR_KIND,
  type RekorArtifact,
} from "./rekor.js";
import { verifyEvidenceBundle } from "./bundle.js";

const repoRoot = join(import.meta.dir, "../..");
const POSITIVE = join(repoRoot, "fixtures/bundles/positive/fraud-detection-v2-clean");
const RECORDED = join(repoRoot, "fixtures/rekor/rekor.json");
const VENDORED_PEM = join(repoRoot, "fixtures/rekor/rekor.sigstore.dev.pub.pem");

const root = mkdtempSync(join(tmpdir(), "mlassure-rekor-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

let n = 0;
function copyPositive(): string {
  const dir = join(root, `b${n++}`);
  cpSync(POSITIVE, dir, { recursive: true });
  return dir;
}

function manifestSha(dir: string): string {
  return createHash("sha256").update(readFileSync(join(dir, "manifest.json"))).digest("hex");
}

type Keys = { publicPem: string; privateKey: KeyObject };

function keypair(): Keys {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return { publicPem: publicKey.export({ type: "spki", format: "pem" }).toString(), privateKey };
}

function syntheticAnchor(dir: string, log: Keys, signer: Keys): RekorArtifact {
  const manifestBytes = readFileSync(join(dir, "manifest.json"));
  const manifestSha256 = createHash("sha256").update(manifestBytes).digest("hex");
  const sig = sign("sha256", manifestBytes, signer.privateKey);
  const body = Buffer.from(
    JSON.stringify({
      apiVersion: "0.0.1",
      kind: "hashedrekord",
      spec: {
        data: { hash: { algorithm: "sha256", value: manifestSha256 } },
        signature: {
          content: sig.toString("base64"),
          publicKey: { content: Buffer.from(signer.publicPem).toString("base64") },
        },
      },
    })
  );
  const ours = leafHash(body);
  const leaves = [leafHash(Buffer.from("other-0")), ours, leafHash(Buffer.from("other-2")), leafHash(Buffer.from("other-3"))];
  const index = 1;
  const treeRoot = merkleRoot(leaves);
  const proof = inclusionProof(leaves, index);
  const integratedTime = 1791276989;
  const logID = spkiSha256(log.publicPem);
  const canonicalBody = body.toString("base64");
  return {
    kind: REKOR_KIND,
    logID,
    logIndex: index,
    treeIndex: index,
    treeSize: leaves.length,
    integratedTime,
    identity: `spki-sha256:${spkiSha256(signer.publicPem)}`,
    manifestSha256,
    canonicalBody,
    leafHash: ours.toString("hex"),
    hashes: proof.map((p) => p.toString("hex")),
    rootHash: treeRoot.toString("hex"),
    signedEntryTimestamp: signEntryTimestamp(
      entryTimestampPayload(canonicalBody, integratedTime, logID, index),
      log.privateKey
    ),
    checkpoint: signCheckpointNote(checkpointBody("test-log.example", leaves.length, treeRoot), log.privateKey, "test-log.example"),
  };
}

describe("verify-bundle --rekor (synthetic log)", () => {
  const log = keypair();
  const signer = keypair();

  function anchored(): { dir: string; art: RekorArtifact } {
    const dir = copyPositive();
    const art = syntheticAnchor(dir, log, signer);
    writeFileSync(join(dir, "rekor.json"), JSON.stringify(art, null, 2));
    return { dir, art };
  }

  const opts = { rekor: true as const, rekorPublicKeyPem: log.publicPem };

  it("accepts a proof whose recomputed root is the signed checkpoint root", () => {
    const { dir, art } = anchored();
    const r = verifyEvidenceBundle(dir, opts);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.rekor?.rootHash).toBe(art.rootHash);
    expect(r.rekor?.identity).toBe(art.identity);
    expect(r.rekor?.signer).toBe("test-log.example");
    expect(r.rekor?.logIndex).toBe(1);
    expect(r.rekor?.treeIndex).toBe(1);
  });

  it("does not inspect rekor.json unless --rekor is set", () => {
    const { dir } = anchored();
    writeFileSync(join(dir, "rekor.json"), "not even json");
    expect(verifyEvidenceBundle(dir).ok).toBe(true);
    const withFlag = verifyEvidenceBundle(dir, opts);
    expect(withFlag.ok).toBe(false);
    expect(withFlag.errors.some((e) => e.startsWith("rekor.json cannot be parsed:"))).toBe(true);
  });

  it("fails when rekor.json is absent", () => {
    const dir = copyPositive();
    const r = verifyEvidenceBundle(dir, opts);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.startsWith("rekor.json is missing"))).toBe(true);
  });

  it("compares the checkpoint root, not the log index", () => {
    const { dir, art } = anchored();
    // Same tree size, same index still inside the tree, different root.
    // The signed entry timestamp still covers the original index.
    const forkedRoot = merkleRoot([
      leafHash(Buffer.from("forked-0")),
      Buffer.from(art.leafHash, "hex"),
      leafHash(Buffer.from("forked-2")),
      leafHash(Buffer.from("forked-3")),
    ]);
    const forked = signCheckpointNote(
      checkpointBody("test-log.example", art.treeSize, forkedRoot),
      log.privateKey,
      "test-log.example"
    );
    const r = verifyEvidenceBundle(dir, { ...opts, rekorCheckpoint: forked });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("compares roots, not log indexes"))).toBe(true);
    expect(r.rekor).toBeUndefined();
  });

  it("refuses a later log head in place of the root at the proof's tree size", () => {
    const { dir, art } = anchored();
    const later = signCheckpointNote(
      checkpointBody("test-log.example", art.treeSize + 100, Buffer.from(art.rootHash, "hex")),
      log.privateKey,
      "test-log.example"
    );
    const r = verifyEvidenceBundle(dir, { ...opts, rekorCheckpoint: later });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("a later log head is not this root"))).toBe(true);
  });

  it("refuses a manifest byte that no longer matches the logged digest", () => {
    const { dir } = anchored();
    const manifestPath = join(dir, "manifest.json");
    const buf = readFileSync(manifestPath);
    buf[buf.length - 3] = buf[buf.length - 3]! ^ 0x01;
    writeFileSync(manifestPath, buf);
    const anchor = verifyRekorAnchor(dir, { rekorPublicKeyPem: log.publicPem });
    expect(anchor.errors.some((e) => e.startsWith("rekor manifest digest does not match manifest.json"))).toBe(true);
  });
});

describe("verify-bundle --rekor (public Rekor entry, recorded 2026-10-06)", () => {
  it("the recorded anchor is the positive vector's manifest, and it verifies with the vendored log key", () => {
    const recorded = JSON.parse(readFileSync(RECORDED, "utf-8")) as RekorArtifact;
    const source = JSON.parse(readFileSync(join(repoRoot, "fixtures/rekor/log-entry.json"), "utf-8")) as {
      entry: { logIndex: number; body: string; verification: { inclusionProof: { logIndex: number } } };
    };
    expect(recorded.logIndex).toBe(source.entry.logIndex);
    expect(recorded.treeIndex).toBe(source.entry.verification.inclusionProof.logIndex);
    expect(recorded.canonicalBody).toBe(source.entry.body);
    const dir = copyPositive();
    expect(manifestSha(dir)).toBe(recorded.manifestSha256);
    writeFileSync(join(dir, "rekor.json"), readFileSync(RECORDED));
    const r = verifyEvidenceBundle(dir, { rekor: true });
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.rekor?.signer).toBe("rekor.sigstore.dev");
    expect(r.rekor?.logIndex).toBe(3105929320);
    expect(r.rekor?.treeSize).toBe(2984025649);
    expect(r.rekor?.integratedTime).toBe(1791276989);
    expect(new Date(r.rekor!.integratedTime * 1000).toISOString()).toBe("2026-10-06T08:56:29.000Z");
  });

  it("the CLI prints CC-4 and does not call the result Proof-of-Control", () => {
    const dir = copyPositive();
    writeFileSync(join(dir, "rekor.json"), readFileSync(RECORDED));
    const proc = Bun.spawnSync(["bun", "src/cli/index.ts", "verify-bundle", dir, "--rekor"], {
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
    });
    const out = proc.stdout.toString() + proc.stderr.toString();
    expect(proc.exitCode).toBe(0);
    expect(out).toContain("Claim CC-4 only");
    expect(out).toContain("neither was the comparison");
    expect(out).toContain("Not Proof-of-Control");
    expect(out).not.toMatch(/has Proof-of-Control/);
  });

  it("a checkpoint signed by some other key is not accepted as Rekor's", () => {
    const dir = copyPositive();
    writeFileSync(join(dir, "rekor.json"), readFileSync(RECORDED));
    const other = keypair();
    const recorded = JSON.parse(readFileSync(RECORDED, "utf-8")) as RekorArtifact;
    const r = verifyEvidenceBundle(dir, { rekor: true, rekorPublicKeyPem: other.publicPem });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.startsWith("rekor checkpoint signature did not verify") || e.startsWith("rekor logID"))).toBe(true);
    expect(recorded.checkpoint).toContain("rekor.sigstore.dev");
    expect(readFileSync(VENDORED_PEM, "utf-8")).toContain("BEGIN PUBLIC KEY");
  });
});
