# poc-evidence.schema.json — source and license

`poc-evidence.schema.json` in this directory is a byte-for-byte copy of a file
from the Proof-of-Control standard repository. It is not modified.

| | |
| --- | --- |
| Work | *Open Verification: the Proof-of-Control Standard for Agents* |
| Copyright | © Advanced AI Society and the Proof-of-Control contributors |
| Repository | https://github.com/LFDT-ProofOfControl/ov-poc-standard |
| Path | `schema/poc-evidence.schema.json` |
| Commit | `22c7b625be459f5eee7dd8690afd080b5141b8c6` (2026-09-18) |
| License | Apache License, Version 2.0 (a copy is in this repository's `LICENSE`) |
| sha256 | `92fe52b1a7f177fafc5d489aa560f50782f3fe6b45aa705e0371495062c3f32c` |

The sha256 is asserted in `src/providers/poc-evidence.test.ts`, the same
treatment the vendored NIST OSCAL schema gets: anyone who "fixes" a validation
failure by editing this file breaks the pin. To move to a newer revision of the
standard, copy the new file unchanged and update the commit and sha256 here and
in the test together.
