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
};

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
    const { judgment, store, iterations } = await assessControl(
      control,
      target,
      provider,
      llm
    );
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
    results.push({
      controlId: control.id,
      judgment,
      evidenceCount: store.size(),
      iterations,
      citedEvidence,
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
