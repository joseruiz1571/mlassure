import type { ControlSet, AssessmentTarget, Judgment } from "../types.js";
import type { AwsProvider } from "../providers/aws-provider.interface.js";
import type { LlmProvider } from "../llm/llm-provider.interface.js";
import { assessControl } from "../agent/agent.js";

/** A cited evidence item retained for downstream output (OSCAL, narrative). */
export type CitedEvidence = {
  id: string;
  source: string;
  sha256: string;
  retrievedAt: string;
};

export type ControlResult = {
  controlId: string;
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
};

export async function runAssessment(
  controlSet: ControlSet,
  target: AssessmentTarget,
  provider: AwsProvider,
  llm: LlmProvider
): Promise<AssessmentReport> {
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
      judgment,
      evidenceCount: store.size(),
      iterations,
      citedEvidence,
      evidenceCoverage,
      collectorsTagged,
      collectorsCalled,
      collectorsCited,
      coverageConfidence: deriveCoverageConfidence(evidenceCoverage, collectorsTagged),
    });
  }

  return {
    targetName: target.modelName,
    endpointName: target.endpointName,
    controlSetVersion: controlSet.version,
    runAt: new Date().toISOString(),
    results,
  };
}
