import type {
  ControlSet,
  AssessmentTarget,
  Judgment,
  AgentPattern,
  TagProvenanceRecord,
  Evidence,
} from "../types.js";
import {
  catalogProblems,
  hasCollector,
  type EvidenceProvider,
} from "../providers/evidence-provider.interface.js";
import type { LlmProvider } from "../llm/llm-provider.interface.js";
import {
  assessControl,
  MissingDeterministicChecksError,
  UnknownCollectorsError,
  DeterministicCheckFamilyError,
  InvalidCollectorCatalogError,
  ControlSetFamilyError,
} from "../agent/agent.js";
import { findDeterministicCheck } from "../agent/deterministic-checks.js";
import { AWS_SAGEMAKER_FAMILY } from "../providers/aws-sagemaker.js";

/** A cited evidence item retained for downstream output (OSCAL, narrative). */
export type CitedEvidence = {
  id: string;
  source: string;
  sha256: string;
  retrievedAt: string;
};

export type ControlResult = {
  controlId: string;
  /**
   * Exact control intent text from the loaded control set — the wording
   * the agent was given. Optional so hand-built test results stay valid;
   * runAssessment always populates it.
   */
  controlIntent?: string;
  /**
   * The control's `notAssessed` text, copied only when the control set has
   * one (M8b): what the requirement asks that mlassure did not assess. Both
   * renderers carry it. The control's `note` is never copied.
   */
  notAssessed?: string;
  /**
   * The control's framework string: which text of the standard the verdict
   * was judged against (M8c). Present only on a report whose family is set
   * and is not `aws-sagemaker`, so a SageMaker result keeps its key set.
   */
  framework?: string;
  /**
   * The control's declared pattern, copied at construction time. Verified
   * (M3c) to always match the pattern actually used to produce `judgment` —
   * `agent.ts` has exactly one pattern-runtime-branch (the attestation
   * bypass) and no fallback that could execute a different mechanism than
   * declared. Re-verify this invariant if a future change (e.g. deterministic
   * bypass) introduces a runtime fallback between patterns.
   */
  pattern: AgentPattern;
  judgment: Judgment;
  evidenceCount: number;
  iterations: number;
  /**
   * The evidence items the judgment actually cited, retained with their content
   * hashes so any downstream consumer (OSCAL writer, narrative renderer) can
   * carry provenance without re-reaching into the per-control EvidenceStore.
   */
  citedEvidence: CitedEvidence[];
  /**
   * Confidence-as-coverage (M2c): fraction of the control's tagged-relevant
   * collectors whose evidence was actually cited in the judgment. Denominator
   * is the TAGGED set (collectorsTagged), not the attempted set — citing
   * everything you called isn't full coverage if you never called half of
   * what the control requires. A control with zero tagged collectors
   * (pure attestation pattern) is vacuously 1.0 — there is nothing AWS-side
   * to have missed.
   */
  evidenceCoverage: number;
  collectorsTagged: number;
  /**
   * Deliberately retained but not yet surfaced in any output (OSCAL/narrative/CLI).
   * The called-vs-cited gap (collectorsCalled > collectorsCited) is the signal for
   * "the agent looked but chose not to cite," distinct from "the agent never
   * looked" (collectorsCalled < collectorsTagged) — both currently collapse into
   * the same evidenceCoverage ratio. Kept on the type now so a future pass can
   * surface the distinction without re-deriving it; not yet load-bearing.
   */
  collectorsCalled: number;
  collectorsCited: number;
  /** Deterministic bucket derived from evidenceCoverage — never the model's self-report. */
  coverageConfidence: Judgment["confidence"];
  /**
   * Custody retention (M3g): the control's FULL evidence store contents —
   * payloads included, cited or not. Custody covers what the assessor SAW,
   * not just what it cited; the citation guard already guarantees
   * citedEvidence ⊆ this set. Optional on the type so hand-built results
   * (tests, older producers) stay valid, but the runner always populates it
   * and the bundle writer fails loud when it's absent.
   */
  retrievedEvidence?: Evidence[];
  /**
   * The control's tag-provenance history (M3f), copied per-record at
   * construction so downstream consumers never share mutable record refs
   * with the loaded ControlSet. Present only when the control YAML
   * recorded provenance — outputs are strictly additive on this field.
   */
  tagProvenance?: TagProvenanceRecord[];
};

