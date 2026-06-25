---
task: mlassure M2a commit + M2b narrative renderer
slug: mlassure-m2b
effort: E3
phase: observe
progress: 0/41
mode: algorithm
started: 2026-06-10T00:00:00Z
updated: 2026-06-25T00:00:00Z
project: mlassure
---

## Problem

mlassure has no code. The spec is complete and approved. M0 must deliver the project skeleton that all subsequent milestones (M1 agent loop, M2 OSCAL output, M3 breadth) build on: a working TypeScript CLI, core types, a control-set loader, a fixture-backed AwsProvider, and a content-addressable evidence store. Without M0, M1 cannot start.

## Vision

Running `mlassure assess --controls fixtures/controls/nist-subset.yaml --target fixtures/targets/model-clean.json` exits 0 and prints a summary of loaded controls and target — no agent loop yet, but every structural piece the agent will depend on is in place, typed, and tested. The evidence store hashes payloads; the fixture provider returns real evidence items with valid sha256s; the control loader validates agent-pattern tags. A second developer reading the source would immediately understand the architecture.

## Out of Scope

- The agent / LLM loop (M1)
- OSCAL Assessment Results writer (M2)
- Narrative renderer (M2)
- Live AWS SDK provider (M4)
- Citation guard (M1)
- Docker packaging (M3)
- Any write to AWS resources (permanently out of scope)

## Principles

- Every factual claim in a judgment must cite retrieved evidence — the citation invariant is architecturally present in types even at M0, before the guard is enforced in M1.
- The agent loop is the only place the LLM belongs; collectors and the store are deterministic and must stay that way.
- Fixtures are the default demo path; live AWS is opt-in and out of scope for M0.
- bun/bunx always; no npm/npx.
- TypeScript strict mode throughout.

## Constraints

- TypeScript / Node 20+ compatible (bun runtime)
- CLI interface: `mlassure assess --controls <yaml|json> --target <json>`
- Evidence items are content-addressable: sha256 is computed from payload, not supplied externally
- AwsProvider is an interface, not a class — fixture and live are separate implementations
- No hardcoded paths; fixtures loaded via CLI `--target` flag or absolute path resolution

## Goal

Deliver a working TypeScript project at `~/Desktop/GitHub/mlassure/` with a passing type check, a runnable CLI that loads controls and a fixture target, a content-addressable evidence store, and two fixture target files — one clean model and one with monitoring failures — such that M1 can add the agent loop without touching M0 infrastructure.

## Criteria

