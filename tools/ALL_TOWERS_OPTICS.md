# Experimental full-line atmospheric overlay

Select TrnsmLine and ray-tracing mode. Draw the original scene first to capture physical tower vertices. Click **Calculate atmosphere - all towers (experimental)**. Calculation proceeds asynchronously, with progress in edges; when finished, **Show orange line overlay** is checked. Uncheck it to compare with the original geometry without recalculation.

The original renderer is unchanged. The new orange overlay traces each original structural member independently and does not connect across occluded samples. A calculation is invalidated when the geometric model key changes; recalculate after changing model parameters. This is an experimental overlay, not a replacement for the main model. It may take time for a long line.

Run `node tools/check-optics.js` for regression tests.
