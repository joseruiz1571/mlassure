import type { LlmToolDef } from "../llm/llm-provider.interface.js";

const COLLECTOR_DEFS: Record<string, { description: string }> = {
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

function collectorDef(name: string): LlmToolDef {
  const def = COLLECTOR_DEFS[name];
  if (!def) throw new Error(`Unknown collector: ${name}`);
  return {
    name,
    description: def.description,
    input_schema: { type: "object", properties: {}, required: [] },
  };
}

export function buildToolDefs(collectorNames: string[]): LlmToolDef[] {
  return collectorNames.map(collectorDef);
}

export const SUBMIT_JUDGMENT_TOOL: LlmToolDef = {
  name: "submit_judgment",
  description:
    "Submit your final conformance judgment for the assessed control. Call this when you have gathered sufficient evidence. Every ID in evidenceCited must be from evidence you actually retrieved during this session.",
  input_schema: {
    type: "object",
    properties: {
      controlId: {
        type: "string",
        description: "The control ID being assessed.",
      },
      status: {
        type: "string",
        enum: [
          "satisfied",
          "partially-satisfied",
          "not-satisfied",
          "not-applicable",
          "insufficient-evidence",
        ],
        description: "Overall conformance verdict.",
      },
      confidence: {
        type: "string",
        enum: ["high", "medium", "low"],
        description: "Confidence level in the verdict given the evidence gathered.",
      },
      rationale: {
        type: "string",
        description:
          "Plain-language explanation of the verdict. Reference only evidence you retrieved.",
      },
      evidenceCited: {
        type: "array",
        items: { type: "string" },
        description:
          "Array of evidence item IDs you are citing. Each ID must appear in a tool response you received this session.",
      },
      gaps: {
        type: "array",
        items: { type: "string" },
        description:
          "Evidence that would be needed but was not available, or items requiring human attestation.",
      },
    },
    required: [
      "controlId",
      "status",
      "confidence",
      "rationale",
      "evidenceCited",
      "gaps",
    ],
  },
};
