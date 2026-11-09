# Modern Experiment History

Modern's Experiment History now replaces the former **Experiment Library** UI and remains separate from the
working-session autosave and experiment URL mechanism. It never changes the experiment JSON v1 schema,
Scene/Compare renderer, or Legacy state.

## Working session autosave and reload recovery

The live experiment has **one mutable working-session checkpoint**, separate
from the protected/manual/automatic History list. `ModernSessionAutosave.js`
uses IndexedDB `curvature-modern-working-session`, version 1, store `session`,
key `current`; the checkpoint contains a timestamp and validated experiment
JSON v1 (no thumbnail). The legacy `curvature-modern-experiment-v1` localStorage
record remains a synchronous fallback and migration path, with a separate
last-saved timestamp for choosing the newer valid copy. The latest complete
snapshot is written after 550 ms of idle changes. If a redraw or slider edit
is pending, `pagehide`, `beforeunload` and hidden-page handling synchronously
flush the current state to localStorage; an IDB write is queued as well, but
browser shutdown does not guarantee that asynchronous transaction finishes.

On startup, the application waits for IDB selection **before enabling session
writes or drawing the initial scene**. The most recent valid local/IDB checkpoint
is applied through `applyExperiment`; when IDB is newer, the local fallback is
repaired. Invalid IDB checkpoints are rejected without mutating the model or
History, and blocked/unavailable IDB falls back to localStorage. An externally
shared experiment URL has strict precedence and cannot silently load unrelated
local content. After editing that shared link, reloading the **same tab** resumes
the edited working session via an in-tab history marker, without changing the
shared URL; a newly opened incoming URL still wins. The existing auto-generated
URL marker retains its meaning.
Reset experiment clears both copies (the page is not navigated until IDB clear
succeeds). On initial boot neither History nor the working-session checkpoint is
silently created merely because defaults were rendered.

The **History overlay visibility** itself is stored as `historyPanelOpen` in
`curvature-modern-application-preferences-v1` and applied before History data
is loaded; opening and closing via either control updates the preference.
Reset Application Preferences closes it; Reset Workspace Layout does not.
Preview overlays are deliberately not restored. The separate Pinned collapse
state and card-size preference continue working unchanged. Browser-local
persistence is not a backup, and simultaneous tabs are last-writer-wins rather
than merged automatically; keep manual/pinned History checkpoints for important
results.

## History Core and Visual History

- **Save snapshot** is now immediately below the current Scene / Compare
  result, not inside History. Once History finishes loading, the button appears
  only if the current full experiment is absent from the saved records. A
  matching entry shows **Already in History** instead. Equality uses the
  canonical full experiment signature (including camera, objects, A/B physics,
  display and camera animation; the currently selected A/B editor is ignored).
  Automatic History can also satisfy this check; pin such a record in History
  if it must be protected from automatic pruning. Changing only camera position
  can make Save available again without generating an automatic snapshot.
  Saving explicitly stores the full validated experiment and any available
  accurate thumbnail. Manual Save is idempotent against *any* identical prior
  entry, not just the latest; it protects an existing automatic entry rather
  than producing a duplicate. A status message is shown if History is unavailable.
- **History** in the Modern header opens the existing browser-local journal.
- **Automatic snapshots** are scheduled 1.6 seconds after a completed redraw
  whose active physical configuration differs from the last observed baseline.
  Camera-only motion, Camera Animation playback, selecting A/B, section folds,
  normal Scene/Compare switching, and workspace tab navigation do **not** create
  automatic snapshots. The camera pose is nevertheless included in each saved
  experiment. Initial boot never invents an automatic entry.
- The visual gallery shows time, Scene or Compare A/B, source, thumbnail and
  pin state; a native snapshot picker remains available for keyboard users. **Restore selected** fully validates its target,
  persists the current live experiment as a protected recovery point *before*
  changing the model, and then applies the target via existing `applyExperiment`.
  On failed/blocked/quota storage, the live experiment is not replaced. An
  identical existing automatic entry is upgraded to protected if saved manually
  or used as a recovery point.
