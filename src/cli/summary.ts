import type { AssessmentReport } from "../runner/assessment-runner.js";
import { isCodeDetermined } from "../types.js";

const STATUS_ICON: Record<string, string> = {
  satisfied: "✓",
  "partially-satisfied": "~",
  "not-satisfied": "✗",
  "not-applicable": "-",
  "insufficient-evidence": "?",
};

/**
 * The terminal summary of a live run, one entry per `console.log` call.
 * A pure function so the output can be tested without an API key (M8c);
 * the CLI prints each entry as it always printed these lines.
 */
export function terminalReportLines(report: AssessmentReport): string[] {
  const lines = [
    `\n${"─".repeat(72)}`,
    `  mlassure Assessment Report`,
    `  Target: ${report.targetName} (${report.endpointName})`,
    `  Run at: ${report.runAt}`,
  ];
  // M8c: the family's evidence-scope sentence, present on the report only
  // for a declared non-SageMaker family, so a SageMaker summary is unchanged.
  if (report.evidenceScope !== undefined) {
    lines.push(`  ${report.evidenceScope}`);
  }
  lines.push(`${"─".repeat(72)}\n`);

  for (const r of report.results) {
    const icon = STATUS_ICON[r.judgment.status] ?? "?";
    // conf: is coverageConfidence (M2c, deterministic) — the now-authoritative value.
    // The second label is pattern-aware (M3c): "self-reported" for every pattern
    // except attestation, whose judgment is code-generated (agent.ts's LLM bypass,
    // M3b) — calling that confidence value "self-reported" would be false, not
    // just imprecise. Kept visible either way, never dropped.
    // padEnd(7) never truncates, but is only safe from misalignment because both
    // values are validated to the 3-value confidence union before reaching here:
    // judgment.confidence via parseJudgment/JUDGMENT_CONFIDENCES, coverageConfidence
    // by construction in deriveCoverageConfidence. Neither file re-checks the other's
    // guarantee — if that union ever widens, this line degrades silently to cosmetic
    // misalignment, not a crash.
    const confidenceLabel = isCodeDetermined(r.pattern) ? "code-determined" : "self-reported";
    lines.push(
      `  ${icon} ${r.judgment.controlId.padEnd(12)} ${r.judgment.status.padEnd(22)} conf:${r.coverageConfidence.padEnd(7)} ${confidenceLabel}:${r.judgment.confidence.padEnd(7)} evidence:${r.evidenceCount}`
    );
    if (r.judgment.gaps.length > 0) {
      for (const gap of r.judgment.gaps) {
        lines.push(`      gap: ${gap}`);
      }
    }
  }

  lines.push(`\n${"─".repeat(72)}\n`);
  return lines;
}