- [x] ISC-1: `bun install` exits 0 in `~/Desktop/GitHub/mlassure/`
- [x] ISC-2: `bun run typecheck` exits 0 with zero type errors
- [x] ISC-3: File `src/cli/index.ts` exists and exports a CLI entrypoint
- [x] ISC-4: `bun run dev -- --help` prints usage text including "assess" and exits 0
- [x] ISC-5: `bun run dev -- assess --controls fixtures/controls/nist-subset.yaml --target fixtures/targets/model-clean.json` exits 0
- [x] ISC-6: `bun run dev -- assess --controls fixtures/controls/nist-subset.yaml --target fixtures/targets/model-stale.json` exits 0
- [x] ISC-7: `src/types.ts` exports `Evidence` type with fields id, source, retrievedAt, sha256, payload
- [x] ISC-8: `src/types.ts` exports `Judgment` type with status enum covering all five values from spec
- [x] ISC-9: `src/types.ts` exports `AgentPattern` union covering synthesis|sufficiency|correlation|deterministic|attestation
- [x] ISC-10: `src/types.ts` exports `ControlItem` and `ControlSet` types
- [x] ISC-11: Control loader reads YAML file and returns typed `ControlSet`
- [x] ISC-12: Control loader reads JSON file and returns typed `ControlSet`
- [x] ISC-13: Control loader throws a typed error when `pattern` field is not a valid AgentPattern
- [x] ISC-14: `src/providers/aws-provider.interface.ts` declares `AwsProvider` interface with all 9 collector methods from spec
- [x] ISC-15: `src/providers/fixture-provider.ts` implements `AwsProvider`
- [x] ISC-16: FixtureProvider loads `model-clean.json` and returns Evidence items for all 9 collector calls
- [x] ISC-17: FixtureProvider loads `model-stale.json` and returns Evidence items reflecting missing/disabled monitoring
- [x] ISC-18: Each Evidence item returned by FixtureProvider has a sha256 field that is a valid 64-char hex string
- [x] ISC-19: Evidence store `add()` stores an Evidence item keyed by its id
- [x] ISC-20: Evidence store `has()` returns true for a stored evidence id
- [x] ISC-21: Evidence store `has()` returns false for an unknown evidence id
- [x] ISC-22: Evidence store `bundle()` returns all stored Evidence items as an array
- [x] ISC-23: Evidence store `add()` computes sha256 from `payload` using Node crypto (not supplied externally)
- [x] ISC-24: Evidence store rejects a duplicate id (throws or returns false — consistent behavior)
- [x] ISC-25: `fixtures/targets/model-clean.json` exists with modelName, registry (Approved status), endpoint (dataCaptureEnabled: true), monitors with ModelQuality schedule, kms keys, network isolation, and executionRole
- [x] ISC-26: `fixtures/targets/model-stale.json` exists with dataCaptureEnabled: false, no ModelQuality monitor, and overly broad IAM role
- [x] ISC-27: `fixtures/controls/nist-subset.yaml` exists with ≥5 controls
- [x] ISC-28: Each control in nist-subset.yaml has id, framework, pattern, intent, collectors fields
- [x] ISC-29: nist-subset.yaml contains at least one control with pattern: "attestation"
- [x] ISC-30: nist-subset.yaml contains at least one control with pattern: "synthesis"
- [x] ISC-31: `.gitignore` covers node_modules, dist, .env, *.local
- [x] ISC-32: `package.json` has scripts: build, typecheck, test, dev
- [x] ISC-33: Anti: CLI does not import or reference AWS SDK in M0 (no live credential risk)

## Test Strategy

| isc | type | check | threshold | tool |
|-----|------|-------|-----------|------|
| ISC-1 | command | `bun install` exit code | 0 | Bash |
| ISC-2 | command | `bun run typecheck` exit code | 0 | Bash |
| ISC-3 | file | Read src/cli/index.ts | exists | Read |
| ISC-4 | command | `bun run dev -- --help` stdout | contains "assess" | Bash |
| ISC-5 | command | `bun run dev -- assess ...clean` exit code | 0 | Bash |
| ISC-6 | command | `bun run dev -- assess ...stale` exit code | 0 | Bash |
| ISC-7 | grep | Evidence in src/types.ts | sha256 field present | Grep |
| ISC-8 | grep | Judgment status union in types.ts | all 5 values | Grep |
| ISC-9 | grep | AgentPattern union in types.ts | 5 values | Grep |
| ISC-10 | grep | ControlItem and ControlSet in types.ts | both present | Grep |
| ISC-11 | command | control loader test YAML | returns ControlSet | Bash test |
| ISC-12 | command | control loader test JSON | returns ControlSet | Bash test |
| ISC-13 | command | control loader invalid pattern | throws | Bash test |
| ISC-14 | grep | 9 method signatures in aws-provider.interface.ts | all present | Grep |
| ISC-15 | grep | implements AwsProvider in fixture-provider.ts | present | Grep |
| ISC-16 | command | fixture provider clean fixture | 9 non-null returns | Bash test |
| ISC-17 | command | fixture provider stale fixture | dataCaptureEnabled false | Bash test |
| ISC-18 | command | sha256 field in evidence items | 64-char hex | Bash test |
| ISC-19–24 | command | `bun test` evidence-store tests | all pass | Bash |
| ISC-25 | file | Read fixtures/targets/model-clean.json | dataCaptureEnabled true | Read |
| ISC-26 | file | Read fixtures/targets/model-stale.json | dataCaptureEnabled false | Read |
| ISC-27 | file | Read fixtures/controls/nist-subset.yaml | ≥5 controls | Read |
| ISC-28–30 | file | grep pattern fields in nist-subset.yaml | attestation + synthesis present | Grep |
| ISC-31 | file | Read .gitignore | node_modules present | Read |
| ISC-32 | file | Read package.json scripts | build,typecheck,test,dev | Read |
| ISC-33 | grep | No aws-sdk import in src/ | zero matches | Grep |

