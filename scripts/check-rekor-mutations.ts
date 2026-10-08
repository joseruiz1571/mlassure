/**
 * Verify that isolated negatives detect removal of each security guard.
 * Run with `bun scripts/check-rekor-mutations.ts`. Only a disposable copy
 * is mutated; the checkout and its installed dependencies are untouched.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

const repository = join(import.meta.dir, "..");
const temporary = mkdtempSync(join(tmpdir(), "mlassure-rekor-mutations-"));
const target = join(temporary, "repo");
const mutations = [
  {
    name: "checkpoint signature",
    guard: "if (!verifyCheckpointSignature(cp, pem)) {",
    test: "rejects only a bad checkpoint signature, with all roots and the SET valid",
  },
  {
    name: "signed entry timestamp",
    guard: "if (!verifySetSignature(payload, art.signedEntryTimestamp, pem)) {",
    test: "rejects only a bad SET signature, with the inclusion and checkpoint valid",
  },
  {
    name: "artifact signature",
    guard: "if (!ok) {",
    test: "rejects only a bad artifact signature, even when the log signed its body",
  },
  {
    name: "identity binding",
    guard: "if (id !== art.identity) {",
    test: "rejects only an identity mismatch, with all three signatures valid",
  },
];

try {
  cpSync(repository, target, {
    recursive: true,
    filter: (path) => ![".git", "node_modules", "dist"].includes(basename(path)),
  });
  symlinkSync(join(repository, "node_modules"), join(target, "node_modules"), "dir");
  const source = join(target, "src/output/rekor.ts");
  const pristine = readFileSync(source, "utf-8");
  const run = () => Bun.spawnSync([process.execPath, "test", "src/output/rekor.test.ts"], {
    cwd: target,
    env: { ...process.env, NO_COLOR: "1" },
  });
  const baseline = run();
  if (baseline.exitCode !== 0) {
    throw new Error(`unmodified baseline failed:\n${baseline.stdout}\n${baseline.stderr}`);
  }
  console.log("PASS: unmodified baseline");
  for (const mutation of mutations) {
    if (pristine.split(mutation.guard).length !== 2) {
      throw new Error(`expected exactly one ${mutation.name} guard; update the mutation after refactoring`);
    }
    writeFileSync(source, pristine.replace(mutation.guard, mutation.guard.replace("if (", "if (false && ")));
    const result = run();
    const output = `${result.stdout}\n${result.stderr}`;
    const namedFailure = output.split("\n").some((line) => line.includes("(fail)") && line.includes(mutation.test));
    if (result.exitCode === 0 || !namedFailure) {
      throw new Error(`${mutation.name}: mutation survived or failed for an unrelated reason:\n${output}`);
    }
    console.log(`PASS: removing ${mutation.name} is detected by its isolated negative`);
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
