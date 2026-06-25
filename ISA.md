---
task: mlassure M2c — confidence-as-coverage derivation
slug: mlassure-m2c
effort: E4
phase: learn
progress: 34/34
mode: algorithm
started: 2026-06-10T00:00:00Z
updated: 2026-06-25T09:00:00Z
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

## Decisions

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

- 2026-06-22: conjectured: ISC-59/ISC-60 (live integration tests) needed a real `ANTHROPIC_API_KEY` to verify, deferred at M1 scaffold time. refuted by: a real key was added to `.env` and `bun test src/agent/agent.test.ts` was run live. learned: both the clean-fixture (satisfied) and stale-fixture (not-satisfied) scenarios pass against the actual Anthropic API, not just fixture mocks. criterion now: ISC-59 `[x]`, ISC-60 `[x]`.
- 2026-06-24 (M2a): conjectured: a single fail-closed rule — "only literal `satisfied` → OSCAL `satisfied`, everything else → `not-satisfied`" — was a clean, safe, uniform projection of mlassure's 5-valued judgment onto OSCAL's binary objective state. refuted by: the Rule 2 advisor showed `not-applicable` is not an uncertainty case (where fail-closed is correct) but a definite out-of-scope determination, and collapsing it into `not-satisfied` inflates the failure count and misleads any consumer that reads `state` and ignores custom props. learned: lossy enum projections need per-value scrutiny, not one blanket rule; "preserve precision in a prop" only protects consumers that read props, so the divergence must also be loud in a standard human-visible field (`remarks`). criterion now: ISC-82 keeps the binary projection but the writer attaches `remarks` to every non-`satisfied` finding with special N/A wording; two new tests pin the behavior (16 OSCAL tests total).
- 2026-06-25 (M2b session, Algorithm-doctrine self-critique, not project-scoped): conjectured: hardening `narrative.ts` against malformed judgment data (the silent-failure-hunter's findings) was sufficient without touching `agent.ts`'s unvalidated cast, since the cast was already-shipped M1 code outside this session's stated scope ("commit M2a, then move on to M2b"). refuted by: the Rule 2 advisor call, made only once at VERIFY (not at its first documented trigger point — after PLAN, before BUILD), pointed out that shipping renderer-side defense while knowingly leaving the actual silent-failure boundary unguarded was internally inconsistent with the run's own intent; the boundary fix turned out to be a small, well-scoped mechanism change, not the design-policy question I'd assumed made it out of scope. learned: (1) call the Rule 2 advisor at PLAN→BUILD, not only once retrospectively at VERIFY — it would likely have caught this before the symptom-side code was written, producing one pass instead of two; (2) "this touches already-shipped code" is not by itself sufficient reason to defer a fix — the test is whether the change alters behavior for any currently-valid input (it doesn't here) or only for already-broken ones. Separately and non-project-specific: this run also selected FirstPrinciples, SystemsThinking, and ContextSearch as thinking capabilities but only applied FirstPrinciples/SystemsThinking as inline reasoning, never invoking their Skill tool (ContextSearch was eventually invoked for real, but only at VERIFY instead of OBSERVE) — a v6.3.0 doctrine violation (text-only capability claims are a CRITICAL FAILURE per the Algorithm spec) that the thinking floor survived only because Advisor + ReReadCheck + FeedbackMemoryConsult + ISA + ContextSearch (5) independently cleared E3's floor of 4. criterion now: no ISC changed (this is process learning, not a project criterion) — logged here per the Learning Router as a self-correction for future Algorithm runs, not a doctrine-file patch, since v6.3.0 already states both rules correctly; the gap was execution fidelity, not missing doctrine.

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
