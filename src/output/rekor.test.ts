/**
 * M9: rekor.json inclusion proof. Two layers, kept distinct:
 *   - synthetic: a test log key, so the root-vs-index lesson can be forced
 *   - recorded: a hashedrekord entry actually accepted by the public Rekor
 *     log on 2026-10-06, re-verified offline against the vendored log key.
 *     No maintainer credential is used. The signing private key was discarded.
 */
import { describe, it, expect, afterAll } from "bun:test";
import { createHash, generateKeyPairSync, sign, X509Certificate, type KeyObject } from "node:crypto";
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
import { VENDORED_REKOR_PUBLIC_KEY } from "./rekor-key.js";

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

function flipSignature(b64: string): string {
  const bytes = Buffer.from(b64, "base64");
  bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1;
  return bytes.toString("base64");
}

/** A real self-signed certificate for an ephemeral test key; no openssl dependency. */
function certificate(keys: Keys): string {
  const tlv = (tag: number, data: Buffer): Buffer => {
    const length = data.length < 128 ? [data.length] : data.length < 256
      ? [0x81, data.length] : [0x82, data.length >> 8, data.length & 255];
    return Buffer.concat([Buffer.from([tag, ...length]), data]);
  };
  const seq = (...values: Buffer[]) => tlv(0x30, Buffer.concat(values));
  const sigAlg = seq(Buffer.from("06082a8648ce3d040302", "hex")); // ecdsa-with-SHA256
  const name = seq(tlv(0x31, seq(Buffer.from("0603550403", "hex"), tlv(0x0c, Buffer.from("untrusted-test-only")))));
  const validity = seq(tlv(0x17, Buffer.from("260101000000Z")), tlv(0x17, Buffer.from("350101000000Z")));
  const spki = Buffer.from(keys.publicPem.replace(/-----[^-]+-----|\s/g, ""), "base64");
  const tbs = seq(Buffer.from("020101", "hex"), sigAlg, name, validity, name, spki);
  const der = seq(tbs, sigAlg, tlv(0x03, Buffer.concat([Buffer.from([0]), sign("sha256", tbs, keys.privateKey)])));
  const pem = `-----BEGIN CERTIFICATE-----\n${der.toString("base64").match(/.{1,64}/g)!.join("\n")}\n-----END CERTIFICATE-----\n`;
  expect(new X509Certificate(pem).verify(new X509Certificate(pem).publicKey)).toBe(true);
  return pem;
}

