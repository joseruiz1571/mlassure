import type { RawEvidence, AssessmentTarget } from "../types.js";

export interface AwsProvider {
  getModelRegistryEntry(target: AssessmentTarget): Promise<RawEvidence | null>;
  getModelCard(target: AssessmentTarget): Promise<RawEvidence | null>;
  getEndpointConfig(target: AssessmentTarget): Promise<RawEvidence | null>;
  getDataCaptureConfig(target: AssessmentTarget): Promise<RawEvidence | null>;
  getModelMonitorSchedules(target: AssessmentTarget): Promise<RawEvidence[]>;
  getKMSConfig(target: AssessmentTarget): Promise<RawEvidence | null>;
  getEndpointNetworkConfig(target: AssessmentTarget): Promise<RawEvidence | null>;
  getEndpointExecutionRole(target: AssessmentTarget): Promise<RawEvidence | null>;
  getCloudTrailEvents(
    target: AssessmentTarget,
    since: Date
  ): Promise<RawEvidence[]>;
}
