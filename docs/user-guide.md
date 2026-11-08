# User guide — Legacy and Modern

Use a local HTTP server to open the two independent applications (see the root [README](../README.md)). The standalone Legacy and Modern physical workspaces use different rendering and state models. **Modern Demos** embeds the original Legacy renderer for all nine demonstration families; it does not convert it into an RK4 scene.

## Start

```sh
python3 -m http.server 8000
```

- **Legacy diagnostics:** <http://localhost:8000/CurvatureApp.html?ui=legacy> (the bare historical entry now opens Modern)
- **Modern Scene/Compare/Demos:** <http://localhost:8000/CurvatureModern.html> (primary URL; old `CurvatureApp.html?ui=modern` links redirect here)

No build step is required to serve the tracked HTML and JS. Browser settings, hardware acceleration and viewport size can affect appearance and performance.

## Legacy — animated demonstrations

The Legacy page keeps its original controls, fast playback and save/restore behavior. Its nine demonstration families are **Curve, Causeway, TransLine, Grace, Bedford, Tensas, Soundly, Chicago and Canigou**; they contain 80 authored key states and 71 transition definitions. The visible TransLine tab is labeled **TrnsmLine** in some controls. Choose a demo, then use **Play/Stop**, **Back**, **Forward**, **Count** or the Canvas playback toggle. These are transitions, not 80 separate physically traced Modern frames.

Examples of **existing Legacy URL behavior**:

| URL path / query | Meaning |
| --- | --- |
| `CurvatureApp.html?demo=TransLine` | Start the demo from the beginning |
| `CurvatureApp.html?demo=TransLine&pos=5` | Select **fifth** authored state, **without** autoplay (`pos` is 1-based) |
| `CurvatureApp.html?demo=TransLine&play=1` | Autoplay when an explicit nonzero `pos` is absent |
| `CurvatureApp.html?state=...` | Restore a **real** Legacy saved `DataX` state stream |

An explicit `pos` takes precedence over `play`; the `demo` branch takes precedence over `state`. Use the Legacy page's **Get App State / Get App Url / Set App State** controls for meaningful saved states—do not invent opaque `state` strings. Older URLs are **not** converted into Modern `experiment` payloads.

The original Legacy Canvas also offers **Export current PNG + JSON (ZIP)** and **Export all 6 references (ZIP)** for reproducibility. These capture browser output; they are **not** measurements or proofs of physical correctness. See [Legacy preservation](legacy-preservation-contract.md) and [visual references](legacy-visual-validation.md).

## Modern — physical scene and Demos

### Demos (all nine original Legacy demonstrations)

Open **Demos** in the Modern header to load the original fast Legacy renderer. Choose any of the nine families (Curve, Causeway, TransLine, Grace, Bedford, Tensas, Soundly, Chicago or Canigou) from **Demonstration**. Switching families stops the previous animation and starts the selected one at its first authored key state. Use **Play/Pause**, **Previous step**, **Next step**, and **Restart** with the live step indicator. The Canvas remains the original Legacy `JsGraph1` drawing engine; the dedicated Legacy page still works unchanged. The isolated demo host (`CurvatureDemosHost.html?embed=demos`), instead of the standalone Legacy page, loads lazily inside the Modern Demos iframe; playback pauses when you return to Scene or Compare. Your selected family and position remain available when returning to Demos in the same page session.

Demos uses **Legacy state and simplified refraction**, not the Scene/Compare optical RK4 model. It is deliberately outside Modern experiment URL/JSON persistence, so visiting Demos does not overwrite your saved Scene/Compare configuration. Use a local HTTP server rather than opening the HTML files directly, because the isolated playback controls require same-origin browser messaging.

### Scene

Use **Scene** to display one configured physical model. The left settings tabs include **Camera**, **Surface**, **Atmosphere**, **Objects** and **Display**. Start with a preset (e.g. **Lake Pontchartrain**, **Single tower** or **Two tower rows**). You can edit observer/camera parameters, choose a finite spherical radius or the exact flat limit, choose an optical profile, and configure up to two object groups. Valid changes normally update the scene; **Recalculate scene** is an explicit refresh control.

- **Camera aim** may use eye-level or horizon-related modes. For controlled comparisons with constant orientation, select **Eye level · fixed**.
- **Atmosphere** includes vacuum, a standard illustrative profile and engineered comparison profiles. Recalculation can be significantly more expensive than Legacy playback.
- **Display** can show the ground-metric grid, eye-level reference and traced horizon; these are different geometric or optical quantities.
- **Geometry renderer** offers **Canvas 2D · reference** and **WebGL2 · experimental**. WebGL2 affects drawing of projected geometry; it is **not** the retired WebGPU optical ray solver. **Check GPU** reports capabilities only.
- **Atmospheric Turbulence** creates an optional screen-space animated shimmer; it is a visual approximation, not meteorological inference.

