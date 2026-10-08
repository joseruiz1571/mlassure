# mlassure and Proof-of-Control: a requirement-level crosswalk

**Standard:** LF Decentralized Trust / Advanced AI Society, *Proof-of-Control* — launched 2026-09-23 (event); analysed against repository `LFDT-ProofOfControl/ov-poc-standard` at commit `22c7b62` (2026-09-18), whose header reads "Working Draft v0.1.4", chapters under `0.1/en/`, 127 requirements; public comment open through 2026-10-30. Requirement IDs below use the repository's `C7.7.3` form.
**Subject:** the mlassure custody bundle, format 1, as specified in [`SPEC.md`](../SPEC.md). The grades below were taken against mlassure 0.5.0 on 2026-09-25. The 2026-10-06 update records what M9 shipped: claim CC-4 and `verify-bundle --rekor`. Format version is still `"1"`.
**Date of this analysis:** 2026-09-25, updated 2026-10-08 after adversarial review of PR #9. **Stage:** Self-Declared (C10.1.1). **Author:** the maintainer; review corrections recorded below.

> **The one-line result.** mlassure's custody bundle is **Tier 2 (Attestation)** evidence under C8: it is hash-committed and, when the operator signs the manifest, signed; anyone can re-verify the bytes, but a single party — the operator who ran the assessment and holds the signing key — must be trusted for the evidence to mean anything. It is not Proof-of-Control. M9 adds CC-4 (§5): inclusion under a configured log key and a log-asserted timestamp. Its Tier 3 prerequisites are **not established**: independent monitors and consistency with later log heads are not verified. CC-2 does not move.

---

## 1. What is being graded, and what is not

Proof-of-Control grades **evidence of what an agent did** at an action boundary. mlassure is not that agent's gateway. mlassure is an *assessor*: a batch tool that reads evidence about a target ML deployment, runs an LLM judgment loop where judgment is required, and writes a report. The custody bundle is evidence of **the assessment run** — which bytes the assessor retrieved and produced, and that they have not changed since.

So the crosswalk has a narrow, stated scope (C10.1.6):

