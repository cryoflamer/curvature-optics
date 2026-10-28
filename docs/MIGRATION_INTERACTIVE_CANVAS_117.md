# Patch 117 — Interactive Physical Canvas redraw

## Motivation

The browser showed about 78,038 physically projected surface-guide pieces with
Globe + Standard. The physical ray field was cached, yet every slider update
still triggered a synchronous GraphX3DX redraw. The shared painter constructed
and stroked many thousands of independent Canvas paths. `optical geometry cached`
measures neither full-frame projection nor Canvas painting time.

## Changes

1. `CurvatureCanvasFrameScheduler` merges pending Physical redraw requests using
   `requestAnimationFrame`, always reading the latest camera when the frame is
   delivered. Legacy/Independent modes retain synchronous `graph.Redraw()` and
   pending Physical work is cancelled on a mode switch.
2. In the shared painter, consecutive **stroke-only** commands with identical
   alpha/stroke/line width are batched into bounded paths (512 segments max).
   Every source primitive begins a distinct subpath; fills flush the current
   stroke batch. This preserves the existing source/painter ordering and avoids
   accidental connections between adjacent guide fragments.
3. During high-frequency slider changes, **only** dense auxiliary ground guide
   curves are temporarily sampled (every twelfth complete `kind:angle` curve).
   No individual guide line is fragmented. Physical horizon primitives and all
   towers, fills, outlines and physical visibility decisions remain intact. An
   idle timer 180 ms after the last `UpdateAll` restores the full guide set.
   The original cached physical composition is unchanged.
4. Physical status includes per-stage timings: source composition, optics,
   frame snapshot, frame validation, fill projection, Canvas painter and total
   elapsed time. It also reports `canvasStrokeCalls`, which is useful when
   estimating path submission overhead.

## Reproducible stress test

`node tools/benchmark-physical-redraw-117.js 78000`

The synthetic test uses 78,000 projected guide-like 3D line primitives, a
480x320 headless stub Canvas and 100 rapid redraw requests. In this workload
78,000 line commands require 153 stroke calls rather than a stroke per command;
100 queued requests become one scheduled frame. The tool reports separate
frame-construction, projection and painter timing. **These are NOT browser FPS
measurements.** Real browser rasterization, layout, HiDPI, driver/GPU and the
physical optics cold-start cost are outside this synthetic benchmark.

## Manual browser acceptance

1. `TrnsmLine`, Physical, Globe + Standard, 85 towers, Grid On. On a cold build,
   confirm the same 0-unresolved ground-visible scene and filled foundations.
2. Drag `Pan` repeatedly. The status may read `INTERACTIVE PREVIEW`; towers,
   foundation fills and the physical horizon remain present. Dense grey/blue
   ground curves can be temporarily reduced. No new RK4 solves should occur
   from *camera-only* movement.
3. Release the slider. Once it settles, the full ground grid must return. The
   status reports `frame ... ms` and an individual `Canvas ... ms` component.
4. Switch to Independent or Legacy while a Physical frame is pending and check
   that the old mode renders normally (no late Physical overlay).
5. Test Flat + Standard and Globe + Vacuum. The physical horizon and physical
   visibility must remain unchanged; this patch does not introduce a physical
   distance clipping limit.

## Limits and next focus

`requestAnimationFrame` coalesces redraws but **does not** make an expensive
synchronous frame asynchronous. Temporary guide sampling improves interaction
with very dense grids, while full-quality final frames retain their cost.
The 180 ms settle period is an interaction debounce, not an upper bound on
rendering time or a promise of 60 FPS. A future patch can simplify ground guide
geometry using a validated screen-space tolerance at final quality, if profiling
still identifies guide projection as the bottleneck. RK4 and field geometry were
not modified.
