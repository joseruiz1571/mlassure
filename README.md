# MLAssure

[![ci](https://github.com/joseruiz1571/mlassure/actions/workflows/ci.yml/badge.svg)](https://github.com/joseruiz1571/mlassure/actions/workflows/ci.yml) [![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)

Agentic AI-control assurance. mlassure assesses AI systems against NIST SP 800-53 with a citation invariant, so a verdict that cites evidence the run never retrieved fails the run.

Point it at an ML model and a control set; it collects evidence from AWS, runs an LLM judgment loop only where judgment is actually required, and emits verdicts where every claimed evidence ID traces back to something actually retrieved this run.

**The citation invariant:** if a judgment cites evidence ID `X`, then `X` must exist in the evidence store for that run. The guard is fail-closed — a hallucinated ID throws `CitationError` before anything is returned.

---

## The problem it solves

Most LLM-based compliance tools let the model reason freely about whether controls are satisfied. That produces confident-sounding verdicts with no verifiable link to the evidence behind them. MLAssure separates the concerns:

- **Deterministic collectors** fetch raw evidence from AWS (or fixtures) — no LLM involved
- **Agent pattern tags** on each control determine whether LLM judgment is needed at all (`synthesis`, `sufficiency`, `correlation`) or whether the answer is deterministic (`deterministic`) or requires human attestation (`attestation`) — or, distinctly, whether the evidence needed simply doesn't exist for this target at assessment time (`insufficient-evidence`, which any pattern can reach if its collectors come back empty)
- **Citation guard** rejects any judgment that cites evidence not retrieved in this run

The result: every verdict is either deterministic (code verified it) or agentic with a paper trail (the LLM cited the specific artifacts it used to reason).

---

## Quick start

```bash
git clone https://github.com/joseruiz1571/mlassure
cd mlassure
bun install

# Add your Anthropic API key
cp .env.example .env
# edit .env: ANTHROPIC_API_KEY=sk-ant-...
# optional:  MLASSURE_MODEL=claude-sonnet-4-6   (override the default model)
# optional:  ANTHROPIC_WORKSPACE_ID=wrkspc_...  (identity-linked / multi-workspace keys only)

# Run against fixtures — two models, opposite verdicts
bun run dev -- assess \
  --controls fixtures/controls/nist-subset.yaml \
  --target fixtures/targets/model-clean.json \
  --live

bun run dev -- assess \
  --controls fixtures/controls/nist-subset.yaml \
  --target fixtures/targets/model-stale.json \
  --live
```

**Requires:** [Bun](https://bun.sh) v1.0+, an Anthropic API key. The model is settable (`--model` or `MLASSURE_MODEL`; default `claude-sonnet-4-6`).

### Reproducibility flags (0.4.0)

```bash
bun run dev -- assess \
  --controls fixtures/controls/nist-subset.yaml \
  --target fixtures/targets/model-clean.json \
  --live \
  --report out/report.json \  # AssessmentReport JSON (same object as bundle report.json)
  --model claude-sonnet-4-6 \ # LLM alias for this run (default: MLASSURE_MODEL or claude-sonnet-4-6)
  --temperature 0 \           # [0, 1]; 0 is valid and not swallowed (default: 0.1)
  --repeat 3                  # run N times; output paths get a -rNN suffix when N > 1
```

Every report now records what produced it: the model alias requested, the dated snapshot ID Anthropic actually served, the configured temperature, per-run token usage, the replica index under `--repeat`, and each control's exact intent text as given to the agent. A verdict you can't reproduce is a verdict you can't defend; these fields are what a second run needs to be a fair comparison.

---

## Docker

> **Status: build/run verified live (2026-07-23, Docker 29.6.2).** The image runs non-root (`uid=1000(bun)`), bakes in no key material, and completed a full live agent-loop assessment in-container with outputs written host-owned through a volume mount. The container-produced OSCAL document validates against the official 1.1.2 schema. Verification transcript: [`ISA.md`](ISA.md) `## Verification`.

```bash
docker build -t mlassure .

# Zero-setup demo — fixtures are baked into the image
docker run --rm -e ANTHROPIC_API_KEY mlassure assess \
  --controls fixtures/controls/nist-subset.yaml \
  --target fixtures/targets/model-clean.json \
  --live
```

The `-e ANTHROPIC_API_KEY` form (no `=value`) inherits the variable from your host shell's environment rather than putting the key on the command line — it never lands in shell history.

Real target, with output written back to the host:

```bash
mkdir -p out
docker run --rm -e ANTHROPIC_API_KEY -v "$(pwd)/out:/out" mlassure assess \
  --controls /out/my-controls.yaml \
  --target /out/my-target.json \
  --live \
  --oscal /out/results.json \
  --narrative /out/report.md
```

If the mounted `out/` directory was created by a different host user/UID than the container expects, writes can silently fail with a permissions error. Fix with:

```bash
docker run --rm --user "$(id -u):$(id -g)" -e ANTHROPIC_API_KEY -v "$(pwd)/out:/out" mlassure assess ...
```

**⚠️ `--oscal`/`--narrative` paths must point INSIDE a mounted volume, or the output is silently destroyed.** `--rm` deletes the container's writable layer on exit — if you pass `--oscal /out/results.json` without `-v "$(pwd)/out:/out"`, the write succeeds *inside* the container, the CLI reports success truthfully, and the file vanishes the instant the container exits. No error, no warning, nothing on disk. Always pair `--oscal`/`--narrative` output paths with a matching `-v` mount to the same directory (silent-failure-hunter finding, M3e).

The image never bakes in `ANTHROPIC_API_KEY` — no build `ARG`, no `ENV` with a value — and runs as the base image's non-root `bun` user, never root.

---

## Custody chain

The bundle format is specified on its own in [`SPEC.md`](SPEC.md), with a machine-readable manifest schema (`fixtures/schemas/bundle-manifest.schema.json`) and conformance vectors in [`fixtures/bundles/`](fixtures/bundles/README.md): one positive bundle and nineteen single-fault negatives, each of which must be rejected *for its stated reason*. How the format lines up against LF Decentralized Trust's Proof-of-Control standard — Tier 2 for the custody claim, with a separate Tier 3 time-anchoring claim (CC-4) that is not Proof-of-Control — is in [`docs/proof-of-control.md`](docs/proof-of-control.md).

Every assessment run can emit a tamper-evident evidence bundle:

```bash
bun run dev -- assess \
  --controls fixtures/controls/nist-subset.yaml \
  --target fixtures/targets/model-clean.json \
  --oscal out/results.json --narrative out/report.md \
  --bundle out/bundle-$(date +%Y%m%dT%H%M%S)   # fresh dir per run — the writer refuses non-empty dirs

# Verify integrity + completeness anytime (exit 1 names every violation; authenticity is the cosign step below):
bun run dev -- verify-bundle out/bundle-<timestamp>

# Optional time anchor (claim CC-4 only — not Proof-of-Control, not a Tier 3 custody claim):
bun run dev -- verify-bundle out/bundle-<timestamp> --rekor
```

The bundle holds `report.json`, one `evidence/<uuid>.json` per retrieved evidence item (**full payloads, cited or not** — custody covers what the assessor saw), the run's OSCAL and narrative outputs, and `manifest.json`: per-file sha256 + byte size and a root hash over the whole set, written **last** so a crash mid-write leaves a loudly-unverifiable directory rather than a manifest describing files that never landed.

Sign the manifest with Cosign — the manifest covers the files, the signature covers the manifest:

```bash
# Local (key pair):
cosign sign-blob --key cosign.key --yes --bundle out/bundle-<ts>/manifest.sig.bundle out/bundle-<ts>/manifest.json
cosign verify-blob --key cosign.pub --bundle out/bundle-<ts>/manifest.sig.bundle out/bundle-<ts>/manifest.json

# CI (keyless, Sigstore OIDC — pin the issuer and identity, same pattern as cgep-capstone):
cosign sign-blob --yes --bundle manifest.sig.bundle manifest.json
cosign verify-blob --bundle manifest.sig.bundle \
  --certificate-identity-regexp "https://github.com/.*mlassure" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com" manifest.json
```

**Custody properties, each mapped to its mechanism:**

| Property | Mechanism |
|----------|-----------|
| Integrity | per-file sha256, recomputed from bytes on disk |
| Completeness | root hash + strict extra-file detection — unaccounted content fails, no junk-file allowlist (an allowlist is an attacker's hiding spot); only the named signature artifacts are exempt |
| Authenticity | Cosign signature over the manifest |
| Tamper-evidence | any single-byte change in any covered file fails verification and names the file |
| Time anchor (optional) | `rekor.json` checked by `verify-bundle --rekor` against the Rekor checkpoint root. Claim CC-4 only. |

**What none of this proves:** that the assessment methodology was sound. A signature authenticates *who* produced the bytes and that they are *unaltered* — it says nothing about whether the judgment inside them was right. Vendors routinely oversell hash-and-sign as an "audit trail"; it is a custody trail.

**⚠️ Security note:** the bundle contains **raw retrieved evidence at rest** — IAM role documents, CloudTrail events, endpoint configuration — cited or not. Treat a bundle with the same access controls as the AWS account it describes. Bundle output paths (`out/`, `bundles/`) and key material (`*.key`) are gitignored; never commit either.

---

## Assessing Proof-of-Control evidence

mlassure can assess a stream of [Proof-of-Control](https://github.com/LFDT-ProofOfControl/ov-poc-standard) evidence tokens the way it assesses a SageMaker model. The target file is a descriptor with `"family": "poc-evidence"` that points at a JSONL stream (one token per line) and, optionally, a trust-assumption disclosure; paths resolve relative to the descriptor and must name files inside its directory, symlinks followed. mlassure reads the stream's raw text and parses each record itself with a parser that refuses duplicate keys, so a token cannot reach the checks already resolved last-wins.

```bash
# Scaffold (no API key): loads the six controls and the target
bun run dev -- assess --controls fixtures/controls/poc-c7-subset.yaml --target fixtures/targets/poc-stream-clean.json

# Full run: the four deterministic controls and the attestation control make no LLM call;
# PoC-10.2 is an agent-loop judgment and needs ANTHROPIC_API_KEY
bun run dev -- assess --controls fixtures/controls/poc-c7-subset.yaml --target fixtures/targets/poc-stream-clean.json \
  --oscal out/poc-results.json --narrative out/poc-report.md --bundle out/poc-bundle-$(date +%Y%m%dT%H%M%S)
bun run dev -- verify-bundle out/poc-bundle-<timestamp>
```

| Control | Pattern | What mlassure checks in the evidence |
|---------|---------|--------------------------------------|
| `PoC-7.7.1` | deterministic | every record validates against the standard's own schema, pinned byte for byte at `fixtures/schemas/poc-evidence.schema.json` |
| `PoC-7.7.3` | deterministic | every claim recognised as a digest by key name, at any depth, carries a recognised algorithm tag at the width that tag implies, and `alg` is present; a stream with no such claim is `insufficient-evidence` |
| `PoC-7.7.5` | deterministic | no record contains a repeated object key |
| `PoC-7.6.2` | deterministic | per `agent_id`, `step_index` rises by exactly 1 from the first index the stream shows for that agent, and the report names the range seen |
| `PoC-7.3.2` | attestation | nothing: key custody is not visible in a token, so the verdict is always `insufficient-evidence` |
| `PoC-10.2` | synthesis | the disclosure covers every claim and mechanism, with categories from the draft set (LLM judgment) |

Most of these requirements are written about the deployment: *a parser rejects…*, *a verifier rejects…*, *published where a verifier can obtain it*. mlassure reads the evidence, so it assesses the evidence half and no more. Each control's `notAssessed` field quotes the requirement and names what was not assessed, and it is carried into the narrative ("Not assessed") and the OSCAL finding (`not-assessed` prop) next to the verdict. Signatures are not verified. Each verdict is printed with the property checked and the text of the standard it was judged against, and the report opens with one evidence-scope sentence saying the files were supplied by the operator and what was not assessed. A `satisfied` verdict here is a statement about the stream named in the control's intent; it is not a conformance claim for the system that produced the stream, and it is not a Proof-of-Control claim for anyone. [`fixtures/targets/poc-evidence/`](fixtures/targets/poc-evidence/README.md) holds a clean stream, eleven single-fault streams, one stream padded with blank lines and one sampled window, derived from the standard's published vectors, with the verdict each control must give on each; [`docs/proof-of-control.md`](docs/proof-of-control.md) §6 says the same in the crosswalk.

---

## Demo output

`fraud-detection-v2` — clean monitoring setup, all 8 controls:

```
  ✓ SI-6(1)      satisfied              conf:high    self-reported:high     evidence:5
  ✓ AC-6(9)      satisfied              conf:high    self-reported:high     evidence:1
  ✓ AU-12(3)     satisfied              conf:high    self-reported:high     evidence:3
  ✓ SC-28        satisfied              conf:high    code-determined:high   evidence:1
  ? SA-10        insufficient-evidence  conf:high    code-determined:high   evidence:0
  ✓ SC-7         satisfied              conf:high    code-determined:high   evidence:1
  ✓ RA-3         satisfied              conf:high    self-reported:high     evidence:1
  ✓ CA-7         satisfied              conf:high    self-reported:high     evidence:3
```

`churn-predictor-v1` — data capture disabled, no ModelQuality monitor, overly broad IAM, no model card, no VPC isolation:

```
  ✗ SI-6(1)      not-satisfied          conf:high    self-reported:high     evidence:3
  ✗ AC-6(9)      not-satisfied          conf:high    self-reported:high     evidence:1
  ~ AU-12(3)     partially-satisfied    conf:high    self-reported:high     evidence:3
  ✗ SC-28        not-satisfied          conf:high    code-determined:high   evidence:1
  ? SA-10        insufficient-evidence  conf:high    code-determined:high   evidence:0
  ✗ SC-7         not-satisfied          conf:high    code-determined:high   evidence:1
  ? RA-3         insufficient-evidence  conf:low     self-reported:high     evidence:0
  ✗ CA-7         not-satisfied          conf:high    self-reported:high     evidence:1
```

Three different confidence-provenance mechanisms now visible in one report: **SC-28/SC-7** (`deterministic` pattern) are `code-determined` by a real TypeScript check function, zero LLM calls, identical verdicts before and after the bypass (M3d, live-verified). **SA-10** (`attestation` pattern) is deliberately `insufficient-evidence` on both, also `code-determined` — no LLM call was made; machine-readable evidence cannot substitute for a named reviewer's sign-off, and the codebase guarantees this at the code level (M3b). **RA-3** (`synthesis` pattern) shows the *LLM-reasoned* insufficient-evidence shape: `satisfied` on the clean target (a real model card exists to synthesize), `insufficient-evidence` on the stale one (no model card was retrievable — `self-reported`, an LLM reasoned its way there from a genuinely empty tool result, not a static rule). Three mechanisms, three honest labels, none overclaiming what actually produced the verdict.

---

## Architecture

```
CLI (assess command)
  └── ControlSetLoader       — YAML/JSON control definitions with agent-pattern tags
  └── AssessmentRunner       — one EvidenceStore per control
        └── assessControl()  — Anthropic tool-use loop, MAX_ITERATIONS=10
              ├── ToolExecutor     — runs a collector by name on the EvidenceProvider
              ├── EvidenceStore    — SHA-256 content-addressed, duplicate-rejected
              └── CitationGuard    — fail-closed: every cited ID must exist in store
```

**Agent patterns:**
| Pattern | LLM involved? | Example control |
|---------|--------------|----------------|
| `synthesis` | Yes — multi-signal reasoning | SI-6(1) drift monitoring |
| `sufficiency` | Yes — threshold judgment | AC-6(9) least privilege |
| `correlation` | Yes — temporal ordering | AU-12(3) change control |
| `deterministic` | No | SC-28 encryption at rest |
| `attestation` | No — returns `insufficient-evidence` | SA-10 human review |

---

## Control set

`fixtures/controls/nist-subset.yaml` maps eight NIST SP 800-53 Rev 5 controls to SageMaker evidence collectors:

| Control | Title | Pattern |
|---------|-------|---------|
| SI-6(1) | Automated Detection of Inaccurate or Unusual Activity | synthesis |
| AC-6(9) | Log Use of Privileged Functions / Least Privilege | sufficiency |
| AU-12(3) | Changes by Authorized Individuals | correlation |
| SC-28 | Protection of Information at Rest | deterministic |
| SA-10 | Developer Configuration Management / Human Review | attestation |
| SC-7 | Boundary Protection (network isolation) | deterministic |
| RA-3 | Risk Assessment (model card synthesis) | synthesis |
| CA-7 | Continuous Monitoring (monitor health, not just presence) | sufficiency |

M3a added SC-7, RA-3, and CA-7 by reusing existing collectors and patterns — zero changes to the control loader, provider interface, or fixture provider. RA-3 is notable: unlike SA-10 (which never attempts collection), RA-3's `insufficient-evidence` outcome on the stale fixture is conditional — `getModelCard` genuinely returns nothing for that target, so the LLM reasons its way to insufficient-evidence rather than the pattern being statically wired that way.

---

## Status

Shipped through 0.5.0: citation guard, evidence store, agent loop, OSCAL Assessment Results, auditor narrative, eight NIST SP 800-53 controls, attestation and deterministic bypasses, Docker, tag provenance, and the custody chain (standalone spec, conformance vectors, Proof-of-Control crosswalk). M8a, M8b, and M8c are on `main` and unreleased. M9 (Rekor time anchor, claim CC-4) is implemented and unreleased. M4 (live AWS read-only provider) is post-1.0. Milestone write-up: [`IMPLEMENTATION.md`](IMPLEMENTATION.md).

| Milestone | Status |
|-----------|--------|
| M0: scaffold (types, control loader, fixture provider, evidence store) | Shipped v0.1.0 |
| M1: agent loop, citation guard, drift-monitoring end-to-end | Shipped v0.1.0 |
| M2: OSCAL Assessment Results writer, auditor narrative renderer, confidence-as-coverage | Shipped (M2a-c, 2026-06-24) |
| M3a: 5→8 controls, second insufficient-evidence mechanism | Shipped, live-verified (2026-07-19) |
| M3b: attestation-pattern LLM bypass | Shipped, unit-verified (2026-07-19) |
| M3c: output-layer pattern/provenance awareness | Shipped, unit-verified (2026-07-19) |
| M3d: deterministic-pattern LLM bypass (SC-28, SC-7) | Shipped, live-verified (2026-07-19) |
| M3e: Docker packaging | Shipped, live-verified (2026-07-23) |
| M3f: tag provenance (directional migration records, authority-controlled) | Shipped, unit-verified (2026-07-22) |
| M3g: custody chain (evidence bundle, verify-bundle, Cosign signing) | Shipped, live-verified (2026-07-22) |
| 0.4.0: reproducibility flags + run metadata (model/temperature/repeat, served-model + usage capture, control intent on reports) | Shipped, unit-verified (2026-08-30) |
| 0.5.0 / M5–M7: release hygiene, custody chain [`SPEC.md`](SPEC.md) + conformance vectors + strict-parse and algorithm-id checks, [Proof-of-Control crosswalk](docs/proof-of-control.md) | Shipped, unit-verified (2026-09-25) |
| M8a: generic `EvidenceProvider` (SageMaker becomes one family; behavior unchanged) | On `main` (PR #3), unreleased |
| M8b: Proof-of-Control control family (six controls over an evidence-token stream; see [Assessing Proof-of-Control evidence](#assessing-proof-of-control-evidence)) | On `main` (PR #4), unreleased; no live `PoC-10.2` run yet |
| M8c: red-team follow-ups (uncited conformance verdicts refused, scope on PoC reports, windowed sequences) | On `main` (PR #7), unreleased |
| M9: Rekor time anchor (`rekor.json`, `verify-bundle --rekor`, claim CC-4). Not a Tier 3 custody claim and not Proof-of-Control | Implemented, unit-verified against a recorded public-log entry (2026-10-06), unreleased |
| M4: live AWS read-only provider | Post-1.0 — deferred 2026-08-14: the demand story is OSCAL/ISO 42001-shaped, not AWS-shaped |

---

## Maintenance posture

Single maintainer, best-effort. Issues and pull requests are read; response time is not guaranteed.

---

## Tests

```bash
bun test              # unit + citation guard + loop invariants + provider config + custody conformance vectors
bun test src/agent/agent.test.ts   # integration (requires ANTHROPIC_API_KEY in .env)
```

---

## Evidence and assurance stack

- [Colophon](https://github.com/joseruiz1571/colophon) signs a session packet for AI agent tool use that a stranger can verify, with a control catalog whose every control names its falsifier.
- **mlassure** (this repo) assesses AI systems against NIST SP 800-53 with a citation invariant, so a verdict that cites evidence the run never retrieved fails the run.
- [mltrack](https://github.com/joseruiz1571/mltrack) keeps an AI model inventory mapped to NIST AI RMF, ISO 42001, and SR 11-7 behind a fail-closed CI gate.
- [Governance Card Stack](https://github.com/joseruiz1571/governance-card-stack) puts Model, System, and Agent Cards on one OSCAL spine so posture is data a pipeline can gate on.

[Controlled Vocabulary](https://controlledvocabulary.substack.com) is the Substack on AI governance through a library and information science lens.

Related prior work: [cgep-capstone](https://github.com/joseruiz1571/cgep-capstone), compliance-as-code. The Cosign commands in [Custody chain](#custody-chain) follow that repo's signing pattern.