## Features

| name | description | satisfies | depends_on | parallelizable |
|------|-------------|-----------|------------|----------------|
| project-setup | package.json, tsconfig.json, .gitignore, bun install | ISC-1,2,31,32 | none | no |
| types | src/types.ts with Evidence, Judgment, AgentPattern, ControlItem, ControlSet | ISC-7,8,9,10 | project-setup | yes |
| control-loader | src/loaders/control-loader.ts, YAML+JSON parsing, pattern validation | ISC-11,12,13 | types | yes |
| aws-provider-interface | src/providers/aws-provider.interface.ts, 9 collector methods | ISC-14 | types | yes |
| fixture-provider | src/providers/fixture-provider.ts implementing AwsProvider | ISC-15,16,17,18 | aws-provider-interface | yes |
| evidence-store | src/store/evidence-store.ts, sha256, add/has/bundle, duplicate rejection | ISC-19,20,21,22,23,24 | types | yes |
| fixtures | fixtures/targets/model-clean.json, model-stale.json, controls/nist-subset.yaml | ISC-25,26,27,28,29,30 | types | yes |
| cli | src/cli/index.ts, --controls --target flags, assess command | ISC-3,4,5,6,33 | all above | no |

## M1 Criteria

- [x] ISC-34: `@anthropic-ai/sdk` is in package.json dependencies after `bun add`
- [x] ISC-35: `bun run typecheck` exits 0 after adding all M1 files
- [x] ISC-36: `src/tools/registry.ts` exports Anthropic tool definitions for all 9 collectors
- [x] ISC-37: Tool registry exports `submit_judgment` tool definition
- [x] ISC-38: submit_judgment input_schema has all six Judgment fields (controlId, status, confidence, rationale, evidenceCited, gaps)
- [x] ISC-39: `src/tools/executor.ts` maps each of the 9 collector names to an AwsProvider method call
- [x] ISC-40: `src/llm/llm-provider.interface.ts` exports `LlmProvider` interface with `complete()` method
- [x] ISC-41: `src/llm/anthropic-provider.ts` exports `AnthropicProvider` implementing `LlmProvider`
- [x] ISC-42: AnthropicProvider reads ANTHROPIC_API_KEY from process.env
- [x] ISC-43: AnthropicProvider throws if ANTHROPIC_API_KEY is absent at construction
- [x] ISC-44: `src/guard/citation-guard.ts` exports `validateCitations(judgment, store)` and `CitationError`
- [x] ISC-45: `validateCitations` passes when all evidenceCited IDs are in the store
- [x] ISC-46: `validateCitations` throws `CitationError` when an evidenceCited ID is not in the store
- [x] ISC-47: `CitationError` message includes the invalid evidence ID
- [x] ISC-48: `validateCitations` passes when evidenceCited is empty
- [x] ISC-49: `src/agent/agent.ts` exports `assessControl()` that returns Judgment + EvidenceStore
- [x] ISC-50: Agent loop processes tool_use blocks and calls the tool executor
- [x] ISC-51: Agent loop stores retrieved evidence items in the EvidenceStore on each collector call
- [x] ISC-52: Agent loop returns the judgment when submit_judgment tool is called
- [x] ISC-53: Agent loop calls validateCitations before returning the judgment
- [x] ISC-54: Agent loop throws after MAX_ITERATIONS (≥8) without a submitted judgment
- [x] ISC-55: `src/agent/prompts.ts` system prompt contains the citation invariant instruction
- [x] ISC-56: System prompt includes the control ID, framework, and intent
- [x] ISC-57: `src/runner/assessment-runner.ts` exports `runAssessment()` that assesses all controls in a set
- [x] ISC-58: Assessment runner creates a fresh EvidenceStore per control via assessControl
- [x] ISC-59: Integration: SI-6(1) on clean fixture — requires ANTHROPIC_API_KEY in .env; run `bun test src/agent/agent.test.ts`
- [x] ISC-60: Integration: SI-6(1) on stale fixture — same key requirement
- [x] ISC-61: All citation guard unit tests pass (`bun test`)
- [x] ISC-62: `.env.example` documents ANTHROPIC_API_KEY requirement
- [x] ISC-63: Updated CLI `assess` command shows judgment summary when `--live` flag passed
- [x] ISC-64: Anti: validateCitations never silently skips a non-existent evidence ID
- [x] ISC-65: Anti: Agent loop never emits a judgment that bypasses the citation guard

