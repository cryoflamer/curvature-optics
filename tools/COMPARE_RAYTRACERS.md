# Numerical ray-tracing comparison

Run from the repository root:

```sh
node tools/compare-raytracers.js
```

This checks convergence of the **current** `OpticalTowerDiagnostics.solveAngle` at
25, 10 and 5 metre integration steps. It is **not** an independent physical
validation and does not use the previous simulator.

To compare with the original simulator, supply an adapter **outside this
repository** (do not copy the current solver into the adapter):

```sh
node tools/compare-raytracers.js --reference /absolute/path/to/reference-adapter.js
```

The adapter must export `solveAngle(options)` returning
`{ status: 'visible'|'occluded'|'no solution', angle: radians|null }`.
Input options are `{geometry:'globe', atmosphere:'standard', observerHeight:15,
radius:6371000, distance, targetHeight, step}` in metres, with angles measured
from the observer's local horizontal. The original simulator may use a different
API or atmosphere profile; adapt its inputs and align its `n(h)` **before**
interpreting differences. Do not silently substitute another atmospheric
profile. The script compares status and angles with a preliminary 0.1 arcsecond
threshold. Cases: distances 3, 6, 12 km and heights 10, 20, 40 m.

The external adapter is not included because the original simulator's source
files are absent from the current pack archive.
