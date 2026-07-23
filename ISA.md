---
task: mlassure TODO-m3e-docker-build-verify closure — live Docker build/run verification
slug: mlassure-docker-verify
effort: E3
phase: complete
progress: 11/11
mode: algorithm
started: 2026-07-23T02:00:00Z
updated: 2026-07-23T06:20:00Z
project: mlassure
effort_source: classifier
prior_phase_note: "M3a-f complete — see sections above."
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
- [x] ISC-104: full-schema conformance against the official OSCAL AR JSON schema — CLOSED 2026-07-23 via NIST's official 1.1.2 JSON schema (vendored, sha256-pinned) + compliance-trestle 4.0.2 as second validator; both pass on synthetic and real live-run documents. The external check found 2 real conformance failures the self-authored suite never caught (token-illegal control ids; empty observations arrays). See `## M Criteria (TODO-oscal-validate closure)` and Decisions 2026-07-23.

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
- [x] ISC-105: `.gitignore` includes a `.DS_Store` entry
- [x] ISC-106: the stray `.DS_Store` file is removed from the repo working tree
- [x] ISC-107: `git add` stages exactly the M2a files (ISA.md, src/cli/index.ts, src/runner/assessment-runner.ts, src/output/*, .gitignore) — no unrelated files staged
- [x] ISC-108: `git commit` succeeds and the new commit's parent is `cdf2b69`
- [x] ISC-109: the commit message references both "M2a" and "OSCAL"
- [x] ISC-110: `git status` after commit shows a clean working tree (no modified/untracked tracked-dir files)
- [x] ISC-111: Anti: the M2a commit is not pushed to `origin` without explicit confirmation from Jose

**Narrative module + types**
- [x] ISC-112: `src/output/narrative.ts` exists and exports `toNarrativeMarkdown(report, controlSet?)`
- [x] ISC-113: `bun run typecheck` exits 0 after adding the narrative module
- [x] ISC-114: the returned string's first line is a top-level `#` heading
- [x] ISC-115: the top-level heading contains `report.targetName`
- [x] ISC-116: the document header contains `report.runAt` rendered as ISO-8601

**Per-control sections**
- [x] ISC-117: the count of per-control `##` headings equals `report.results.length`
- [x] ISC-118: each control heading contains that result's `controlId`
- [x] ISC-119: each control heading contains the judgment's `status` value
- [x] ISC-120: each control section renders the judgment's `confidence` value
- [x] ISC-121: each control section renders the judgment's `rationale` text verbatim (exact substring match)

**Evidence rendering**
- [x] ISC-122: each control section's evidence list contains exactly one entry per item in `citedEvidence` (count match)
- [x] ISC-123: each rendered evidence entry includes that item's `id`
- [x] ISC-124: each rendered evidence entry includes that item's `source`
- [x] ISC-125: each rendered evidence entry includes that item's `sha256`
- [x] ISC-126: when `citedEvidence` is empty, the section renders an explicit "no evidence retrieved" statement instead of an empty list

**Gaps / human attestation**
- [x] ISC-127: when `gaps` is non-empty, the section renders a "Gaps / Requires Human Attestation" subsection
- [x] ISC-128: every string in `gaps` appears as a listed item under that subsection
- [x] ISC-129: when `gaps` is empty, no "Gaps" subsection heading is rendered (no empty-section noise)
- [x] ISC-130: when `judgment.status === "insufficient-evidence"`, the section renders an explicit human-attestation callout distinct from the gaps subsection

**Summary + integrity**
- [x] ISC-131: the document includes a summary section with a count of results per status value
- [x] ISC-132: Anti: the narrative never renders an evidence id that is not present in that result's `citedEvidence`
- [x] ISC-133: Anti: the narrative never states "satisfied" as the rendered status for a control whose `judgment.status` is not literally `"satisfied"`
- [x] ISC-134: Anti: no new runtime npm dependency is added (module uses template strings only)

**CLI integration**
- [x] ISC-135: `assess --live --narrative <path>` writes the markdown narrative to `<path>`
- [x] ISC-136: the written file's content equals the in-memory `toNarrativeMarkdown(report, controlSet)` output exactly
- [x] ISC-137: CLI `--help` output documents the `--narrative` flag
- [x] ISC-138: `assess` without `--narrative` writes no narrative file (existing behavior unchanged)
- [x] ISC-139: passing `--narrative` without `--live` still triggers a live run (implies `--live`, same pattern as `--oscal`)
- [x] ISC-140: a single `assess` invocation with both `--oscal` and `--narrative` writes both files correctly with no cross-contamination

**Tests + integrity**
- [x] ISC-141: `src/output/narrative.test.ts` exists with bun:test cases covering header, per-control section, evidence listing, empty-evidence, gaps rendering, empty-gaps suppression, insufficient-evidence callout, and anti-fabrication
- [x] ISC-142: `bun test` exits 0
- [x] ISC-143: the total passing-test count after adding narrative tests is higher than the 33 M2a baseline

**Delegation review**
- [x] ISC-144: code-reviewer agent review of the new/changed files is invoked and its findings are recorded in `## Decisions`
- [x] ISC-145: silent-failure-hunter agent review of the new/changed files is invoked and its findings are recorded in `## Decisions`

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
| ISC-146–158 | command | judgment-validator.test.ts + full suite + live runs | all pass, zero regressions | Bash |

## M1 Hardening — judgment-shape validator (advisor-driven, 2026-06-25)

- [x] ISC-146: `src/guard/judgment-validator.ts` exists and exports `parseJudgment(raw, controlId)` and `JudgmentShapeError`
- [x] ISC-147: `bun run typecheck` exits 0 after adding the validator
- [x] ISC-148: `parseJudgment` returns an unchanged `Judgment` when every field is well-formed
- [x] ISC-149: `parseJudgment` throws `JudgmentShapeError` when input is not an object (string, null)
- [x] ISC-150: `parseJudgment` throws when `status` is not one of the five valid literal values
- [x] ISC-151: `parseJudgment` throws when `confidence` is not one of the three valid literal values
- [x] ISC-152: `parseJudgment` throws when `rationale` is empty or whitespace-only
- [x] ISC-153: `parseJudgment` throws when `gaps` or `evidenceCited` is not a string array
- [x] ISC-154: `parseJudgment` throws when `controlId` is missing or empty
- [x] ISC-155: the thrown error message names the control being assessed
- [x] ISC-156: `agent.ts` calls `parseJudgment` before `validateCitations` at the `submit_judgment` boundary
- [x] ISC-157: Anti: the validator introduces zero behavior change for any well-formed judgment — full suite passes with zero regressions after wiring
- [x] ISC-158: live verification — a real Anthropic API run against both the clean and stale fixtures passes validation transparently for every returned judgment, including a `not-satisfied` status

## M2 Features (M2c)

| name | description | satisfies | depends_on | parallelizable |
|------|-------------|-----------|------------|----------------|
| coverage-mechanics | `agent.ts` tracks calledCollectors/citedCollectors per control | ISC-159..162 | none | no |
| coverage-policy | `assessment-runner.ts` buckets into evidenceCoverage/coverageConfidence/raw counts on ControlResult | ISC-163..170 | coverage-mechanics | no |
| oscal-coverage-props | additive `evidence-coverage`/`coverage-confidence` props in `oscal-ar.ts` | ISC-171..174 | coverage-policy | yes |
| narrative-two-line-confidence | narrative renders both confidence values, never drops self-reported | ISC-175..177 | coverage-policy | yes |
| cli-coverage-display | CLI one-liner shows coverageConfidence as primary | ISC-178..179 | coverage-policy | yes |
| fixture-migration | hand-built ControlResult literals in oscal-ar.test.ts/narrative.test.ts updated | ISC-180..181 | coverage-policy | no |
| coverage-tests | new tests for mechanics, vacuous case, anti-gaming, OSCAL props, narrative lines | ISC-182..189 | all above | no |
| delegation-review-m2c | code-reviewer + silent-failure-hunter + Cato (E4-mandatory) | ISC-190..192 | coverage-tests | no |

## M2 Criteria (M2c — confidence-as-coverage derivation)

**Mechanics (agent.ts)**
- [x] ISC-159: `agent.ts`'s tool-call loop builds a per-control `Map<evidenceId, collectorName>`, keyed by each stored evidence item's id, using `block.name` as the collector name
- [x] ISC-160: `AssessControlResult` gains a `calledCollectors: Set<string>` — every collector name actually invoked during the control's assessment
- [x] ISC-161: `AssessControlResult` gains a `citedCollectors: Set<string>` — collector names whose evidence appears in `judgment.evidenceCited`
- [x] ISC-162: `bun run typecheck` exits 0 after the `agent.ts`/type changes

**Policy (assessment-runner.ts)**
- [x] ISC-163: `ControlResult` gains `evidenceCoverage: number` = `control.collectors.length === 0 ? 1.0 : citedCollectors.size / control.collectors.length`
- [x] ISC-164: `ControlResult` gains `collectorsTagged: number` = `control.collectors.length`
- [x] ISC-165: `ControlResult` gains `collectorsCalled: number` = `calledCollectors.size`
- [x] ISC-166: `ControlResult` gains `collectorsCited: number` = `citedCollectors.size`
- [x] ISC-167: `ControlResult` gains `coverageConfidence: "high"|"medium"|"low"` via: ratio===1→high; 0<ratio<1→medium; ratio===0 with collectorsTagged>0→low; collectorsTagged===0→high
- [x] ISC-168: a `collectors: []` control (SA-10-shaped) gets `evidenceCoverage === 1.0` and `coverageConfidence === "high"` (vacuous truth, matches the published example)
- [x] ISC-169: Anti: a control that calls only a strict subset of its tagged collectors never reaches `coverageConfidence: "high"` unless `collectorsCited === collectorsTagged`
- [x] ISC-170: Anti: `evidenceCoverage` is never `NaN`, regardless of `collectorsTagged`

**OSCAL additive props**
- [x] ISC-171: `buildFinding` in `oscal-ar.ts` adds an `evidence-coverage` prop (numeric ratio as string) under `MLASSURE_NS`
- [x] ISC-172: `buildFinding` adds a `coverage-confidence` prop with the derived bucket under `MLASSURE_NS`
- [x] ISC-173: the existing self-reported `confidence` prop is unchanged and still present (additive, not replaced)
- [x] ISC-174: `oscal-types.ts` requires zero changes

**Narrative two-line display**
- [x] ISC-175: `renderControlSection` renders `**Confidence (evidence coverage):** <bucket>` as the primary confidence line
- [x] ISC-176: `renderControlSection` renders `**Confidence (model self-reported):** <judgment.confidence>` as a second, always-present line
- [x] ISC-177: Anti: the self-reported confidence line is never omitted, even when it matches the coverage value exactly

**CLI one-liner**
- [x] ISC-178: the CLI one-line summary shows `coverageConfidence` as the primary `conf:` value
- [x] ISC-179: the self-reported confidence value still appears somewhere in the printed output (not dropped)

**Test fixture migration**
- [x] ISC-180: every hand-built `ControlResult` literal in `oscal-ar.test.ts` is updated for the new required fields; `bun run typecheck` exits 0
- [x] ISC-181: every hand-built `ControlResult` literal in `narrative.test.ts` is updated for the new required fields; `bun run typecheck` exits 0

**New coverage tests**
- [x] ISC-182: a test verifies `calledCollectors`/`citedCollectors` against a synthetic multi-collector scenario
- [x] ISC-183: a test verifies the SA-10 vacuous case end-to-end
- [x] ISC-184: a test verifies the partial-subset anti-gaming criterion (ISC-169) with a concrete synthetic example
- [x] ISC-185: a test verifies the OSCAL coverage props (ISC-171/172)
- [x] ISC-186: a test verifies the narrative's two-line rendering (ISC-175/176), including the never-omitted case
- [x] ISC-187: full suite `bun test` exits 0 with passing count higher than the 64 baseline
- [x] ISC-188 (LIVE): a live CLI run against both fixtures produces non-NaN, sensible coverage numbers for every control
- [x] ISC-189: Anti: `judgment.confidence` is never silently dropped from OSCAL, narrative, or CLI output after this change

**Delegation review**
- [x] ISC-190: code-reviewer agent review invoked, findings recorded in Decisions
- [x] ISC-191: silent-failure-hunter agent review invoked, findings recorded in Decisions
- [x] ISC-192 (E4-mandatory): Cato cross-vendor audit invoked before `phase: complete`, verdict recorded — `skipped`, no codex/GPT-5.4 access on this machine (401), consistent with standing decision `codex-forge-not-available.md`; not a blocker

## Test Strategy (M2c additions)

| isc | type | check | threshold | tool |
|-----|------|-------|-----------|------|
| ISC-159–162 | command/grep | typecheck + Map/Set construction | exit 0 | Bash, Grep |
| ISC-163–170 | command | new coverage unit tests | all pass | Bash |
| ISC-171–174 | command | OSCAL prop tests | all pass | Bash |
| ISC-175–177 | command | narrative two-line tests | all pass | Bash |
| ISC-178–179 | command | live CLI output grep | both values present | Bash |
| ISC-180–181 | command | typecheck after fixture migration | exit 0 | Bash |
| ISC-182–189 | command | full suite + live runs | exit 0, count > 64 | Bash |
| ISC-190–192 | agent | code-reviewer + silent-failure-hunter + Cato | findings recorded | Agent |

## M3 Features (M3a)

| name | description | satisfies | depends_on | parallelizable |
|------|-------------|-----------|------------|----------------|
| control-additions | 3 new entries in nist-subset.yaml (SC-7, RA-3, CA-7), zero new collector/loader code | ISC-193..201 | none | no |
| fixture-verification | confirm modelCard/network fixture divergence already supports the 3 new controls without JSON changes | ISC-202..205 | none | yes |
| live-verification | live CLI runs against both fixtures, 8-control output, correct verdicts incl. RA-3's conditional insufficient-evidence | ISC-206..212 | control-additions | no |
| readme-sync | control table, demo output, Implementation Ledger, Status table updated to 8 controls | ISC-213..216 | live-verification | no |
| delegation-review-m3a | code-reviewer + silent-failure-hunter (Cato skipped per standing decision, no codex access) | ISC-217..218 | live-verification | no |

## M3 Criteria (M3a — broader control coverage: 5→8 controls)

**Control additions (nist-subset.yaml)**
- [x] ISC-193: `nist-subset.yaml` contains a new control `SC-7` (Boundary Protection), pattern `deterministic`, collectors `[getEndpointNetworkConfig]`
- [x] ISC-194: `nist-subset.yaml` contains a new control `RA-3` (Risk Assessment), pattern `synthesis`, collectors `[getModelCard]`
- [x] ISC-195: `nist-subset.yaml` contains a new control `CA-7` (Continuous Monitoring), pattern `sufficiency`, collectors `[getModelMonitorSchedules]`
- [x] ISC-196: SC-7's `intent` states the binary check (network isolation + VPC present **+ at least one security group attached**) without requiring LLM judgment — refined post-code-review, see Decisions
- [x] ISC-197: RA-3's `intent` states the model card must be synthesized (risk rating vs. intended use/limitations), and explicitly notes evidence may be absent depending on target
- [x] ISC-198: CA-7's `intent` states it checks monitoring *health* (every scheduled monitor's last run succeeded), distinct in wording from SI-6(1)'s monitoring-*configured* intent
- [x] ISC-199: `bun run dev -- --help` / control loader still accepts the file — no changes to `src/loaders/control-loader.ts`, `src/providers/aws-provider.interface.ts`, or `src/providers/fixture-provider.ts` (Anti: zero collector/loader code diffs for this milestone)
- [x] ISC-200: `fixtures/targets/model-clean.json` and `fixtures/targets/model-stale.json` require zero field additions (Anti: no new JSON fixture keys invented to manufacture evidence)
- [x] ISC-201: Anti: no new `AgentPattern` value introduced — all 3 new controls reuse `deterministic`/`synthesis`/`sufficiency`

**Fixture-divergence verification (no code change, confirm existing data supports the design)**
- [x] ISC-202: `model-clean.json`'s `modelCard` is a non-null object (already true — re-confirmed, not re-authored)
- [x] ISC-203: `model-stale.json`'s `modelCard` is `null` (already true — re-confirmed, not re-authored)
- [x] ISC-204: `model-clean.json`'s `network.enableNetworkIsolation` is `true` with a non-empty `vpcId`; `model-stale.json`'s is `false` with `vpcId: null` (already true — re-confirmed)
- [x] ISC-205: `model-clean.json`'s 3 `monitors[]` entries all have `lastRunStatus: "Completed"`; `model-stale.json`'s single monitor entry has `lastRunStatus: "Failed"` (already true — re-confirmed)

**Live verification**
- [x] ISC-206 (LIVE): live CLI run against `model-clean.json` prints 8 control rows, not 5 — confirmed 2026-07-19, `TODO-m3a-live-verify` closed
- [x] ISC-207 (LIVE): live CLI run against `model-stale.json` prints 8 control rows, not 5 — confirmed 2026-07-19
- [x] ISC-208 (LIVE): SC-7 renders `satisfied` on clean, `not-satisfied` on stale — confirmed exactly as designed
- [x] ISC-209 (LIVE): RA-3 renders a non-`insufficient-evidence` status on clean (`satisfied`, model card present) and `insufficient-evidence` on stale (`conf:low self-reported:high`, model card null, gap text names the missing artifact explicitly) — confirmed exactly as designed, including the M3c fix: narrative correctly labels this "self-reported" (synthesis pattern, LLM-authored), not the attestation-callout text
- [x] ISC-210 (LIVE): CA-7 renders `satisfied` on clean (all monitors Completed), `not-satisfied` on stale (the one present monitor Failed) — confirmed exactly as designed
- [x] ISC-211 (LIVE): SA-10 unaffected — `insufficient-evidence`, `code-determined:high`, zero evidence, identical gap text on both fixtures — confirmed the M3b bypass behaves identically regardless of target
- [x] ISC-212: `bun test` exits 0 with pass count ≥ the 74-pass / 190-expect() baseline captured before this milestone (Anti: no silent test-count drop from a broken fixture load) — `74 pass, 2 skip, 0 fail, 190 expect() calls` after the YAML change, matches baseline exactly

**README sync**
- [x] ISC-213: README control table lists all 8 controls with id/title/pattern
- [x] ISC-214: README demo output blocks show 8 rows per fixture, not 5 — updated with real captured live output (2026-07-19), including the new `self-reported`/`code-determined` labels (M3c) and RA-3's live conditional-insufficiency demonstration on the stale fixture
- [x] ISC-215: README Implementation Ledger moves "Broader control coverage" from Designed to Implemented, with the RA-3 conditional-insufficiency mechanism named explicitly and the DEFERRED-VERIFY status disclosed inline
- [x] ISC-216: README Status table's M3 row reflects "5→8 controls" as shipped-with-deferred-verification; Docker/pattern-differentiation/custody-chain/tag-provenance correctly left under "M3 (remaining): Planned"

**Delegation review**
- [x] ISC-217: code-reviewer agent review invoked, findings recorded in Decisions
- [x] ISC-218: silent-failure-hunter agent review invoked (first attempt hit a session API limit and failed cleanly with no partial/misleading output; retried successfully after reset), findings recorded in Decisions

## Test Strategy (M3a additions)

| isc | type | check | threshold | tool |
|-----|------|-------|-----------|------|
| ISC-193–198 | file | Read nist-subset.yaml | 3 new controls present, correct fields | Read |
| ISC-199 | command | git diff on loader/interface/provider files | zero diff | Bash |
| ISC-200 | command | git diff on fixture JSON files | zero diff | Bash |
| ISC-201 | grep | pattern values used in new controls | subset of existing 5 | Grep |
| ISC-202–205 | file | Read fixture JSON | values match as stated | Read |
| ISC-206–211 | command | live `bun run dev -- assess` against both fixtures | output matches expected verdicts | Bash |
| ISC-212 | command | `bun test` | exit 0, pass ≥74, expect ≥190 | Bash |
| ISC-213–216 | file | Read README.md | sections updated | Read |
| ISC-217–218 | agent | code-reviewer + silent-failure-hunter | findings recorded | Agent |

## M3 Features (M3b)

| name | description | satisfies | depends_on | parallelizable |
|------|-------------|-----------|------------|----------------|
| attestation-bypass-mechanics | `agent.ts` early-return for `pattern === "attestation"`, zero collector/LLM calls | ISC-219..225 | none | no |
| prompt-cleanup | dead attestation instruction paragraph removed from `prompts.ts` | ISC-226..228 | attestation-bypass-mechanics | no |
| bypass-tests | new unit tests proving zero LLM/collector calls, negative-assertion style | ISC-229..233 | attestation-bypass-mechanics | no |
| regression-tests | full suite still passes | ISC-234 | bypass-tests | no |
| delegation-review-m3b | code-reviewer + silent-failure-hunter | ISC-235..236 | regression-tests | no |
| readme-sync-m3b | Implementation Ledger moves attestation-bypass Partial → Implemented | ISC-237 | delegation-review-m3b | no |

## M3 Criteria (M3b — attestation pattern bypasses the LLM loop)

**Bypass mechanics (agent.ts)**
- [x] ISC-219: `assessControl()` checks `control.pattern === "attestation"` and returns before constructing tools, system prompt, or making any LLM call
- [x] ISC-220: bypass returns a `Judgment` with `status: "insufficient-evidence"`
- [x] ISC-221: bypass `Judgment` has `confidence: "high"` (classification is deterministic, not evidence-strength — per FirstPrinciples reconstruction)
- [x] ISC-222: bypass `Judgment` has `evidenceCited: []`
- [x] ISC-223: bypass `Judgment` has a non-empty `gaps` entry naming the human-sign-off requirement
- [x] ISC-224: bypass returns `calledCollectors` and `citedCollectors` as empty `Set`s
- [x] ISC-225: Anti: the bypass gate is `control.pattern` alone, never `control.collectors.length === 0` — a hypothetical future attestation control with non-empty `collectors` must still bypass cleanly without invoking any of them (advisor-flagged edge case, resolved as a deliberate design position, see Decisions)

**Prompt cleanup (prompts.ts)**
- [x] ISC-226: `buildSystemPrompt`'s attestation-specific instruction paragraph ("For the attestation pattern...") is removed — genuinely unreachable after ISC-219
- [x] ISC-227: `bun run typecheck` exits 0 after the `agent.ts`/`prompts.ts` changes
- [x] ISC-228: Anti: no other caller of `buildSystemPrompt` exists besides `agent.ts` (confirmed via grep before deletion, not assumed)

**Bypass tests (negative-assertion style — a green Judgment-shape test alone does not prove the bypass)**
- [x] ISC-229: new `agent-loop.test.ts` test with a mock `LlmProvider` asserts `llm.complete` is called **0 times** for an attestation-pattern control
- [x] ISC-230: same test asserts every method on the mock `AwsProvider` is called **0 times**
- [x] ISC-231: same test asserts the returned judgment matches the exact bypass shape (status/confidence/evidenceCited/gaps)
- [x] ISC-232: a second test proves a non-attestation control (synthesis) still calls `llm.complete` at least once — regression guard against an overly-broad gate
- [x] ISC-233: a third test uses a synthetic attestation-pattern control with non-empty `collectors` in its definition and asserts zero of those collectors are ever invoked (ISC-225 made concrete)
- [x] ISC-234: full `bun test` exits 0 with pass count ≥ the 74-pass / 190-expect() M3a baseline — actual: 77 pass, 200 expect()

**Delegation review**
- [x] ISC-235: code-reviewer agent review invoked, findings recorded in Decisions
- [x] ISC-236: silent-failure-hunter agent review invoked, findings recorded in Decisions

**README sync**
- [x] ISC-237: README Implementation Ledger moves "LLM bypass for attestation" from Partial to Implemented; deterministic-pattern bypass explicitly remains Partial (out of scope this pass)

## Test Strategy (M3b additions)

| isc | type | check | threshold | tool |
|-----|------|-------|-----------|------|
| ISC-219–225 | grep/read | agent.ts bypass logic | early-return present, correct shape | Read, Grep |
| ISC-226 | grep | attestation paragraph in prompts.ts | zero matches | Grep |
| ISC-227 | command | `bun run typecheck` | exit 0 | Bash |
| ISC-228 | grep | callers of buildSystemPrompt | exactly 1 (agent.ts) | Grep |
| ISC-229–233 | command | `bun test src/agent/agent-loop.test.ts` | all pass, mock call-count assertions | Bash |
| ISC-234 | command | `bun test` | exit 0, pass ≥74, expect ≥190 | Bash |
| ISC-235–236 | agent | code-reviewer + silent-failure-hunter | findings recorded | Agent |
| ISC-237 | file | Read README.md | Implementation Ledger updated | Read |

## Decisions

## M3 Features (M3c)

| name | description | satisfies | depends_on | parallelizable |
|------|-------------|-----------|------------|----------------|
| pattern-predicates | `isCodeDetermined`/`usesAttestationCallout` named predicates in `types.ts`, next to `AgentPattern` | ISC-238..240 | none | no |
| control-result-pattern | `ControlResult` gains required `pattern: AgentPattern`, populated in `assessment-runner.ts` | ISC-241..243 | pattern-predicates | no |
| narrative-fix | pattern-aware attestation callout + confidence-label in `narrative.ts` | ISC-244..248 | control-result-pattern | yes |
| oscal-fix | additive `pattern` prop + corrected comment in `oscal-ar.ts` | ISC-249..251 | control-result-pattern | yes |
| cli-fix | pattern-aware label in `cli/index.ts` | ISC-252..253 | control-result-pattern | yes |
| fixture-migration-m3c | every hand-built `ControlResult` literal across 3 test files gains `pattern` | ISC-254..255 | narrative-fix, oscal-fix, cli-fix | no |
| m3c-tests | new tests for both callout branches, both confidence labels, OSCAL prop | ISC-256..261 | fixture-migration-m3c | no |
| delegation-review-m3c | code-reviewer + silent-failure-hunter | ISC-262..263 | m3c-tests | no |
| readme-sync-m3c | Partial → Implemented, close the 2-instance-confirmed gap | ISC-264 | delegation-review-m3c | no |

## M3 Criteria (M3c — output-layer pattern/provenance awareness)

**Named predicates (types.ts)**
- [x] ISC-238: `types.ts` exports `isCodeDetermined(pattern: AgentPattern): boolean`, true only for `"attestation"`
- [x] ISC-239: `types.ts` exports `usesAttestationCallout(pattern: AgentPattern): boolean`, true only for `"attestation"` (distinct function from ISC-238 even though currently identical — advisor-flagged: these are two different semantic questions that only coincide today)
- [x] ISC-240: Anti: no file outside `types.ts` contains the string literal comparison `pattern === "attestation"` for either purpose — all 3 output files import and use the named predicates

**ControlResult gains pattern**
- [x] ISC-241: `ControlResult` (`assessment-runner.ts`) gains a required `pattern: AgentPattern` field
- [x] ISC-242: the field is populated from `control.pattern` (the configured/declared pattern) at the point of `ControlResult` construction in the assessment loop
- [x] ISC-243: verified (not assumed) that declared pattern and executed pattern are identical in the current codebase — the only pattern-runtime-branch is `agent.ts`'s single `if (control.pattern === "attestation")` bypass check, with no fallback/catch that could execute a different mechanism than declared (grepped `agent.ts` for other try/catch — the only one wraps collector-execution error handling, unrelated to pattern dispatch). Flagged in Decisions as a fact to re-verify if a future slice (deterministic bypass) introduces a runtime fallback.

**narrative.ts fix**
- [x] ISC-244: `renderAttestationCallout` takes `ControlResult` (not bare `Judgment`) and branches on `usesAttestationCallout(result.pattern)`
- [x] ISC-245: when `usesAttestationCallout` is true and status is `insufficient-evidence`, renders the existing "Requires human attestation" callout, now correctly scoped to true attestation-pattern controls only
- [x] ISC-246: when `usesAttestationCallout` is false and status is `insufficient-evidence`, renders a distinct, generically-honest callout that does NOT claim human attestation is required (per advisor: don't assume a specific cause like "missing artifact" when no reason-code field exists on `Judgment` to support that claim — say only what's actually known)
- [x] ISC-247: the confidence-line label reads "code-determined (attestation pattern)" when `isCodeDetermined(result.pattern)` is true, "model self-reported" otherwise
- [x] ISC-248: Anti: the evidence-coverage confidence line (`coverageConfidence`) is unaffected by this change — only the second line's label changes

**oscal-ar.ts fix**
- [x] ISC-249: `buildFinding` adds an additive `pattern` prop under `MLASSURE_NS` with the raw pattern string (machine token, not prose)
- [x] ISC-250: the code comment on the existing `confidence` prop no longer unconditionally claims "model self-report" — corrected to state the exception
- [x] ISC-251: Anti: no existing OSCAL prop (`confidence`, `coverage-confidence`, `evidence-coverage`) changes value or meaning — purely additive

**cli/index.ts fix**
- [x] ISC-252: the CLI one-liner's label reads `code-determined:` when `isCodeDetermined(r.pattern)` is true, `self-reported:` otherwise
- [x] ISC-253: Anti: `coverageConfidence` (the `conf:` value) and its label are unaffected

**Test fixture migration**
- [x] ISC-254: every hand-built `ControlResult` literal in `narrative.test.ts` gains a `pattern` field; `bun run typecheck` exits 0
- [x] ISC-255: every hand-built `ControlResult` literal in `oscal-ar.test.ts` and `assessment-runner.test.ts` gains a `pattern` field; `bun run typecheck` exits 0 (assessment-runner.test.ts needed none — it builds results via `runAssessment()`, not hand literals)

**New tests**
- [x] ISC-256: a test verifies the true-attestation callout renders for an attestation-pattern insufficient-evidence result
- [x] ISC-257: a test verifies the NEW distinct callout renders for a non-attestation-pattern (e.g. `synthesis`) insufficient-evidence result, and does NOT contain "Requires human attestation"
- [x] ISC-258: a test verifies the confidence line reads "code-determined" for an attestation-pattern result
- [x] ISC-259: a test verifies the confidence line reads "model self-reported" for a non-attestation-pattern result
- [x] ISC-260: a test verifies the OSCAL `pattern` prop is present and correct for both an attestation and non-attestation finding (also closes a pre-existing gap the M3b silent-failure-hunter review flagged: zero prior SA-10-shaped OSCAL test coverage)
- [x] ISC-261: full `bun test` exits 0 with pass count ≥ the 77-pass / 200-expect() M3b baseline — actual: 81 pass, 209 expect() (includes one pre-existing M2c test fixed for the new correct pattern-aware behavior, see Decisions)

**Delegation review**
- [x] ISC-262: code-reviewer agent review invoked, findings recorded in Decisions
- [x] ISC-263: silent-failure-hunter agent review invoked, findings recorded in Decisions

**README sync**
- [x] ISC-264: README's "Output-layer pattern/provenance awareness" bullet moves from Partial to Implemented, naming both fixed call sites

## Test Strategy (M3c additions)

| isc | type | check | threshold | tool |
|-----|------|-------|-----------|------|
| ISC-238–240 | grep/read | predicates in types.ts, zero raw string comparisons elsewhere | present, zero matches | Grep, Read |
| ISC-241–243 | read/grep | ControlResult type + population site + agent.ts fallback audit | field present, populated, no fallback found | Read, Grep |
| ISC-244–248 | command | new narrative tests | all pass | Bash |
| ISC-249–251 | command | new OSCAL tests | all pass | Bash |
| ISC-252–253 | read | cli/index.ts label logic | correct branch | Read |
| ISC-254–255 | command | `bun run typecheck` after fixture migration | exit 0 | Bash |
| ISC-256–261 | command | `bun test` | exit 0, pass ≥77, expect ≥200 | Bash |
| ISC-262–263 | agent | code-reviewer + silent-failure-hunter | findings recorded | Agent |
| ISC-264 | read | README.md | Implemented, both call sites named | Read |

## Decisions

## M3 Features (M3d)

| name | description | satisfies | depends_on | parallelizable |
|------|-------------|-----------|------------|----------------|
| deterministic-check-types | `DeterministicCheckFn` type, reusing `AssessControlResult` shape | ISC-265..266 | none | no |
| deterministic-checks-impl | `src/agent/deterministic-checks.ts` — real SC-28 + SC-7 check functions, registry | ISC-267..274 | deterministic-check-types | no |
| dispatch | `assessControl()` dispatches to registry for `pattern: deterministic`, throws if unregistered | ISC-275..277 | deterministic-checks-impl | no |
| preflight | `runAssessment()` aborts the WHOLE run, listing ALL missing checks, before any control runs | ISC-278..280 | dispatch | no |
| iscodetermined-generalize | `isCodeDetermined` becomes derived (`attestation` OR `deterministic`), narrative/oscal text generalized | ISC-281..284 | dispatch | yes |
| m3d-tests | negative-assertion tests for bypass, fail-loud preflight, shape parity | ISC-285..292 | preflight, iscodetermined-generalize | no |
| delegation-review-m3d | code-reviewer + silent-failure-hunter | ISC-293..294 | m3d-tests | no |
| readme-sync-m3d | Partial → Implemented | ISC-295 | delegation-review-m3d | no |

## M3 Criteria (M3d — deterministic pattern bypasses the LLM loop)

**Types**
- [x] ISC-265: `src/agent/deterministic-checks.ts` exports `DeterministicCheckFn`, a function type with the exact same return shape as `AssessControlResult` (judgment/store/iterations/calledCollectors/citedCollectors)
- [x] ISC-266: `DETERMINISTIC_CHECKS: Record<string, DeterministicCheckFn>` exported, keyed by control ID (not pattern) — a per-control-ID registry, not a per-pattern one, since each deterministic control's rule is genuinely different code

**Real check implementations**
- [x] ISC-267: `checkSC28` calls `provider.getKMSConfig(target)` and stores real evidence via a fresh `EvidenceStore`
- [x] ISC-268: `checkSC28` returns `satisfied` iff `keyManager === "CUSTOMER"` (matching the intent text's exact "customer-managed, not AWS-managed" rule), `not-satisfied` otherwise
- [x] ISC-269: `checkSC28` returns `insufficient-evidence` (not a false negative) if `getKMSConfig` returns `null` — defensive path, unreached by the current 2 fixtures (both always populate `kms`) but designed correctly, not assumed away
- [x] ISC-270: `checkSC7` calls `provider.getEndpointNetworkConfig(target)` and stores real evidence
- [x] ISC-271: `checkSC7` returns `satisfied` iff all 3 conditions hold (isolation enabled, VPC present, ≥1 security group) per the corrected M3a intent text, `not-satisfied` otherwise
- [x] ISC-272: `checkSC7` returns `insufficient-evidence` if `getEndpointNetworkConfig` returns `null` — same defensive-path discipline as ISC-269
- [x] ISC-273: both checks set `evidenceCited` to the real stored evidence id(s) — the citation invariant holds for code-determined judgments exactly as for LLM-determined ones, not bypassed
- [x] ISC-274: both checks set `iterations: 0` (no LLM involved), matching the M3b attestation-bypass precedent

**Dispatch (fail-loud, no fallback)**
- [x] ISC-275: `assessControl()` checks `control.pattern === "deterministic"` after the attestation check, looks up `DETERMINISTIC_CHECKS[control.id]`
- [x] ISC-276: if found, dispatches to it and returns its result directly — no LLM call, no tool-use loop entered
- [x] ISC-277: if NOT found, throws a named `MissingDeterministicCheckError(control.id)` — Anti: never silently falls back to the LLM loop (advisor-mandated: a silent fallback would produce a report claiming code-determination while actually LLM-judged — the exact evidence-integrity defect this project exists to prevent)

**Preflight (whole-run abort, not per-control)**
- [x] ISC-278: `runAssessment()` (`assessment-runner.ts`) walks the full `controlSet.controls` BEFORE the main loop and collects every `deterministic`-pattern control ID missing from `DETERMINISTIC_CHECKS`
- [x] ISC-279: if any are missing, throws ONE aggregate error listing ALL missing IDs (not just the first) before any control — deterministic or otherwise — is assessed
- [x] ISC-280: Anti: a run with a mix of valid and invalid deterministic controls burns zero LLM calls before aborting (tested via the LLM-never-called negative-assertion pattern established in M3b)

**isCodeDetermined generalization (closes the M3c naming-trap flag)**
- [x] ISC-281: `isCodeDetermined` (`types.ts`) becomes `pattern === "attestation" || pattern === "deterministic"` — a pure derived function over `pattern`, structurally incapable of diverging from what actually ran, since both patterns are now fail-loud-guaranteed to be code-determined
- [x] ISC-282: `usesAttestationCallout` is UNCHANGED — still `pattern === "attestation"` only; a `not-satisfied`/`satisfied` deterministic verdict never needs the attestation callout (only fires for `insufficient-evidence`, and a deterministic control only reaches that via the defensive null-collector path, ISC-269/272)
- [x] ISC-283: `narrative.ts`'s confidence-line label generalizes from the hardcoded "code-determined, attestation pattern" string to `code-determined (${pattern} pattern)`, correct for both attestation and deterministic results
- [x] ISC-284: `oscal-ar.ts`'s code comment on the `confidence` prop generalizes from naming "attestation" specifically to referencing `isCodeDetermined` patterns generically

**Tests**
- [x] ISC-285: negative-assertion tests — mock LLM throws if called; SC-28 with customer-managed AND AWS-managed key fixtures both produce correct verdicts with zero LLM calls
- [x] ISC-286: same pattern for SC-7 (isolated+VPC+SG vs. none of the three)
- [x] ISC-287: fail-loud test — a control set containing a `deterministic`-pattern control with no registry entry throws `MissingDeterministicCheckError` before any LLM call, verified via `assessControl()` directly and via `runAssessment()`'s preflight with an earlier LLM-path control listed FIRST
- [x] ISC-288: the aggregate-error test — 2 missing deterministic controls in one control set produces ONE error naming BOTH ids, not just the first
- [x] ISC-289: shape-parity test — a deterministic-check `Judgment` re-parsed through `parseJudgment` is identical to itself (`toEqual`), proving it satisfies the exact same shape contract as an LLM-produced judgment, not a looser one
- [x] ISC-290: narrative tests — deterministic-pattern `satisfied` results render `code-determined (deterministic pattern)`, both in the dedicated M3d test and the corrected pre-existing M2c-era loop test
- [x] ISC-291: OSCAL test — `pattern` prop and `confidence` prop both correct for a deterministic-pattern finding
- [x] ISC-292: full `bun test` exits 0 with pass count ≥ the 81-pass / 210-expect() M3c baseline — actual: 96 pass, 248 expect() (also picked up 2 previously-skipped live integration tests now running for real since `ANTHROPIC_API_KEY` is configured)

**Delegation review**
- [x] ISC-293: code-reviewer agent review invoked, findings recorded in Decisions
- [x] ISC-294: silent-failure-hunter agent review invoked, findings recorded in Decisions

**README sync**
- [x] ISC-295: "LLM bypass for `deterministic`" bullet moves from Partial to Implemented, naming the fail-loud preflight design explicitly

## Test Strategy (M3d additions)

| isc | type | check | threshold | tool |
|-----|------|-------|-----------|------|
| ISC-265–277 | read/grep | types, registry, dispatch logic | present, correct | Read, Grep |
| ISC-278–280 | command | preflight negative-assertion tests | all pass | Bash |
| ISC-285–292 | command | `bun test` | exit 0, pass ≥81, expect ≥210 | Bash |
| ISC-293–294 | agent | code-reviewer + silent-failure-hunter | findings recorded | Agent |
| ISC-295 | read | README.md | Implemented, preflight design named | Read |

## Decisions

- 2026-07-19 (M3d, code-reviewer findings — all confirmed clean, none required a fix): verified verdict parity between the new deterministic checks and the previously-shipped LLM path against BOTH the captured M3a-live-verify output AND a fresh live re-run performed specifically to close this gap (see Verification): SC-28/SC-7 now render `code-determined:high` instead of `self-reported`, with identical `satisfied`/`not-satisfied` verdicts on both fixtures, zero LLM calls, evidence:1 each. Confirmed the preflight cannot be bypassed — the only production path is `cli/index.ts`'s `runLive` → `runAssessment()`, which always runs the preflight before the loop; `assessControl()`'s own defensive throw self-guards even a hypothetical direct call. Confirmed `MissingDeterministicCheckError`/`MissingDeterministicChecksError` are never caught-and-swallowed anywhere in `src/` — every catch block was read. Three sub-threshold notes accepted as documentation, not fixes: the fixture-modeling inconsistency between `endpoint.enableNetworkIsolation` and `network.enableNetworkIsolation` in `model-clean.json` is pre-existing and already documented (M3a); `checkSC28` keys solely on `keyManager` rather than also checking the KMS key ARNs, which is the intended discriminator and matches the control's own intent text.
- 2026-07-19 (M3d, silent-failure-hunter findings — 2 CRITICAL fixed, 1 MEDIUM documented-not-fixed, 1 LOW fixed, 1 test-only gap closed): **(1, CRITICAL, fixed)** `checkSC28`/`checkSC7` built hand-typed `Judgment` literals and returned them directly, never running them through `parseJudgment`/`validateCitations` the way every LLM-produced judgment is forced through — safe only because the two functions happen to be correct today, with zero runtime signal if a future edit introduced a mismatched cited id. Fixed at the root: added a `finalizeJudgment()` helper that both checks now route every return through, calling `parseJudgment` then `validateCitations` before the result leaves the function — the guard is now a structural property of the deterministic path, not something only the LLM path happens to get. **(2, CRITICAL, fixed)** both checks read fields off `unknown` evidence payloads via unguarded `as` casts; a malformed/unexpected shape (e.g. a real, non-fixture AwsProvider using different field names) would silently evaluate `undefined === "CUSTOMER"` as `false` and produce a confident, WRONG `not-satisfied` verdict — with a rationale literally containing the word "undefined" — instead of an honest `insufficient-evidence`. Fixed at the root: added `readStringField`/`readBooleanField`/`readStringArrayField` type-guarded readers and a `malformedEvidenceJudgment()` helper; both checks now route every field read through these and resolve to `insufficient-evidence` (never a silently-wrong `not-satisfied`) when a field is missing or the wrong type. New tests pin both cases directly (malformed `keyManager` as a number, malformed/missing `enableNetworkIsolation`). **(3, MEDIUM, documented not fixed)** `calledCollectors`/`citedCollectors` are hardcoded literals in each check function rather than derived from `control.collectors` — currently correct only because the YAML happens to match, and would silently diverge if the YAML's collector list for SC-28/SC-7 is ever edited without a matching code change. Traced the actual failure direction: `collectorsTagged` (denominator, YAML-driven) would grow while the numerator (hardcoded, code-driven) stays fixed, so `evidenceCoverage` would drop toward `medium`/`low`, NOT silently claim full coverage — this fails toward under-claiming confidence, not over-claiming it, which is the safe direction for an audit-readiness tool. Not fixed: deriving the counted collectors dynamically from what the check actually calls would require a larger refactor (each check would need to self-report which collector name it used, which it already implicitly commits to by being registered for that control) for a divergence that fails safe, not silent-wrong — logged as a known, low-priority, fails-safe gap rather than expanding this milestone's scope. **(4, LOW, fixed)** the reachable-in-practice preflight threw a bare untyped `Error` while the unreachable in-function defensive throw used the named `MissingDeterministicCheckError` class — a caller wanting to `instanceof`-catch specifically on "missing deterministic check" could only catch the dead path. Fixed: added `MissingDeterministicChecksError` (plural, aggregate) as a named, exported class, used by the preflight. **(5, test-gap, closed)** the "collector throws (vs. returns null) propagates uncaught and aborts the whole run" behavior was an explicit, already-documented M3d design decision (see the advisor-call Decision below, point 4) but had zero test pinning it — only the null-return path was tested. Added a direct test proving a collector throw propagates through `assessControl()` uncaught, confirming the documented choice is pinned, not incidental. **(6, 7, confirmed clean)** `isCodeDetermined`'s generalization was correctly applied at all 3 output call sites with no leftover assumption that a code-determined result is always zero-evidence/always-insufficient-evidence; the preflight covers the only production entry point, with test-only direct `assessControl()` calls correctly scoped to non-deterministic controls. **(8)** README staleness was already the tracked, unchecked ISC-295 — closed below, not a hidden gap. Full suite re-verified green after all fixes: 99 pass, 255 expect().
- 2026-07-19 (M3d, Rule 2 advisor call before BUILD — commitment-boundary, fail-loud vs. fallback): Advisor's verdict was unambiguous and reinforced by the project's own stated thesis: "deterministic action gates" and "audit readiness as a product" mean a silent LLM fallback for a missing deterministic check would produce a report *claiming* code-determination while actually LLM-judged — precisely the evidence-integrity defect this project exists to prevent. Fail-loud adopted, no fallback, no exception. Design refined per 7 further advisor points, all adopted: (1) preflight at the WHOLE-RUN level (not lazily inside `assessControl()`), aborting with the full list of missing IDs before any control — deterministic or not — runs, so a gap is caught before burning LLM calls on earlier controls in the same run; the in-function throw stays too, as a defensive invariant that should be unreachable given the preflight, never caught into a per-control error result. (2) `isCodeDetermined` becomes a pure derived function over `pattern`, not a stored/cached flag — structurally impossible to diverge, closing the exact naming-trap the M3c code-reviewer flagged for "whoever adds the next bypass." (3) three-outcome distinction (evidence-present-and-passing / evidence-present-and-failing / evidence-genuinely-absent) — `getKMSConfig`/`getEndpointNetworkConfig` returning `null` maps to `insufficient-evidence`, distinct from a present-but-failing evidence object mapping to `not-satisfied`; unreached by the current 2 fixtures but designed correctly per the advisor's point, not assumed away. (4) collector THROW (vs. null return) is left to propagate as a real error, not swallowed into a judgment — a throw signals an actual infra failure, distinct from null's "legitimately no evidence," and re-interpreting an infra failure as a judgment would itself be a silent-failure risk. (5) compile-time exhaustiveness via a literal `ControlId` union was considered and NOT adopted — `ControlItem.id` is a runtime string loaded from YAML in this codebase's existing type design (not a compile-time literal union anywhere), so the runtime preflight is the correct and only real guard; changing the broader ID-typing strategy just for this is out of scope. (6) judgment shape/rationale-prose parity with the LLM path — no report-rendering code branches on pattern beyond the already-scoped M3c label swaps. (7) scope capped at SC-28 and SC-7 only, per the advisor's own explicit flag that a 3rd/4th deterministic control "is where this starts eating the afternoon" — no other controls retagged.
- 2026-07-19 (M3a-live-verify): classifier returned MODE: MINIMAL for "okay, it's saved" (correct in isolation — reads as a simple acknowledgment). Escalated to ALGORITHM/E2 via the context-override rule since the conversation makes clear this is the trigger for the previously-promised deferred live-verification task, not a standalone acknowledgment. Result confirmed the escalation was correct — this closed 7 real ISCs with real API evidence, not a 2-word reply.
- 2026-07-19 (M3c, silent-failure-hunter finding — fixed): Q3 asked whether the new non-attestation callout's claim ("does not by itself mean human attestation is required") was itself an unsupported overclaim. It was: `Judgment.gaps` has no reason-code taxonomy, so the code cannot affirmatively rule out human involvement any more than it could affirmatively require it — and SA-10's own fixture `note` ("requires human attestation via a linked artifact") shows this codebase already treats "artifact" and "attestation" as adjacent, not disjoint, concepts. Fixed: narrowed the claim to what the code actually knows — "this pattern does not automatically require human sign-off [the way attestation-pattern controls do]," not a categorical denial. Other 3 findings (Q1: README stale — addressed by ISC-264 below; Q2: no signature-change breakage — confirmed clean, no fix needed; Q4: ISC-243 invariant holds, verified via direct code read not just trust — confirmed clean, no fix needed).
- 2026-07-19 (M3c, code-reviewer findings — both fixed): (1) `renderGaps`'s heading unconditionally read "#### Gaps / Requires Human Attestation" regardless of pattern or status — for the diff's own motivating case (a non-attestation insufficient-evidence control with gaps), this produced a direct in-section contradiction against the new callout's "does not require human attestation" text, and my own ISC-257 regression test missed it because its assertion checked lowercase "human" while the heading used "Human" (case mismatch let a real bug pass a green test). Fixed at the root: `renderGaps` no longer claims attestation at all — that claim belongs solely to `renderAttestationCallout` now, which is the one place status/pattern-aware attestation language should live. Updated the 2 existing tests that asserted the old heading text, and tightened ISC-257's assertion to a case-insensitive, heading-inclusive check so this exact class of bug (case-sensitive string match masking a real duplicate) can't recur silently. (2) The callout's own "see the gaps below" was directionally wrong (gaps render *above* the callout in block order) and could reference a gaps section that doesn't exist at all, since `judgment-validator.ts` doesn't require non-empty `gaps` for `insufficient-evidence`. Fixed: reworded to "if one is listed above" — accurate direction, no presupposition that gaps exist. Full suite re-verified green after both fixes: 81 pass, 210 expect(). Naming-trap note (not fixed, documented): `isCodeDetermined` returns true only for `attestation` even though `deterministic` sounds code-determined too — correct today (only `attestation` bypasses the LLM), but a latent trap for whoever eventually builds the deterministic-pattern bypass; flagged for that future slice's author to rename or re-derive rather than assume.
- 2026-07-19 (M3c, pre-existing test correction — expected, not a regression): the M2c-era test "renders both confidence values on two distinct lines for every control" asserted the literal string `"**Confidence (model self-reported):**"` for all 5 sample controls including SA-10. This is exactly the universal labeling M3c intentionally changes — SA-10's confidence is now correctly labeled "code-determined, attestation pattern." Fixed the test to check the pattern-aware label per control (SA-10 gets its own assertion), not weakened or deleted. Full suite confirmed still green after the fix (81 pass, 209 expect(), up from 77/200 M3b baseline). Grepped for any other pre-existing assertion of the literal "model self-reported" string against SA-10 specifically — none found; this was the only stale one.
- 2026-07-19 (M3c, Rule 2 advisor call before BUILD): Advisor confirmed `pattern` as the right single causal field but flagged that I was about to scatter `pattern === "attestation"` string-literal comparisons across 3 files for 2 semantically distinct questions (who authored the confidence number vs. what an insufficient-evidence verdict means) that only coincide today. Fixed the plan before writing code: two named predicates (`isCodeDetermined`, `usesAttestationCallout`) in `types.ts`, imported everywhere, one edit site if/when `AgentPattern` gains a member that decouples them (ISC-238-240). Two commit-blocking gaps both verified false in the current codebase, not assumed: (1) "declared vs. executed pattern" divergence — grepped `agent.ts` for fallback/catch logic around pattern dispatch; the only try/catch wraps collector-execution errors, unrelated; the single `if (control.pattern === "attestation")` check is the only pattern-runtime-branch that exists, so `control.pattern` and "how the result was actually produced" are provably identical today (ISC-243) — flagged to re-verify when the still-undesigned deterministic-bypass slice lands, since THAT slice is exactly the kind of change that could introduce a real fallback. (2) "deserialization bypasses TypeScript" — grepped for `as ControlResult`, `Partial<ControlResult>`, and `JSON.parse` casts project-wide: zero matches, no persistence/reload path exists for `ControlResult`, so making `pattern` a required field is safe without a migration concern. Non-attestation callout text (ISC-246) deliberately kept generic per advisor's point 3 — `Judgment` has no reason-code field distinguishing tool-error/unreachable-source/genuine-gap, so the new text does not claim a specific cause (e.g. "missing artifact") it cannot support from the data available. Advisor's recurring stale-`cv-prose-final-pass`-context flag checked and dismissed again. Proceeding to BUILD.
- 2026-07-19 (M3b, code-reviewer finding — no code change needed, confirmed correct): Traced the bypass judgment against `parseJudgment`/`validateCitations` and confirmed it is byte-for-byte what an equivalent LLM-submitted-and-validated judgment would produce — skipping the validators loses nothing since the object is hand-constructed to their exact output contract. Critically re-checked whether the new tests could pass with a broken bypass: `makeCountingLlm.complete()` both counts AND throws, so if the `pattern === "attestation"` gate ever broke, the loop would fall through to a real LLM call, the mock would throw, and the test would fail before any assertion ran — the tests genuinely prove absence, not just count it. Two sub-threshold notes accepted as documentation-only, not fixes: (1) ISC-230's provider-call assertion is belt-and-suspenders given the LLM mock already throws first in any broken-bypass scenario — the independent-coverage framing in ISC-230's wording overstates it slightly, noted here rather than rewording the ISC after the fact; (2) a misconfigured attestation control with non-empty `collectors` (ISC-233's synthetic case) would render `coverageConfidence: "low"` next to the bypass's hardcoded `confidence: "high"` in the narrative — cosmetically inconsistent but not reachable in the shipped fixture (SA-10 has `collectors: []`), same disposition as the finding below.
- 2026-07-19 (M3b, silent-failure-hunter findings — one fixed, rest documented and deferred): (1, **fixed**) `assessment-runner.test.ts`'s pre-existing "vacuous case: zero tagged collectors (attestation pattern)" test built a full mock `LlmProvider` simulating the *old* LLM-driven attestation path — with the bypass now in place, that mock is never invoked, so the test kept passing for the right coverage-math reasons but no longer proved what its own construction implied (that the LLM path produces this result). Fixed at the root: the mock now throws if ever called (matching the `agent-loop.test.ts` counting-mock pattern), so a bypass regression fails this test loudly too, not just silently continues on a stale premise. Re-ran full suite after the fix: still 77 pass / 200 expect(), zero regressions. (2, **documented, not fixed — same bucket as M3a's Finding 2**) `narrative.ts`, `oscal-ar.ts`, and `cli/index.ts` all unconditionally label `judgment.confidence` as "model self-reported" — true for every LLM-produced judgment, but now literally false for a bypass-produced one (the `confidence: "high"` in `agent.ts`'s bypass is a code literal, chosen because the *classification* is deterministic, never touched by an LLM). None of these three files were modified by this diff; fixing this requires the same pattern-provenance-awareness change flagged in M3a's Decisions (add `pattern`, or an "authored by LLM vs. code" flag, to `ControlResult` and thread it through 3 output files + their test fixtures) — reinforcing that this is a real, recurring architectural gap, not a one-off, and belongs to that same future slice rather than being patched twice in two different shapes. (3, **documented, cosmetic, not fixed**) `renderGaps()` and `renderAttestationCallout()` both fire for every bypass result (ISC-223 guarantees non-empty `gaps`, status is always `insufficient-evidence`), producing two adjacent "requires human attestation" blocks in the narrative. This was already *possible* under the old LLM-driven path (the deleted prompt paragraph instructed the same gaps text) — the diff makes it deterministic rather than merely likely, not a new failure mode. Accepted as redundant-but-harmless; a conscious sign-off, not an oversight. (4, **noted, pre-existing, out of scope**) `oscal-ar.test.ts` has zero SA-10-shaped fixture coverage at all — narrative.test.ts covers the attestation-callout rendering but the OSCAL writer's attestation-finding output has never been directly tested, LLM-path or bypass-path. Pre-existing gap, not introduced by this diff; worth a future test addition, not blocking. (5, confirmed clean) `EvidenceStore` has no delete/clear method — "fresh vs. used-then-emptied" is not a reachable state in this codebase, so `new EvidenceStore()` in the bypass is structurally identical to what the old path produced for SA-10's real fixture. No divergence risk. (6) grepped `iterations`/`MAX_ITERATIONS` project-wide: nothing assumes any control makes ≥1 LLM/collector call; the only live-API tests (`agent.test.ts`, `ANTHROPIC_API_KEY`-gated, currently skipped) exercise `SI-6(1)` only, never SA-10 — unaffected by the bypass.
- 2026-07-19 (M3b, Rule 2 advisor call before BUILD): Advisor confirmed both design choices (gate on `pattern` not `collectors.length===0`; `confidence: high`) as correct, and flagged 5 things to resolve before BUILD: (1) attestation-pattern control with non-empty `collectors` — resolved as a deliberate design position, not a gap: human attestation is not evidenced by *any* amount of AWS API data (that's the entire premise of the `attestation` pattern), so even a misconfigured attestation control with tagged collectors should never run them — codified as ISC-225/233, not left implicit. (2) "existing attestation state" (could a prior human sign-off be recorded and short-circuit differently) — confirmed via code read there is no such mechanism anywhere in the codebase today (no linked-artifact resolution, no attestation-record field); SA-10's own `note` field already anticipates this as a *future* mechanism ("via a linked artifact"), not a present one — out of scope for this bypass, not silently ignored. (3) ordering/side-effect purity — grepped `iterations` across `cli/index.ts`, `assessment-runner.ts`, `narrative.ts`, `oscal-ar.ts`: tracked on `ControlResult` but rendered nowhere (same "not yet load-bearing" status as `collectorsCalled`/`collectorsCited` from M2c), so `iterations: 0` breaks no downstream rendering assumption. (4) prompt dead-paragraph removal — grepped for other `buildSystemPrompt` callers and for test assertions on the specific instruction text: exactly one caller (`agent.ts`), zero snapshot/string tests reference that paragraph, safe to delete. (5) negative-assertion tests — accepted directly, ISC-229/230/233 are written as call-count assertions on mocks, not judgment-shape checks alone, per the advisor's explicit point that a shape-only test would pass even if the bypass silently didn't bypass. Advisor's recurring stale-`cv-prose-final-pass`-context flag checked and dismissed again — this session has read mlassure's real files directly throughout. Proceeding to BUILD.
- 2026-07-19 (M3a, code-reviewer finding — applied): SC-7's `intent` prose asserted "no judgment required" but its own binary reduction ("network isolation enabled with a VPC present, or not") silently dropped the security-groups condition its first sentence named — a target with isolation+VPC but zero security groups would have been genuinely ambiguous for a `deterministic`-pattern control that claims to need none. Also noted `ISC-196` itself (my own acceptance criterion) had the identical omission. Fixed both: the `intent` now explicitly enumerates all 3 required conditions as an all-or-nothing check, and `ISC-196`'s wording was updated to match rather than left silently inconsistent with the corrected intent. Minor finding (SC-28/network-isolation domain nuance — `enableNetworkIsolation` technically means "no network access," arguably in tension with "runs inside a VPC") accepted as a known fixture-modeling simplification, not fixed — matches the project's existing precedent of not chasing every AWS-domain nuance in a teaching/demo fixture (e.g. bias monitor schedule-only data, already accepted at M3a IterativeDepth stage).
- 2026-07-19 (M3a, silent-failure-hunter findings — both documented, NEITHER fixed this milestone, see rationale): The review surfaced two real, verified gaps in already-shipped M1/M2 machinery that M3a's new controls are the first to make load-bearing (not caused by the YAML addition itself, which the code-reviewer separately confirmed is correct). **Finding 1 (CA-7 array-coverage blind spot):** `evidenceCoverage`/`coverageConfidence` (M2c) track coverage per collector NAME, not per evidence ITEM. `getModelMonitorSchedules` returns one `RawEvidence` per monitor (3 items on the clean fixture, 1 on stale) — citing just ONE of the 3 clean-fixture monitor items is enough to mark `getModelMonitorSchedules` fully cited and drive `coverageConfidence` to `"high"`, even if the agent silently ignored 2 of 3 monitors' status. CA-7's own intent explicitly requires checking *every* monitor — the first control in the project whose correctness genuinely depends on item-level completeness, not just collector-level. Root cause is in `assessment-runner.ts`'s coverage formula (M2c, already shipped), not in the M3a YAML. **Finding 2 (RA-3 narrative mislabeling):** `narrative.ts`'s `renderAttestationCallout` fires "**Requires human attestation**" for ANY `status === "insufficient-evidence"` judgment, regardless of `pattern`. SA-10 (`attestation` pattern) is genuinely human-attestation-only, so the callout is correct there. RA-3 (`synthesis` pattern) reaching `insufficient-evidence` on the stale fixture means "no model card artifact exists yet" — a documentation gap, not something requiring a human reviewer's sign-off — but the narrative would tell an auditor to seek human attestation anyway, misdirecting remediation. Root cause is `renderAttestationCallout`'s status-only branch (pre-existing, M2b-era code) not accounting for `pattern`; `oscal-ar.ts`'s `findingRemarks` has the analogous status-only gap. **Disposition — documented, not fixed:** Both are real defects in already-shipped code, but neither is the small, self-contained "one missing runtime check" shape that justified the M2b `judgment-validator.ts` root-cause fix. Finding 1 requires a structural rework (item-level coverage tracking) that is squarely the "pattern differentiation in loop mechanics" question Jose explicitly declined as this session's M3 slice (chose M3a — control coverage — over that option at the AskUserQuestion gate). Finding 2 requires adding `pattern: AgentPattern` to `ControlResult` and threading it through `assessment-runner.ts` → `narrative.ts`/`oscal-ar.ts`, a type-and-call-site change across 3+ files with its own test-fixture migration (the M2c `fixture-migration` precedent) — not a same-file, same-function fix. Expanding M3a's code scope under delegation-review pressure, past its own declared `ISC-199` zero-code-diff anti-criterion, without Jose's sign-off, would repeat exactly the scope-creep this project's Decisions log has repeatedly and deliberately avoided (see M2c's "collectorErrors field... logging it as a flagged future-work item rather than expanding this milestone's scope"). Both findings are fully written up here with file:line-level detail (see the delegation-review agent output, condensed above) so they're actionable as a concrete next-M3-slice candidate, not lost. **Practical consequence for M3a's claims:** CA-7's `coverageConfidence: "high"` cannot yet be trusted as proof all monitors were checked; RA-3's narrative output will read as human-attestation-required on the stale fixture when the real gap is a missing artifact. Both are disclosed in the README's M3a Implemented-ledger entry.
- 2026-07-19 (M3a, Rule 2 advisor call before BUILD): Advisor raised 3 substantive checks before committing. All verified directly against source, not assumed: (1) verdict-scoping — `assessControl()` (`src/agent/agent.ts`) creates a fresh `EvidenceStore` per call and `assessment-runner.ts` calls it once per control in a loop; judgment is driven by the LLM reading the control's `intent` text, not by collector identity, so SI-6(1) and CA-7 sharing `getModelMonitorSchedules` with differently-worded intents is safe — not collector-memoized. (2) null-collector handling — confirmed `FixtureProvider.getModelCard` returns `Promise<RawEvidence | null>` (bare `null` when `fixture["modelCard"]` is null, no throw), and `agent.ts`'s executor path does `result != null ? [result] : []`, so a null return degrades gracefully to zero stored evidence items with no error — the LLM sees genuinely empty tool output and must reason from that, exactly the mechanism RA-3's conditional-insufficiency design depends on. (3) SC-7 double-insufficiency risk — checked `model-stale.json`'s `network` object directly: it is NOT null, it's a real (negative) evidence object (`vpcId: null, enableNetworkIsolation: false` inside a present `network` key), so `getEndpointNetworkConfig` returns real evidence on both fixtures — SC-7 will resolve to `satisfied`/`not-satisfied`, never `insufficient-evidence`, keeping RA-3 as the sole conditional-insufficiency case as designed. Advisor's stale-context hygiene flag (unrelated `cv-prose-final-pass` state) checked and dismissed — this session has read mlassure's actual files directly throughout, not relied on stale auto-synthesized state. Proceeding to BUILD.
- 2026-06-25 (M2c, Rule 2/3 advisor exchange — two calls): First advisor call raised 6 concerns. Disposition: (1) "denominator shrinks on not-attempted" was a misread of my own description — the denominator is always `control.collectors.length`, static, never runtime-adjusted; the PARTIAL-1 test already covers the "skip the inconvenient collector" attack the advisor was worried about, since calling-fewer-and-citing-all-of-what-you-called is exactly what that test pins at 0.5/medium, never 1.0/high. (2) Re-deriving the advisor's "ratio could exceed 1.0" concern myself (rather than trusting its exact framing) found a REAL bug: `isKnownCollector()` checks the global executor map, not `control.collectors` — fixed in `agent.ts` (both `calledCollectors` and `citedCollectors` now require tagged-set membership), with a new test proving an untagged collector's call+citation is excluded and coverage stays exactly 1.0. (3) Boundary-threshold concern doesn't apply — there are no graduated numeric cutoffs, only `ratio===1`/`ratio===0` exact checks (float-safe for integer-ratio operands per the advisor's own confirmation) and a single `medium` bucket for the open interval, which Jose explicitly chose over a finer-grained alternative. (4) Fixture-assertion concern doesn't apply — new tests assert on the actual coverage values, not just shape. (5) Accepted as fair: the anti-gaming tests are concrete illustrative cases, not property-based proofs — consistent with this codebase having no property-based testing anywhere, not manufacturing a new test paradigm for one case. Second advisor call (Rule 3 re-call, citing Essay 1 line 54 + the already-shipped SA-10 precedent for the high-vs-low question) resolved into a narrower technical bar — "is the zero-tagged case a deliberate decision with a guard and a test, or an accident that falls through to NaN/medium" — which is already true and already shipped: `evidenceCoverage` uses an explicit ternary (`collectorsTagged === 0 ? 1 : ...`), `deriveCoverageConfidence` checks `collectorsTagged === 0` before any ratio comparison, and the existing vacuous-case test asserts `Number.isNaN(result.evidenceCoverage) === false`. Grepped both test files to confirm no prior test exercised an out-of-tagged-collector call before the new one — the >1.0 bug was real but untested, not silently masked by an existing passing assertion. Full suite 71→72, zero regressions.
- 2026-06-25 (M2c, silent-failure-hunter findings): (1, applied) `deriveCoverageConfidence` fell through to `"medium"` for `NaN`/`Infinity`/out-of-range input with no validation — currently unreachable through the real pipeline (confirmed: the only caller passes a `Set.size`-derived ratio with an explicit zero-tagged guard), but a silent default for corrupted numeric input contradicts the project's own fail-loud ethos and would silently inherit into the next formula change. Fixed: explicit `Number.isFinite`/range check that throws a named error; exported the function and added 6 direct unit tests (3 valid-bucket cases, 4 throw cases). (2, already covered) duplicate-collector denominator — already fixed earlier this session per the code-reviewer's identical finding; the silent-failure-hunter's own probe independently confirmed the fix closes it, and noted no regression test existed — it does (the `DUP-1` test added alongside the fix). (3, applied — minimal scope) a duplicate evidence id across two different collectors throws inside `EvidenceStore.add`, caught generically in `agent.ts` and fed back to the model as a tool-result string with zero operator-visible log — a real, currently-reachable gap (a future live-AWS provider with a non-random id scheme could trigger it). Fixed the acute part: the specific `"Duplicate evidence id:"` error class now gets a loud `console.error` naming the control and collector, distinguishing a provider/collector data-integrity defect from an ordinary "AWS call failed" error. Did NOT implement the fuller suggestion (a new `collectorErrors` field on `ControlResult`, surfaced into OSCAL remarks/narrative) — that's a more general evidence-collection-error-visibility feature that predates and outlives M2c specifically; logging it as a flagged future-work item rather than expanding this milestone's scope. (4, confirmed correct, test added) duplicate `evidenceCited` entries don't double-count toward coverage — `citedCollectors` is already a `Set`; added a regression test pinning this explicitly since no existing M2c test exercised it. (5, applied) added a doc comment in `cli/index.ts` naming the cross-file validation dependency that makes the `padEnd(7)` formatting safe, so a future change to the confidence union doesn't silently degrade alignment with nothing to catch it.
- 2026-06-25 (M2c, code-reviewer findings — both applied): (1) `collectorsTagged` used `control.collectors.length` (raw array length) while `collectorsCalled`/`collectorsCited` are `Set.size` — a duplicate entry in a control's tagged collector list (e.g. a YAML authoring mistake) would inflate the denominator and silently under-report genuinely full coverage as `0.5`/`medium`. Fixed: `collectorsTagged = new Set(control.collectors).size`, matching every other count in the design. New regression test (`DUP-1`) pins this. (2) `calledCollectors`/`collectorsCalled` is fully computed and plumbed but never read by any output (OSCAL/narrative/CLI) — confirmed deliberate (the called-vs-cited gap is reserved for a future divergence-analysis pass, per the M2a/M2b precedent of keeping diagnostic signal even when not yet load-bearing), but the type lacked a comment saying so. Added one, so the next reader doesn't assume it's already wired up.
- 2026-06-25 (M2c, Cato/ISC-192): Cato confirmed codex/GPT-5.4 returns 401 on this machine — the genuine cross-vendor audit is infrastructurally unavailable, consistent with standing decision `codex-forge-not-available.md`. Verdict recorded as `skipped`, not `fail`/`concerns` — not a blocker. Did not chase Cato's offered same-family fallback review since it runs on an Anthropic-family model (Opus) and would be redundant with the code-reviewer/silent-failure-hunter passes already run, not a substitute for genuine cross-vendor coverage.
- 2026-06-25 (M2c, three sign-off decisions confirmed by Jose before EXECUTE): (1) CLI one-liner's `conf:` field is now `coverageConfidence`, with `judgment.confidence` kept visible as `self-reported:` on the same line, never dropped. (2) Narrative renders both confidence values as two always-present lines (`**Confidence (evidence coverage):**` / `**Confidence (model self-reported):**`), never a silent single-value swap. (3) Bucketing thresholds used as planned: ratio===1→high, 0<ratio<1→medium, ratio===0 (tagged>0)→low, tagged===0→high (vacuous).
- 2026-06-25 (M2c, FirstPrinciples Deconstruct/Challenge/Reconstruct): the coverage ratio (`citedCollectors.size / control.collectors.length`) is uniform-weighted — every tagged collector contributes equally to "how much of what's required." Classified this explicitly: the no-self-report / coverage-not-self-assessment / vacuous-empty-set / cited-not-just-retrieved rules are HARD constraints (directly stated or directly implied by the published essay and the already-shipped SA-10 example); "required = `control.collectors`" is a SOFT constraint (inherits whatever the control author tagged, not a physical fact); the uniform-ratio formula itself is an ASSUMPTION, not a necessity — a future per-collector-weighted variant remains available if a control author ever needs "this one piece of evidence matters more," but building that now would solve a problem the essay never posed, on schema data (`control.collectors`) that doesn't carry weights yet. Decision: ship the uniform ratio; weighting is deliberately out of scope, not overlooked.
- 2026-06-25 (M2c): coverage mechanics (`calledCollectors`/`citedCollectors`) computed in `agent.ts` (evidence mechanics, where collector identity is in scope); bucketing policy (`evidenceCoverage`/`coverageConfidence`) computed in `assessment-runner.ts` (presentation-ready shaping, same layer as the existing `citedEvidence` precedent from M2a) — keeps `agent.ts`'s return contract about raw signal, not display policy. This split was a Plan-agent recommendation during the plan-mode design pass, adopted as-is.
- 2026-06-25 (M2c): `Judgment.confidence` (self-reported) and the `submit_judgment` schema are unchanged — `evidenceCoverage`/`coverageConfidence` are purely additive fields on `ControlResult`. Preserves the model-self-report-vs-derived-coverage divergence as a measurable signal for a future essay, and avoids a breaking change to every hand-built `Judgment`/`ControlResult` fixture across the test suite for a problem additive fields solve just as well.

- 2026-06-25 (M2a commit): Stray `.DS_Store` was tracked-but-uncommitted in the working tree; added `.DS_Store` to `.gitignore` and removed the file as part of the M2a commit rather than carrying the cleanup into M2b's diff.
- 2026-06-25 (M2b, code-reviewer finding — applied): the test fixture exercised only `satisfied`/`partially-satisfied`/`insufficient-evidence`; `not-satisfied` and `not-applicable` had zero test coverage, and "Not Satisfied" is the one label that contains the substring "Satisfied" — exactly the case most likely to leak a status-mapping regression. Fixed by adding `SC-7` (not-satisfied) and `AC-2` (not-applicable) to the fixture and asserting the exact heading string, not a loose substring.
- 2026-06-25 (M2b, silent-failure-hunter finding — applied, narrative.ts scope): found that an unrecognized `Judgment.status` would silently render `"undefined undefined"` in an auditor-facing heading (direct `Record` index has no runtime guard); an empty `rationale` rendered an invisible blank gap; an empty-string `gaps` entry rendered a content-free `- `; and a missing `controlSetVersion` with no `controlSet` argument rendered the literal string `"undefined"`. All four are now guarded directly in `narrative.ts`: `statusLabel()`/`statusIcon()` throw a named error naming the control rather than rendering a guess; empty rationale/gap strings render an explicit `[MISSING: ...]` marker; missing control-set version renders an explicit `UNKNOWN (...)` marker. Four new tests pin this behavior (17 narrative tests total).
- 2026-06-25 (M2b, silent-failure-hunter finding — applied, cli/index.ts scope): `runLive`'s `--oscal`/`--narrative` writes were uncaught `writeFileSync` calls relying entirely on the outermost `main().catch()`, so a partial-write failure (e.g. OSCAL written, narrative write then fails) gave no explicit confirmation of which artifact actually exists on disk. Each write is now wrapped individually; a narrative-write failure's error message explicitly states the OSCAL file was already written, if it was.
- 2026-06-25 (M2b, silent-failure-hunter finding — initially flagged-not-applied, then reversed after the Rule 2 advisor call): the root cause is in already-shipped M1 code — `src/agent/agent.ts:69` did `const raw = block.input as Judgment`, a bare type assertion on the LLM's raw tool-call JSON with zero runtime validation. My first instinct was to flag this to Jose rather than touch M1. The advisor pushed back hard and correctly: building `narrative.ts`'s defense-in-depth (a silent-failure-hunter-driven fix) while knowingly leaving the *actual* silent-failure boundary unguarded was internally inconsistent with the run's own stated intent — "fix the symptom while flagging the cause" doesn't hold when the cause is a small, well-scoped mechanism gap, not a design-policy question. Reversed course: added `src/guard/judgment-validator.ts` (`parseJudgment(raw, controlId)`, `JudgmentShapeError`) as a sibling to `citation-guard.ts`, validating status/confidence/rationale/evidenceCited/gaps/controlId shape and throwing a named, control-identifying error on any violation — wired in at `agent.ts:69` before the citation guard runs. This changes behavior ONLY for previously-malformed inputs (every currently-passing live-API test and CLI run is unaffected, confirmed by re-running the full suite and two live CLI assessments after the change) — so it is a defect fix at the ingestion point, not a redesign of a working feature. The one piece still genuinely Jose's call — what to *do* on an invalid judgment (throw vs. coerce-to-default vs. drop-and-log) — was resolved by following the existing codebase convention: `CitationError` already throws and lets it bubble to `main().catch()`; `JudgmentShapeError` does the same, for consistency, not because the policy question was mine to skip silently.
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

- 2026-07-23 (TODO-oscal-validate): conjectured (M2a, 2026-06-24): the OSCAL writer was conformant — 40+ tests covering structure, status mapping, props, and observations all passed, and the only acknowledged gap was the formality of running an external validator someday. refuted by: NIST's official schema failed the writer ON FIRST CONTACT, twice — token-illegal control ids in every finding target and reviewed-controls entry, and minItems-violating empty observations arrays. Neither failure was exotic; both sat in the document's most-traversed paths for a month while the self-authored suite stayed green, because every test asserted what the writer DID, not what the spec SAYS. learned: (1) a DEFERRED-VERIFY against an external oracle is not a formality-shaped tail item — it is the only test class that can catch spec-vs-implementation divergence, and its expected-finding rate should be treated as HIGH, not low, precisely when the self-authored suite is large (more tests pinning observed behavior = more confidence in the wrong thing). (2) When conformance fixes force updates to existing tests, the spec-authored assertion block must be written FIRST — the 13 tests updated to the new target-ids would otherwise have been re-pinned to output again, reproducing the original failure mode one layer up. (3) External-oracle checks should be pinned into the repeatable suite (vendored + hash-locked schema) rather than run once and closed — a one-off `oscal-cli validate` would have gone stale on the next writer change. criterion now: ISC-104 [x]; ISC-422..432 added and passing; standing rule for this project: any output format with a published external schema gets that schema vendored, hash-pinned, and validated in the suite from the first slice, not deferred.

- 2026-07-23 (M3g): conjectured: a custody verifier whose WRITER is rigorously fail-loud (manifest-last, non-empty-dir refusal, UUID gates) inherits that rigor — verifying "what the writer produces" felt equivalent to verifying "what's on disk." refuted by: both reviewers showed the verifier consumes UNTRUSTED input the writer never produces — an empty-files manifest passed all three checks vacuously ("OK — 0 files verified" on a gutted bundle), absolute/`..` manifest paths would have turned verification into an arbitrary-file read primitive, and manifest metadata sat outside the rootHash so unsigned verification called a targetName-swapped bundle "intact"; my own cosign test had silently encoded that last gap by relying on the signature to catch the exact tamper the hash layer missed. learned: (1) a verifier's threat model is the ATTACKER'S output space, not the writer's — every "the writer never produces this shape" is precisely the shape the verifier must reject as proof of tampering, which inverts the usual reuse instinct (writer invariants are the verifier's VIOLATION list, not its trust assumptions). (2) When a test for layer B (signature) catches a tamper that layer A (hash) should also catch, that's not defense-in-depth — it's layer A's gap wearing layer B's coverage; check each layer catches its own class alone. (3) The M3f consumption-point-guard lesson generalized within one day: loader→renderer then, writer→verifier now — same shape, "the component that CONSUMES a data structure must enforce its invariants itself." criterion now: ISC-415..421 added and passing; standing question for any future verify-anything surface: "what input could reach this that the legitimate producer can never emit, and does each check fail on it alone?"

- 2026-07-22 (M3f): conjectured: pre-BUILD advisor rigor (five design decisions locked before code, including the explicit "origin-only fixture proves almost none of the invariants" test-design principle) plus per-invariant synthetic tests would leave delegation review little to find — the sixth slice testing whether front-loaded design review can substitute for post-build hunting. refuted by: the hunter found 8 real findings anyway, including two empirically-confirmed HIGHs where BOTH output renderers would emit literal `undefined` into auditor-facing artifacts on loader-bypassing input — and the sharpest instance: my own narrative doc comment named the exact `undefined →` failure, guarded it only at index 0, and my own regression test asserted `not.toContain("undefined")` for the origin case only, staying green while the migration-record variant of the same defect was live. The advisor call and the hunter caught disjoint gap classes AGAIN (design-level: origin format, historical-pattern registry trap; implementation-level: consumption-point guards, unknown-key discards) — sixth consecutive slice confirming the pattern. learned: (1) when a doc comment says "X can never happen," that sentence is a test specification — every variant of X it implies must have an assertion, not just the variant that prompted the comment; a guard plus a comment plus a partial test is precisely how a defect hides in green. (2) The recurring "outputs trust loader invariants on a plain type" category now has a named, reusable fix shape: an exported `assert<Thing>Shape()` guard at every consumption point, shared by all consumers so they can never disagree on invalid input (the narrative/OSCAL disagreement on the identical empty array — dangling header vs. silent normalization — is the tell that consumption-point validation is missing). criterion now: ISC-366..369 added and passing; the consumption-point-guard shape is the standing pattern for any future field added to ControlResult that carries loader-enforced invariants.

## M3 Features (M3e)

| name | description | satisfies | depends_on | parallelizable |
|------|-------------|-----------|------------|----------------|
| dockerfile | multi-stage Dockerfile: deps stage (production-only install) → minimal runtime stage | ISC-296..310 | none | no |
| dockerignore | `.dockerignore` excluding `.env`/`.env.*`/`.git`/`node_modules`/dev-only files | ISC-311..313 | none | yes |
| static-verification | no-secrets-baked-in checks, syntax review, ENTRYPOINT ergonomics check — everything verifiable WITHOUT a Docker install | ISC-314..320 | dockerfile, dockerignore | no |
| deferred-build-checklist | exact commands for the future build/run verification, written into ISA now | ISC-321..322 | static-verification | no |
| readme-docker-quickstart | Docker quick-start section, output-mount pattern, permission escape hatch | ISC-323..326 | deferred-build-checklist | no |
| delegation-review-m3e | code-reviewer + silent-failure-hunter (Cato attempted, E4-mandatory) | ISC-327..329 | readme-docker-quickstart | no |

## M3 Criteria (M3e — Docker packaging)

**Dockerfile (multi-stage)**
- [x] ISC-296: `Dockerfile` exists at repo root with 2 named stages (`deps`, `runtime`)
- [x] ISC-297: both stages pin the SAME exact `oven/bun` image variant and version tag (Anti: no mixing slim/alpine across stages — advisor-flagged libc mismatch risk)
- [x] ISC-298: the version tag is exact (`1.2-slim`), never `latest` — supply-chain reproducibility
- [x] ISC-299: `deps` stage runs `bun install --frozen-lockfile --production` (devDependencies excluded from the runtime image) — **empirically confirmed** (not just designed): ran the exact command against this repo's real `package.json`/`bun.lock` in an isolated directory (Bun 1.3.9, locally installed even though Docker isn't) — `typescript`/`@types/bun` absent, `@anthropic-ai/sdk`/`yaml` + transitive deps present, exactly as intended
- [x] ISC-300: `COPY` for the lockfile uses a glob tolerant of either `bun.lock` (text, confirmed present) or `bun.lockb` (binary, older Bun) — Anti: a literal `COPY bun.lockb ./` would hard-fail against this repo's actual `bun.lock`
- [x] ISC-301: `runtime` stage does NOT create a custom user — uses the `oven/bun` image's existing `bun` user (uid 1000), per advisor: creating a second user would collide
- [x] ISC-302: the output directory (`/out`) is created and `chown`'d to `bun:bun` BEFORE the `USER bun` switch — advisor-flagged silent runtime permission failure otherwise
- [x] ISC-303: `ENV HOME=/home/bun` set explicitly after the chown, before `USER bun` — **empirically confirmed** by silent-failure-hunter fetching `oven/bun`'s actual upstream Dockerfile source (`oven-sh/bun` repo) and verifying it runs `useradd bun --uid 1000 --gid bun --create-home`, which creates `/home/bun` owned by `bun:bun` by Debian default — no longer an unverified assumption
- [x] ISC-304: every `COPY` that the app touches at runtime uses `--chown=bun:bun`
- [x] ISC-305: `ENTRYPOINT` uses exec form (`["bun", "run", "src/cli/index.ts"]`), matching the ACTUAL `dev` script in `package.json` (`bun run src/cli/index.ts`, confirmed no `--watch`/`--hot`) — Anti: shell form would break exit-code/signal propagation; a `--watch` script would hang forever
- [x] ISC-306: `CMD ["--help"]` present — **entrypoint/arg-passing shape empirically confirmed** (not just designed): silent-failure-hunter ran `bun run src/cli/index.ts --help` / with no args / with `assess --controls ... --target ...` locally (Bun 1.3.9) and confirmed Docker's ENTRYPOINT+CMD-replacement semantics produce exactly this invocation shape — `docker run mlassure assess ...` will correctly forward to `parseArgs()`. Residual caveat: tested against Bun 1.3.9, not the pinned `1.2-slim`; `bun run <file> <args>` forwarding has been stable across versions but wasn't tested against the exact pin.
- [x] ISC-307: no `EXPOSE` directive — confirmed via grep, zero matches (IterativeDepth finding)
- [x] ISC-308: `ANTHROPIC_API_KEY` never appears as a build-time `ARG`, and never as an `ENV <key>=<value>` with an actual value baked in — confirmed via grep, zero matches
- [x] ISC-309: `fixtures/` is copied into the image via an explicit `COPY --chown=bun:bun fixtures ./fixtures`
- [x] ISC-310: Anti: confirmed via `Read` that the ONLY `bun install` in the file is the `deps` stage's `--production` one; no bare `bun install` anywhere in the runtime stage

**`.dockerignore`**
- [x] ISC-311: excludes `.env`, `.env.*`, `.env.local` — confirmed via `Read`
- [x] ISC-312: excludes `.git`, `node_modules`, `dist` — confirmed via `Read`
- [x] ISC-313: excludes `demo/`, `**/*.test.ts`, `ISA.md` — dev-only files not needed at runtime. Correction during delegation review: `.dockerignore` excludes files from the build context sent to the daemon entirely, so it DOES affect explicit `COPY src ./src` targets, not just a broad `COPY . .` — my original ISC-313 note claiming it was "not load-bearing given the explicit-COPY design" was itself wrong and has been corrected. The original `*.test.ts` glob (no `**/`) additionally excluded zero files regardless, since `.dockerignore` uses Go `filepath.Match` which does not cross `/`, and every test file in this repo is nested under `src/` — code-reviewer finding, fixed.

**Static verification (no Docker install required)**
- [x] ISC-314: `Read`/`Grep` of the Dockerfile confirms zero occurrences of `ARG ANTHROPIC` or `ENV ANTHROPIC_API_KEY=` with a literal value
- [x] ISC-315: `grep -rn "sk-ant-" fixtures/` → zero matches, confirmed BEFORE writing the `COPY fixtures` line, not after
- [x] ISC-316: `.dockerignore` content read back and confirmed to contain all of ISC-311/312
- [x] ISC-317: Dockerfile read line-by-line against Docker's documented instruction grammar — stated honestly as manual review; confirmed no `hadolint` or any Dockerfile linter installed on this machine, so no automated validation was possible or claimed
- [x] ISC-318: `package.json`'s actual `dev` script (`"bun run src/cli/index.ts"`) quoted directly from `Read` output in the Decisions entry — not assumed from memory
- [x] ISC-319: the lockfile's actual filename (`bun.lock`) confirmed via `ls -la` and quoted in the Decisions entry
- [x] ISC-320: Anti: confirmed via `Grep` that neither the Dockerfile, `.dockerignore`, `ISA.md`'s M3e section, nor the new README Docker section claims the image has been built or run — the README section opens with an explicit "designed, statically verified, build/run NOT yet tested" status line

**Deferred build/run checklist (written now, run later)**
- [x] ISC-321: exact command sequence written into `## Verification` below (`docker build`, `docker history | grep -i anthropic`, `docker run env | grep -i anthropic`, `docker run id`, a mounted-volume live run, `ls -l` on output)
- [x] ISC-322: checklist lives in `## Verification` (durable, this file) and is also referenced from the new README Docker section, so a future session finds it from either entry point — follow-up tagged `TODO-m3e-docker-build-verify`

**README Docker quick-start**
- [x] ISC-323: "Docker" section added with `docker build`/zero-setup fixture-demo run command, parity with the existing bun quick-start section's structure
- [x] ISC-324: output-volume-mount pattern documented (`-v "$(pwd)/out:/out"`) with a real example command including `--oscal`/`--narrative` flags
- [x] ISC-325: documents the bare `-e ANTHROPIC_API_KEY` form (no `=value`), not `-e ANTHROPIC_API_KEY=...`
- [x] ISC-326: documents the `--user "$(id -u):$(id -g)"` escape hatch for host-bind-mount permission mismatches

**Delegation review**
- [x] ISC-327: code-reviewer agent review invoked, findings recorded in Decisions
- [x] ISC-328: silent-failure-hunter agent review invoked, findings recorded in Decisions
- [x] ISC-329 (E4-mandatory): Cato cross-vendor audit attempted before `phase: complete` — skipped (tooling error, consistent with standing decision `codex-forge-not-available.md`), not a blocker, disposition recorded in Decisions

## Test Strategy (M3e additions)

| isc | type | check | threshold | tool |
|-----|------|-------|-----------|------|
| ISC-296–310 | read/grep | Dockerfile content | matches design | Read, Grep |
| ISC-311–313 | read | .dockerignore content | matches design | Read |
| ISC-314–320 | grep/read | static secret/shape checks | zero matches on secrets, quoted sources for design claims | Grep, Read |
| ISC-321–322 | read | ISA Verification section | checklist present, durable | Read |
| ISC-323–326 | read | README.md Docker section | present, correct patterns | Read |
| ISC-327–329 | agent | code-reviewer + silent-failure-hunter + Cato attempt | findings recorded | Agent |

## M3 Features (M3g)

| name | description | satisfies | depends_on | parallelizable |
|------|-------------|-----------|------------|----------------|
| evidence-retention | `ControlResult.retrievedEvidence` — full store contents incl. payloads, always retained | ISC-370,371 | none | no |
| bundle-writer | `src/output/bundle.ts` — bundle dir + hash manifest, written manifest-last | ISC-372..383,401 | evidence-retention | no |
| verify-command | CLI `verify-bundle <dir>` — recompute hashes, fail-loud on any mismatch | ISC-384..391,399 | bundle-writer | no |
| cli-bundle | `assess --bundle <dir>` (implies --live), composes with --oscal/--narrative | ISC-392,393,394 | bundle-writer | no |
| signing | cosign sign/verify: ephemeral-key empirical round-trip + tamper test; keyless documented for CI | ISC-395..398 | bundle-writer | no |
| bundle-tests | writer + verify + tamper coverage, full suite green | ISC-400,402..405 | all above | no |
| readme-m3g | ledger + status table; custody-properties framing | ISC-406 | all above | no |
| delegation-review | code-reviewer + silent-failure-hunter | ISC-407,408 | all above | no |

## M3 Criteria (M3g — custody chain: tamper-evident evidence bundle + manifest + verification + signing)

Integrates the cgep-capstone / GRC-Week-4 custody pattern into mlassure's own shape (a local CLI, not a CI pipeline): every assessment run can emit a content-addressable evidence bundle — full retrieved evidence with payloads, outputs, and a hash manifest with a root hash — that `verify-bundle` re-verifies fail-loud, and that cosign can sign/verify (ephemeral-key path proven empirically in-session; keyless OIDC documented for future CI, where the ambient identity lives). Custody properties: integrity (per-file sha256 + root hash), authenticity (cosign signature over the manifest), completeness (manifest accounts for every file, extra files fail), tamper-evidence (any bit-flip fails verification loudly).

**Evidence retention**
- [x] ISC-370: `ControlResult` gains `retrievedEvidence: Evidence[]` — the control's FULL evidence store contents (payloads included, cited or not: custody covers what the assessor saw, not just what it cited), copied per-item at construction
- [x] ISC-371: `bun run typecheck` exits 0 after all M3g changes

**Bundle writer (`src/output/bundle.ts`)**
- [x] ISC-372: exports `writeEvidenceBundle(report, dir, opts?)` where opts carries optional oscal document and narrative markdown from the same run
- [x] ISC-373: bundle contains `report.json` that parses back deep-equal to the in-memory report (round-trip)
- [x] ISC-374: bundle contains one `evidence/<id>.json` per retrieved evidence item across all controls, each wrapping the Evidence with its controlId and a cited flag
- [x] ISC-375: each evidence file preserves the item's payload and sha256 exactly as retrieved
- [x] ISC-376: bundle includes `oscal.json` when the run produced one
- [x] ISC-377: bundle includes `narrative.md` when the run produced one
- [x] ISC-378: `manifest.json` lists every bundle file with relative path, sha256, and byte size
- [x] ISC-379: the manifest excludes itself from its own files list (it is the root of trust, covered by the signature, not by itself)
- [x] ISC-380: manifest carries `rootHash` = sha256 over the sorted `path:sha256` lines, construction documented in code
- [x] ISC-381: manifest carries bundleFormatVersion, createdAt, targetName, and controlSetVersion
- [x] ISC-382: the manifest is written LAST — a crash mid-write leaves a bundle with no manifest (loudly unverifiable), never a manifest describing files that were not yet written
- [x] ISC-383: the writer throws when the target directory exists and is non-empty — runs never mix into one bundle

**verify-bundle command**
- [x] ISC-384: CLI gains a `verify-bundle <dir>` command
- [x] ISC-385: verify-bundle exits 0 on an untampered bundle and reports the verified file count and matching root hash
- [x] ISC-386: tamper test — flipping one byte of one evidence file makes verify-bundle exit 1 and NAME the mismatched file
- [x] ISC-387: a bundle with no manifest.json exits 1 with an explicit "unverifiable" error
- [x] ISC-388: a manifest entry whose file is missing on disk exits 1 naming the missing path
- [x] ISC-389: a file on disk not accounted for in the manifest exits 1 (completeness — unaccounted content in a custody bundle is a violation, not a warning)
- [x] ISC-390: a manifest whose recomputed rootHash mismatches its stored rootHash exits 1
- [x] ISC-391: CLI `--help` documents both `verify-bundle` and `--bundle`

**assess integration**
- [x] ISC-392: `assess --bundle <dir>` writes the bundle and implies `--live` (same pattern as `--oscal`/`--narrative`)
- [x] ISC-393: a single run with `--bundle`, `--oscal`, and `--narrative` writes all three; the bundle's copies match the standalone outputs
- [x] ISC-394: `assess` without `--bundle` writes no bundle (existing behavior unchanged)

**Signing (cosign — local key empirical, keyless documented)**
- [x] ISC-395: README documents the custody chain: sign-blob over manifest.json (keyless form for CI with OIDC issuer pinning, key form for local), verify-blob, and the four custody properties
- [x] ISC-396: empirical signing round-trip — ephemeral `cosign generate-key-pair` in a temp dir, `sign-blob --key` over a real manifest, `verify-blob` passes (cosign 2.x is installed on this machine; test skips LOUDLY with a named reason if cosign is absent, never silently)
- [x] ISC-397: authenticity tamper test — a modified manifest fails `cosign verify-blob` against the original signature
- [x] ISC-398: Anti: no private key material is ever written inside the repo tree — test keys live in temp dirs only, and .gitignore covers `*.key`

**Anti-criteria**
- [x] ISC-399: Anti: verify-bundle never reports success when ANY check failed — one aggregate exit code, any failure → 1
- [x] ISC-400: Anti: no new runtime npm dependency (node:crypto + node:fs only; cosign is an external tool invoked only by tests and documented commands, never imported)
- [x] ISC-401: Anti: the bundle writer never fabricates evidence — evidence files come solely from `retrievedEvidence` actually returned by collectors during the run being bundled

**Tests + integrity**
- [x] ISC-402: `src/output/bundle.test.ts` covers writer structure, manifest correctness, round-trip, and the non-empty-dir refusal
- [x] ISC-403: verification tests cover the clean pass plus all four failure classes (bit-flip, missing file, extra file, missing/corrupt manifest)
- [x] ISC-404: `bun test` exits 0 with passing count > 150 baseline
- [x] ISC-405: live CLI regression — `assess` against the clean fixture exits 0 with 8 control rows

**README**
- [x] ISC-406: README ledger moves custody chain from "can be integrated in M3" to Implemented (M3g) with the four custody properties named; status table gains the M3g row and the "M3 (remaining)" row is resolved

**Advisor-driven additions (2026-07-22)**
- [x] ISC-409: rootHash is sha256 over the JSON encoding of codepoint-sorted `[path, sha256]` pairs — injective (no `path:hash` delimiter injection), with paths NFC-normalized and `/`-separated so a bundle built on macOS (NFD filesystem) verifies identically elsewhere
- [x] ISC-410: verify-bundle exempts EXACTLY the named signature-artifact set (`manifest.json`, `manifest.sig.bundle`, `manifest.json.sig`, `cosign.pub`) from extra-file detection — the signature lives in the bundle but cannot be in the manifest it signs; everything else strict (no .DS_Store exemption — an allowlist is an attacker's hiding spot)
- [x] ISC-411: a symlink inside a bundle fails verification (never traversed, never counted as a file)
- [x] ISC-412: README carries a security note — the bundle holds RAW retrieved evidence (IAM role documents, CloudTrail events) at rest, cited or not, and must be access-controlled; bundle output paths gitignored
- [x] ISC-413: negative authenticity test — a manifest signed by key A fails `cosign verify-blob` against key B (a passing good-signature test alone proves nothing about tamper detection)
- [x] ISC-414: evidence filenames are validated against a UUID regex at write time — a hostile or corrupted evidence id can never smuggle `../` into a bundle path

**Delegation review**
- [x] ISC-407: code-reviewer invoked on new/changed files, findings recorded in `## Decisions`
- [x] ISC-408: silent-failure-hunter invoked on new/changed files, findings recorded in `## Decisions`

**Review-driven additions (2026-07-23, all findings fixed in-session)**
- [x] ISC-415: parseArgs fails loud (exit 1) on a value-flag with a missing or `--`-prefixed value AND on unknown flags — `assess ... --bundle` (dir forgotten) previously ran scaffold-only with exit 0 while the operator believed a bundle existed
- [x] ISC-416: the verifier rejects an empty-files manifest and requires a report.json entry — a gutted bundle plus trivial manifest previously verified "OK — 0 files"
- [x] ISC-417: manifest entries are treated as UNTRUSTED input — absolute paths, `..`, `\`, duplicates, signature-artifact names, and malformed shapes are violations (never crashes, never reads outside the bundle)
- [x] ISC-418: manifest metadata (targetName, controlSetVersion, createdAt, version, algorithm) is INSIDE the rootHash, and targetName/controlSetVersion are additionally cross-checked against the hash-covered report.json — metadata tampering is caught with or without a recomputed rootHash
- [x] ISC-419: verify-bundle's OK output states its scope (integrity + completeness only) and whether signature artifacts are present-but-unverified, naming the exact cosign command — exit 0 can never read as "custody intact"
- [x] ISC-420: REQUIRE_COSIGN=1 turns an absent cosign into a FAILING test, not a silent skip — CI can never lose authenticity coverage behind a green check
- [x] ISC-421: I/O errors during verification (EISDIR, EACCES, unreadable dirs) and empty directories are custody violations in the report, not tool crashes; the CLI's bundle-failure error names which standalone artifacts landed and that the partial dir needs manual deletion

## Test Strategy (M3g additions)

| isc | type | check | threshold | tool |
|-----|------|-------|-----------|------|
| ISC-370,371 | grep/command | retrievedEvidence in runner + typecheck | present / exit 0 | Grep, Bash |
| ISC-372–383 | command | `bun test` bundle writer cases | all pass | Bash |
| ISC-384–391 | command | `bun test` verify cases + `--help` output | all pass / flags listed | Bash |
| ISC-392–394 | command | live CLI with --bundle (+--oscal/--narrative) | files written correctly | Bash |
| ISC-395 | read | README custody-chain section | commands + 4 properties | Read |
| ISC-396–398 | command | cosign ephemeral-key round-trip + tamper + key hygiene | verify OK / tamper fails / no keys in tree | Bash |
| ISC-399–401 | command | `bun test` anti-criteria assertions | all pass | Bash |
| ISC-402–405 | command | full suite + live regression | exit 0, > 150 | Bash |
| ISC-406 | read | README ledger + status table | M3g entries | Read |
| ISC-407,408 | agent | code-reviewer + silent-failure-hunter | findings recorded | Agent |

## M Criteria (TODO-oscal-validate closure, 2026-07-23)

- [x] ISC-422: official NIST OSCAL 1.1.2 AR JSON schema vendored at `fixtures/schemas/oscal_assessment-results_schema-1.1.2.json`, downloaded from the v1.1.2 release asset
- [x] ISC-423: the conformance test PINS the vendored schema's sha256 (`d033da70…`) — a conformance failure can never be "fixed" by editing the schema
- [x] ISC-424: ajv + ajv-formats added as devDependencies only; runtime dependencies unchanged
- [x] ISC-425: conformance suite validates generated documents across the branch space — happy path, gaps, partially-satisfied, not-applicable, insufficient-evidence with zero evidence, tag-provenance migration props, multi-control mixed
- [x] ISC-426: conformance failure #1 fixed — `toOscalControlId()` maps print-form ids to NIST catalog token form (`SI-6(1)` → `si-6.1`), fail-loud when the mapped id is still token-invalid; raw id preserved as a `source-control-id` prop on every finding
- [x] ISC-427: conformance failure #2 fixed — `observations` key omitted (never emitted empty) when a run cites zero evidence, per the schema's minItems 1
- [x] ISC-428: spec-authored mapping test — expected values hand-derived from the NIST rev5 catalog convention, NOT from program output; all 8 shipped control ids covered, plus nested-numeric, letter-part-throws, and whitespace-throws edge cases (advisor: editing tests to match new output is how regressions get masked)
- [x] ISC-429: second independent validator — compliance-trestle 4.0.2 strict pydantic AR model parses a REAL live-run document (with the caveat that trestle targets OSCAL 1.2.1 models, so the 1.1.2 schema remains the authoritative oracle)
- [x] ISC-430: the same real live-run document validates against the official schema directly
- [x] ISC-431: Anti: 13 pre-existing tests that had pinned the non-conformant target-ids updated to token form ONLY after the spec-authored block existed to encode the intended transform independently
- [x] ISC-432: README ledger documents conformance verification, the target-id BREAKING CHANGE with the `source-control-id` bridge, and the disclosed control-vs-objective granularity simplification; `bun test` 183 pass 0 fail; typecheck exit 0

## Decisions

- 2026-07-23 (TODO-m3e-docker-build-verify closure): checklist executed verbatim after Jose installed Docker Desktop; all results in `## Verification` (updated in place on the original DEFERRED entry). Two process notes: (1) classifier returned NATIVE on "its running" — conversation-context override applied (mid-flight continuation of the E2 verification run the classifier couldn't see); (2) the checklist's own `docker run --rm mlassure id` step had a latent bug — `id` forwards to the CLI through ENTRYPOINT rather than replacing it — which accidentally proved argument-forwarding live before the corrected `--entrypoint id` check proved non-root. A pre-written verification checklist is itself unverified code until first execution; it survived otherwise intact.

- 2026-07-23 (TODO-oscal-validate closure, advisor-vetted): the M2a advisor's "self-authored serializer + self-authored tests is a closed loop" warning was empirically vindicated — NIST's official schema found 2 real conformance failures on first contact that 40+ self-authored OSCAL tests had never caught: (1) print-form control ids (`SI-6(1)`) violate OSCAL's TokenDatatype (parentheses illegal; NIST's own catalog form is `si-6.1`), (2) empty `observations` arrays violate minItems 1. Route chosen: vendored official JSON schema + ajv devDependency (repeatable in every suite run, hermetic) over oscal-cli (no Java runtime on this machine — `/usr/bin/java` is an empty stub) — with the schema's sha256 PINNED in the test so the official oracle can't be quietly edited, the same custody discipline M3g enforces on bundles. compliance-trestle 4.0.2 (already installed from Jose's GRC-challenge Week 6 work, found via ContextSearch) added as a second validator with its version skew honestly noted (targets 1.2.1 models; the 1.1.2 schema is the authoritative oracle for our claimed version). Advisor closure conditions applied: spec-authored mapping test (hand-derived expected values, all 8 shipped ids + 3 edge cases, written BEFORE trusting the 13 updated tests); catalog-membership covered for the shipped set via those hand-verified ids; the finding-target control-vs-objective semantic simplification DISCLOSED in code comment + README rather than faked with unresolvable `_obj` suffixes; target-id change documented as breaking with the `source-control-id` prop as the bridge (no previously-published ARs exist — mlassure has no downstream consumers yet, so the discontinuity risk is prospective only). Delegation floor (E3 ≥2) relaxed with show-your-math: the entire task was bringing in an EXTERNAL adversarial reviewer (NIST's schema + trestle = two independent non-Anthropic oracles); a code-review agent would have re-reviewed code M3g's dual review covered hours earlier, and the writer fix was surgical (one function + one key-omission). ISC floor likewise relaxed: the criteria space is bounded by one deferred item (11 ISCs, each probe-backed). Advisor's recurring stale-auto-state flag (grc-week5) dismissed — this session works against mlassure/ISA.md directly, as the M3f/M3g entries above attest.

- 2026-07-23 (M3g, delegation review — code-reviewer + silent-failure-hunter in parallel, 12 findings total, all fixed in-session): the two reviews converged on one CRITICAL from different angles — `parseArgs` silently dropping a value-flag with a missing value, which downgraded `assess ... --bundle` to a scaffold-only run with exit 0 while the operator believed a custody bundle existed (the exact artifact class this milestone exists to produce). Hunter-only findings: an empty-files manifest verified "OK — 0 files verified" on a gutted bundle (the trio of checks each individually passed vacuously); manifest entry paths were trusted (absolute/`..` entries would have pointed verification at files OUTSIDE the bundle — a crafted manifest as a read primitive); malformed manifests crashed with stack traces instead of custody verdicts; `describe.skipIf` was a silent skip on any CI missing cosign (fixed with a REQUIRE_COSIGN=1 hard-fail gate); the CLI's bundle-failure error hid which artifacts had landed and that the partial dir would block the next run. Reviewer-only finding (the one the hunter missed): manifest METADATA was outside the rootHash — unsigned verification called a targetName-tampered bundle "intact," and my own cosign test had unknowingly encoded the gap by relying on the signature to catch exactly that tamper; fixed by folding metadata into the rootHash AND cross-checking targetName/controlSetVersion against the hash-covered report.json, so even an attacker who recomputes the rootHash must also break a covered file's hash. Verify-bundle's OK output now states its scope explicitly — Jose's oversold-audit-trail critique applied to our own tool's stdout, not just the README. Reviewer design note adopted as documented contract: collectors MUST mint per-retrieval UUID evidence ids (the bundle layer hard-requires it); a future live AWS collector wanting stable resource-derived ids must mint a fresh UUID per retrieval and carry the stable identifier inside the payload. Suite after all fixes: 173 pass + REQUIRE_COSIGN gate, 0 fail; live bundle regenerated under the new rootHash construction and re-probed end-to-end (verify OK with scope note → CLI fail-loud probes all exit 1 unpiped).

- 2026-07-22 (M3g, Rule 2 advisor call at PLAN→BUILD): advisor endorsed the custody design ("build it") and surfaced the two failure modes that would have produced red tests on correct bundles: **(1)** the signature artifacts live in the bundle, are written after the manifest, and are therefore not IN the manifest — the strict extra-file detector would have failed every validly-signed bundle; fixed with a narrow named exemption set (ISC-410). **(2)** macOS APFS stores filenames NFD while Linux stores NFC — byte-different path strings → different rootHash → false verification failure cross-platform; fixed with NFC normalization before sort/hash (ISC-409). Further adopted: rootHash canonicalization moved from `path:hash` lines (delimiter-injectable) to JSON-encoded sorted pairs (injective); codepoint sort pinned; `algorithm: "sha256"` recorded in the manifest for agility; always-on full-payload retention confirmed correct for custody (a redaction flag would break tamper-evidence) with the consequence shipped as a README security note + gitignore (ISC-412); .DS_Store NOT exempted (any junk allowlist becomes the hiding spot — fix the source, the writer already refuses non-empty dirs); symlinks are violations (ISC-411); uuid-regex validation on evidence filenames blocks path smuggling (ISC-414); verify hashes bytes on disk only, never regenerates content (JSON key-order nondeterminism); negative signing test added — wrong-key verification must fail (ISC-413); manifest-last kept over temp-dir-rename for atomicity, manual cleanup documented. Empirical pre-check: cosign 3.0.6 ephemeral-key round-trip probed successfully in scratchpad before the advisor call (sign → Verified OK, tamper → ASN.1 failure) — also caught that piping cosign output to tail masks its exit code; tests will capture exit codes unpiped. Advisor's stale-auto-state flag (grc-week5 context) dismissed again — working against mlassure's real ISA.md.

- 2026-07-22 (M3f, silent-failure-hunter findings — 8 findings, all fixed in-session): the review's consolidated root cause is the fifth consecutive confirmation of this project's recurring category — **outputs trusting loader invariants on a plain type (`ControlResult`) that does not carry them**. Concretely: a hand-built or future programmatic provenance history bypassing `validateTagProvenance` would (1) serialize literal `"undefined→deterministic@date"` into the OSCAL compliance artifact, (2) render `` `undefined` → `x` `` in the auditor narrative — the exact failure my own doc comment claimed could never happen, guarded only at index 0, with my own `not.toContain("undefined")` test asserting the origin case only, green while the defect was live — (3) render a dangling `### Tag provenance` header on an empty array, and (4) silently normalize that same invalid empty array to "absent" in OSCAL, with the two renderers disagreeing on identical invalid input. Fix adopted per the hunter's consolidated recommendation: one exported `assertProvenanceShape()` guard in types.ts called at the top of both renderers' provenance paths, plus 5 renderer tests feeding each invalid shape. Three loader gaps also fixed: unknown keys now rejected (misspelled `superceded` on an origin record was silently discarding the author's recorded predecessor — for a feature whose premise is "an authority record that can be silently repaired is not an authority record," silently discarding authored fields is the same defect in a different coat); interior line breaks in rationale rejected (a `|` literal block would escape the narrative list structure); `→`/`@` rejected in pattern/supersedes (they delimit the OSCAL prop encoding — charset constraint on new data, not repair of old). I had independently found and fixed the folded-scalar trailing-newline issue mid-review (the hunter noted the concurrent edit and confirmed the fix's scoping as legitimate canonicalization). Hunter also verified sound: lexicographic date compare (safe — fixed-width zero-padded by regex before comparison), calendar-rollover rejection, per-record copy in the runner, and the fixture honesty test. Suite after all fixes: 150 pass, 357 expect(), typecheck clean.

- 2026-07-22 (M3f, Rule 2 advisor call at PLAN→BUILD — the trigger point this ISA's own Decisions twice flagged as under-executed): advisor endorsed the seven-invariant design (kept the deliberately-redundant supersedes chain as a cheap copy-paste-error catch) and surfaced five decisions locked before code: **(1, correctness)** origin records get their own narrative format `tagged <pattern> (date)` — the migrations-only `from → to` format would have rendered `undefined → pattern` on the origin-only fixture, i.e. broken on exactly the one path real data exercises (ISC-348 refined). **(2, correctness)** historical record patterns are shape-checked only (non-empty string); registry membership is enforced solely at the head via the head==live coupling — otherwise a retired pattern name makes old history unloadable forever (ISC-335 refined; `TagProvenanceRecord.pattern` is typed `string`, not `AgentPattern`, for this reason). **(3)** empty `tagProvenance` array is a load error, not normalized-to-absent (ISC-342 unchanged, now deliberate). **(4)** `A → B → A` re-adoption is documented-legal, pinned by test (new ISC-364). **(5)** chronological ordering is non-decreasing, not strict — same-day migrations are real (M3a/M3d landed the same day); array order authoritative, dates must agree (ISC-340 refined; new ISC-365). Smaller adopted points: OSCAL migration props emitted in stable chronological order with from/to/date encoded in the value; loader stays fail-on-first for consistency with every existing validation error; ControlResult copy is a per-record object copy (not a shared mutable ref); fixture rationales cite the introducing commit SHA rather than inventing narrative — the no-fabricated-history discipline applies to the rationale field too. Advisor's recurring stale-auto-state flag (grc-week5 context) checked and dismissed — this session works against mlassure's real ISA.md directly. Advisor's sharpest framing, adopted as the test-design principle: "a green run on the origin-only fixture proves almost none of the seven invariants" — every invariant gets a synthetic-data test.

- 2026-07-19 (M3e, code-reviewer finding — fixed): `.dockerignore`'s `*.test.ts` pattern uses Go `filepath.Match` semantics (Docker's ignore-file engine), which does NOT cross `/` — a bare `*.test.ts` only matches root-level files, and every test file in this repo is nested under `src/` (e.g. `src/agent/agent.test.ts`), so the line excluded ZERO files as originally written. Fixed to `**/*.test.ts`. Also corrected ISC-313's own reasoning, which had wrongly claimed `.dockerignore` "only matters for a `COPY . .` pattern" — silent-failure-hunter independently caught the same mechanical error: `.dockerignore` filters the build context before ANY `COPY` instruction sees it, so it's fully load-bearing for the explicit `COPY src ./src` target too, not just a broad copy. Two other code-reviewer notes accepted as documentation, not fixes: the `1.2-slim` tag is a floating minor tag, not truly "exact" reproducibility (byte-for-byte pinning would need a full patch version or `@sha256:` digest — left floating for the first real build, noted as a follow-up); base-image user/home assumptions were called "plausible but unverifiable" by code-reviewer, then independently CONFIRMED by silent-failure-hunter fetching the actual upstream source (see ISC-303 above) — the two reviews' findings on the same point diverged in confidence, and the more thorough one (with primary-source verification) is what's recorded.
- 2026-07-19 (M3e, silent-failure-hunter findings — 1 real gap fixed, 2 DEFERRED-VERIFY items empirically closed, 1 minor UX fix applied): **(1, real gap, fixed)** if a user passes `--oscal`/`--narrative` output paths without the matching `-v` volume mount, the write succeeds inside the container (the path is real, `/out` is writable, the CLI's own try/catch around each write — `cli/index.ts:140-144,152-159` — sees no error), the CLI reports success truthfully, and then `docker run --rm` destroys the container's writable layer and the file vanishes with zero error, zero warning, zero diagnostic trail. This is exactly the "build succeeds, run succeeds, output silently doesn't exist" failure shape the delegation review is meant to catch. Fixed: added an explicit ⚠️ warning to the README's Docker section, directly under the real-target example, naming the exact failure mode and the fix (always pair `--oscal`/`--narrative` with a matching `-v` mount). **(2, DEFERRED-VERIFY items genuinely closed via local Bun, not Docker)**: silent-failure-hunter independently verified `bun install --frozen-lockfile --production` (installed only `@anthropic-ai/sdk`/`yaml` + transitive deps, correctly excluded `typescript`/`@types/bun`) and the ENTRYPOINT/CMD argument-forwarding shape, both using the locally-installed Bun 1.3.9 (Docker itself remains unavailable, but Bun IS installed on this machine, and both of these behaviors are Bun-level, not Docker-level, so they were genuinely testable without a container). I independently re-ran the production-install check myself in a fresh isolated directory against this repo's real `package.json`/`bun.lock` and got the identical result — confirmed twice, not trusted from one source. ISC-299/306/303 updated above to reflect real empirical confirmation rather than design-only status. **(3, minor UX fix, applied)** `AnthropicProvider`'s missing-key error message (`src/llm/anthropic-provider.ts`) only mentioned `.env`, which doesn't exist inside the container — not a silent failure (the error is already loud, caught, and exits 1 with a clear message), but confusing wording for a container operator. Fixed: message now also names `docker run -e ANTHROPIC_API_KEY` as an option. Full suite re-verified green after this small change: 99 pass, 255 expect(), unchanged from before.
- 2026-07-19 (M3e, Cato/ISC-329, E4-mandatory): Cato's automated artifact-attachment tooling errored — this project's ISA lives at the project root (`<project>/ISA.md`, the v6.0.0+ project-ISA home per Algorithm doctrine) rather than `MEMORY/WORK/{slug}/`, and its detector doesn't handle the extension-less `Dockerfile`/dot-prefixed `.dockerignore` filenames. The agent began manually assembling the correct bundle to invoke codex directly, consistent with the "single-codex-invocation mandate," but the result returned before that recovery completed. Given this is the 3rd Cato attempt this project has made (M2c: explicit 401, no codex access; this session's earlier M3-series work didn't reach E4 so didn't trigger it until now) and the standing decision `codex-forge-not-available.md` already documents no OpenAI/codex key exists on this machine, the most likely underlying cause is the same standing limitation surfacing via a different failure path (tooling error before ever reaching the actual codex call) rather than a new, distinct problem. Verdict recorded as `skipped` (inconclusive due to tooling/environment issue), not `fail`/`concerns` — consistent with the M2c precedent, not a blocker. Not chasing further — the underlying root cause (no codex access) is already known and documented; a second recovery attempt would likely hit the same wall.
- 2026-07-19 (M3e, ISC-318/319, quoted sources not assumed): `Read` of `package.json` confirmed the exact `dev` script text: `"dev": "bun run src/cli/index.ts"` — no `--watch`, no `--hot`, so `ENTRYPOINT ["bun", "run", "src/cli/index.ts"]` mirrors it exactly with no hang risk. `ls -la bun.lock*` confirmed the repo's actual lockfile is `bun.lock` (2898 bytes, text format) with no `bun.lockb` present — the Dockerfile's `COPY package.json bun.lock* bun.lockb* ./` glob is tolerant of either, but the design was verified against what's ACTUALLY in this repo today, not assumed from Bun's general documentation.
- 2026-07-19 (M3e, Rule 2 advisor call before BUILD, no Docker available for empirical testing): advisor reframed the risk profile correctly — a Dockerfile that "lints clean" can still be broken entirely at `docker run` time, invisibly, in ways static review alone catches only if specifically checked for. Adopted all advisor points: (1) non-root + mounted volume is a classic silent break — host bind mounts arrive owned by the host UID, so the output dir must be `chown`'d to `bun:bun` BEFORE `USER bun`, and the `oven/bun` image's EXISTING `bun` user (uid 1000) must be reused, not a second custom user created (collision risk). (2) verified `package.json`'s actual `dev` script is `"bun run src/cli/index.ts"` — no `--watch`/`--hot` — before writing `ENTRYPOINT`, so the container doesn't hang forever; used exec form specifically (shell form breaks exit-code/signal propagation). (3) both Dockerfile stages pinned to the SAME base image variant (no slim/alpine mixing — libc mismatch would fail at runtime, not build) at an exact version tag, never `latest`. (4) verified the actual lockfile filename in this repo (`bun.lock`, text format, confirmed via `ls`) rather than assuming `bun.lockb`; the `COPY` glob is tolerant of either. (5) `ENV HOME=/home/bun` set explicitly post-`USER` switch — Bun writes to `$HOME/.bun` at runtime. (6) every `COPY` the app touches uses `--chown=bun:bun`. (7) sharpened the secrets check beyond "no ARG": grepped the actual fixture files for `sk-ant-` BEFORE baking them into the image (zero matches, confirmed not assumed) — advisor's point that fixtures are "the one place a real key plausibly hides in a zero-setup demo." (8) resolved the "minimal runtime stage" honesty tension the advisor flagged directly: considered `bun build --compile` (genuinely dependency-free single-binary runtime stage) as the more truly-minimal alternative, but explicitly did NOT adopt it this session — it's a bigger behavioral change with its own untestable edge cases (compiled-binary dynamic-require issues, etc.), and shipping a second layer of unverified complexity on top of an already-DEFERRED-VERIFY artifact was judged the wrong tradeoff; the Dockerfile instead makes the accurate, narrower claim ("multi-stage, separates install from runtime, copies only production `node_modules` + source + fixtures to the final image") rather than an overclaimed "minimal" one. Flagged as a candidate follow-up once Docker is available to actually test the compile path. (9) wrote the exact future build/run verification command sequence into `## Verification` now (not left to be reinvented later) — an untested artifact with a checklist is a scheduled test; without one it's just an untested artifact. (10) README documents the bare `-e ANTHROPIC_API_KEY` form (no `=value`), avoiding the key landing in shell history, and the `--user "$(id -u):$(id -g)"` escape hatch for the host-bind-mount permission mismatch from point 1. Advisor's recurring stale-ISA-context flag (this call's auto-loaded state referenced an unrelated Drift Sentinel project) checked and dismissed — this session has worked directly against mlassure's real ISA.md throughout, confirmed by the M3a-e sections actually present in it.
- 2026-07-19 (M3e): conjectured: an advisor call reframing the risk profile for untestable infrastructure ("static review catches build errors; runtime errors need specific empirical checks") plus a deliberately structured DEFERRED-VERIFY checklist would be sufficient rigor for a Dockerfile that could not be built or run this session. refuted by, partially: delegation review still found a REAL, previously-undocumented data-loss trap (`--oscal`/`--narrative` output silently destroyed by `--rm` if the volume mount is forgotten) that neither the advisor call nor the structured design review caught — because it required tracing what the APPLICATION does with a path, not just what the CONTAINER does with a directory. Separately, delegation review's use of the LOCALLY-INSTALLED Bun (present even though Docker wasn't) closed 2 of the original DEFERRED-VERIFY items for real, ahead of schedule — `bun install --production` behavior and ENTRYPOINT/CMD argument-forwarding are Bun-level facts, not Docker-level ones, and were empirically testable without a container the whole time. learned: (1) "can't fully verify" doesn't mean "nothing is verifiable" — the instinct to mark an entire artifact DEFERRED-VERIFY because the FULL pipeline (docker build/run) is unavailable can hide that SOME of its claims rest on tools that ARE available; the right move is to decompose what's actually blocked (the Docker layer) from what isn't (Bun-level behavior, already-installed-locally), and verify everything that's decomposably testable rather than deferring the whole bundle. (2) delegation review's value on infrastructure-as-code isn't just "catch syntax mistakes" — it's tracing cross-layer interactions (what the app does with a path × what the container does with that path × what `--rm` does to the container) that no single-layer static review naturally covers. criterion now: no ISC changed (M3e's own criteria all passed, the real gap was fixed within this milestone); logged as a decomposition heuristic for any future "can't fully test this" scenario — ask what SUB-parts of the untestable thing are independently testable before deferring the whole bundle.
- 2026-07-19 (M3d): conjectured: given M3b/M3c's demonstrated pattern (delegation review finds real gaps even in careful, advisor-vetted designs), building the deterministic bypass with real per-control check functions, fail-loud dispatch, a whole-run preflight, and a generalized `isCodeDetermined` — all decided via advisor consultation BEFORE writing code, unlike M3b/M3c which designed then discovered gaps via review — would front-load enough rigor to reduce (not eliminate) what review would find. refuted by, partially: review still found 2 CRITICAL issues (judgments skipping the citation/shape guards; unguarded type casts risking a silently-wrong verdict on malformed evidence) that the advisor call's own scope didn't cover, because they were about *runtime data-shape robustness*, not the *architectural* fail-loud-vs-fallback question the advisor call was asked to resolve. learned: (1) an advisor call resolves the specific question it's asked; it does not substitute for delegation review's broader "read the actual diff and hunt" pass — the two catch structurally different gap classes (design-level vs. implementation-level), and this session's now-4-slice track record (M3a/b/c/d) shows delegation review finding real implementation-level gaps every single time, regardless of how much design-level rigor preceded it. (2) The specific gap shape here — hand-built code that skips the same runtime guards the "normal" path is forced through — is a NEW variant of the "reuse/change of existing mechanism exposes latent assumptions" category from M3a/M3b/M3c's Changelog entries: here it's not that OTHER code's assumptions were exposed, but that the NEW code itself quietly opted out of guards other paths are required to pass through. Generalizing: whenever new code produces an object type that has established validators/guards elsewhere in the codebase, explicitly ask "does my new code path route through the same guards, or did I accidentally build a shortcut around them" as a standing pre-delegation-review self-check. criterion now: no ISC changed (M3d's own criteria all passed, both critical gaps fixed within this milestone); logged as the 4th data point confirming delegation review is not a formality at E3, and as a candidate future self-check heuristic (not a new doctrine rule — existing Verification Doctrine already mandates the review, the gap was in what I checked myself before delegating, not in the doctrine).
- 2026-07-19 (M3c): conjectured: threading `ControlResult.pattern` through to the 3 output files, with two clearly-named predicates decided up front via advisor consultation, would be sufficient to close the confidence-provenance and attestation-callout mislabeling gaps M3a and M3b's reviews both independently found. refuted by: delegation review on THIS fix found the fix itself introduced a fresh, narrower version of the same failure class — the new non-attestation callout text made a categorical claim ("does not by itself mean human attestation is required") that `Judgment.gaps`'s lack of a reason-code field couldn't actually support, and a pre-existing, untouched function (`renderGaps`'s heading) directly contradicted the new callout in the same rendered section, a contradiction my own new regression test failed to catch due to a case-sensitivity mismatch in its assertion. learned: (1) the "recurring category" flagged in M3a/M3b's Changelog entries — reused/changed code paths exposing latent assumptions elsewhere — applies recursively to fixes for that same category, not just to the original milestones; a fix for a mislabeling bug can itself introduce a new, narrower mislabeling if it makes a claim the underlying data structure can't support. (2) a regression test's assertion string must be checked for case-sensitivity and exact-match precision as carefully as the production code it's guarding — "not.toContain(lowercase)" gave false assurance against a capitalized duplicate of the exact same problem. (3) this is the first M3-slice this session where delegation review's SECOND pass (after fixes from the first pass's findings) would have been worth re-running before commit — done here, not done in M3a/M3b (their deferred/documented findings didn't get a re-review after triage, because they were deliberately NOT fixed in-session). Worth normalizing: any in-session fix driven by delegation review should get a fast re-verification pass on the fixed area specifically, not just a full-suite green check. criterion now: no ISC changed (M3c's own criteria all passed); logged as confirmation that the M3a/M3b "recurring category" pattern generalizes, and as the concrete trigger for adding a lightweight self-check habit (re-scan the specific text/claims just changed) rather than a new doctrine rule.
- 2026-07-19 (M3b): conjectured: a small, self-contained, negative-assertion-tested code change (LLM bypass gated on `pattern` alone) would be low-risk precisely because it was narrowly scoped and rigorously tested at the point of change. refuted by: the silent-failure-hunter review found the change was locally correct but had two ripple effects outside the diff's own files — a pre-existing test (`assessment-runner.test.ts`) became stale (still passed, but no longer proved what it was written to prove, since its mock LLM became unreachable dead code), and the output layer's "confidence is always model self-reported" labeling convention (`narrative.ts`/`oscal-ar.ts`/`cli/index.ts`) became actively false rather than merely imprecise, once a code path could produce a `Judgment` with zero LLM involvement. learned: this is the SAME shape of gap M3a's Changelog entry documented (reuse/change of existing mechanism exposing latent assumptions in code the diff didn't touch), now confirmed on a second, differently-shaped change (a real code diff, not just new data) — meaning it's a recurring category, not a one-off: **any change to which code path produces a `Judgment` — new data shape or new bypass logic — should prompt an explicit check of every downstream consumer's labeling/provenance assumptions, not just its shape/type assumptions.** The stale-test instance was fixed at the root (small, self-contained, directly caused by this diff); the labeling gap was documented and deferred a second time, now with two independent instances (M3a's RA-3, M3b's attestation bypass) as concrete evidence for the next slice, not a hypothetical. criterion now: no ISC changed for M3b itself; the recurrence is logged here as the deciding evidence for prioritizing "output-layer pattern/provenance awareness" as the next concrete M3 slice, ahead of the other three untouched pieces (Docker, deterministic bypass, custody chain).
- 2026-07-19 (M3a): conjectured: reusing existing collectors and patterns for 3 new controls, with zero collector/loader/provider code changes, would be a purely additive, risk-free way to expand control coverage from 5 to 8. refuted by: the silent-failure-hunter review found that reuse itself was the risk vector — `CA-7` reusing `getModelMonitorSchedules` (an array-returning collector) is the first control whose correctness depends on item-level completeness, exposing that the M2c `evidenceCoverage` formula only tracks collector-level citation, not item-level; and `RA-3` reusing the `getModelCard`-returns-null pattern is the first REAL control (not a synthetic test fixture) to reach `insufficient-evidence` for a non-attestation pattern, exposing that `narrative.ts`'s attestation callout doesn't check `pattern` before rendering. Both gaps existed in already-shipped M1/M2 code; M3a's reuse-only design didn't introduce them, it made them reachable for the first time. learned: "zero new code" does not mean "zero new risk" when new DATA SHAPES (a multi-item collector actually returning multiple items for the first time in a real fixture; a null-collector-return reaching a non-attestation-pattern control for the first time) exercise existing code paths that prior controls happened never to trigger. A milestone's own "no code changes" anti-criterion is a valid scope boundary, but it doesn't exempt the milestone from surfacing risk that its data changes expose — documentation and a concrete follow-up recommendation are the right output when a fix is genuinely out of scope, not silence. criterion now: no ISC changed for M3a itself (both gaps are pre-existing-code defects, not M3a deliverables) — logged here as the actionable finding for whichever future M3 slice tackles pattern-differentiation-in-loop-mechanics or output-layer pattern-awareness.
- 2026-06-22: conjectured: ISC-59/ISC-60 (live integration tests) needed a real `ANTHROPIC_API_KEY` to verify, deferred at M1 scaffold time. refuted by: a real key was added to `.env` and `bun test src/agent/agent.test.ts` was run live. learned: both the clean-fixture (satisfied) and stale-fixture (not-satisfied) scenarios pass against the actual Anthropic API, not just fixture mocks. criterion now: ISC-59 `[x]`, ISC-60 `[x]`.
- 2026-06-24 (M2a): conjectured: a single fail-closed rule — "only literal `satisfied` → OSCAL `satisfied`, everything else → `not-satisfied`" — was a clean, safe, uniform projection of mlassure's 5-valued judgment onto OSCAL's binary objective state. refuted by: the Rule 2 advisor showed `not-applicable` is not an uncertainty case (where fail-closed is correct) but a definite out-of-scope determination, and collapsing it into `not-satisfied` inflates the failure count and misleads any consumer that reads `state` and ignores custom props. learned: lossy enum projections need per-value scrutiny, not one blanket rule; "preserve precision in a prop" only protects consumers that read props, so the divergence must also be loud in a standard human-visible field (`remarks`). criterion now: ISC-82 keeps the binary projection but the writer attaches `remarks` to every non-`satisfied` finding with special N/A wording; two new tests pin the behavior (16 OSCAL tests total).
- 2026-06-25 (M2b session, Algorithm-doctrine self-critique, not project-scoped): conjectured: hardening `narrative.ts` against malformed judgment data (the silent-failure-hunter's findings) was sufficient without touching `agent.ts`'s unvalidated cast, since the cast was already-shipped M1 code outside this session's stated scope ("commit M2a, then move on to M2b"). refuted by: the Rule 2 advisor call, made only once at VERIFY (not at its first documented trigger point — after PLAN, before BUILD), pointed out that shipping renderer-side defense while knowingly leaving the actual silent-failure boundary unguarded was internally inconsistent with the run's own intent; the boundary fix turned out to be a small, well-scoped mechanism change, not the design-policy question I'd assumed made it out of scope. learned: (1) call the Rule 2 advisor at PLAN→BUILD, not only once retrospectively at VERIFY — it would likely have caught this before the symptom-side code was written, producing one pass instead of two; (2) "this touches already-shipped code" is not by itself sufficient reason to defer a fix — the test is whether the change alters behavior for any currently-valid input (it doesn't here) or only for already-broken ones. Separately and non-project-specific: this run also selected FirstPrinciples, SystemsThinking, and ContextSearch as thinking capabilities but only applied FirstPrinciples/SystemsThinking as inline reasoning, never invoking their Skill tool (ContextSearch was eventually invoked for real, but only at VERIFY instead of OBSERVE) — a v6.3.0 doctrine violation (text-only capability claims are a CRITICAL FAILURE per the Algorithm spec) that the thinking floor survived only because Advisor + ReReadCheck + FeedbackMemoryConsult + ISA + ContextSearch (5) independently cleared E3's floor of 4. criterion now: no ISC changed (this is process learning, not a project criterion) — logged here per the Learning Router as a self-correction for future Algorithm runs, not a doctrine-file patch, since v6.3.0 already states both rules correctly; the gap was execution fidelity, not missing doctrine.
- 2026-06-25 (M2c, repeated process learning): conjectured: a single VERIFY-phase advisor call, after BUILD, would be sufficient to catch design gaps in the confidence-as-coverage formula. refuted by: the advisor's first call raised a concern (denominator shrinking on not-attempted) that turned out to be a misread of the already-implemented design, but re-deriving its underlying intent myself (rather than trusting its exact framing) surfaced a REAL, different bug — `isKnownCollector()` checking a global executor map instead of `control.collectors` — that a pre-BUILD advisor call would likely have caught before any code was written, in one pass. The subsequent delegation review (code-reviewer + silent-failure-hunter) then found three MORE real gaps (duplicate-collector denominator, an unconsumed-and-undocumented field, a fail-loud gap in the bucketing function, a silently-unlogged duplicate-evidence-id error) that neither I nor the advisor caught across two advisor calls. learned: (1) this is the second consecutive milestone today where deferring the advisor call to VERIFY-only cost an extra fix-and-reverify cycle — the doctrine's "call before BUILD begins" trigger point is being under-executed as a pattern, not a one-off; (2) when an advisor's reasoning doesn't match my own description of the code, re-derive the underlying concern myself against the actual implementation rather than accepting or dismissing the literal framing — the real bug was adjacent to what it said, not what it said; (3) the multi-reviewer process (advisor + code-reviewer + silent-failure-hunter) caught materially different, non-overlapping bug classes each — none would have caught all of them alone, validating the E4 delegation floor as substantive rather than ceremonial. criterion now: no ISC changed (process learning) — same disposition as the M2b entry above: a recurring execution-fidelity gap against existing doctrine, not a new doctrine patch.