## M2 Features (M2a)

| name | description | satisfies | depends_on | parallelizable |
|------|-------------|-----------|------------|----------------|
| oscal-types | `src/output/oscal-types.ts` — typed OSCAL AR model subset + `OSCAL_VERSION` | ISC-66,67,73 | none | no |
| evidence-retention | extend `ControlResult` + runner to retain cited evidence (id/source/sha256) | ISC-93,94 | none | no |
| oscal-writer | `src/output/oscal-ar.ts` — `toOscalAssessmentResults(report, controlSet?)` | ISC-68,70-92,101,102 | oscal-types, evidence-retention | no |
| cli-oscal | `assess --oscal <path>` writes AR JSON; `--help` documents flag | ISC-95,96,97,98 | oscal-writer | no |
| oscal-tests | `src/output/oscal-ar.test.ts` + typecheck + full suite green | ISC-69,99,100,103,104 | oscal-writer, cli-oscal | no |

## M2 Criteria (M2a — OSCAL Assessment Results writer)

**Module + types**
- [x] ISC-66: `src/output/oscal-types.ts` exists and exports an `OscalAssessmentResults` root type
- [x] ISC-67: oscal-types exports member types for metadata, result, observation, and finding
- [x] ISC-68: `src/output/oscal-ar.ts` exists and exports `toOscalAssessmentResults(report, controlSet?)`
- [x] ISC-69: `bun run typecheck` exits 0 after adding the output module

**Top-level document structure**
- [x] ISC-70: output root object has the single top-level key `assessment-results`
- [x] ISC-71: `assessment-results.uuid` matches the RFC4122 UUID regex
- [x] ISC-72: `metadata.title` contains the target model name
- [x] ISC-73: `metadata.oscal-version` equals the exported `OSCAL_VERSION` constant
- [x] ISC-74: `metadata.last-modified` is ISO-8601 and `metadata.version` is a non-empty string
- [x] ISC-75: `import-ap` key is present (required by the OSCAL AR schema even absent an assessment plan)

**Results array**
- [x] ISC-76: `results` is an array with exactly one entry per assessment run
- [x] ISC-77: the result has a valid UUID, a title, a description, and a `start` field
- [x] ISC-78: result `start` equals `report.runAt` and is a valid ISO-8601 timestamp

**Findings — one per control**
- [x] ISC-79: the count of `findings` equals the count of control results in the report
- [x] ISC-80: every finding has a valid RFC4122 UUID
- [x] ISC-81: every finding `target.target-id` equals its control's `controlId`
- [x] ISC-82: finding `target.status.state` is "satisfied" iff `judgment.status === "satisfied"`, else "not-satisfied"
- [x] ISC-83: every finding carries a `confidence` prop equal to `judgment.confidence`
- [x] ISC-84: every finding carries a `judgment-status` prop preserving the raw 5-value `judgment.status`
- [x] ISC-85: every finding description contains the judgment rationale text
- [x] ISC-86: each gap in `judgment.gaps` is retrievable from the finding (prop or description)

