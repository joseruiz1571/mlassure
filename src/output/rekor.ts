/**
 * Rekor time anchor (M9, claim CC-4).
 *
 * `rekor.json` is written AFTER the manifest, like the Cosign signature
 * artifacts, and is exempt from extra-file detection by exact name. It is
 * not a manifest member: the inclusion proof commits to the manifest bytes
 * that were already sealed, so putting the proof inside the manifest would
 * change the bytes it anchors.
 *
 * What `verify-bundle --rekor` checks, and what it compares:
 *   1. The canonical Rekor body is a hashedrekord whose sha256 is the
 *      manifest on disk, signed by the public key named as the identity.
 *   2. The RFC 6962 inclusion proof recomputes to a root.
 *   3. That root equals the root in the signed checkpoint. The log index
 *      is an input to the proof, not the verdict — a forked log can share
 *      an index and not a root (Proof-of-Control 7.3.5's lesson, applied
 *      here). A later, larger log head is not accepted in place of the
 *      root at the proof's tree size; this verifier does not check
 *      consistency proofs.
 *   4. The checkpoint note and the signed entry timestamp both verify
 *      under the log's public key. The timestamp binds integrated time,
 *      log index, log id, and the body.
 *
 * What this is not. It does not verify a keyless Fulcio certificate or an
 * OIDC identity. The identity in a hashedrekord entry is the signing
 * public key (`spki-sha256:<hex>`). It does not make the bundle
 * Proof-of-Control, and it does not promote CC-2 to Tier 3.
 */

import {
  createHash,
  createPublicKey,
  sign,
  verify,
  type KeyObject,
} from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { leafHash, rootFromInclusionProof } from "./merkle.js";
import { parseJsonStrict, DuplicateKeyError, decodeUtf8Strict } from "./strict-json.js";
import { VENDORED_REKOR_PUBLIC_KEY } from "./rekor-key.js";

/** Same file `bundle.ts` names `MANIFEST_FILENAME`. Kept here to avoid a cycle. */
const MANIFEST_FILENAME = "manifest.json";

export const REKOR_FILENAME = "rekor.json";
export const REKOR_KIND = "mlassure-rekor-anchor-v1";
export const VENDORED_REKOR_SIGNER = "rekor.sigstore.dev";

const HEX64 = /^[0-9a-f]{64}$/;

export type RekorArtifact = {
  kind: typeof REKOR_KIND;
  /** SHA-256 (hex) of the log's SPKI DER. Rekor calls this the log ID. */
  logID: string;
  /**
   * The entry's log index: the integer inside the signed entry timestamp.
   * On the public log this is not the leaf's position in the checkpoint
   * tree (a sharded log's stable index can sit past `treeSize`).
   */
  logIndex: number;
  /** Leaf position in the tree of `treeSize`. This is the inclusion proof's index. */
  treeIndex: number;
  treeSize: number;
  /** Unix seconds, the log's integrated time. */
  integratedTime: number;
  /** `spki-sha256:<hex>` of the key that signed the manifest hash. */
  identity: string;
  manifestSha256: string;
  /** Base64 of the exact log-leaf bytes (the Rekor canonical body). */
  canonicalBody: string;
  leafHash: string;
  hashes: string[];
  rootHash: string;
  /** Base64 DER ECDSA signature over the entry-timestamp payload. */
  signedEntryTimestamp: string;
  /** Signed-note checkpoint at `treeSize`, exact text. */
  checkpoint: string;
};

export type RekorAnchor = {
  rootHash: string;
  logIndex: number;
  treeIndex: number;
  treeSize: number;
  integratedTime: number;
  identity: string;
  /** Full fingerprint of the verified, independently configured log key. */
  logID: string;
  trustSource: "vendored" | "custom";
  /** Unsigned note label. Informational only; never an authenticated log name. */
  signer: string;
};

export type RekorVerifyOptions = {
  /** Checkpoint note text. Defaults to the one recorded in `rekor.json`. */
  rekorCheckpoint?: string;
  /**
   * PEM public key for the log. When omitted, the vendored Rekor key is
   * used if and only if the checkpoint signer is `rekor.sigstore.dev`.
   */
  rekorPublicKeyPem?: string;
};

