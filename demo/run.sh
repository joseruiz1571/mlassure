#!/usr/bin/env bash
# mlassure demo — two models, opposite verdicts
# Record with: asciinema rec demo/demo.cast --title "mlassure v0.1.0" --command "bash demo/run.sh"

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "mlassure v0.1.0 — agentic AI-control assurance"
echo "NIST SP 800-53 controls, two models, one run each"
echo ""
sleep 2

echo "── Model 1: fraud-detection-v2 (clean) ──────────────────────────────────"
echo ""
sleep 1

bun run src/cli/index.ts assess \
  --controls fixtures/controls/nist-subset.yaml \
  --target fixtures/targets/model-clean.json \
  --live

echo ""
sleep 3

echo "── Model 2: churn-predictor-v1 (stale monitoring) ───────────────────────"
echo ""
sleep 1

bun run src/cli/index.ts assess \
  --controls fixtures/controls/nist-subset.yaml \
  --target fixtures/targets/model-stale.json \
  --live