**Observations — evidence with hash provenance**
- [x] ISC-87: every cited evidence item produces exactly one observation
- [x] ISC-88: every observation has a valid RFC4122 UUID
- [x] ISC-89: every observation `methods` is a non-empty array
- [x] ISC-90: every observation carries a `sha256` prop equal to the evidence item's sha256
- [x] ISC-91: every observation `collected` equals the evidence item's `retrievedAt`
- [x] ISC-92: each finding's `related-observations` uuids resolve to observations in the same result

**Evidence plumbing (upstream retention)**
- [x] ISC-93: `ControlResult` is extended with a cited-evidence array (id, source, sha256) — existing fields unchanged
- [x] ISC-94: the runner populates cited evidence by filtering `store.bundle()` against `judgment.evidenceCited`

**CLI integration**
- [x] ISC-95: `assess --live --oscal <path>` writes an OSCAL AR JSON file to `<path>`
- [x] ISC-96: the written file parses as JSON and equals the in-memory document structure
- [x] ISC-97: CLI `--help` documents the `--oscal` flag
- [x] ISC-98: `assess` without `--oscal` writes no file (existing behavior unchanged)

**Tests + integrity**
- [x] ISC-99: `src/output/oscal-ar.test.ts` exists with bun:test cases for structure, status mapping, and evidence observations
- [x] ISC-100: `bun test` exits 0 with the total passing-test count higher than the 19 baseline
- [x] ISC-101: Anti: the writer never emits finding state "satisfied" for a non-"satisfied" judgment (fail-closed mapping)
- [x] ISC-102: Anti: the writer never fabricates an observation for evidence absent from the cited set
- [x] ISC-103: Anti: no new runtime npm dependency added for UUID generation (uses `node:crypto` randomUUID)
- [DEFERRED-VERIFY] ISC-104: full-schema conformance against the official OSCAL AR JSON schema — no validator on system (`oscal-cli` absent). Follow-up task **TODO-oscal-validate**: run `oscal-cli validate` once the CLI is installed (or in CI).

## M2 Features (M2b)

| name | description | satisfies | depends_on | parallelizable |
|------|-------------|-----------|------------|----------------|
| m2a-commit | `.gitignore` fix for `.DS_Store`, stage, commit M2a on top of `cdf2b69` | ISC-105..111 | none | no |
| narrative-writer | `src/output/narrative.ts` — `toNarrativeMarkdown(report, controlSet?)` | ISC-112..134 | m2a-commit | no |
| cli-narrative | `assess --narrative <path>` writes Markdown; implies `--live`; documented in `--help` | ISC-135..140 | narrative-writer | no |
| narrative-tests | `src/output/narrative.test.ts` + full suite green | ISC-141..143 | cli-narrative | no |
| delegation-review | code-reviewer + silent-failure-hunter pass on new/changed files | ISC-144..145 | narrative-tests | no |

## M2 Criteria (M2b — Markdown narrative renderer)

