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

### Modern target direction geometry (compass foundation)

A read-only target-direction kernel now locates the actual authored object
anchors, per-group and scene centres in the movable observer frame for Globe
and Flat. Bearings, screen-relative direction, Pan/Nick/Roll and camera aiming
come from the same physical geometry as the Modern renderer; no refracted
visibility is inferred. **The visible compass is still pending.** Details and
API: [`docs/modern-target-direction.md`](docs/modern-target-direction.md).

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

### Modern working-session autosave

Modern restores the most recent complete working experiment when the page is
reopened or refreshed. Scene/Compare physics, camera, objects, model-specific
atmospheres and camera keyframes are saved after 550 ms of idle editing; an
immediate synchronous checkpoint also runs on `pagehide`, `beforeunload` and
when the tab becomes hidden, so a quick reload does not drop the final edit.
The durable checkpoint is in browser IndexedDB (`curvature-modern-working-session`),
with the existing version-1 experiment `localStorage` entry as a synchronous
reload fallback. Startup waits for IndexedDB recovery before rendering the
initial model. Corrupt checkpoints are rejected; an explicitly shared experiment
URL wins on first arrival, and its URL is never overwritten by autosave. After
editing, a reload of that same tab resumes the working session without changing
the shareable URL; navigating to a different shared link still gives that link
priority.
Reset experiment clears both storage copies. This is a single continuously
replaced working session, **not** a new History snapshot on each edit.

The **History** panel's open/closed state is remembered independently in
Application Preferences and restored on refresh; resetting those preferences
closes History without deleting the current experiment or its History records.
The Pinned fold and S/M/L size continue to use those preferences. Browser storage
is origin-local, may be cleared or evicted, and is not a cross-device backup.
Simultaneous edits from multiple tabs are not automatically merged; the latest
saved checkpoint wins. See the session notes in
[Modern Experiment History](docs/modern-experiment-history.md).

### Modern Experiment History

**Save snapshot** now appears below the Scene/Compare result only when the full
current experiment is not already in History. Existing saved states display an
**Already in History** indicator instead. Automatic History entries count as
existing states; use Pin in History to protect them. Manual Save checks every
saved full-state signature and never duplicates an older matching record.
The History panel remains dedicated to browsing, restoring and organizing.

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
History supports browser-local **Search, Type, Geometry and Atmosphere** filters
across both Pinned and Recent, with a match counter and persistent preferences.
Compare A/B physical choices match either model, but combined Geometry and
Atmosphere must apply to the same side. **Geometry A/B** and **Refraction A/B**
Same/Different use the active physical parameters, not merely model labels.
**Select shown** checks only currently rendered cards; temporary bulk selection
is cleared when filters change or Pinned collapses. Checked snapshots can be sent in display order to **Animation Studio**.
The former Storyboard shortlist remains an ordered, browser-local staging
selection (with missing/deleted IDs pruned), but no longer creates a second
thumbnail strip inside History. Animation Studio owns frame ordering/timings;
physical-parameter playback remains future work.
See [Modern Experiment History](docs/modern-experiment-history.md)
for retention, comparison semantics and browser checks. Existing experiment URLs and plain JSON remain compatible; named Experiment Library records migrate into History.

History snapshots support optional saved names/descriptions via ✎, independent of experiment JSON and Pin. **History replaces the former Experiment Library panel:** it provides **Export selected snapshot**, **Export all snapshots** and **Import JSON** for portable backups containing names, notes, pins and existing thumbnails. **Export current experiment JSON** retains the plain version-1 format for sharing with older Curvature builds. Old named localStorage Library entries are copied to History at first launch; the original data is not deleted. See `docs/modern-experiment-history.md` for migration and JSON compatibility details.

