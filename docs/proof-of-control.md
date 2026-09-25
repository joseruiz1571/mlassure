# mlassure and Proof-of-Control: a requirement-level crosswalk

**Standard:** LF Decentralized Trust / Advanced AI Society, *Proof-of-Control* — v1.0 launch draft of 2026-09-23 (repository `LFDT-ProofOfControl/ov-poc-standard`, chapters under `0.1/en/`, 127 requirements; public comment open through 2026-10-30). Requirement IDs below use the repository's `C7.7.3` form.
**Subject:** the mlassure custody bundle, format 1, as specified in [`SPEC.md`](../SPEC.md), produced by mlassure 0.5.0.
**Date of this analysis:** 2026-09-25. **Stage:** Self-Declared (C10.1.1). **Author:** the maintainer.

> **The one-line result.** mlassure's custody bundle is **Tier 2 (Attestation)** evidence under C8: it is hash-committed and signed, anyone can re-verify the bytes, but a single party — the operator who ran the assessment and holds the signing key — must be trusted for the evidence to mean anything. It is not Proof-of-Control, and this document does not claim that it is. The interoperability requirements in C7.7 are where the format now stands closest to the standard, and the path to a Tier 3 custody claim is concrete (§5).

---

## 1. What is being graded, and what is not

Proof-of-Control grades **evidence of what an agent did** at an action boundary. mlassure is not that agent's gateway. mlassure is an *assessor*: a batch tool that reads evidence about a target ML deployment, runs an LLM judgment loop where judgment is required, and writes a report. The custody bundle is evidence of **the assessment run** — which bytes the assessor retrieved and produced, and that they have not changed since.

So the crosswalk has a narrow, stated scope (C10.1.6):

