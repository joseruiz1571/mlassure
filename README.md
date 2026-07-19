# MLAssure

Agentic AI-control assurance. Point it at an ML model and a control set; it collects evidence from AWS, runs an LLM judgment loop only where judgment is actually required, and emits verdicts where every claimed evidence ID traces back to something actually retrieved this run.

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

**Requires:** [Bun](https://bun.sh) v1.0+, an Anthropic API key (Claude Sonnet 4).

---

## Demo output

`fraud-detection-v2` — clean monitoring setup:

```
  ✓ SI-6(1)      satisfied              conf:high    evidence:5
  ✓ AC-6(9)      satisfied              conf:high    evidence:1
  ✓ AU-12(3)     satisfied              conf:high    evidence:3
  ✓ SC-28        satisfied              conf:high    evidence:1
  ? SA-10        insufficient-evidence  conf:high    evidence:0
```

`churn-predictor-v1` — data capture disabled, no ModelQuality monitor, overly broad IAM:

```
  ✗ SI-6(1)      not-satisfied          conf:high    evidence:3
  ✗ AC-6(9)      not-satisfied          conf:high    evidence:1
  ~ AU-12(3)     partially-satisfied    conf:high    evidence:3
  ✗ SC-28        not-satisfied          conf:high    evidence:1
  ? SA-10        insufficient-evidence  conf:high    evidence:0
```

SA-10 (human attestation) is deliberately `insufficient-evidence` on both — machine-readable evidence cannot substitute for a named reviewer's sign-off. The system knows what it cannot determine.

---

## Architecture

```
CLI (assess command)
  └── ControlSetLoader       — YAML/JSON control definitions with agent-pattern tags
  └── AssessmentRunner       — one EvidenceStore per control
        └── assessControl()  — Anthropic tool-use loop, MAX_ITERATIONS=10
              ├── ToolExecutor     — maps tool names → AwsProvider methods
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

## Implementation ledger

*Which mechanisms described in the [essay series](#) are implemented, which are partial, and which are still design. Updated at each milestone.*

**Implemented**

- **Citation guard** — fail-closed: every ID in `evidenceCited` must trace to evidence retrieved this run; a phantom ID throws `CitationError` before any result is returned (`src/guard/citation-guard.ts`)
- **Evidence store** — SHA-256 content-addressed, one store per control per run, duplicate-rejected at ingest (`src/store/evidence-store.ts`)
- **Agent pattern taxonomy** — five patterns (`synthesis`, `sufficiency`, `correlation`, `deterministic`, `attestation`) defined in types and carried in the control YAML; each control is tagged before assessment runs (`src/types.ts`, `fixtures/controls/nist-subset.yaml`)
- **Attestation → insufficient-evidence** — attestation-tagged controls return `insufficient-evidence` with a gap description; the system knows what it cannot determine; enforced via system prompt and verified in integration tests
- **Tool-use loop** — Anthropic tool-use protocol, `MAX_ITERATIONS=10`, deterministic tool dispatch, citation validation at `submit_judgment` exit (`src/agent/agent.ts`)
- **Fixture provider** — two fixture models with opposing verdicts (clean vs. stale monitoring) fully implement the `AwsProvider` interface (`src/providers/fixture-provider.ts`)

- **OSCAL Assessment Results output** — fail-closed 5-value→binary projection (`satisfied` judgment only; all others map to `not-satisfied`); full 5-value precision preserved in `judgment-status` prop; loud remarks for `not-applicable` findings (`src/output/oscal-ar.ts`); CLI: `mlassure assess ... --oscal <path>`
- **Auditor narrative renderer** — Markdown prose from `AssessmentReport`; human-readable judgment summaries per control (`src/output/narrative.ts`)
- **Confidence as evidence coverage** — derivation of confidence scores from actual retrieved evidence counts rather than model self-report (`src/runner/assessment-runner.ts`; M2c)

**Partial**

- **Pattern differentiation in loop mechanics** — `synthesis`, `sufficiency`, and `correlation` currently differ only in how the control is framed to the model (`PATTERN_DESCRIPTIONS` in `src/agent/prompts.ts`); they share the same loop. Whether the categories warrant separate mechanics — or whether sufficiency and correlation collapse into synthesis — is an M3 design question.
- **LLM bypass for `deterministic`** — still runs the LLM loop, producing correct outputs via single-field prompting rather than a code-level check. `attestation` bypass shipped in M3b (below); `deterministic` bypass requires designing a schema for expressing rules in code rather than prose — a larger, still-undecided design target. Note for that future slice's author: `isCodeDetermined` (`src/types.ts`) currently returns `true` only for `attestation` — a naming trap, since `deterministic` sounds code-determined too; re-derive rather than assume when that bypass lands (M3c code-reviewer finding).
- **Custody chain and evidence retention** — mlassure hashes evidence at ingestion and preserves it for the full run; the pattern for signing and retaining artifacts under immutable storage (OIDC-signed, transparency-logged) is implemented in the separate [cgep-capstone](https://github.com/joseruiz1571/cgep-capstone) evidence layer and can be integrated in M3.
- **Collection scope disclosure** — whether assessed outputs disclose the collectors' IAM scope and retrieval permissions is an M3 design decision.

**Implemented (M3a, 2026-07-19)**

- **Broader control coverage** — expanded from 5 to 8 controls (`SC-7`, `RA-3`, `CA-7` added), reusing existing collectors and patterns with zero code changes (`fixtures/controls/nist-subset.yaml`). `RA-3` demonstrates a second, structurally distinct insufficient-evidence mechanism: conditional on the target's actual evidence (model card present or absent), reached through LLM reasoning over a genuinely empty tool result, rather than SA-10's statically-empty `collectors: []`. **Live end-to-end verification against both fixtures is `[DEFERRED-VERIFY]`** — no `ANTHROPIC_API_KEY` configured in this checkout; see mlassure `ISA.md` `## Verification` for the specific deferred criteria and follow-up.

**Implemented (M3b, 2026-07-19)**

- **LLM bypass for `attestation`** — `assessControl()` now checks `control.pattern === "attestation"` before any tool/LLM setup and returns a code-generated `insufficient-evidence` judgment directly (`src/agent/agent.ts`). Zero collector calls, zero LLM API calls, for every attestation-pattern control (SA-10 and any future ones) — the "attestation always means insufficient-evidence" guarantee is now a property of the code, not a prompt instruction the model could theoretically ignore. Proven with negative-assertion tests (mock LLM/provider throw if ever invoked), not just judgment-shape checks. `deterministic` bypass remains out of scope (see Partial, above).

**Implemented (M3c, 2026-07-19)**

- **Output-layer pattern/provenance awareness** — `ControlResult` (`src/runner/assessment-runner.ts`) now carries the control's `pattern`, threaded into all 3 output surfaces via two named predicates (`isCodeDetermined`, `usesAttestationCallout` — `src/types.ts`). `narrative.ts`'s confidence-line label reads "code-determined, attestation pattern" instead of the previously-unconditional "model self-reported" for attestation-bypass judgments; its attestation callout now fires only for true attestation-pattern controls, with a distinct, narrower callout for any other pattern reaching `insufficient-evidence` that does not overclaim what the code can't support. `oscal-ar.ts` gains an additive `pattern` prop so machine consumers can derive the same distinction. `cli/index.ts`'s label follows suit. Closes the exact gap M3a's and M3b's delegation reviews both independently found. Two rounds of delegation review on this fix itself caught and closed two further real issues before shipping: a stale "Gaps / Requires Human Attestation" heading that contradicted the new callout, and an overclaiming callout text narrowed to what the data actually supports — see `ISA.md` Decisions for the full trail.

**Designed**

- **Tag provenance** — tags are static in the current control YAML; versioning with directional migration records is a later M3 slice and the subject of Essay 4
- **Docker** — later M3 slice
- **Live AWS read-only provider** — M4

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

| Milestone | Status |
|-----------|--------|
| M0: scaffold (types, control loader, fixture provider, evidence store) | Shipped v0.1.0 |
| M1: agent loop, citation guard, drift-monitoring end-to-end | Shipped v0.1.0 |
| M2: OSCAL Assessment Results writer, auditor narrative renderer, confidence-as-coverage | Shipped (M2a-c, 2026-06-24) |
| M3a: 5→8 controls, second insufficient-evidence mechanism | Shipped, live verification DEFERRED (2026-07-19) |
| M3b: attestation-pattern LLM bypass | Shipped, unit-verified (2026-07-19) |
| M3c: output-layer pattern/provenance awareness | Shipped, unit-verified (2026-07-19) |
| M3 (remaining): Docker, deterministic bypass, custody chain, tag provenance | Planned |
| M4: live AWS read-only provider | Planned |

---

## Tests

```bash
bun test              # 21 tests: unit + citation guard + loop invariants
bun test src/agent/agent.test.ts   # integration (requires ANTHROPIC_API_KEY in .env)
```

---

Part of a four-repo AI governance portfolio: [governance-card-stack](https://github.com/joseruiz1571/governance-card-stack) · [mltrack](https://github.com/joseruiz1571/mltrack) · [cgep-capstone](https://github.com/joseruiz1571/cgep-capstone)
