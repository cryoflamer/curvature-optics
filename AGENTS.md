# Curvature Optics — agent operating rules

This file is the **single authoritative operating policy** for coding agents
working on this repository. It applies to ChatGPT, Codex, and other agents.
Live project state comes from GitHub Issues, Project #1, commits, Actions and
scientific documentation (`docs/`).

## First read and sources of truth

1. Read this file from the current `main` branch.
2. Reconstruct live state from actual Git branch/HEAD, `git status`, recent
   relevant commits, GitHub Issues, Project #1 (`Status`, `Execution Order`),
   current source/tests, and GitHub Actions. Never infer current progress,
   next tasks or CI health from memory or an old snapshot.
3. GitHub **Issues** are the authoritative backlog; **Milestones** group work.
   Keep task requirements, acceptance gates and dependencies in Issues.
   Do not create parallel TODO roadmaps, issue-numbered files or patch diaries.
4. Durable architecture, numerical/physical assumptions, data formats,
   browser/Legacy boundaries and research results belong in `docs/`.
   Implementation history belongs in Git, not a status snapshot.

## Reasoning level before implementation

Before starting **any implementation that changes code or repository files**,
briefly recommend the ChatGPT reasoning level in the user's language:

- **Миттєве (Instant):** straightforward localized edits, small documentation
  changes, obvious corrections with well-understood scope.
- **Середній (Medium):** ordinary feature work, focused refactoring, UI and
  tests, GitHub Issue implementation with moderate dependencies.
- **Високий (High):** architecture decisions, numerical/physical algorithms,
  optics rendering, difficult debugging, broad cross-component changes.

Use this format before implementing:

**Рекомендований рівень: Миттєве / Середній / Високий.**
**Причина:** one or two sentences explaining the complexity and risk.

The recommendation is advisory: the user controls the model/effort setting.
Do not claim to have switched it yourself. If the task needs a higher level
than the currently selected one, when that setting is known, recommend
switching and **wait for the user's confirmation before implementation**.
If the current setting is not visible, do not pretend to know it; provide
the recommendation and proceed unless the user asks to pause.

Routine discussion, exploratory analysis and simple answers do not require
a pre-implementation recommendation. The level should reflect task risk,
not merely its size or the presence of an Issue number.

## GitHub planning — single Project and execution queue

