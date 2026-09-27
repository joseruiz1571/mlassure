# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added — Proof-of-Control control family (M8b)

- `poc-evidence` provider family (`src/providers/poc-evidence.ts`): the target is a JSONL stream of Proof-of-Control evidence tokens plus an optional trust-assumption disclosure. The target file is a descriptor (`{ family, modelName, endpointName, stream, disclosure }`, paths relative to the descriptor); the provider reads the stream's raw text and parses each record with the strict parser, so a duplicate key is reported with its key, path and record index instead of being resolved last-wins. Signatures are not verified.
- `fixtures/controls/poc-c7-subset.yaml`: six controls. `PoC-7.7.1` (schema-valid), `PoC-7.7.3` (algorithm-tagged digests at the right width, `alg` present), `PoC-7.7.5` (no duplicate keys) and `PoC-7.6.2` (per-agent `step_index` gapless from 0) are deterministic checks with no LLM call; `PoC-7.3.2` (key custody) is attestation; `PoC-10.2` (disclosure completeness) is synthesis. Each control's `intent` states the property of the evidence that is checked, and its `note` quotes the requirement and names what mlassure did not assess.
- `fixtures/schemas/poc-evidence.schema.json`: the standard's evidence-token schema, byte-identical to commit `22c7b62`, sha256 pinned in a test, source and license recorded beside it. Validated with ajv's 2020-12 build.
- `fixtures/poc-evidence/`: a clean stream and eight single-fault streams derived from the standard's published vectors (unsigned; derivation in its README and `scripts/make-poc-streams.ts`), a fictional disclosure, and `fixtures/targets/poc-stream-clean.json`.
- `fixtures/parity/poc-llm-inputs.json`: every prompt and tool definition the new family sends to the model, pinned by a test that also asserts no SageMaker vocabulary reaches them.
- A control set may name its `family`; `runAssessment` refuses a provider of another family (`ControlSetFamilyError`), and a report from such a control set records `family`.
- A control's `note` is now carried into the report (`controlNote`), the narrative (a "Control note" line) and the OSCAL finding (a `control-note` prop). This adds one line to the SageMaker narrative and one prop to its OSCAL for `SA-10`, the one control in `nist-subset.yaml` that has a note. A `note` must now be a single-line string.

### Changed — M8b

- The CLI picks the provider from the target file's `family`; absent means `aws-sagemaker`, so existing target files are unaffected, and an unknown family exits 1 naming it.
- The system prompt, first message and attestation rationale take their target-specific sentences from the provider (`EvidenceProvider.wording`); a provider without wording gets the SageMaker text, which is byte-identical to before (parity test).
- `ajv` moved from `devDependencies` to `dependencies`: `PoC-7.7.1` validates at runtime.
- `tsconfig.json` sets `resolveJsonModule` so the pinned schema is imported (and bundled by `bun build`) rather than read from a path.

### Fixed — M8b