export type RekorVerifyResult = {
  errors: string[];
  anchor?: RekorAnchor;
};

function sha256Hex(buf: Uint8Array): string {
  return createHash("sha256").update(buf).digest("hex");
}

function decodeBase64(value: string): Buffer {
  // Buffer.from alone ignores invalid characters and accepts truncated input.
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error("not canonical standard base64");
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.length === 0 || bytes.toString("base64") !== value) {
    throw new Error("not non-empty canonical standard base64");
  }
  return bytes;
}

/** createPublicKey also accepts certificates/private keys; our profile does not. */
function barePublicKey(pem: string): KeyObject {
  if (!/^-----BEGIN PUBLIC KEY-----\r?\n[A-Za-z0-9+/=\r\n]+\r?\n-----END PUBLIC KEY-----\r?\n?$/.test(pem)) {
    throw new Error("expected a bare SPKI PUBLIC KEY PEM; certificates and private keys are unsupported");
  }
  return createPublicKey(pem);
}

export function spkiSha256(pemOrKey: string | KeyObject): string {
  const key =
    typeof pemOrKey === "string"
      ? createPublicKey(pemOrKey)
      : pemOrKey.type === "public"
        ? pemOrKey
        : createPublicKey(pemOrKey);
  const der = key.export({ type: "spki", format: "der" });
  return sha256Hex(der);
}

/** Checkpoint body: origin line, decimal tree size, standard-base64 root, trailing newline. */
export function checkpointBody(origin: string, treeSize: number | bigint, root: Uint8Array): string {
  return `${origin}\n${treeSize}\n${Buffer.from(root).toString("base64")}\n`;
}

/**
 * Sigstore / sumdb signed note. The signature input is `body` (which must
 * already end in a newline) and not the blank line or the signature line.
 * The note signature is 4-byte SHA-256(SPKI) prefix || ASN.1 ECDSA.
 */
export function signCheckpointNote(body: string, privateKey: KeyObject, keyName: string): string {
  if (!body.endsWith("\n")) throw new Error("checkpoint body must end with a newline");
  const sig = sign("sha256", Buffer.from(body, "utf8"), privateKey);
  const prefix = Buffer.from(spkiSha256(privateKey), "hex").subarray(0, 4);
  const noteSig = Buffer.concat([prefix, sig]).toString("base64");
  return `${body}\n— ${keyName} ${noteSig}\n`;
}

/** Payload the signed entry timestamp covers. Key order is the canonical one. */
export function entryTimestampPayload(
  bodyB64: string,
  integratedTime: number,
  logID: string,
  logIndex: number
): string {
  return `{"body":${JSON.stringify(bodyB64)},"integratedTime":${integratedTime},"logID":${JSON.stringify(logID)},"logIndex":${logIndex}}`;
}

export function signEntryTimestamp(payload: string, privateKey: KeyObject): string {
  return sign("sha256", Buffer.from(payload, "utf8"), privateKey).toString("base64");
}

type ParsedCheckpoint = {
  body: string;
  origin: string;
  treeSize: bigint;
  root: Buffer;
  signer: string;
  signature: Buffer;
};

function parseCheckpoint(text: string): ParsedCheckpoint {
  const sep = text.indexOf("\n\n— ");
  if (sep === -1) throw new Error("no signed-note signature line");
  const body = text.slice(0, sep + 1);
  let sigLine = text.slice(sep + 2);
  if (sigLine.endsWith("\n")) sigLine = sigLine.slice(0, -1);
  if (sigLine.includes("\n")) throw new Error("multiple signature lines");
  if (!sigLine.startsWith("— ")) throw new Error("signature line is not a signed note");
  const lastSpace = sigLine.lastIndexOf(" ");
  if (lastSpace <= 2) throw new Error("signature line has no signature");
  const signer = sigLine.slice(2, lastSpace);
  const sigB64 = sigLine.slice(lastSpace + 1);
  const raw = decodeBase64(sigB64);
  if (raw.length < 5 || signer.length === 0) throw new Error("signature line is malformed");
  const lines = body.split("\n");
  // body ends with \n, so split yields a trailing empty string.
  if (lines.length !== 4 || lines[3] !== "") throw new Error("checkpoint body is not three lines");
  const origin = lines[0]!;
  const sizeStr = lines[1]!;
  const rootB64 = lines[2]!;
  if (!/^(0|[1-9][0-9]*)$/.test(sizeStr)) throw new Error("checkpoint tree size is not a decimal integer");
  if (origin.length === 0) throw new Error("checkpoint origin is empty");
  const root = decodeBase64(rootB64);
  if (root.length !== 32) throw new Error("checkpoint root is not 32 bytes");
  return { body, origin, treeSize: BigInt(sizeStr), root, signer, signature: raw };
}

