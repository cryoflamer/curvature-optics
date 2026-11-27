# Native Local MCP integration

This declarative request grants no permissions. Local operator approval binds
the exact Git revision, manifest, profiles and verified local image outside
this repository. No credentials, local paths or Docker daemon access are
requested. The independent GitHub Actions workflows and application tests are
unchanged.

The first three profiles exercise one existing case,
`test_navigation_and_studio_bootstrap`. Smoke runs the original case with a
screenshot; failure injects one explicit assertion only after successful UI
verification; cancel holds the real browser open after the case reaches that
point. A cancelled run need not publish artifacts. The wrapper emits only
approved bounded report and PNG records. Existing diagnostic file output is
redirected to disposable tmpfs, never a host mount.

Use a reviewed immutable official Playwright Python 1.57.0 Noble base digest,
matching the independent CI's Playwright version. The image's Python minor
version may differ from CI's 3.13; report it, do not claim identical
environments. The four Python package versions are pinned; wheel hashes and
base digest are not yet independently recorded. Verify dependency/security
and exact image provenance before enrollment. Build only from the approved
`git archive` of the exact revision, not an arbitrary checkout or uploaded
build context; never pass host credentials to the build. The application
runs only under the existing nonroot, no-network, read-only Runner boundary.
Do not weaken the boundary to make Chromium work. Verify actual compatibility
with fixed tmpfs, shm and process limits before enabling the integration.

Local success/failure/cancellation and performance comparison are tracked by
[Gateway Issue #9](https://github.com/cryoflamer/local-mcp-gateway/issues/9).
This declaration is a candidate, not an active local grant.
