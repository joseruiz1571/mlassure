# Trust-assumption disclosure — reference agent gateway (fixture)

> **Fixture.** A fictional deployment written to accompany the evidence streams
> in `streams/`. No real system, vendor relationship or measurement is
> described. It exists so the `PoC-10.2` synthesis control has a disclosure to
> read; its content is illustrative, not a recommended disclosure.

Issuer: https://verifier.example/poc
Standard: Proof-of-Control, Working Draft v0.1.4
Stage: Self-Declared

## Claim register

| # | Claim | Evidence stream | Mechanisms |
| --- | --- | --- | --- |
| RC-1 | Every tool call of agents ref-1 and ref-2 passes the gateway and yields one evidence record before dispatch. | evidence tokens, `interception_point` PRE_CALL_TOOL_INVOCATION | M-1 gateway interception; M-2 per-record signature |
| RC-2 | No record is altered or removed after it is written without detection. | `chain_head`, `merkle_root`, `tree_size`, `step_index` | M-3 SHA-256 hash chain and RFC 6962 Merkle tree; M-2 per-record signature |
| RC-3 | The policy code that produced each verdict is the published build. | `submods.attestation` | M-4 software measurement (agent ref-1); M-5 Intel TDX quote with SHA-384 measurement (agent ref-2) |

## Residual trust assumptions

| Assumption | Subject | Category | Claim | Mechanism |
| --- | --- | --- | --- | --- |
| The gateway is the only network path from the agent runtime to its tools | gateway network policy, operated by the deployment | Implementation | RC-1 | M-1 |
| Ed25519 signatures (alg EdDSA) cannot be forged without the private key | Ed25519 / EdDSA | Mathematical | RC-1, RC-2 | M-2 |
| The signing key is held in the gateway's key store and no operator account can use it | gateway key-management service | Implementation | RC-1, RC-2 | M-2 |
| SHA-256 is collision- and second-preimage-resistant | SHA-256 | Mathematical | RC-2 | M-3 |
| The published log root is seen identically by every verifier | log publication by a single operator | Implementation | RC-2 | M-3 |
| The software measurement reflects the running policy build | gateway host operating system | Implementation | RC-3 | M-4 |
| The TDX module and its attestation keys are genuine and uncompromised | Intel TDX (Intel) | Hardware | RC-3 | M-5 |
| The attestation verification service reports quotes honestly | Intel Trust Authority | Vendor | RC-3 | M-5 |
| SHA-384 is collision- and second-preimage-resistant | SHA-384 | Mathematical | RC-3 | M-5 |
