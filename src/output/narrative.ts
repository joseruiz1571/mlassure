/**
 * Renders an mlassure {@link AssessmentReport} as the auditor-readable
 * Markdown narrative described in the spec: per control — status,
 * confidence, rationale, the evidence it relied on, and an explicit
 * gaps / requires-human-attestation section. This is the human-facing
 * artifact; OSCAL (oscal-ar.ts) is the machine-facing one. Both are pure
 * functions over the same AssessmentReport, with zero coupling between them.
 *
 * Rationale text is rendered as a plain paragraph, never inside a table
 * cell — an agent-authored rationale could contain `#`/`|`/`---` and a
 * table cell would let that corrupt the document structure.
 */

import type { AssessmentReport, ControlResult } from "../runner/assessment-runner.js";
import type { ControlSet, Judgment } from "../types.js";
import { isCodeDetermined, usesAttestationCallout } from "../types.js";

const STATUS_LABEL: Record<Judgment["status"], string> = {
  satisfied: "Satisfied",
  "partially-satisfied": "Partially Satisfied",
  "not-satisfied": "Not Satisfied",
  "not-applicable": "Not Applicable",
  "insufficient-evidence": "Insufficient Evidence",
};

const STATUS_ICON: Record<Judgment["status"], string> = {
  satisfied: "✓",
  "partially-satisfied": "~",
  "not-satisfied": "✗",
  "not-applicable": "-",
  "insufficient-evidence": "?",
};

/**
 * `Judgment.status` is only a compile-time guarantee — the agent loop casts
 * raw LLM tool-call JSON to `Judgment` without runtime validation (see
 * agent.ts), so a hallucinated or malformed status can reach here. Looking
 * it up directly would silently render `undefined undefined` in an
 * auditor-facing document; failing loud here matches how citation-guard
 * already treats an unverifiable claim — refuse to render it.
 */
function statusLabel(status: Judgment["status"], controlId: string): string {
  const label = STATUS_LABEL[status];
  if (label === undefined) {
    throw new Error(
      `toNarrativeMarkdown: control ${controlId} has unrecognized judgment status "${String(status)}" — refusing to render an auditor-facing document with an unverified status.`
    );
  }
  return label;
}

function statusIcon(status: Judgment["status"], controlId: string): string {
  const icon = STATUS_ICON[status];
  if (icon === undefined) {
    throw new Error(
      `toNarrativeMarkdown: control ${controlId} has unrecognized judgment status "${String(status)}" — refusing to render an auditor-facing document with an unverified status.`
    );
  }
  return icon;
}

/** Evidence is rendered only from `citedEvidence` — never from a broader store — so the narrative can never describe evidence the agent didn't actually cite. */
function renderEvidence(result: ControlResult): string {
  if (result.citedEvidence.length === 0) {
    return "_No evidence retrieved for this control._";
  }
  return result.citedEvidence
    .map(
      (e) =>
        `- \`${e.id}\` — ${e.source} (sha256: \`${e.sha256}\`, collected ${e.retrievedAt})`
    )
    .join("\n");
}

/**
 * M3c: heading no longer says "Requires Human Attestation" — that claim is
 * status/pattern-specific and belongs solely to `renderAttestationCallout`,
 * which renders directly below this block. A gaps list on a merely
 * `partially-satisfied` control (e.g. AU-12(3)) never required attestation;
 * duplicating the phrase here made that claim for every gapped control,
 * satisfied ones included, and directly contradicted the new callout's text
 * for non-attestation insufficient-evidence controls.
 */
function renderGaps(judgment: Judgment): string | null {
  if (judgment.gaps.length === 0) return null;
  const items = judgment.gaps
    .map((g) => (g.trim().length > 0 ? `- ${g}` : "- **[MISSING: empty gap description from agent]**"))
    .join("\n");
  return `#### Gaps\n\n${items}`;
}

