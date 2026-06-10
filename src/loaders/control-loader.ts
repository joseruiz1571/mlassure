import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  type ControlSet,
  type ControlItem,
  type AgentPattern,
  AGENT_PATTERNS,
} from "../types.js";

function isAgentPattern(v: unknown): v is AgentPattern {
  return AGENT_PATTERNS.includes(v as AgentPattern);
}

function validateControl(raw: unknown, index: number): ControlItem {
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`Control at index ${index} is not an object`);
  }
  const c = raw as Record<string, unknown>;

  if (typeof c["id"] !== "string" || c["id"].trim() === "") {
    throw new Error(`Control at index ${index} is missing a string "id" field`);
  }
  if (typeof c["framework"] !== "string") {
    throw new Error(`Control "${c["id"]}" is missing "framework"`);
  }
  if (!isAgentPattern(c["pattern"])) {
    throw new Error(
      `Invalid agent pattern "${String(c["pattern"])}" on control "${c["id"]}". ` +
        `Valid: ${AGENT_PATTERNS.join("|")}`
    );
  }
  if (typeof c["intent"] !== "string") {
    throw new Error(`Control "${c["id"]}" is missing "intent"`);
  }

  const collectors = Array.isArray(c["collectors"])
    ? (c["collectors"] as string[])
    : [];

  return {
    id: c["id"],
    framework: c["framework"],
    pattern: c["pattern"],
    intent: c["intent"],
    collectors,
    ...(typeof c["note"] === "string" ? { note: c["note"] } : {}),
  };
}

export async function loadControlSet(filePath: string): Promise<ControlSet> {
  const raw = readFileSync(filePath, "utf-8");
  const ext = extname(filePath).toLowerCase();
  let parsed: unknown;

  if (ext === ".yaml" || ext === ".yml") {
    parsed = parseYaml(raw);
  } else {
    parsed = JSON.parse(raw);
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`Control file "${filePath}" did not parse to an object`);
  }

  const doc = parsed as Record<string, unknown>;

  if (typeof doc["version"] !== "string") {
    throw new Error(`Control file "${filePath}" is missing a "version" field`);
  }

  if (!Array.isArray(doc["controls"])) {
    throw new Error(
      `Control file "${filePath}" is missing a "controls" array`
    );
  }

  const controls = (doc["controls"] as unknown[]).map((c, i) =>
    validateControl(c, i)
  );

  return {
    version: doc["version"],
    ...(typeof doc["description"] === "string"
      ? { description: doc["description"] }
      : {}),
    controls,
  };
}