- **Delete selected** removes an unpinned record after confirmation; individual cards
  use corner icons for **Pin / Unpin** and **Delete**. A pinned record must be
  unpinned before individual or bulk deletion. Checkboxes enable
  multiple selection for **Pin selected** and **Delete selected**; selection
  is in-memory only and will later serve Storyboard. Newest/oldest sorting
  is available. **Clear automatic** only removes unpinned automatic records;
  **Clear all history** asks for explicit confirmation and deletes pinned and
  recovery records too. Manual and recovery entries are never
  automatically purged. A limit of 200 unpinned automatic entries evicts oldest
  automatic records transactionally.
- The local IndexedDB database `curvature-modern-experiment-history`, version
  1, object store `snapshots`, keeps monotonic stable numeric IDs. Entries have
  `version`, `createdAt`, `source`, `pinned`, a full validated `experiment`,
  `signature`, `physicalSignature`, `features` and `thumbnail` (null or a
  bounded, compressed, embedded raster preview). Existing History Core records
  with `thumbnail:null` remain valid and appear with a "No preview" placeholder.
  Browser IndexedDB stays at schema version 1 because the thumbnail slot
  already existed. Browsers may evict site storage;
  these local records are not a backup across browsers/devices or origins.

## History gallery controls and unified Preview

- **One click** on a snapshot selects it; **double-click** on the image or card
  text restores the full experiment. **Enter** on the thumbnail also restores.
  Restore is guarded and records a protected recovery checkpoint before
  changing live physics. Card sizes **S / M / L** are stored in Application
  Preferences, without modifying experiment JSON or IndexedDB entries.
- **Pinned** snapshots appear at the top, in their own collapsible section.
  **Recent** contains only unpinned records, so no entry appears twice. The
  current newest/oldest sort order applies inside each section. Pinned collapse
  state persists in browser Application Preferences and survives reload; it is
  reset by Reset Application Preferences, not Reset Workspace Layout. Pinning
  does not imply Storyboard membership or order.
- Both thumbnail corners contain compact Pin/Unpin and Delete controls. A
  pinned record's Delete control is disabled until it is unpinned. Bulk and
  selected-record deletion reject pinned entries as well. **Clear all history**
  remains a separate explicitly confirmed destructive operation. Checkboxes
  for multi-selection remain available, and interacting with corner controls
  or checkboxes never triggers Restore.
- Hover the **thumbnail** for approximately **400 ms** to open the unified
  Preview. It combines the saved, enlarged real-Canvas image (or an accurate
  missing-image message) with the existing physics inspector: Scene has one
  model column; Compare presents independent A/B surface, atmosphere and
  active refraction parameters, meaningful A/B difference flags, and shared
  camera and objects. Old transparent images are still shown on white.
- The floating Preview is positioned within the viewport, is not clipped by
  the gallery and remains open while the pointer moves over it. **Keep open**
  locks it for inspection. A touch/pen tap on the thumbnail or keyboard
  **Space** opens a persistent Preview. Keyboard focus shows it immediately;
  **Esc** or Close dismisses it, and clicking outside dismisses a locked
  preview. Double-click and Enter continue to restore the snapshot instead.
- Hovering, locking and closing Preview only use already loaded validated
  snapshot data. They do not query IndexedDB, invoke the optics renderer,
  create history records, or change stored experiments. The former View dialog
  and Info/Actions menu have been replaced rather than duplicated.

## Smart History Filters (search and A/B differences)

History now includes an inline **Search** field and **Type**, **Geometry** and
**Atmosphere** dropdowns. Search is case-insensitive and requires every word to
appear somewhere in the name, notes, Scene/Compare classification or active
physical features; multiple words can match different fields. The geometry
filter matches **Globe** or **Flat** and atmosphere covers all supported models,
including Vacuum, Standard, Temperature lapse, Profile transition, Inverse
Temperature, Inverse spherical and Exponential occlusion.