function verifyCheckpointSignature(cp: ParsedCheckpoint, pem: string): boolean {
  let key: KeyObject;
  try {
    key = createPublicKey(pem);
  } catch {
    return false;
  }
  const prefix = Buffer.from(spkiSha256(key), "hex").subarray(0, 4);
  if (!cp.signature.subarray(0, 4).equals(prefix)) return false;
  const sig = cp.signature.subarray(4);
  try {
    return verify("sha256", Buffer.from(cp.body, "utf8"), key, sig);
  } catch {
    return false;
  }
}

function verifySetSignature(payload: string, setB64: string, pem: string): boolean {
  let key: KeyObject;
  let sig: Buffer;
  try {
    key = createPublicKey(pem);
    sig = decodeBase64(setB64);
  } catch {
    return false;
  }
  try {
    return verify("sha256", Buffer.from(payload, "utf8"), key, sig);
  } catch {
    return false;
  }
}

function isHex64(v: unknown): v is string {
  return typeof v === "string" && HEX64.test(v);
}

export function verifyRekorAnchor(dir: string, opts: RekorVerifyOptions = {}): RekorVerifyResult {
  const errors: string[] = [];
  const rekorPath = join(dir, REKOR_FILENAME);
  const manifestPath = join(dir, MANIFEST_FILENAME);

  if (!existsSync(rekorPath)) {
    return { errors: [`rekor.json is missing — --rekor requires the inclusion proof`] };
  }
  if (!existsSync(manifestPath)) {
    return {
      errors: [`rekor.json cannot be checked — manifest.json is missing, so there is no manifest hash to anchor`],
    };
  }

  let parsed: unknown;
  try {
    parsed = parseJsonStrict(decodeUtf8Strict(readFileSync(rekorPath)));
  } catch (err) {
    const detail =
      err instanceof DuplicateKeyError
        ? `duplicate object key "${err.key}" at ${err.path}`
        : err instanceof Error
          ? err.message
          : String(err);
    return { errors: [`rekor.json cannot be parsed: ${detail}`] };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { errors: [`rekor.json is not an mlassure Rekor anchor`] };
  }
  const a = parsed as Record<string, unknown>;
  if (a["kind"] !== REKOR_KIND) {
    return {
      errors: [`rekor.json is not an mlassure Rekor anchor (kind ${JSON.stringify(a["kind"])})`],
    };
  }

  let manifestBytes: Buffer;
  try {
    manifestBytes = readFileSync(manifestPath);
  } catch (err) {
    return { errors: [`rekor cannot read manifest.json: ${err instanceof Error ? err.message : String(err)}`] };
  }
  const manifestSha256 = sha256Hex(manifestBytes);
  if (!isHex64(a["manifestSha256"])) {
    errors.push(`rekor.json manifestSha256 is not 64 lowercase hex`);
  } else if (a["manifestSha256"] !== manifestSha256) {
    errors.push(
      `rekor manifest digest does not match manifest.json on disk — rekor ${a["manifestSha256"]}, on disk ${manifestSha256}`
    );
  }

  if (typeof a["canonicalBody"] !== "string" || a["canonicalBody"].length === 0) {
    errors.push(`rekor.json canonicalBody is missing`);
  }
  if (!isHex64(a["leafHash"])) errors.push(`rekor.json leafHash is not 64 lowercase hex`);
  if (!isHex64(a["rootHash"])) errors.push(`rekor.json rootHash is not 64 lowercase hex`);
  if (!isHex64(a["logID"])) errors.push(`rekor.json logID is not 64 lowercase hex`);
  if (!Array.isArray(a["hashes"]) || !a["hashes"].every(isHex64)) {
    errors.push(`rekor.json hashes must be an array of 64-lowercase-hex digests`);
  }
  if (!Number.isSafeInteger(a["logIndex"]) || (a["logIndex"] as number) < 0) {
    errors.push(`rekor.json logIndex is not a non-negative safe integer`);
  }
  if (!Number.isSafeInteger(a["treeSize"]) || (a["treeSize"] as number) < 1) {
    errors.push(`rekor.json treeSize is not a positive safe integer`);
  }
  if (!Number.isSafeInteger(a["treeIndex"]) || (a["treeIndex"] as number) < 0) {
    errors.push(`rekor.json treeIndex is not a non-negative safe integer`);
  }
  if (
    Number.isSafeInteger(a["treeIndex"]) &&
    Number.isSafeInteger(a["treeSize"]) &&
    (a["treeIndex"] as number) >= (a["treeSize"] as number)
  ) {
    errors.push(
      `rekor.json treeIndex ${a["treeIndex"]} is outside tree size ${a["treeSize"]}`
    );
  }
  if (!Number.isSafeInteger(a["integratedTime"]) || (a["integratedTime"] as number) < 0 ||
      (a["integratedTime"] as number) > 8_640_000_000_000) {
    errors.push(`rekor.json integratedTime must be integer Unix seconds in 0..8640000000000`);
  }
  if (typeof a["identity"] !== "string" || !a["identity"].startsWith("spki-sha256:")) {
    errors.push(`rekor.json identity is not spki-sha256:<hex>`);
  }
  if (typeof a["signedEntryTimestamp"] !== "string" || a["signedEntryTimestamp"].length === 0) {
    errors.push(`rekor.json signedEntryTimestamp is missing`);
  }
  if (typeof a["checkpoint"] !== "string" || a["checkpoint"].length === 0) {
    errors.push(`rekor.json checkpoint is missing`);
  }

  // Anything past this needs a well-shaped artifact. Report the shape
  // errors and stop rather than throwing on a missing field.
  if (errors.length > 0) return { errors };

  const art = a as unknown as RekorArtifact;
  let body: Buffer;
  try {
    body = decodeBase64(art.canonicalBody);
  } catch {
    return { errors: [`rekor canonical body is not base64`] };
  }
  if (body.length === 0) return { errors: [`rekor canonical body is empty`] };

  const computedLeaf = leafHash(body).toString("hex");
  if (computedLeaf !== art.leafHash) {
    errors.push(
      `rekor leaf hash does not match the canonical body — recorded ${art.leafHash}, computed ${computedLeaf}`
    );
  }

  let bodyJson: unknown;
  try {
    bodyJson = parseJsonStrict(decodeUtf8Strict(body));
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    errors.push(`rekor canonical body cannot be parsed: ${detail}`);
    return { errors };
  }
  if (typeof bodyJson !== "object" || bodyJson === null || Array.isArray(bodyJson)) {
    errors.push(`rekor canonical body must be a JSON object`);
    return { errors };
  }
  const rec = bodyJson as {
    apiVersion?: unknown;
    kind?: unknown;
    spec?: {
      data?: { hash?: { algorithm?: unknown; value?: unknown } };
      signature?: { content?: unknown; publicKey?: { content?: unknown } };
    };
  };
  if (rec.kind !== "hashedrekord") {
    errors.push(
      `rekor canonical body is not a hashedrekord entry (kind ${JSON.stringify(rec.kind)})`
    );
    return { errors };
  }
  if (rec.apiVersion !== "0.0.1") {
    errors.push(`rekor hashedrekord apiVersion must be "0.0.1"`);
    return { errors };
  }
  const algorithm = rec.spec?.data?.hash?.algorithm;
  const value = rec.spec?.data?.hash?.value;
  if (algorithm !== "sha256" || value !== art.manifestSha256) {
    errors.push(
      `rekor canonical body hash does not match manifestSha256 (algorithm ${JSON.stringify(algorithm)}, value ${JSON.stringify(value)})`
    );
  }

  const pkB64 = rec.spec?.signature?.publicKey?.content;
  const sigB64 = rec.spec?.signature?.content;
  if (typeof pkB64 !== "string" || typeof sigB64 !== "string") {
    errors.push(`rekor canonical body has no signature and public key`);
  } else {
    let signerPem: string;
    try {
      signerPem = decodeUtf8Strict(decodeBase64(pkB64));
      const signerKey = barePublicKey(signerPem);
      const id = `spki-sha256:${spkiSha256(signerKey)}`;
      if (id !== art.identity) {
        errors.push(
          `rekor identity ${art.identity} does not match the logged public key ${id}`
        );
      }
      const ok = verify(
        "sha256",
        manifestBytes,
        signerKey,
        decodeBase64(sigB64)
      );
      if (!ok) {
        errors.push(`rekor artifact signature does not verify under the logged identity`);
      }
    } catch (err) {
      errors.push(
        `rekor logged public key or artifact signature is not usable: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  let recomputed: Buffer | null = null;
  try {
    recomputed = rootFromInclusionProof(
      Buffer.from(art.leafHash, "hex"),
      art.treeIndex,
      art.treeSize,
      art.hashes.map((h) => Buffer.from(h, "hex"))
    );
  } catch (err) {
    errors.push(
      `rekor inclusion proof is not valid: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  if (recomputed !== null && recomputed.toString("hex") !== art.rootHash) {
    errors.push(
      `rekor inclusion proof does not recompute to the recorded root — proof ${recomputed.toString("hex")}, recorded ${art.rootHash}`
    );
  }

  const checkpointText = opts.rekorCheckpoint ?? art.checkpoint;
  let cp: ParsedCheckpoint | null = null;
  try {
    cp = parseCheckpoint(checkpointText);
  } catch (err) {
    errors.push(
      `rekor checkpoint cannot be parsed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  if (cp !== null && recomputed !== null && !cp.root.equals(recomputed)) {
    errors.push(
      `rekor checkpoint root does not match inclusion root — the verifier compares roots, not log indexes (checkpoint ${cp.root.toString("hex")}, inclusion ${recomputed.toString("hex")})`
    );
  }
  if (cp !== null && cp.treeSize !== BigInt(art.treeSize)) {
    errors.push(
      `rekor checkpoint tree size ${cp.treeSize} does not match the inclusion proof's tree size ${art.treeSize} — a later log head is not this root`
    );
  }

  if (cp !== null) {
    const pem = opts.rekorPublicKeyPem ?? (cp.signer === VENDORED_REKOR_SIGNER ? VENDORED_REKOR_PUBLIC_KEY : undefined);
    if (pem === undefined) {
      errors.push(
        `rekor checkpoint signer ${JSON.stringify(cp.signer)} is not the vendored Rekor log key; pass --rekor-key to name the trust anchor`
      );
    } else {
      let logId: string;
      try {
        const logKey = barePublicKey(pem);
        if (logKey.asymmetricKeyType !== "ec" || logKey.asymmetricKeyDetails?.namedCurve !== "prime256v1") {
          throw new Error("log key must be ECDSA P-256");
        }
        logId = spkiSha256(logKey);
      } catch (err) {
        errors.push(
          `rekor log public key is not usable: ${err instanceof Error ? err.message : String(err)}`
        );
        logId = "";
      }
      if (logId !== "" && logId !== art.logID) {
        errors.push(
          `rekor logID ${art.logID} does not match the log public key ${logId}`
        );
      }
      if (!verifyCheckpointSignature(cp, pem)) {
        errors.push(`rekor checkpoint signature did not verify under the configured log key`);
      }
      const payload = entryTimestampPayload(
        art.canonicalBody,
        art.integratedTime,
        art.logID,
        art.logIndex
      );
      if (!verifySetSignature(payload, art.signedEntryTimestamp, pem)) {
        errors.push(`rekor signed entry timestamp did not verify`);
      }
      if (errors.length === 0 && recomputed !== null) {
        return {
          errors,
          anchor: {
            rootHash: recomputed.toString("hex"),
            logIndex: art.logIndex,
            treeIndex: art.treeIndex,
            treeSize: art.treeSize,
            integratedTime: art.integratedTime,
            identity: art.identity,
            logID: logId,
            trustSource: opts.rekorPublicKeyPem === undefined ? "vendored" : "custom",
            signer: cp.signer,
          },
        };
      }
    }
  }

  return { errors };
}