/**
 * Exported for direct unit testing — the corruption this guards against (NaN,
 * Infinity, out-of-range) cannot occur through the real pipeline today (the
 * caller always passes a Set.size/Set.size ratio with an explicit zero-tagged
 * guard), but a fail-loud check here means the NEXT formula change inherits a
 * thrown error instead of a silent "medium" default for anything unexpected.
 */
export function deriveCoverageConfidence(
  evidenceCoverage: number,
  collectorsTagged: number
): Judgment["confidence"] {
  if (collectorsTagged === 0) return "high";
  if (!Number.isFinite(evidenceCoverage) || evidenceCoverage < 0 || evidenceCoverage > 1) {
    throw new Error(
      `deriveCoverageConfidence: evidenceCoverage out of range (${evidenceCoverage}) ` +
        `for collectorsTagged=${collectorsTagged} — refusing to derive a confidence ` +
        `bucket from a corrupted ratio.`
    );
  }
  if (evidenceCoverage === 1) return "high";
  if (evidenceCoverage === 0) return "low";
  return "medium";
}

export type AssessmentReport = {
  targetName: string;
  endpointName: string;
  controlSetVersion: string;
  runAt: string;
  results: ControlResult[];
  /**
   * LLM alias requested for this run (e.g. claude-sonnet-4-6). Filled by
   * the CLI from AnthropicProvider.model — not by runAssessment, which
   * only sees the LlmProvider interface. Optional so unit tests stay valid.
   */
  llmModel?: string;
  /**
   * Temperature actually configured on the provider for this run. 0 is a
   * valid value. Filled by the CLI; optional for the same reason as llmModel.
   */
  llmTemperature?: number;
  /**
   * 1-based replica index when --repeat N is used. Absent on single runs.
   */
  replica?: number;
  /**
   * The target family (M8b): the control set's declared `family`, equal to
   * the provider's by the preflight; otherwise the provider's family when it
   * is not `aws-sagemaker`; otherwise absent, so a SageMaker report keeps its
   * pre-M8b shape. The narrative reads it to word labels for the family, so
   * report wording follows the provider even when the control file is silent.
   */
  family?: string;
  /**
   * Where the evidence came from and what the verdicts therefore do not
   * say, as one sentence supplied by the family (M8c). Present only when
   * `family` is set, is not `aws-sagemaker`, and the provider supplies one.
   */
  evidenceScope?: string;
};

