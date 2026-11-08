# Modern Experiment History

Modern's Experiment History is separate from **Experiment Library** and from the
existing URL/localStorage save. It never changes the experiment JSON v1 schema,
Scene/Compare renderer, or Legacy state.

## Current History Core

- **History** in the Modern header opens a minimal list. **Save snapshot now**
  stores the full validated experiment (camera, two object groups, independent
  Compare A/B physics, selected editor, saved camera poses/sequence, display).
- **Automatic snapshots** are scheduled 1.6 seconds after a completed redraw
  whose active physical configuration differs from the last observed baseline.
  Camera-only motion, Camera Animation playback, selecting A/B, section folds,
  normal Scene/Compare switching, and workspace tab navigation do **not** create
  automatic snapshots. The camera pose is nevertheless included in each saved
  experiment. Initial boot never invents an automatic entry.
- The lightweight list shows time, Scene or Compare A/B, source and whether
  the entry is protected. **Restore selected** fully validates its target,
  persists the current live experiment as a protected recovery point *before*
  changing the model, and then applies the target via existing `applyExperiment`.
  On failed/blocked/quota storage, the live experiment is not replaced. An
  identical latest automatic entry is upgraded to protected if saved manually
  or used as a recovery point.
- **Delete selected** removes one record after confirmation; **Clear automatic**
  only removes unpinned automatic records. Manual and recovery entries are never
  automatically purged. A limit of 200 unpinned automatic entries evicts oldest
  automatic records transactionally.
- The local IndexedDB database `curvature-modern-experiment-history`, version
  1, object store `snapshots`, keeps monotonic stable numeric IDs. Entries have
  `version`, `createdAt`, `source`, `pinned`, a full validated `experiment`,
  `signature`, `physicalSignature`, `features` and `thumbnail:null`.
  There are intentionally no thumbnails yet. Browsers may evict site storage;
  these local records are not a backup across browsers/devices or origins.

## Comparison semantics and future steps

`ModernExperimentFingerprint` derives canonical active physical descriptors
separately from the stored full JSON. For Compare it retains normalized A/B
geometry, atmosphere and refraction plus exact relationship flags
`geometrySame`, `atmosphereSame`, `refractionSame`, `physicsSame`. Inactive
controls such as Flat radius and Vacuum temperature gradient do not create
false physical differences. The exact signature includes the full state (except
which A/B editor was selected), while the physical signature intentionally
excludes camera and UI state for automatic-history triggering.

The data model reserves `thumbnail` for the future **Visual History** gallery.
The next UI pass can add Scene and composite A/B image capture, fast inspection,
pinning and filters without reserializing physics. A storyboard can refer to
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
3. Save manually; change the camera and physical inputs; restore a previous
   snapshot. Check Scene/Compare mode, camera and A/B models. Restore the
   recovery entry to return to the state before restoration.
4. Reload; confirm snapshots survive. Clear automatic records; verify that
   manual/recovery snapshots remain. If browser storage is blocked, the
   history panel reports an error without breaking Modern rendering.

The numerical and simulated-IDB integration suites do not replace actual
Opera UI/IndexedDB testing; no browser visual validation is claimed here.
