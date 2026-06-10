import { describe, it, expect } from "bun:test";
import { assessControl } from "./agent.js";
import type { LlmProvider, LlmCompletionParams, LlmCompletionResult } from "../llm/llm-provider.interface.js";
import type { AwsProvider } from "../providers/aws-provider.interface.js";
import type { ControlItem, AssessmentTarget, RawEvidence } from "../types.js";
import { randomUUID } from "node:crypto";

function mockRaw(source: string, payload: unknown): RawEvidence {
  return { id: randomUUID(), source, retrievedAt: new Date().toISOString(), payload };
}

const MOCK_TARGET: AssessmentTarget = {
  modelName: "test-model",
  endpointName: "test-endpoint",
};

const MOCK_CONTROL: ControlItem = {
  id: "TEST-1",
  framework: "SP 800-53",
  pattern: "synthesis",
  intent: "The model is monitored.",
  collectors: ["getDataCaptureConfig", "getModelMonitorSchedules"],
};

function makeProvider(overrides: Partial<AwsProvider> = {}): AwsProvider {
  return {
    getModelRegistryEntry: async () => mockRaw("registry", { approved: true }),
    getModelCard: async () => null,
    getEndpointConfig: async () => null,
    getDataCaptureConfig: async () => mockRaw("data-capture", { enabled: true }),
    getModelMonitorSchedules: async () => [mockRaw("monitors", { type: "ModelQuality" })],
    getKMSConfig: async () => null,
    getEndpointNetworkConfig: async () => null,
    getEndpointExecutionRole: async () => null,
    getCloudTrailEvents: async () => [],
    ...overrides,
  };
}

describe("agent loop — unit (no API key required)", () => {
  it("handles parallel tool_use calls in one response and sends all results in one user message", async () => {
    let capturedMessages: unknown[] = [];

    // Simulate: first call returns TWO parallel tool_use blocks; second call calls submit_judgment
    let callCount = 0;
    const mockLlm: LlmProvider = {
      async complete(params: LlmCompletionParams): Promise<LlmCompletionResult> {
        capturedMessages = params.messages;
        callCount++;

        if (callCount === 1) {
          // Return two parallel tool calls
          return {
            stopReason: "tool_use",
            content: [
              { type: "tool_use", id: "tu-1", name: "getDataCaptureConfig", input: {} },
              { type: "tool_use", id: "tu-2", name: "getModelMonitorSchedules", input: {} },
            ],
          };
        }

        // On second call: the user message before this should have TWO tool_results
        const lastMsg = params.messages[params.messages.length - 1];
        const content = Array.isArray((lastMsg as { content: unknown }).content)
          ? ((lastMsg as { content: unknown[] }).content)
          : [];
        const toolResultCount = content.filter(
          (b) => (b as { type: string }).type === "tool_result"
        ).length;
        expect(toolResultCount).toBe(2); // both tool calls got results in one message

        // Submit judgment citing both evidence IDs from the store (they're in tool results)
        const toolResultContents = content
          .filter((b) => (b as { type: string }).type === "tool_result")
          .map((b) => {
            const parsed = JSON.parse((b as { content: string }).content);
            return Array.isArray(parsed) ? parsed[0]?.id : null;
          })
          .filter(Boolean) as string[];

        return {
          stopReason: "tool_use",
          content: [
            {
              type: "tool_use",
              id: "tu-3",
              name: "submit_judgment",
              input: {
                controlId: "TEST-1",
                status: "satisfied",
                confidence: "high",
                rationale: "Evidence retrieved.",
                evidenceCited: toolResultContents,
                gaps: [],
              },
            },
          ],
        };
      },
    };

    const result = await assessControl(MOCK_CONTROL, MOCK_TARGET, makeProvider(), mockLlm);

    expect(result.judgment.controlId).toBe("TEST-1");
    expect(result.judgment.status).toBe("satisfied");
    expect(result.store.size()).toBe(2); // both parallel collectors stored
    expect(callCount).toBe(2);
    expect(capturedMessages.length).toBeGreaterThan(0);
  });

  it("citation guard blocks a hallucinated evidence ID", async () => {
    const mockLlm: LlmProvider = {
      async complete(): Promise<LlmCompletionResult> {
        return {
          stopReason: "tool_use",
          content: [
            {
              type: "tool_use",
              id: "tu-1",
              name: "submit_judgment",
              input: {
                controlId: "TEST-1",
                status: "satisfied",
                confidence: "high",
                rationale: "Hallucinated.",
                evidenceCited: ["phantom-id-that-was-never-retrieved"],
                gaps: [],
              },
            },
          ],
        };
      },
    };

    await expect(
      assessControl(MOCK_CONTROL, MOCK_TARGET, makeProvider(), mockLlm)
    ).rejects.toThrow("phantom-id-that-was-never-retrieved");
  });

  it("executor error becomes a tool_result and loop continues", async () => {
    let callCount = 0;
    const mockLlm: LlmProvider = {
      async complete(params: LlmCompletionParams): Promise<LlmCompletionResult> {
        callCount++;
        if (callCount === 1) {
          return {
            stopReason: "tool_use",
            content: [
              { type: "tool_use", id: "tu-err", name: "getDataCaptureConfig", input: {} },
            ],
          };
        }
        // On second call: the tool result should contain the error message, not a throw
        const lastMsg = params.messages[params.messages.length - 1];
        const content = (lastMsg as { content: unknown[] }).content ?? [];
        const tr = content.find((b) => (b as { type: string }).type === "tool_result") as {
          content: string;
        } | undefined;
        expect(tr?.content).toContain("Error collecting evidence");

        return {
          stopReason: "tool_use",
          content: [
            {
              type: "tool_use",
              id: "tu-done",
              name: "submit_judgment",
              input: {
                controlId: "TEST-1",
                status: "insufficient-evidence",
                confidence: "low",
                rationale: "Could not retrieve evidence.",
                evidenceCited: [],
                gaps: ["Data capture config unavailable"],
              },
            },
          ],
        };
      },
    };

    // Provide a failing collector
    const failingProvider = makeProvider({
      getDataCaptureConfig: async () => {
        throw new Error("AWS SDK not configured");
      },
    });

    const result = await assessControl(MOCK_CONTROL, MOCK_TARGET, failingProvider, mockLlm);

    expect(result.judgment.status).toBe("insufficient-evidence");
    expect(callCount).toBe(2);
  });

  it("throws after MAX_ITERATIONS without judgment", async () => {
    const loopLlm: LlmProvider = {
      async complete(): Promise<LlmCompletionResult> {
        // Always calls a tool, never submits judgment
        return {
          stopReason: "tool_use",
          content: [
            { type: "tool_use", id: randomUUID(), name: "getDataCaptureConfig", input: {} },
          ],
        };
      },
    };

    await expect(
      assessControl(MOCK_CONTROL, MOCK_TARGET, makeProvider(), loopLlm)
    ).rejects.toThrow("exceeded");
  });
});