/**
 * Distinct from renderGaps: a control can have gaps without being fully
 * insufficient-evidence; this callout marks the sharper boundary case.
 *
 * M3c: gated on the control's PATTERN, not status alone. `insufficient-evidence`
 * means two different things depending on pattern — for `attestation` controls
 * it always means "a human must sign off, no amount of AWS evidence resolves
 * this" (the code-determined bypass case). For any other pattern (e.g. a
 * `synthesis` control whose only collector genuinely returned nothing for this
 * target), it means "the model tried and couldn't gather enough evidence" —
 * a real but different situation that does NOT require human attestation, and
 * telling an auditor it does misdirects remediation.
 */
function renderAttestationCallout(result: ControlResult): string | null {
  if (result.judgment.status !== "insufficient-evidence") return null;
  if (usesAttestationCallout(result.pattern)) {
    return (
      "> **Requires human attestation.** This control's pattern is `attestation` " +
      "— conformance cannot be determined from automated AWS evidence under any " +
      "circumstance. A human reviewer must attest to this control's status directly."
    );
  }
  return (
    "> **Insufficient evidence.** mlassure could not gather sufficient evidence " +
    "to render an automated judgment for this control. Unlike `attestation`-pattern " +
    "controls, this pattern does not automatically require human sign-off — the " +
    "correct remediation depends on the specific gap, if one is listed above."
  );
}

/** Heading format `## <controlId>: <icon> <label>` is deliberate: the colon distinguishes a control heading from the `## Summary` heading for any consumer counting per-control sections. */
function renderControlSection(result: ControlResult): string {
  const j = result.judgment;
  const rationale =
    j.rationale.trim().length > 0
      ? j.rationale
      : "**[MISSING: agent did not provide a rationale for this judgment — do not treat this control as assessed without investigating.]**";
  const blocks = [
    `## ${result.controlId}: ${statusIcon(j.status, result.controlId)} ${statusLabel(j.status, result.controlId)}`,
    // Two lines, always both — confidence-as-coverage (M2c) is now the deterministic,
    // authoritative value, but the model's self-report is never silently dropped:
    // it's the signal a future essay can use to measure self-report/coverage divergence.
    // M3c/M3d: the second line's label is pattern-aware — for code-determined
    // patterns (attestation, deterministic) the confidence value is a code
    // literal, never touched by an LLM, so calling it "model self-reported"
    // would be false, not just imprecise. Names the actual pattern rather than
    // hardcoding one, since M3d added a second code-determined pattern.
    `**Confidence (evidence coverage):** ${result.coverageConfidence}\n**Confidence (${isCodeDetermined(result.pattern) ? `code-determined (${result.pattern} pattern)` : "model self-reported"}):** ${j.confidence}`,
    rationale,
    `### Evidence\n\n${renderEvidence(result)}`,
    renderGaps(j),
    renderAttestationCallout(result),
  ].filter((block): block is string => block !== null);
  return blocks.join("\n\n");
}

function renderSummary(report: AssessmentReport): string {
  const counts = new Map<Judgment["status"], number>();
  for (const r of report.results) {
    counts.set(r.judgment.status, (counts.get(r.judgment.status) ?? 0) + 1);
  }
  const rows = Array.from(counts.entries())
    .map(([status, n]) => `- ${STATUS_LABEL[status]}: ${n}`)
    .join("\n");
  return `## Summary\n\n${rows}`;
}

export function toNarrativeMarkdown(
  report: AssessmentReport,
  controlSet?: ControlSet
): string {
  const controlSetLabel =
    controlSet?.version ?? report.controlSetVersion ?? "UNKNOWN (control set version not recorded)";
  const header = [
    `# mlassure Assurance Narrative — ${report.targetName}`,
    "",
    `**Endpoint:** ${report.endpointName}  `,
    `**Control set:** ${controlSetLabel}  `,
    `**Run at:** ${report.runAt}`,
  ].join("\n");

  const sections = report.results.map(renderControlSection).join("\n\n---\n\n");

  return [header, renderSummary(report), sections].join("\n\n");
}
