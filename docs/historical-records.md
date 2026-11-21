# Historical documentation and recovery

**Status:** reference index for documentation retired from the active tree in
#140.12.76. Use the current [README](../README.md),
[architecture](architecture.md), [physics](physics.md), [user guide](user-guide.md),
and [development](development.md) for implemented behavior. Removed documentation
was not necessarily wrong when written; many notes describe intermediate designs,
benchmarks or features later archived. It is not a source of current API or runtime
contracts.

## What was retired

The cleanup removed **71 Markdown files** without removing tests, source code,
recorded numerical baselines or the original six Opera reference images.

| Retired group | Files | Why it was retired |
| --- | ---: | --- |
| `docs/migration-*.md` | 48 | Chronological steps of the earlier migration, not current operating instructions |
| `docs/cpu-*.md` | 4 | Research-only numerical experiments already archived with their code |
| `docs/controlled-cleanup-*.md` | 3 | Completed patch-specific cleanup reports |
| `docs/regression-test-repairs-*.md` | 2 | Completed patch-specific test repair reports |
| `docs/modern-*.md` (selected camera/atmosphere notes) | 8 | Superseded incremental UI descriptions; active design evidence is retained |
| Other old plans/reports | 6 | `SCENE_SEPARATION_PLAN.md`, `baseline-inventory.md`, `html-script-extraction.md`, `legacy-ui-assessment.md`, `project-layout.md`, `refactor-closure-140.12.73.md` |

Some historical documents are intentionally **still tracked** because they
encode technical evidence or have regression-test readers. In particular,
`legacy-migration-plan.md` and `modern-ui-plan.md` are retained **as historical
test fixtures, not active implementation roadmaps**. The physical verification,
engineered-ray, fused-gradient qualification, Legacy reference/animation,
WebGL2 renderer and camera-interaction documents are likewise retained where
there is a specific technical or testing reason.

`PROJECT_STATE.md` was reduced for #28 to a **short live handoff**, not an alternative roadmap. Its pre-migration 6,965-line journal remains accessible at [the previous revision](https://github.com/cryoflamer/curvature-optics/blob/aa8b2b1a94fa72432648f2ffcec8929a90601b04/PROJECT_STATE.md). Old instructions do not authorize reviving CPU/WebGPU research.

## Recover a retired document from Git

A compatpatch records file deletion, so the previous content remains in Git
history. Immediately after applying #140.12.76, for example:

```sh
git show HEAD^:docs/migration-flat-surface.md
```

After further commits, locate the deletion commit and inspect its parent:

```sh
git log --diff-filter=D --format='%h %s' -- docs/migration-flat-surface.md
git show <deletion-commit>^:docs/migration-flat-surface.md
```

Replace `<deletion-commit>` with the SHA printed by the first command.
Alternatively, inspect the pre-cleanup commit in your clone with
`git log --all -- docs/migration-flat-surface.md`; Git history (and any
backed-up remote) must be available. **The CPU/WebGPU research archive is
separate**: see [research-archive.md](research-archive.md) and verify
`optics-research-archive-2026-11` before trying to restore the archived
experiments. A Git format-patch does not create tags.

## Documentation policy going forward

**Issue #28 update:** The remaining living TODO inventories were migrated to GitHub Issues. The following source documents were removed after preserving stable technical summaries and mapping tasks to Issues:

| Former backlog / roadmap file | Current destination |
| --- | --- |
| `docs/technical-debt.md` | #29 HUD, #30 vertical guides, #31 persistence |
| `docs/interactive-rendering-migration.md` | [interactive rendering](interactive-rendering.md) and #32 acceptance |
| `docs/modern-demo-catalog.md` | [demo catalog](demo-catalog.md), #33 browser acceptance, #37 Soundly |
| `docs/modern-location-migration.md` | [native-scenario compatibility](native-scenario-compatibility.md), #38 deliberate deferred decision |

These originals remain available at [the pre-consolidation revision](https://github.com/cryoflamer/curvature-optics/tree/aa8b2b1a94fa72432648f2ffcec8929a90601b04). Scientific methods, verified observations and current data/renderer contracts must remain in durable topical docs, not be discarded because an earlier file was titled a plan.

New implementation tasks, deferred research and pending acceptance belong in [GitHub Issues](https://github.com/cryoflamer/curvature-optics/issues). Keep regression-backed technical documents. A future documentation cleanup must first trace source links, migrate valuable content, and review test/fixture readers; no new parallel TODO trackers.
