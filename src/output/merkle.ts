/**
 * RFC 6962 Merkle trees, the construction Rekor's Trillian log uses.
 *
 * Leaf hash:  SHA-256(0x00 || leaf bytes)
 * Node hash:  SHA-256(0x01 || left || right)
 *
 * `rootFromInclusionProof` is the iterative verifier from
 * certificate-transparency (the same one that accepts a proof returned by
 * Rekor's API). Success is "the recomputed root equals the checkpoint
 * root". The log index is an input to that recomputation, not a verdict:
 * two trees can both contain index 0 and still have different roots.
 */

import { createHash } from "node:crypto";

export function leafHash(data: Uint8Array): Buffer {
  return createHash("sha256")
    .update(Buffer.concat([Buffer.from([0x00]), Buffer.from(data)]))
    .digest();
}

function hashChildren(left: Uint8Array, right: Uint8Array): Buffer {
  return createHash("sha256")
    .update(Buffer.concat([Buffer.from([0x01]), Buffer.from(left), Buffer.from(right)]))
    .digest();
}

/** Largest power of two strictly less than n. n >= 2. */
function largestPowerOfTwoLessThan(n: number): number {
  let k = 1;
  while (k * 2 < n) k *= 2;
  return k;
}

/** Root of a tree whose leaves are already RFC 6962 leaf hashes. */
export function merkleRoot(leafHashes: Uint8Array[]): Buffer {
  const n = leafHashes.length;
  if (n === 0) throw new Error("merkle: empty tree");
  if (n === 1) return Buffer.from(leafHashes[0]!);
  const k = largestPowerOfTwoLessThan(n);
  return hashChildren(merkleRoot(leafHashes.slice(0, k)), merkleRoot(leafHashes.slice(k)));
}

/**
 * Audit path for `index`, leaf-toward-root, in the order
 * `rootFromInclusionProof` consumes.
 */
export function inclusionProof(leafHashes: Uint8Array[], index: number): Buffer[] {
  const n = leafHashes.length;
  if (!Number.isInteger(index) || index < 0 || index >= n) {
    throw new Error(`inclusion proof: index ${index} is outside tree size ${n}`);
  }
  if (n === 1) return [];
  const k = largestPowerOfTwoLessThan(n);
  if (index < k) {
    return [...inclusionProof(leafHashes.slice(0, k), index), merkleRoot(leafHashes.slice(k))];
  }
  return [...inclusionProof(leafHashes.slice(k), index - k), merkleRoot(leafHashes.slice(0, k))];
}

/**
 * Recompute the root from a leaf hash and an audit path.
 * Throws when the proof cannot describe a tree of `treeSize` — a bad proof
 * is not a root that happens to mismatch.
 */
export function rootFromInclusionProof(
  leaf: Uint8Array,
  index: number | bigint,
  treeSize: number | bigint,
  proof: Uint8Array[]
): Buffer {
  let fn = BigInt(index);
  const size = BigInt(treeSize);
  if (fn < 0n || fn >= size) {
    throw new Error(`inclusion proof: index ${fn} is outside tree size ${size}`);
  }
  let sn = size - 1n;
  let r: Uint8Array = Buffer.from(leaf);
  for (const p of proof) {
    if (p.length !== 32) throw new Error("inclusion proof: hash is not 32 bytes");
    if (sn === 0n) throw new Error("inclusion proof: proof has extra hashes");
    if (fn % 2n === 1n || fn === sn) {
      r = hashChildren(p, r);
      while (fn % 2n === 0n && fn !== 0n) {
        fn >>= 1n;
        sn >>= 1n;
      }
    } else {
      r = hashChildren(r, p);
    }
    fn >>= 1n;
    sn >>= 1n;
  }
  if (sn !== 0n) throw new Error("inclusion proof: proof is too short");
  return Buffer.from(r);
}