**M2a commit**
- [ ] ISC-105: `.gitignore` includes a `.DS_Store` entry
- [ ] ISC-106: the stray `.DS_Store` file is removed from the repo working tree
- [ ] ISC-107: `git add` stages exactly the M2a files (ISA.md, src/cli/index.ts, src/runner/assessment-runner.ts, src/output/*, .gitignore) — no unrelated files staged
- [ ] ISC-108: `git commit` succeeds and the new commit's parent is `cdf2b69`
- [ ] ISC-109: the commit message references both "M2a" and "OSCAL"
- [ ] ISC-110: `git status` after commit shows a clean working tree (no modified/untracked tracked-dir files)
- [ ] ISC-111: Anti: the M2a commit is not pushed to `origin` without explicit confirmation from Jose

**Narrative module + types**
- [ ] ISC-112: `src/output/narrative.ts` exists and exports `toNarrativeMarkdown(report, controlSet?)`
- [ ] ISC-113: `bun run typecheck` exits 0 after adding the narrative module
- [ ] ISC-114: the returned string's first line is a top-level `#` heading
- [ ] ISC-115: the top-level heading contains `report.targetName`
- [ ] ISC-116: the document header contains `report.runAt` rendered as ISO-8601

**Per-control sections**
- [ ] ISC-117: the count of per-control `##` headings equals `report.results.length`
- [ ] ISC-118: each control heading contains that result's `controlId`
- [ ] ISC-119: each control heading contains the judgment's `status` value
- [ ] ISC-120: each control section renders the judgment's `confidence` value
- [ ] ISC-121: each control section renders the judgment's `rationale` text verbatim (exact substring match)

**Evidence rendering**
- [ ] ISC-122: each control section's evidence list contains exactly one entry per item in `citedEvidence` (count match)
- [ ] ISC-123: each rendered evidence entry includes that item's `id`
- [ ] ISC-124: each rendered evidence entry includes that item's `source`
- [ ] ISC-125: each rendered evidence entry includes that item's `sha256`
- [ ] ISC-126: when `citedEvidence` is empty, the section renders an explicit "no evidence retrieved" statement instead of an empty list

**Gaps / human attestation**
- [ ] ISC-127: when `gaps` is non-empty, the section renders a "Gaps / Requires Human Attestation" subsection
- [ ] ISC-128: every string in `gaps` appears as a listed item under that subsection
- [ ] ISC-129: when `gaps` is empty, no "Gaps" subsection heading is rendered (no empty-section noise)
- [ ] ISC-130: when `judgment.status === "insufficient-evidence"`, the section renders an explicit human-attestation callout distinct from the gaps subsection

**Summary + integrity**
- [ ] ISC-131: the document includes a summary section with a count of results per status value
- [ ] ISC-132: Anti: the narrative never renders an evidence id that is not present in that result's `citedEvidence`
- [ ] ISC-133: Anti: the narrative never states "satisfied" as the rendered status for a control whose `judgment.status` is not literally `"satisfied"`
- [ ] ISC-134: Anti: no new runtime npm dependency is added (module uses template strings only)

**CLI integration**
- [ ] ISC-135: `assess --live --narrative <path>` writes the markdown narrative to `<path>`
- [ ] ISC-136: the written file's content equals the in-memory `toNarrativeMarkdown(report, controlSet)` output exactly
- [ ] ISC-137: CLI `--help` output documents the `--narrative` flag
- [ ] ISC-138: `assess` without `--narrative` writes no narrative file (existing behavior unchanged)
- [ ] ISC-139: passing `--narrative` without `--live` still triggers a live run (implies `--live`, same pattern as `--oscal`)
- [ ] ISC-140: a single `assess` invocation with both `--oscal` and `--narrative` writes both files correctly with no cross-contamination

**Tests + integrity**
- [ ] ISC-141: `src/output/narrative.test.ts` exists with bun:test cases covering header, per-control section, evidence listing, empty-evidence, gaps rendering, empty-gaps suppression, insufficient-evidence callout, and anti-fabrication
- [ ] ISC-142: `bun test` exits 0
- [ ] ISC-143: the total passing-test count after adding narrative tests is higher than the 33 M2a baseline

**Delegation review**
- [ ] ISC-144: code-reviewer agent review of the new/changed files is invoked and its findings are recorded in `## Decisions`
- [ ] ISC-145: silent-failure-hunter agent review of the new/changed files is invoked and its findings are recorded in `## Decisions`

## Test Strategy (M2b additions)

| isc | type | check | threshold | tool |
|-----|------|-------|-----------|------|
| ISC-105–111 | command | git status/log after gitignore fix + commit | clean tree, correct parent/message | Bash |
| ISC-112,113 | command/grep | typecheck + export presence | exit 0 / export found | Bash, Grep |
| ISC-114–121 | command | `bun test` narrative.test.ts assertions | all pass | Bash |
| ISC-122–126 | command | `bun test` evidence-rendering assertions | all pass | Bash |
| ISC-127–130 | command | `bun test` gaps/attestation assertions | all pass | Bash |
| ISC-131–134 | command | `bun test` summary + anti-criteria assertions | all pass | Bash |
| ISC-135–140 | command | live CLI run with `--oscal`+`--narrative` | both files written correctly | Bash |
| ISC-141–143 | command | `bun test` full suite | exit 0, count > 33 | Bash |
| ISC-144,145 | agent | code-reviewer + silent-failure-hunter findings | recorded in Decisions | Agent |

## Decisions

- 2026-06-24 (M2a): Forge auto-include binding skipped silently per standing decision `codex-forge-not-available.md` (no OpenAI/codex key on this machine). Using direct Claude-family implementation.
- 2026-06-24 (M2a): Delegation floor (soft, E3 ≥2) relaxed to 0. Show-your-math: this is a single self-contained module (~2 source files + 1 test) where I hold full repo context; a delegated agent would re-read the same files I just read and add latency without verification value. Thinking floor (5 capabilities) is met and un-relaxed.
- 2026-06-24 (M2a): Evidence-retention fix placed UPSTREAM at the runner (root-cause-at-ingestion), not patched into the OSCAL writer. `AssessmentReport` discarded evidence items (kept only `evidenceCount`); rather than have the OSCAL writer reach back into a store it doesn't have, the runner now retains the cited evidence (id/source/sha256) on each `ControlResult`. This makes hash provenance available to any future output (OSCAL now, narrative renderer in M2b) — one fix, multiple consumers.
- 2026-06-24 (M2a): OSCAL `import-ap` is required by the schema but mlassure produces no assessment-plan; emitting an empty-href placeholder and documenting AP linkage as a later milestone. Full official-schema validation deferred (ISC-104) — no `oscal-cli` on system.
- 2026-06-24 (M2a, advisor-driven): Rule 2 advisor call flagged that `not-applicable` was silently falling through the `everything-else → not-satisfied` branch, which misrepresents an out-of-scope determination as a control failure to any consumer reading only the standard `state` field. Fix: `not-applicable` still projects to `not-satisfied` (never `satisfied`), but now every non-`satisfied` finding carries a human-visible `remarks` making the precise verdict loud, with special N/A wording. Also added `remarks` to `import-ap` explaining the empty href (advisor point 2). The advisor's primary gate — external OSCAL-schema validation — remains the honest outstanding gap, tracked as ISC-104 `[DEFERRED-VERIFY]` / TODO-oscal-validate; I did NOT claim conformance I can't prove.
- 2026-06-10: Using bun as runtime per CLAUDE.md mandate; package.json targets Node 20+ in tsconfig for SDK compatibility
- 2026-06-10: Evidence sha256 computed via Node built-in `crypto` module (not an npm dep) — keeps the store dependency-free
- 2026-06-10: CLI uses manual arg parsing (Tier 1 llcli pattern) — only one command at M0, Commander.js would be premature
- 2026-06-10: FixtureProvider takes a root path arg so tests can point at any fixture directory

## Changelog

- 2026-06-22: conjectured: ISC-59/ISC-60 (live integration tests) needed a real `ANTHROPIC_API_KEY` to verify, deferred at M1 scaffold time. refuted by: a real key was added to `.env` and `bun test src/agent/agent.test.ts` was run live. learned: both the clean-fixture (satisfied) and stale-fixture (not-satisfied) scenarios pass against the actual Anthropic API, not just fixture mocks. criterion now: ISC-59 `[x]`, ISC-60 `[x]`.
- 2026-06-24 (M2a): conjectured: a single fail-closed rule — "only literal `satisfied` → OSCAL `satisfied`, everything else → `not-satisfied`" — was a clean, safe, uniform projection of mlassure's 5-valued judgment onto OSCAL's binary objective state. refuted by: the Rule 2 advisor showed `not-applicable` is not an uncertainty case (where fail-closed is correct) but a definite out-of-scope determination, and collapsing it into `not-satisfied` inflates the failure count and misleads any consumer that reads `state` and ignores custom props. learned: lossy enum projections need per-value scrutiny, not one blanket rule; "preserve precision in a prop" only protects consumers that read props, so the divergence must also be loud in a standard human-visible field (`remarks`). criterion now: ISC-82 keeps the binary projection but the writer attaches `remarks` to every non-`satisfied` finding with special N/A wording; two new tests pin the behavior (16 OSCAL tests total).

## Verification

- ISC-59/ISC-60: `bun test` → `19 pass, 0 fail, 37 expect() calls. Ran 19 tests across 4 files.` Live output included: "Clean fixture — status: satisfied | confidence: high | evidence: 5 items" and "Stale fixture — status: not-satisfied | confidence: high | evidence: 3 items" — both integration scenarios verified against the real API.

### M2a Verification (2026-06-24)

- ISC-66..68, 99: `Read` confirms `src/output/oscal-types.ts` (exports `OscalAssessmentResults`, `OSCAL_VERSION`, member types), `src/output/oscal-ar.ts` (exports `toOscalAssessmentResults`), and `src/output/oscal-ar.test.ts` exist on disk.
- ISC-69: `bun run typecheck` → exit 0 (`tsc --noEmit`, zero errors) after all M2a files added.
- ISC-70..92, 101, 102: `bun test src/output/oscal-ar.test.ts` → `16 pass, 0 fail, 46 expect() calls` — pure-function tests assert top-level key, UUID format, metadata/oscal-version, import-ap presence, single result, one finding per control, fail-closed status mapping, judgment-status prop, rationale-in-description, gaps-as-props, one observation per cited evidence, sha256 prop per observation, collected==retrievedAt, related-observations resolution, and the no-fabrication anti-criterion.
- ISC-82, 90, 92, 101, 102 (LIVE): real API run wrote `oscal-out.json` (5 findings / 10 observations); programmatic inspection confirmed: 0 fail-closed violations, SA-10 (`insufficient-evidence`, 0 cited) → state `not-satisfied` with 0 related observations (no fabrication), all 10 observations carry a valid 64-hex sha256, 0 dangling related-observation uuids, `oscal-version` == "1.1.2", `import-ap` present.
- ISC-93/94: `Read` of `src/runner/assessment-runner.ts` confirms `ControlResult.citedEvidence: CitedEvidence[]` and the runner filters `store.bundle()` by `judgment.evidenceCited`; existing fields (`evidenceCount`, `iterations`, `judgment`) unchanged → all prior tests still pass.
- ISC-95/96/97/98 (LIVE CLI): `--help` greps to two `--oscal` lines; `assess` without `--oscal` writes no file (`OK: no file written`); `assess --oscal <path>` wrote and the JSON re-parsed to the same structure.
- ISC-100: full suite `bun test` → `33 pass, 0 fail, 77 expect() calls. Ran 33 tests across 5 files.` (baseline was 19; +14, no regressions).
- ISC-103: `package.json` dependencies unchanged (`@anthropic-ai/sdk`, `yaml` only); UUIDs from `node:crypto` `randomUUID`.
- ISC-104: `[DEFERRED-VERIFY]` — `oscal-cli` absent on system; external official-schema conformance NOT yet proven (advisor explicitly flagged self-authored serializer + self-authored tests as a closed loop). Follow-up **TODO-oscal-validate**: run `oscal-cli validate` (or NIST metaschema) in CI.
