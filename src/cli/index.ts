import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadControlSet } from "../loaders/control-loader.js";
import { FixtureProvider } from "../providers/fixture-provider.js";
import { EvidenceStore } from "../store/evidence-store.js";
import { AnthropicProvider } from "../llm/anthropic-provider.js";
import { runAssessment } from "../runner/assessment-runner.js";
import type { AssessmentTarget } from "../types.js";

const USAGE = `
mlassure — agentic AI-control assurance

Usage:
  mlassure assess --controls <path> --target <path> [--live]
  mlassure --help

Commands:
  assess    Assess a target model against a control set

Options:
  --controls <path>   Path to YAML or JSON control set file
  --target <path>     Path to fixture target JSON file
  --live              Run the full agent loop (requires ANTHROPIC_API_KEY in .env)
  --help, -h          Show this help text
`.trim();

const STATUS_ICON: Record<string, string> = {
  satisfied: "✓",
  "partially-satisfied": "~",
  "not-satisfied": "✗",
  "not-applicable": "-",
  "insufficient-evidence": "?",
};

function parseArgs(argv: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      result["help"] = "true";
    } else if (arg === "--live") {
      result["live"] = "true";
    } else if (arg?.startsWith("--") && argv[i + 1] && !argv[i + 1]!.startsWith("--")) {
      result[arg.slice(2)] = argv[i + 1]!;
      i++;
    } else if (!arg?.startsWith("--")) {
      result["command"] = arg ?? "";
    }
  }
  return result;
}

async function runScaffoldOnly(
  controlsPath: string,
  targetPath: string
): Promise<void> {
  const controlSet = await loadControlSet(controlsPath);
  const targetJson = JSON.parse(readFileSync(targetPath, "utf-8")) as AssessmentTarget;
  const _provider = new FixtureProvider(targetPath);
  const store = new EvidenceStore();

  console.log("\nmlassure — scaffold mode (pass --live for agent assessment)\n");
  console.log(`Controls: ${controlSet.controls.length} loaded`);
  for (const c of controlSet.controls) {
    const n = c.collectors.length;
    console.log(
      `  ${c.id.padEnd(12)} | ${c.pattern.padEnd(14)} | ${n} collector${n !== 1 ? "s" : ""}`
    );
  }
  console.log(`\nTarget:   ${targetJson.modelName} (${targetJson.endpointName})`);
  console.log(`Store:    ready (${store.size()} items)`);
  console.log(`\nRun with --live to invoke the agent loop.\n`);
}

async function runLive(
  controlsPath: string,
  targetPath: string
): Promise<void> {
  const controlSet = await loadControlSet(controlsPath);
  const targetJson = JSON.parse(readFileSync(targetPath, "utf-8")) as AssessmentTarget;
  const provider = new FixtureProvider(targetPath);
  const llm = new AnthropicProvider();

  console.log(
    `\nmlassure — running assessment\n  Target:   ${targetJson.modelName}\n  Controls: ${controlSet.controls.length}\n`
  );

  const report = await runAssessment(controlSet, targetJson, provider, llm);

  console.log(`\n${"─".repeat(72)}`);
  console.log(`  mlassure Assessment Report`);
  console.log(`  Target: ${report.targetName} (${report.endpointName})`);
  console.log(`  Run at: ${report.runAt}`);
  console.log(`${"─".repeat(72)}\n`);

  for (const r of report.results) {
    const icon = STATUS_ICON[r.judgment.status] ?? "?";
    console.log(
      `  ${icon} ${r.judgment.controlId.padEnd(12)} ${r.judgment.status.padEnd(22)} conf:${r.judgment.confidence.padEnd(7)} evidence:${r.evidenceCount}`
    );
    if (r.judgment.gaps.length > 0) {
      for (const gap of r.judgment.gaps) {
        console.log(`      gap: ${gap}`);
      }
    }
  }

  console.log(`\n${"─".repeat(72)}\n`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args["help"]) {
    console.log(USAGE);
    process.exit(0);
  }

  const command = args["command"];

  if (command === "assess") {
    const controls = args["controls"];
    const target = args["target"];

    if (!controls || !target) {
      console.error("Error: assess requires --controls <path> and --target <path>");
      console.error(USAGE);
      process.exit(1);
    }

    const absControls = resolve(controls);
    const absTarget = resolve(target);

    if (args["live"]) {
      await runLive(absControls, absTarget);
    } else {
      await runScaffoldOnly(absControls, absTarget);
    }
    return;
  }

  console.error(`Unknown command: ${command ?? "(none)"}`);
  console.error(USAGE);
  process.exit(1);
}

main().catch((err: unknown) => {
  console.error("Fatal:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
