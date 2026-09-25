# Security Policy

## Reporting a vulnerability

Please open a private security advisory on the repository. GitHub's private
vulnerability reporting keeps the report confidential while it is triaged, so
use it instead of a public issue for anything exploitable.

Include the version or commit you tested, what you did, and what you observed.
Proof-of-concept input is welcome. Please do not open a public issue for a
vulnerability before it has been addressed.

Single maintainer, best-effort. Reports are read, but response time is not
guaranteed.

## Supported versions

| Version | Supported |
|---------|-----------|
| Latest tagged release | Yes |
| Anything older | No |

Fixes land on `main` and ship in the next tagged release. Older tags do not
receive backported patches.

## Evidence bundles contain sensitive data

This is the single most important operational warning in the project, restated
verbatim from the README:

> **⚠️ Security note:** the bundle contains **raw retrieved evidence at rest** — IAM role documents, CloudTrail events, endpoint configuration — cited or not. Treat a bundle with the same access controls as the AWS account it describes. Bundle output paths (`out/`, `bundles/`) and key material (`*.key`) are gitignored; never commit either.

Do not attach a bundle to a vulnerability report, an issue, or a pull request.
If a reproduction needs one, say so in the advisory and redacted or synthetic
evidence can be arranged.
