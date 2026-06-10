import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadControlSet } from "../loaders/control-loader.js";
import { FixtureProvider } from "../providers/fixture-provider.js";
import { EvidenceStore } from "../store/evidence-store.js";
import type { AssessmentTarget } from "../types.js";

const USAGE = `
mlassure — agentic AI-control assurance

Usage:
  mlassure assess --controls <path> --target <path>
  mlassure --help

Commands:
  assess    Load a control set and fixture target; verify the scaffold is wired

Options:
  --controls <path>   Path to YAML or JSON control set file
  --target <path>     Path to fixture target JSON file
  --help, -h          Show this help text
`.trim();

function parseArgs(argv: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      result["help"] = "true";
    } else if (arg?.startsWith("--") && argv[i + 1] && !argv[i + 1]!.startsWith("--")) {
      result[arg.slice(2)] = argv[i + 1]!;
      i++;
    } else if (!arg?.startsWith("--")) {
      result["command"] = arg ?? "";
    }
  }
  return result;
}

async function runAssess(controlsPath: string, targetPath: string): Promise<void> {
  const absControls = resolve(controlsPath);
  const absTarget = resolve(targetPath);

  const controlSet = await loadControlSet(absControls);
  const targetJson = JSON.parse(readFileSync(absTarget, "utf-8")) as AssessmentTarget;
  const _provider = new FixtureProvider(absTarget);
  const store = new EvidenceStore();

  console.log("\nmlassure M0 — scaffold\n");
  console.log(`Controls: ${controlSet.controls.length} loaded from ${absControls}`);
  for (const c of controlSet.controls) {
    const collectorCount = c.collectors.length;
    console.log(
      `  ${c.id.padEnd(12)} | ${c.pattern.padEnd(14)} | ${collectorCount} collector${collectorCount !== 1 ? "s" : ""}`
    );
  }
  console.log(`\nTarget:   ${targetJson.modelName} (${targetJson.endpointName})`);
  console.log(`Store:    ready (${store.size()} items)`);
  console.log(`\nAssessment: not yet implemented (M1)\n`);
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

    await runAssess(controls, target);
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
