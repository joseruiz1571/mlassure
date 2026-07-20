import type { ControlItem, AssessmentTarget, Judgment, RawEvidence } from "../types.js";
import type { AwsProvider } from "../providers/aws-provider.interface.js";
import type { LlmProvider, LlmToolResultBlock } from "../llm/llm-provider.interface.js";
import { EvidenceStore } from "../store/evidence-store.js";
import { buildToolDefs, SUBMIT_JUDGMENT_TOOL } from "../tools/registry.js";
import { executeCollector, isKnownCollector } from "../tools/executor.js";
import { buildSystemPrompt, buildInitialMessage } from "./prompts.js";
import { validateCitations } from "../guard/citation-guard.js";
import { parseJudgment } from "../guard/judgment-validator.js";
import { DETERMINISTIC_CHECKS } from "./deterministic-checks.js";

const MAX_ITERATIONS = 10;

export type AssessControlResult = {
  judgment: Judgment;
  store: EvidenceStore;
  iterations: number;
  /** Every collector name actually invoked this run, regardless of what it returned. */
  calledCollectors: Set<string>;
  /** Collector names whose evidence appears in the final judgment's evidenceCited. */
  citedCollectors: Set<string>;
};

/**
 * Thrown when a `deterministic`-pattern control has no registered check
 * function. This should be UNREACHABLE in practice — `runAssessment()`'s
 * preflight (`assessment-runner.ts`) walks the whole control set and aborts
 * before any control runs if any deterministic control is missing a check.
 * This throw is a defensive invariant, not a recoverable per-control error:
 * it must never be caught and turned into a judgment/coverage-math result,
 * because a silent LLM fallback here would produce a report claiming
 * code-determination while actually LLM-judged — the exact evidence-integrity
 * defect this project exists to prevent (M3d advisor decision).
 */
export class MissingDeterministicCheckError extends Error {
  constructor(controlId: string) {
    super(
      `No deterministic check registered for control "${controlId}" — see DETERMINISTIC_CHECKS in deterministic-checks.ts. This should have been caught by the preflight in runAssessment().`
    );
    this.name = "MissingDeterministicCheckError";
  }
}

/**
 * Thrown by `runAssessment()`'s preflight (`assessment-runner.ts`) — the
 * reachable-in-practice sibling of `MissingDeterministicCheckError` above.
 * A caller wanting to `instanceof`-branch on "missing deterministic check"
 * should catch THIS type; `MissingDeterministicCheckError` is the defensive,
 * should-be-unreachable in-function guard. Named and exported so both are
 * equally catchable, not just the theoretically-dead one (code-reviewer
 * finding, M3d).
 */
export class MissingDeterministicChecksError extends Error {
  constructor(public readonly controlIds: readonly string[]) {
    super(
      `Missing deterministic check(s) for: ${controlIds.join(", ")}. ` +
        `See DETERMINISTIC_CHECKS in src/agent/deterministic-checks.ts. ` +
        `Aborting before any control is assessed.`
    );
    this.name = "MissingDeterministicChecksError";
  }
}

export async function assessControl(
  control: ControlItem,
  target: AssessmentTarget,
  provider: AwsProvider,
  llm: LlmProvider
): Promise<AssessControlResult> {
  // Attestation is a property of the PATTERN, not of how many collectors happen
  // to be tagged — human sign-off cannot be evidenced by any amount of AWS API
  // data, so this control never invokes the LLM or any collector, regardless of
  // what `control.collectors` contains. Gating on `collectors.length === 0`
  // instead would be wrong: it conflates "genuinely requires human attestation"
  // with "happens to have no collectors configured yet."
  if (control.pattern === "attestation") {
    return {
      judgment: {
        controlId: control.id,
        status: "insufficient-evidence",
        confidence: "high",
        rationale:
          "This control's pattern is \"attestation\": conformance cannot be determined from automated AWS evidence collection under any circumstance, so no collectors were invoked and no LLM assessment was run.",
        evidenceCited: [],
        gaps: [
          "Requires human attestation — see the control's intent for the specific sign-off required. This verdict was generated directly from the control's pattern, without an LLM call.",
        ],
      },
      store: new EvidenceStore(),
      iterations: 0,
      calledCollectors: new Set(),
      citedCollectors: new Set(),
    };
  }

  // Deterministic: a code-level check, keyed by control ID (not pattern) since
  // each deterministic control's rule is genuinely different code. Fail-loud,
  // never a silent LLM fallback — see MissingDeterministicCheckError.
  if (control.pattern === "deterministic") {
    const check = DETERMINISTIC_CHECKS[control.id];
    if (!check) {
      throw new MissingDeterministicCheckError(control.id);
    }
    return check(control, target, provider);
  }

  const store = new EvidenceStore();
  const tools = [...buildToolDefs(control.collectors), SUBMIT_JUDGMENT_TOOL];
  const systemPrompt = buildSystemPrompt(control);
  const calledCollectors = new Set<string>();
  // Collector identity is only known at the point of the tool call (block.name);
  // Evidence.source is a provider-defined free-text string unrelated to the
  // collector function name, so this map is the only reliable way to recover
  // "which collector produced this evidence id" later, at judgment time.
  const evidenceIdToCollector = new Map<string, string>();

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
        const judgment = parseJudgment(block.input, control.id);
        validateCitations(judgment, store);
        pendingJudgment = judgment;
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: "Judgment accepted.",
        });
      } else if (isKnownCollector(block.name)) {
        // isKnownCollector checks the GLOBAL executor map, not control.collectors —
        // it permits executing any collector the system knows about, regardless of
        // whether this control tagged it as relevant. That's fine for execution
        // (out-of-scope evidence is still real evidence), but coverage tracking must
        // stay bounded by the tagged set, or a model deviation calling/citing an
        // untagged collector could push citedCollectors.size past control.collectors
        // .length and produce an evidenceCoverage ratio above 1.0.
        if (control.collectors.includes(block.name)) {
          calledCollectors.add(block.name);
        }
        let resultContent: string;
        try {
          const result = await executeCollector(block.name, provider, target);
          const rawItems: RawEvidence[] = Array.isArray(result)
            ? result
            : result != null
            ? [result]
            : [];

          const storedItems = rawItems.map((r) => store.add(r));
          for (const item of storedItems) {
            evidenceIdToCollector.set(item.id, block.name);
          }

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
          const message = err instanceof Error ? err.message : String(err);
          // A duplicate evidence id across collectors is a provider/collector
          // defect, not a transient AWS failure — it means real evidence was
          // silently dropped from the store. Must not look identical to "AWS
          // call failed" in the only place this would otherwise be visible.
          if (message.startsWith("Duplicate evidence id:")) {
            console.error(
              `[mlassure] EVIDENCE INTEGRITY ERROR — control ${control.id}, collector "${block.name}": ${message}`
            );
          }
          resultContent = `Error collecting evidence: ${message}`;
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
      const citedCollectors = new Set<string>();
      for (const id of pendingJudgment.evidenceCited) {
        const collector = evidenceIdToCollector.get(id);
        // Same tagged-set bound as calledCollectors above — an untagged collector's
        // evidence can still be cited (citation-guard only checks the id exists in
        // the store), but it must never count toward THIS control's coverage ratio.
        if (collector !== undefined && control.collectors.includes(collector)) {
          citedCollectors.add(collector);
        }
      }
      return {
        judgment: pendingJudgment,
        store,
        iterations: iteration,
        calledCollectors,
        citedCollectors,
      };
    }
  }

  throw new Error(
    `Agent exceeded ${MAX_ITERATIONS} iterations without submitting a judgment`
  );
}
