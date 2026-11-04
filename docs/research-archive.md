# #140.12.74 — CPU and WebGPU research archival

## Decision and scope

The standalone WebGPU optical experiment page and the optional CPU optics research
panel in Modern are no longer maintained in the active branch. **Their complete
pre-removal implementation, tests, sample inputs, experiment notes, and historical
exports are retained by Git at the pre-removal commit**. This is a research
archival decision, **not** a claim that the algorithms were equivalent or fast.

**Create the annotated tag *before* applying this patch**, with #140.12.73
(`536b216`, "Refactor cleanup acceptance gate was established") checked out:

```bash
git status --short
git log -1 --oneline  # should be 536b216 or its equivalent pre-archive commit
git tag -a optics-research-archive-2026-11 HEAD \
  -m "Archived CPU and WebGPU optics research before removal"
git show --stat --oneline optics-research-archive-2026-11 | head
# Recommended if the repository has a remote:
git push origin optics-research-archive-2026-11
```

Do not recreate an existing tag without explicitly reviewing what it references.
Git format-patch **cannot include this tag**. A tag made after applying #140.12.74
would **not** preserve the deleted working tree.

## Preserved in active branch

- CPU RK4 / `fused-gradient` production implementation in `src/optics/`, with
  numerical qualification and explicit legacy-mode regression tests.
- Physical Scene and independently rendered Compare A/B, their model/scene state,
  URLs, saved Experiment Library, display choices, and Canvas/WebGL2 rendering.
- GPU *capability* inspection (WebGL/WebGL2/WebGPU device reporting), not WebGPU
  optical shooting.
- Legacy animation and diagnostics, including `GeometryDiagnosticsZip.js`,
  nine demos / 80 states / 71 transitions and the six Opera PNG references.
- `OpticalConformalPredictor.js` as an internal dependency of
  `OpticalSharedRayField.js`; it is not an active Modern experiment toggle.

## Removed from active branch

- `tools/webgpu-optics.html` and WebGPU-only fixture generation/target data.
- The ten-action Modern CPU research panel and experimental conformal Compare B
  switch, including their exclusively research-only browser handlers/styles.
- Thirty-six dedicated CPU/WebGPU experiment diagnostics modules under
  `src/diagnostics/`; **not** Legacy's diagnostics and ZIP export.
- GPU optical field/probe research helpers from `ModernCompareModel.js`;
  `clone`, `pair`, and the shared camera/object invariant remain.
- Research-only tests and numerical/wiring fixtures that require deleted
  modules, together with superseded research documentation. Production
  physics/renderer, Legacy, routing and migration tests are retained.

## Recovering research later

```bash
# Inspect, without changing the working tree:
git ls-tree -r --name-only optics-research-archive-2026-11 | grep -E 'webgpu-optics|CurvatureCpuConformal|CurvatureGpuDs'
# Work independently, leaving the current branch untouched:
git worktree add ../curvature-optics-research optics-research-archive-2026-11
# To remove the read-only worktree when finished:
git worktree remove ../curvature-optics-research
```

The research results are historical. Running actual WGSL requires suitable
hardware/browser and was **not** repeated during archival. The static/Node tests
for #140.12.74 do **not** prove browser fidelity, GPU performance, or numerical
parity beyond their asserted invariants. The user should smoke-test Legacy
animation, Modern Scene/Compare, WebGL2 fallback and the Experiment Library.

## Regressions and checkpoints

`node tools/check-refactor-closure.js` checks the retained application boundary,
Legacy references, independent modern modules, selected CPU physics equivalence
and browser asset integrity. `node --test tests/ResearchArchive141274.test.js`
checks that no archived research runtime is silently reintroduced. These checks
run offline and do not mutate Git tags or user data.
