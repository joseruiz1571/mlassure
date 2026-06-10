import { createHash } from "node:crypto";
import type { Evidence, RawEvidence } from "../types.js";

export class EvidenceStore {
  private readonly items = new Map<string, Evidence>();

  add(raw: RawEvidence): Evidence {
    if (this.items.has(raw.id)) {
      throw new Error(`Duplicate evidence id: ${raw.id}`);
    }
    const sha256 = createHash("sha256")
      .update(JSON.stringify(raw.payload))
      .digest("hex");
    const evidence: Evidence = { ...raw, sha256 };
    this.items.set(evidence.id, evidence);
    return evidence;
  }

  has(id: string): boolean {
    return this.items.has(id);
  }

  bundle(): Evidence[] {
    return Array.from(this.items.values());
  }

  size(): number {
    return this.items.size;
  }
}
