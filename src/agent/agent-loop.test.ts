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

describe("agent loop — attestation pattern bypasses the LLM loop (M3b)", () => {
  const ATTESTATION_CONTROL: ControlItem = {
    id: "SA-10-TEST",
    framework: "SP 800-53",
    pattern: "attestation",
    intent: "Requires human sign-off.",
    collectors: [],
  };

  function makeCountingLlm(): { llm: LlmProvider; callCount: () => number } {
    let calls = 0;
    return {
      llm: {
        async complete(): Promise<LlmCompletionResult> {
          calls++;
          throw new Error("mockLlm.complete should never be called for an attestation-pattern control");
        },
      },
      callCount: () => calls,
    };
  }

  function makeCountingProvider(overrides: Partial<AwsProvider> = {}): {
    provider: AwsProvider;
    callCount: () => number;
  } {
    let calls = 0;
    const base = makeProvider(overrides);
    const wrapped = {} as AwsProvider;
    for (const key of Object.keys(base) as (keyof AwsProvider)[]) {
      // @ts-expect-error — dynamically wrapping each collector method to count invocations
      wrapped[key] = async (...args: unknown[]) => {
        calls++;
        // @ts-expect-error — forwarding to the underlying mock implementation
        return base[key](...args);
      };
    }
    return { provider: wrapped, callCount: () => calls };
  }

  it("ISC-229/230/231: never calls the LLM or any collector, and returns the exact bypass shape", async () => {
    const { llm, callCount: llmCalls } = makeCountingLlm();
    const { provider, callCount: providerCalls } = makeCountingProvider();

    const result = await assessControl(ATTESTATION_CONTROL, MOCK_TARGET, provider, llm);

    expect(llmCalls()).toBe(0);
    expect(providerCalls()).toBe(0);
    expect(result.judgment).toEqual({
      controlId: "SA-10-TEST",
      status: "insufficient-evidence",
      confidence: "high",
      rationale:
        'This control\'s pattern is "attestation": conformance cannot be determined from automated AWS evidence collection under any circumstance, so no collectors were invoked and no LLM assessment was run.',
      evidenceCited: [],
      gaps: [
        "Requires human attestation — see the control's intent for the specific sign-off required. This verdict was generated directly from the control's pattern, without an LLM call.",
      ],
    });
    expect(result.iterations).toBe(0);
    expect(result.calledCollectors.size).toBe(0);
    expect(result.citedCollectors.size).toBe(0);
  });

  it("ISC-232: a non-attestation control still calls the LLM at least once (bypass gate is not over-broad)", async () => {
    let calls = 0;
    const submittingLlm: LlmProvider = {
      async complete(): Promise<LlmCompletionResult> {
        calls++;
        return {
          stopReason: "tool_use",
          content: [
            {
              type: "tool_use",
              id: randomUUID(),
              name: "submit_judgment",
              input: {
                controlId: MOCK_CONTROL.id,
                status: "satisfied",
                confidence: "high",
                rationale: "ok",
                evidenceCited: [],
                gaps: [],
              },
            },
          ],
        };
      },
    };

    await assessControl(MOCK_CONTROL, MOCK_TARGET, makeProvider(), submittingLlm);

    expect(calls).toBeGreaterThanOrEqual(1);
  });

  it("ISC-233/ISC-225: an attestation control with non-empty collectors still bypasses, never invoking them", async () => {
    const attestationWithCollectors: ControlItem = {
      ...ATTESTATION_CONTROL,
      id: "SA-10-MISCONFIGURED-TEST",
      collectors: ["getModelCard", "getEndpointNetworkConfig"],
    };
    const { llm } = makeCountingLlm();
    const { provider, callCount: providerCalls } = makeCountingProvider();

    const result = await assessControl(attestationWithCollectors, MOCK_TARGET, provider, llm);

    expect(providerCalls()).toBe(0);
    expect(result.judgment.status).toBe("insufficient-evidence");
    expect(result.calledCollectors.size).toBe(0);
  });
});
