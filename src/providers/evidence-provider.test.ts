import { describe, it, expect } from "bun:test";
import { randomUUID } from "node:crypto";
import type { EvidenceProvider } from "./evidence-provider.interface.js";
import { hasCollector, defineProvider, catalogProblems } from "./evidence-provider.interface.js";
import { awsSageMakerProvider, AWS_SAGEMAKER_COLLECTORS } from "./aws-sagemaker.js";
import { FixtureProvider } from "./fixture-provider.js";
import { executeCollector, isKnownCollector } from "../tools/executor.js";
import { buildToolDefs } from "../tools/registry.js";
import {
  assessControl,
  UnknownCollectorsError,
  DeterministicCheckFamilyError,
  InvalidCollectorCatalogError,
  MissingDeterministicChecksError,
} from "../agent/agent.js";
import { runAssessment } from "../runner/assessment-runner.js";
import type { LlmProvider, LlmCompletionResult } from "../llm/llm-provider.interface.js";
import type { AssessmentTarget, ControlItem, RawEvidence } from "../types.js";

const TARGET: AssessmentTarget = { modelName: "subject", endpointName: "n/a" };

function raw(source: string, payload: unknown): RawEvidence {
  return { id: randomUUID(), source, retrievedAt: new Date().toISOString(), payload };
}

/** A second family with nothing SageMaker about it — the generality probe. */
function makeLedgerProvider(): { provider: EvidenceProvider; calls: string[] } {
  const calls: string[] = [];
  const provider: EvidenceProvider = {
    family: "toy-ledger",
    collectors: {
      readLedgerHead: { description: "Returns the ledger head record." },
      listLedgerEntries: { description: "Returns every ledger entry." },
    },
    async collect(name) {
      calls.push(name);
      if (name === "readLedgerHead") return raw("ledger:head", { height: 2 });
      if (name === "listLedgerEntries") {
        return [raw("ledger:entry", { i: 0 }), raw("ledger:entry", { i: 1 })];
      }
      throw new Error(`Unknown collector tool: "${name}"`);
    },
  };
  return { provider, calls };
}

function makeCountingLlm(script: (call: number, params: Parameters<LlmProvider["complete"]>[0]) => LlmCompletionResult): {
  llm: LlmProvider;
  callCount: () => number;
} {
  let calls = 0;
  return {
    llm: {
      async complete(params) {
        calls++;
        return script(calls, params);
      },
    },
    callCount: () => calls,
  };
}

const INHERITED_KEYS = ["constructor", "toString", "hasOwnProperty", "__proto__", "valueOf"];

