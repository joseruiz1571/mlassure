---
task: mlassure M0 scaffold — TypeScript CLI, types, control loader, fixture provider, evidence store
slug: mlassure-m0
effort: E3
phase: verify
progress: 33/33
mode: algorithm
started: 2026-06-10T00:00:00Z
updated: 2026-06-10T00:00:00Z
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

## Decisions

- 2026-06-10: Using bun as runtime per CLAUDE.md mandate; package.json targets Node 20+ in tsconfig for SDK compatibility
- 2026-06-10: Evidence sha256 computed via Node built-in `crypto` module (not an npm dep) — keeps the store dependency-free
- 2026-06-10: CLI uses manual arg parsing (Tier 1 llcli pattern) — only one command at M0, Commander.js would be premature
- 2026-06-10: FixtureProvider takes a root path arg so tests can point at any fixture directory

## Changelog

## Verification
