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

## Docker

> **Status: designed, statically verified, build/run NOT yet tested** — Docker wasn't installed on the machine that wrote this Dockerfile. Every claim below is a design intent, not a confirmed result. See `ISA.md` `## Verification` for the exact command sequence to run when Docker is available, and `TODO-m3e-docker-build-verify`.

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
- **Custody chain and evidence retention** — mlassure hashes evidence at ingestion and preserves it for the full run; the pattern for signing and retaining artifacts under immutable storage (OIDC-signed, transparency-logged) is implemented in the separate [cgep-capstone](https://github.com/joseruiz1571/cgep-capstone) evidence layer and can be integrated in M3.
- **Collection scope disclosure** — whether assessed outputs disclose the collectors' IAM scope and retrieval permissions is an M3 design decision.

**Implemented (M3a, 2026-07-19)**

- **Broader control coverage** — expanded from 5 to 8 controls (`SC-7`, `RA-3`, `CA-7` added), reusing existing collectors and patterns with zero code changes (`fixtures/controls/nist-subset.yaml`). `RA-3` demonstrates a second, structurally distinct insufficient-evidence mechanism: conditional on the target's actual evidence (model card present or absent), reached through LLM reasoning over a genuinely empty tool result, rather than SA-10's statically-empty `collectors: []`. Live end-to-end verification against both fixtures confirmed 2026-07-19 (see [Demo output](#demo-output) above, now showing all 8 controls) — `TODO-m3a-live-verify` closed.

**Implemented (M3b, 2026-07-19)**

- **LLM bypass for `attestation`** — `assessControl()` now checks `control.pattern === "attestation"` before any tool/LLM setup and returns a code-generated `insufficient-evidence` judgment directly (`src/agent/agent.ts`). Zero collector calls, zero LLM API calls, for every attestation-pattern control (SA-10 and any future ones) — the "attestation always means insufficient-evidence" guarantee is now a property of the code, not a prompt instruction the model could theoretically ignore. Proven with negative-assertion tests (mock LLM/provider throw if ever invoked), not just judgment-shape checks. `deterministic` bypass remains out of scope (see Partial, above).

**Implemented (M3c, 2026-07-19)**

- **Output-layer pattern/provenance awareness** — `ControlResult` (`src/runner/assessment-runner.ts`) now carries the control's `pattern`, threaded into all 3 output surfaces via two named predicates (`isCodeDetermined`, `usesAttestationCallout` — `src/types.ts`). `narrative.ts`'s confidence-line label reads "code-determined (\<pattern\> pattern)" instead of the previously-unconditional "model self-reported" for code-determined judgments; its attestation callout now fires only for true attestation-pattern controls, with a distinct, narrower callout for any other pattern reaching `insufficient-evidence` that does not overclaim what the code can't support. `oscal-ar.ts` gains an additive `pattern` prop so machine consumers can derive the same distinction. `cli/index.ts`'s label follows suit. Closes the exact gap M3a's and M3b's delegation reviews both independently found. Two rounds of delegation review on this fix itself caught and closed two further real issues before shipping: a stale "Gaps / Requires Human Attestation" heading that contradicted the new callout, and an overclaiming callout text narrowed to what the data actually supports — see `ISA.md` Decisions for the full trail.

**Implemented (M3d, 2026-07-19)**

- **LLM bypass for `deterministic`** — `assessControl()` now dispatches `pattern: deterministic` controls to a per-control-ID registry of real TypeScript check functions (`src/agent/deterministic-checks.ts`), not a rule DSL or eval'd expression — mirroring how collectors are already dispatched by name. `SC-28` (customer-managed KMS key check) and `SC-7` (network isolation + VPC + security group check) both ship real, live-verified implementations; both route through the same `EvidenceStore`/citation-guard discipline as the LLM path, so the citation invariant holds for code-determined judgments too. **Fail-loud by design, no silent fallback**: a `deterministic`-pattern control with no registered check aborts the entire run (`runAssessment()`'s preflight, listing every missing check at once) before any control — deterministic or not — is assessed, rather than silently falling back to the LLM and producing a report that misrepresents its own provenance. `isCodeDetermined` (`src/types.ts`) generalizes to cover both `attestation` and `deterministic` as a pure derived function over `pattern` — structurally incapable of diverging from what actually ran. Delegation review on this fix found and fixed 2 real gaps before shipping: deterministic-check judgments weren't running through the same `parseJudgment`/`validateCitations` guards the LLM path is forced through (now they do, via a shared `finalizeJudgment` helper), and unguarded type casts on evidence payloads could have silently turned a malformed/unexpected shape into a confidently-wrong `not-satisfied` verdict instead of an honest `insufficient-evidence` one (now type-guarded). Live-verified against both fixtures: identical verdicts to the prior LLM-driven run, now `code-determined` instead of `self-reported`, zero LLM calls.

**Implemented (M3e, 2026-07-19) — design + static verification complete, build/run DEFERRED-VERIFY**

- **Docker packaging** — multi-stage `Dockerfile` (`deps` → `runtime`, both pinned to the same `oven/bun:1.2-slim` tag), non-root (`bun` user, uid 1000, reused from the base image), `ANTHROPIC_API_KEY` injected only via `docker run -e` (never a build `ARG`, never baked in — confirmed via grep, and fixtures independently confirmed clean of any real key before being baked into the image). No Docker install existed on the machine that wrote this, so `docker build`/`docker run` are `[DEFERRED-VERIFY]` — see `ISA.md` `## Verification` for the exact command checklist (`TODO-m3e-docker-build-verify`). Several design claims WERE empirically confirmed without Docker, using the locally-installed Bun directly: `bun install --frozen-lockfile --production` correctly excludes dev dependencies (verified twice, independently), and the `ENTRYPOINT`/`CMD` argument-forwarding shape matches `docker run <image> assess ...`'s intended invocation. The base image's `bun` user/home assumptions were confirmed by reading `oven/bun`'s actual upstream Dockerfile source, not assumed. Delegation review found and fixed a real data-loss trap: `--oscal`/`--narrative` output paths passed without a matching `-v` volume mount write successfully inside the container, report success truthfully, then vanish silently when `--rm` destroys the container — now loudly documented in the Docker quick-start.

**Implemented (M3f, 2026-07-22)**

- **Tag provenance** — each control's pattern tag can now carry an authority record: an optional `tagProvenance` array of directional migration records (`pattern`, `assigned` date, required `rationale`, and `supersedes` naming the previous pattern). The loader validates seven invariants fail-loud — origin records carry no `supersedes`, every later record's `supersedes` must equal its predecessor's pattern (a deliberately redundant chain-integrity check), dates must be non-decreasing (same-day migrations are legal), and the history head must equal the control's live `pattern` field, so tag and history can never silently drift apart. Historical records are shape-checked only — a retired pattern name in an old record stays loadable forever; registry membership is enforced solely at the head. Both output surfaces disclose provenance additively: the narrative renders a per-control "Tag provenance" list (`tagged <pattern> (date)` for the origin, `<from> → <to> (date): rationale` for migrations) and OSCAL findings gain `pattern-assigned` and per-migration `pattern-migration` props — with zero new props when a control set records no provenance. **The fixture's provenance is real, and deliberately boring:** all 8 controls carry origin records only, with dates and SHAs reconstructed from this repo's actual git history (`9b00bbf` 2026-06-10, `cffefdc` 2026-07-19) — no tag in this repo has ever migrated, so no migration is recorded. A provenance feature that shipped with fabricated history would violate the same invariant the citation guard enforces for evidence; migration mechanics are pinned by synthetic-data tests instead (including the documented-legal `A → B → A` re-adoption chain).

**Designed**

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
| M3a: 5→8 controls, second insufficient-evidence mechanism | Shipped, live-verified (2026-07-19) |
| M3b: attestation-pattern LLM bypass | Shipped, unit-verified (2026-07-19) |
| M3c: output-layer pattern/provenance awareness | Shipped, unit-verified (2026-07-19) |
| M3d: deterministic-pattern LLM bypass (SC-28, SC-7) | Shipped, live-verified (2026-07-19) |
| M3e: Docker packaging | Designed + statically verified, build/run DEFERRED (2026-07-19) |
| M3f: tag provenance (directional migration records, authority-controlled) | Shipped, unit-verified (2026-07-22) |
| M3 (remaining): custody chain | Planned |
| M4: live AWS read-only provider | Planned |

---

## Tests

```bash
bun test              # 21 tests: unit + citation guard + loop invariants
bun test src/agent/agent.test.ts   # integration (requires ANTHROPIC_API_KEY in .env)
```

---

Part of a four-repo AI governance portfolio: [governance-card-stack](https://github.com/joseruiz1571/governance-card-stack) · [mltrack](https://github.com/joseruiz1571/mltrack) · [cgep-capstone](https://github.com/joseruiz1571/cgep-capstone)