| In scope | Out of scope, with reason |
| --- | --- |
| The bundle writer and verifier (`src/output/bundle.ts`), the format (`SPEC.md`), the Cosign signing step, the conformance vectors | **The target system's runtime.** mlassure never intercepts the target's actions; it reads configuration and logs after the fact. No C1–C6 domain claim is made for the target. |
| The claim: *"these bytes are what the signer produced, and they are unaltered since."* | **The judgments inside `report.json`.** Whether a verdict is *right* is exactly the thing custody cannot prove (C7.5, and mlassure's own README). |
| | **mlassure's own agent loop as a governed agent.** Its tool calls are intercepted in-process (`ToolExecutor` → `EvidenceStore` → `CitationGuard`), not by a separate-process gateway. That is a Tier 1 mechanism by C7.1.1 and is graded as such in §3. |

**Domains claimed (C10.1.2): none.** The phrase "Proof-of-Control" appears in mlassure's materials only as analysis, cross-reference, or explicit non-claim — this document, `SPEC.md` §1 and §9, the README, the CHANGELOG, and source comments that cite a requirement ID — never as a conformance or marketing claim (C8.1.4). No documented claims review exists (C7.5.2); see the 8.1.4 row.

**A note on method.** C7 says its requirements "apply to every claim made in the domain chapters C1–C6." With no domain claim, this crosswalk applies C7 *by analogy* to a custody claim about an assessment artifact. That is a deliberate stretch, stated here so nobody reads the grades as the standard's own.

---

## 2. The custody claim, graded

### 2.1 Claim register (C8.1.1–C8.1.3)

| # | Claim | Evidence stream | Mechanism | Parties that must be trusted | Tier |
| --- | --- | --- | --- | --- | --- |
| CC-1 | The files in a bundle are byte-identical to what the writer produced. (`createdAt` is still an assertion. The anchored time, when there is one, is CC-4's log time, not `createdAt`.) | `manifest.json` | per-file SHA-256; root hash over metadata + sorted (path, digest) pairs; strict completeness check | SHA-256 (mathematical); the verifier implementation | **2** — verifiable by anyone, but *which* bytes were produced is asserted by the operator (CC-2) |
| CC-2 | The manifest was produced by a named signer and not altered since. | `manifest.sig.bundle` | Cosign `sign-blob` over `manifest.json` | key-pair mode: the operator's key custody. Keyless mode: the OIDC identity provider, Fulcio CA, Rekor transparency log | **2** — a single party (the operator as signer) is trusted; C8.1.3 caps this at Tier 2 |
| CC-3 | The bundle contains *every* evidence item the assessor retrieved, cited or not. | `evidence/*.json`, `report.json` | writer bundles all `retrievedEvidence`; manifest completeness | the writer implementation; the operator not to have run a modified writer | **1** — the operator's word that the binary was unmodified, unless the run is itself attested |
| CC-4 | A manifest signed by key fingerprint I is included in the tree committed to by the configured log key, which attests entry time T. Made only when `verify-bundle --rekor` succeeds. | `rekor.json` | RFC 6962 inclusion proof against a signed checkpoint; signed entry timestamp binds the body, time and log metadata; artifact signature verifies over manifest bytes | SHA-256 and signature security; verifier/runtime; independent log-key provenance; log operator's key custody, clock and honesty | **2 — Attestation, on the evidence checked here.** Tier 3 is unestablished without independent-monitor and consistency evidence. A custom key establishes only a statement under that key. |

C8.1.2's single-trusted-party rule caps CC-1 and CC-2 at Tier 2. It also constrains the timestamp component of CC-4, which trusts the log operator. A public-log inclusion proof alone does not demonstrate the independent monitoring and append-only history in the C8 Tier 3 example. Nothing here is Proof-of-Control (C8.1.4), and CC-4 does not lift CC-1, CC-2 or CC-3.

### 2.2 Trust-assumption disclosure (C7.4.1, C10.2.1, C10.2.2)

Categories from the C10.2.2 draft set: Hardware · Mathematical · Ceremony · Vendor · Implementation · Distributed.

| Assumption | Subject | Category | Applies to |
| --- | --- | --- | --- |
| SHA-256 is second-preimage- and collision-resistant | SHA-256 | Mathematical | CC-1, CC-2, CC-4 |
| The signature scheme is sound | Cosign/operator artifact-signing scheme; ECDSA P-256 for the configured Rekor log key | Mathematical | CC-2, CC-4 |
| The signing key is held only by the operator (key-pair mode) | operator's key custody | Implementation | CC-2 |
| The OIDC provider honestly attests the signer's identity (keyless mode) | e.g. GitHub Actions OIDC, Google | Vendor | CC-2 |
| Fulcio issues certificates only to authenticated identities; Rekor is append-only and independently monitored (keyless mode) | Sigstore public-good instance | Vendor · Distributed | CC-2 |
| The verifier and runtime faithfully implement the documented checks and the verifier's binary is trusted | sigstore/cosign, this repository, Bun/Node and crypto implementation | Implementation | CC-1, CC-2, CC-4 |
| The configured log key is authentic and obtained independently of the bundle; the embedded key matches the reviewed fixture fetched 2026-10-06, or the verifier independently authorizes a custom key | log-key provenance and rotation policy | Ceremony · Implementation | CC-4 |
| The log operator protects its key, signs honestly and reports an accurate clock time; no independent timestamp authority is checked | Rekor public-good instance, or the selected custom log | Vendor | CC-4 |
| A globally append-only log history and independent monitoring would require additional evidence; neither is established by a single checkpoint inclusion proof | log operator and independent monitors | Vendor · Distributed (unverified) | Any proposed Tier 3 extension of CC-4 |
| The hashedrekord identity is only a signing-key fingerprint. Binding it to an authorized actor requires separate trust policy; certificates and OIDC subjects are not verified | the key that signed the manifest bytes | Implementation | CC-4 |
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
| 7.2.2 | 3 | partial | `rekor.json` plus `verify-bundle --rekor` re-checks an inclusion proof, the checkpoint signature, and the signed entry timestamp (`SPEC.md` §6.1). One manifest — the format-1 positive conformance vector — was entered in the public Rekor log on 2026-10-06 (`fixtures/rekor/`). The writer does not submit to Rekor itself, the recorded identity is a signing public key rather than an OIDC subject, and a later log head is not checked (no consistency proof). |
| 7.2.3, 7.2.4 | 3 | n/a | No hardware attestation is used or claimed. |

### C7.3 Tamper-evident

| Req | L | Status | mlassure |
| --- | --- | --- | --- |
| 7.3.1 | 2 | partial | The manifest is a flat hash commitment over a *set*: modifying, adding, or removing any file invalidates the root hash or trips completeness. Reordering is meaningless for a set. Verification is on demand (`verify-bundle`), not on a defined schedule with recorded results. |
| 7.3.2 | 3 | not met | The signing key is the operator's (key pair) or the operator's OIDC identity (keyless). Operator and mechanism are the same party. This is the requirement that fixes CC-2 at Tier 2. |
| 7.3.3 | 3 | not met | No equivocation resistance. Rekor (keyless) gives a single public log, which is the partial path. |
| 7.3.4 | 3 | partial | A verifier can check one evidence file with only `manifest.json` and that file — but the manifest lists every (path, digest) pair, so the "proof" is O(n) in bundle size, not a logarithmic inclusion proof. |
| 7.3.5 | 3 | **not met for CC-4**; n/a for the standalone bundle | Each bundle is an independent commitment. CC-4 adds a log checkpoint, but checks inclusion at that root only. There is no consistency proof to a later head, witness comparison or split-view detection. Rejecting a mismatched root does not establish append-only history. |

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
| 7.6.6 | 3 | partial | The manifest hash can be anchored in Rekor and re-checked against the checkpoint root. See 7.2.2. The anchor is opt-in (`--rekor`) and is not produced by `assess --bundle`. |

### C7.7 Interoperable

| Req | L | Status | mlassure |
| --- | --- | --- | --- |
| 7.7.1 | 2 | **met** | `SPEC.md` §4 documents every field; `fixtures/schemas/bundle-manifest.schema.json` is the machine-readable schema; the writer's own output is validated against it in the test suite. |
| 7.7.2 | 2 | partial | Exactly which bytes each digest covers is stated (`SPEC.md` §4.1: per-file digests over bytes on disk; the root hash over a fully specified compact array encoding with a stated sort order; the signature over the manifest bytes as written). The manifest *document* itself has no canonical serialization — two conforming writers would produce the same `rootHash` but not the same manifest bytes. Absent-field semantics do not arise (no optional members). |
| 7.7.3 | 2 | **met** (0.5.0) | The manifest carries a mandatory `algorithm` identifier that governs every digest in it; a verifier that meets a manifest without one, or with one it does not implement, refuses rather than assumes (check V-5). The per-string `sha-256:<hex>` form was not adopted in M9. It would change every digest and the root-hash preimage (format 2). Format 1 still uses the document-level identifier. |
| 7.7.4 | 3 | **met** (0.5.0) | `fixtures/bundles/` holds positive and negative vectors; each negative carries the single check it exercises and its expected error pattern; the suite fails a negative that is rejected for any other reason (`SPEC.md` §7). |
| 7.7.5 | 2 | **met** (0.5.0) | `verify-bundle` parses `manifest.json` and `report.json` with a strict parser that rejects duplicate keys at any depth, naming the key and path (check V-2). `JSON.parse`'s last-wins behaviour was the prior state. |

### C8.1 Tier placement

| Req | L | Status | mlassure |
| --- | --- | --- | --- |
| 8.1.1–8.1.3 | 1 | **met** | §2.1: four bounded claims with trust analysis. CC-1 and CC-2 remain Tier 2; CC-4 is at most Tier 2 on checked evidence, with Tier 3 prerequisites unestablished. |
| 8.1.4 | 1 | partial | The phrase appears only as analysis, cross-reference, or explicit non-claim (§1); but 8.1.4 also asks for a *documented claims review* confirming that, and none exists (single maintainer; see 7.5.2). |
| 8.1.5 | 3 | partial | CI re-verifies the recorded public-log inclusion without credentials (`src/output/rekor.test.ts`, `fixtures/rekor/`). A documented independent verification remains separate evidence; fresh signing or keyless operation is not required to re-verify this recorded entry. |
| 8.1.6 | 1 | partial | Independent monitors of the public-good instance are not established. This leaves Tier 3 unsubstantiated; it is not merely a reason to withhold Tier 4. No operational gating is implemented. |
| 8.1.7 | 3 | partial | Keyless mode rests on a vendor-rooted service (Sigstore). CC-4 is the composition with Rekor's public log, and the vendor assumption is on the disclosure. The shipped check is hashedrekord (a public key), not the Fulcio/OIDC path. |
| 8.1.8 | 3 | partial | `verify-bundle --rekor` is public, versioned, Apache-2.0, and credential-free, and the recorded entry can be re-checked from a clone. A release bundle produced by `assess --bundle` does not yet carry an anchor of its own. |

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

## 5. Log-signed inclusion and time (milestone M9, claim CC-4)

C8's Tier 3 example requires a public append-only log with independent monitors. M9 checks one recorded inclusion against one signed checkpoint. It does not establish the monitoring or append-only-history prerequisites. The prior Tier 3 placement of CC-4 was unsupported and is withdrawn. This correction narrows the assurance claim; it does not add consistency verification or promote CC-2.

What shipped, in format 1 (the manifest members did not change; `rekor.json` is a post-manifest file, exempt by exact name, the way the signature artifacts are):

1. **`rekor.json`** records the log index, the proof's tree index, the tree size, the inclusion proof, the signed entry timestamp, and the checkpoint. `SPEC.md` §6.1.
2. **`verify-bundle --rekor`** recomputes the RFC 6962 root and compares it to the checkpoint root. The log index is an input, not the verdict (the 7.3.5 lesson: two trees can share an index). A later, larger log head is rejected; consistency proofs are not implemented. The checkpoint signature and the signed entry timestamp are both checked under the log key.
3. **A recorded public-log entry** for the format-1 positive vector's manifest hash, made once on 2026-10-06 and re-verified in CI with no credential (`fixtures/rekor/`). The identity on that entry is the signing public key (`spki-sha256:…`), not an OIDC subject. Keyless Fulcio signing is not what was logged.
4. **Tagged digests were not adopted.** `sha-256:<hex>` on every digest string would change the manifest and the root-hash preimage. That is format 2, and it was left for a later change that can carry vectors and a SPEC update together.

CC-2 — *who* produced the manifest — stays **Tier 2** under the current C8 text: in keyless mode identity depends on Fulcio and an OIDC provider. This document does not pre-empt the working group's proposed reformulation in Appendix D issue 6. M9 also leaves 7.3.2 open (the operator still chooses to sign), and CC-3 stays Tier 1 until the run itself is attested. CI's offline re-verification is reproducible evidence of the implementation's behavior, not a live Rekor/Cosign operation or a custody attestation.

The Merkle leaf commits to the entry body, not `integratedTime`. A log operator can re-sign the same body with a different time, or sign two coherent forked checkpoints; the local verifier accepts each valid statement under that key. Regression tests demonstrate both limitations explicitly. A public-key fingerprint does not identify a person or show continuous key custody. The unsigned checkpoint label never authenticates a log service: the CLI reports the verified key fingerprint and whether trust was vendored or supplied by the caller.

The success line of `verify-bundle --rekor` states CC-4 and states that the result is not Proof-of-Control and not a Tier 3 custody claim.

---

## 6. mlassure as an assessor of Proof-of-Control evidence (milestone M8b)

Sections 1–5 grade mlassure's *own* custody bundle. This section is about a different subject: mlassure reading *another system's* Proof-of-Control evidence. Nothing in it changes the grades above.

The standard ships its 127 requirements as `checklist/poc-checklist.json` "for GRC tooling and automation." mlassure is that kind of tool, and M8b adds a control family for it: `fixtures/controls/poc-c7-subset.yaml`, run against a target of family `poc-evidence` — a JSONL stream of evidence tokens plus an optional trust-assumption disclosure. The OSCAL AR it writes carries one finding per control.

**What it assesses, and what it does not.** Four of the six requirements are written about the deployment: 7.7.1 asks that the schema be "published where a verifier can obtain it" and that "the deployed implementation's own output" validate; 7.7.3 asks that "a verifier presented with an unidentified digest rejects it"; 7.7.5 that "a parser rejects duplicate object keys." mlassure holds the evidence, not the deployment, so each control's `intent` states the property of the evidence that is checked, and its `notAssessed` field quotes the requirement and names the rest as not assessed; both the narrative and the OSCAL finding carry it.

| Control | Pattern | Assessed from the evidence | Not assessed |
| --- | --- | --- | --- |
| 7.7.1 | deterministic | every record validates against the standard's own schema (pinned at commit `22c7b62`) | whether the deployment publishes a schema, whether it covers every field, whether the stream is the deployment's own output; `format` annotations; the C7.7.2 rule forbidding floating point (a float that converts exactly is judged by the schema alone) |
| 7.7.3 | deterministic | every claim recognised as a digest by key name, at any depth, carries a recognised tag at the width it implies; `alg` present | whether the deployment's verifier rejects an untagged digest; a digest under another name; signatures (none are verified) |
| 7.7.5 | deterministic | no record contains a repeated key, read from raw text by a parser that refuses duplicates | whether the deployment's parser refuses them |
| 7.6.2 | deterministic | per `agent_id`, `step_index` rises by exactly 1 in stream order from the first index the stream shows (a sampled window, as the auditor evidence has it); the range seen is named | a record removed before the start or after the end of a sequence; `chain_head` replay; continuity across streams |
| 7.3.2 | attestation | nothing — key custody is not visible in a token; always `insufficient-evidence` | all of it |
| 10.2 (10.2.1, 10.2.2) | synthesis | whether the disclosure covers each claim and mechanism, with categories from the draft set — an LLM judgment | whether the claim register is complete; whether assumptions hold; the disclosure format the WG has not yet defined |

A record with a duplicate key has no single reading, so 7.7.1, 7.7.3 and 7.6.2 return `insufficient-evidence` for it and 7.7.5 reports the fault. Numbers are judged by the form written in the record: 7.6.2 reads `step_index` only as plain decimal digits, and 7.7.1 returns `insufficient-evidence` for a record holding a number that does not convert to a double exactly, so neither judges a value the record does not hold. 7.7.3 returns `insufficient-evidence` when it found no digest to check. The fixtures in `fixtures/targets/poc-evidence/` are derived from the standard's published vectors, unsigned, one fault per negative stream, plus a sampled window starting at step 5; their README states the verdict each control must give on each stream and the test suite asserts it.

A `satisfied` finding from this family says that the stream has the property the control's intent names. Each report says so itself: the narrative prints the checked property and the framework under each verdict and opens with an evidence-scope sentence, and every OSCAL finding for these controls carries the not-assessed text in `remarks`, satisfied findings included. It does not say the assessed system conforms to Proof-of-Control, at any Tier, and it says nothing about mlassure's own tier placement in §2.1.

---

## 7. Comment-period notes

Observations made while doing this crosswalk, kept here so the maintainer can decide whether to file them (public comment open through 2026-10-30):

- **Version labelling.** The repository badge and launch say v1.0; the chapter header (`0x00-Header.yaml`) says "Working Draft v0.1.4"; the chapter folder is `0.1/en`; the reference form is `v0.1-C4.1.4`; and the roadmap targets "Version 1.0" for 2027-02-01. Four labels for one text. A conformance statement cannot cite "the exact version of this standard" (10.1.5) unambiguously until one label is chosen.
- **7.7.3 and the granularity of the algorithm identifier.** The requirement says "every digest and signature carries an explicit algorithm identifier." A document-level identifier that governs all digests in it (as mlassure's manifest does) satisfies the *verifier* half — rejection rather than assumption — while producing different bytes from the per-string `sha-256:` form the claim set uses. The requirement could say whether document-scoped identifiers conform.
- **7.6.2 and set-shaped evidence.** 7.6.2 already allows "(or equivalent chaining)". For a *set* committed to by a manifest that enumerates its members with digests, omission is detectable from the enumeration alone. Asking that manifest enumeration be named as an equivalent in the auditor-evidence note would make the allowance usable.
- **Assessor evidence — a worked instance for Appendix D issue 6.** Issue 6 already names "AI-powered validation tools that analyze, score, and verify code or data quality before deployment" as a case the binary threshold must address. This document is one worked instance of that case: an after-the-fact assessor's custody of its own run, placed at Tier 2 with a Tier 3 time-anchoring path. Offered as data for the issue, not as a new issue.
