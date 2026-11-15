# Creating a constrained Animation Project

`Animation → Animation Library → New project` opens the five-step **Project v2
wizard**. The old v1 projects and independent autosaved editor workspaces
remain readable and editable; the wizard does not migrate them.

1. **Animation type.** `Camera Motion` allows changes only to supported camera
   pose/orientation/zoom. `Physics Transition` allows one physical channel and
   locks camera/zoom, scene and all other physics. `Experimental` accepts any
   valid experiment but does not enable video rendering or hard cuts.
2. **Reference experiment.** Use **Choose reference from History** to open the
   **existing History panel**, with its real search, physical filters, cards,
   and detailed inspector. Choose a card, then click **Use as project
   reference** in its details panel. Closing History without choosing returns
   to the still-open wizard. Alternatively, explicitly capture the *current*
   Scene/Compare experiment. Neither selection restores or edits the live
   experiment. The validated reference is embedded in the project and remains
   independent of the future existence of the History record.
3. **Allowed changes.** For Physics Transition choose an *active* curvature or
   temperature-lapse gradient channel in Scene, Compare A or B. Available
   choices are generated with `ModernAnimationContract.create()`, so unsupported
   or inactive channels cannot be selected. Camera/Experimental show their
   relevant rules instead of meaningless selectors.
4. **Initial keyframes.** By default, the reference is the first frame. Its
   inclusion may be switched off to create an empty project. This step embeds
   the **existing Snapshot Picker component**, with its standard search and
   physical filters (independent transient wizard preferences). Check cards
   to choose additional keyframes: this does **not** insert anything into the
   existing Studio timeline. Dragging to the previous timeline and its **Add
   checked** action are disabled for wizard selection. Incompatible entries
   are hidden by default; optionally reveal disabled entries with diagnostic
   reasons, or inspect them via **Open in History**. Chosen IDs persist across
   searches. Changing mode, reference or physical channel clears stale
   selections.
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

When used from the **creation wizard**, the shared Snapshot Picker is
contract-filtered and keeps its search state separate from the ordinary
Studio Picker. **Outside the wizard**, the ordinary Picker is not yet
pre-filtered by the current saved v2 contract: incompatible entries can still
appear, but their insertion is rejected before changing the timeline. The next
stage will make that ordinary Picker contract-aware as well. Changing the declared project contract after creation is
not supported. No new physics interpolation, media exporter or IndexedDB
migration is introduced here. Experimental remains a save-only collection.

See [Animation Project contracts](modern-animation-contract.md) for the
underlying validator, data format and interpolation limitations.
