# Custody bundle conformance vectors

Machine-checkable examples of the custody bundle format specified in [`SPEC.md`](../../SPEC.md) (see §7).

- `positive/<name>/` — a complete bundle written by the reference writer. It must verify with **zero** violations, and its `rootHash` must be reproducible from its own manifest.
- `negative/<name>/` — a byte copy of the positive bundle with exactly **one** deliberate fault. The file `negative/<name>.EXPECTED.json` beside it names the check it exercises (`V-1` … `V-12`), the error pattern a conforming verifier must produce, and why. It sits *beside* the bundle, not inside it, because the format admits no junk-file allowlist: inside, it would itself be an unaccounted file.

**Rejected for the wrong reason is not a pass.** A verifier that fails a negative vector on some other ground has not demonstrated that the named check exists. The reference test (`src/output/bundle.vectors.test.ts`) asserts that at least one actual violation matches the vector's `errorPattern`.

A few negatives note an *expected companion* violation in their description (for example, an unmanifested `report.json` also trips completeness). The named check is still the one the pattern targets.

Regenerate with `bun scripts/make-bundle-vectors.ts`. Every varying input is pinned (timestamps, evidence UUIDs, content), so two runs produce byte-identical trees; a diff after regeneration means a vector genuinely changed. The generator refuses to exit if any pattern fails to match the reference verifier's real output.

No symlink vector is shipped (git and Windows checkouts do not preserve them reliably); the verifier's symlink rejection is covered by a unit test that creates one at runtime.
