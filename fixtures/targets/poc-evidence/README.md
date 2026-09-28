# Proof-of-Control evidence fixtures

Inputs for the `poc-evidence` family (M8b): evidence-token streams, one token
per line (JSONL), and a trust-assumption disclosure. The control set that reads
them is [`../../controls/poc-c7-subset.yaml`](../../controls/poc-c7-subset.yaml); the
target descriptor that points at the clean stream is
[`../poc-stream-clean.json`](../poc-stream-clean.json). This directory sits
beside that descriptor because a descriptor may only name files inside its own
directory.

**The streams are unsigned, and M8b verifies no signatures.** `signature` is
optional in the standard's schema. The standard's vectors are signed with a
published test key; every record here has had its `signature` removed, because a
signature carried over onto a changed record would be a forged one.

## Where the records come from

Every record is derived from a published test vector of the Proof-of-Control
standard, *Open Verification: the Proof-of-Control Standard for Agents*, © Advanced
AI Society and the Proof-of-Control contributors, licensed under the Apache
License, Version 2.0 (a copy is in this repository's `LICENSE`). Source:
https://github.com/LFDT-ProofOfControl/ov-poc-standard, directory
`schema/vectors/`, commit `22c7b625be459f5eee7dd8690afd080b5141b8c6`.

These files are modified from the originals. Each record is the vector's text
with the `signature` line removed and line breaks and indentation removed, so
one token is one line. [`scripts/make-poc-streams.ts`](../../../scripts/make-poc-streams.ts)
does exactly that from a checkout of the standard at that commit, checks each
source file's sha256 first, and builds records as text so the duplicate key
survives. Records marked *derived* below also have the named fields changed.

| Record in `clean.jsonl` | Source vector | Changed |
| --- | --- | --- |
| 0 — agent ref-1, step 0 | `positive/allow-read.json` | — |
| 1 — agent ref-2, step 0 | `positive/hardware-attested.json` | *derived*: `agent_id` ref-1 → ref-2, `nonce` → `n-00000011` |
| 2 — agent ref-1, step 1 | `positive/deny-path-composition.json` | — |
| 3 — agent ref-1, step 2 | `positive/modify-bound.json` | *derived*: `step_index` 0 → 2, `tree_size` 1 → 3, `nonce` → `n-00000003` |

The derived records' digests (`chain_head`, `merkle_root`, …) are the source
vectors' values and were not recomputed; mlassure does not replay the chain or the
tree in M8b.

## The streams

Each negative stream is `clean.jsonl` with exactly one fault. Where one fault is
visible to two rules (an untagged digest also fails the schema's digest
pattern), both verdicts are listed. `src/providers/poc-evidence.test.ts` asserts
this whole table.

| Stream | Fault | 7.7.1 | 7.7.3 | 7.7.5 | 7.6.2 |
| --- | --- | --- | --- | --- | --- |
| `clean.jsonl` | none | satisfied | satisfied | satisfied | satisfied |
| `empty.jsonl` | no records | insufficient | insufficient | insufficient | insufficient |
| `step-gap.jsonl` | record 2 (ref-1 step 1) deleted, as in the standard's 7.6.2 auditor test | satisfied | satisfied | satisfied | **not satisfied** |
| `step-repeat.jsonl` | record 3 appended again (ref-1 step 2 twice) | satisfied | satisfied | satisfied | **not satisfied** |
| `step-descending.jsonl` | record 2 appended again (ref-1 step 1 after step 2) | satisfied | satisfied | satisfied | **not satisfied** |
| `duplicate-key.jsonl` | record 0 is `negative/duplicate-key.json`: `verdict` twice | insufficient | insufficient | **not satisfied** | insufficient |
| `untagged-digest.jsonl` | record 0 is `negative/untagged-digest.json` | **not satisfied** | **not satisfied** | satisfied | satisfied |
| `digest-alg-width-mismatch.jsonl` | record 0 is `negative/digest-alg-width-mismatch.json` | **not satisfied** | **not satisfied** | satisfied | satisfied |
| `schema-invalid.jsonl` | record 0 is `negative/missing-policy-bundle-hash.json` | **not satisfied** | satisfied | satisfied | satisfied |
| `step-index-float.jsonl` | record 2 writes `step_index` as `1.0` | satisfied | satisfied | satisfied | insufficient |
| `lossy-number.jsonl` | record 0 writes `iat` as `1754400000.0000000001`, which a double cannot hold | insufficient | satisfied | satisfied | satisfied |
| `blank-lines.jsonl` | not a fault: the clean records with a whitespace-only line after record 1 and two extra blank lines at the end | satisfied | satisfied | satisfied | satisfied |

*Insufficient* on `duplicate-key.jsonl` is deliberate: a record with two readings
has no single value to validate, tag-check or sequence, so those three rules say
they could not evaluate it and 7.7.5 reports the fault.

*Insufficient* on the two number streams is deliberate too. Numbers are judged by
the form written in the record. `1.0` converts to the integer 1, so the schema
accepts it, but it is not written as a sequence number, so 7.6.2 cannot read the
sequence. `1754400000.0000000001` converts to `1754400000`, so the schema would be
judging a value the record does not hold, and 7.7.1 says so instead. Blank lines
are not records: record indexes count records, and each record also carries its
line number and the stream's count of skipped blank lines.

## The disclosure

[`disclosure.md`](disclosure.md) is a fictional disclosure written for these
streams, so the `PoC-10.2` synthesis control has something to read. It describes
no real system.