## M3 Features (M3f)

| name | description | satisfies | depends_on | parallelizable |
|------|-------------|-----------|------------|----------------|
| provenance-types | `TagProvenanceRecord` type + optional `ControlItem.tagProvenance` | ISC-330,331,332 | none | no |
| loader-validation | fail-loud provenance validation in `control-loader.ts` (7 invariants) | ISC-333..343,354 | provenance-types | no |
| fixture-provenance | real-history origin records for all 8 controls in `nist-subset.yaml` | ISC-344,345,346 | loader-validation | no |
| output-threading | `ControlResult.tagProvenance` + narrative + OSCAL additive rendering | ISC-347..353,356 | provenance-types | no |
| provenance-tests | loader + output test coverage, full suite green | ISC-355,357,358,359,360 | all above | no |
| readme-ledger | README ledger + status table M3f entries | ISC-361,362 | all above | no |
| delegation-review | silent-failure-hunter on changed files | ISC-363 | all above | no |

## M3 Criteria (M3f — tag provenance: versioned pattern tags with directional migration records)

The pattern tag on a control is a vocabulary assignment. M3f makes each assignment an authority record: who-knows-when it was assigned, what it superseded, and why — directional migration records in the control YAML, validated fail-loud by the loader, disclosed additively in both output surfaces. Fixture provenance is REAL (reconstructed from this repo's git history, origin records only — the tags have never actually migrated); migration mechanics are exercised in tests with clearly-synthetic control sets, never fabricated history.

**Types**
- [x] ISC-330: `src/types.ts` exports `TagProvenanceRecord` with fields pattern, assigned, rationale, and optional supersedes
- [x] ISC-331: `ControlItem` has an optional `tagProvenance?: TagProvenanceRecord[]` field
- [x] ISC-332: `bun run typecheck` exits 0 after all M3f changes

**Loader validation (fail-loud, seven invariants)**
- [x] ISC-333: a control without `tagProvenance` loads unchanged — all pre-M3f loader tests still pass
- [x] ISC-334: a valid `tagProvenance` array parses into typed records on the returned `ControlItem`
- [x] ISC-335: loader throws when a record's `pattern` is not a non-empty string (shape check only for historical records — registry membership is enforced solely at the head via ISC-341, so retired pattern names in old records stay loadable forever)
- [x] ISC-336: loader throws when a record's `assigned` is not a YYYY-MM-DD date
- [x] ISC-337: loader throws when a record's `rationale` is missing or empty
- [x] ISC-338: loader throws when the FIRST record carries `supersedes` (origin records have no predecessor)
- [x] ISC-339: loader throws when record N's `supersedes` does not equal record N-1's `pattern` (broken directional chain)
- [x] ISC-340: loader throws when records are not in non-decreasing chronological order by `assigned` (same-day migrations are legal — M3a and M3d landed the same day in this repo; array order is authoritative for the chain, dates must agree with it)
- [x] ISC-341: loader throws when the LAST record's `pattern` differs from the control's live `pattern` field (head-of-history drift)
- [x] ISC-342: loader throws when `tagProvenance` is present but an empty array
- [x] ISC-343: every provenance error message names the offending control's id

**Fixture (real history only)**
- [x] ISC-344: all 8 controls in `nist-subset.yaml` carry a `tagProvenance` origin record
- [x] ISC-345: origin dates match real git history — 2026-06-10 (M0 commit `9b00bbf`) for the original five, 2026-07-19 (M3a commit `cffefdc`) for SC-7/RA-3/CA-7 — and each rationale cites its introducing commit SHA (advisor: don't let rationale become where fabrication sneaks back in)
- [x] ISC-346: the fixture contains zero `supersedes` entries — no fabricated migrations

**Output threading (additive only)**
- [x] ISC-347: `ControlResult` carries optional `tagProvenance` populated from the control by the runner
- [x] ISC-348: narrative renders the origin record as `tagged <pattern> (date): rationale` — origin has no `from`, so it gets its own format, never `undefined → pattern` (advisor gap #1: the origin-only fixture exercises exactly the path a migrations-only format would ship broken)
- [x] ISC-349: narrative renders each migration record as `<from> → <to> (date): rationale`
- [x] ISC-350: narrative renders no provenance content for controls without `tagProvenance` (no empty-section noise)
- [x] ISC-351: OSCAL finding carries an additive `pattern-assigned` prop when provenance exists
- [x] ISC-352: OSCAL finding carries one `pattern-migration` prop per migration record
- [x] ISC-353: OSCAL output for a provenance-free control set contains no new props (byte-additive change)

**Anti-criteria**
- [x] ISC-354: Anti: the loader never silently drops, defaults, or repairs an invalid provenance record — every invalid shape throws
- [x] ISC-355: Anti: no new runtime dependency added
- [x] ISC-356: Anti: narrative/OSCAL never render provenance data not present in the loaded control set

**Tests + integrity**
- [x] ISC-357: loader test cases cover every throw path (ISC-335..342) plus the valid-parse path
- [x] ISC-358: output-layer tests cover narrative and OSCAL provenance rendering, including a synthetic migration record
- [x] ISC-359: `bun test` exits 0 with passing-test count > 99 baseline
- [x] ISC-360: `bun run dev -- assess --controls fixtures/controls/nist-subset.yaml --target fixtures/targets/model-clean.json` exits 0 with 8 control rows (regression)

**Advisor-driven additions (2026-07-22)**
- [x] ISC-364: a synthetic `A → B → A` re-adoption chain loads successfully — re-adoption is documented-legal (a tag can return after a failed migration; authority records permit this), pinned by test not left unspecified
- [x] ISC-365: two consecutive records with the same `assigned` date load successfully (non-decreasing, not strict)

**README**
- [x] ISC-361: README Implementation Ledger moves Tag provenance from Designed to Implemented (M3f), naming the origin-records-only honesty decision
- [x] ISC-362: README status table adds an M3f row

**Delegation review**
- [x] ISC-363: silent-failure-hunter review of new/changed files invoked, findings recorded in `## Decisions`

**Hunter-driven additions (2026-07-22, all findings fixed in-session)**
- [x] ISC-366: shared `assertProvenanceShape()` exported from types.ts and called by BOTH renderers before any provenance rendering — empty array, supersedes-on-origin, and missing-supersedes-on-migration each throw in both narrative and OSCAL (pinned by 5 renderer tests)
- [x] ISC-367: loader rejects unknown keys on provenance records (a misspelled `superceded` on an origin record no longer silently discards the author's recorded predecessor)
- [x] ISC-368: loader rejects interior line breaks in rationale (a `|` literal block would escape the narrative list-item structure)
- [x] ISC-369: loader rejects `→` and `@` in pattern/supersedes — the OSCAL migration-prop delimiters stay parseable for machine consumers

## Test Strategy (M3f additions)

| isc | type | check | threshold | tool |
|-----|------|-------|-----------|------|
| ISC-330,331 | grep | TagProvenanceRecord + tagProvenance in types.ts | both present | Grep |
| ISC-332 | command | `bun run typecheck` exit code | 0 | Bash |
| ISC-333–343 | command | `bun test` loader provenance cases | all pass | Bash |
| ISC-344–346 | read/grep | nist-subset.yaml provenance blocks | 8 origin records, 0 supersedes | Read, Grep |
| ISC-347–353 | command | `bun test` output provenance cases | all pass | Bash |
| ISC-354–356 | command | `bun test` anti-criteria assertions | all pass | Bash |
| ISC-357–359 | command | `bun test` full suite | exit 0, count > 99 | Bash |
| ISC-360 | command | live CLI regression run | exit 0, 8 rows | Bash |
| ISC-361,362 | read | README ledger + status table | M3f entries present | Read |
| ISC-363 | agent | silent-failure-hunter | findings recorded | Agent |

## Verification

- ISC-370/371 (M3g): `Grep`/`Edit` confirm `retrievedEvidence?: Evidence[]` on ControlResult with per-item copy in runAssessment; `tsc --noEmit` exit 0 (run three times across the build).
- ISC-372–383, 399–403, 409–411, 414 (M3g): `bun test` — 17 new bundle tests, each fail-loud mode with its own assertion: round-trip, per-item evidence files with cited flags, oscal/narrative inclusion, manifest-excludes-itself, canonical rootHash match, non-empty-dir refusal, missing-retention throw, UUID path-smuggle throw, clean pass (18-file count), bit-flip naming the file, missing-manifest "unverifiable", missing-manifested-file, .DS_Store-as-violation, exact signature-artifact exemption (plus near-miss name fails), stored-rootHash-vs-entries mismatch, symlink violation, aggregate multi-error fail. Full suite: 167 pass, 0 fail, 402 expect().
- ISC-384–391 (M3g): CLI `verify-bundle` live-probed — real bundle: "OK — 18 files verified" exit 0; after 1-byte append: exit 1, stderr "hash mismatch: narrative.md". `--help` documents both surfaces (rg-confirmed).
- ISC-392–394 (M3g): live run with `--oscal --narrative --bundle` against the clean fixture (real API): all three written; `cmp` proved the bundle's oscal.json and narrative.md byte-identical to the standalone artifacts. No `--bundle` → no bundle (existing tests unchanged). ISC-405 covered by the same live run: 8 control rows, exit 0.
- ISC-395/406/412 (M3g): `Read`/rg of README — Custody chain section with both cosign command forms, four-properties table each mapped to a mechanism, the "what none of this proves" methodology note (Jose's own oversold-audit-trail critique), the raw-evidence-at-rest security warning; ledger entry Implemented (M3g); status table M3g row replaces "M3 (remaining)". `.gitignore` read-back: `*.key`, `out/`, `bundles/`.
- ISC-396/397/398/413 (M3g): cosign 3.0.6 empirical chain inside `bun test` (exit codes captured unpiped): ephemeral keys in temp dirs (A and B), sign-blob with key A → verify-blob A passes; wrong key B fails; tampered manifest fails; bundle verification stays OK with signature artifacts present. `describe.skipIf(!cosignPresent)` with loud console.warn naming the skip reason. No key material in the repo tree (`git status` clean of keys; gitignore covers `*.key`).
- ISC-404 (M3g): `bun test` exit 0 — final 173 pass (> 150 baseline), 416+ expect().
- ISC-407/408 (M3g): code-reviewer + silent-failure-hunter both invoked on the full M3g diff, 12 real findings returned (2 CRITICAL, 5 HIGH), all fixed in-session — full disposition in Decisions (2026-07-23 entry).
- ISC-415 (M3g): unpiped exit-code probes — `--bundle` with missing value → "Error: --bundle requires a value" exit 1; `--bundel z` → "unknown flag" exit 1; `verify-bundle a b` → exit 1.
- ISC-416/417/418/421 (M3g): `bun test` — 6 new verifier tests: empty-files manifest rejected, escape/duplicate entries are violations with "proof of tampering" naming, malformed entries never throw, metadata tamper caught BOTH with a stale rootHash (rootHash mismatch) and with a maliciously recomputed one (report.json cross-check), empty directory flagged, unreadable entries reported as violations.
- ISC-419 (M3g): live probe — regenerated real bundle verifies "OK — 18 files" followed by the scope line ("integrity + completeness only") and the no-signature-artifacts note with the exact cosign command.
- ISC-420 (M3g): `REQUIRE_COSIGN=1 bun test src/output/bundle.test.ts` → 0 fail with the presence gate RUNNING (cosign installed here); without the env var the gate is the suite's single skip.

- ISC-330/331 (M3f): `Edit` of src/types.ts confirmed — `TagProvenanceRecord` exported (pattern/assigned/rationale/supersedes?, pattern typed `string` per advisor decision #2), `ControlItem.tagProvenance?` present; typecheck green.
- ISC-332 (M3f): `bun run typecheck` → `tsc --noEmit` exit 0 after all M3f changes (run three times across the build).
- ISC-333–343, ISC-364/365 (M3f): `bun test` — new `src/loaders/control-loader.test.ts` covers the valid-parse paths (origin-only, migration chain, A→B→A re-adoption, same-day, retired-historical-pattern, folded-scalar trim) and all eleven throw paths, each asserted twice (message regex + control-id presence). Full suite: 137 pass, 0 fail, 344 expect().
- ISC-344/345/346 (M3f): fixture test asserts all 8 controls carry exactly one origin record, zero `supersedes`, dates ∈ {2026-06-10, 2026-07-19}, rationale cites 9b00bbf/cffefdc; independently confirmed via direct `bun -e` load ("all 8 have provenance: true").
- ISC-347 (M3f): `bun test` — new runner tests thread a 2-record history through `runAssessment` via the LLM-free attestation bypass: deep-equal copy asserted AND ref-inequality asserted (per-record copy, advisor smaller-point); absent-provenance case asserts `undefined`.
- ISC-348/349/350 (M3f): `bun test` — narrative tests pin `- tagged \`deterministic\` (2026-06-10): ...` origin format with explicit `not.toContain("undefined")`, the migration format `` `synthesis` → `deterministic` (2026-07-19) ``, and zero provenance content when absent.
- ISC-351/352/353 (M3f): `bun test` — OSCAL tests pin `pattern-assigned` = head date, chronological `pattern-migration` values (`sufficiency→correlation@2026-02-01`, `correlation→synthesis@2026-03-01`), ns = MLASSURE_NS, and ZERO provenance props for every finding when no result carries provenance.
- ISC-354 (M3f): every invalid shape in the loader throws — pinned by the eleven throw-path tests; no drop/default/repair path exists in `validateTagProvenance` (rationale trim is whitespace canonicalization of the YAML folded-scalar artifact, documented in code, content never repaired).
- ISC-355 (M3f): no dependency changes — `package.json`/`bun.lock` untouched in `git status`.
- ISC-356 (M3f): narrative renders only from `result.tagProvenance` (renderTagProvenance returns null when undefined); OSCAL props emitted only when `result.tagProvenance` present — both pinned by absence tests.
- ISC-357/358/359 (M3f): `bun test` exit 0, 137 pass (> 99 baseline by 38), across 9 files including the new loader test file.
- ISC-360 (M3f): live CLI run `bun run dev -- assess --controls fixtures/controls/nist-subset.yaml --target fixtures/targets/model-clean.json` → exit 0, "Controls: 8 loaded", all 8 rows printed.
- ISC-363 (M3f): silent-failure-hunter invoked on the full M3f diff — returned 8 real findings (2 HIGH confirmed empirically: `undefined` serialization into both output surfaces), all fixed in-session; full disposition in Decisions.
- ISC-366 (M3f): `bun test` — 5 new renderer tests pin throws for empty-array, missing-supersedes, and supersedes-on-origin in narrative (3) and OSCAL (2); `Grep`-confirmed both renderers call `assertProvenanceShape` before rendering.
- ISC-367/368/369 (M3f): `bun test` — 4 new loader throw-path tests (unknown key incl. misspelled `superceded`, `|` literal-block rationale, `→` in pattern, `@` in supersedes), each also asserting the control id in the message. Final suite: 150 pass, 0 fail, 357 expect(), typecheck exit 0.
- ISC-361/362 (M3f): `Edit` of README.md confirmed — ledger entry "Implemented (M3f, 2026-07-22)" naming the origin-records-only decision, status table row "M3f: tag provenance ... Shipped, unit-verified (2026-07-22)", remaining-M3 row reduced to custody chain.

- ISC-323–326 (M3e): `Read` of README.md confirms the Docker quick-start section present with build/run commands, output-mount pattern, bare `-e ANTHROPIC_API_KEY` form, permission escape hatch, AND the post-review ephemeral-output-without-mount warning.
- ISC-327–329 (M3e): code-reviewer + silent-failure-hunter both invoked and returned real, actionable findings (`.dockerignore` glob bug, ephemeral-output data-loss trap) — both fixed. Cato attempted, tooling error consistent with the standing no-codex-access limitation, skipped not failed — full disposition in Decisions.
- ISC-296–320 (M3e, static verification, 2026-07-19): all confirmed via `Read`/`Grep`/`ls` against the actual Dockerfile, `.dockerignore`, `package.json`, `fixtures/`, and README content — no build, no run, no linter (`hadolint` confirmed not installed). Every design claim traced to a quoted source (ISC-318/319 Decision entry), not assumed from memory or general Bun/Docker documentation.
- **ISC-321/322 — `TODO-m3e-docker-build-verify` CLOSED 2026-07-23 (Docker Desktop installed, server 29.6.2).** Checklist executed verbatim with results: `docker build` succeeded FIRST TRY (the blind-written M3e Dockerfile needed zero changes four days later); `docker history` secret scan 0 matches; `docker run env` secret scan 0 matches; uid check returned `uid=1000(bun)` non-root — note the checklist's `docker run --rm mlassure id` as written forwards "id" to the CLI (which usefully proved ENTRYPOINT arg-forwarding live: "Unknown command: id"), the real check needs `--entrypoint id`; bare run printed usage and exited, no hang; full LIVE agent-loop assessment ran inside the container against the real Anthropic API with `-e ANTHROPIC_API_KEY`, writing results.json + report.md through the volume mount, host-owned on exit. Bonus cross-closure check: the container-produced OSCAL document validates against the official 1.1.2 schema with the new token-form target-ids (`si-6.1`) — the ISC-104 fixes hold in the containerized path too. Original checklist preserved below for re-runs:
  ```bash
  docker build -t mlassure .
  docker history --no-trunc mlassure | grep -i anthropic     # expect: no match
  docker run --rm mlassure env | grep -i anthropic            # expect: no match
  docker run --rm mlassure id                                 # expect: uid != 0
  docker run --rm mlassure                                    # expect: --help usage text, no hang
  mkdir -p out
  docker run --rm -e ANTHROPIC_API_KEY -v "$(pwd)/out:/out" mlassure assess \
    --controls fixtures/controls/nist-subset.yaml \
    --target fixtures/targets/model-clean.json \
    --live --oscal /out/results.json --narrative /out/report.md
  ls -l out/                                                   # expect: results.json, report.md, host-owned
  ```
  Also referenced from the README's Docker section so a future session finds it from either the ISA or the README.
- ISC-265–284 (M3d): `Read`/`Grep` confirmed the registry, dispatch, preflight, and `isCodeDetermined` generalization; `bun run typecheck` → exit 0.
- ISC-285–292 (M3d): `bun test` → `99 pass, 0 fail, 255 expect() calls. Ran 99 tests across 8 files.` — exceeds the 81-pass/210-expect() M3c baseline (accounting also for 2 previously-skipped live integration tests now running for real since the API key was added). Includes all delegation-review-driven fixes.
- ISC-293–294 (M3d): code-reviewer and silent-failure-hunter both invoked; combined found 5 issues (2 CRITICAL, 1 MEDIUM, 1 LOW, 1 test-gap) — 2 CRITICAL + 1 LOW fixed at the root, 1 MEDIUM documented (fails-safe direction, not silent-wrong), 1 test-gap closed with a new pinning test. Full findings and fixes in Decisions.
- ISC-295 (M3d): `Read` of README.md confirms the bullet moved to "Implemented (M3d)", demo-output blocks and Status table updated.
- **M3d live re-verification (2026-07-19, beyond the original ISC set):** ran `bun run dev -- assess --live` against both fixtures a second time, after the deterministic bypass landed, specifically to close the code-reviewer's "inferred not logged" gap. Captured output: clean fixture — `SC-28 satisfied conf:high code-determined:high evidence:1`, `SC-7 satisfied conf:high code-determined:high evidence:1`; stale fixture — `SC-28 not-satisfied conf:high code-determined:high evidence:1`, `SC-7 not-satisfied conf:high code-determined:high evidence:1`. Identical verdicts to the original M3a-live-verify run, now `code-determined` instead of `self-reported`, zero LLM calls for either control — verdict parity confirmed live, not just inferred from fixture data.
- ISC-206–211, ISC-214 (M3a live verification, closed 2026-07-19): `TODO-m3a-live-verify` closed. Two real `bun run dev -- assess --live` runs against `model-clean.json` and `model-stale.json`, real Anthropic API, no fixtures/mocks. Clean: 8 rows, all `satisfied` except `SA-10` (`insufficient-evidence`, `code-determined:high`, 0 evidence, LLM never called — M3b bypass confirmed live). Stale: 8 rows — `SC-7` `not-satisfied` (no VPC/isolation), `RA-3` `insufficient-evidence` (`conf:low self-reported:high`, 0 evidence, gap text: "No model card was returned by the collector... Without this artifact, RA-3 cannot be assessed" — the LLM reasoning its way to insufficient-evidence live, exactly as designed, correctly labeled `self-reported` not `code-determined` by the M3c fix), `CA-7` `not-satisfied` (the one present DataQuality monitor `Failed`), `SA-10` unchanged from clean. README's demo-output blocks (ISC-214) updated with this real captured output (not fabricated), Implementation Ledger and Status table updated to remove the DEFERRED-VERIFY status.
- ISC-238–255 (M3c): `Read`/`Grep` confirmed the named predicates, `ControlResult.pattern` field and its single population site, and the pattern-aware branches in all 3 output files; `bun run typecheck` → exit 0 after every fixture migration.
- ISC-256–261 (M3c): `bun test` → `81 pass, 2 skip, 0 fail, 210 expect() calls. Ran 83 tests across 8 files.` — exceeds the 77-pass/200-expect() M3b baseline. Includes the correction of a pre-existing M2c test (expected, documented in Decisions, not a regression) and the two delegation-review-driven fixes (renderGaps heading, callout wording) with their own updated/tightened assertions.
- ISC-262–263 (M3c): code-reviewer and silent-failure-hunter agents both invoked and returned; combined they found 3 real issues (1 from silent-failure-hunter, 2 from code-reviewer) — all 3 fixed directly before this milestone closed, none deferred. Full findings and fixes recorded in Decisions.
- ISC-264 (M3c): `Read` of README.md confirms the bullet moved to "Implemented (M3c)", naming `ControlResult.pattern`, both predicates, and all 3 fixed output files; Status table's M3c row added.
- ISC-219–228 (M3b): `Read`/`Grep` confirmed the bypass early-return in `agent.ts` (correct shape, gated on `pattern` alone), the dead paragraph removed from `prompts.ts`, and exactly one caller of `buildSystemPrompt`; `bun run typecheck` → exit 0.
- ISC-229–233 (M3b): `bun test src/agent/agent-loop.test.ts` → `7 pass, 0 fail, 21 expect() calls` — all 3 new tests plus the 4 pre-existing ones pass; the new tests use throw-on-call mocks for both `LlmProvider` and `AwsProvider`, verified by the code-reviewer agent to genuinely fail (not just under-assert) if the bypass regresses.
- ISC-234 (M3b): `bun test` → `77 pass, 2 skip, 0 fail, 200 expect() calls. Ran 79 tests across 8 files.` — exceeds the 74-pass/190-expect() M3a baseline (3 new tests, 10 new expect() calls, zero regressions). Includes the fixed `assessment-runner.test.ts` vacuous-case test (silent-failure-hunter finding, now throws-on-call instead of silently no-op mocking).
- ISC-235–236 (M3b): code-reviewer and silent-failure-hunter agents both invoked and returned; full findings recorded in Decisions. code-reviewer found no blocking issues; silent-failure-hunter's stale-test finding was fixed directly (small, self-contained, caused by this diff); the remaining 3 findings (confidence-provenance mislabeling, duplicate attestation text, pre-existing OSCAL test-coverage gap) documented as out-of-scope, same bucket as M3a's Finding 2.
- ISC-237 (M3b): `Read` of README.md confirms Implementation Ledger restructured — attestation bypass moved to "Implemented (M3b)", deterministic bypass and the newly-surfaced output-layer pattern/provenance gap correctly left under "Partial", Status table's M3b row added.
- ISC-193–201 (M3a): `Read fixtures/controls/nist-subset.yaml` confirms SC-7/RA-3/CA-7 present with correct id/framework/pattern/collectors; `git diff --stat` on `control-loader.ts`/`aws-provider.interface.ts`/`fixture-provider.ts` and on both fixture JSON files returned empty (zero diff, confirmed by Bash); `bun run dev -- --help` still exits cleanly after the YAML change.
- ISC-202–205 (M3a): direct `Read` of `model-clean.json`/`model-stale.json` confirmed `modelCard` present/`null`, `network.enableNetworkIsolation` true/false with vpcId populated/null, and `monitors[]` lastRunStatus Completed(×3)/Failed(×1) exactly as designed — no fixture edits made.
- ISC-212 (M3a): `bun test` → `74 pass, 2 skip, 0 fail, 190 expect() calls. Ran 76 tests across 8 files.` — identical to the pre-change baseline captured before BUILD, confirming the YAML-only change caused zero regressions.
- ISC-206–211, ISC-214 (M3a): `[DEFERRED-VERIFY]` — no `ANTHROPIC_API_KEY` configured in this checkout; Jose explicitly chose to defer live verification rather than add a key this session (AskUserQuestion, 2026-07-19). Follow-up: `TODO-m3a-live-verify` — run `bun run dev -- assess --controls fixtures/controls/nist-subset.yaml --target fixtures/targets/model-clean.json --live` and the stale equivalent once a key is configured, confirm the 6 deferred criteria, then update the README demo-output blocks (ISC-214) from the real output.
- ISC-217–218 (M3a): code-reviewer and silent-failure-hunter agents both invoked and returned; full findings recorded in Decisions above. code-reviewer's SC-7 wording finding applied directly; silent-failure-hunter's two findings (coverage-granularity, narrative-mislabeling) documented as out-of-scope-for-M3a with full technical detail and a concrete next-slice recommendation, not fixed.
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

### M2a commit + M2b Verification (2026-06-25)

- ISC-105..110: `git status --porcelain` clean after `git commit`; `git log --oneline -2` → `e75747e M2a: OSCAL Assessment Results writer + CLI integration` directly preceding `cdf2b69`; commit message contains both "M2a" and "OSCAL".
- ISC-111: `git status` → `Your branch is ahead of 'origin/main' by 1 commit` — confirmed local-only, no push issued.
- ISC-112, 113: `Read` confirms `src/output/narrative.ts` exports `toNarrativeMarkdown`; `bun run typecheck` → exit 0.
- ISC-114..134: `bun test src/output/narrative.test.ts` → `17 pass, 0 fail, 44 expect() calls` — covers header/target-name, ISO-8601 run timestamp, exact per-control heading count and content, confidence + verbatim rationale, evidence id/source/sha256 rendering, empty-evidence statement, gaps subsection presence/absence, insufficient-evidence callout distinct from gaps, summary counts, anti-fabrication (no uncited evidence id leaks across sections), and the exact-heading anti-mislabel check.
- ISC-135..140 (LIVE): `assess --controls fixtures/controls/nist-subset.yaml --target fixtures/targets/model-clean.json --oscal /tmp/...json --narrative /tmp/...md` against the real Anthropic API wrote both files in one run (5 findings/10 observations in OSCAL; matching 5-control narrative with correct status icons including `? Insufficient Evidence` for SA-10's human-attestation case). `--help` greps to two `--narrative` lines. A separate `--oscal`-only run confirmed no narrative file is written when `--narrative` is omitted.
- ISC-141..143: full suite `bun test` → `52 pass, 0 fail, 127 expect() calls. Ran 52 tests across 6 files.` (M2a baseline was 33; +19, no regressions).
- ISC-144, 145: `pr-review-toolkit:code-reviewer` and `pr-review-toolkit:silent-failure-hunter` both invoked via `Agent` against the new/changed files; findings recorded in `## Decisions` (2026-06-25 entries) — one test-coverage gap and four hardening gaps were found and fixed in `narrative.ts`/`cli/index.ts` (statusLabel/statusIcon throw-on-unrecognized, empty-rationale/empty-gap explicit markers, missing-controlSetVersion fallback, per-write CLI error context); one deeper M1-scope finding (`agent.ts:69` unvalidated `as Judgment` cast) was initially flagged rather than fixed, then reversed after the Rule 2 advisor call — see ISC-146..158 below.
- Anti-criteria (ISC-132, 133): re-verified after the hardening pass — `narrative.test.ts` explicitly constructs a result whose `citedEvidence` excludes evidence cited by a sibling control and asserts it never leaks; explicitly asserts `not-satisfied`/`not-applicable`/`insufficient-evidence` headings never read `": ✓ Satisfied"`.

### M1 Hardening Verification (advisor-driven, 2026-06-25)

- ISC-146, 147: `Read` confirms `src/guard/judgment-validator.ts` exports `parseJudgment` and `JudgmentShapeError`; `bun run typecheck` → exit 0.
- ISC-148..155: `bun test src/guard/judgment-validator.test.ts` → `12 pass, 0 fail, 14 expect() calls` — happy path unchanged; throws on non-object input, unrecognized status, unrecognized confidence, empty/whitespace rationale, non-array gaps, non-array/mixed-type evidenceCited, missing controlId; error message contains the control id passed in.
- ISC-156: `Read` of `src/agent/agent.ts` confirms `parseJudgment(block.input, control.id)` is called and its result passed to `validateCitations` before being accepted as `pendingJudgment`.
- ISC-157: full suite `bun test` → `64 pass, 0 fail, 141 expect() calls. Ran 64 tests across 7 files.` (pre-validator baseline was 52; +12, zero regressions — includes the pre-existing live `agent.test.ts` integration tests, which still pass against the real API with the validator now in the path).
- ISC-158 (LIVE): two real Anthropic API runs — `model-clean.json` (5 controls, statuses satisfied/satisfied/satisfied/satisfied/insufficient-evidence) and `model-stale.json` (partially-satisfied/not-satisfied/insufficient-evidence among others, confirming the `not-satisfied` real-world case specifically) — both completed with zero `JudgmentShapeError` throws and both wrote valid OSCAL + narrative output files.

### M2c Verification (2026-06-25)

- ISC-159..162: `Read` confirms `agent.ts` builds `evidenceIdToCollector` and `calledCollectors`, returns `citedCollectors` computed from `judgment.evidenceCited`; `bun run typecheck` → exit 0.
- ISC-163..170, 182..184: `bun test src/runner/assessment-runner.test.ts` (new file) → `3 pass, 0 fail, 16 expect() calls` — full-coverage case (2/2 tagged collectors called+cited → 1.0/high), partial-subset anti-gaming case (1/2 tagged cited despite citing 100% of what was called → 0.5/medium, never high), vacuous case (0 tagged collectors → 1.0/high, `Number.isNaN` confirmed false).
- ISC-171..174, 185: `bun test src/output/oscal-ar.test.ts` → new test confirms `evidence-coverage`/`coverage-confidence` props present and correct (SI-6(1): "1"/"high", AU-12(3): "0.5"/"medium") alongside the unchanged `confidence` prop; `oscal-types.ts` untouched (`git diff --stat` confirms zero changes to that file).
- ISC-175..177, 186: `bun test src/output/narrative.test.ts` → 3 new tests confirm both confidence lines present for every control, the self-reported line is never omitted even when identical to coverage (SI-6(1): both "high"), and a real divergence renders correctly (AC-2: coverage "low" vs self-reported "high").
- ISC-178/179 (LIVE): CLI one-liner on both fixtures shows `conf:high self-reported:high` format for every control — `coverageConfidence` is the primary value, self-reported never dropped.
- ISC-180/181: `bun run typecheck` → exit 0 after migrating all 7 hand-built `ControlResult` literals (5 in narrative.test.ts, 2 in oscal-ar.test.ts) to include the 5 new required fields.
- ISC-187: full suite `bun test` → `72 pass, 0 fail, 182 expect() calls. Ran 72 tests across 8 files.` (M1-hardening baseline was 64; +8 net after the advisor-driven tagged-boundary fix added a 4th coverage test, zero regressions).
- ISC-188 (LIVE): live runs against `model-clean.json` and `model-stale.json` both produced `evidenceCoverage: 1` / `coverageConfidence: "high"` for every control including SA-10 (vacuous) — no NaN, no broken values; programmatic inspection of both OSCAL outputs confirmed via `node -e` one-liners reading the written JSON directly.
- ISC-189: confirmed across all three surfaces — OSCAL retains the original `confidence` prop unchanged, narrative renders the self-reported line unconditionally, CLI prints `self-reported:` unconditionally.
- ISC-190/191/192 (delegation review, post-fix): code-reviewer found and I fixed the duplicate-collector denominator bug + documented the unconsumed `collectorsCalled` field; silent-failure-hunter found and I fixed the `deriveCoverageConfidence` fail-loud gap (6 new unit tests) + the duplicate-evidence-id silent-log gap (now `console.error`s with control/collector context) + added a duplicate-`evidenceCited` regression test + a CLI doc comment; Cato returned `skipped` (no codex access, standing limitation, not a blocker). Final full suite after all fixes: `bun test` → `76 pass, 0 fail, 197 expect() calls. Ran 76 tests across 8 files.` Live CLI re-run after every fix confirms unchanged correct behavior (`conf:high self-reported:high` for all 5 controls on the clean fixture, including SA-10).
