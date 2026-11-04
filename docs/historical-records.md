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

`PROJECT_STATE.md` remains a **historical development journal**, not the
current architectural contract. It may mention files that now exist only in
Git history. Do not treat its old instructions as instructions to enable
archived CPU/WebGPU research.

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

Update the current guides when implementation changes. Preserve focused
numerical/physical evidence as necessary, and keep regression fixtures and
tests independent of deleted patch journals. New one-off plans should not be
added to the active documentation merely to record another commit; Git history
provides that chronology. Revisit this policy only for a specific maintenance
need or a reproducible failure.