**Camera zoom:** hold **Shift** and scroll the mouse wheel over the Scene image or either Compare image. Wheel up increases the focal length (narrows FOV), wheel down decreases it, by about 10% per normal notch. The zoom stays centred on the image; ordinary wheel scrolling without Shift remains page scrolling. The **Camera → Focal length** and **Field of view** controls update together. Compare always zooms A and B in lockstep; camera changes are included in saved experiments and copied URLs. Rapid wheel events are coalesced before a Physical redraw; visible image updates may therefore lag slightly behind the input field. The camera respects the model's 0.1°–160° FOV limits.

### Compare A/B

Switch to **Compare** for two independently rendered physical configurations. The observer, objects and camera framing are shared; **Surface** and **Atmosphere** can be selected independently for **Model A** and **Model B**. Compare uses a fixed **eye-level** aim for both sides so the camera itself does not track a model-specific horizon. Choose a pair preset or edit A/B individually, then use **Recalculate A/B** if needed.

Do **not** treat a matching silhouette or a pixel difference alone as proof of physical agreement: ray model, atmosphere, viewport, camera, occlusion assumptions and unresolved shooting results matter. See [physics](physics.md).

### Save and share Modern scenes

- **Copy experiment URL** creates a direct `CurvatureModern.html?ui=modern&experiment=...` link. Its data format is different from Legacy `?state=`.
- **History** is now the single browser-local archive for named and automatic experiments. Use **Save snapshot** below the Scene/Compare result, ✎ in History to add a name and notes, and **Restore selected** or double-click to load a saved configuration.
- **History filters** search saved names, notes and physical characteristics, with
  **Type** (Scene/Compare), **Geometry** (Globe/Flat) and **Atmosphere** choices.
  Filtered results appear in Pinned/Recent and the snapshot dropdown without
  altering or deleting saved records. In Compare, geometry and atmosphere must
  match one model together. The **A/B differences** group offers independent
  **Same / Different** filters for geometry and active refraction (not merely
  atmosphere model names). Those constraints show Compare records only, and
  ignore inactive Flat radii and Vacuum gradients. Use **Clear filters** to return to all snapshots;
  filter preferences survive reloads in the same browser.
- **History → Export selected snapshot** or **Export all snapshots** creates portable JSON including annotations, pins and available previews; **Import JSON** adds validated snapshots to History (it does not silently replace the live experiment). **Export current experiment JSON** preserves the original plain v1 schema for shared URLs and older releases.
- Named entries from the retired Experiment Library (`curvature-modern-library-v1` in localStorage) are copied automatically into History on startup; the original library is retained for rollback. If IndexedDB is unavailable, migration is retried on a later load. Browser storage is still device/profile/origin-specific until exported.
- Historical `gpuProbe` fields may still be accepted by the experiment validator for backward compatibility. They **do not** restore the removed research execution paths.

## If something goes wrong

1. Confirm that the static server is running **from the repository root**, then reload the page; inspect the browser console for missing assets and JavaScript errors.
2. In Modern, try **Canvas 2D** and an uncomplicated **vacuum** scene to separate drawing issues from atmospheric shooting/performance issues. Do not infer physical occlusion from a solver failure.
3. For a broken Legacy animation, verify the specific demo and old `pos`/`play` URL with the [preservation contract](legacy-preservation-contract.md).
4. For developer regressions, use the [test guide](development.md). The six Opera PNG references are protected test evidence and should not be overwritten simply to make a visual test pass.

The archived CPU research panel and standalone WebGPU test page are **not** available in the active branch. For historical investigation use [research archival and Git worktrees](research-archive.md).

### Atmospheric extinction / visibility (Modern Physical)

Under **Scene → Atmosphere**, enable **Atmospheric extinction / haze** and select a **Visibility range** in kilometres (1–500; default 60 km). The range is the distance where object contrast is about 5% in a simplified homogeneous white-air model. More distant visible towers and their foundations blend toward the white background; shorter ranges create stronger haze. Disabled by default to retain the reference rendering.

Under **Compare → Atmosphere**, extinction and visibility range are shared by **A** and **B**; refraction is still configured independently. Settings are included in saved experiments and copied experiment URLs; older links omit them and continue with extinction off. Haze works with both Globe and exact Flat, including Vacuum ray geometry (as a separate illustrative atmosphere), and can coexist with refraction and turbulence.

**Limitations:** distance is a geometric approximation to refracted optical path length, not ray-integrated optical depth. Extinction does not change refraction, optical occlusion, clipped objects, ground grid colours or captions. This is a visual model, not a calibrated weather forecast or aerosol-scattering solver.

### Inverse temperature slider: performance and timing

With **Atmosphere → Inverse atmosphere · required temperature**, drag the `Inverse target strength` slider. The value, required surface gradient and 0–2 km temperature legend are **draft previews** until release; the optical image stays at its last committed state. On release only the selected Compare model is traced if the other model and shared inputs are unchanged. When typing with keyboard, multiple rapid slider steps are grouped into one commit. The timing line just below Compare reports whether the other model was skipped, the elapsed CPU wall time and, when available, optics and Canvas timing. For a breakdown use **Display → Render profiler → Start recording**, then change B, **Stop recording** and **Refresh report**. A new B solve may still take noticeable time; the solver itself has not been approximated, interrupted or moved off the main JS thread. Shared changes (camera, objects, layout) still require both models.