| In scope | Out of scope, with reason |
| --- | --- |
| The bundle writer and verifier (`src/output/bundle.ts`), the format (`SPEC.md`), the Cosign signing step, the conformance vectors | **The target system's runtime.** mlassure never intercepts the target's actions; it reads configuration and logs after the fact. No C1–C6 domain claim is made for the target. |
| The claim: *"these bytes are what the signer produced, and they are unaltered since."* | **The judgments inside `report.json`.** Whether a verdict is *right* is exactly the thing custody cannot prove (C7.5, and mlassure's own README). |
| | **mlassure's own agent loop as a governed agent.** Its tool calls are intercepted in-process (`ToolExecutor` → `EvidenceStore` → `CitationGuard`), not by a separate-process gateway. That is a Tier 1 mechanism by C7.1.1 and is graded as such in §3. |

**Domains claimed (C10.1.2): none.** The words "Proof-of-Control" appear in mlassure's materials only in this analysis (C8.1.4).

---

## 2. The custody claim, graded

### 2.1 Claim register (C8.1.1–C8.1.3)

| # | Claim | Evidence stream | Mechanism | Parties that must be trusted | Tier |
| --- | --- | --- | --- | --- | --- |
| CC-1 | The files in a bundle are byte-identical to what the writer produced at `createdAt`. | `manifest.json` | per-file SHA-256; root hash over metadata + sorted (path, digest) pairs; strict completeness check | SHA-256 (mathematical); the verifier implementation | **2** — verifiable by anyone, but *which* bytes were produced is asserted by the operator (CC-2) |
| CC-2 | The manifest was produced by a named signer and not altered since. | `manifest.sig.bundle` | Cosign `sign-blob` over `manifest.json` | key-pair mode: the operator's key custody. Keyless mode: the OIDC identity provider, Fulcio CA, Rekor transparency log | **2** — a single party (the operator as signer) is trusted; C8.1.3 caps this at Tier 2 |
| CC-3 | The bundle contains *every* evidence item the assessor retrieved, cited or not. | `evidence/*.json`, `report.json` | writer bundles all `retrievedEvidence`; manifest completeness | the writer implementation; the operator not to have run a modified writer | **1** — the operator's word that the binary was unmodified, unless the run is itself attested |

C8.1.2's rule — *any single trusted party caps the claim at Tier 2* — decides the placement. Nothing here is Proof-of-Control (C8.1.4), and the standard's own worked example says why: *"A signed operator log is Tier 2."*

### 2.2 Trust-assumption disclosure (C7.4.1, C10.2.1, C10.2.2)

Categories from the C10.2.2 draft set: Hardware · Mathematical · Ceremony · Vendor · Implementation · Distributed.

| Assumption | Subject | Category | Applies to |
| --- | --- | --- | --- |
| SHA-256 is second-preimage- and collision-resistant | SHA-256 | Mathematical | CC-1, CC-2 |
| The signature scheme is sound | Cosign default (ECDSA P-256) or the operator's chosen key type | Mathematical | CC-2 |
| The signing key is held only by the operator (key-pair mode) | operator's key custody | Implementation | CC-2 |
| The OIDC provider honestly attests the signer's identity (keyless mode) | e.g. GitHub Actions OIDC, Google | Vendor | CC-2 |
| Fulcio issues certificates only to authenticated identities; Rekor is append-only and independently monitored (keyless mode) | Sigstore public-good instance | Vendor · Distributed | CC-2 |
| The Cosign and mlassure binaries a verifier runs are the published ones | sigstore/cosign, this repository, Bun | Implementation | CC-1, CC-2 |
| The operator ran an unmodified writer against the target it names, at the time it says | operator | Implementation | CC-3 |
| The evidence payloads are what the provider returned (fixture provider today; a live AWS provider would add AWS API honesty as a Vendor assumption) | provider | Vendor / Implementation | CC-3 |

Every mechanism in §2.1 has a disclosure line above; that is the C7.4.1 reconciliation.

---

## 3. Requirement-by-requirement: C7, C8.1, C10

Status vocabulary: **met** · **partial** · **not met** · **n/a** (out of scope for an assessment-run artifact, with reason). Level is the standard's own (1–4).

### C7.1 Generation at the action boundary

| Req | L | Status | mlassure |
| --- | --- | --- | --- |
| 7.1.1 | 3 | not met | Tool calls are intercepted in the same process as the agent (`src/tools/executor.ts`). No separate gateway; the agent has no bypass path today only because the executor map is the sole route, which is a code property, not a boundary. |
| 7.1.2 | 3 | not met | One evidence record per retrieval, at ingest; no before/during/after triple, no per-record signature. |
| 7.1.3 | 3 | not met | Evidence is written to the store before judgment, but the store is in-memory until the bundle is written at run end. |
| 7.1.4 | 3 | n/a | There is no effect channel: collectors are read-only by design (writes to AWS are permanently out of scope). |
| 7.1.5 | 1 | **met** | mlassure never claims its evidence describes executed actions of the target. It describes retrievals and a report. |

### C7.2 Contemporaneous

| Req | L | Status | mlassure |
| --- | --- | --- | --- |
| 7.2.1 | 1 | partial | Each evidence item carries `retrievedAt` stamped at retrieval, inside the run; the *bundle* is written at run end, which is batch-at-close, not per-event durability. |
| 7.2.2 | 3 | not met | No external time anchor. Keyless Cosign puts the signing event in Rekor with an inclusion proof and a log timestamp; recording that proof in the bundle is milestone M9. |
| 7.2.3, 7.2.4 | 3 | n/a | No hardware attestation is used or claimed. |

### C7.3 Tamper-evident

| Req | L | Status | mlassure |
| --- | --- | --- | --- |
| 7.3.1 | 2 | partial | The manifest is a flat hash commitment over a *set*: modifying, adding, or removing any file invalidates the root hash or trips completeness. Reordering is meaningless for a set. Verification is on demand (`verify-bundle`), not on a defined schedule with recorded results. |
| 7.3.2 | 3 | not met | The signing key is the operator's (key pair) or the operator's OIDC identity (keyless). Operator and mechanism are the same party. This is the requirement that fixes CC-2 at Tier 2. |
| 7.3.3 | 3 | not met | No equivocation resistance. Rekor (keyless) gives a single public log, which is the partial path. |
| 7.3.4 | 3 | partial | A verifier can check one evidence file with only `manifest.json` and that file — but the manifest lists every (path, digest) pair, so the "proof" is O(n) in bundle size, not a logarithmic inclusion proof. |
| 7.3.5 | 3 | n/a | Each run's bundle is an independent commitment; there is no sequence of published roots to check for append-only consistency. |

### C7.4 Transparent

| Req | L | Status | mlassure |
| --- | --- | --- | --- |
| 7.4.1 | 1 | **met** | §2.2 of this document, reconciled one-to-one against §2.1. |

### C7.5 The determinism boundary

| Req | L | Status | mlassure |
| --- | --- | --- | --- |
| 7.5.1 | 1 | **met** (manifest) | Every manifest field is an identifier, digest, timestamp, size, or version string (`SPEC.md` §4). The bundle *commits to* `report.json`, which contains judgments (`status`, `confidence`, `rationale`) — the format asserts nothing about them; it asserts their bytes. |
| 7.5.2 | 1 | partial | README, `SPEC.md` §1, and `verify-bundle`'s own stdout state that custody proves bytes, not correctness. There is no documented legal/compliance claims review; single maintainer. |

### C7.6 Custody and resilience

| Req | L | Status | mlassure |
| --- | --- | --- | --- |
| 7.6.1 | 2 | partial | Writer failures throw, the CLI exits 1 and names what landed; a crash leaves a manifest-less (loudly unverifiable) directory. No secondary durable failure log, no monitored alert. |
| 7.6.2 | 2 | partial | No sequence numbers. Within a bundle, omission is detected anyway: the manifest names every file, so a missing one is a V-9 violation. Across runs, nothing links bundle N to bundle N+1. |
| 7.6.3 | 4 | n/a | Not a gateway; there is no in-scope action to refuse. |
| 7.6.4 | 2 | not met | Bundles are directories; access control and read logging are whatever the filesystem or object store provides. `SECURITY.md` says to treat a bundle like the account it describes. |
| 7.6.5 | 1 | not met | No retention statement. |
| 7.6.6 | 3 | not met | No external anchoring of the root; see 7.2.2 and M9. |

### C7.7 Interoperable

| Req | L | Status | mlassure |
| --- | --- | --- | --- |
| 7.7.1 | 2 | **met** | `SPEC.md` §4 documents every field; `fixtures/schemas/bundle-manifest.schema.json` is the machine-readable schema; the writer's own output is validated against it in the test suite. |
| 7.7.2 | 2 | partial | Exactly which bytes each digest covers is stated (`SPEC.md` §4.1: per-file digests over bytes on disk; the root hash over a fully specified compact array encoding with a stated sort order; the signature over the manifest bytes as written). The manifest *document* itself has no canonical serialization — two conforming writers would produce the same `rootHash` but not the same manifest bytes. Absent-field semantics do not arise (no optional members). |
| 7.7.3 | 2 | **met** (0.5.0) | The manifest carries a mandatory `algorithm` identifier that governs every digest in it; a verifier that meets a manifest without one, or with one it does not implement, refuses rather than assumes (check V-5). Design note: the identifier is per-manifest, not a per-string `sha-256:` prefix as in the standard's own claim set; a future format could adopt the tagged form. |
| 7.7.4 | 3 | **met** (0.5.0) | `fixtures/bundles/` holds positive and negative vectors; each negative carries the single check it exercises and its expected error pattern; the suite fails a negative that is rejected for any other reason (`SPEC.md` §7). |
| 7.7.5 | 2 | **met** (0.5.0) | `verify-bundle` parses `manifest.json` and `report.json` with a strict parser that rejects duplicate keys at any depth, naming the key and path (check V-2). `JSON.parse`'s last-wins behaviour was the prior state. |

### C8.1 Tier placement

| Req | L | Status | mlassure |
| --- | --- | --- | --- |
| 8.1.1–8.1.3 | 1 | **met** | §2.1: three claims, each with a trust analysis and a Tier; the single-party rule applied. |
| 8.1.4 | 1 | **met** | "Proof-of-Control" appears in mlassure's materials only here, as analysis. |
| 8.1.5 | 3 | partial | Anyone can verify a bundle with published tooling and no operator credentials — but there is no *recorded* independent verification run, and the claim is Tier 2 anyway. |
| 8.1.6 | 1 | **met** | Rekor-style after-the-fact verification is placed at Tier 3 in §5, not Tier 4. |
| 8.1.7 | 3 | partial | Keyless mode rests on a vendor-rooted service (Sigstore); §5 composes it with Rekor's public log before any Tier 3 placement, and the vendor assumption is on the disclosure. |
| 8.1.8 | 3 | **met** | `verify-bundle` and Cosign are public, versioned, Apache-2.0, and need no credentials. |

### C10 Conformance and disclosure

| Req | L | Status | mlassure |
| --- | --- | --- | --- |
| 10.1.1 | 1 | **met** | Self-Declared. |
| 10.1.2 | 1 | **met** | No domains claimed. |
| 10.1.3, 10.1.4 | 1 | **met** | System: mlassure 0.5.0, bundle format 1, run on the operator's machine or in the published container. Claims, mechanisms, Tiers, disclosure: §2. |
| 10.1.5 | 1 | **met** | Standard version as cited in the header; date 2026-09-25. |
| 10.1.6 | 1 | **met** | §1 boundary table; excluded classes with reasons. |
| 10.1.7 | 2 | partial | The bundle format is machine-readable (schema); the *statement* is prose because the standard's own disclosure format is `[WG-INPUT NEEDED]` (Appendix D, issue 7). |
| 10.1.8 | 2 | n/a | No agent fleet to reconcile. |
| 10.2.1, 10.2.2 | 1–2 | **met** | §2.2, with categories. |

---

## 4. Where mlassure's design already agrees with the standard

Three of mlassure's oldest decisions are the standard's own positions, arrived at independently:

- **Custody is provable; judgment is not.** mlassure's README has said since M3g that a signature proves who produced the bytes, not that the judgment was right. C7.5 draws the same line: verification establishes deterministic execution facts, never the correctness of what a model produced.
- **The `attestation` pattern always returns `insufficient-evidence`.** A control that needs a named human's sign-off cannot be closed by machine-readable evidence, and mlassure makes that a code property, not a prompt. That is the Tier 1/Tier 2 distinction — an operator's assertion is not evidence — applied inside the assessor.
- **No allowlist for junk files; every retrieved item bundled, cited or not.** C7.6's premise: tamper-evidence detects alteration but not omission unless completeness is enforced. mlassure enforces it at the bundle boundary.

---

## 5. The path from Tier 2 to a Tier 3 custody claim (milestone M9)

C8.1.6 and the C8 worked examples place *"a public, append-only transparency log with independent monitors"* at Tier 3 — verifiable by anyone, after the fact, not gating operation. Keyless Cosign already does this: `sign-blob` without a key obtains a short-lived certificate from Fulcio bound to an OIDC identity and records the signature in Rekor, which returns an inclusion proof and a signed log timestamp.

What M9 adds to the format (as format 2, since the manifest members change):

1. **Record the Rekor inclusion proof in the bundle** (`rekor.json`: log index, tree size, inclusion proof, signed entry timestamp), exempt from extra-file detection by exact name like the other signature artifacts. This is the external anchor for 7.2.2 and 7.6.6.
2. **`verify-bundle --rekor`**: re-verify the inclusion proof against Rekor's published checkpoint, and compare the *root*, not the index (the standard's own 7.3.5 lesson).
3. **Recorded independent verification run** (8.1.5): a CI job on a second identity, or a stranger's recorded run, verifying a published bundle with no maintainer credentials.
4. **Adopt tagged digests** (`sha-256:<hex>`) per string, aligning 7.7.3 with the standard's claim set.

