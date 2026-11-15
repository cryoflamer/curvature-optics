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
- The visual gallery shows saved thumbnails grouped into **Pinned** and
  **Recent**. Click (or keyboard-activate) a card to select it; the fixed
  **Selected experiment** panel displays its saved image, names/notes, Scene or
  Compare A/B physical parameters, camera and objects. There is no duplicate
  snapshot dropdown or hidden double-click Restore action.
- **Restore experiment** on that panel validates the selection, stores the
  current live experiment as a protected recovery point **before** replacing
  it, and closes History only after success (including an already-matching
  snapshot). If the recovery write fails, the live experiment is unchanged and
  the error remains visible beside the Restore controls.
- **Pin/Unpin** (pushpin) and **Delete** (cross) are permanently visible on
  each thumbnail card, including in the compact gallery layout. These actions
  never select a card or restore an experiment. Pinned snapshots show an active
  pin, and their delete cross remains visible but disabled until unpinned.
  Individual Delete always asks for confirmation; cancellation is a no-op.
  **Edit details** and **Export snapshot** remain in the selected-experiment
  panel. **Manage** reveals checkbox-based batch selection (Pin checked,
  Delete checked and Add selected to Animation);
  leaving Manage clears temporary checkbox selection. The separate **More
  history tools** section contains Import/Export all, Clear automatic and
  Clear all history. The latter requires confirmation and deletes protected
  records; Clear automatic only deletes unpinned automatic entries. Automatic
  retention remains bounded to 200 unpinned entries.
- The local IndexedDB database `curvature-modern-experiment-history`, version
  1, object store `snapshots`, keeps monotonic stable numeric IDs. Entries have
  `version`, `createdAt`, `source`, `pinned`, a full validated `experiment`,
  `signature`, `physicalSignature`, `features` and `thumbnail` (null or a
  bounded, compressed, embedded raster preview). Existing History Core records
  with `thumbnail:null` remain valid and appear with a "No preview" placeholder.
  Browser IndexedDB stays at schema version 1 because the thumbnail slot
  already existed. Browsers may evict site storage;
  these local records are not a backup across browsers/devices or origins.

## History gallery and selected-experiment inspector

- **One click or keyboard activation** on a snapshot thumbnail selects it;
  the currently selected card is highlighted. **Restore experiment** is a
  separate, clearly labelled action in the persistent details panel. Neither
  double-click nor Enter restores an experiment implicitly. There is no
  `Selected snapshot` dropdown. The first visible card is selected when the
  gallery opens, but no physical state changes until Restore is pressed.
- **Pinned** snapshots form a collapsible section above **Recent**, without
  duplicates. The preferred S/M/L card size, Pinned-collapse state, sorting
  and filters remain browser-local display preferences. The inspector always
  corresponds to a visible card; a filtered-out or collapsed selection is
  replaced by the first visible match. If no records match, Restore is disabled
  and the inspector displays an empty state.
- The inspector displays the original persisted screenshot (white background
  for older transparent previews) or an explicit missing-image message, plus
  the saved physical classification and active Scene/Compare parameters. It
  does not create new images or modify the current experiment. It replaces the
  old floating preview in History; Animation Studio retains its separate
  thumbnail inspection controls.
- **Pin/Unpin** and **Delete** are on every visible card, not duplicated in
  the side inspector. Pin updates the Pinned/Recent grouping immediately;
  pinning a card also expands Pinned if that section was collapsed so the card
  remains visible. The Delete cross is disabled for pinned snapshots and asks
  for confirmation on unpinned ones. **Edit details** opens the metadata editor,
  and **Export snapshot** acts on the selected card. Restore closes History
  only on success; failures leave it open with an error beside Restore.
  The live experiment is backed up to protected recovery before replacement.
- **Manage** toggles the group-selection workspace; only this mode renders
  checkboxes and group actions. To collect History records into Animation,
  enter Manage, check the cards and use **Add selected to Animation**. The
  existing chronological staging list is preserved for compatibility, but
  frame editing and timing belong to Animation Studio.

## Smart History Filters (search and A/B differences)

History has an always-visible **Search experiments** field and collapsible
**Advanced filters** with **Type**, **Geometry** and **Atmosphere** dropdowns. Search is case-insensitive and requires every word to
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
snapshots**; a no-match result gives a clear empty state. Only matching records appear in the gallery and the selection panel follows
visible results. **Clear filters** restores the full view. Changing any filter clears bulk checkbox selection so hidden records are
not accidentally targeted by a later batch operation. Search refresh is
briefly debounced (150 ms). Choices persist with browser-local Application
Preferences (`historyFilters`); neither exported experiments nor portable
History archives include these UI preferences. Reset Application Preferences
clears the filters; Reset Workspace Layout does not.

Manual check: save a named Scene and Compare snapshots that differ only by
Globe radius, only by temperature gradient, and only by inactive Vacuum
settings. Verify Same/Different and ordinary physical filters agree, that
Scene excludes A/B constraints, and that the inspector always shows a visible card,
reload with History open, then clear filters and verify all original records
remain unchanged. Check that the no-matches message differs from empty History.

## Bulk selection and Animation staging (current; formerly Storyboard shortlist)

