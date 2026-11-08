# Curvature Optics

Browser-based Earth-curvature and atmospheric-refraction visualizations, with **Modern as the primary interface**:

- **Demos** (Modern tab backed by `CurvatureDemosHost.html?embed=demos`) — nine original fast illustrated Legacy storyboards, running in their own isolated iframe. The historical `CurvatureApp.html?ui=legacy` page is retained for diagnostics and old saved links.
- **Modern** (`CurvatureModern.html`) — Scene, Compare and Demos, including physical-scene visualization with CPU ray tracing, a single **Scene** view and an independent **Compare A/B** view. Its Canvas 2D rendering path is the reference; WebGL2 geometry rasterization is an optional experimental backend.

The former standalone WebGPU optics harness and Modern's optional CPU research panel were **removed from the active tree** in #140.12.74. Neither is required to run these applications. The **Check GPU** button only reports capabilities; it does **not** perform WebGPU optical calculations. See [research archive](docs/research-archive.md) for history and recovery.

**Experimental Fast Preview:** In Modern → Scene/Compare → Display, choose
**Optical ray field → Fast Preview** to draw with cheaper approximate ray
angles, or **Auto** to show a throttled Fast Preview while navigating and
restore Accurate RK4 on release/idle. Accurate RK4 remains the default; the
near-horizon image may be incorrect. Fast Preview object detail can be
selected manually or adapted to measured redraw cost (`Auto`); full object
geometry remains intact in Accurate. Some profiles are not qualified and
show an explicit error instead of silently using RK4 in manual Fast mode.
In Auto, unsupported profiles do not render intermediate optical frames and
return to Accurate when motion stops. See [limits and tests](docs/fast-optical-preview.md).

**Compact Modern Display:** Under **Scene/Compare → Display**, the optical ray
field, Fast Preview detail, geometry backend and reference overlays remain
immediately available. Use the adjacent keyboard-focusable **?** hints for
technical details. **Advanced settings** contains the browser preference reset;
**Diagnostics & profiling** contains the separately collapsible GPU probe and
Render profiler. Panels start collapsed, and their open/closed choices persist
locally in Application Preferences (not in exported experiments). While
profiling is active, **Recording** is visible in the diagnostics heading even
if the profiler is folded. Optical/backend errors and live statuses are not
hidden in help text. These changes affect presentation only, not optics or
rendering behavior.

**Modern camera navigation:** Shift + left drag moves the observer sideways and
changes eye height without changing Pan/Nick/Roll; Alt + wheel moves forward or
backward horizontally. Shift + wheel continues to zoom. The shared position is
saved with Scene/Compare experiments. See [Modern camera navigation](docs/modern-camera-navigation.md)
for coordinate semantics, spherical recentering, and limitations.
**Camera → Camera Animation** now creates transitions directly from current views,
without requiring saved position names.

## Run locally

Serve the **repository root** with a static HTTP server (Python 3 is sufficient; no npm install or bundling is required for these entry points):

```sh
cd curvature-optics
python3 -m http.server 8000
```

Open the main interface in a browser; the older URL is a compatibility entry:

| Purpose | URL |
| --- | --- |
| **Modern Scene/Compare/Demos (primary)** | <http://localhost:8000/CurvatureModern.html> |
| Historical entry (redirects to Modern) | <http://localhost:8000/CurvatureApp.html> |
| Legacy diagnostics (explicit opt-in) | <http://localhost:8000/CurvatureApp.html?ui=legacy> |
| Existing Legacy demo/state links | `CurvatureApp.html?demo=...` / `CurvatureApp.html?state=...` (still Legacy) |

Bare `CurvatureApp.html` and older `?ui=modern` bookmarks redirect to `CurvatureModern.html`. Modern now keeps its own URL and generates direct Modern experiment links; no history rewrite back to Legacy. Old `?tab=`, `?demo=`, `?pos=`, `?play=`, `?state=` and `?embed=` URLs still boot the original Legacy runtime for compatibility. Direct file opening is not the recommended verification environment. A local server is also useful when testing saved links and loading scripts.

For first-time use, start with the [user guide](docs/user-guide.md). **Modern Accurate may take appreciably longer to recalculate** because it numerically traces refracted rays; it is not intended to animate every Legacy storyboard frame.

## Current project map

| Area | Primary code / contract |
| --- | --- |
| Legacy diagnostics and demonstrations | `CurvatureApp.html?ui=legacy`, `CurvatureDemosHost.html`, `src/animation/CurvatureDemos.js`, `src/app/CurvatureModel.js`, `src/legacy/` |
| Modern UI, saved configurations, routing | `CurvatureModern.html`, `src/ui/modern/`, `src/ui/modern/ModernRoute.js` |
| Physical optics | `src/optics/OpticalRayTracer.js`, `OpticalTargetProjection.js`, `OpticalSharedRayField.js`, `CurvaturePhysicalSceneOptics.js` |
| Geometry, scene and rendering | `src/geometry/`, `src/scene/`, `src/renderers/`, `src/app/CurvatureMainCanvasRenderer.js` |
| Regression tests and references | `tests/`, `tests/fixtures/legacy-browser-references.zip` |

