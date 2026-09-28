import { describe, it, expect } from "bun:test";
import { terminalReportLines } from "./summary.js";
import { runPocFixture } from "../providers/poc-evidence.testkit.js";

describe("terminal summary (M8c)", () => {
  it("ISC-M8c-7: a PoC run's summary prints the evidence-scope sentence once, in the header", async () => {
    const { report } = await runPocFixture();
    const lines = terminalReportLines(report);
    const scope = lines.filter((l) => l.includes("Evidence scope:"));
    expect(scope).toEqual([`  ${report.evidenceScope!}`]);
    expect(lines.indexOf(scope[0]!)).toBe(4); // after "Run at:", before the closing rule
    expect(lines.some((l) => l.includes("PoC-7.7.1"))).toBe(true);
  });

  it("a report without evidenceScope prints the pre-M8c header lines exactly", async () => {
    const { report } = await runPocFixture();
    const { evidenceScope: _dropped, ...plain } = report;
    const lines = terminalReportLines(plain);
    expect(lines.slice(0, 5)).toEqual([
      `\n${"─".repeat(72)}`,
      `  mlassure Assessment Report`,
      `  Target: ${report.targetName} (${report.endpointName})`,
      `  Run at: ${report.runAt}`,
      `${"─".repeat(72)}\n`,
    ]);
  });
});