- **GitHub Issues remain the only authoritative task backlog.** Use
  [Curvature Optics — Development Roadmap](https://github.com/users/cryoflamer/projects/1)
  (user Project **#1**) as the **single planning view** of those same Issues,
  not as a separate list of tasks. The Project is linked to this repository.
- **Milestones** group workstreams/stages; they do not establish execution
  priority. Some intentionally deferred Issues may have no milestone.
- **Labels** describe independent dimensions: each open Issue should have
  exactly one `priority:P0`–`priority:P3` and one primary `type:*` label.
  Add `workflow:blocked`, `workflow:deferred`, and/or
  `workflow:needs-decision` only when applicable, and revisit those labels
  as dependencies or decisions change. The Project's native `Status` field
  tracks execution state (Todo / In Progress / Done); do not duplicate it
  with `status:*` labels or treat an unset workflow label as acceptance.
- Use native Issue `blocked by` / `blocking` dependencies where supported;
  otherwise document explicit Issue links. Dependencies and acceptance gates
  take precedence over a simple numeric ranking.
- Project #1 has a numeric **`Execution Order`** field. Lower values mean
  earlier recommended execution; prefer sparse ranks such as 10, 20, 30
  so tasks can be inserted. Order is advisory and must account for priority,
  dependencies, readiness, risk, and current project goals. Never infer it
  from Issue number or milestone number alone.
- Agree on initial labels, priorities, and execution ordering with the user
  before bulk assignment. Maintain a practical near-term queue rather than
  continually renumbering the entire backlog. Revisit the queue after
  completed tasks or changed dependencies; explain material reordering.
- Update the existing Project/Issues directly when connected tools permit.
  If GitHub Projects fields or label definitions cannot be modified through
  available tools, provide reproducible `gh` CLI/API commands for the user;
  do not claim those changes were applied. Do not create another Project.
- Project field setup, issue import, label taxonomy, and populated execution
  ranks are distinct steps: verify each before reporting it complete.

## GitHub synchronization after work

After **each implementation stage or planning change**, check whether the
corresponding GitHub Issues and Project #1 need synchronization. Do not wait
until the entire multi-stage Issue is complete.

**Before implementation:**
- Read current rules and inspect actual branch/HEAD, relevant commits, Issue
  acceptance criteria, dependencies, labels, Project fields, CI and source.
- Check the Issue's single `priority:*` and `type:*` labels, applicable
  `workflow:*` labels, Project `Status`, and `Execution Order`.
- Once implementation actually starts, set Project `Status = In Progress`.
  Do not mark planning/discussion alone as implementation.

**After each stage:**
- Verify the actual commit on `main`, targeted test results, relevant GitHub
  Actions runs and all applicable acceptance gates. Record what remains
  unverified, especially manual browser and scientific/physical checks.
- Update the Issue with completed steps, exact commit and test/CI evidence,
  limitations, remaining acceptance work and the next action. Keep it open if
  implementation or acceptance is incomplete.
- Set `Status = Done` and close the Issue **only after all acceptance criteria
  are confirmed**. A commit or green automated tests alone are insufficient.
- Reassess dependent Issues, `workflow:blocked`, `workflow:deferred`,
  `workflow:needs-decision`, and the agreed execution queue. Remove stale
  blockers when evidence supports it; never mechanically renumber the queue.
- Record completed stages, acceptance evidence and remaining work in the
  relevant Issue/Project; update `docs/` only for durable technical knowledge.
  Do not maintain a parallel status handoff or commit diary.

**When direct GitHub/Project updates are unavailable:**
- **Use connected tools first.** Before offering a script, check the tools
  currently available and attempt all authorized GitHub/Project/Actions
  operations that they support. Do not assume a limitation observed in an
  earlier chat still applies. Never delegate an operation merely for
  convenience when it can be completed directly.
- **Provide a script only for operations that cannot be performed directly**
  because the required capability or permission is unavailable. Explain the
  specific limitation. Do not generate a script when all necessary operations
  were completed with connected tools.
- For unavailable operations, provide a ready-to-run, task-specific `gh` Bash
  code block **directly in the chat** for copy-paste into the user's WSL terminal.
  Do not create or attach a `.sh` file unless the user explicitly requests one.
  Include **only outstanding operations**; never repeat mutations already
  confirmed through connected tools.
- Discover live Project, field, and item IDs using `gh project view`,
  `gh project field-list`, and `gh project item-list`. Never invent IDs,
  assume cached IDs remain valid, or use unsupported `gh project item-edit`
  flags. Resolve Issue-to-item identity before modifying Project fields.
- Preserve unrelated fields and labels. Fail clearly on missing IDs,
  ambiguous matches, permission errors, or command failures; avoid partial
  silent success. Print intended changes and reread affected values afterward.
- Do not automatically close Issues without confirmed acceptance; do not
  reorder `Execution Order` without accounting for dependencies and user
  agreement. Ask for the user's actual `gh` output to confirm changes.

**Final report after each stage:**
1. State exactly what changed and identify the verified commit.
2. List tests/CI/acceptance checks performed, failed, skipped or outstanding.
3. Identify GitHub Issue and Project changes confirmed by API or `gh` output.
4. State remaining synchronization work and provide the `gh` script when
   direct updates could not be completed.

Never report GitHub synchronization as complete without confirmation from
the API or the user's actual command output.

## Git policy — one permanent branch, no PRs

- **`main` is the only permanent development branch.** Normal authorized
  changes are committed directly to `main`; push to `origin/main` after
  the relevant targeted verification. Respect the user's explicit scope.
- **Never create a Pull Request** or use a PR as an alternative delivery
  workflow. Do not create a temporary branch unless explicitly approved.
- Before a commit/push verify the remote, branch, clean intended diff, current
  head and absence of unrelated local edits. Never discard someone's changes.
- One logically bounded change per commit. Write English **passive-voice**
  commit subjects. Use a relevant Issue reference where useful.
- Never force-push, reset/discard work, rewrite published history, delete
  branches/tags, or change the repository's default branch without explicit
  authorization. No unrequested merges or repo administration.
- Annotated tags mark deliberately reviewed baselines, **not** untested
  snapshots. Do not claim release status from the presence of a tag.
- The historical `built-in-demo`, `dev`, `refactor` and other branches
  are not active development targets. Do not delete them automatically.

## Testing — targeted by default

**Do not run the entire test suite by default.** Full Node regressions and
all-browser smoke suites can be slow. Choose the smallest meaningful set
that exercises the changed behavior and its affected contracts.

- Documentation only: validate relative links, documentation regression
  tests and referenced files. No physics/browser suite by default.
- Optics, geometry or atmosphere: run *targeted* numerical/visibility/horizon,
  parity, precision and regression tests for the modified model.
- Data models, History, calibration or persistence: targeted schema,
  migration, recovery, collision and failure-path tests.
- UI/interaction: focused DOM/Node tests, with affected browser smoke when
  a browser-dependent behavior actually changes or acceptance requires it.
- Legacy transport/reference or architecture changes: affected preservation,
  isolation and static-boundary checks; never weaken their assertions.
- Source-format/syntax checks should run where appropriate; `git diff --check`
  should pass before reporting a clean commit.

Run a **full** local suite or manual GitHub full workflow only if the user
explicitly requests it, or after separately agreeing a release/acceptance
validation plan. Do **not** invoke `scope=full` as an unasked-for next step.
The automatic push CI on `main` is a curated *fast* gate, not full verification.

### Agent-owned targeted Chromium verification

- The agent owns authoring, triggering (when supported), monitoring and diagnosing
  automated browser tests; do not routinely delegate test commands to the user.
- Added **or modified** `test_...` methods in `tests/browser/test_modern_smoke.py`
  on `main` trigger the separate `targeted-browser.yml` push job, which
  selects only methods touched by that commit's diff and runs **those tests**.
  The agent must inspect the actual Actions run and logs before claiming PASS.
- The same workflow retains manual `workflow_dispatch` with exact `test_name`
  for an unchanged existing test. If connected GitHub tools lack dispatch
  permission, explicitly disclose that limitation; never claim a manual
  dispatch was initiated. Prefer the automatic push path for new **and revised**
  tests; ask the user for a manual dispatch only when no automated route exists.
- A green fast Node workflow is not Chromium evidence. A workflow skipped
  because no new test method was added is not a browser PASS. The automatic
  targeted job is **not** permission to run the full browser or full CI suites.


If a needed check is unusually expensive, explain the reason and proposed
scope before running it. Do not skip a physics-critical test and then claim
the result validated. Report precisely which tests were executed, passed,
failed or skipped; distinguish known baseline CI failures from introduced
regressions. Manual Opera/Chromium testing, scientific image acceptance and
WGSL compilation **must not be claimed without actually performing them**.

Never modify numerical tolerances, optical data, protected reference images,
expected test fixtures or regression coverage merely to make CI green.
Scientific correctness and fast UI approximation have distinct acceptance
criteria. Canvas Direct/Fast are not the authoritative RK4 reference.

## Work boundaries and delivery

- Implement only what was requested or agreed; surface any scope expansion.
  Avoid opportunistic refactors, new HTML entry points or duplicate stores.
- Keep stable semantic filenames; never embed compatpatch/version/Issue
  numbers in source, documentation or test filenames.
- Preserve original photographs and provenance, physical scene/optics
  invariants, existing portable schemas, Legacy URL/storyboard functionality,
  and independent Compare A/B atmosphere settings.
- Verify the actual resulting Git tree/commit before claiming changes exist.
  When a task includes GitHub updates, report the exact Issue/commit status.
- Do not close an Issue merely because implementation exists; check its
  acceptance tests, CI status, browser/scientific evidence and any explicit
  user-acceptance requirement.
- This repository currently works **without a Compatсh workflow**. Do not
  introduce format-patch ZIPs or an alternative Git delivery unless requested.
- Do not recreate `PROJECT_STATE.md` or a replacement status snapshot.
  Recover current progress from live GitHub and Git sources instead.

## Main entry points

- `README.md` — usage and source map
- `docs/architecture.md` — runtime boundaries
- `docs/physics.md` — numerical and physical model
- `docs/development.md` — targeted commands and CI workflow
- `docs/modern-animation-contract.md` — project/keyframe invariants
- `docs/reference-images.md` — original image and source semantics
- GitHub Issues, Milestones and Project #1 — priorities and pending acceptance
- Git history and GitHub Actions — implementation and CI evidence
