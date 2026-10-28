# Compatpatch 122 — owned physical-scene assembly and shooting work attribution

## Evidence and scope

The user's `geometry-diagnostics (44).zip` recorded ~507.4 ms median for
`height-change-cold` (Physical / Globe / Standard). About 421.3 ms was in
optical composition; the browser's raw `opticalStages.assemblyMs` was ~97 ms
on its first cold scene. Directly timing `CurvatureSceneContract.createScene`
in the same ~82k-primitive Node scene showed that most of the assembly stage
was a defensive deep copy, not a second execution of the shooting solver.

This patch **does not change ray equations, RK4 steps, ground intersection,
visibility, interpolation or the density of the physical ground grid**. It
removes a redundant data-ownership transition at the very end of the physical
adapter. The shared painter and its screen-space guide simplification remain
unchanged.

## Ownership contract

`CurvatureSceneContract.createScene(source, primitives, metadata)` **still**
validates input and defensively deep-copies its full primitive structure,
including nested metadata and unknown extension properties. The new explicit
`adoptScene(source, ownedPrimitives, metadata)` validates **the same primitive
shapes** but assumes that its caller has just created all points, styles,
metadata and objects, and relinquishes all access/mutation thereafter.
The returned scene owns the input array and its members. Only the Physical
scene adapter calls this new ownership-transfer API.

The adapter creates all ground-guide lines, projected tower strokes and
polygon triangles as new objects with new world-direction point arrays. The
original optically neutral authored primitives are **not** adopted or mutated.
After validation the adapter assigns sequential `commandIndex` values only
to the newly owned physical primitives. Other producers retain the existing
copy-isolating API.

It would be incorrect to call `adoptScene` on authored/external or cached
mutable objects. This is documented as an exclusive-ownership operation,
not an unrestricted substitute for `createScene`.

## Per-phase shooting attribution

`stats.opticalWork` splits **incremental** shared-field counters into
`ground`, `outlines`, `fills`. Each records new exact target solves, cache
hits, interpolations, fallbacks, trial shooting evaluations, RK4 calls,
predictor/root counters, ground-event counters, and exact solve time.
Across the three phases, these deltas sum to the final shared-field
statistics; `shootEvaluations` are candidate launch-angle trials **inside**
`solves` exact target problems, not another set of independent target solves.
`exactSolveMs` is contained within the three physical build stage durations.

The existing ZIP export now carries this raw work attribution, the summary
of per-phase sample medians, `assemblyMs` and `sceneAdoptionMs`. The latter is
a **subset** of assembly, not extra elapsed time. No always-on profiling
capture or background work is introduced.

Example from the reproducible 85+2 Globe/Standard Height 15m Node workload:

| Work stage | New exact targets | Cached exact targets | Shooting trials |
| --- | ---: | ---: | ---: |
| Ground | 70 | 1 | 246 |
| Outlines | 4,033 | 1,271 | 11,279 |
| Fills | 2,155 | 1,082 | 5,254 |
| **Total** | **6,258** | **2,354** | **16,779** |

These counts do not represent an additional shooting reduction relative to
#121. They **explain** #121's counts by stage and confirm that the fill and
outline passes already share exact-target results where their coordinates
coincide. Further removal of physical target solves requires separate proof.

## Performance and regression evidence

Repeated independent Node runs of the **same** 85+2 Globe/Standard cold
height scene measured assembly roughly **107–160 ms on #121** versus
**13–19 ms on #122** after runtime warm-up; OS scheduling, JIT and GC cause
variation. Overall cold optical composition often improved from ~410–490 ms
to ~300–390 ms on this machine, but **these are Node observations, not browser
latency guarantees**. The original user browser is the required confirmation.

The #121 physical-scene hash fixtures record *every primitive, point, style,
metadata field and painter range* at four reference scenes: Globe Standard
15/15.3m, Flat vacuum 15m, Globe vacuum 15m. #122 matches their SHA-256 hashes
exactly, and does not modify the source composition. These are raster-source
identity checks, not proofs of arbitrary transparent 3D occlusion.

Validation:

```sh
node --test tests/*.test.js
node tools/benchmark-scene-assembly-122.js
```

Acceptance: Physical / Globe / Standard / 85 towers / Grid On, move Height,
then run the existing **Export Geometry Diagnostic (ZIP)**. Compare the new
`height-change-cold` `assembly` and `sceneAdoption` medians against #121's
raw `opticalStages.assemblyMs`. Do not add nested stage times together.

## Remaining limitations

- The main-thread shooting solver remains synchronous, and changes in height
  still require fresh independent rays; no cross-height approximation/cache.
- Ground guides still generate many source segments; #119 removes most before
  the camera painter, not before the optical scene contract.
- Globe/Standard nonlinear near-horizon correctness and non-standard profiles
  retain their previous sampled solver/occlusion limitations.
- The `adoptScene` method must only be called when the caller can transfer
  sole ownership of all nested primitive data.