The modules are **not** partitioned purely by directory: for example, `src/legacy/GraphX3DX.js` is loaded by **both** interfaces. Do not remove a file solely because of its path or its name.

## Documentation

- [Architecture](docs/architecture.md) — entry points, module ownership, data flow, retained/archived boundaries.
- [Physics and numerical methods](docs/physics.md) — surface geometry, atmospheric models, RK4, shooting, and limits of validation.
- [Fast optical preview](docs/fast-optical-preview.md) — experimental manual Display → Optical ray field, adaptive Preview-only tower LOD, exact RK4 isolation, unsupported profiles and validation limits.
- [User guide](docs/user-guide.md) — Legacy storyboards, Modern Scene/Compare, rendering, URLs and saved scenes.
- [Development and tests](docs/development.md) — no-build workflow, test commands, preserved baselines and contribution rules.
- [Research archive](docs/research-archive.md) — CPU/WebGPU research removed from the active tree and Git worktree recovery.
- [Historical documentation](docs/historical-records.md) — superseded migration/patch notes and Git recovery instructions.

Superseded migration and patch-by-patch documents were retired from the active tree in #140.12.76. See [historical records and recovery](docs/historical-records.md) for the removal inventory and Git commands to read them. `PROJECT_STATE.md` remains a historical journal, not the current project specification. Focused technical evidence and documents used by regression tests were retained.

## Quick verification

Requires **Node.js with `node --test` support** and Python 3 (standard library only):

```sh
node tools/check-refactor-closure.js
node --test tests/DocumentationConsolidation141275.test.js
```

This is an automated regression gate, **not** a substitute for checking animation, camera interaction, and appearance in the target browser. See [development](docs/development.md) for deeper checks and browser smoke tests.

## Baselines and scope

`optics-baseline-2026-11` is the historical CPU-optics baseline. The research archive is intended to be preserved as `optics-research-archive-2026-11`, an **annotated Git tag on the commit immediately before #140.12.74**; verify that it exists in **your** clone. A format-patch cannot create Git tags. Archived Legacy browser PNGs are **observations of Legacy output**, not measurements of physical correctness or proof of Modern pixel parity.

## Modern Demos — all nine original animations (#140.12.78)

In Modern, the **Demos** tab embeds all nine original Legacy animation families. Choose a demonstration, then use Play/Pause, Previous/Next and Restart controls. This is one isolated, lazily loaded iframe backed by the original fast Legacy renderer—not a conversion to RK4. Switching families stops playback and starts the selected demonstration at its first key state. Scene/Compare and opt-in Legacy diagnostics (`CurvatureApp.html?ui=legacy`) continue to work. See [user guide](docs/user-guide.md).

### Temperature gradient in Modern (#140.12.94)

