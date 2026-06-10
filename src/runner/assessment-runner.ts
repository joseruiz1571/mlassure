import type { ControlSet, AssessmentTarget, Judgment } from "../types.js";
import type { AwsProvider } from "../providers/aws-provider.interface.js";
import type { LlmProvider } from "../llm/llm-provider.interface.js";
import { assessControl } from "../agent/agent.js";

export type ControlResult = {
  controlId: string;
  judgment: Judgment;
  evidenceCount: number;
  iterations: number;
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
    results.push({
      controlId: control.id,
      judgment,
      evidenceCount: store.size(),
      iterations,
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