In **Compare A/B**, the physical filters consider either side, but when both
Geometry and Atmosphere are specified **one side must satisfy both**. The
search engine uses cached `ModernExperimentFingerprint.features` or recalculates
it read-only for older records. Inactive controls such as Flat radius or
Vacuum gradients cannot create false physical matches. The filtering step
never rerenders optics, changes experiment state, writes to IndexedDB or creates
History snapshots. **A/B differences** provides independent **Geometry A/B**
and **Refraction A/B** controls, each with Any / Same / Different. Geometry
compares active shapes and Globe radii (but ignores unused Flat radius).
Refraction compares the entire active refractive profile, not only the name
of the atmosphere model: two Temperature lapse configurations with different
gradients match Refraction Different even when Atmosphere is the same model;
inactive Vacuum gradients do not count. These conditions can be combined
with ordinary Geometry/Atmosphere filters and the text query.

An active A/B relation excludes Scene records, even when Type is Scene +
Compare. Choosing Type Scene clears both relations; choosing a relation while
Scene is selected switches Type to Compare automatically. No new data is
stored in History; missing cached relation flags are recalculated read-only.

Filters apply to **Pinned and Recent** together, retaining their sections,
order and absence of duplicate records. The panel reports **Showing N of M
snapshots**; a no-match result gives a clear empty state. Only matching records
appear in the selected-snapshot dropdown. **Clear filters** restores the full
view. Changing any filter clears bulk checkbox selection so hidden records are
not accidentally targeted by a later batch operation. Search refresh is
briefly debounced (150 ms). Choices persist with browser-local Application
Preferences (`historyFilters`); neither exported experiments nor portable
History archives include these UI preferences. Reset Application Preferences
clears the filters; Reset Workspace Layout does not.

Manual check: save a named Scene and Compare snapshots that differ only by
Globe radius, only by temperature gradient, and only by inactive Vacuum
settings. Verify Same/Different and ordinary physical filters agree, that
Scene excludes A/B constraints, and that the same IDs appear in the dropdown and gallery,
reload with History open, then clear filters and verify all original records
remain unchanged. Check that the no-matches message differs from empty History.

## Bulk selection and Animation staging (current; formerly Storyboard shortlist)

The **Select shown** action checks only the currently rendered cards (respecting
filters, sort order, and a collapsed Pinned section). **Clear selection** resets
the temporary checkbox selection. Pin selected and Delete selected operate on
shown checked records only; pinned deletion remains blocked and explicitly
confirmed. Changing a filter or collapsing Pinned clears checkboxes rather
than allowing hidden records to be deleted accidentally.

**Add selected to Animation** copies checked visible snapshot **IDs** into an
ordered staging selection, then opens the separate Animation workspace and
loads the selected states into its in-memory draft. Order follows the displayed
gallery, including oldest/newest sorting and Pinned/Recent grouping; further
picks append without duplication. **Open in Animation** loads the current
staging selection, and **Clear selection** in the staging bar empties it. The
selection is kept in Application Preferences (up to 200 unique History IDs),
with deleted snapshots pruned automatically. It is not itself an animation,
does not rerender optics and is independent of Pin. Pin important automatic
snapshots to protect them from pruning.

Reordering and frame timing now belong to **Animation Studio**, rather than a
second thumbnail strip in History. To gather more frames, use **Choose
snapshots from History** inside Animation, check them and press **Add selected
to Animation**. Reloading the staged selection replaces the draft's frame list
but preserves timing for matching IDs; it does not alter the live experiment.

Manual check: select saved experiments with filters and sorting, send them to
Animation, return to History to add more, and confirm that the Studio timeline
reflects the new staged order without creating a duplicate History shortlist.

## Comparison semantics and future steps

