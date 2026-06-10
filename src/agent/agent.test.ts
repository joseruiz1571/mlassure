import { describe, it, expect } from "bun:test";
import { resolve } from "node:path";
import { assessControl } from "./agent.js";
import { FixtureProvider } from "../providers/fixture-provider.js";
import { AnthropicProvider } from "../llm/anthropic-provider.js";
import { loadControlSet } from "../loaders/control-loader.js";

const FIXTURES_DIR = resolve(import.meta.dir, "../../fixtures");
const CONTROLS_PATH = resolve(FIXTURES_DIR, "controls/nist-subset.yaml");
const CLEAN_TARGET_PATH = resolve(FIXTURES_DIR, "targets/model-clean.json");
const STALE_TARGET_PATH = resolve(FIXTURES_DIR, "targets/model-stale.json");

const SKIP = !process.env["ANTHROPIC_API_KEY"];

describe("assessControl — integration (requires ANTHROPIC_API_KEY)", () => {
  it.skipIf(SKIP)(
    "SI-6(1) on clean fixture returns a judgment without throwing",
    async () => {
      const controlSet = await loadControlSet(CONTROLS_PATH);
      const driftControl = controlSet.controls.find((c) => c.id === "SI-6(1)");
      expect(driftControl).toBeDefined();

      const cleanFixture = JSON.parse(
        await Bun.file(CLEAN_TARGET_PATH).text()
      ) as { modelName: string; endpointName: string };

      const provider = new FixtureProvider(CLEAN_TARGET_PATH);
      const llm = new AnthropicProvider();

      const result = await assessControl(driftControl!, cleanFixture, provider, llm);

      expect(result.judgment.controlId).toBe("SI-6(1)");
      expect(result.judgment.status).toBeDefined();
      expect(result.judgment.confidence).toBeDefined();
      expect(result.judgment.rationale.length).toBeGreaterThan(0);
      expect(result.store.size()).toBeGreaterThan(0);
      console.log(
        `\nClean fixture — status: ${result.judgment.status} | confidence: ${result.judgment.confidence} | evidence: ${result.store.size()} items\n`
      );
    },
    60_000
  );

  it.skipIf(SKIP)(
    "SI-6(1) on stale fixture returns not-satisfied or insufficient-evidence",
    async () => {
      const controlSet = await loadControlSet(CONTROLS_PATH);
      const driftControl = controlSet.controls.find((c) => c.id === "SI-6(1)");

      const staleFixture = JSON.parse(
        await Bun.file(STALE_TARGET_PATH).text()
      ) as { modelName: string; endpointName: string };

      const provider = new FixtureProvider(STALE_TARGET_PATH);
      const llm = new AnthropicProvider();

      const result = await assessControl(driftControl!, staleFixture, provider, llm);

      const FAILURE_STATUSES = ["not-satisfied", "insufficient-evidence", "partially-satisfied"];
      expect(FAILURE_STATUSES).toContain(result.judgment.status);
      console.log(
        `\nStale fixture — status: ${result.judgment.status} | confidence: ${result.judgment.confidence} | evidence: ${result.store.size()} items\n`
      );
    },
    60_000
  );
});