In **Scene/Compare → Atmosphere**, select **Temperature gradient · hydrostatic** to control surface temperature (°C), local surface lapse rate (K/km) and pressure (hPa). In Compare, A and B have **independent** temperature atmospheres; atmospheric extinction/haze remains shared. **Display → Show temperature column (0–2 km)** overlays a switchable color column on each temperature-model image. It is a visual altitude legend, not a change to rays or a pixel-aligned height map. The settings and toggle are saved in experiment URLs/JSON. Existing fixed Standard and Legacy optics are unchanged. Read [the model's physics, validity domain and caveats](docs/temperature-gradient-modern.md) before interpreting inversion experiments.

## #140.12.97 — Inverse temperature atmosphere (Modern)

For an engineered exponential ray field, **Atmosphere → Inverse atmosphere · required temperature** derives the dry-hydrostatic `T(h)` and `dT/dh` that would be needed, including a zero-K validity boundary. The surface gradient can be edited directly or via an equivalent transition slider; A/B and experiment URLs are independent and backwards-compatible. Details, equations, warnings, and an Opera test guide: [`docs/inverse-temperature-modern.md`](docs/inverse-temperature-modern.md).

### Inverse atmosphere slider responsiveness

The **Inverse target strength** slider now previews the surface gradient, sampled temperatures and optional color column while it is moving. This draft updates **only** the controls/legend: the image is deliberately not traced until pointer release (keyboard edits coalesce after a short pause). In **Compare**, a changed A/B temperature or transition parameter redraws only the edited viewport when the layout is unchanged; shared camera/objects and layout changes still redraw both. The bottom-of-Compare timing message distinguishes a skipped unchanged view from computed work and reports CPU wall times. The existing **Display → Render profiler** provides a more detailed optics-vs-Canvas breakdown. The inverse RK4 solver, atmospheric formulas, numerical tolerances, and saved experiment schema are unchanged.

### Inverse atmosphere optical performance

The prepared Modern inverse-temperature tracer now evaluates `d(ln n)/dh` in
one pass, omitting repeated inverse-temperature integral calculations on the
RK4 hot path. At the engineered 100% endpoint, the exact gradient is `1/R`.
The independent raw `n(h), dn(h)` diagnostic functions, integrator, precision,
visibility tests and temperature display are preserved. On the local 200-tower
Node benchmark the optics stage improved by about 8× at 100% and 3× at 50%.
Actual Opera wall times may differ. Reproduce with
`node tools/benchmark-inverse-optics.js --towers=200 --weight=1` or
`--weight=0.5`; compare against **B optics** in Compare. Details and checks:
[`docs/inverse-temperature-modern.md`](docs/inverse-temperature-modern.md).


**Optimization status:** The inverse-atmosphere performance pass is complete
for now. Opera measurements for 200 towers were 647 ms B optics at 100% and
2462 ms at 50%; remaining intermediate-blend and non-optics overhead work is
tracked as a **deferred, low-priority TODO** in
[`docs/inverse-temperature-modern.md`](docs/inverse-temperature-modern.md).

### Modern camera navigation and saved poses

Modern Scene and Compare support W/A/S/D horizontal movement, Q/E height, and
arrow-key Pan/Nick after focusing the viewport. Shift/Ctrl adjust navigation
speed; optical recomputation occurs on release. The Camera panel exposes exact
East/North coordinates, movement/turn rates and Alt-wheel step. An optional
Saved views library holds up to 20 reusable poses; none are required for camera
animation. Poses round-trip with Modern experiments and leave physical A/B
settings unchanged. See [`docs/modern-camera-navigation.md`](docs/modern-camera-navigation.md).

### Modern camera animation

Scene / Compare → Camera → **Camera Animation**: move the camera, click
**Add current view**, move it again, and repeat. Two frames create a simple
transition; three or more create an animation. Frames are named automatically;
you can change travel duration, easing, and pause after selecting a frame.
The optional Saved views library can also add existing poses. Frames always own
independent snapshots preserved in JSON/URL experiments. Playback uses Fast
Preview/LOD, with Accurate restored at rest. See
[`docs/modern-camera-interpolation.md`](docs/modern-camera-interpolation.md)
for timeline semantics, limits and tests.

### Persistent Modern application preferences

Modern remembers Display → **Optical ray field**, **Fast Preview object detail**
and **Rendering backend**, plus camera navigation speeds and Alt-wheel step,
without requiring Save. They are local to the browser, not exported with scene
physics or Camera Animation. **Display → Reset application preferences**
restores defaults without clearing experiments. Earlier navigation settings
are migrated automatically. See
[`docs/modern-camera-navigation.md`](docs/modern-camera-navigation.md#application-preferences-browser-local).

### Modern workspace preferences and Camera layout

Scene and Compare now remember **separate active settings tabs** and fold states;
Compare additionally remembers the selected A/B editor. The top-level Scene /
Compare / Demos selection is also browser-local. Camera now has collapsible
Position & orientation, Navigation, Camera Animation and optional Saved views;
long usage notes live in accessible `?` help. Camera Animation keeps a compact
frame-count/duration summary when folded. These choices persist automatically
in `curvature-modern-application-preferences-v1` and do **not** become part of
the physical experiment schema. Old preference records and experiment URLs
remain valid. An explicitly shared experiment URL takes precedence over the
saved mode/model; direct `?mode=`, `?tab=` and `?model=` parameters take priority
when valid. Invalid keys or removed sections are ignored safely.

**Display → Advanced settings → Reset workspace layout** restores default tabs
and open sections, without clearing optical quality, navigation speeds or
experiments. The existing **Reset application preferences** clears all browser
preferences, including workspace layout. Scene and Compare share camera/objects,
but not the UI state of their collapsible controls.

### Modern Objects layout

**Scene / Compare → Objects** retains two physical groups and the same ten
editable fields per group. The six frequently used inputs (count, type, first
distance, spacing, lateral offset and object size) remain visible when a group
is open. The four optional offset/size variation controls live under a
nested **Variations** fold, closed initially. Each group heading reports its
current object count and shape (including an empty group); the Variations
heading identifies active nonzero amplitudes. Help for the shared A/B object
editor is in the keyboard-accessible `?` tooltip.

Group and variation fold states are remembered separately for Scene and
Compare across reloads via browser-local workspace preferences. Folding
controls does not change the model, hide objects from rendering, or affect
experiment JSON/URL serialization. All existing physical object control IDs,
validation handlers, shared Compare objects, preset reset and optics remain
unchanged. **Reset workspace layout** returns the fold states to defaults.

### Modern Surface and Atmosphere layout

**Scene / Compare → Surface** now groups curvature and radius controls under a
persistent *Curvature & radius* fold. Its header reports the selected model's
actual globe radius or exact flat geometry even when folded. **Atmosphere**
keeps the optical-model selector visible; profile inputs are shown only for
models that need them. Equations and extended descriptions, atmospheric
visibility and turbulence have separate collapsible groups. Their open/closed
states are remembered independently in Scene and Compare, using the existing
browser-local workspace preferences, not experiment JSON.

The current physical-model caveat stays visible above the folds for engineered
profiles, mathematical blends and inverse temperatures (including their
zero-Kelvin limit). Haze and turbulence show their active state in each folded
header. Technical explanations are available from `?` hints without occupying
the sidebar. Compare's A/B model-specific surface and atmosphere still use the
existing independent physics editor; visibility remains shared where it was
shared before. No optical, atmospheric, painter or experiment-schema changes
are introduced by this layout pass.

### Modern Scene / Compare consistency

**Compare → Physics pair** now uses one short sharing hint with an accessible
`?` explanation instead of an always-visible paragraph. Beneath the A/B
selector, a live read-only summary shows the **selected** model, Globe/Flat
surface (and Globe radius), and optical atmosphere. The summary updates when
switching A/B, changing physics presets, or editing a model; selecting A/B
alone still does not retrace optical rays. Physics and experiment data are
unchanged.

The Camera **Navigation** fold summarizes the current movement and rotation
speeds, including after a stored preference is restored or reset. Optional
saved-view guidance, Compare eye-level guidance, and Scene/Compare recalculation
notes use short labels with keyboard-focusable `?` help. Status messages,
physical-model cautions, and actual control labels remain visible. The
main Scene/Compare controls keep their original IDs and handlers.

On narrow screens, focused or hovered sidebar help is fixed within the
viewport to avoid off-screen tooltip overflow. Below 380 px, two-column
camera/object fields stack into one column. This is a presentation-only pass;
existing preferences, collapsible-section choices, saved experiments,
renderers, and physical computation are unchanged. Visual behavior in the
user's Opera browser should be checked after application.

### Modern Experiment History

Modern now has a separate **History** panel in the header (not a sixth settings
or physics tab). It saves full, validated Scene/Compare snapshots in browser
IndexedDB, with manual Save, automatic saves after stable physical-input edits,
restore with a protected pre-restore checkpoint (deduplicated across history),
delete and clear automatic.
Camera movement alone never creates automatic entries. The **Visual History** gallery now shows saved, real-Canvas Scene thumbnails or
composite A/B thumbnails, read-only enlargement, newest/oldest ordering,
pinning, multi-selection, batch deletion and explicit clear-all. Screenshots
are only attached when an accurate completed render matches the saved state;
when the Canvas is stale/unavailable, the full experiment saves with a
placeholder instead. The physical painter's background is transparent: history
composites pixels on the same **white** backdrop seen in the live Modern
viewport, instead of showing the gallery's navy background through the image.
Previously stored transparent thumbnails also display over white without
IndexedDB migration; opaque dark-filled older captures must be recreated.
Older Core entries are readable without migration.
Gallery UX: one click selects a snapshot; double-clicking its image/text
restores the experiment with the protected recovery checkpoint. Browser-local
**S / M / L** card sizes are available. **Pinned** records appear in a
collapsible section above **Recent**, never duplicated; the collapsed state and
card size are Application Preferences, independent of experiment/IndexedDB data.
Pin/Unpin and Delete are thumbnail-corner icons. Pinned records must be
unpinned before individual or batch deletion. A checkbox remains available
for bulk selection and future Storyboard composition.
Unified Preview: hovering over the thumbnail for 400 ms shows its enlarged
saved screenshot and physical-settings inspector together. Compare exposes
both A/B physics and their differences; Scene exposes one configuration.
The popup is viewport-bounded, stays open while hovered and can be locked with
**Keep open**. Keyboard **Space** or a touch tap opens a persistent preview;
**Enter** and double-click still restore. **Esc** closes the popup. No
IndexedDB query or optics recalculation happens when inspecting a snapshot.
No new History schema is introduced.
Smart semantic A/B filters and Storyboard remain future stages. See [Modern Experiment History](docs/modern-experiment-history.md)
for retention, comparison semantics and browser checks. Existing experiment
URLs/JSON and the named Experiment Library are unchanged.