`ModernExperimentFingerprint` derives canonical active physical descriptors
separately from the stored full JSON. For Compare it retains normalized A/B
geometry, atmosphere and refraction plus exact relationship flags
`geometrySame`, `atmosphereSame`, `refractionSame`, `physicsSame`. Inactive
controls such as Flat radius and Vacuum temperature gradient do not create
false physical differences. The exact signature includes the full state (except
which A/B editor was selected), while the physical signature intentionally
excludes camera and UI state for automatic-history triggering.

**Visual History:** screenshots are sampled from completed accurate physical
Canvas renders, never generated by image synthesis. Scene fits one raster within 480×300 while preserving its native aspect
ratio; Compare composes two equal-sized views side by side (up to 960×300)
with labels. The physical painter clears its Canvas to **transparent**, while
the visible Modern viewport has a **white CSS background**. History now
composites the rendered pixels and optional guide overlays over that same
opaque white backdrop; otherwise transparent pixels reveal the gallery's navy
placeholder color, making the entire image appear dark blue. No dark
letterboxing or automatic cropping is introduced. Saved transparent thumbnails
also display over white in the gallery and unified Preview without changing
IndexedDB. Earlier screenshots encoded with opaque blue fill cannot be
repaired by this display-only fallback; recapture those states after Restore.
A screenshot is accepted
only if the captured renderer state (shared camera/objects and the selected
physics) matches the full saved experiment. Independently updated Compare A
and B canvases are checked separately, so a stale viewport cannot masquerade
as a valid pair. If a canvas is stale, unavailable, tainted, or the browser
cannot export it, the complete experiment still saves with `thumbnail:null`.
Atmospheric presentation image and sharp guide layers are combined when
available. UI chrome and the optional DOM-only temperature column are not
part of the raster thumbnail. The gallery previews an enlarged saved image alongside saved physics settings
**without** changing the live model or retracing optics.

Pinning, sorting, manual/bulk deletion and screenshot inspection use the
existing stored records; the experiment JSON v1 serializer is unchanged.
Scene/Compare and active A/B filters are available in History. Grouped
storyboard selection is reserved for the next stage.
A storyboard can refer to
stable history IDs; it must explicitly resolve deleted references, and should
only interpolate parameters for which a physically meaningful transition is
specified. A screenshot crossfade is not a physical optics calculation.

## Smoke test in Opera

1. Open Modern and use **Save snapshot** below Scene (or Compare) output. Open History, change surface/atmosphere,
   and wait for an automatic snapshot. Moving only the camera must not create
   more automatic snapshots.
2. Save Compare A/B with different physics for A and B. Hover its thumbnail:
   the unified Preview must show the larger, correctly white-background image,
   both model configurations and A/B differences; the live scene must not change.
   Test a saved snapshot without a thumbnail, as well as an older transparent
   screenshot if one is available.
3. Move the pointer from the thumbnail onto the Preview, activate **Keep open**,
   move away, then use Esc or Close. Test near the right/bottom window edges.
   With keyboard focus on a thumbnail, use **Space** for persistent preview
   and **Enter** for Restore; on a touch device, tap once for preview. A desktop
   single click selects and double-click restores via protected recovery.
4. Pin two snapshots and check that both move into **Pinned** above **Recent**,
   with no duplicates. Collapse Pinned and reload: the fold state should persist.
   Unpin one snapshot and check that it returns to Recent. Change S/M/L and
   verify the card size preference also persists.
5. Try the Delete icon on a pinned snapshot (disabled), unpin and delete it
   (confirmation required). Test that batch deletion rejects checked pinned
   records, and that clicking/holding corner icons or checkboxes never
   restores. Test Clear automatic separately from the explicit Clear all action.
6. Check that History inspection does not trigger expensive physical redraws,
   that Scene/Compare selection continues to work, and that the live viewport
   remains unaffected by merely opening the Preview.

## Working-session reload checks

1. Change a Scene camera value and immediately reload, before 550 ms have
   elapsed; the exact value should return. Repeat with Compare A/B physics,
   object parameters and a camera keyframe.
2. Open History, reload, and verify History remains visible with the same
   pinned fold and card density. Close History and reload; it should stay closed.