- `parseJsonStrict` dropped a member named `__proto__` (the assignment set the object's prototype instead of an own key); it now keeps it as `JSON.parse` does.

### Changed

- Provider generalization: the agent, runner and tools now depend on a generic `EvidenceProvider` (`family`, a collector catalog, `collect(name, target)`) instead of the SageMaker-shaped `AwsProvider`. SageMaker becomes the first family (`src/providers/aws-sagemaker.ts`), adapted with `awsSageMakerProvider()`; its typed collector methods are unchanged. For a control set that loads and runs, nothing changes: tool definitions, prompts and CLI output are byte-identical. **Breaking for library callers:** `assessControl` and `runAssessment` take an `EvidenceProvider`; `executeCollector` and `DeterministicCheckFn` take an `EvidenceProvider`; `buildToolDefs` and `isKnownCollector` take the provider as a second argument; `src/providers/aws-provider.interface.ts` moved into `aws-sagemaker.ts`.

- **Behavior change, stricter:** `runAssessment` now checks the whole control set against the provider before any control is assessed, and aborts with `UnknownCollectorsError` listing every (control, collector) pair the provider does not offer. This covers `attestation` and `deterministic` controls too. Before, a collector name on those two patterns was never read, so a control set carrying an unknown or misspelled name there produced a report; it now fails until the name is corrected or removed.
- Deterministic checks declare the family they were written for and the collectors they run. A check never runs against another family's provider (`DeterministicCheckFamilyError`), and its collectors are verified in the same preflight. `DETERMINISTIC_CHECKS` entries changed from a function to `{ family, requires, run }`.

### Added

- `defineProvider(family, definitions)`: builds a provider from one table of `{ description, run }`, so a collector's description and its implementation cannot drift apart.
- Collector names are validated as tool names, and `submit_judgment` is reserved; a provider with an unusable catalog aborts the run (`InvalidCollectorCatalogError`).
- `fixtures/parity/sagemaker-llm-inputs.json` and a test pinning every tool definition and prompt the SageMaker family sends to the model.

### Fixed

- Collector lookup used the `in` operator, so a tool call named after an inherited object key (`constructor`, `toString`) was treated as a known collector. Lookup is now own-property only and such a call gets "Unknown tool". The deterministic-check lookup by control id had the same flaw and the same fix.

## [0.5.0] - 2026-09-25

### Added

- `SPEC.md`: the custody bundle format (format `"1"`) as a standalone specification — layout, manifest members, root-hash construction, write-order guarantee, the numbered verification checks V-1…V-12 with their error prefixes, and what the format does not prove.
- `fixtures/schemas/bundle-manifest.schema.json`: machine-readable manifest schema; the writer's own output is validated against it in the test suite.
- `fixtures/bundles/`: conformance vectors — 1 positive bundle and 17 negative bundles, each negative carrying an `EXPECTED.json` naming the single check it exercises and the error pattern a conforming verifier must produce. `src/output/bundle.vectors.test.ts` fails any negative rejected for the wrong reason. Generator: `scripts/make-bundle-vectors.ts` (byte-stable regeneration).
- `docs/proof-of-control.md`: requirement-level crosswalk of the custody bundle against LF Decentralized Trust's Proof-of-Control v1.0 draft (C7, C8.1, C10), with tier placement (Tier 2), a C10.2-shaped trust-assumption disclosure, and the path to a Tier 3 custody claim.
- `verify-bundle` now rejects a `manifest.json` (or `report.json`) containing a duplicate object key at any depth, naming the key and path, instead of resolving last-wins like `JSON.parse` (check V-2; `src/output/strict-json.ts`).
- `verify-bundle` now refuses a manifest whose `algorithm` is absent or not `sha256` (V-5) and a `bundleFormatVersion` it does not implement (V-4), rather than assuming either.
- `writeEvidenceBundle` accepts a `createdAt` override for reproducible fixture generation.
- Verifier: the terminal zero-files check now returns the V-4/V-5 violations found before it instead of discarding them; `files[].bytes` must be a non-negative integer (was: any number).
- Release hygiene: `LICENSE` (Apache-2.0), `SECURITY.md`, GitHub Actions CI (typecheck + test), README badges and maintenance-posture line.

### Changed

- Manifest `files[].sha256` must be lowercase hex; uppercase is a V-7 violation rather than a case-fold. No bundle written by an earlier format-1 writer is affected (the writer always emitted lowercase).
- README: M4 (live AWS provider) marked post-1.0 with the 2026-08-14 reason.

## [0.4.0] - 2026-08-30

### Added

- Settable LLM model and temperature, with `0` accepted as a valid temperature rather than swallowed as falsy (99138d5).
- CLI flags `--report`, `--repeat`, `--model`, and `--temperature`; `--repeat N` writes replicas with `-rNN` output suffixes (99138d5).
- `MLASSURE_MODEL` environment variable is now read, and `ANTHROPIC_WORKSPACE_ID` optionally sets the `anthropic-workspace-id` header for identity-linked keys (99138d5).
- Run metadata on assessment output: control intent per `ControlResult`, plus LLM model, temperature, and replica on `AssessmentReport` (99138d5).
- Provider capture of the dated snapshot ID Anthropic actually served and per-call token usage (99138d5).
- Unit tests covering provider configuration (99138d5).

### Changed

- README documents the 0.4.0 surface: reproducibility flags, run metadata, the two environment variables, the settable model, and the current test count (5ac2410).
- Merged the `feat/assessment-metadata-repro-flags` line of work (d7319f3, e148658).

## [0.3.0] - 2026-08-13

### Added

- M3a: control coverage expanded from five to eight controls, adding `SC-7`, `RA-3`, and `CA-7` by reusing existing collectors and patterns with no code changes (cffefdc). Live end-to-end verification against both fixtures closed the deferred check (e806298).
- M3b: `attestation`-pattern controls bypass the LLM loop entirely and return a code-generated `insufficient-evidence` judgment, so the guarantee is a property of the code rather than a prompt instruction (a80b79f).
- M3c: output-layer pattern and provenance awareness, threading each control's pattern into all three output surfaces so confidence labels distinguish code-determined from model self-reported judgments (8c679cb).
- M3d: `deterministic`-pattern controls dispatch to real TypeScript check functions for `SC-28` and `SC-7`, bypassing the LLM loop while keeping the citation guard in force (93c5ffc).
- M3e: Docker packaging via a multi-stage, non-root Dockerfile (c76a49e). Live build and run verification landed separately (e20a297).
- M3f: tag provenance, an optional authority-controlled chain of directional pattern-migration records validated fail-loud by the control loader and disclosed additively in both output surfaces (2496255).
- M3g: custody chain, producing tamper-evident evidence bundles with a per-file and root-hash manifest, a `verify-bundle` command, and Cosign signing over the manifest (a73e6d2).
- Official-schema conformance for OSCAL Assessment Results output, validated against NIST's own OSCAL assessment-results JSON schema and independently parsed through compliance-trestle (10716ab).

### Changed

- **Breaking for `target-id` consumers:** OSCAL findings now carry the NIST catalog token form of a control ID, for example `si-6.1`, because print-form IDs violate OSCAL's token datatype. The raw print-form ID is preserved on every finding as a `source-control-id` prop (10716ab).
- Version bumped to 0.3.0 (c9cda3a).

## [0.2.0] - 2026-06-26

### Added

- M2a: OSCAL Assessment Results writer with a fail-closed five-value to binary projection, plus CLI integration through `--oscal` (9d52139).
- M2b: Markdown auditor narrative renderer with CLI integration (d20c73a).
- M2c: confidence derived from actual retrieved evidence coverage rather than model self-report (476dd14).
- Shape validation of `submit_judgment` at the agent trust boundary (2d787f2).
- README, demo script, and the 0.1.0 version bump (1d9f0e3).

### Changed

- README implementation ledger synced to M1 completion, with demo recordings added (cdf2b69) and wording clarified (c25fc50).
- README synced to the shipped M2 surface: OSCAL writer, narrative renderer, confidence-as-coverage (ce38fe2).
- ISA closed out for M2b and M2c (fb90fc9, f01fb8f).

## [0.1.0] - 2026-06-10

### Added

- M0 scaffold: CLI, shared types, control loader, fixture provider, and evidence store (9b00bbf).
- M1: Anthropic tool-use loop, fail-closed citation guard, and the assessment runner (b247cdd).

[Unreleased]: https://github.com/joseruiz1571/mlassure/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/joseruiz1571/mlassure/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/joseruiz1571/mlassure/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/joseruiz1571/mlassure/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/joseruiz1571/mlassure/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/joseruiz1571/mlassure/releases/tag/v0.1.0
