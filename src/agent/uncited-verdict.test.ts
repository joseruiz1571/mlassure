/**
 * M8c: a verdict that asserts conformance must cite evidence. On the model
 * path the refusal goes back to the model and the loop continues; on the
 * code path it throws. A phantom citation still ends the run, as before.
 */
import { describe, it, expect } from "bun:test";
import { assessControl } from "./agent.js";
import { finalizeJudgment } from "./deterministic-checks.js";
import { awsSageMakerProvider, type AwsProvider } from "../providers/aws-sagemaker.js";
import { EvidenceStore } from "../store/evidence-store.js";
import { CitationError, UncitedVerdictError } from "../guard/citation-guard.js";
import type { LlmProvider, LlmCompletionParams, LlmContentBlock } from "../llm/llm-provider.interface.js";
import type { ControlItem, AssessmentTarget, Judgment, RawEvidence } from "../types.js";

const TARGET: AssessmentTarget = { modelName: "m", endpointName: "e" };
const CONTROL: ControlItem = {
  id: "TEST-1",
  framework: "test",
  pattern: "synthesis",
  intent: "The model is monitored.",
  collectors: ["getDataCaptureConfig"],
};
const EVIDENCE_ID = "ev-data-capture";

function provider() {
  const none = async () => null;
  const impl: AwsProvider = {
    getModelRegistryEntry: none,
    getModelCard: none,
    getEndpointConfig: none,
    getDataCaptureConfig: async (): Promise<RawEvidence> => ({
      id: EVIDENCE_ID,
      source: "data-capture",
      retrievedAt: "2026-09-28T00:00:00.000Z",
      payload: { enabled: true },
    }),
    getModelMonitorSchedules: async () => [],
    getKMSConfig: none,
    getEndpointNetworkConfig: none,
    getEndpointExecutionRole: none,
    getCloudTrailEvents: async () => [],
  };
  return awsSageMakerProvider(impl);
}

function submit(status: Judgment["status"], evidenceCited: string[]): LlmContentBlock {
  return {
    type: "tool_use",
    id: `tu-${Math.random()}`,
    name: "submit_judgment",
    input: { controlId: CONTROL.id, status, confidence: "medium", rationale: "r", evidenceCited, gaps: [] },
  };
}

/**
 * Plays `responses` in order, repeating the last. Records, per call, the
 * tool results the model had just received: the loop keeps appending to one
 * messages array, so it is read at call time, not afterwards.
 */
function scripted(responses: LlmContentBlock[][]): { llm: LlmProvider; calls: LlmCompletionParams[]; received: string[] } {
  const calls: LlmCompletionParams[] = [];
  const received: string[] = [];
  return {
    calls,
    received,
    llm: {
      async complete(params) {
        calls.push(params);
        received.push(lastToolResults(params));
        return { stopReason: "tool_use", content: responses[Math.min(calls.length, responses.length) - 1]! };
      },
    },
  };
}

function lastToolResults(params: LlmCompletionParams): string {
  const last = params.messages[params.messages.length - 1]!;
  const blocks = Array.isArray(last.content) ? last.content : [];
  const results = blocks.filter((b) => b.type === "tool_result");
  return results.map((b) => (b.type === "tool_result" ? b.content : "")).join(" | ");
}

describe("M8c: an uncited conformance verdict on the model path", () => {
  it("is returned to the model; a model that then collects and cites completes normally", async () => {
    const { llm, calls, received } = scripted([
      [submit("satisfied", [])],
      [{ type: "tool_use", id: "tu-collect", name: "getDataCaptureConfig", input: {} }, submit("satisfied", [EVIDENCE_ID])],
    ]);
    const r = await assessControl(CONTROL, TARGET, provider(), llm);
    expect(calls).toHaveLength(2);
    expect(received[1]).toContain(`Judgment refused: Judgment for control "TEST-1" is "satisfied" but cites no evidence`);
    expect(r.judgment.status).toBe("satisfied");
    expect(r.judgment.evidenceCited).toEqual([EVIDENCE_ID]);
    expect(r.iterations).toBe(2);
  });

  it("a model that then submits insufficient-evidence with nothing cited completes normally", async () => {
    const { llm, calls, received } = scripted([[submit("partially-satisfied", [])], [submit("insufficient-evidence", [])]]);
    const r = await assessControl(CONTROL, TARGET, provider(), llm);
    expect(calls).toHaveLength(2);
    expect(received[1]).toContain(`"partially-satisfied" but cites no evidence`);
    expect(r.judgment.status).toBe("insufficient-evidence");
  });

  it("a model that never recovers ends at the iteration cap with the existing error", async () => {
    const { llm, calls } = scripted([[submit("satisfied", [])]]);
    await expect(assessControl(CONTROL, TARGET, provider(), llm)).rejects.toThrow(
      "Agent exceeded 10 iterations without submitting a judgment"
    );
    expect(calls).toHaveLength(10);
  });

  it("a phantom citation still ends the run with CitationError, never returned to the model", async () => {
    const { llm, calls } = scripted([[submit("satisfied", ["phantom-id"])]]);
    await expect(assessControl(CONTROL, TARGET, provider(), llm)).rejects.toBeInstanceOf(CitationError);
    expect(calls).toHaveLength(1);
  });
});

describe("M8c: an uncited conformance verdict on the code path", () => {
  it("throws through finalizeJudgment, the path every deterministic check takes", () => {
    for (const status of ["satisfied", "partially-satisfied"] as const) {
      const judgment: Judgment = {
        controlId: "PoC-7.7.1",
        status,
        confidence: "high",
        rationale: "code-run",
        evidenceCited: [],
        gaps: [],
      };
      expect(() => finalizeJudgment(judgment, new EvidenceStore())).toThrow(UncitedVerdictError);
    }
  });
});