3. Open an explicit shared experiment URL while a different working session
   exists: the URL's physics wins and the incoming URL is not rewritten.
4. Use Reset experiment, reload and verify defaults rather than the previous
   working state. Reset Application Preferences separately and verify only the
   UI choices (including History visibility) reset.
5. Check that restoring a working session does **not** create a new auto History
   record. If IndexedDB is unavailable, localStorage is the intended fallback.

## Named snapshots and descriptions

Use the small **✎** action beneath a History thumbnail to open the snapshot
editor. A snapshot can have an optional **name** (up to 120 characters) and
**description** (up to 1000 characters). Save details to update that particular
IndexedDB history record. Empty name falls back to the automatic Scene/Compare
physics label; the classification is retained in the unified Preview even for
named snapshots. Notes appear in Preview, without increasing compact card size.
The selected-snapshot dropdown also displays user names.

Names and descriptions belong to the **history record**, not the version-1
experiment JSON, its full-state fingerprint, physical signature or screenshot.
Editing annotations never creates a snapshot, invokes the optics renderer,
changes pinned order, or restores the experiment. Older records with no
metadata continue to render with the generated physics label; no IndexedDB
schema migration is necessary. Deduplicating a manually saved experiment
preserves its existing annotations and stable history ID.

Adding a name or description to an **automatic** entry promotes it to a
long-lived manual record so auto-pruning/"Clear automatic" will not silently
remove the annotated work. This does **not** set Pin: Pinned remains a gallery
selection for future Storyboards. Clearing annotations later does not demote
that record back to automatic history.

## Unified archive and portable JSON

The separate **Experiment Library** panel was retired. History is now the
single interface for selecting, restoring, naming and managing saved Modern
Scene/Compare states. **Save snapshot** stays below the active experiment;
manual snapshots are kept as long-lived records. The former Library reader
remains in the source only for migration and compatible plain experiment JSON.

History has four portable actions:

- **Export selected snapshot** exports the chosen History record (use the
  selected-snapshot dropdown first). **Export all snapshots** backs up the
  journal, including protected manual/recovery and automatic records. Both use
  `format: "curvature-modern-history"`, `version: 1` and a `snapshots` array.
  Each entry contains validated version-1 `experiment`, optional `name` and
  `description`, `pinned`, `createdAt` and an existing `thumbnail` or `null`.
  History IDs and private storage keys are intentionally *not* portable.
- **Import JSON** accepts either the History archive or an older bare Modern
  experiment JSON. Input is strictly validated (up to 1000 records and a
  bounded JSON payload) before making any writes. A whole import is committed
  in one IndexedDB transaction; invalid data changes nothing. Identical
  full-state+name+description records are reused, while distinct named copies
  remain separate even when their physical state is identical. Imported items
  are durable manual entries. Import does not replace the current live model;
  select the imported record and use Restore when ready.
- **Export current experiment JSON** retains the original plain v1 JSON format
  and deliberately excludes History annotations, for compatibility with older
  Curvature and direct `?experiment=` URLs.

**One-time legacy migration:** on History startup, previously saved names and
experiments from `localStorage['curvature-modern-library-v1']` are copied into
IndexedDB as *manual, unpinned* records; distinct names are preserved, even
for identical physics. The migration marker is written only after successful
commit. Import is idempotent, so a crash before the marker is safe to retry.
The original localStorage library is never deleted or rewritten. If legacy
storage is malformed, unavailable, or IndexedDB is blocked, History continues
operating when possible and reports the migration problem; old data is retained
for troubleshooting. Pin still means gallery selection, not long-term
retention, and future Storyboards should reference stable in-browser IDs.

**Backup caution:** History and thumbnails are browser-local until exported.
An exported archive can be large when it contains many real-Canvas thumbnails;
large files may exceed the importer size limit. URLs and bare experiment JSON
are not complete History backups.


## Animation Studio: compatibility foundation

