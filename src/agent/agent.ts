import type { ControlItem, AssessmentTarget, Judgment, RawEvidence } from "../types.js";
import type { AwsProvider } from "../providers/aws-provider.interface.js";
import type { LlmProvider, LlmToolResultBlock } from "../llm/llm-provider.interface.js";
import { EvidenceStore } from "../store/evidence-store.js";
import { buildToolDefs, SUBMIT_JUDGMENT_TOOL } from "../tools/registry.js";
import { executeCollector, isKnownCollector } from "../tools/executor.js";
import { buildSystemPrompt, buildInitialMessage } from "./prompts.js";
import { validateCitations } from "../guard/citation-guard.js";

const MAX_ITERATIONS = 10;

export type AssessControlResult = {
  judgment: Judgment;
  store: EvidenceStore;
  iterations: number;
};

export async function assessControl(
  control: ControlItem,
  target: AssessmentTarget,
  provider: AwsProvider,
  llm: LlmProvider
): Promise<AssessControlResult> {
  const store = new EvidenceStore();
  const tools = [...buildToolDefs(control.collectors), SUBMIT_JUDGMENT_TOOL];
  const systemPrompt = buildSystemPrompt(control);

  const messages: Array<{
    role: "user" | "assistant";
    content: unknown;
  }> = [{ role: "user", content: buildInitialMessage(target) }];

  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    const response = await llm.complete({
      systemPrompt,
      messages: messages as Parameters<typeof llm.complete>[0]["messages"],
      tools,
    });

    messages.push({ role: "assistant", content: response.content });

    if (response.stopReason === "end_turn") {
      throw new Error(
        `Agent ended without calling submit_judgment (iteration ${iteration})`
      );
    }
    if (response.stopReason === "max_tokens") {
      throw new Error(
        `Agent response was truncated (max_tokens) at iteration ${iteration} — increase maxTokens`
      );
    }

    const toolResults: LlmToolResultBlock[] = [];
    let pendingJudgment: Judgment | null = null;

    // Process collector tool calls first, then submit_judgment
    const sortedBlocks = response.content
      .filter((b) => b.type === "tool_use")
      .sort((a, b) => {
        if (a.name === "submit_judgment") return 1;
        if (b.name === "submit_judgment") return -1;
        return 0;
      });

    for (const block of sortedBlocks) {
      if (block.type !== "tool_use") continue;

      if (block.name === "submit_judgment") {
        const raw = block.input as Judgment;
        validateCitations(raw, store);
        pendingJudgment = {
          controlId: raw.controlId,
          status: raw.status,
          confidence: raw.confidence,
          rationale: raw.rationale,
          evidenceCited: raw.evidenceCited,
          gaps: raw.gaps,
        };
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: "Judgment accepted.",
        });
      } else if (isKnownCollector(block.name)) {
        let resultContent: string;
        try {
          const result = await executeCollector(block.name, provider, target);
          const rawItems: RawEvidence[] = Array.isArray(result)
            ? result
            : result != null
            ? [result]
            : [];

          const storedItems = rawItems.map((r) => store.add(r));

          resultContent =
            storedItems.length > 0
              ? JSON.stringify(
                  storedItems.map((e) => ({
                    id: e.id,
                    source: e.source,
                    payload: e.payload,
                  }))
                )
              : JSON.stringify(null);
        } catch (err) {
          resultContent = `Error collecting evidence: ${err instanceof Error ? err.message : String(err)}`;
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: resultContent,
          });
          continue;
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: resultContent,
        });
      } else {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: `Unknown tool: "${block.name}"`,
        });
      }
    }

    messages.push({ role: "user", content: toolResults });

    if (pendingJudgment !== null) {
      return { judgment: pendingJudgment, store, iterations: iteration };
    }
  }

  throw new Error(
    `Agent exceeded ${MAX_ITERATIONS} iterations without submitting a judgment`
  );
}