export async function runAssessment(
  controlSet: ControlSet,
  target: AssessmentTarget,
  provider: EvidenceProvider,
  llm: LlmProvider
): Promise<AssessmentReport> {
  // Preflight (M3d, advisor-mandated): abort the WHOLE run before any control
  // is assessed if any deterministic-pattern control is missing its registered
  // check — not lazily inside assessControl(), where a gap would only surface
  // after earlier controls already burned real LLM calls. Lists every missing
  // ID at once, not just the first, so one run reveals the full gap.
  const missingChecks = controlSet.controls
    .filter((c) => c.pattern === "deterministic" && !findDeterministicCheck(c.id))
    .map((c) => c.id);
  if (missingChecks.length > 0) {
    throw new MissingDeterministicChecksError(missingChecks);
  }

  // Preflight (M8b): a control set that names its family runs against that
  // family only. Its control ids and collector names may happen to exist in
  // another family too; the declared family is the author's intent.
  if (controlSet.family !== undefined && controlSet.family !== provider.family) {
    throw new ControlSetFamilyError(controlSet.family, provider.family);
  }

  // Preflight (M8a): collector names and control ids are strings, so the
  // control set is checked against the provider here instead of by the
  // compiler. Runs after the missing-check preflight so a control set with
  // both faults still fails the way it did before M8a.
  const problems = catalogProblems(provider);
  if (problems.length > 0) {
    throw new InvalidCollectorCatalogError(provider.family, problems);
  }

  const deterministic = controlSet.controls.flatMap((c) => {
    const check = c.pattern === "deterministic" ? findDeterministicCheck(c.id) : undefined;
    return check ? [{ controlId: c.id, check }] : [];
  });
  const familyMismatches = deterministic
    .filter(({ check }) => check.family !== provider.family)
    .map(({ controlId, check }) => ({ controlId, checkFamily: check.family }));
  if (familyMismatches.length > 0) {
    throw new DeterministicCheckFamilyError(familyMismatches, provider.family);
  }

  // Tagged collectors on every control, plus the collectors each registered
  // check actually runs — a check reaches for its collectors by name whatever
  // the control's own list says.
  const named = [
    ...controlSet.controls.flatMap((c) =>
      c.collectors.map((collector) => ({ controlId: c.id, collector }))
    ),
    ...deterministic.flatMap(({ controlId, check }) =>
      check.requires.map((collector) => ({ controlId, collector }))
    ),
  ];
  const seen = new Set<string>();
  const unknownCollectors = named.filter(({ controlId, collector }) => {
    const key = JSON.stringify([controlId, collector]);
    if (seen.has(key) || hasCollector(provider, collector)) return false;
    seen.add(key);
    return true;
  });
  if (unknownCollectors.length > 0) {
    throw new UnknownCollectorsError(provider.family, unknownCollectors);
  }

  const reportFamily =
    controlSet.family ?? (provider.family !== AWS_SAGEMAKER_FAMILY ? provider.family : undefined);
  // M8c: scope travels with the verdict for a declared non-SageMaker family
  // only, the same rule the narrative's family wording follows.
  const familyScoped = reportFamily !== undefined && reportFamily !== AWS_SAGEMAKER_FAMILY;
  const evidenceScope = familyScoped ? provider.wording?.evidenceScope : undefined;

  const results: ControlResult[] = [];

  for (const control of controlSet.controls) {
    const { judgment, store, iterations, calledCollectors, citedCollectors } =
      await assessControl(control, target, provider, llm);
    const cited = new Set(judgment.evidenceCited);
    const citedEvidence: CitedEvidence[] = store
      .bundle()
      .filter((e) => cited.has(e.id))
      .map((e) => ({
        id: e.id,
        source: e.source,
        sha256: e.sha256,
        retrievedAt: e.retrievedAt,
      }));

    // Set, not .length — citedCollectors/calledCollectors are already Sets, so a
    // duplicate entry in a control's tagged collector list must not inflate the
    // denominator asymmetrically and silently corrupt the ratio (e.g. a control
    // YAML accidentally listing the same collector twice would otherwise compute
    // a non-1.0 ratio for genuinely full coverage).
    const collectorsTagged = new Set(control.collectors).size;
    const collectorsCalled = calledCollectors.size;
    const collectorsCited = citedCollectors.size;
    const evidenceCoverage =
      collectorsTagged === 0 ? 1 : collectorsCited / collectorsTagged;

    results.push({
      controlId: control.id,
      controlIntent: control.intent,
      ...(control.notAssessed !== undefined ? { notAssessed: control.notAssessed } : {}),
      ...(familyScoped ? { framework: control.framework } : {}),
      pattern: control.pattern,
      judgment,
      evidenceCount: store.size(),
      iterations,
      citedEvidence,
      evidenceCoverage,
      collectorsTagged,
      collectorsCalled,
      collectorsCited,
      coverageConfidence: deriveCoverageConfidence(evidenceCoverage, collectorsTagged),
      retrievedEvidence: store.bundle().map((e) => ({ ...e })),
      ...(control.tagProvenance !== undefined
        ? { tagProvenance: control.tagProvenance.map((r) => ({ ...r })) }
        : {}),
    });
  }

  return {
    targetName: target.modelName,
    endpointName: target.endpointName,
    controlSetVersion: controlSet.version,
    runAt: new Date().toISOString(),
    results,
    ...(reportFamily !== undefined ? { family: reportFamily } : {}),
    ...(evidenceScope !== undefined ? { evidenceScope } : {}),
  };
}