The ordered Storyboard shortlist remains a selection of local History IDs; it
is **not** yet an animation project. The new pure Animation Studio modules
convert selected full snapshots into a self-contained, validated animation
project with independent embedded `baseExperiment`. Snapshot IDs inside the
project are provenance only, so pruning the source History cannot change
already-created project data. No new UI or persistent animation-project store
is added by this stage. See [Animation Architecture Research](modern-animation-research.md).

## Animation Studio draft editor (original #140.12.120.2 behavior; superseded below)

Under the ordered **Storyboard shortlist**, History now contains an **Animation
Studio · Draft editor**. Select at least two snapshots in History using the
existing checkboxes and **Add to storyboard list**, then select **Load History
shortlist** in Studio. This copies the current snapshot states into an
in-memory draft, independent of subsequent edits, deletion and pruning of the
History source records. The shortlist remains unchanged when Studio frames
are reordered or removed. To include newly selected snapshots, load the
shortlist again (existing frame timings for matching History IDs are retained).

Alternatively select **Import Camera Animation** to copy the active Scene or
Compare experiment's existing Camera Animation keyframes, including their
camera poses, names and timing. Import does not replace the live experiment,
mutate the original camera sequence, or add anything to History. The previous
Camera Animation editor and its playback controls remain intact for now.

The editor supports project name and description, Auto-detect / Camera motion /
one physical parameter, the explicit physical viewport (Scene or Compare A/B)
and either curvature or temperature gradient. It provides per-frame names,
incoming travel duration, arrival hold, easing, reorder and removal. The first
frame has no incoming travel. Validation evaluates **all** frames with
`ModernAnimationCompatibility` and shows structured offending paths, such as
`camera.Height` and `scene.temperatureProfile.gradientKPerKm`. Invalid or
ambiguous combinations cannot be prepared. The **Prepare project** button
uses `ModernAnimationProject.create` to produce an independent, validated
project; for developer inspection it is accessible through
`CurvatureModernApp.getAnimationStudioProject()` after preparation.

**Scope limit:** the editor and prepared project live **only in page memory**.
Only the preexisting ordered shortlist is persisted as a browser preference.
There is no Play, Seek, accurate frame rendering, permanent Animation Project
store or portable animation export yet; those are upcoming stages. Reloading
the page resets the editor draft. History snapshot IDs in a prepared project
are optional provenance, not runtime dependencies.

## Compact Storyboard and Animation Studio editor (original #140.12.120.2.1 behavior; superseded below)

The **Storyboard shortlist** now presents an ordered, horizontally scrolling
strip of compact screenshot cards, using the existing saved History thumbnails.
Each card includes its ordinal, user-given name and a brief physical summary:
Scene or Compare A/B geometry, atmosphere and shared camera height. Long names
have a tooltip. The arrow and remove buttons still edit only the shortlist;
renaming, restoring or mutating the original experiment is not performed by
these controls. A missing thumbnail has an explicit **No screenshot** label:
listing an experiment never re-renders it merely to invent a thumbnail.

The **Animation Studio** is constrained to a readable maximum width. Its
horizontal timeline displays the same saved thumbnails and marks the selected
keyframe with a visible border and `aria-pressed` state. Only **one selected
frame** has expanded timing and naming fields; move/remove controls act on
that frame. Selection is maintained across name, timing and ordering changes,
and moves to a surviving adjacent frame if the selected frame is removed.
The strip can scroll independently of the page. Imported Camera Animation
frames do not have History screenshots and are labeled accordingly rather
than showing an unrelated saved image. On narrow screens the cards remain
small and horizontally scrollable instead of stretching to the screen width.

This change is **presentation-only**: it does not alter the compatibility
validator, `ModernAnimationProject`, existing History ID semantics or live
physics. The Studio draft still lives in memory, with no playback or export.


## Current Animation workspace and History overlay

