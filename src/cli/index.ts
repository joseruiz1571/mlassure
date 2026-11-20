import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadControlSet } from "../loaders/control-loader.js";
import { FixtureProvider } from "../providers/fixture-provider.js";
import { EvidenceStore } from "../store/evidence-store.js";
import { AnthropicProvider } from "../llm/anthropic-provider.js";
import { runAssessment } from "../runner/assessment-runner.js";
import { toOscalAssessmentResults } from "../output/oscal-ar.js";
import { toNarrativeMarkdown } from "../output/narrative.js";
import { writeEvidenceBundle, verifyEvidenceBundle } from "../output/bundle.js";
import type { AssessmentTarget } from "../types.js";
import { isCodeDetermined } from "../types.js";

const USAGE = `
mlassure — agentic AI-control assurance

Usage:
  mlassure assess --controls <path> --target <path> [--live] [--oscal <path>] [--narrative <path>] [--bundle <dir>] [--report <path>] [--model <id>] [--temperature <n>] [--repeat <n>]
  mlassure verify-bundle <dir>
  mlassure --help

Commands:
  assess           Assess a target model against a control set
  verify-bundle    Verify a custody bundle (integrity + completeness; signature checked separately via cosign)

Options:
  --controls <path>    Path to YAML or JSON control set file
  --target <path>      Path to fixture target JSON file
  --live               Run the full agent loop (requires ANTHROPIC_API_KEY in .env)
  --oscal <path>       Write OSCAL Assessment Results JSON to <path> (implies --live)
  --narrative <path>   Write the Markdown assurance narrative to <path> (implies --live)
  --bundle <dir>       Write a tamper-evident custody bundle to a fresh <dir> (implies --live)
  --report <path>      Write AssessmentReport JSON (same object as bundle report.json) to <path> (implies --live)
  --model <id>         LLM model alias (default: MLASSURE_MODEL or claude-sonnet-4-6)
  --temperature <n>    LLM temperature in [0, 1]; 0 is valid (default: 0.1)
  --repeat <n>         Run the assessment N times (integer >= 1). Output paths get a -rNN suffix when N > 1
  --help, -h           Show this help text
`.trim();

const STATUS_ICON: Record<string, string> = {
  satisfied: "✓",
  "partially-satisfied": "~",
  "not-satisfied": "✗",
  "not-applicable": "-",
  "insufficient-evidence": "?",
};

type ParsedArgs = { flags: Record<string, string>; positionals: string[] };

const VALUE_FLAGS = new Set([
  "controls",
  "target",
  "oscal",
  "narrative",
  "bundle",
  "report",
  "model",
  "temperature",
  "repeat",
]);
const BOOLEAN_FLAGS = new Set(["live", "help"]);

/**
 * Fail-loud parsing (silent-failure-hunter + code-reviewer, M3g): a
 * value-taking flag with a missing or `--`-prefixed value used to be
 * silently DROPPED — `assess ... --bundle` (directory forgotten) ran
 * scaffold-only with exit 0 while the operator believed a custody bundle
 * existed. Unknown flags (`--bundel`) were silent no-ops. Both now exit 1.
 */
function parseArgs(argv: string[]): ParsedArgs {
  const flags: Record<string, string> = {};
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--help" || arg === "-h") {
      flags["help"] = "true";
    } else if (arg.startsWith("--")) {
      const name = arg.slice(2);
      if (BOOLEAN_FLAGS.has(name)) {
        flags[name] = "true";
      } else if (VALUE_FLAGS.has(name)) {
        const value = argv[i + 1];
        if (value === undefined || value.startsWith("--")) {
          console.error(`Error: ${arg} requires a value`);
          console.error(USAGE);
          process.exit(1);
        }
        flags[name] = value;
        i++;
      } else {
        console.error(`Error: unknown flag ${arg}`);
        console.error(USAGE);
        process.exit(1);
      }
    } else {
      // First positional is the command; later ones are command arguments
      // (previously every positional overwrote "command", which made a
      // command with an argument — verify-bundle <dir> — unparseable).
      positionals.push(arg);
    }
  }
  return { flags, positionals };
}


function parseTemperature(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  // 0 is a required study setting — do not use `||` which would treat it as missing.
  if (!Number.isFinite(n) || n < 0 || n > 1) {
    console.error(`Error: --temperature must be a number in [0, 1] (got ${JSON.stringify(raw)})`);
    console.error(USAGE);
    process.exit(1);
  }
  return n;
}

function parseRepeat(raw: string | undefined): number {
  if (raw === undefined) return 1;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    console.error(`Error: --repeat must be an integer >= 1 (got ${JSON.stringify(raw)})`);
    console.error(USAGE);
    process.exit(1);
  }
  return n;
}

/**
 * When --repeat N>1, suffix an output path so each replica writes a fresh
 * file/dir (the bundle writer refuses non-empty directories).
 * `out/report.json` → `out/report-r02.json`; `out/bundle` → `out/bundle-r02`.
 */
