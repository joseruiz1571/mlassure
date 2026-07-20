# syntax=docker/dockerfile:1
#
# Multi-stage build for the mlassure CLI. NOT claimed to be a minimal
# single-binary image — it copies production node_modules + source +
# fixtures into the runtime stage. A genuinely dependency-free runtime
# (via `bun build --compile`) was considered and deliberately deferred —
# see ISA.md M3e Decisions — until this Dockerfile has actually been built
# and run at least once (Docker was not installed on the machine that
# authored this file; build/run verification is DEFERRED-VERIFY, see
# ISA.md ## Verification for the exact commands to run).
#
# Both stages MUST use the same base image variant (both slim here) —
# mixing slim/alpine across stages risks a libc mismatch that fails at
# `docker run`, not `docker build`, so it would not surface until someone
# actually runs the image.

FROM oven/bun:1.2-slim AS deps
WORKDIR /app

# Tolerant of either bun.lock (text, Bun >=1.2 — confirmed present in this
# repo) or bun.lockb (binary, older Bun) — a literal `COPY bun.lockb ./`
# would hard-fail against this repo's actual bun.lock. package.json alone
# guarantees at least one glob match, so this COPY can't match nothing.
COPY package.json bun.lock* bun.lockb* ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.2-slim AS runtime
WORKDIR /app

# Output mount point, owned by the image's existing `bun` user (uid 1000,
# shipped by the oven/bun base image — do NOT create a second user here,
# it would collide) BEFORE the USER switch below. A host bind-mount at
# `docker run` time arrives owned by the host UID, not this container's
# `bun` user — if this chown is skipped or ordered after USER, writes to
# a mounted /out silently fail with a permissions error that looks like
# an application bug, not a container config issue.
RUN mkdir -p /out && chown -R bun:bun /out
# Bun writes to $HOME/.bun at runtime; confirm this matches the oven/bun
# image's actual bun-user home at first build — noted here because it
# could not be verified without Docker installed.
ENV HOME=/home/bun

COPY --from=deps --chown=bun:bun /app/node_modules ./node_modules
COPY --chown=bun:bun package.json ./
COPY --chown=bun:bun src ./src
# Fixtures are baked in deliberately, so the demo path works with zero
# setup: `docker run <image> assess --controls fixtures/... --target
# fixtures/... --live` needs nothing mounted. Confirmed via grep before
# this line was written that no fixture file contains a real API key
# (see ISA.md ISC-315) — the one place a real secret could plausibly hide
# in a "zero-setup demo" image.
COPY --chown=bun:bun fixtures ./fixtures

USER bun

# ANTHROPIC_API_KEY is intentionally absent from this file — no ARG, no
# ENV with a value. It is injected only at `docker run -e ANTHROPIC_API_KEY`
# (bare form, inheriting from the host shell's env — see README), never
# baked into a layer. A build-time ARG would persist in the image history
# permanently, retrievable by anyone with the image, even if a later step
# appeared to remove it.

# Exec form (not shell form) so exit codes and signals propagate correctly.
# Mirrors package.json's actual "dev" script (`bun run src/cli/index.ts`,
# confirmed to contain no --watch/--hot — verified before writing this,
# not assumed, since a --watch script here would hang the container
# forever with no visible error).
ENTRYPOINT ["bun", "run", "src/cli/index.ts"]
CMD ["--help"]
