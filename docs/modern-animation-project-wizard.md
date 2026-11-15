# Creating a constrained Animation Project

`Animation → Animation Library → New project` opens the five-step **Project v2
wizard**. The old v1 projects and independent autosaved editor workspaces
remain readable and editable; the wizard does not migrate them.

1. **Animation type.** `Camera Motion` allows changes only to supported camera
   pose/orientation/zoom. `Physics Transition` allows one physical channel and
   locks camera/zoom, scene and all other physics. `Experimental` accepts any
   valid experiment but does not enable video rendering or hard cuts.
2. **Reference experiment.** Choose a saved History snapshot or explicitly
   capture the *current* Scene/Compare experiment. Neither option restores or
   edits the live experiment. The complete validated reference is embedded
   in the project, independent of the later existence of its History record.
3. **Allowed changes.** For Physics Transition choose an *active* curvature or
   temperature-lapse gradient channel in Scene, Compare A or B. Available
   choices are generated with `ModernAnimationContract.create()`, so unsupported
   or inactive channels cannot be selected. Camera/Experimental show their
   relevant rules instead of meaningless selectors.
4. **Initial keyframes.** By default, the reference is the first frame. Its
   inclusion may be switched off to create an empty project. Additional
   snapshots can be searched and checked in order; incompatible snapshots are
   hidden by default and can be revealed with explanations. Changing mode,
   reference or physical channel clears stale additional selections.
5. **Project details.** Supply a name and optional description. **Create
   project** first backs up the previous editor workspace, then creates a v2
   working draft and attempts a named Animation Library save. On library-save
   failure, the independently autosaved draft remains for a manual retry.

The wizard is a transient form and does not have its own reload recovery;
**completed** projects and drafts use the existing storage/recovery paths. Its
candidate decisions are always rechecked on creation, including deleted or
changed History entries and full-sequence renderer compatibility. A malformed
selection never silently drops a keyframe or overwrites the current draft.

The Animation Studio now rejects incompatible snapshot insertions into v2
drafts **before** modifying the working timeline, whether inserted by the
picker or drag-and-drop. The legacy *Replace with Camera Animation* action is
not offered for locked contracts. Compatible v1 drafts still use their former
editor and import behavior.

## Limits and next stage

The existing **Snapshot Picker** remains independently filterable but is not
yet pre-filtered by a project contract. An incompatible option may still be
visible there; inserting it is rejected with an error. A subsequent stage will
show only compatible entries by default, with reasons and an optional
incompatible view. Changing the declared project contract after creation is
not supported. No new physics interpolation, media exporter or IndexedDB
migration is introduced here. Experimental remains a save-only collection.

See [Animation Project contracts](modern-animation-contract.md) for the
underlying validator, data format and interpolation limitations.
