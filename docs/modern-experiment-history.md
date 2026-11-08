# Modern Experiment History

Modern's Experiment History is separate from **Experiment Library** and from the
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

The **History panel visibility** itself is stored as `historyPanelOpen` in
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
Semantic Scene/Compare and A/B **filters** are reserved for the next stage.
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

The existing Experiment Library JSON export and URLs serialize **experiment
physics only**, not History annotations. Portable export/import of annotated
History records belongs to the upcoming Library/History consolidation; do not
assume that exporting a bare experiment JSON includes name or description.
