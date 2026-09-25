# mlassure custody bundle — format specification

**Format:** `bundleFormatVersion` `"1"` · **Status:** stable since milestone M3g (live-verified 2026-07-22, shipped in 0.3.0 on 2026-08-13); verification checks V-2, V-4, V-5 added in 0.5.0 without changing the written format · **Reference implementation:** `src/output/bundle.ts` (writer + verifier), `src/cli/index.ts` (`assess --bundle`, `verify-bundle`) · **Conformance vectors:** `fixtures/bundles/` · **License:** Apache-2.0

This document is the custody bundle format on its own, separated from the tool that produces it, so that a second implementation can write or verify a bundle without reading mlassure's source. Where this document and the reference implementation disagree, that is a bug in one of them; file it.

The key words MUST, MUST NOT, SHOULD, and MAY are to be interpreted as described in RFC 2119 and RFC 8174.

---

## 1. What a bundle is, and what it is not

A **custody bundle** is a directory that holds everything one assessment run produced and everything it retrieved, plus a **manifest** that commits to every byte of it. It gives a relying party four properties, each by a named mechanism:

| Property | Mechanism | Where |
| --- | --- | --- |
| Integrity | per-file SHA-256 over the bytes on disk | manifest `files[].sha256` |
| Completeness | a root hash over the manifest metadata and the sorted (path, digest) pairs, plus strict extra-file detection at verification | manifest `rootHash`; check V-12 |
| Authenticity | an external signature over `manifest.json` (Cosign; key pair or keyless) | `manifest.sig.bundle` (outside the format, see §6) |
| Tamper-evidence | any single-byte change in any covered file fails verification and names the file | checks V-9, V-10 |

**What the format does not prove.** A bundle proves *who* produced *which bytes* and that they are *unaltered since*. It does not prove that the assessment methodology was sound, that the evidence collected was the right evidence, or that the judgments inside `report.json` are correct. Custody is provable; judgment is not. A signed bundle with a wrong verdict inside it verifies perfectly. Consumers MUST NOT describe a verified bundle as an "audit trail" of correctness; it is a custody trail of bytes.

**Scope of the claim.** The bundle evidences an *assessment run* — a batch process that read evidence and wrote a report. It is not evidence of the target system's runtime actions, and it makes no claim in any Proof-of-Control domain (C1–C6); its relationship to that standard is analysed in `docs/proof-of-control.md`.

---

## 2. Directory layout

```
<bundle>/
├── report.json               REQUIRED   the AssessmentReport, pretty-printed JSON (2-space)
├── evidence/                 REQUIRED   one file per retrieved evidence item, cited or not
│   └── <uuid>.json                      lowercase UUID filename; see §3.2
├── oscal.json                OPTIONAL   OSCAL Assessment Results from the same run
├── narrative.md              OPTIONAL   Markdown narrative from the same run
├── manifest.json             REQUIRED   written LAST; see §4
├── manifest.sig.bundle       EXEMPT     Cosign signature bundle (written after the manifest, by cosign)
├── manifest.json.sig         EXEMPT     alternative detached signature name
└── cosign.pub                EXEMPT     the public key, when distributed with the bundle
```

Rules:

- A bundle directory contains **regular files only**. Symlinks, device nodes, sockets, and empty directories are violations (V-12). The only directory the writer creates is `evidence/`.
- The writer MUST refuse a target directory that exists and is non-empty. A custody bundle never mixes runs.
- Paths inside the bundle are `/`-separated, relative, and Unicode NFC-normalized. Today every path the writer produces is ASCII.
- **Every** retrieved evidence item is bundled, whether or not the judgment cited it. Custody covers what the assessor *saw*, not only what it *used*. Bundle payloads are raw retrieved evidence at rest and MUST be access-controlled accordingly (see `SECURITY.md`).

---

## 3. File contents

### 3.1 `report.json`

The `AssessmentReport` object exactly as produced by the run (`src/runner/assessment-runner.ts`). The fields the format itself relies on:

| Field | Type | Role in the format |
| --- | --- | --- |
| `targetName` | string | MUST equal manifest `targetName` (V-11) |
| `controlSetVersion` | string | MUST equal manifest `controlSetVersion` (V-11) |
| `results[]` | array | each entry MUST carry `retrievedEvidence[]`; the writer refuses a report without it |
| `results[].judgment.evidenceCited[]` | string[] | drives the `cited` flag on each evidence file |

Every other field (`llmModel`, `llmTemperature`, `replica`, per-control `controlIntent`, coverage numbers) is carried verbatim and covered by the hash, but the format does not interpret it.

### 3.2 `evidence/<uuid>.json`