describe("EvidenceProvider — generic dispatch (M8a)", () => {
  it("ISC-M8a-5: inherited object keys are never collectors", async () => {
    const sagemaker = awsSageMakerProvider(
      new FixtureProvider("fixtures/targets/model-clean.json")
    );
    const { provider: ledger } = makeLedgerProvider();

    for (const provider of [sagemaker, ledger]) {
      for (const key of INHERITED_KEYS) {
        expect(hasCollector(provider, key)).toBe(false);
        expect(isKnownCollector(key, provider)).toBe(false);
        await expect(executeCollector(key, provider, TARGET)).rejects.toThrow(
          `Unknown collector tool: "${key}"`
        );
        expect(() => buildToolDefs([key], provider)).toThrow(`Unknown collector: ${key}`);
      }
    }
    // The adapter's own guard, reached without the executor in front of it.
    await expect(sagemaker.collect("constructor", TARGET)).rejects.toThrow(
      'Unknown collector tool: "constructor"'
    );
  });

  it("ISC-M8a-5: the agent loop answers an inherited-key tool call with Unknown tool and runs no collector", async () => {
    const { provider, calls } = makeLedgerProvider();
    const control: ControlItem = {
      id: "LEDGER-1",
      framework: "toy",
      pattern: "sufficiency",
      intent: "The ledger has a head.",
      collectors: ["readLedgerHead"],
    };
    let toolResultForConstructor: string | undefined;
    const { llm } = makeCountingLlm((call, params) => {
      if (call === 1) {
        return {
          stopReason: "tool_use",
          content: [{ type: "tool_use", id: "tu-1", name: "constructor", input: {} }],
        };
      }
      const last = params.messages[params.messages.length - 1] as {
        content: { type: string; content: string }[];
      };
      toolResultForConstructor = last.content[0]?.content;
      return {
        stopReason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "tu-2",
            name: "submit_judgment",
            input: {
              controlId: "LEDGER-1",
              status: "insufficient-evidence",
              confidence: "low",
              rationale: "No evidence was retrieved.",
              evidenceCited: [],
              gaps: ["nothing retrieved"],
            },
          },
        ],
      };
    });

    const result = await assessControl(control, TARGET, provider, llm);

    expect(toolResultForConstructor).toBe('Unknown tool: "constructor"');
    expect(calls).toEqual([]);
    expect(result.store.size()).toBe(0);
  });

  it("ISC-M8a-4: preflight lists every unknown (control, collector) pair before any LLM call or collector run", async () => {
    const { provider, calls } = makeLedgerProvider();
    const { llm, callCount } = makeCountingLlm(() => {
      throw new Error("the LLM must not be called when preflight fails");
    });
    const controlSet = {
      version: "test-1.0",
      controls: [
        {
          id: "OK-1",
          framework: "toy",
          pattern: "sufficiency" as const,
          intent: "Known collector only.",
          collectors: ["readLedgerHead"],
        },
        {
          id: "TYPO-1",
          framework: "toy",
          pattern: "synthesis" as const,
          intent: "One typo, listed twice, plus a SageMaker name.",
          collectors: ["readLedgerHaed", "readLedgerHaed", "getKMSConfig"],
        },
        {
          id: "ATT-1",
          framework: "toy",
          pattern: "attestation" as const,
          intent: "Attestation controls are checked too — a typo is a typo.",
          collectors: ["toString"],
        },
      ],
    };

    const run = runAssessment(controlSet, TARGET, provider, llm);

    await expect(run).rejects.toBeInstanceOf(UnknownCollectorsError);
    const err = (await run.catch((e: unknown) => e)) as UnknownCollectorsError;
    expect(err.family).toBe("toy-ledger");
    expect(err.unknown).toEqual([
      { controlId: "TYPO-1", collector: "readLedgerHaed" },
      { controlId: "TYPO-1", collector: "getKMSConfig" },
      { controlId: "ATT-1", collector: "toString" },
    ]);
    expect(err.message).toContain("TYPO-1 → readLedgerHaed");
    expect(callCount()).toBe(0);
    expect(calls).toEqual([]);
  });

  it("ISC-M8a-6: a non-SageMaker family runs an assessment end to end through the unchanged agent, runner and tools", async () => {
    const { provider, calls } = makeLedgerProvider();
    const control: ControlItem = {
      id: "LEDGER-2",
      framework: "toy",
      pattern: "synthesis",
      intent: "The ledger head agrees with its entries.",
      collectors: ["readLedgerHead", "listLedgerEntries"],
    };
    let offeredTools: string[] = [];
    const { llm } = makeCountingLlm((call, params) => {
      if (call === 1) {
        offeredTools = params.tools.map((t) => t.name);
        return {
          stopReason: "tool_use",
          content: [
            { type: "tool_use", id: "tu-1", name: "readLedgerHead", input: {} },
            { type: "tool_use", id: "tu-2", name: "listLedgerEntries", input: {} },
          ],
        };
      }
      const last = params.messages[params.messages.length - 1] as {
        content: { type: string; content: string }[];
      };
      const citedIds = last.content.flatMap((b) =>
        (JSON.parse(b.content) as { id: string }[]).map((e) => e.id)
      );
      return {
        stopReason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "tu-3",
            name: "submit_judgment",
            input: {
              controlId: "LEDGER-2",
              status: "satisfied",
              confidence: "high",
              rationale: "Head height 2 matches two entries.",
              evidenceCited: citedIds,
              gaps: [],
            },
          },
        ],
      };
    });

    const report = await runAssessment(
      { version: "toy-1.0", controls: [control] },
      TARGET,
      provider,
      llm
    );

    const result = report.results[0]!;
    expect(offeredTools).toEqual(["readLedgerHead", "listLedgerEntries", "submit_judgment"]);
    expect(calls).toEqual(["readLedgerHead", "listLedgerEntries"]);
    expect(result.judgment.status).toBe("satisfied");
    expect(result.evidenceCount).toBe(3);
    expect(result.citedEvidence.map((e) => e.source).sort()).toEqual([
      "ledger:entry",
      "ledger:entry",
      "ledger:head",
    ]);
    expect(result.evidenceCoverage).toBe(1);
    expect(result.coverageConfidence).toBe("high");
  });

  it("a single-item deterministic check refuses a collector that returns a list", async () => {
    const provider: EvidenceProvider = {
      family: "aws-sagemaker",
      collectors: AWS_SAGEMAKER_COLLECTORS,
      collect: async () => [raw("kms", { keyManager: "CUSTOMER" })],
    };
    const control: ControlItem = {
      id: "SC-28",
      framework: "SP 800-53 Rev 5",
      pattern: "deterministic",
      intent: "Customer-managed keys.",
      collectors: ["getKMSConfig"],
    };
    const { llm, callCount } = makeCountingLlm(() => {
      throw new Error("deterministic controls never call the LLM");
    });

    await expect(assessControl(control, TARGET, provider, llm)).rejects.toThrow(
      'Collector "getKMSConfig" returned a list (1 items)'
    );
    expect(callCount()).toBe(0);
  });
});

