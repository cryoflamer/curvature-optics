# Curvature Optics — current handoff

This is a **short resumption index**, not a change diary or task backlog.
All actionable TODOs, deferred research, verification gates, and acceptance
criteria belong to [GitHub Issues](https://github.com/cryoflamer/curvature-optics/issues);
their workstreams belong to [Milestones](https://github.com/cryoflamer/curvature-optics/milestones).
For implementation history use `git log`, closed Issues, and the pre-consolidation
revision [aa8b2b1a94fa72432648f2ffcec8929a90601b04](https://github.com/cryoflamer/curvature-optics/tree/aa8b2b1a94fa72432648f2ffcec8929a90601b04).

## Branch and baseline

- Working development branch: `built-in-demo`; this handoff was rewritten in
  the documentation-consolidation branch based on `aa8b2b1a94`.
- Last source commit reviewed for migration: `aa8b2b1a94fa72432648f2ffcec8929a90601b04` —
  “Animation candidate compatibility was limited to effective frame channels”.
- **Do not call the baseline fully green.** On that source commit Fast/Full CI
  failed the Legacy isolation boundary fixture gate; two Node failures and
  architecture audit reflected the outdated
  `tests/fixtures/legacy-isolation-boundary.json` inventory after new test
  callers. Both Chromium UI smoke shards passed. Review and regenerate the
  static evidence **only after auditing source changes**; do not bypass
  protected architecture checks or imply that scientific acceptance followed.
- These facts are a point-in-time handoff, not a live CI status. Check GitHub
  Actions and the actual branch head before starting work.

## Where to resume

- [#28 — Docs TODO / backlog consolidation](https://github.com/cryoflamer/curvature-optics/issues/28):
  consolidate historical plans and journals, preserve scientific contracts, and
  verify the branch/PR changes before closing.
- [Milestone 1 — Stabilization & Acceptance](https://github.com/cryoflamer/curvature-optics/milestone/1):
  CI; #1, #14, #23, #24 and the browser qualification gates.
- [Milestone 2 — Animation Studio UX](https://github.com/cryoflamer/curvature-optics/milestone/2):
  #27 and #25.
- [Milestone 3 — Unified Image Management](https://github.com/cryoflamer/curvature-optics/milestone/3):
  #26.
- [Milestone 4 — Calibration Research Workflow](https://github.com/cryoflamer/curvature-optics/milestone/4):
  #16, #15, #12, #13, #17 and downstream photo-backed Soundly authoring.
- [Milestone 5 — Advanced Physical Research](https://github.com/cryoflamer/curvature-optics/milestone/5):
  #6, #7, #18, #20 and open physical research.
- [Milestone 6 — Backlog & Documentation Cleanup](https://github.com/cryoflamer/curvature-optics/milestone/6):
  #28.

Some lower-priority investigations are intentionally *not* assigned milestones.
An Issue is not proof that its code is implemented or manually accepted; see
its own status, checks and evidence.

## Durable documents and contracts

- [Architecture](docs/architecture.md) — active entries, ownership, Legacy boundary.
- [Physics](docs/physics.md) — physical models, RK4, limits and verification.
- [Development](docs/development.md) — supported commands and regression gates.
- [Animation contract](docs/modern-animation-contract.md) — keyframe and schema invariants.
- [Reference images](docs/reference-images.md) — original asset, source and transport.
- [Camera calibration](docs/camera-calibration.md) and
  [Landmark editor](docs/landmark-editor.md) — physical/editor facts, not a backlog.
- [Interactive rendering](docs/interactive-rendering.md) — the approximate preview
  and authoritative paint boundary.
- [Demo catalog](docs/demo-catalog.md) — actual built-in demo behavior.
- [Native scenario compatibility](docs/native-scenario-compatibility.md) — Legacy
  versus native Modern distinction.
- [Historical documentation](docs/historical-records.md) — Git recovery.

## Continuation rules

1. Inspect `git status`, `git log -1`, GitHub Issues, the relevant source,
   and the latest relevant CI evidence; never infer a completion from an old
   implementation note, unchecked box, or this handoff.
2. Choose **one bounded Issue/stage** and preserve physical, data ownership,
   Legacy compatibility, and user-browser acceptance contracts.
3. New tasks, deferred research and unresolved acceptance gates go to GitHub
   Issues. Do not add a parallel TODO roadmap or chronological patch diary.
4. Keep descriptive stable repository filenames. Format-patch ZIPs can use
   compatpatch numbers; source and docs filenames cannot.
5. Record exact tests, CI runs, limitations and any unavailable manual browser
   qualification in the Issue and commit. Never report merely implemented code
   as accepted scientific evidence.