One file per retrieved evidence item across all controls:

```json
{
  "controlId": "SI-6(1)",
  "cited": true,
  "evidence": {
    "id": "6f1c…",            // UUID; the filename is this id, lowercased
    "source": "aws:sagemaker:describe-endpoint",
    "retrievedAt": "2026-07-22T00:00:00.000Z",
    "sha256": "…",             // content hash of the payload as computed at ingest
    "payload": { … }           // the raw retrieved evidence, unmodified
  }
}
```

- `evidence.id` MUST be a UUID (RFC 4122 textual form); the writer refuses any other id rather than smuggle it into a filename.
- An evidence id MUST be unique across the whole bundle; the writer refuses a duplicate rather than overwrite.
- The `cited` flag is derived from `report.json`; it is informational and covered by the hash like everything else.

### 3.3 `oscal.json`, `narrative.md`

Present only when the same run produced them. Bytes are whatever the run wrote; the format only commits to them.

---

## 4. The manifest

`manifest.json` is pretty-printed JSON (2-space indent) with exactly these members:

```json
{
  "bundleFormatVersion": "1",
  "algorithm": "sha256",
  "createdAt": "2026-07-22T00:00:00.000Z",
  "targetName": "fraud-detection-v2",
  "controlSetVersion": "nist-subset-1.0",
  "files": [
    { "path": "report.json", "sha256": "<64 lowercase hex>", "bytes": 12345 },
    { "path": "evidence/6f1c….json", "sha256": "…", "bytes": 678 }
  ],
  "rootHash": "<64 lowercase hex>"
}
```

| Member | Type | Constraint |
| --- | --- | --- |
| `bundleFormatVersion` | string | MUST be `"1"` for this specification (V-4) |
| `algorithm` | string | MUST be `"sha256"`. This is the **algorithm identifier** for every digest in the manifest — `files[].sha256` and `rootHash` — and it is mandatory: a verifier presented with a manifest that omits it or names an algorithm it does not implement MUST reject the manifest rather than assume one (V-5). |
| `createdAt` | string | ISO 8601 UTC timestamp of the manifest write. Wall clock by default; the writer MAY accept an override for reproducible fixtures. Covered by `rootHash`. |
| `targetName` | string | copied from `report.json`; covered by `rootHash` and cross-checked (V-11) |
| `controlSetVersion` | string | same |
| `files[]` | array | one entry per covered file; MUST be non-empty (V-6); MUST list `report.json` (V-8); entries MUST NOT name `manifest.json` or a signature artifact (V-7) |
| `files[].path` | string | relative, `/`-separated, NFC; MUST NOT start with `/` or `~`, contain `..` or `\` (V-7); unique within the manifest (V-7) |
| `files[].sha256` | string | 64 **lowercase** hex characters (V-7). Uppercase is a violation, not a case-fold: a digest that must be normalized before comparison is two byte strings pretending to be one. |
| `files[].bytes` | integer ≥ 0 | byte length of the file. **Not** in the root-hash pre-image (§4.1 commits to path and digest only); checked against the file by V-9 as a secondary sanity field — a matching SHA-256 with a different length would be a hash collision, so `bytes` never carries the verdict on its own. |
| `rootHash` | string | 64 lowercase hex; see §4.1 |

Any other member is not part of format 1. A verifier MAY ignore unknown members but MUST NOT let them influence the verdict.

### 4.1 Root hash construction

The root hash commits to the manifest **metadata** and to every (path, digest) pair. Metadata is inside the hash deliberately: without it an unsigned verification would call a bundle "intact" while `targetName` and `controlSetVersion` were freely editable.

```
pairs     = sort( [ [NFC(path), sha256] for each entry in files ] )
             — sorted by path, UTF-16 code-unit order (plain JavaScript string comparison)
rootHash  = SHA-256( UTF-8( JSON.stringify( [
               bundleFormatVersion, algorithm, createdAt, targetName, controlSetVersion,
               pairs
             ] ) ) )   rendered as 64 lowercase hex characters
```

`JSON.stringify` here means the compact ECMAScript serialization: no whitespace; arrays only (there are no objects, so key ordering never arises); no numbers anywhere in the pre-image, so number formatting never arises. **String escaping, stated for a non-JavaScript implementer** (this matters because `targetName` and `controlSetVersion` are operator-supplied and not guaranteed ASCII): escape exactly `"` as `\"`, `\` as `\\`, and the C0 controls U+0000–U+001F — using the short forms `\b \f \n \r \t` where they exist and `\u00xx` with **lowercase** hex otherwise; a lone (unpaired) surrogate is escaped as `\udxxx` lowercase; every other code point, including all non-ASCII, is emitted raw as UTF-8. This is ECMA-262 `JSON.stringify` (well-formed variant) and coincides with RFC 8785 §3.2.2.2 for strings. Metadata strings are **not** NFC-normalized; only `path` is. The array encoding is injective, so no delimiter ambiguity exists for hostile path strings.

