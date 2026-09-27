import { describe, it, expect, setSystemTime, afterEach } from "bun:test";
import { readFileSync } from "node:fs";
import {
  awsSageMakerProvider,
  AWS_SAGEMAKER_COLLECTORS,
  type AwsProvider,
} from "./aws-sagemaker.js";
import { FixtureProvider } from "./fixture-provider.js";
import { loadControlSet } from "../loaders/control-loader.js";
import { buildToolDefs, SUBMIT_JUDGMENT_TOOL } from "../tools/registry.js";
import { buildSystemPrompt, buildInitialMessage } from "../agent/prompts.js";
import type { AssessmentTarget, RawEvidence } from "../types.js";

const TARGET: AssessmentTarget = { modelName: "fraud-detection-v2", endpointName: "ep" };

const NAMES = Object.keys(AWS_SAGEMAKER_COLLECTORS) as (keyof AwsProvider)[];

/** Each method answers with evidence naming itself, and records its arguments. */
function makeSpy(): { impl: AwsProvider; calls: { method: string; args: unknown[] }[] } {
  const calls: { method: string; args: unknown[] }[] = [];
  const impl = {} as Record<string, (...args: unknown[]) => Promise<RawEvidence>>;
  for (const name of NAMES) {
    impl[name] = async (...args: unknown[]) => {
      calls.push({ method: name, args });
      return { id: `id-${name}`, source: name, retrievedAt: "t", payload: { from: name } };
    };
  }
  return { impl: impl as unknown as AwsProvider, calls };
}

describe("SageMaker family adapter", () => {
  afterEach(() => setSystemTime());

  it("offers nine collectors", () => {
    expect(NAMES).toHaveLength(9);
  });

  for (const name of NAMES) {
    it(`"${name}" runs its own method, once, with the target`, async () => {
      const { impl, calls } = makeSpy();

      const result = await awsSageMakerProvider(impl).collect(name, TARGET);

      expect(calls.map((c) => c.method)).toEqual([name]);
      expect(calls[0]!.args[0]).toBe(TARGET);
      expect((result as RawEvidence).source).toBe(name);
    });
  }

  it("getCloudTrailEvents asks for the 90 days before now", async () => {
    setSystemTime(new Date("2026-09-27T00:00:00.000Z"));
    const { impl, calls } = makeSpy();

    await awsSageMakerProvider(impl).collect("getCloudTrailEvents", TARGET);

    expect(calls[0]!.args[1]).toEqual(new Date("2026-06-29T00:00:00.000Z"));
  });
});

describe("SageMaker family — what the model is sent (parity)", () => {
  it("tool definitions and prompts match the pinned capture for every control in nist-subset", async () => {
    const pinned = JSON.parse(
      readFileSync("fixtures/parity/sagemaker-llm-inputs.json", "utf-8")
    ) as unknown;
    const controlSet = await loadControlSet("fixtures/controls/nist-subset.yaml");
    const provider = awsSageMakerProvider(
      new FixtureProvider("fixtures/targets/model-clean.json")
    );

    const tools: Record<string, unknown> = {};
    const prompts: Record<string, string> = {};
    for (const control of controlSet.controls) {
      tools[control.id] = buildToolDefs(control.collectors, provider);
      prompts[control.id] = buildSystemPrompt(control);
    }

    expect(controlSet.controls.length).toBeGreaterThan(0);
    const sent: unknown = {
      tools,
      prompts,
      initial: buildInitialMessage(TARGET),
      submit: SUBMIT_JUDGMENT_TOOL,
    };
    expect(sent).toEqual(pinned);
  });
});