Enter **Manage** to expose checkboxes and group actions. The **Select shown**
action checks only the currently rendered cards (respecting
filters, sort order, and a collapsed Pinned section). **Clear selection** resets
the temporary checkbox selection. Pin selected and Delete selected operate on
shown checked records only; pinned deletion remains blocked and explicitly
confirmed. Changing a filter or collapsing Pinned clears checkboxes rather
than allowing hidden records to be deleted accidentally.

**Add selected to Animation** copies checked visible snapshot **IDs** into an
ordered staging selection, then opens the separate Animation workspace and
loads the selected states into its in-memory draft. Order follows the displayed
gallery, including oldest/newest sorting and Pinned/Recent grouping; further
picks append without duplication. **Add collected to Animation** appends
missing snapshots from the old staging selection (without replacing existing
Studio frames), and **Clear selection** empties that History-only collection. The
selection is kept in Application Preferences (up to 200 unique History IDs),
with deleted snapshots pruned automatically. It is not itself an animation,
does not rerender optics and is independent of Pin. Pin important automatic
snapshots to protect them from pruning.

Reordering and frame timing now belong to **Animation Studio**, rather than a
second thumbnail strip in History. To gather more frames, use **Choose
snapshots from History** inside Animation, check them and press **Add checked**.
The History collection is not displayed as a second gallery inside Studio.
Adding collected snapshots retains all existing keyframes and timing; it does
not alter the live experiment.

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

1. Open Modern and use **Save snapshot** below Scene (or Compare) output.
   Change surface/atmosphere and wait for an automatic snapshot. Moving only
   the camera must not create another automatic snapshot.
2. Save Compare A/B with different physics for A and B. Open History and click
   the card: the **Selected experiment** panel must show the original enlarged
   image, both model configurations and A/B differences, without changing the
   live scene. Try an entry without a thumbnail and an older transparent image.
3. Press **Restore experiment** on a snapshot different from the active scene.
   The current scene must be recorded as protected recovery and History must
   close after the new scene loads. Reopen History and try the identical
   snapshot; this also closes the dialog, without creating new history records.
   Simulate a failed recovery write: the live scene must be unchanged and the
   error visible beside the Restore button.
4. Check that clicking, double-clicking or keyboard-activating cards never
   restores by itself. Click another card and verify the side panel tracks
   selection immediately. Search for a missing name: the selection must clear
   and Restore must be disabled, without deleting history records. Keyboard
   Tab + Enter on a card should only select it.
5. Use the visible pushpin on two cards; check both move into **Pinned** above
   **Recent** without altering the current scene or changing the selected card.
   Collapse Pinned and reload to check the saved fold preference. Pin a Recent
   card with Pinned collapsed: it should automatically expand so the card stays
   visible. Unpin a snapshot and verify that it returns to Recent. Change S/M/L
   and check both corner actions remain visible and card size persists.
6. Confirm the Delete cross is visible but disabled when pinned, then unpin
   and delete using the card cross. Cancel the confirmation once: the snapshot
   must remain. Confirm a second time: only the selected record is removed.
   Enter **Manage** to expose checkboxes, test bulk Pin, Delete (pinned
   entries must be blocked) and **Add selected to Animation**.
   Exit Manage and verify checkboxes disappear. Separately test **More history
   tools → Clear automatic** and **Clear all history**, with confirmation.
7. Verify that inspecting History does not trigger optical redraws and that
   Scene/Compare switching, retained animation picks and current scene remain
   unaffected by card selection alone.

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

Choose a History card and press **Edit details** in the selection panel to
open the snapshot editor. A snapshot can have an optional **name** (up to 120 characters) and
**description** (up to 1000 characters). Save details to update that particular
IndexedDB history record. Empty name falls back to the automatic Scene/Compare
physics label; the classification is retained in the selected-experiment inspector even for
named snapshots. Notes appear in the inspector without increasing card size.
The gallery uses the saved name when present.

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

- **Export snapshot** exports the selected History card from its detail panel. **Export all snapshots** backs up the
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

## Animation Studio draft editor (original #140.12.120.2 behavior; historical, superseded)

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
ambiguous combinations cannot be prepared. At this original stage the **Prepare project** button
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
Animation draft. The History collection bar shows the number of collected snapshots and
provides Add collected/Clear actions; the Studio editor no longer duplicates
this collection as staged cards.

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
  are appended. The **Load staged snapshots** replacement action has been removed;
  **Add selected to Animation** in History and **Add checked** in the picker
  append rather than replace an active draft. **Replace with Camera Animation…**
  is a separate, clearly named operation requiring confirmation.
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
**Preview animation**. It does not save a named library project. Camera projects open a dedicated optical preview with
Play, Pause, Stop and timeline seeking. Scene experiments render a single
physical Canvas; Compare A/B experiments render both models independently
using the same sampled camera. The original Scene/Compare live canvases and
working session are never used to paint this preview. The Studio draft is independently autosaved in the browser; changing frames
invalidates the preview. Use **Save project** in Animation Library to create
a named project, which immediately appears as a selected card with an **Open** button.

Optical render performance may be below real-time. Timeline position follows
elapsed clock time, so slow frames are skipped rather than altering animation
duration. Compatible Fast optical modes are explicitly labeled approximate;
other profiles use Accurate CPU optics and may be slow. Background tabs and
workspace switches pause the player. Animation of one physical parameter,
permanent Animation Project saving, and video export remain future stages.
