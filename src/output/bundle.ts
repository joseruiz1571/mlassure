/**
 * Custody chain (M3g): tamper-evident evidence bundle writer + verifier.
 *
 * A bundle is a directory containing everything an assessment run produced
 * and saw — report.json, one evidence/<uuid>.json per retrieved evidence
 * item (payloads included, cited or not), optional oscal.json/narrative.md
 * from the same run — plus manifest.json: per-file sha256 + byte size and
 * a root hash over the whole set. The manifest is written LAST: a crash
 * mid-write leaves a bundle with no manifest (loudly unverifiable), never
 * a manifest describing files that were not yet written.
 *
 * Custody properties and their mechanisms:
 *   integrity        — per-file sha256, recomputed from bytes on disk
 *   completeness     — rootHash + strict extra-file detection (unaccounted
 *                      content fails; no junk-file allowlist — an allowlist
 *                      is an attacker's hiding spot)
 *   authenticity     — external cosign signature over manifest.json (the
 *                      manifest covers the files, the signature covers the
 *                      manifest); signature artifacts are the ONLY files
 *                      exempt from extra-file detection, by exact name
 *   tamper-evidence  — any bit flip in any covered file fails verification
 *
 * What none of this proves: that the assessment methodology was sound.
 * A signature authenticates WHO produced the bytes and that they are
 * unaltered — it says nothing about whether the judgment inside them
 * was right.
 *
 * Verification never regenerates content — it hashes the bytes on disk.
 * Re-serializing JSON to re-hash would break on key-order nondeterminism.
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  lstatSync,
} from "node:fs";
import { join } from "node:path";
import type { AssessmentReport } from "../runner/assessment-runner.js";

export const BUNDLE_FORMAT_VERSION = "1";
export const MANIFEST_FILENAME = "manifest.json";

/**
 * The signature chain's own artifacts: written AFTER the manifest (by an
 * external cosign invocation), so they cannot appear in the manifest they
 * sign. Exempt from extra-file detection by EXACT name — everything else
 * unaccounted-for is a custody violation.
 */
export const ALLOWED_UNMANIFESTED: readonly string[] = [
  MANIFEST_FILENAME,
  "manifest.sig.bundle",
  "manifest.json.sig",
  "cosign.pub",
];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type BundleFileEntry = {
  /** Relative path, `/`-separated, NFC-normalized. */
  path: string;
  sha256: string;
  bytes: number;
};

export type BundleManifest = {
  bundleFormatVersion: string;
  algorithm: "sha256";
  createdAt: string;
  targetName: string;
  controlSetVersion: string;
  files: BundleFileEntry[];
  rootHash: string;
};

function sha256Hex(buf: Uint8Array | string): string {
  return createHash("sha256").update(buf).digest("hex");
}

/** The manifest fields covered by the root hash alongside the file pairs. */
export type ManifestMeta = {
  bundleFormatVersion: string;
  algorithm: "sha256";
  createdAt: string;
  targetName: string;
  controlSetVersion: string;
};

/**
 * Canonical root hash: sha256 over the JSON encoding of the manifest
 * metadata followed by sorted [path, sha256] pairs. Metadata is INSIDE the
 * root hash (code-review, M3g): otherwise an unsigned `verify-bundle` calls
 * a bundle "intact" while its targetName/controlSetVersion are freely
 * editable. JSON encoding is injective — no `path:hash` delimiter ambiguity
 * for hostile path strings. Paths are NFC-normalized before sorting so a
 * bundle written on macOS (NFD filesystem) computes the identical root hash
 * on Linux (NFC). Sort order is UTF-16 code-unit order (plain JS string
 * comparison) — stated precisely so a non-JS verifier implements the same
 * contract; today's paths are ASCII, where the two coincide.
 */