**Scene / Compare / Animation / Demos** are the four visible Modern tabs.
Animation is **a UI workspace, never an experiment physics mode**: the
underlying saved `state.mode` stays Scene or Compare, and changing to Animation
does not modify camera, atmosphere, surface, objects, session JSON, History or
rendered optical data. Returning to the physical workspace refreshes its
existing viewport. The last UI tab is kept in Application Preferences;
explicit shared experiment URLs retain their own Scene/Compare context.

History is a bounded, scrollable **overlay**, accessible from any workspace
through the header or **Choose snapshots from History** in Animation. The
backdrop, Close button and Escape close it without shifting the current
viewport down. Selection is handed to Animation by **Add selected to
Animation**. The redundant permanent Storyboard shortlist strip and its
second rendering of thumbnails have been removed; its ordered, stable-ID
staging data survives for existing users and remains independent of the owned
Animation draft. The staging bar shows the number of selected snapshots and
provides Open/Clear actions.

Animation Studio presents a larger **saved-thumbnail preview** of the selected
keyframe above one horizontal timeline and the selected frame's fields.
Imported camera keyframes that have no saved screenshot show an explicit
placeholder. A saved thumbnail is not a recomputation of intermediate optical
frames. Playback, persistent Animation Project storage and video export are
still not provided in this stage.

## Drag-and-drop between History and Animation Studio

**Animation → Choose snapshots from History** now toggles a compact, docked
**Snapshot Picker** beside the Animation Studio timeline. It reads exactly the
same saved History records and screenshots as the full overlay, with a local
text search; no new previews are rendered, no experiment is restored, and no
second snapshot database is introduced. **Full History** still opens the
complete manager for pinning, renaming, import/export and advanced filters.
The header History action remains available in every workspace.

- **Reorder:** drag a timeline keyframe by its grip into any gap, or onto the
  left/right half of another frame. The blue insertion indicator shows the
  destination. Existing Up/Down buttons remain available for keyboard users.
- **Insert:** drag a snapshot from the picker into a timeline gap; its saved
  experiment is copied into the in-memory Studio draft at that position. To
  insert a group, check several picker cards and drag a checked card; the group
  follows its displayed order (pinned first), or choose **Add checked**. Small
  `+` controls in the gaps insert checked snapshots at an exact position.
- **Touch:** hold and move a grip (⠿) to drag via Pointer Events; tapping the
  checkbox plus **Add checked** is the non-drag fallback. The timeline scrolls
  horizontally, including near-edge assistance during drag.
- **De-duplication:** a History snapshot already in the draft is not inserted
  again. Imported Camera Animation frames remain intact when saved snapshots
  are appended. The old **Load staged snapshots** action still explicitly
  replaces the timeline when used, but the full History **Add selected to
  Animation** action now appends rather than replacing an active draft.
- **Validation:** reordering and inserting change only the in-memory frame
  list, not History, the live Scene/Compare experiment, or its optical render.
  `ModernAnimationCompatibility` still checks the entire resulting sequence;
  invalid combinations are shown and cannot be prepared.

Shortlist IDs continue to be stored as legacy staging preferences, while the
Studio draft itself is not saved across reloads. Playback and permanent
animation-project storage remain out of scope. This interface uses native
HTML Drag and Drop on desktop plus a touch/pen Pointer Events fallback;
interactive Opera checks are still needed to confirm its look and feel.


## Isolated Camera Animation playback

After arranging compatible camera keyframes in Animation Studio, click
**Prepare project**. Camera projects open a dedicated optical preview with
Play, Pause, Stop and timeline seeking. Scene experiments render a single
physical Canvas; Compare A/B experiments render both models independently
using the same sampled camera. The original Scene/Compare live canvases and
working session are never used to paint this preview. The Studio draft still
lives only in memory; changing frames invalidates the prepared project.

Optical render performance may be below real-time. Timeline position follows
elapsed clock time, so slow frames are skipped rather than altering animation
duration. Compatible Fast optical modes are explicitly labeled approximate;
other profiles use Accurate CPU optics and may be slow. Background tabs and
workspace switches pause the player. Animation of one physical parameter,
permanent Animation Project saving, and video export remain future stages.
