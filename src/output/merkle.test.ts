import { describe, it, expect } from "bun:test";
import { leafHash, merkleRoot, inclusionProof, rootFromInclusionProof } from "./merkle.js";

function leaves(n: number): Buffer[] {
  return Array.from({ length: n }, (_, i) => leafHash(Buffer.from(`leaf-${i}`)));
}

describe("RFC 6962 inclusion proofs", () => {
  it("a one-leaf tree has an empty proof and the leaf hash is the root", () => {
    const [only] = leaves(1);
    expect(inclusionProof([only!], 0)).toEqual([]);
    expect(rootFromInclusionProof(only!, 0, 1, []).equals(merkleRoot([only!]))).toBe(true);
  });

  it("every index of every tree size through 32 recomputes to that tree's root", () => {
    for (let n = 1; n <= 32; n++) {
      const ls = leaves(n);
      const root = merkleRoot(ls);
      for (let i = 0; i < n; i++) {
        const proof = inclusionProof(ls, i);
        const got = rootFromInclusionProof(ls[i]!, i, n, proof);
        expect(got.equals(root), `size ${n} index ${i}`).toBe(true);
      }
    }
  });

  it("a flipped sibling does not recompute to the root", () => {
    const ls = leaves(4);
    const proof = inclusionProof(ls, 0);
    proof[0] = leafHash(Buffer.from("not-a-sibling"));
    const got = rootFromInclusionProof(ls[0]!, 0, 4, proof);
    expect(got.equals(merkleRoot(ls))).toBe(false);
  });

  it("the same index in two trees is not the same root", () => {
    const a = leaves(4);
    const b = leaves(4);
    b[2] = leafHash(Buffer.from("forked"));
    const proofA = inclusionProof(a, 0);
    const rootA = rootFromInclusionProof(a[0]!, 0, 4, proofA);
    expect(rootA.equals(merkleRoot(a))).toBe(true);
    expect(rootA.equals(merkleRoot(b))).toBe(false);
  });

  it("rejects an index outside the tree and a proof of the wrong length", () => {
    const ls = leaves(4);
    const proof = inclusionProof(ls, 1);
    expect(() => rootFromInclusionProof(ls[1]!, 4, 4, proof)).toThrow(/outside tree size/);
    expect(() => rootFromInclusionProof(ls[1]!, 1, 4, proof.slice(0, -1))).toThrow(/too short/);
    expect(() => rootFromInclusionProof(ls[1]!, 1, 4, [...proof, proof[0]!])).toThrow(/extra hashes/);
  });
});