The sort is stated as UTF-16 code-unit order so that a non-JavaScript implementation reproduces it exactly; for ASCII paths it coincides with byte order and Unicode code-point order.

### 4.2 Write order

The writer MUST write `manifest.json` **last**, after every covered file has been written and re-read from disk for hashing. The digests are computed over the bytes actually on disk, never over the strings the writer intended to write. A crash mid-write therefore leaves a directory with no manifest, which is loudly unverifiable (V-1), never a manifest that describes files that did not land.

---

## 5. Verification procedure

A verifier MUST report **all** violations it can determine and MUST NOT stop at the first *determinable* one. Four checks are **terminal** because nothing after them is determinable: V-1 (no manifest), V-2 (manifest not parseable, or duplicate key), V-3 (not a manifest shape), V-6 (no files to check). A terminal check still returns every violation found before it (V-4/V-5 precede V-6). The verdict is `ok` only when the violation list is empty ("aggregate fail-loud"). A bundle with zero violations and `checkedFiles = N` means: N manifested files exist, hash and size as stated; the manifest is internally consistent; the metadata agrees with the covered report; and nothing else is in the directory.

The checks, with the error-string prefix the reference verifier emits for each. The prefixes are the contract the conformance vectors assert against (§7): a vector rejected for a *different* reason than the one it was written to exercise is not a pass.

| ID | Check | Reference error prefix |
| --- | --- | --- |
| V-1 | the bundle directory exists and `manifest.json` exists in it *(terminal)* | `bundle directory does not exist:` · `no manifest.json in` |
| V-2 | *(terminal)* `manifest.json` parses as JSON with **no duplicate object key** at any depth. Last-wins resolution is forbidden: one manifest must mean one thing to every reader. The same rule applies to `report.json` when it is read for V-11. | `manifest.json contains a duplicate object key` · `report.json contains a duplicate object key` · `manifest.json is not valid JSON` |
| V-3 | *(terminal)* manifest has `files` (array) and `rootHash` (string) | `manifest.json is missing "files" or "rootHash"` |
| V-4 | `bundleFormatVersion` is one this verifier implements (`"1"`) | `unsupported bundleFormatVersion` |
| V-5 | `algorithm` is present and is one this verifier implements (`"sha256"`); never assumed | `unrecognized digest algorithm` |
| V-6 | *(terminal)* `files` is non-empty (the writer always bundles `report.json`) | `manifest lists zero files` |
| V-7 | each `files[]` entry is well-formed: object; non-empty path string; path does not escape the bundle; path does not name the manifest or a signature artifact; 64 lowercase-hex `sha256`; non-negative integer `bytes`; no duplicate paths | `manifest files[N] …` (several sub-forms; see the vectors) |
| V-8 | `files` lists `report.json` | `manifest does not list report.json` |
| V-9 | every manifested file exists, is a regular readable file, its SHA-256 equals the entry's, and its byte length equals `bytes` | `missing file listed in manifest:` · `unreadable file listed in manifest:` · `hash mismatch:` · `size mismatch:` |
| V-10 | `rootHash` equals the §4.1 recomputation over the manifest's own metadata and entries (skipped when any V-7 violation exists, since those already force failure) | `rootHash mismatch:` |
| V-11 | manifest `targetName` and `controlSetVersion` equal the values inside the hash-covered `report.json` (an attacker who recomputes `rootHash` must also alter `report.json`, which V-9 then catches) | `manifest targetName … disagrees with report.json` · `manifest controlSetVersion … disagrees with report.json` |
| V-12 | completeness of the directory: every regular file on disk is either manifested or one of the exempt signature artifacts by exact name (`manifest.json`, `manifest.sig.bundle`, `manifest.json.sig`, `cosign.pub`); no symlinks; no empty directories; no other filesystem entry kinds; no unreadable entries | `unaccounted file in bundle:` · `symlink inside bundle:` · `empty directory inside bundle:` · `unsupported filesystem entry inside bundle:` · `unreadable directory inside bundle:` · `unreadable entry inside bundle:` |

Notes for implementers:

