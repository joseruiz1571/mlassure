import type { AwsProvider } from "../providers/aws-provider.interface.js";
import type { AssessmentTarget, RawEvidence } from "../types.js";

type CollectorResult = RawEvidence | null | RawEvidence[];

type CollectorFn = (
  provider: AwsProvider,
  target: AssessmentTarget
) => Promise<CollectorResult>;

const EXECUTOR_MAP: Record<string, CollectorFn> = {
  getModelRegistryEntry: (p, t) => p.getModelRegistryEntry(t),
  getModelCard: (p, t) => p.getModelCard(t),
  getEndpointConfig: (p, t) => p.getEndpointConfig(t),
  getDataCaptureConfig: (p, t) => p.getDataCaptureConfig(t),
  getModelMonitorSchedules: (p, t) => p.getModelMonitorSchedules(t),
  getKMSConfig: (p, t) => p.getKMSConfig(t),
  getEndpointNetworkConfig: (p, t) => p.getEndpointNetworkConfig(t),
  getEndpointExecutionRole: (p, t) => p.getEndpointExecutionRole(t),
  getCloudTrailEvents: (p, t) =>
    p.getCloudTrailEvents(t, new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)),
};

export async function executeCollector(
  name: string,
  provider: AwsProvider,
  target: AssessmentTarget
): Promise<CollectorResult> {
  const fn = EXECUTOR_MAP[name];
  if (!fn) throw new Error(`Unknown collector tool: "${name}"`);
  return fn(provider, target);
}

export function isKnownCollector(name: string): boolean {
  return name in EXECUTOR_MAP;
}
