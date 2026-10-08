# Recorded Rekor anchor

This directory is the M9 time-anchor fixture. It is not a custody bundle. `verify-bundle` reads `rekor.json` only when `--rekor` is passed; the file here is copied into a bundle under test.

## What was logged, live, once

On 2026-10-06 a hashedrekord entry for the manifest of `fixtures/bundles/positive/fraud-detection-v2-clean/` was accepted by the public Rekor log at `https://rekor.sigstore.dev`.

| Field | Value |
| --- | --- |
| Entry UUID | `108e9186e8c5677a664173fdafc379a9203170bea7b817cfbedf5dfde154d5342fdc93abdca5d752` |
| Entry log index | `3105929320` (inside the signed entry timestamp) |
| Proof index | `2984025058` (leaf position in the checkpoint tree) |
| Tree size | `2984025649` |
| Integrated time | `2026-10-06T08:56:29Z` (`1791276989`) |
| Manifest SHA-256 | `49e94c0ff4fd77e23350bbb6efd51017e8fc54f4cd8b7b8bfc65ebba32c993e4` |

`log-entry.json` is the API response, kept so `rekor.json` can be checked against it. The entry's log index and the proof's index differ: on this log the stable index is not the leaf's position in the tree the checkpoint signs. The verifier uses the proof index to recompute the root and the entry index only as an input to the signed entry timestamp. The verdict is the root.

The signing private key was discarded after the upload. The public key is inside the log entry. The identity `verify-bundle --rekor` reports is `spki-sha256:` of that key, not an OIDC subject.

## What CI checks, and what it does not

CI runs `verify-bundle --rekor` on a copy of the positive bundle plus `rekor.json`. That re-verifies, with no network and no maintainer credential:

- the RFC 6962 inclusion proof against the checkpoint **root**
- the checkpoint note under `rekor.sigstore.dev.pub.pem` (fetched 2026-10-06 from `https://rekor.sigstore.dev/api/v1/log/publicKey`)
- the signed entry timestamp over the canonical payload `{body, integratedTime, logID, logIndex}`
- that the hashedrekord body commits to the manifest bytes on disk and to the logged public key

CI does not contact Rekor, does not perform a keyless Fulcio/OIDC signing, and does not check a consistency proof from this tree size to a later log head. A checkpoint whose tree is larger than the proof's is rejected. Synthetic tests in `src/output/rekor.test.ts` reject a mismatched proof/checkpoint root, but also show that two coherent, signed forks each verify locally. They separately corrupt each signature while keeping all other checks valid. The timestamp is a signed assertion by the log operator; it is outside the Merkle leaf.

The default public key is embedded in `src/output/rekor-key.ts`; a test compares it byte-for-byte with the PEM here and runs the built Node CLI from outside the repository. Its SPKI SHA-256 is `c0d23d6ad406973f9559f3ba2d1ca01f84147d8ffc5b8445c224f98b9591801d`. The CLI attributes verification to that full fingerprint and to vendored/custom trust, never to the unsigned note label alone. Rotation requires a reviewed key update.

Run `bun scripts/check-rekor-mutations.ts` to verify that removing each checkpoint-signature, SET-signature, artifact-signature or identity-binding guard makes its isolated negative fail. The script changes a disposable copy only and first requires an unmodified passing baseline. Ordinary CI runs the regressions through `bun test`; the mutation experiment is a separate command.

Re-fetch the public entry (the inclusion proof in the response grows with the log; the checkpoint captured here is the one at tree size `2984025649`):

```bash
curl -fsSL "https://rekor.sigstore.dev/api/v1/log/entries/108e9186e8c5677a664173fdafc379a9203170bea7b817cfbedf5dfde154d5342fdc93abdca5d752"
```
