# Atmospheric Turbulence — patch 138.4 stability and performance

Scope: the **manual, screen-space** shimmer from 138.2–138.3. This remains an illustrative image postprocess and is **not** a turbulence prediction derived from atmospheric temperature or `C_n^2`. Physics, ray-tracing caches, experiment schema, and shader noise/displacement have not changed.

## Rendering behavior

- A newly calculated physical scene is uploaded to its GPU texture once per capture. Animation draws use that cached texture.
- **Scene** is capped at **60 GPU frames per second**, **Compare** at **30 GPU frames per second per viewport**, to avoid rendering two expensive full-resolution shader passes at high refresh rates. These are maximum rates, not promises about achieved FPS. Browsers may deliver fewer frames.
- When either `Intensity = 0` or `Drift = 0`, a parameter change generates **one immediate preview frame** and the continuous requestAnimationFrame loop stops for that mode, even with the effect switch ON. Editing either control to a nonzero value resumes animation without re-tracing optics. Paused animation behaves the same way.
- Camera drag pauses animated postprocessing and restores the original Canvas for the fast perspective preview. Its phase clock is reset on resume to avoid a visible time jump; large hidden-tab delays are handled similarly.
- A lost WebGL context pauses GPU animation and exposes the unchanged source Canvas behind the sharp guides. On `webglcontextrestored`, buffers/program/textures are rebuilt and **the existing Canvas** is re-uploaded. Re-running physical rays is unnecessary. The overlay is not permanently disabled on a recoverable context loss.

## Browser acceptance checklist

1. Apply 138.4 after 138.3; hard reload the Modern UI. In Scene → Atmosphere turn Atmospheric Turbulence ON. The title, guides, white background, and tower geometry should remain readable.
2. With e.g. `Intensity = 8`, `Eddy scale = 35`, `Drift = 25`, observe moving local warps, not multiply copied tower outlines. Toggle OFF and compare the unwarped scene.
3. Set `Intensity = 0` while leaving Turbulence ON: the source must be undistorted and GPU frame count must stop increasing. Re-enable nonzero intensity and confirm smooth movement resumes without an optics redraw.
4. Repeat with `Drift = 0`: a single frozen, warped snapshot should remain. Set nonzero drift and confirm animation resumes.
5. Press Pause/Resume; drag the Scene camera; switch Scene/Compare and select A/B. No blank overlays or jump in shimmer phase should be visible. A and B retain their own controls.
6. In DevTools, sample `CurvatureModernApp.getAtmosphericShimmer().getStats('Scene')` before/after a few seconds. With animation ON, `frames` increments but `uploads` stays unchanged; with zero intensity or drift, both remain unchanged after the single preview.
7. Use DevTools Performance or the browser's FPS monitor to evaluate CPU/GPU demand with the effect OFF, ON in Scene, and ON for A+B. Compare limits are **maximum** GPU presentation rates rather than guaranteed real display rates.
8. Optional WebGL context-loss test (only if supported in the browser): with the effect ON, obtain `const gl = CurvatureModernApp.getAtmosphericPresentation().getCanvas('Scene').getContext('webgl')`; call `gl.getExtension('WEBGL_lose_context')?.loseContext()` and later `restoreContext()`. While lost, the unprocessed physical scene and sharp guide overlays should remain visible; after restoration, shimmer should resume without a physical re-render. If the extension is unavailable, skip this step.

## Automated verification

- `node --test tests/*.test.js`
- Focused: `node --test tests/ModernAtmosphericControls1383.test.js tests/ModernAtmosphericShimmer1382.test.js tests/ModernAtmosphericPresentation1381.test.js`
- Regression coverage includes static-mode GPU scheduling, 60/30-Hz scheduler limits, separate Compare models, context loss and restoration (including cached-texture re-upload), and no optical rerender from control updates.

Note: CPU-only Node mocks validate scheduling, API interactions and WebGL call ordering; **visual quality and actual GPU FPS still require interactive browser acceptance**.
