# Modern Experiment History

Modern's Experiment History is separate from **Experiment Library** and from the
existing URL/localStorage save. It never changes the experiment JSON v1 schema,
Scene/Compare renderer, or Legacy state.

## History Core and Visual History

- **History** in the Modern header opens a minimal list. **Save snapshot now**
  stores the full validated experiment (camera, two object groups, independent
  Compare A/B physics, selected editor, saved camera poses/sequence, display).
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
  identical latest automatic entry is upgraded to protected if saved manually
  or used as a recovery point.
- **Delete selected** removes one record after confirmation; individual cards
  also provide **View**, **Pin / Unpin** and **Delete**. Checkboxes enable
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

## History gallery controls

- **One click** on a snapshot image or card text selects it; **double-click**
  restores the full experiment. Pressing **Enter** while the thumbnail button
  has focus also restores the snapshot. The existing **Restore selected** button
  uses the same guarded path, with a protected recovery checkpoint before any
  change to live physics. Restore actions are serialized to avoid overlapping
  operations on repeated double-clicks.
- Card sizing is **S / M / L** (compact by default). S uses small thumbnails
  and **⋯ Actions** for View, Pin/Unpin and Delete; M and L expose these actions
  below each card. Native checkbox bulk selection remains available at every
  size. A double-click on action buttons, menus or selection checkboxes never
  restores an experiment.
- Card density is a validated browser-local Application Preference. Switching
  size does not reread IndexedDB, recalculate optics or modify the experiment
  JSON. Resetting application preferences returns to S; workspace layout reset
  does not affect card density. The grid remains responsive on narrow screens.

## Snapshot Inspector (read-only)

- Hover a Scene or Compare history card for approximately **350 ms**. The
  floating detail card shows the captured **surface** (Globe with radius or
  Flat), **atmospheric model** and only its relevant temperature/gradient,
  transition, inversion or occlusion parameters. Compare displays independent
  A/B columns and their semantic geometry/atmosphere/refraction relationship;
  Scene has one column. Camera height/orientation and shared object counts/types
  appear underneath.
- The tooltip stays open while the pointer moves onto it and shifts within the
  viewport near right/bottom edges. Keyboard focus on the snapshot thumbnail
  opens it immediately; **Esc** closes it. **ⓘ Info** on every card pins the
  inspector for touch users, with a Close button. Ordinary click still selects,
  and double-click still restores; clicking Info never triggers Restore.
- The inspector uses the saved, validated experiment and existing fingerprint
  metadata from the already loaded history list. **It does not query IndexedDB,
  recalculate optics or change the experiment** while opening. It supports older
  records without thumbnails and adds no persistent fields or migration.

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
with labels. No dark letterboxing is drawn by the thumbnail composer; any
remaining dark field comes from the source physical Canvas itself. A screenshot is accepted
only if the captured renderer state (shared camera/objects and the selected
physics) matches the full saved experiment. Independently updated Compare A
and B canvases are checked separately, so a stale viewport cannot masquerade
as a valid pair. If a canvas is stale, unavailable, tainted, or the browser
cannot export it, the complete experiment still saves with `thumbnail:null`.
Atmospheric presentation image and sharp guide layers are combined when
available. UI chrome and the optional DOM-only temperature column are not
part of the raster thumbnail. The gallery previews an enlarged saved image
**without** changing the live model or retracing optics.

Pinning, sorting, manual/bulk deletion and screenshot inspection use the
existing stored records; the experiment JSON v1 serializer is unchanged.
Semantic Scene/Compare and A/B **filters** are reserved for the next stage.
A storyboard can refer to
stable history IDs; it must explicitly resolve deleted references, and should
only interpolate parameters for which a physically meaningful transition is
specified. A screenshot crossfade is not a physical optics calculation.

## Smoke test in Opera

1. Open Modern → History. Save a Scene state, change the surface/atmosphere,
   and wait briefly for one auto-history entry. Move the camera several times:
   no new auto-history entry should appear.
2. Switch to Compare, change A or B physical parameters, and inspect the new
   Compare A/B record. Switching only the selected model editor should not
   create an entry.
3. Save manually after an accurate Scene render and confirm a real thumbnail.
   In Compare, change only A, then B; check that a new composite thumbnail
   contains the **current** A and B rather than a stale side. If Fast Preview
   is active or an accurate render has not completed, expect "No preview".
4. Try the **S / M / L** gallery size selector, reload and confirm it persists.
   Hover over Scene and Compare cards, confirm the matching physics summary;
   use Info and Esc, and test that hovering and clicking Info do not restore.
   Near the right/bottom viewport edge confirm the tooltip remains visible.
   Single-click a card to select it, double-click its thumbnail to restore;
   confirm no unintended duplicate recovery points. Double-click on checkbox,
   View, Pin, Delete or the compact **⋯ Actions** menu: none should restore.
   Click **View** for read-only enlargement; confirm that the live experiment
   does not change. Pin a record, sort newest/oldest, select multiple cards and
   delete them; verify confirmations. Test Clear automatic and separately
   Clear all (including protected recovery records).
5. Restore the currently active snapshot twice: confirm no recovery entries
   are created. Then restore a different state and confirm an already-saved
   matching state is reused rather than duplicated as recovery.
6. Change the camera and physical inputs; restore a previous snapshot. Check
   Scene/Compare mode, camera and A/B models. Restore the recovery entry to
   return to the state before restoration. Reload and check persistence.
   If IndexedDB is blocked, History reports an error without breaking rendering.

The numerical and simulated-IDB integration suites do not replace actual
Opera UI/IndexedDB testing; no browser visual validation is claimed here.