What it does *not* fix: 7.3.2. The operator still chooses to sign. A Tier 3 placement for CC-2 would rest on Sigstore's public-good instance (Vendor · Distributed) and would say so; CC-3 stays Tier 1 until the run itself is attested, which is out of mlassure's scope.

---

## 6. What mlassure could be *for* Proof-of-Control (milestone M8, not built)

The standard ships its 127 requirements as `checklist/poc-checklist.json` "for GRC tooling and automation." mlassure is that kind of tool: a control set with agent-pattern tags, deterministic checks where the answer is mechanical, an LLM loop only where judgment is required, an OSCAL Assessment Results document out. A Proof-of-Control control family for mlassure would take a system's evidence tokens and conformance statement as the target and answer the procurement binary as an OSCAL AR — with `deterministic` checks for 7.7.1 (validates against the published schema), 7.7.3 (every digest tagged), 7.7.5 (duplicate keys refused), 7.6.2 (`step_index` gapless); `attestation` for 7.3.2 (key custody is a named human's statement); `synthesis` for 10.2 (is the disclosure complete against the mechanism inventory). That requires mlassure's provider interface to stop being SageMaker-shaped, which is the design decision M8 is waiting on.

---

## 7. Comment-period notes

Observations made while doing this crosswalk, kept here so the maintainer can decide whether to file them (public comment open through 2026-10-30):

- **Version labelling.** The repository badge and launch say v1.0; the chapter folder is `0.1/en`, the reference form is `v0.1-C4.1.4`, and the roadmap targets "Version 1.0" for 2027-02-01. A conformance statement cannot cite "the exact version of this standard" (10.1.5) unambiguously until one label is chosen.
- **7.7.3 and the granularity of the algorithm identifier.** The requirement says "every digest and signature carries an explicit algorithm identifier." A document-level identifier that governs all digests in it (as mlassure's manifest does) satisfies the *verifier* half — rejection rather than assumption — while producing different bytes from the per-string `sha-256:` form the claim set uses. The requirement could say whether document-scoped identifiers conform.
- **7.6.2 and set-shaped evidence.** Sequence numbers detect omission in a *stream*. For a *set* committed to by a manifest that enumerates its members, omission is already detectable without sequence numbers. The auditor-evidence note could admit the enumerated-set case.
- **Assessor evidence is a distinct artifact class.** Assessment tools that read a system after the fact produce evidence that is neither Tier 1 operator assertion nor gateway-generated; C7.1.5 covers the claim discipline but the tiers have no natural cell for "the assessor's custody of its own run." Naming it would help GRC tooling place itself honestly.
