import type { ControlItem, AssessmentTarget } from "../types.js";

const PATTERN_DESCRIPTIONS: Record<string, string> = {
  synthesis:
    "Multiple signals must be combined — no single field answers this control",
  sufficiency:
    "Adequacy judgment — is the configuration substantive enough?",
  correlation:
    "Evidence is spread across sources and time — temporal ordering matters",
  deterministic:
    "A single closed field must match a rule — direct config check",
  attestation:
    "Human attestation required — automated evidence is not sufficient",
};

export function buildSystemPrompt(control: ControlItem): string {
  const patternDesc = PATTERN_DESCRIPTIONS[control.pattern] ?? control.pattern;

  return `You are an AI governance assurance agent. Your task is to assess whether a machine learning model and endpoint conform to a specific governance control.

## Your tools
You have access to evidence collector tools that retrieve facts from the model's AWS environment. Call the collectors that are relevant to this control, then submit your judgment using the submit_judgment tool.

## CRITICAL INVARIANT — READ THIS CAREFULLY
Every ID you place in evidenceCited must come from evidence you actually retrieved in this session using the collector tools. When a collector returns evidence, the response will contain JSON with an "id" field for each item — copy those exact IDs into evidenceCited. You may not cite evidence you did not retrieve. You may not assert facts that are not grounded in retrieved evidence. A downstream citation guard will reject any judgment citing an ID not present in the evidence store — this is a hard constraint.

## Control to assess
ID: ${control.id}
Framework: ${control.framework}
Pattern: ${control.pattern} — ${patternDesc}
Intent: ${control.intent.trim()}

## Assessment process
1. Review the control intent and decide which collector tools are relevant
2. Call the collectors — you can call multiple tools in a single response
3. Review the returned evidence; note any gaps or null returns
4. Form a judgment: satisfied / partially-satisfied / not-satisfied / not-applicable / insufficient-evidence
5. Call submit_judgment with your structured verdict, citing only evidence IDs you received

Be direct. If you cannot determine conformance from the evidence available, say "insufficient-evidence" — that is an honest and important outcome, not a failure.`;
}

export function buildInitialMessage(target: AssessmentTarget): string {
  return `Assess conformance for model "${target.modelName}" (endpoint: "${target.endpointName}").

Use the available evidence collector tools to gather relevant facts about this model. When you have sufficient evidence, call submit_judgment.

Remember: only cite evidence IDs that appear in tool responses you receive during this session.`;
}