/** Re-sign the log layers after changing the body, isolating body validation. */
function relog(art: RekorArtifact, body: Buffer, log: Keys): void {
  art.canonicalBody = body.toString("base64");
  art.leafHash = leafHash(body).toString("hex");
  art.rootHash = art.leafHash;
  art.treeIndex = 0;
  art.treeSize = 1;
  art.hashes = [];
  art.checkpoint = signCheckpointNote(checkpointBody("test-log.example", 1, Buffer.from(art.rootHash, "hex")), log.privateKey, "test-log.example");
  art.signedEntryTimestamp = signEntryTimestamp(entryTimestampPayload(art.canonicalBody, art.integratedTime, art.logID, art.logIndex), log.privateKey);
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

  function save(dir: string, art: RekorArtifact): void {
    writeFileSync(join(dir, "rekor.json"), JSON.stringify(art));
  }

  function rejectOnly(dir: string, art: RekorArtifact, reason: string, cli = false): void {
    save(dir, art);
    const r = verifyEvidenceBundle(dir, opts);
    expect(r.ok).toBe(false);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toStartWith(reason);
    expect(r.rekor).toBeUndefined();
    if (cli) {
      const keyPath = join(root, "log.pub");
      writeFileSync(keyPath, log.publicPem);
      const proc = Bun.spawnSync(["bun", "src/cli/index.ts", "verify-bundle", dir, "--rekor", "--rekor-key", keyPath], { cwd: repoRoot });
      expect(proc.exitCode).toBe(1);
      expect(proc.stderr.toString()).toContain(reason);
      expect(proc.stdout.toString()).not.toContain("verify-bundle: OK");
    }
  }

  it("rejects only a bad checkpoint signature, with all roots and the SET valid", () => {
    const { dir, art } = anchored();
    art.checkpoint = art.checkpoint.replace(/([^ ]+)\n$/, (_, b64: string) => `${flipSignature(b64)}\n`);
    rejectOnly(dir, art, "rekor checkpoint signature did not verify", true);
  });

  it("rejects only a bad SET signature, with the inclusion and checkpoint valid", () => {
    const { dir, art } = anchored();
    art.signedEntryTimestamp = flipSignature(art.signedEntryTimestamp);
    rejectOnly(dir, art, "rekor signed entry timestamp did not verify", true);
  });

  it("rejects only a bad artifact signature, even when the log signed its body", () => {
    const { dir, art } = anchored();
    const body = JSON.parse(Buffer.from(art.canonicalBody, "base64").toString());
    body.spec.signature.content = flipSignature(body.spec.signature.content);
    relog(art, Buffer.from(JSON.stringify(body)), log);
    rejectOnly(dir, art, "rekor artifact signature does not verify", true);
  });

  it("rejects only an identity mismatch, with all three signatures valid", () => {
    const { dir, art } = anchored();
    art.identity = `spki-sha256:${"00".repeat(32)}`;
    rejectOnly(dir, art, "rekor identity", true);
  });

  for (const value of [null, [], true, 7, "text"]) {
    it(`rejects a non-object canonical body: ${JSON.stringify(value)}`, () => {
      const { dir, art } = anchored();
      relog(art, Buffer.from(JSON.stringify(value)), log);
      rejectOnly(dir, art, "rekor canonical body must be a JSON object");
    });
  }

  it("rejects a hashedrekord certificate despite valid artifact and log signatures", () => {
    const { dir, art } = anchored();
    const body = JSON.parse(Buffer.from(art.canonicalBody, "base64").toString());
    body.spec.signature.publicKey.content = Buffer.from(certificate(signer)).toString("base64");
    relog(art, Buffer.from(JSON.stringify(body)), log);
    rejectOnly(dir, art, "rekor logged public key or artifact signature is not usable: expected a bare SPKI PUBLIC KEY PEM");
  });

  it("rejects a private key where a public key is required", () => {
    const { dir, art } = anchored();
    const body = JSON.parse(Buffer.from(art.canonicalBody, "base64").toString());
    body.spec.signature.publicKey.content = Buffer.from(signer.privateKey.export({ format: "pem", type: "pkcs8" })).toString("base64");
    relog(art, Buffer.from(JSON.stringify(body)), log);
    rejectOnly(dir, art, "rekor logged public key or artifact signature is not usable: expected a bare SPKI PUBLIC KEY PEM");
  });

  it("rejects an unsupported hashedrekord version", () => {
    const { dir, art } = anchored();
    const body = JSON.parse(Buffer.from(art.canonicalBody, "base64").toString());
    body.apiVersion = "99";
    relog(art, Buffer.from(JSON.stringify(body)), log);
    rejectOnly(dir, art, "rekor hashedrekord apiVersion must be");
  });

  it("rejects invalid UTF-8 in a log-signed body without replacing bytes", () => {
    const { dir, art } = anchored();
    relog(art, Buffer.concat([Buffer.from('{"x":"'), Buffer.from([255]), Buffer.from('"}')]), log);
    rejectOnly(dir, art, "rekor canonical body cannot be parsed: invalid UTF-8");
  });

  it("rejects noncanonical base64 in the SET", () => {
    const { dir, art } = anchored();
    art.signedEntryTimestamp += "!!!!";
    rejectOnly(dir, art, "rekor signed entry timestamp did not verify");
  });

  it("rejects noncanonical base64 in the canonical body", () => {
    const { dir, art } = anchored();
    art.canonicalBody += "!!!!";
    rejectOnly(dir, art, "rekor canonical body is not base64");
  });

  it("rejects a signed time the CLI cannot represent", () => {
    const { dir, art } = anchored();
    art.integratedTime = 8_640_000_000_001;
    art.signedEntryTimestamp = signEntryTimestamp(entryTimestampPayload(art.canonicalBody, art.integratedTime, art.logID, art.logIndex), log.privateKey);
    rejectOnly(dir, art, "rekor.json integratedTime must be", true);
  });

  it("attributes a custom key to its fingerprint even with a forged public-log label", () => {
    const { dir, art } = anchored();
    art.checkpoint = art.checkpoint.replace("— test-log.example ", "— rekor.sigstore.dev ");
    save(dir, art);
    const r = verifyEvidenceBundle(dir, opts);
    expect(r.errors).toEqual([]);
    expect(r.rekor?.trustSource).toBe("custom");
    expect(r.rekor?.logID).toBe(spkiSha256(log.publicPem));
    expect(verifyEvidenceBundle(dir, { rekor: true }).ok).toBe(false);
    const keyPath = join(root, "custom.pub");
    writeFileSync(keyPath, log.publicPem);
    const proc = Bun.spawnSync(["bun", "src/cli/index.ts", "verify-bundle", dir, "--rekor", "--rekor-key", keyPath], { cwd: repoRoot });
    expect(proc.exitCode).toBe(0);
    expect(proc.stdout.toString()).toContain(`custom trust anchor spki-sha256:${art.logID}`);
    expect(proc.stdout.toString()).not.toContain("verified with rekor.sigstore.dev");
  });

  for (const field of ["integratedTime", "logIndex"] as const) {
    it(`rejects tampered ${field} through the SET alone`, () => {
      const { dir, art } = anchored();
      art[field] += 1;
      rejectOnly(dir, art, "rekor signed entry timestamp did not verify");
    });
  }

  it("requires the documented P-256 log key profile", () => {
    const dir = copyPositive();
    const other = generateKeyPairSync("ec", { namedCurve: "secp384r1" });
    const key = { privateKey: other.privateKey, publicPem: other.publicKey.export({ type: "spki", format: "pem" }).toString() };
    save(dir, syntheticAnchor(dir, key, signer));
    const r = verifyEvidenceBundle(dir, { rekor: true, rekorPublicKeyPem: key.publicPem });
    expect(r.errors).toEqual(["rekor log public key is not usable: log key must be ECDSA P-256"]);
    expect(r.rekor).toBeUndefined();
  });

  it("does not establish global consistency: coherent signed forks each verify locally", () => {
    const { dir, art } = anchored();
    const first = verifyEvidenceBundle(dir, opts);
    const leaves = [leafHash(Buffer.from("fork")), Buffer.from(art.leafHash, "hex"), leafHash(Buffer.from("other-2")), leafHash(Buffer.from("other-3"))];
    art.rootHash = merkleRoot(leaves).toString("hex");
    art.hashes = inclusionProof(leaves, 1).map((h) => h.toString("hex"));
    art.checkpoint = signCheckpointNote(checkpointBody("test-log.example", 4, Buffer.from(art.rootHash, "hex")), log.privateKey, "test-log.example");
    save(dir, art);
    const fork = verifyEvidenceBundle(dir, opts);
    expect(first.errors).toEqual([]);
    expect(fork.errors).toEqual([]);
    expect(fork.rekor?.rootHash).not.toBe(first.rekor?.rootHash);
  });

  it("trusts the log's stated time: a re-signed SET changes time without changing the leaf", () => {
    const { dir, art } = anchored();
    const originalRoot = art.rootHash;
    art.integratedTime += 3600;
    art.signedEntryTimestamp = signEntryTimestamp(entryTimestampPayload(art.canonicalBody, art.integratedTime, art.logID, art.logIndex), log.privateKey);
    save(dir, art);
    const r = verifyEvidenceBundle(dir, opts);
    expect(r.errors).toEqual([]);
    expect(r.rekor?.rootHash).toBe(originalRoot);
    expect(r.rekor?.integratedTime).toBe(art.integratedTime);
  });

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
  it("embeds exactly the reviewed public key fixture", () => {
    expect(VENDORED_REKOR_PUBLIC_KEY).toBe(readFileSync(VENDORED_PEM, "utf-8"));
    expect(spkiSha256(VENDORED_REKOR_PUBLIC_KEY)).toBe("c0d23d6ad406973f9559f3ba2d1ca01f84147d8ffc5b8445c224f98b9591801d");
  });

  it("verifies with the built Node CLI outside the repository, without --rekor-key", () => {
    const dir = copyPositive();
    writeFileSync(join(dir, "rekor.json"), readFileSync(RECORDED));
    const output = join(root, "build");
    const build = Bun.spawnSync(["bun", "build", "src/cli/index.ts", "--outdir", output, "--target", "node"], { cwd: repoRoot });
    expect(build.exitCode).toBe(0);
    const proc = Bun.spawnSync(["node", join(output, "index.js"), "verify-bundle", dir, "--rekor"], { cwd: root });
    expect(proc.exitCode).toBe(0);
    expect(proc.stderr.toString()).toBe("");
    expect(proc.stdout.toString()).toContain(`vendored trust anchor spki-sha256:${spkiSha256(VENDORED_REKOR_PUBLIC_KEY)}`);
  });

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
