import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  type ControlSet,
  type ControlItem,
  type AgentPattern,
  type TagProvenanceRecord,
  AGENT_PATTERNS,
} from "../types.js";

function isAgentPattern(v: unknown): v is AgentPattern {
  return AGENT_PATTERNS.includes(v as AgentPattern);
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Format AND calendar validity — "2026-13-45" matches the regex but is not a date. */
function isValidIsoDate(v: string): boolean {
  if (!ISO_DATE_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/**
 * Tag provenance (M3f): directional migration records for the control's
 * pattern tag. Fail-loud on every invalid shape — an authority record that
 * can be silently repaired is not an authority record. Historical `pattern`
 * values are shape-checked only (a retired pattern name in an old record
 * must stay loadable forever); registry membership is enforced solely
 * through the head==live coupling, since the live `pattern` field is
 * already registry-validated by validateControl.
 */
function validateTagProvenance(
  raw: unknown,
  controlId: string,
  livePattern: AgentPattern
): TagProvenanceRecord[] {
  if (!Array.isArray(raw)) {
    throw new Error(
      `Control "${controlId}": "tagProvenance" must be an array of records`
    );
  }
  if (raw.length === 0) {
    throw new Error(
      `Control "${controlId}": "tagProvenance" is present but empty — omit the field entirely if no history is recorded`
    );
  }

  const KNOWN_KEYS = new Set(["pattern", "assigned", "rationale", "supersedes"]);
  // "→" and "@" are the delimiters of the OSCAL pattern-migration prop value
  // (from→to@date); a historical pattern name containing them would make the
  // prop unparseable. A charset constraint on new data, not a repair of old.
  const RESERVED_CHARS_RE = /[→@]/;

  const records: TagProvenanceRecord[] = raw.map((r, i) => {
    if (typeof r !== "object" || r === null) {
      throw new Error(
        `Control "${controlId}": tagProvenance record ${i} is not an object`
      );
    }
    const rec = r as Record<string, unknown>;
    // Unknown keys are rejected, not dropped: a misspelled `supersedes` on an
    // origin record would otherwise load as a clean origin, silently discarding
    // the author's recorded predecessor. An authority record that silently
    // discards authored fields is not an authority record.
    const unknown = Object.keys(rec).filter((k) => !KNOWN_KEYS.has(k));
    if (unknown.length > 0) {
      throw new Error(
        `Control "${controlId}": tagProvenance record ${i} has unknown field(s) ${unknown.join(", ")} — authority records reject unrecognized keys`
      );
    }
    if (typeof rec["pattern"] !== "string" || rec["pattern"].trim() === "") {
      throw new Error(
        `Control "${controlId}": tagProvenance record ${i} is missing a non-empty string "pattern"`
      );
    }
    if (RESERVED_CHARS_RE.test(rec["pattern"])) {
      throw new Error(
        `Control "${controlId}": tagProvenance record ${i} "pattern" contains a reserved character (→ or @) — these delimit the OSCAL migration-prop encoding`
      );
    }
    if (typeof rec["assigned"] !== "string" || !isValidIsoDate(rec["assigned"])) {
      throw new Error(
        `Control "${controlId}": tagProvenance record ${i} "assigned" must be a valid YYYY-MM-DD date (got ${JSON.stringify(rec["assigned"])})`
      );
    }
    if (typeof rec["rationale"] !== "string" || rec["rationale"].trim() === "") {
      throw new Error(
        `Control "${controlId}": tagProvenance record ${i} is missing a non-empty "rationale" — a tag assignment without a why is not an authority record`
      );
    }
    // Interior newlines (a `|` literal block, or a folded scalar containing a
    // blank line) would escape the narrative's list-item structure and render
    // as free-floating paragraphs. Folded single-line scalars — the sanctioned
    // authoring style — never produce them, so reject rather than repair.
    if (/[\r\n]/.test(rec["rationale"].trim())) {
      throw new Error(
        `Control "${controlId}": tagProvenance record ${i} "rationale" contains interior line breaks — use a single-line folded scalar (>)`
      );
    }
    if (
      rec["supersedes"] !== undefined &&
      (typeof rec["supersedes"] !== "string" || rec["supersedes"].trim() === "")
    ) {
      throw new Error(
        `Control "${controlId}": tagProvenance record ${i} "supersedes" must be a non-empty string when present`
      );
    }
    if (
      typeof rec["supersedes"] === "string" &&
      RESERVED_CHARS_RE.test(rec["supersedes"])
    ) {
      throw new Error(
        `Control "${controlId}": tagProvenance record ${i} "supersedes" contains a reserved character (→ or @) — these delimit the OSCAL migration-prop encoding`
      );
    }
    return {
      pattern: rec["pattern"],
      assigned: rec["assigned"],
      // trim(): YAML folded scalars (`>`) append a trailing newline — a
      // serialization artifact, not authored content. Left untrimmed it
      // injects blank lines into the narrative's provenance list. This is
      // canonicalization of whitespace only; content is never repaired.
      rationale: rec["rationale"].trim(),
      ...(typeof rec["supersedes"] === "string"
        ? { supersedes: rec["supersedes"] }
        : {}),
    };
  });

  // Directional-chain invariants. Array order is authoritative; dates must
  // agree with it (non-decreasing — same-day migrations are legal).
  if (records[0]!.supersedes !== undefined) {
    throw new Error(
      `Control "${controlId}": tagProvenance origin record must not carry "supersedes" — it has no predecessor`
    );
  }
  for (let i = 1; i < records.length; i++) {
    const prev = records[i - 1]!;
    const cur = records[i]!;
    if (cur.supersedes === undefined) {
      throw new Error(
        `Control "${controlId}": tagProvenance record ${i} is a migration and must name "supersedes"`
      );
    }
    if (cur.supersedes !== prev.pattern) {
      throw new Error(
        `Control "${controlId}": tagProvenance record ${i} supersedes "${cur.supersedes}" but the previous record's pattern is "${prev.pattern}" — broken migration chain`
      );
    }
    // Lexicographic comparison is chronological for YYYY-MM-DD.
    if (cur.assigned < prev.assigned) {
      throw new Error(
        `Control "${controlId}": tagProvenance record ${i} assigned ${cur.assigned} predates the previous record (${prev.assigned}) — records must be in non-decreasing chronological order`
      );
    }
  }
  const head = records[records.length - 1]!;
  if (head.pattern !== livePattern) {
    throw new Error(
      `Control "${controlId}": tagProvenance head is "${head.pattern}" but the control's live pattern is "${livePattern}" — the history head must match the live tag; update both together`
    );
  }

  return records;
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
    ...(c["tagProvenance"] !== undefined
      ? {
          tagProvenance: validateTagProvenance(
            c["tagProvenance"],
            c["id"],
            c["pattern"]
          ),
        }
      : {}),
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
