import type { RawEvidence, AssessmentTarget } from "../types.js";
import type {
  CollectorResult,
  CollectorSpec,
  EvidenceProvider,
} from "./evidence-provider.interface.js";

/**
 * The SageMaker family's typed collector surface. Fixture and live
 * implementations implement THIS, so a missing or misspelled collector
 * inside the family is a type error; `awsSageMakerProvider()` adapts it to
 * the generic `EvidenceProvider` the rest of the system sees.
 */
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

export const AWS_SAGEMAKER_FAMILY = "aws-sagemaker";

const CLOUDTRAIL_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000;

// Both tables are mapped over `keyof AwsProvider`: adding a method to the
// interface without a description and a dispatch entry fails typecheck.
export const AWS_SAGEMAKER_COLLECTORS: {
  readonly [K in keyof AwsProvider]: CollectorSpec;
} = {
  getModelRegistryEntry: {
    description:
      "Retrieves the model package registry entry: approval status, approval timestamp, version, lineage, and ARN.",
  },
  getModelCard: {
    description:
      "Retrieves the model card: intended use, limitations, risk rating, and evaluation details. Returns null if no card exists.",
  },
  getEndpointConfig: {
    description:
      "Retrieves the endpoint configuration: instance type, network isolation flag, and data-capture settings.",
  },
  getDataCaptureConfig: {
    description:
      "Retrieves inference data capture configuration: whether capture is enabled, capture percentage, and destination S3 path. A prerequisite for drift and quality monitoring.",
  },
  getModelMonitorSchedules: {
    description:
      "Retrieves all model monitor schedules for the endpoint: schedule name, type (DataQuality / ModelQuality / ModelBias / ModelExplainability), schedule status, last run status, last run time, and baseline creation timestamp.",
  },
  getKMSConfig: {
    description:
      "Retrieves KMS encryption configuration for model artifacts and endpoint volumes: key ARN, key manager (CUSTOMER vs AWS), and enabled status.",
  },
  getEndpointNetworkConfig: {
    description:
      "Retrieves VPC and network isolation configuration: VPC ID, subnet IDs, security group IDs, and network isolation flag.",
  },
  getEndpointExecutionRole: {
    description:
      "Retrieves the IAM execution role attached to the endpoint: role ARN and all attached policy statements (effect, actions, resources). Critical for least-privilege assessment.",
  },
  getCloudTrailEvents: {
    description:
      "Retrieves recent CloudTrail events for the model/endpoint: event names, timestamps, user identity, and request parameters. Covers CreateEndpoint, UpdateEndpoint, and registry approval events for change-control analysis.",
  },
};

const DISPATCH: {
  readonly [K in keyof AwsProvider]: (
    impl: AwsProvider,
    target: AssessmentTarget
  ) => Promise<CollectorResult>;
} = {
  getModelRegistryEntry: (p, t) => p.getModelRegistryEntry(t),
  getModelCard: (p, t) => p.getModelCard(t),
  getEndpointConfig: (p, t) => p.getEndpointConfig(t),
  getDataCaptureConfig: (p, t) => p.getDataCaptureConfig(t),
  getModelMonitorSchedules: (p, t) => p.getModelMonitorSchedules(t),
  getKMSConfig: (p, t) => p.getKMSConfig(t),
  getEndpointNetworkConfig: (p, t) => p.getEndpointNetworkConfig(t),
  getEndpointExecutionRole: (p, t) => p.getEndpointExecutionRole(t),
  getCloudTrailEvents: (p, t) =>
    p.getCloudTrailEvents(t, new Date(Date.now() - CLOUDTRAIL_LOOKBACK_MS)),
};

export function awsSageMakerProvider(impl: AwsProvider): EvidenceProvider {
  return {
    family: AWS_SAGEMAKER_FAMILY,
    collectors: AWS_SAGEMAKER_COLLECTORS,
    async collect(name, target) {
      if (!Object.hasOwn(DISPATCH, name)) {
        throw new Error(`Unknown collector tool: "${name}"`);
      }
      return DISPATCH[name as keyof AwsProvider](impl, target);
    },
  };
}