describe("deterministic checks are family-scoped (M8a, second-look MAJOR-2)", () => {
  const SC28: ControlItem = {
    id: "SC-28",
    framework: "another framework that happens to reuse the id",
    pattern: "deterministic",
    intent: "Same id, different family.",
    collectors: [],
  };
  const LLM_FIRST: ControlItem = {
    id: "LEDGER-1",
    framework: "toy",
    pattern: "sufficiency",
    intent: "Would burn an LLM call if assessment started.",
    collectors: ["readLedgerHead"],
  };
  const neverLlm = () =>
    makeCountingLlm(() => {
      throw new Error("the LLM must not be called when preflight fails");
    });

  it("a check written for one family never runs against another family's provider", async () => {
    const { provider, calls } = makeLedgerProvider();
    const { llm, callCount } = neverLlm();

    const run = runAssessment(
      { version: "t", controls: [LLM_FIRST, SC28] },
      TARGET,
      provider,
      llm
    );

    await expect(run).rejects.toBeInstanceOf(DeterministicCheckFamilyError);
    const err = (await run.catch((e: unknown) => e)) as DeterministicCheckFamilyError;
    expect(err.mismatches).toEqual([{ controlId: "SC-28", checkFamily: "aws-sagemaker" }]);
    expect(err.family).toBe("toy-ledger");
    expect(callCount()).toBe(0);
    expect(calls).toEqual([]);
  });

  it("assessControl called directly refuses the same mismatch without touching the provider", async () => {
    const { provider, calls } = makeLedgerProvider();
    const { llm } = neverLlm();

    await expect(assessControl(SC28, TARGET, provider, llm)).rejects.toBeInstanceOf(
      DeterministicCheckFamilyError
    );
    expect(calls).toEqual([]);
  });

  it("preflight covers the collectors a check runs, not only the ones the control lists", async () => {
    const { getKMSConfig: _dropped, ...withoutKms } = AWS_SAGEMAKER_COLLECTORS;
    const calls: string[] = [];
    const provider: EvidenceProvider = {
      family: "aws-sagemaker",
      collectors: withoutKms,
      // Lenient on purpose: answers null for anything, as a careless provider would.
      collect: async (name) => {
        calls.push(name);
        return null;
      },
    };
    const { llm, callCount } = neverLlm();

    const run = runAssessment({ version: "t", controls: [SC28] }, TARGET, provider, llm);

    await expect(run).rejects.toBeInstanceOf(UnknownCollectorsError);
    const err = (await run.catch((e: unknown) => e)) as UnknownCollectorsError;
    expect(err.unknown).toEqual([{ controlId: "SC-28", collector: "getKMSConfig" }]);
    expect(callCount()).toBe(0);
    expect(calls).toEqual([]);

    // And past the preflight, the executor guard still holds for code-run checks.
    await expect(assessControl(SC28, TARGET, provider, llm)).rejects.toThrow(
      'Unknown collector tool: "getKMSConfig"'
    );
    expect(calls).toEqual([]);
  });

  it("a control id that is an inherited object key has no check", async () => {
    const { provider } = makeLedgerProvider();
    const { llm } = neverLlm();
    const control: ControlItem = { ...SC28, id: "constructor" };

    await expect(
      runAssessment({ version: "t", controls: [control] }, TARGET, provider, llm)
    ).rejects.toBeInstanceOf(MissingDeterministicChecksError);
  });

  it("a control set with a missing check and an unknown collector fails on the missing check, as before M8a", async () => {
    const { provider } = makeLedgerProvider();
    const { llm } = neverLlm();
    const controls: ControlItem[] = [
      { ...SC28, id: "NO-CHECK-1" },
      { ...LLM_FIRST, collectors: ["readLedgerHaed"] },
    ];

    await expect(
      runAssessment({ version: "t", controls }, TARGET, provider, llm)
    ).rejects.toBeInstanceOf(MissingDeterministicChecksError);
  });
});