function replicaPath(path: string, replica: number, repeats: number): string {
  if (repeats <= 1) return path;
  const suffix = `-r${String(replica).padStart(2, "0")}`;
  const dot = path.lastIndexOf(".");
  const slash = path.lastIndexOf("/");
  if (dot > slash && dot !== -1) {
    return `${path.slice(0, dot)}${suffix}${path.slice(dot)}`;
  }
  return `${path}${suffix}`;
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

type LiveOptions = {
  oscalPath?: string;
  narrativePath?: string;
  bundleDir?: string;
  reportPath?: string;
  model?: string;
  temperature?: number;
  replica?: number;
  repeats?: number;
};

async function runLive(
  controlsPath: string,
  targetPath: string,
  opts: LiveOptions = {}
): Promise<void> {
  const controlSet = await loadControlSet(controlsPath);
  const targetJson = JSON.parse(readFileSync(targetPath, "utf-8")) as AssessmentTarget;
  const provider = new FixtureProvider(targetPath);
  const llm = new AnthropicProvider({
    ...(opts.model !== undefined ? { model: opts.model } : {}),
    ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
  });

  console.log(
    `\nmlassure — running assessment\n  Target:   ${targetJson.modelName}\n  Controls: ${controlSet.controls.length}\n`
  );

  const report = await runAssessment(controlSet, targetJson, provider, llm);
  // Study-required fields that live on the CLI-owned provider, not LlmProvider:
  report.llmModel = llm.model;
  report.llmTemperature = llm.temperature;
  if ((opts.repeats ?? 1) > 1 && opts.replica !== undefined) report.replica = opts.replica;

  const repeats = opts.repeats ?? 1;
  const replica = opts.replica ?? 1;
  const oscalPath = opts.oscalPath
    ? replicaPath(opts.oscalPath, replica, repeats)
    : undefined;
  const narrativePath = opts.narrativePath
    ? replicaPath(opts.narrativePath, replica, repeats)
    : undefined;
  const bundleDir = opts.bundleDir
    ? replicaPath(opts.bundleDir, replica, repeats)
    : undefined;
  const reportPath = opts.reportPath
    ? replicaPath(opts.reportPath, replica, repeats)
    : undefined;

  console.log(`\n${"─".repeat(72)}`);
  console.log(`  mlassure Assessment Report`);
  console.log(`  Target: ${report.targetName} (${report.endpointName})`);
  console.log(`  Run at: ${report.runAt}`);
  console.log(`${"─".repeat(72)}\n`);

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
    console.log(
      `  ${icon} ${r.judgment.controlId.padEnd(12)} ${r.judgment.status.padEnd(22)} conf:${r.coverageConfidence.padEnd(7)} ${confidenceLabel}:${r.judgment.confidence.padEnd(7)} evidence:${r.evidenceCount}`
    );
    if (r.judgment.gaps.length > 0) {
      for (const gap of r.judgment.gaps) {
        console.log(`      gap: ${gap}`);
      }
    }
  }

  console.log(`\n${"─".repeat(72)}\n`);

  // Each write is wrapped individually so a failure on one names itself precisely
  // and reports the other artifact's state — an operator must never have to infer
  // which audit artifact exists on disk from console scrollback alone.
  let oscalWritten: string | undefined;

  // Documents are generated ONCE and shared between the standalone write and
  // the custody bundle, so the bundle's copies are byte-identical to the
  // standalone artifacts (same run, same serialization).
  const oscal =
    oscalPath || bundleDir ? toOscalAssessmentResults(report, controlSet) : undefined;
  const narrative =
    narrativePath || bundleDir ? toNarrativeMarkdown(report, controlSet) : undefined;

  if (oscalPath) {
    try {
      writeFileSync(oscalPath, JSON.stringify(oscal, null, 2), "utf-8");
      oscalWritten = oscalPath;
      console.log(`  OSCAL Assessment Results written to ${oscalPath}\n`);
    } catch (err) {
      throw new Error(
        `Failed to write OSCAL Assessment Results to ${oscalPath}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  if (narrativePath) {
    try {
      writeFileSync(narrativePath, narrative!, "utf-8");
      console.log(`  Assurance narrative written to ${narrativePath}\n`);
    } catch (err) {
      const oscalNote = oscalWritten
        ? ` (NOTE: OSCAL results were already written to ${oscalWritten} — only the narrative is missing)`
        : "";
      throw new Error(
        `Failed to write assurance narrative to ${narrativePath}: ${err instanceof Error ? err.message : String(err)}${oscalNote}`
      );
    }
  }

  if (reportPath) {
    try {
      writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");
      console.log(`  AssessmentReport JSON written to ${reportPath}\n`);
    } catch (err) {
      throw new Error(
        `Failed to write AssessmentReport JSON to ${reportPath}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  if (bundleDir) {
    try {
      const manifest = writeEvidenceBundle(report, bundleDir, {
        ...(oscal !== undefined ? { oscal } : {}),
        ...(narrative !== undefined ? { narrative } : {}),
      });
      console.log(
        `  Custody bundle written to ${bundleDir} (${manifest.files.length} files, root ${manifest.rootHash.slice(0, 16)}…)`
      );
      console.log(
        `  Verify anytime:  mlassure verify-bundle ${bundleDir}\n`
      );
    } catch (err) {
      // Report full on-disk state (hunter, M3g): the standalone artifacts
      // that DID land, and that bundleDir may now hold a partial,
      // manifest-less directory the next --bundle run will refuse.
      const written = [
        ...(oscalWritten ? [`OSCAL written to ${oscalWritten}`] : []),
        ...(narrativePath ? [`narrative written to ${narrativePath}`] : []),
      ];
      const stateNote = written.length > 0 ? ` (${written.join("; ")})` : "";
      throw new Error(
        `Failed to write custody bundle to ${bundleDir}: ${err instanceof Error ? err.message : String(err)}${stateNote}. ${bundleDir} may hold a partial, manifest-less bundle — delete it before retrying.`,
        { cause: err }
      );
    }
  }
}

function runVerifyBundle(dir: string): never {
  const result = verifyEvidenceBundle(dir);
  if (result.ok) {
    // Say precisely what exit 0 means (code-reviewer + hunter, M3g): this
    // command proves integrity + completeness; only the cosign signature
    // anchors the manifest itself. Never let "OK" read as "custody intact".
    console.log(
      `verify-bundle: OK — ${result.checkedFiles} files verified, root ${result.rootHash}`
    );
    console.log(
      `  Scope: integrity + completeness only. Authenticity requires the signature:`
    );
    const sigPresent = existsSync(join(dir, "manifest.sig.bundle"));
    console.log(
      sigPresent
        ? `  Signature artifacts present but NOT verified by this command — run:\n    cosign verify-blob --key cosign.pub --bundle ${join(dir, "manifest.sig.bundle")} ${join(dir, "manifest.json")}`
        : `    cosign verify-blob --key cosign.pub --bundle <manifest.sig.bundle> ${join(dir, "manifest.json")}\n  (no signature artifacts found in this bundle)`
    );
    process.exit(0);
  }
  console.error(`verify-bundle: FAILED — ${result.errors.length} violation(s):`);
  for (const e of result.errors) {
    console.error(`  ✗ ${e}`);
  }
  process.exit(1);
}

async function main(): Promise<void> {
  const { flags, positionals } = parseArgs(process.argv.slice(2));

  if (flags["help"]) {
    console.log(USAGE);
    process.exit(0);
  }

  const command = positionals[0];

  if (command === "assess") {
    const controls = flags["controls"];
    const target = flags["target"];

    if (!controls || !target) {
      console.error("Error: assess requires --controls <path> and --target <path>");
      console.error(USAGE);
      process.exit(1);
    }

    const absControls = resolve(controls);
    const absTarget = resolve(target);
    const oscalPath = flags["oscal"] ? resolve(flags["oscal"]) : undefined;
    const narrativePath = flags["narrative"] ? resolve(flags["narrative"]) : undefined;
    const bundleDir = flags["bundle"] ? resolve(flags["bundle"]) : undefined;
    const reportPath = flags["report"] ? resolve(flags["report"]) : undefined;
    const model = flags["model"];
    const temperature = parseTemperature(flags["temperature"]);
    const repeats = parseRepeat(flags["repeat"]);

    // --oscal/--narrative/--bundle/--report/--model/--temperature/--repeat
    // each require a real assessment run, so any of them implies --live.
    const live =
      Boolean(flags["live"]) ||
      Boolean(oscalPath) ||
      Boolean(narrativePath) ||
      Boolean(bundleDir) ||
      Boolean(reportPath) ||
      model !== undefined ||
      temperature !== undefined ||
      flags["repeat"] !== undefined;
    if (live) {
      for (let replica = 1; replica <= repeats; replica++) {
        await runLive(absControls, absTarget, {
          oscalPath,
          narrativePath,
          bundleDir,
          reportPath,
          model,
          temperature,
          replica,
          repeats,
        });
      }
    } else {
      await runScaffoldOnly(absControls, absTarget);
    }
    return;
  }

  if (command === "verify-bundle") {
    const dir = positionals[1];
    if (!dir) {
      console.error("Error: verify-bundle requires a bundle directory argument");
      console.error(USAGE);
      process.exit(1);
    }
    if (positionals.length > 2) {
      console.error(
        `Error: verify-bundle takes exactly one directory (got ${positionals.length - 1}: ${positionals.slice(1).join(", ")})`
      );
      process.exit(1);
    }
    runVerifyBundle(resolve(dir));
  }

  console.error(`Unknown command: ${command ?? "(none)"}`);
  console.error(USAGE);
  process.exit(1);
}

main().catch((err: unknown) => {
  console.error("Fatal:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
