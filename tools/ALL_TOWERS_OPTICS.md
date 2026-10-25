# Experimental full-line atmospheric overlay

Select TrnsmLine and ray-tracing mode. Draw the original scene first to capture physical tower vertices. Click **Calculate atmosphere - all towers (experimental)**. Calculation proceeds asynchronously, with progress in edges; when finished, **Show orange line overlay** is checked. Uncheck it to compare with the original geometry without recalculation.

The original renderer is unchanged. The new orange overlay traces each original structural member independently and does not connect across occluded samples. A calculation is invalidated when the geometric model key changes; recalculate after changing model parameters. This is an experimental overlay, not a replacement for the main model. It may take time for a long line.

Run `node tools/check-optics.js` for regression tests.

## Radial ray cache

The full-line calculation caches expensive `solveAngle` results by the physical
ray's spherical central distance and radial target altitude (14 significant
digits). The apparent point still retains its original x/y coordinates, so
azimuth and member geometry are not shared. The cache is scoped to one run and
is discarded when a new calculation begins. The completion status reports
`unique rays` and `reused` lookups; `ray samples` still counts distinct physical
points. The subdivision, visibility, and clipping algorithms are unchanged.

The speedup depends on the amount of radial symmetry in the actual geometry.
A test fixture with 2,890 mirrored members reduced calls from 2,550 to 1,290
with zero coordinate difference; this is not a benchmark of real atmospheric
solver runtime. Run `node tools/check-optics.js` to check regressions.