- **Unicode normalization at verification.** The verifier NFC-normalizes both manifest entry paths and the names it reads from the filesystem before comparing them, before the completeness check, and before recomputing the root hash. A verifier that compares raw bytes diverges on NFD filesystems (macOS) for any non-ASCII path.
- Verification MUST hash the bytes on disk. Re-serializing JSON to re-hash is wrong: key order and whitespace are not canonical in format 1, and the digest is over bytes.
- Manifest entries are **untrusted input**. The writer only ever emits clean relative paths; an absolute path, `..`, or `\` in an entry is proof of tampering *and* an attempt to point verification outside the bundle. A verifier MUST reject such an entry before touching the filesystem with it.
- There is no allowlist for "junk" files (`.DS_Store`, `Thumbs.db`). An allowlist is an attacker's hiding spot. The only exemptions are the four signature-artifact names, exact-match.
- Malformed input (a manifest that is not an object, an entry that is a number, an unreadable file) is a custody **verdict** ("unverifiable"), never an exception out of the verifier.

---

## 6. Authenticity: signing the manifest

Authenticity is outside format 1 and delegated to Sigstore Cosign. The manifest covers the files; the signature covers the manifest:

```bash
# key pair
cosign sign-blob --key cosign.key --yes --bundle <bundle>/manifest.sig.bundle <bundle>/manifest.json
cosign verify-blob --key cosign.pub --bundle <bundle>/manifest.sig.bundle <bundle>/manifest.json

# keyless (Sigstore OIDC; pin issuer and identity)
cosign sign-blob --yes --bundle manifest.sig.bundle manifest.json
cosign verify-blob --bundle manifest.sig.bundle \
  --certificate-identity-regexp "https://github.com/.*mlassure" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com" manifest.json
```

`verify-bundle` does **not** check the signature and says so in its output. A complete verification is the format checks (§5) *and* a Cosign verification. A signature over a manifest that fails §5 proves only that someone signed a broken manifest.

Who holds the signing key determines what the signature is worth. With an operator-held key pair, the signature attests that the operator produced these bytes: an outsider still trusts the operator's key custody. Keyless signing places the signing event in Rekor, Sigstore's public append-only transparency log, which any party can check without the operator's cooperation; that is the path toward evidence that does not rest on a single trusted party (see `docs/proof-of-control.md`, and roadmap milestone M9).

---

## 7. Conformance vectors

`fixtures/bundles/` holds:

- `positive/<name>/` — a complete bundle that MUST verify with zero violations.
- `negative/<name>/` — a bundle with exactly **one** deliberate fault, plus `negative/<name>.EXPECTED.json` **beside** the bundle directory (never inside it: an extra file inside would itself be a V-12 violation and destroy the one-fault property):

```json
{
  "check": "V-9",
  "errorPattern": "^hash mismatch: report\\.json",
  "description": "one byte of report.json changed after the manifest was written"
}
```

An implementation conforms to this specification when it (a) verifies every positive vector with zero violations, (b) rejects every negative vector with at least one violation matching that vector's `errorPattern` **for that reason** (a rejection on some other ground is a failed test — it does not demonstrate the named check exists), and (c) reproduces the positive vectors' `rootHash` values from their manifests' metadata and entries using §4.1.

The reference implementation runs exactly this in `src/output/bundle.vectors.test.ts`, so the specification, the vectors, and the code cannot drift apart without a failing test. Vectors are generated by `scripts/make-bundle-vectors.ts` with a fixed `createdAt` and fixed evidence UUIDs so regeneration is byte-stable; the generator itself refuses to exit if any negative vector is rejected for a reason other than its stated one. A negative's description may name an *expected companion* violation (e.g. an unmanifested `report.json` also trips V-12); the `errorPattern` still targets the single named check.

---

## 8. Versioning

`bundleFormatVersion` is a string. A verifier implements a fixed set of versions and refuses the rest (V-4). A change to the manifest members, the root-hash construction, the sort order, the exemption list, or the evidence-file shape is a new format version. Adding a *verification check* that rejects only what the format-1 writer never produced (as 0.5.0 did with V-2, V-4, V-5) is not a format change: every bundle written by an earlier format-1 writer still verifies.

## 9. References

- Sigstore Cosign — `sign-blob` / `verify-blob`, bundle format
- RFC 8785, JSON Canonicalization Scheme — cited for the string-escaping equivalence in §4.1 only; format 1 does not canonicalize whole documents
- RFC 4122 — UUID textual form for evidence ids
- LF Decentralized Trust, *Proof-of-Control* v1.0 draft, chapter C7.7 (the Interoperable Property) — the checks V-2, V-4, V-5 and the negative-vector discipline in §7 follow its requirements 7.7.3, 7.7.4, 7.7.5; the crosswalk is in `docs/proof-of-control.md`
