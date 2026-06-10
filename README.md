# mlassure

Agentic AI-control assurance. Point it at an ML model and a control set; it collects evidence from AWS, runs an LLM judgment loop only where judgment is actually required, and emits verdicts where every claimed evidence ID traces back to something actually retrieved this run.

**The citation invariant:** if a judgment cites evidence ID `X`, then `X` must exist in the evidence store for that run. The guard is fail-closed — a hallucinated ID throws `CitationError` before anything is returned.

---

## The problem it solves

Most LLM-based compliance tools let the model reason freely about whether controls are satisfied. That produces confident-sounding verdicts with no verifiable link to the evidence behind them. mlassure separates the concerns:

- **Deterministic collectors** fetch raw evidence from AWS (or fixtures) — no LLM involved
- **Agent pattern tags** on each control determine whether LLM judgment is needed at all (`synthesis`, `sufficiency`, `correlation`) or whether the answer is deterministic (`deterministic`) or requires human attestation (`attestation`)
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

## Control set

`fixtures/controls/nist-subset.yaml` maps five NIST SP 800-53 Rev 5 controls to SageMaker evidence collectors:

| Control | Title | Pattern |
|---------|-------|---------|
| SI-6(1) | Automated Detection of Inaccurate or Unusual Activity | synthesis |
| AC-6(9) | Log Use of Privileged Functions / Least Privilege | sufficiency |
| AU-12(3) | Changes by Authorized Individuals | correlation |
| SC-28 | Protection of Information at Rest | deterministic |
| SA-10 | Developer Configuration Management / Human Review | attestation |

---

## Status

| Milestone | Status |
|-----------|--------|
| M0: scaffold (types, control loader, fixture provider, evidence store) | Shipped v0.1.0 |
| M1: agent loop, citation guard, drift-monitoring end-to-end | Shipped v0.1.0 |
| M2: OSCAL Assessment Results writer + narrative renderer | Planned |
| M3: 5-8 controls, Docker, insufficient-evidence path | Planned |
| M4: live AWS read-only provider | Planned |

---

## Tests

```bash
bun test              # 21 tests: unit + citation guard + loop invariants
bun test src/agent/agent.test.ts   # integration (requires ANTHROPIC_API_KEY in .env)
```

---

Part of a four-repo AI governance portfolio: [governance-card-stack](https://github.com/joseruiz1571/governance-card-stack) · [mltrack](https://github.com/joseruiz1571/mltrack) · [cgep-capstone](https://github.com/joseruiz1571/cgep-capstone)