- [Animation Studio architecture research and #120.1 compatibility/project API](docs/modern-animation-research.md): two mutually exclusive animation modes, physical interpolation limits, self-contained keyframes and planned integration.
- **Animation Studio draft editor (#120.2)** (historical handoff, replaced by the separate Animation workspace): load selected History snapshots or import the existing Camera Animation; check camera-only / one-physical-channel compatibility and adjust names, order, travel, hold and easing before preparing an in-memory project. No playback or persistent animation project yet; see [History guide](docs/modern-experiment-history.md).
- **Compact Animation Studio (#120.2.1)** (superseded layout): History shortlist and Studio showed saved screenshot thumbnails in horizontally scrolling strips; Studio edits only the selected keyframe. Both panels have bounded widths. Missing screenshots are labeled without optical recapture; see the [History guide](docs/modern-experiment-history.md).


### Animation workspace (UI restructure)

Modern has an **Animation** workspace alongside Scene, Compare and Demos. It is
**not** a physical experiment mode: changing tabs does not change Scene/Compare
optics, create a History checkpoint or render an animation. The current
Scene/Compare experiment and the old Camera Animation remain available when
returning to their respective screens.

**History** opens as an overlay instead of pushing the viewport down the page.
Filter and select snapshot cards, then use **Add selected to Animation**: the
selected IDs are staged in display order, de-duplicated and handed to the
Animation Studio timeline. Choose more snapshots from the editor via **Choose
snapshots from History**. The previous storyboard shortlist is retained as
local staging preferences for compatibility but no longer renders a second
thumbnail strip in History; the Studio owns ordering and timings. Loading a
new selection replaces the draft's frame list while preserving per-ID timings
where applicable. Previously imported Camera Animation frames can still be
loaded through **Import Camera Animation**.

Animation Studio displays a saved-keyframe preview and a selectable frame strip.
The preview is an existing History thumbnail, **not** freshly computed optical
playback. Drafts remain in memory. Prepared **Camera Animation** projects can now play in
a dedicated optical viewport; durable Animation Project storage and physical-parameter playback
are not yet implemented. The selected workspace tab is a browser
preference, not part of shared experiment JSON or URLs. Explicit shared
experiment links open their physical Scene/Compare context.

### Animation Studio drag-and-drop

In **Animation**, use **Choose snapshots from History** to open a compact
side-by-side Snapshot Picker. Drag saved screenshots into timeline gaps, or
reorder existing frames using their drag handles. Drop onto the left or right
half of a frame to insert before or after it. To add several snapshots, check
multiple picker cards and drag a checked card, or use **Add checked** / the
`+` insertion controls. Existing Up/Down and keyboard-accessible buttons
remain available. The full History manager is still accessible through the
header or **Full History** inside the picker. Dragging does not alter original
snapshots, active physics, or saved experiment URLs; incompatible sequences
continue to be rejected on Prepare Project. See the
[History and Animation guide](docs/modern-experiment-history.md) for details.


### Isolated Camera Animation playback

In **Animation**, assemble two or more compatible camera keyframes and click
**Prepare project**. A separate physical viewport appears **above** the editor
with **Play**, **Pause**, **Stop** and a seek slider. The preview renders real
intermediate optical scenes using the production CPU Physical renderer—not
History thumbnail crossfades. Compare projects render A and B side by side.
The Scene/Compare camera, state, autosave, History and original Camera Animation
are **not modified** by preview playback. The preview owns two `CurveAppClass`
models, two separate GraphX3DX canvases and its own optical cache sessions.

Time is derived from the validated project timeline, not the number of drawn
frames: slow optics may cause skipped intermediate display frames. Fast Preview
is labeled **approximate**, while unsupported fast profiles (including
Temperature lapse) use **Accurate** and may update slowly. Hiding the browser
tab or leaving Animation pauses playback; editing keyframes invalidates the
prepared project, which must be prepared again. The preview itself does not export a
video; named projects are saved separately through Animation Library. **Physical parameter playback is now available**.
See [animation research](docs/modern-animation-research.md) for the clock,
model-isolation and optical-rendering contract.



### Animation Studio draft autosave and reload recovery (#140.12.120.4.3)

Animation Studio now keeps **one editable draft checkpoint** automatically, independently
from Scene/Compare Session Autosave and History. Frame order, embedded snapshot
experiments, names, per-frame timing, easing, selected frame, playback optics quality,
and the last timeline position are preserved. Changes are saved synchronously to a
local browser backup and debounced to a separate IndexedDB database. Switching away,
pausing, hiding the tab, or closing the page also flushes the latest position.

After F5 the editor restores the saved draft. If it was prepared and still compatible,
its independent playback is reconstructed **paused** at the last saved timeline position;
no animation starts by itself. Missing History snapshots do not affect the owned
keyframe states. Even an incomplete/incompatible draft remains editable. Invalid or
future-version checkpoints are ignored, and late IndexedDB restoration cannot override
an edit made in the new tab. Extremely large drafts may exceed localStorage quota;
IndexedDB is the durable fallback, with a visible status if browser storage fails.

This is **working-draft recovery**, separate from the named Animation Library:
it stores only the current draft. Creating a new draft overwrites the prior
autosave, but named saved projects remain independent. Portable JSON/video
export is not yet implemented. The Scene/Compare experiment is not modified.

### Animation preview initial frame and reload redraw

A prepared Animation Studio project now **renders its sampled physical frame on
Prepare and after F5**, while staying paused. The restored timeline position is
used rather than silently starting from 0; Stop returns to time 0 and renders
the first keyframe. Seek renders the requested intermediate state. The first
frame is painted after the Animation workspace is visible and its independent
GraphX3DX canvases have acquired their layout dimensions, avoiding a blank
viewport when an early resize clears the Canvas. A paused frame is repainted
when the viewport width changes. The transient `Rendering physical frame…`
message identifies a still-pending calculation; failures remain visible with a
**Retry frame** action, not a fabricated snapshot/crossfade. Playback never
autostarts during recovery and never changes the live Scene/Compare.

For verification: Prepare → first frame; F5 at a nonzero timeline position →
paused physical frame at that exact time; Stop → first frame; Seek → sampled
intermediate frame. The `Rendered t=` diagnostic must match the painted frame.
In-browser verification of actual pixels and performance is still needed.

### Physical Parameter Playback in Animation Studio (#140.12.120.4)

A compatible saved-snapshot animation can now be played directly in the
independent Animation Studio optical view, including Earth curvature
(Globe ↔ Flat) or a single active temperature gradient with a fixed camera.
Prepare the project, then Play/Pause/Stop/Seek; the parameter shown above
the viewport tracks the current physical frame. Scene/Compare and History
remain unchanged. Temperature-lapse uses Accurate optics (potentially slow);
absolute-time playback may skip displayed frames. See
[`docs/modern-animation-research.md`](docs/modern-animation-research.md).

#### Animation optical diagnostics

In **Animation**, the **Optics** selector controls the isolated renderer.
**Auto** means Accurate RK4 for curvature/temperature animations (Fast only
for qualified camera motion); explicit Accurate is also available, while
**Fast if supported** is an opt-in approximation. When the physical
renderer rejects a Fast atmosphere/geometry combination at runtime, the
Animation preview automatically retries that frame using Accurate RK4
instead of stopping Playback. Runtime rejections are remembered **only for the same physical state**, not
for all `standard + globe` frames: at near-Flat curvature Fast may be
unavailable, but returning to a qualified smaller radius restores Fast. The
production Fast-field qualifier checks curvature before rendering, and
changing Optics clears cached runtime rejections. Diagnostics distinguish
**requested** and **effective** quality, explain why Fast was not used, and
count actual runtime fallbacks;
other optical failures remain visible rather than being hidden by retries.
The final Flat frame is still sampled at its exact animation time. The current frame displays
its sampled time, calculation time, quality per viewport and whether the
Eye level and Traced horizon overlays were drawn or were unavailable.
Eye level and the exact forward-RK4 Traced horizon respect the original
snapshot's display flags. Exact horizon is unavailable in Fast Preview; a
finite horizon that is unresolved or outside the field of view is not drawn.
During a slow render the playback clock may move ahead of the last rendered
frame, which is reported separately. The atmospheric temperature column is
not yet supported in the isolated Animation viewport. Details: [animation
research](docs/modern-animation-research.md).

### Named Animation Library — durable project foundation (#140.12.120.5.1)

Animation Studio now has a compact **Animation Library** toolbar, separate from
History and from the single automatic draft checkpoint. For a compatible set
of frames, **Save animation** creates a new named project in its own IndexedDB
store; **Save As** creates another independent copy. Select a project and use
**Open** to load its editable keyframes and optics settings, with playback
prepared and paused at frame zero. **Save changes** explicitly updates the
opened project; simply editing a draft never overwrites a saved animation.
**Delete** confirms removal of the selected library project while retaining
the current draft. The toolbar reports storage and validation errors.

Each library record embeds a fully validated `ModernAnimationProject` with its
base physical experiment and keyframe values. History snapshot IDs are only
provenance: removing, pruning, or renaming the source snapshots does not change
saved animation playback. Opening a project reconstructs an owned editable
Studio draft, not a live Scene/Compare state. The automatic draft continues to
save independently, including the associated library ID and revision after F5.
If a different tab changes a named project before **Save changes**, a revision
check rejects the stale write; use **Open** or **Save As** instead. An unavailable
IndexedDB database is reported rather than claiming that a project was saved.

### Animation Library visual gallery (#140.12.120.5.2)

The toolbar is now followed by a **collapsible horizontal gallery of compact
saved-project cards**. Each card shows the project name, Camera or Physical
animation type, animated variable, keyframe count, total duration, updated
date, a short description and a first-frame physics summary. Use **Open**,
**Rename**, or **Delete** directly from a card; **Select** highlights a project
without overwriting the draft. Save animation, Save changes, and Save As remain
explicit actions above the gallery. A saved project with unsaved draft edits is
clearly identified.

When the initial keyframe exactly matches a History snapshot with a genuine
screenshot, the library stores a bounded copy of that image in its own
IndexedDB record. Deleting the source History snapshot does **not** erase this
preview or the self-contained physical animation. Imported camera sequences
and older saved projects without screenshots display an honest **No saved
screenshot** placeholder and their physical parameters, never a fabricated
image. If the first physical frame changes, Save changes discards the stale
preview; renaming changes metadata alone, preserves all keyframes and is
revision-checked against edits from other browser tabs. Existing library
records require no migration. Portable JSON import/export is available from the
Animation Library toolbar.
There is no video export, background rendering, change to optical physics,
new HTML entrypoint, or Legacy change.

### Animation Library duplicate protection

**Save animation** and **Save As** compare the full semantic animation (active
physical state, animation channel, ordered frame values, travel/hold durations
and easing) with all saved projects. Titles, descriptions, History source IDs,
screenshots, creation dates, saved optics preference and the current playback
position do **not** make a different animation. The duplicate check and insert
run inside one IndexedDB read-write transaction, including competing tabs.
An existing match offers **Open existing** or an explicit **Save copy anyway**;
no automatic copy is made. **Find duplicates** groups old identical library
records for manual review with Open/Delete, but never deletes anything itself.
Save changes still updates the selected project's revision explicitly. The
same semantic comparison is also used by portable JSON import.

### Portable Animation Library JSON

In **Animation → Animation Library**, use **Select** on a card followed by
**Export selected** to download one project, or choose **Export all** to back
up the entire named library. **Import JSON** restores a file from either
export action, or a standalone validated v1 Animation Project. Files contain
complete physical states, ordered keyframe values, timing, labels, optional
saved screenshots, chosen Optics quality and the saved dates; they are **not
video files** and do not include playback frames. The named library is kept
separately from the working draft and Scene/Compare.

The portable envelope is `format: "curvature-modern-animations"`, `version: 1`,
with an `animations` array. The import validates every entry before any write;
unsupported versions, corrupt or oversized files and invalid physics are
rejected. Inside **one IndexedDB transaction**, imports compare the same
semantic fingerprint as Save As, skipping identical existing projects and
repetitions within the file. Imported projects receive fresh **local** IDs
rather than overwriting the original ID, and dates, names, descriptions,
quality and genuine stored thumbnails are retained. Cross-browser import
clears browser-local History source IDs to avoid displaying unrelated thumbnails
from the destination History. No import silently edits
or replaces the current Studio draft; open a restored project explicitly.
Import reports how many records were created versus already present. Keep
JSON backups outside the browser if the library is important to preserve.

**Browser loader regression:** the library uses the same UMD script as Node,
but `require()` must be guarded by the CommonJS branch. A classic-browser
VM smoke test now checks script loading without Node globals and a named
project IndexedDB round-trip (`node --test tests/ModernAnimationLibrary.test.js`).
If the library reports unavailable storage, inspect the browser console before
changing IndexedDB settings or deleting saved data.


### Animation performance and pixel parity

After #140.12.120.6 the Animation Studio has a collapsible **Performance & pixel parity**
probe showing bounded frame p50/p95, cache hit/miss metrics and an explicit
Scene/Compare RGBA comparison when identical physical state, bitmap dimensions
and optical quality are available. This is diagnostic evidence, **not** an
automatically passed browser pixel-parity baseline. See
[`docs/modern-animation-quality-audit.md`](docs/modern-animation-quality-audit.md).


### Deterministic Animation PNG export

For any compatible draft or prepared project, open **Animation playback → Export PNG frames**.
Choose FPS, frame size and **Render workers** (`Auto`, `1`, `2` or `4`), then
**Render PNG ZIP**. Auto conservatively uses up to four render workers based
on browser-reported CPU concurrency. Each worker owns its Accurate RK4 optical
contexts and fixed-size `OffscreenCanvas` objects. Frame indices are dynamically
scheduled, so slow frames do not hold up the other renderers; a separate ZIP
worker reorders finished PNGs by exact timestamp and writes `manifest.json`.
Compare A/B gets synchronized images for every timestamp, including the final
keyframe. The manifest records `renderWorkers` and `renderElapsedMs` to help
compare a baseline (one worker) with parallel exports. The main thread remains
responsive and displays completed frames, ETA and the ZIP packing phase.
**Cancel export** terminates every worker immediately, without a partial ZIP.
The 751-timestamp / 192-MiB bounded ZIP32 limit, opaque white PNG background,
and isolation from live Scene/Compare, Playback, History and drafts are retained.
This is still a PNG sequence; MP4/WebM encoding is not yet supported.
See [frame export design and limits](docs/modern-animation-frame-export.md).


### Animation Studio Camera HUD appearance

The separate Animation Studio playback view has a **HUD appearance** panel next
 to its **Camera HUD** checkbox. Background opacity (0–100%) changes only the
 panel background, not its text; Position anchors the panel to one of four
 corners **inside each Scene / Compare A/B viewport**, and Size selects
 75%, 100% or 125%. Appearance changes update the last painted playback
 sample without another RK4 render. Preview visibility is independent of
 the **Include camera HUD in PNGs** and **Include camera HUD in video** export
 checkboxes; burn-in remains disabled by default.

Explicit Animation Studio appearance choices are autosaved in the working
 draft and stored with named Animation Library projects. Older projects
 without this optional field keep working and inherit the browser's Scene
 appearance until explicitly edited. Newly saved projects capture the
 current appearance. PNG and MP4/WebM render Workers receive an immutable
 copy at export startup, include the effective settings in their manifest
 when HUD is enabled, and never modify the underlying optical scene. With
 HUD burn-in off, export Canvas pixels are unchanged.

### Direct removal controls in Animation Studio

The Animation Studio keyframe timeline has an `×` action in the upper-right
corner of **each** frame card. It removes that frame from the current editable
draft without changing its source snapshot in History, and without selecting
or dragging the card. The selection panel retains frame timing and move
controls, but no longer duplicates frame deletion. Immediately after removal,
**Undo** restores the previous draft, including its frame settings and
selection; undo is one step, lasts until the next draft edit, and is not stored
across a reload. The staged-snapshot shortlist is shown as compact cards in
the editor with an `×` to **unstage** a saved snapshot without deleting it.
History's actual snapshot deletion remains a separate, confirmed operation.

### Animation Studio HUD integration compatibility

If HUD appearance editing reports `Invalid editor property` or video export
reports missing `normalizeAppearance`, use the updated Modern entrypoint. It
loads the Canvas HUD module before animation export planners and refreshes the
Studio and Worker script cache keys. This does not change animation projects
or saved History snapshots. Reload CurvatureModern.html after applying the
patch; the exported MP4/WebM should then use the selected HUD appearance.

### Camera HUD integration validation

The Scene/Compare HUD and the Animation Studio playback overlay use the shared
camera telemetry formatter and appearance model. PNG and MP4/WebM exports paint
the optional telemetry onto each source view after opaque compositing; the
Compare video compositor joins the two completed views afterward. Appearance
and visibility are snapshotted when an export starts. With HUD burn-in disabled,
changing opacity, placement or size must not change PNG bytes or video frame
input; older Animation projects without `cameraHudAppearance` remain valid.

The parallel PNG/video renderers and the retained single-worker PNG
compatibility protocol now forward the same resolved HUD settings. Run
`node --test tests/ModernAnimationHudConsistency.test.js` to exercise the
compatibility protocol, disabled-HUD frame parity, and old-project fallback.
The test mocks the painter/Canvas: a real browser export still needs a visual
check on the installed browser (particularly opacity and corner placement).

### Adaptive Camera HUD contrast

Camera HUD lettering now responds to background opacity. For a fully
transparent HUD background, dark text with a light outline is used; for
an opaque dark background, light text with a dark outline is used. Text
colors transition across intermediate opacity settings. Scene/Compare,
Animation Studio playback, and optional PNG/video HUD burn-in share these
rules. This does not change image pixels when Camera HUD is disabled.

### Compare A/B video output layout

Animation Studio's **Export video** provides a **Compare output** selector when
the current animation is a Compare A/B project. The default **Side-by-side**
produces one MP4/WebM at twice the selected per-view width and height (for
example 960×540 per view becomes 1920×1080). **Separate A/B** produces two
individually encoded, synchronized videos at the selected per-view resolution
in a single ZIP with `manifest.json`, suitable for independent editing. Scene
animations always export one video and do not display the Compare selector.

The output summary updates when the layout, frame size, format or worker count
changes. The displayed RGBA estimate covers the bounded transferred VideoFrame
credit window (up to 32 MiB), **not** total app, optics Canvas or codec memory.
Both modes retain Accurate RK4, the selected HUD burn-in, profiling and Cancel.
