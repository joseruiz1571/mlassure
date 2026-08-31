import { afterEach, describe, expect, test } from "bun:test";
import { AnthropicProvider } from "./anthropic-provider.js";

const KEY = { apiKey: "test-key" };

afterEach(() => {
  delete process.env["MLASSURE_MODEL"];
});

describe("AnthropicProvider configuration", () => {
  test("temperature 0 is kept, not swallowed by a falsy default", () => {
    const provider = new AnthropicProvider({ ...KEY, temperature: 0 });
    expect(provider.temperature).toBe(0);
  });

  test("temperature defaults to 0.1 when not passed", () => {
    const provider = new AnthropicProvider(KEY);
    expect(provider.temperature).toBe(0.1);
  });

  test("model option wins over MLASSURE_MODEL and the built-in default", () => {
    process.env["MLASSURE_MODEL"] = "env-model";
    const provider = new AnthropicProvider({ ...KEY, model: "option-model" });
    expect(provider.model).toBe("option-model");
  });

  test("MLASSURE_MODEL is read when no model option is passed", () => {
    process.env["MLASSURE_MODEL"] = "env-model";
    const provider = new AnthropicProvider(KEY);
    expect(provider.model).toBe("env-model");
  });

  test("falls back to the built-in default model", () => {
    const provider = new AnthropicProvider(KEY);
    expect(provider.model).toBe("claude-sonnet-4-6");
  });
});
