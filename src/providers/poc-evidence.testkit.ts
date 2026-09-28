/**
 * Test support for the Proof-of-Control family (M8b): a provider over one
 * fixture stream, and a scripted LLM that plays the `PoC-10.2` synthesis
 * loop without an API key. Shared by the provider, OSCAL and bundle tests.
 */
import type { AssessmentTarget, ControlSet } from "../types.js";
import type { LlmProvider, LlmCompletionParams, LlmCompletionResult } from "../llm/llm-provider.interface.js";
import type { EvidenceProvider } from "./evidence-provider.interface.js";
import { pocEvidenceProvider } from "./poc-evidence.js";
import { loadControlSet } from "../loaders/control-loader.js";
import { runAssessment, type AssessmentReport } from "../runner/assessment-runner.js";

export const POC_CONTROLS_PATH = "fixtures/controls/poc-c7-subset.yaml";
export const POC_DISCLOSURE = "fixtures/targets/poc-evidence/disclosure.md";

export const POC_TARGET: AssessmentTarget = {
  family: "poc-evidence",
  modelName: "reference-agent-evidence-stream",
  endpointName: "https://verifier.example/poc",
};

export function streamPath(name: string): string {
  return `fixtures/targets/poc-evidence/streams/${name}.jsonl`;
}

export function pocProvider(stream: string, withDisclosure = true): EvidenceProvider {
  const path = stream.includes("/") ? stream : streamPath(stream);
  return pocEvidenceProvider({
    stream: { path, label: path },
    ...(withDisclosure ? { disclosure: { path: POC_DISCLOSURE, label: POC_DISCLOSURE } } : {}),
  });
}

/** Ids of every evidence item in the tool results of the latest user message. */
export function retrievedIds(params: LlmCompletionParams): string[] {
  const last = params.messages[params.messages.length - 1];
  if (!last || !Array.isArray(last.content)) return [];
  return last.content.flatMap((block) => {
    if (block.type !== "tool_result") return [];
    const parsed: unknown = JSON.parse(block.content);
    return Array.isArray(parsed) ? parsed.map((e) => (e as { id: string }).id) : [];
  });
}

/**
 * Call 1 asks for the disclosure and the records; call 2 submits a judgment
 * citing what `cite` picks from the retrieved ids (default: all of them).
 * Every call's params are kept so a test can read what the model was sent.
 */
export function scriptedSynthesisLlm(
  cite: (ids: string[]) => string[] = (ids) => ids
): { llm: LlmProvider; calls: LlmCompletionParams[] } {
  const calls: LlmCompletionParams[] = [];
  const llm: LlmProvider = {
    async complete(params): Promise<LlmCompletionResult> {
      calls.push(params);
      if (calls.length === 1) {
        return {
          stopReason: "tool_use",
          content: [
            { type: "tool_use", id: "tu-disclosure", name: "getTrustAssumptionDisclosure", input: {} },
            { type: "tool_use", id: "tu-records", name: "getEvidenceRecords", input: {} },
          ],
        };
      }
      return {
        stopReason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "tu-judgment",
            name: "submit_judgment",
            input: {
              controlId: "PoC-10.2",
              status: "satisfied",
              confidence: "medium",
              rationale:
                "Every claim in the register has disclosed assumptions with subjects and categories from the draft set; EdDSA, SHA-256, SHA-384, software measurement and Intel TDX, the mechanisms the records show, each appear.",
              evidenceCited: cite(retrievedIds(params)),
              gaps: [],
            },
          },
        ],
      };
    },
  };
  return { llm, calls };
}

/** The full six-control run over one fixture stream, scripted LLM, no API key. */
export async function runPocFixture(stream = "clean"): Promise<{
  report: AssessmentReport;
  controlSet: ControlSet;
  calls: LlmCompletionParams[];
}> {
  const controlSet = await loadControlSet(POC_CONTROLS_PATH);
  const { llm, calls } = scriptedSynthesisLlm();
  const report = await runAssessment(controlSet, POC_TARGET, pocProvider(stream), llm);
  return { report, controlSet, calls };
}