describe("collector catalogs (M8a, second-look MINOR-4 and MINOR-5)", () => {
  it("defineProvider builds catalog and dispatch from one table", async () => {
    const provider = defineProvider("toy", {
      readOne: { description: "One item.", run: async () => raw("toy:one", { n: 1 }) },
      readNone: { description: "Nothing.", run: async () => null },
    });

    expect(Object.keys(provider.collectors)).toEqual(["readOne", "readNone"]);
    expect(provider.collectors["readOne"]).toEqual({ description: "One item." });
    expect(((await provider.collect("readOne", TARGET)) as RawEvidence).source).toBe("toy:one");
    expect(await provider.collect("readNone", TARGET)).toBeNull();
    await expect(provider.collect("toString", TARGET)).rejects.toThrow(
      'Unknown collector tool: "toString"'
    );
  });

  it("defineProvider refuses a reserved or malformed collector name", () => {
    const run = async () => null;
    expect(() => defineProvider("toy", { submit_judgment: { description: "x", run } })).toThrow(
      '"submit_judgment" is reserved for the judgment tool'
    );
    expect(() => defineProvider("toy", { "7.7.1 monotonic": { description: "x", run } })).toThrow(
      '"7.7.1 monotonic" is not a valid tool name'
    );
    expect(() => defineProvider("toy", { ["a".repeat(65)]: { description: "x", run } })).toThrow(
      "is not a valid tool name"
    );
  });

  it("the shipped SageMaker catalog has no problems", () => {
    expect(
      catalogProblems(awsSageMakerProvider(new FixtureProvider("fixtures/targets/model-clean.json")))
    ).toEqual([]);
  });

  it("runAssessment refuses a hand-built provider with an unusable catalog before any LLM call", async () => {
    const calls: string[] = [];
    const provider: EvidenceProvider = {
      family: "hand-built",
      collectors: { submit_judgment: { description: "x" }, "has space": { description: "y" } },
      collect: async (name) => {
        calls.push(name);
        return null;
      },
    };
    const { llm, callCount } = makeCountingLlm(() => {
      throw new Error("the LLM must not be called when preflight fails");
    });
    const control: ControlItem = {
      id: "C-1",
      framework: "toy",
      pattern: "sufficiency",
      intent: "x",
      collectors: [],
    };

    const run = runAssessment({ version: "t", controls: [control] }, TARGET, provider, llm);

    await expect(run).rejects.toBeInstanceOf(InvalidCollectorCatalogError);
    const err = (await run.catch((e: unknown) => e)) as InvalidCollectorCatalogError;
    expect(err.problems).toHaveLength(2);
    expect(callCount()).toBe(0);
    expect(calls).toEqual([]);
  });
});

