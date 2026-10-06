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

CI does not contact Rekor, does not perform a keyless Fulcio/OIDC signing, and does not check a consistency proof from this tree size to a later log head. A checkpoint whose tree is larger than the proof's is rejected. Synthetic tests in `src/output/rekor.test.ts` use a throwaway log key so a forked tree with the same index can be forced to fail on the root.

Re-fetch the public entry (the inclusion proof in the response grows with the log; the checkpoint captured here is the one at tree size `2984025649`):

```bash
curl -fsSL "https://rekor.sigstore.dev/api/v1/log/entries/108e9186e8c5677a664173fdafc379a9203170bea7b817cfbedf5dfde154d5342fdc93abdca5d752"
```
