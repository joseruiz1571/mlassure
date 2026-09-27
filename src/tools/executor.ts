import {
  hasCollector,
  type CollectorResult,
  type EvidenceProvider,
} from "../providers/evidence-provider.interface.js";
import type { AssessmentTarget } from "../types.js";

export async function executeCollector(
  name: string,
  provider: EvidenceProvider,
  target: AssessmentTarget
): Promise<CollectorResult> {
  if (!hasCollector(provider, name)) {
    throw new Error(`Unknown collector tool: "${name}"`);
  }
  return provider.collect(name, target);
}

export function isKnownCollector(
  name: string,
  provider: EvidenceProvider
): boolean {
  return hasCollector(provider, name);
}