export function computeRootHash(meta: ManifestMeta, files: BundleFileEntry[]): string {
  const pairs = files
    .map((f) => [f.path.normalize("NFC"), f.sha256] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return sha256Hex(
    JSON.stringify([
      meta.bundleFormatVersion,
      meta.algorithm,
      meta.createdAt,
      meta.targetName,
      meta.controlSetVersion,
      pairs,
    ])
  );
}

export type WriteBundleOptions = {
  /** OSCAL Assessment Results document produced by this same run. */
  oscal?: unknown;
  /** Markdown narrative produced by this same run. */
  narrative?: string;
};

export function writeEvidenceBundle(
  report: AssessmentReport,
  dir: string,
  opts: WriteBundleOptions = {}
): BundleManifest {
  if (existsSync(dir) && readdirSync(dir).length > 0) {
    throw new Error(
      `writeEvidenceBundle: "${dir}" exists and is not empty — a custody bundle never mixes runs. Use a fresh directory (a crashed prior write leaves a manifest-less directory; delete it manually).`
    );
  }
  mkdirSync(join(dir, "evidence"), { recursive: true });

  const written: string[] = [];
  const writeInto = (relPath: string, content: string): void => {
    writeFileSync(join(dir, relPath), content, "utf-8");
    written.push(relPath);
  };

  writeInto("report.json", JSON.stringify(report, null, 2));

  const seenIds = new Set<string>();
  for (const result of report.results) {
    if (result.retrievedEvidence === undefined) {
      throw new Error(
        `writeEvidenceBundle: control "${result.controlId}" has no retrievedEvidence — custody cannot bundle what was not retained. Bundles require reports produced by runAssessment (M3g+).`
      );
    }
    const cited = new Set(result.judgment.evidenceCited);
    for (const ev of result.retrievedEvidence) {
      if (!UUID_RE.test(ev.id)) {
        throw new Error(
          `writeEvidenceBundle: evidence id "${ev.id}" (control "${result.controlId}") is not a UUID — refusing to use it as a filename.`
        );
      }
      if (seenIds.has(ev.id)) {
        throw new Error(
          `writeEvidenceBundle: duplicate evidence id "${ev.id}" across controls — refusing to overwrite an already-bundled evidence file.`
        );
      }
      seenIds.add(ev.id);
      writeInto(
        `evidence/${ev.id.toLowerCase()}.json`,
        JSON.stringify(
          { controlId: result.controlId, cited: cited.has(ev.id), evidence: ev },
          null,
          2
        )
      );
    }
  }

  if (opts.oscal !== undefined) {
    writeInto("oscal.json", JSON.stringify(opts.oscal, null, 2));
  }
  if (opts.narrative !== undefined) {
    writeInto("narrative.md", opts.narrative);
  }

  // Hash the bytes actually on disk — not the strings we intended to write.
  const files: BundleFileEntry[] = written.map((relPath) => {
    const buf = readFileSync(join(dir, relPath));
    return {
      path: relPath.normalize("NFC"),
      sha256: sha256Hex(buf),
      bytes: buf.byteLength,
    };
  });

  const meta: ManifestMeta = {
    bundleFormatVersion: BUNDLE_FORMAT_VERSION,
    algorithm: "sha256",
    createdAt: new Date().toISOString(),
    targetName: report.targetName,
    controlSetVersion: report.controlSetVersion,
  };
  const manifest: BundleManifest = {
    ...meta,
    files,
    rootHash: computeRootHash(meta, files),
  };

  // LAST write — see module doc.
  writeFileSync(join(dir, MANIFEST_FILENAME), JSON.stringify(manifest, null, 2), "utf-8");
  return manifest;
}

export type VerifyResult = {
  ok: boolean;
  checkedFiles: number;
  rootHash: string | null;
  errors: string[];
};

/**
 * Walk the bundle collecting every regular file's relative path. Symlinks
 * are custody violations (never traversed, never counted); anything that
 * is neither file, directory, nor symlink is likewise a violation, as is
 * an EMPTY directory (foreign structure is unaccounted state — the writer
 * never creates one) and any I/O error (an unreadable entry is a custody
 * verdict — "unverifiable" — not a tool crash).
 */
function walkFiles(root: string, rel: string, out: string[], errors: string[]): void {
  const abs = rel === "" ? root : join(root, rel);
  let names: string[];
  try {
    names = readdirSync(abs);
  } catch (err) {
    errors.push(
      `unreadable directory inside bundle: ${rel === "" ? "." : rel.normalize("NFC")} — ${err instanceof Error ? err.message : String(err)}`
    );
    return;
  }
  if (rel !== "" && names.length === 0) {
    errors.push(`empty directory inside bundle: ${rel.normalize("NFC")} — the writer never creates one; unaccounted structure`);
    return;
  }
  for (const name of names) {
    const childRel = (rel === "" ? name : `${rel}/${name}`).normalize("NFC");
    let st;
    try {
      st = lstatSync(join(root, childRel));
    } catch (err) {
      errors.push(`unreadable entry inside bundle: ${childRel} — ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    if (st.isSymbolicLink()) {
      errors.push(`symlink inside bundle: ${childRel} — custody bundles contain only regular files`);
    } else if (st.isDirectory()) {
      walkFiles(root, childRel, out, errors);
    } else if (st.isFile()) {
      out.push(childRel);
    } else {
      errors.push(`unsupported filesystem entry inside bundle: ${childRel}`);
    }
  }
}

/**
 * Manifest entries are UNTRUSTED input (silent-failure-hunter, M3g): the
 * writer only ever emits clean relative paths, so any other shape is proof
 * of tampering — absolute paths or ".." would point verification at files
 * OUTSIDE the bundle; duplicates inflate the verified count. Returns a
 * violation string, or null when the entry is well-formed.
 */
function entryViolation(entry: unknown, index: number, seen: Set<string>): string | null {
  if (typeof entry !== "object" || entry === null) {
    return `manifest files[${index}] is not an object`;
  }
  const e = entry as Record<string, unknown>;
  if (typeof e["path"] !== "string" || e["path"] === "") {
    return `manifest files[${index}] has no path string`;
  }
  const p = e["path"];
  if (p.startsWith("/") || p.includes("..") || p.includes("\\") || p.startsWith("~")) {
    return `manifest files[${index}] path "${p}" escapes the bundle (absolute, .., \\, or ~) — the writer never produces this; proof of tampering`;
  }
  if (ALLOWED_UNMANIFESTED.includes(p.normalize("NFC"))) {
    return `manifest files[${index}] path "${p}" names the manifest or a signature artifact — these are never manifested`;
  }
  if (typeof e["sha256"] !== "string" || !/^[0-9a-f]{64}$/i.test(e["sha256"])) {
    return `manifest files[${index}] ("${p}") has no valid sha256`;
  }
  if (typeof e["bytes"] !== "number") {
    return `manifest files[${index}] ("${p}") has no numeric byte size`;
  }
  const norm = p.normalize("NFC");
  if (seen.has(norm)) {
    return `manifest files[${index}] duplicates path "${p}" — duplicate entries inflate the verified count`;
  }
  seen.add(norm);
  return null;
}

export function verifyEvidenceBundle(dir: string): VerifyResult {
  const errors: string[] = [];

  const manifestPath = join(dir, MANIFEST_FILENAME);
  if (!existsSync(dir)) {
    return { ok: false, checkedFiles: 0, rootHash: null, errors: [`bundle directory does not exist: ${dir}`] };
  }
  if (!existsSync(manifestPath)) {
    return {
      ok: false,
      checkedFiles: 0,
      rootHash: null,
      errors: [
        `no ${MANIFEST_FILENAME} in ${dir} — this bundle is unverifiable (a crash before the manifest write, or not a bundle at all)`,
      ],
    };
  }

  let manifest: BundleManifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as BundleManifest;
  } catch (err) {
    return {
      ok: false,
      checkedFiles: 0,
      rootHash: null,
      errors: [`${MANIFEST_FILENAME} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`],
    };
  }
  if (!Array.isArray(manifest.files) || typeof manifest.rootHash !== "string") {
    return {
      ok: false,
      checkedFiles: 0,
      rootHash: null,
      errors: [`${MANIFEST_FILENAME} is missing "files" or "rootHash" — not a custody manifest`],
    };
  }

  // The writer always bundles report.json, so an empty-files manifest is
  // proof of tampering — without this check, gutting a bundle and dropping
  // in a trivial manifest verifies "OK — 0 files" (hunter finding, M3g).
  if (manifest.files.length === 0) {
    return {
      ok: false,
      checkedFiles: 0,
      rootHash: null,
      errors: [`manifest lists zero files — the writer always bundles report.json; this manifest was not produced by mlassure`],
    };
  }

  // (a0) manifest entries are untrusted — validate shape before touching disk
  const seenPaths = new Set<string>();
  const validEntries: BundleFileEntry[] = [];
  manifest.files.forEach((entry, i) => {
    const violation = entryViolation(entry, i, seenPaths);
    if (violation !== null) {
      errors.push(violation);
    } else {
      validEntries.push(entry as BundleFileEntry);
    }
  });
  if (!seenPaths.has("report.json")) {
    errors.push(`manifest does not list report.json — every mlassure bundle contains one`);
  }

  // (a) every manifested file exists with matching bytes-on-disk hash
  let checked = 0;
  for (const entry of validEntries) {
    const entryPath = entry.path.normalize("NFC");
    const abs = join(dir, entryPath);
    if (!existsSync(abs)) {
      errors.push(`missing file listed in manifest: ${entryPath}`);
      continue;
    }
    let buf: Buffer;
    try {
      buf = readFileSync(abs);
    } catch (err) {
      // EISDIR, EACCES, etc. — a custody verdict ("unverifiable file"), not a crash.
      errors.push(
        `unreadable file listed in manifest: ${entryPath} — ${err instanceof Error ? err.message : String(err)}`
      );
      continue;
    }
    const actual = sha256Hex(buf);
    if (actual !== entry.sha256) {
      errors.push(
        `hash mismatch: ${entryPath} — manifest ${entry.sha256}, on disk ${actual}`
      );
    } else if (buf.byteLength !== entry.bytes) {
      errors.push(
        `size mismatch: ${entryPath} — manifest ${entry.bytes} bytes, on disk ${buf.byteLength}`
      );
    } else {
      checked++;
    }
  }

  // (b) manifest-internal consistency: stored rootHash matches its own
  // metadata + entries. Metadata is INSIDE the hash — see computeRootHash.
  // Skipped when any entry failed shape validation: those violations already
  // force a FAILED verdict, and recomputing over malformed entries would
  // crash instead of reporting.
  if (validEntries.length === manifest.files.length) {
    const recomputedRoot = computeRootHash(
      {
        bundleFormatVersion: manifest.bundleFormatVersion,
        algorithm: manifest.algorithm,
        createdAt: manifest.createdAt,
        targetName: manifest.targetName,
        controlSetVersion: manifest.controlSetVersion,
      },
      manifest.files
    );
    if (recomputedRoot !== manifest.rootHash) {
      errors.push(
        `rootHash mismatch: manifest stores ${manifest.rootHash}, metadata+entries compute ${recomputedRoot}`
      );
    }
  }

  // (b2) manifest metadata must agree with the hash-covered report.json —
  // anchors targetName/controlSetVersion to covered CONTENT, so even a
  // manifest whose rootHash was maliciously recomputed must also alter
  // report.json (which check (a) then catches as a hash mismatch).
  try {
    const reportRaw = readFileSync(join(dir, "report.json"), "utf-8");
    const report = JSON.parse(reportRaw) as { targetName?: unknown; controlSetVersion?: unknown };
    if (report.targetName !== manifest.targetName) {
      errors.push(
        `manifest targetName "${manifest.targetName}" disagrees with report.json "${String(report.targetName)}"`
      );
    }
    if (report.controlSetVersion !== manifest.controlSetVersion) {
      errors.push(
        `manifest controlSetVersion "${manifest.controlSetVersion}" disagrees with report.json "${String(report.controlSetVersion)}"`
      );
    }
  } catch {
    // report.json missing/unreadable/unparseable is already reported by (a)
    // or the report.json-presence check — don't double-report here.
  }

  // (c) completeness: every file on disk is accounted for
  const onDisk: string[] = [];
  walkFiles(dir, "", onDisk, errors);
  for (const p of onDisk) {
    if (!seenPaths.has(p) && !ALLOWED_UNMANIFESTED.includes(p)) {
      errors.push(`unaccounted file in bundle: ${p} — not in manifest, not a signature artifact`);
    }
  }

  return {
    ok: errors.length === 0,
    checkedFiles: checked,
    rootHash: manifest.rootHash,
    errors,
  };
}
