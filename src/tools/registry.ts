import type { LlmToolDef } from "../llm/llm-provider.interface.js";
import {
  hasCollector,
  type EvidenceProvider,
} from "../providers/evidence-provider.interface.js";

function collectorDef(name: string, provider: EvidenceProvider): LlmToolDef {
  if (!hasCollector(provider, name)) {
    throw new Error(`Unknown collector: ${name}`);
  }
  return {
    name,
    description: provider.collectors[name]!.description,
    input_schema: { type: "object", properties: {}, required: [] },
  };
}

export function buildToolDefs(
  collectorNames: string[],
  provider: EvidenceProvider
): LlmToolDef[] {
  return collectorNames.map((name) => collectorDef(name, provider));
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
