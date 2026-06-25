import { describe, it, expect } from "bun:test";
import { runAssessment, deriveCoverageConfidence } from "./assessment-runner.js";
import type { LlmProvider, LlmCompletionResult } from "../llm/llm-provider.interface.js";
import type { AwsProvider } from "../providers/aws-provider.interface.js";
import type { ControlItem, ControlSet, AssessmentTarget, RawEvidence } from "../types.js";
import { randomUUID } from "node:crypto";

function mockRaw(source: string, payload: unknown): RawEvidence {
  return { id: randomUUID(), source, retrievedAt: new Date().toISOString(), payload };
}

const MOCK_TARGET: AssessmentTarget = {
  modelName: "test-model",
  endpointName: "test-endpoint",
};

function makeProvider(overrides: Partial<AwsProvider> = {}): AwsProvider {
  return {
    getModelRegistryEntry: async () => null,
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

function controlSetOf(control: ControlItem): ControlSet {
  return { version: "test-1.0", controls: [control] };
}

describe("runAssessment — confidence-as-coverage (M2c)", () => {
  it("full coverage: every tagged collector called and cited yields evidenceCoverage 1 and coverageConfidence high", async () => {
    const control: ControlItem = {
      id: "FULL-1",
      framework: "SP 800-53",
      pattern: "synthesis",
      intent: "Full coverage case.",
      collectors: ["getDataCaptureConfig", "getModelMonitorSchedules"],
    };

    let callCount = 0;
    const mockLlm: LlmProvider = {
      async complete(params): Promise<LlmCompletionResult> {
        callCount++;
        if (callCount === 1) {
          return {
            stopReason: "tool_use",
            content: [
              { type: "tool_use", id: "tu-1", name: "getDataCaptureConfig", input: {} },
              { type: "tool_use", id: "tu-2", name: "getModelMonitorSchedules", input: {} },
            ],
          };
        }
        // Capture both evidence ids from the prior message's tool_results so the
        // judgment can honestly cite real ids — evidence ids are runtime-generated
        // (randomUUID), so they can't be hardcoded ahead of time.
        const lastMsg = params.messages[params.messages.length - 1] as { content: unknown[] };
        const citedIds = lastMsg.content
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
                controlId: "FULL-1",
                status: "satisfied",
                confidence: "high",
                rationale: "Both collectors returned usable evidence, both cited.",
                evidenceCited: citedIds,
                gaps: [],
              },
            },
          ],
        };
      },
    };

    const report = await runAssessment(controlSetOf(control), MOCK_TARGET, makeProvider(), mockLlm);
    const result = report.results[0]!;
    expect(result.collectorsTagged).toBe(2);
    expect(result.collectorsCalled).toBe(2);
    expect(result.collectorsCited).toBe(2);
    expect(result.evidenceCoverage).toBe(1);
    expect(result.coverageConfidence).toBe("high");
  });

  it("partial subset: calling and citing only 1 of 2 tagged collectors caps coverage at medium, never high (anti-gaming)", async () => {
    const control: ControlItem = {
      id: "PARTIAL-1",
      framework: "SP 800-53",
      pattern: "synthesis",
      intent: "Partial coverage case.",
      collectors: ["getDataCaptureConfig", "getModelMonitorSchedules"],
    };

    let callCount = 0;
    let citedId = "";
    const mockLlm: LlmProvider = {
      async complete(params): Promise<LlmCompletionResult> {
        callCount++;
        if (callCount === 1) {
          // Only call ONE of the two tagged collectors — never touch getModelMonitorSchedules.
          return {
            stopReason: "tool_use",
            content: [{ type: "tool_use", id: "tu-1", name: "getDataCaptureConfig", input: {} }],
          };
        }
        const lastMsg = params.messages[params.messages.length - 1] as { content: unknown[] };
        const tr = lastMsg.content.find(
          (b) => (b as { type: string }).type === "tool_result"
        ) as { content: string };
        const parsed = JSON.parse(tr.content);
        citedId = Array.isArray(parsed) ? parsed[0].id : "";

        return {
          stopReason: "tool_use",
          content: [
            {
              type: "tool_use",
              id: "tu-2",
              name: "submit_judgment",
              input: {
                controlId: "PARTIAL-1",
                status: "satisfied",
                confidence: "high",
                rationale: "Cited everything I called.",
                evidenceCited: [citedId],
                gaps: [],
              },
            },
          ],
        };
      },
    };

    const report = await runAssessment(controlSetOf(control), MOCK_TARGET, makeProvider(), mockLlm);
    const result = report.results[0]!;
    expect(result.collectorsTagged).toBe(2);
    expect(result.collectorsCalled).toBe(1);
    expect(result.collectorsCited).toBe(1); // cited 100% of what it called
    expect(result.evidenceCoverage).toBe(0.5); // but only 50% of what was tagged as required
    expect(result.coverageConfidence).toBe("medium"); // never "high" despite citing everything called
  });

  it("calling/citing a collector outside the tagged set never inflates coverage past 1.0 (advisor-driven hardening)", async () => {
    const control: ControlItem = {
      id: "UNTAGGED-1",
      framework: "SP 800-53",
      pattern: "synthesis",
      intent: "Only getDataCaptureConfig is tagged; the model also calls getKMSConfig, which is not.",
      collectors: ["getDataCaptureConfig"],
    };

    let callCount = 0;
    let dataCapId = "";
    let kmsId = "";
    const mockLlm: LlmProvider = {
      async complete(params): Promise<LlmCompletionResult> {
        callCount++;
        if (callCount === 1) {
          // Calls the one tagged collector AND one untagged collector in the same response.
          return {
            stopReason: "tool_use",
            content: [
              { type: "tool_use", id: "tu-1", name: "getDataCaptureConfig", input: {} },
              { type: "tool_use", id: "tu-2", name: "getKMSConfig", input: {} },
            ],
          };
        }
        const lastMsg = params.messages[params.messages.length - 1] as { content: unknown[] };
        const results = lastMsg.content.filter(
          (b) => (b as { type: string }).type === "tool_result"
        ) as { tool_use_id: string; content: string }[];
        for (const r of results) {
          const parsed = JSON.parse(r.content);
          const id = Array.isArray(parsed) ? parsed[0]?.id : null;
          if (r.tool_use_id === "tu-1") dataCapId = id;
          if (r.tool_use_id === "tu-2") kmsId = id;
        }

        // Cite BOTH the tagged and the untagged evidence — the untagged citation
        // must not count toward this control's coverage ratio.
        return {
          stopReason: "tool_use",
          content: [
            {
              type: "tool_use",
              id: "tu-3",
              name: "submit_judgment",
              input: {
                controlId: "UNTAGGED-1",
                status: "satisfied",
                confidence: "high",
                rationale: "Cited both the tagged and an out-of-scope collector's evidence.",
                evidenceCited: [dataCapId, kmsId],
                gaps: [],
              },
            },
          ],
        };
      },
    };

    const provider = makeProvider({
      getKMSConfig: async () => mockRaw("kms-config", { keyManager: "CUSTOMER" }),
    });
    const report = await runAssessment(controlSetOf(control), MOCK_TARGET, provider, mockLlm);
    const result = report.results[0]!;
    expect(result.collectorsTagged).toBe(1);
    expect(result.collectorsCalled).toBe(1); // getKMSConfig excluded — not tagged
    expect(result.collectorsCited).toBe(1); // getKMSConfig's citation excluded too
    expect(result.evidenceCoverage).toBe(1); // never exceeds 1.0
    expect(result.coverageConfidence).toBe("high");
  });

  it("a duplicate entry in control.collectors does not corrupt the denominator (code-reviewer finding)", async () => {
    const control: ControlItem = {
      id: "DUP-1",
      framework: "SP 800-53",
      pattern: "synthesis",
      intent: "Control YAML accidentally lists the same collector twice.",
      collectors: ["getDataCaptureConfig", "getDataCaptureConfig"],
    };

    let callCount = 0;
    let citedId = "";
    const mockLlm: LlmProvider = {
      async complete(params): Promise<LlmCompletionResult> {
        callCount++;
        if (callCount === 1) {
          return {
            stopReason: "tool_use",
            content: [{ type: "tool_use", id: "tu-1", name: "getDataCaptureConfig", input: {} }],
          };
        }
        const lastMsg = params.messages[params.messages.length - 1] as { content: unknown[] };
        const tr = lastMsg.content.find(
          (b) => (b as { type: string }).type === "tool_result"
        ) as { content: string };
        const parsed = JSON.parse(tr.content);
        citedId = Array.isArray(parsed) ? parsed[0].id : "";

        return {
          stopReason: "tool_use",
          content: [
            {
              type: "tool_use",
              id: "tu-2",
              name: "submit_judgment",
              input: {
                controlId: "DUP-1",
                status: "satisfied",
                confidence: "high",
                rationale: "Full coverage despite the duplicate tag.",
                evidenceCited: [citedId],
                gaps: [],
              },
            },
          ],
        };
      },
    };

    const report = await runAssessment(controlSetOf(control), MOCK_TARGET, makeProvider(), mockLlm);
    const result = report.results[0]!;
    // Without dedup, collectorsTagged would be 2 and this would compute 0.5/medium.
    expect(result.collectorsTagged).toBe(1);
    expect(result.evidenceCoverage).toBe(1);
    expect(result.coverageConfidence).toBe("high");
  });

  it("vacuous case: zero tagged collectors (attestation pattern) yields evidenceCoverage 1 and coverageConfidence high", async () => {
    const control: ControlItem = {
      id: "ATTEST-1",
      framework: "SP 800-53",
      pattern: "attestation",
      intent: "Pure human-attestation case, matching SA-10's shipped shape.",
      collectors: [],
    };

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
                controlId: "ATTEST-1",
                status: "insufficient-evidence",
                confidence: "high",
                rationale: "Requires human attestation; nothing AWS-retrievable.",
                evidenceCited: [],
                gaps: ["Human sign-off required"],
              },
            },
          ],
        };
      },
    };

    const report = await runAssessment(controlSetOf(control), MOCK_TARGET, makeProvider(), mockLlm);
    const result = report.results[0]!;
    expect(result.collectorsTagged).toBe(0);
    expect(result.collectorsCalled).toBe(0);
    expect(result.collectorsCited).toBe(0);
    expect(result.evidenceCoverage).toBe(1); // vacuous truth, never NaN or 0
    expect(result.coverageConfidence).toBe("high"); // matches the published SA-10 example
    expect(Number.isNaN(result.evidenceCoverage)).toBe(false);
  });

  it("citing the same evidence id multiple times does not double-count toward coverage (silent-failure-hunter finding)", async () => {
    const control: ControlItem = {
      id: "REPEAT-1",
      framework: "SP 800-53",
      pattern: "synthesis",
      intent: "Model cites the same evidence id three times.",
      collectors: ["getDataCaptureConfig", "getModelMonitorSchedules"],
    };

    let callCount = 0;
    let citedId = "";
    const mockLlm: LlmProvider = {
      async complete(params): Promise<LlmCompletionResult> {
        callCount++;
        if (callCount === 1) {
          return {
            stopReason: "tool_use",
            content: [{ type: "tool_use", id: "tu-1", name: "getDataCaptureConfig", input: {} }],
          };
        }
        const lastMsg = params.messages[params.messages.length - 1] as { content: unknown[] };
        const tr = lastMsg.content.find(
          (b) => (b as { type: string }).type === "tool_result"
        ) as { content: string };
        const parsed = JSON.parse(tr.content);
        citedId = Array.isArray(parsed) ? parsed[0].id : "";

        return {
          stopReason: "tool_use",
          content: [
            {
              type: "tool_use",
              id: "tu-2",
              name: "submit_judgment",
              input: {
                controlId: "REPEAT-1",
                status: "partially-satisfied",
                confidence: "medium",
                rationale: "Citing the same id repeatedly should not inflate coverage.",
                evidenceCited: [citedId, citedId, citedId],
                gaps: [],
              },
            },
          ],
        };
      },
    };

    const report = await runAssessment(controlSetOf(control), MOCK_TARGET, makeProvider(), mockLlm);
    const result = report.results[0]!;
    expect(result.collectorsTagged).toBe(2);
    expect(result.collectorsCited).toBe(1); // one collector, regardless of repeated citation
    expect(result.evidenceCoverage).toBe(0.5);
    expect(result.coverageConfidence).toBe("medium");
  });
});

describe("deriveCoverageConfidence — fail-loud on corrupted input (silent-failure-hunter finding)", () => {
  it("buckets the three valid exact-value cases correctly", () => {
    expect(deriveCoverageConfidence(1, 2)).toBe("high");
    expect(deriveCoverageConfidence(0, 2)).toBe("low");
    expect(deriveCoverageConfidence(0.5, 2)).toBe("medium");
    expect(deriveCoverageConfidence(1, 0)).toBe("high"); // vacuous, tagged===0 short-circuits first
  });

  it("throws rather than silently defaulting to medium for NaN, Infinity, or out-of-range ratios", () => {
    expect(() => deriveCoverageConfidence(NaN, 2)).toThrow(/out of range/);
    expect(() => deriveCoverageConfidence(Infinity, 2)).toThrow(/out of range/);
    expect(() => deriveCoverageConfidence(-1, 2)).toThrow(/out of range/);
    expect(() => deriveCoverageConfidence(1.5, 2)).toThrow(/out of range/);
  });
});
