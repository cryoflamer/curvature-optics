## Approved research roadmap — 2026-11-20

This prioritization supersedes the implementation order of 8F.7a.2 below, not its identity, protection, migration or registration contracts. GitHub Issues are the task backlog and acceptance criteria; PROJECT_STATE records the current step; this audit records architecture. One issue may require multiple bounded commits. Priorities are in issue titles pending native label/milestone setup.

### Milestone 1 — Photo-based Physical Research (P0)
1. #8 Calibration Transfer Foundation (8F.7b.1) — next.
2. #9 Apply Calibrated Camera to Scene (8F.7b.2).
3. #10 Registered Reference Photo Overlay in Scene (8F.7c).
4. #11 Calibration Integration in Shared-Camera Compare.
5. #12 Registered Reference Photo Overlay in Compare.
6. #13 Calibration Provenance and History Integration (8F.7d and milestone verification).

### Milestone 2 — Research Workspace Management (P1)
7. #14 Calibration Projects (8F.7e).
8. #15 Reference Image Research Navigation (8F.7f).
9. #16 Reopen Archived Calibration as Editable Project.
10. #17 Portable Research Bundle.

### Milestone 3 — Comparative Physical Research (P2 backlog)
- #18 Reusable Material Correspondences and Alternative Hypothesis Calibration.
- #20 Quantitative Photo Residuals and Atmospheric Parameter Sweeps.
P3: existing presentation and video technical debt #1, #2, #5; revisit when justified. #6 and #7 remain open pending explicit scope reconciliation, not duplicate implementation tasks.

### Shared-camera Compare contract
A calibration may be applied to Scene, Compare A or Compare B. Design compact origin for all three targets in #8, even while UI is implemented Scene-first. The fitted seven camera parameters, Eye-Lvl aim and captured object layout become shared Compare inputs; only the chosen side receives the captured physical hypothesis. Retain alternative-side physics subject to existing shared-control constraints; make shared changes explicit and protect the outgoing experiment before mutation. The archive remains immutable. Distinguish target association and actual fit applicability per side; an alternative side is not automatically independently calibrated even if its inputs happen to coincide. Shared camera changes can invalidate applicability on both sides. Preserve origin on derived edits; clear on unrelated reset. Historical Canvas Direct RMS is not a live Accurate residual.

Compare overlay supports A, B or both with common baseline angular registration and synchronized opacity, mapped into each panel's actual completed viewport transform. No separate fitting, stretching, or tracking of live camera changes; different panel sizes are presentation only. Compare must always use one shared physical camera for A and B as a permanent experimental invariant. Independent hypothesis fits (#18) are separate calibration experiments, each of which may produce a separate Compare with one shared camera. Independent cameras within Compare are out of scope; #19 is not planned. Scene-to-Compare side selection is explicit. Test transitions, reload, History, mixed hypotheses and missing assets. Milestone 1 closes only after the Soundly shared-camera research cycle and full CI/manual acceptance; no mandatory renderer equivalence.

## 8F.7b.1g — Foundation qualification

The foundation is exercised end-to-end by
`test_soundly_calibration_foundation_end_to_end` in Chromium: real
Calibration Worker runs the full 80-iteration-budget Canvas Direct
fit of all 14 mixed material/legacy Soundly rows, then immutable result
creation, original verification and durable reuse, Scene/A/B transfer,
derived and restored status, portable History deduplication, Studio
derived-frame preservation, URL startup and session reload with live
camera verification. Independently remove the test original in isolated
storage to verify archive availability and photo availability are separate.
No new Apply UI or overlay. No renderer-equivalence requirement.

Numerical fixture contains observed pixel coordinates and physical
hypothesis, but not the real encoded photograph; use a clearly labeled
synthetic PNG with exact fixture dimensions for real decoder and IDB
coverage. This does NOT certify the real photo's digest or prove a unique
physical solution. Historical Canvas Direct RMS remains a historical
residual; no Accurate error measured here. Earlier tests qualify old
formats, failed transactions, topology/identity checks, independent source
metadata and unsupported inputs. Close #8 only after full CI is green;
then #9 intentionally introduces the explicit protected Apply operation.

## 8F.7b.1f — Historical fit applicability

`ModernCalibrationTransfer.applicability(experiment,record)` is read-only
and returns activeViews, origin, resultStatus, historicalFit and per-view
(Scene/A/B) associated, status, matchesFit and differences. With no
origin, status ordinary; with unresolved archive, status unresolved and
matchesFit null. Result status distinguishes missing, mismatch, invalid,
verified and unlinked. Compare the full normalized origin with the
validated result (including baseline camera, photo identity and metrics);
an ID alone does not certify a portable link. Reuse the pure transfer
baseline to avoid divergent defaults or unrepresentable source fields.
No storage or photo resolution in this function: verified refers to the
archived result, not availability of original bytes. Caller resolves
photo independently for overlay and navigation.

For a verified record, only the historically associated view with
matching inputs is calibrated; otherwise derived. An alternative view may
match the fit's inputs without being independently calibrated. No automatic
retargeting on mode/editor changes. Shared seven fitted camera values and
object arrays affect all views. Compare actually forces Eye-Lvl (the
retained Scene aim is not its effective aim); Scene aim must be Eye-Lvl.
Compare geometry in radiusKm and Scene radius in metres are normalized.
Check exact enum/count fields and floating-point round-trip tolerance
1e-9 + 1e-12*max(abs(a),abs(b)) in canonical units; this is NOT a
measurement error or fit-quality threshold. Ignore banks empty in both
states; compare all captured layout fields in populated banks
conservatively. Check surface, active Globe radius, atmosphere and active
temperature-lapse fields; inactive temperature/engineered profile
parameters and occlusion radius for simple archived hypotheses are ignored.
Visibility, guides/grid, aspect and display controls are presentation.
Return deterministic changed field paths; returning to baseline recovers
calibrated status, not a new fit. Historical RMS/method/status remain
separate from any live Accurate error. Unverified compact-origin metrics
are explicitly marked verified:false. No UI classification or residual
recalculation in this step.

## 8F.7b.1e — Pure calibration transfer

`ModernCalibrationTransfer.transfer(record,current,target)` returns a
detached canonical experiment. No persistence, render, or live mutation.
The full immutable result and outgoing state are validated; copies only
seven best camera values, Eye-Lvl, captured object arrays and physical
hypothesis. Preserve supported captured display aspect; otherwise retain
outgoing supported normal aspect. Original dimensions remain in origin;
never compensate by altering focal field. Destination validation fails
for unsupported values (e.g. more than 200 objects per bank). The v1
state cannot encode rFEarth; require the existing normal constant
10007543, since it can affect Flat guides outside the fitted Globe view.

For Scene, use captured surface and atmosphere, initialize Compare from
the new Scene (Globe vs Flat with same atmosphere). For A/B, transfer
surface/radius and atmosphere only to explicitly selected side, preserve
retained Scene optics and other-side optics; both models share the
transferred camera and objects. Shared Compare haze becomes neutral
on both sides, not independent; report shared effects before future Apply.
Missing/partial captured temperature profile uses the physical defaults
15 C, 1013.25 hPa, -6.5 K/km per missing field. Other uncaptured controls:
occlusionRadius 6371000, neutral visibility, standard transition weight 0,
temperature-lapse inverse weight 0. No current unrelated physics borrowed.

Archive v1 has no canonical title, reset preset, grid or camera-path
context: generic Calibrated camera title, empty description, custom
selection, pontchartrain reset, grid off/extent zero. Drop outgoing
saved camera positions and sequence (protected by future Apply recovery).
Retain ordinary display preferences, disable retired probe. Target origin
comes from immutable result, not from current camera. This step does not
assert Accurate residuals, resolve missing assets or apply live state.

## 8F.7b.1d — Canonical experiment origin

Optional `calibrationOrigin` version 1 embedded in experiment version 1.
Old snapshots remain byte-for-byte canonical; absent origin means ordinary
/unlinked, not an empty fabricated calibration. Strict fields:
`version,target,resultId,resultDigest,photo,baselineCamera,historicalFit`.
Historical target is Scene/A/B, independent of the selected editor and live
mode. Full result digest binds the physical baseline; seven original fitted
fields and Eye-Lvl are retained for fixed photo registration. Historical
method/status/fit and validation counts/RMS retain their Canvas Direct
meaning. No result body, original bytes, editable titles, local aliases,
or mutable applicability flag. `ModernCalibrationResult.origin(record,target)`
constructs the origin from a validated immutable result. The state validator
is independent of the archive and decoder (also used in render workers).
An unresolved origin can round-trip; availability and actual fit applicability
are checked later, not asserted by structural validation. On asset resolution,
verify the full archive against the origin instead of trusting summary values.

Capture/apply, URL, local and IDB working session, exact History signatures,
protected recovery and portable History preserve the extension. Ordinary
camera/physics/display edits and Scene/Compare switches keep historical
association; unrelated preset selection/reset clears it after successful
protected recovery. Physical fingerprint and thumbnail viewKey ignore origin.
No automatic retargeting on editor selection; explicit transfer will assign
the target. Compare continues to use one shared camera. Compact Studio
camera/physical projects have one base experiment and cannot faithfully
represent different origins without a schema change; reject mixed provenance
rather than silently replacing it. Experimental collections can retain full
independent snapshots. No UI action, archive lookup or fit classification
introduced here.

## 8F.7b.1c — Durable immutable result archive

`ModernCalibrationResultArchive` owns IndexedDB
`curvature-modern-calibration-results` v1 / `results`, keyed by canonical
result ID. Each row contains id, creation timestamp and the immutable
validated record. `archiveExperiment(db, portable, env, options)` captures
the input, validates the result and verifies/durably reuses the original in
the existing image library before committing the result. It returns
`{row, reused, photoId, photoReused}`. No image data in the result.
`save(db, record, env)` imports a validated result only if its exact original
is already durably verified. Both paths use the same append-only transaction:
read the existing key, validate it, compare full canonical scientific payload
for collision safety, preserve first provenance/time on idempotent reuse,
or check bounds and add the new row. Success means IDB transaction complete,
not request success. No public update/delete or automatic eviction.
Limits: 256 records, 64 Mi serialized UTF-16 code units; real browser quota
can fail earlier. Old draft and image databases require no schema migration.

The image and result databases are separate, not atomically committed
together. If the result write fails, retain the already committed original and
retry safely; do not apply a camera or attach a link on failure.
`get(db, id)` returns a validated frozen row or null; `list(db)` returns
historical summaries with creation times. Both reject corrupt data and remain
independent of photo availability. Later link/overlay code resolves the photo
separately by verified identity. Do not infer calibrated status from archive
availability. No runtime draft changes, Scene mutation, History wiring or
auto-archival until explicit Apply is implemented. The archive assumes the
existing image deletion guard; external site-data clearing can remove either
resource independently.

## 8F.7b.1b — Immutable result contract

`CurvatureModernCalibrationResult.create(portable, env, {projectId})` verifies
the original with the existing importer, reuses the portable calibration
validator, and returns a deeply frozen owned record. Format
`curvature-calibration-result` v1, ID `calibration-result-v1-<sha256>`.
The scientific payload contains photo identity, captured physical model,
optional captured display aspect and temperature profile, committed
observations, method/free fields and normalized valid candidate. It retains
initial and best seven fields, Eye-Lvl, original-pixel predictions, historical
metrics and explicit candidate/terminal status; no image data or UI state.
Legacy topology and camera-domain validation are reused. RMS, weighted RMS
and half-weighted-squared cost are checked against original-pixel residuals.
A running fit must stop first; a valid stopped/underdetermined/stalled result
is not a convergence guarantee. Historical source metadata and project/alias
provenance are frozen outside the scientific digest and must not overwrite an
existing archived attribution on reuse. A later storage layer checks exact
payload content for same-ID collisions. No validation-error suppression.

`validate(record)` verifies canonical payload and digest without image bytes;
asset resolution must independently verify identity before use. The digest
uses sorted-key JSON (array order retained, non-ASCII UTF-16 units escaped),
prefixed by the versioned ASCII domain separator, then existing SHA-256.
`sameContent` compares canonical scientific payload as well as identity;
`summary` gives historical method, status, counts and original-pixel RMS.
Legacy results may lack material binding/terminal status; never invent
convergence or assert that the legacy fit cryptographically bound the
specific photo. No persistence, Apply, History or overlay yet.

## 8F.7a.2 — Photo-centric research workflow audit

Baseline 11c416d (8F.7a audit). User-approved refinements: preserve normal
Scene aspect ratios, register the photograph as an overlay, accept Canvas
Direct calibration as a starting point for Accurate Scene experiments,
and enable navigation among calibrated snapshots, photos and unfinished
calibration work from History, Reference Image Library and Photo Calibration.
This section supersedes the mandatory custom-aspect and cross-renderer parity
gates and the implementation order in 8F.7a below. The protected apply
transaction and captured-hypothesis requirements remain valid. Audit only.

### Source inventory: what already exists

| Component | Current source contract / extension point |
| --- | --- |
| Modern experiment | `ModernExperimentState.capture/validate` owns a strict v1 allowlist (camera, two object banks, surface/atmosphere, Compare, display, optional camera positions/sequence). No reference-image or calibration field. `ModernApp.experimentSnapshot/applyExperiment` transport this through working session, URL and History. |
| History | `ModernExperimentHistory` IDB snapshots store uses numeric local IDs, immutable validated experiments, exact/physical signatures, features, bounded thumbnail, names, pins, source and timestamps. Portable v1 only accepts experiment/name/description/pinned/thumbnail/createdAt. record/import deduplicate exact signatures, recovery/manual pins protected, auto pruned. |
| History UI | `ModernExperimentHistoryFilters.normalize/update/matches/filter/active` has keyword, mode, geometry, atmosphere and A/B relations, with AND constraints on one side. `ModernApplicationPreferences.historyFilters` independently normalizes the saved fields. `ModernApp.refreshHistoryList/updateHistorySelection` selects and focuses a card without restoring it; existing transient Picker focus can show an entry outside saved filters. `ModernExperimentHistoryUI.makeCard/renderDetails` and `ModernSnapshotPresentation.inspect/inspectorMarkup` share read-only presentation with Studio. |
| Reference Image Library | `src/animation/ModernReferenceImageLibrary.js` owns originals, metadata revisions and thumbnails in IDB observations keyed by string ID. list returns compact metadata, get returns original; create/importAssets validate/quota-check; importAssets remaps conflicting IDs based on complete record content, not a universal photo-content identity. Limits 100 records / 64 Mi characters. Original bytes remain fixed under metadata edits; deletion explicitly disabled while keyframe links exist. `ModernReferenceImageLibraryUI.mount/fill/reload` lazily loads selected original; no related-calibration/History query. |
| Existing photo links | `ModernAnimationProject` keyframes own `referenceImageIds` and local `sourceSnapshotId`; `ModernAnimationLibrary.referenceIds/collectReferences/remapReferences` implements portable bundle v2 with required original assets when linked (v1 still valid). This is keyframe-to-photo association, NOT a direct History snapshot-to-photo binding. No automatic inference that a source History snapshot is calibrated just because a later keyframe has a reference. Library UI explanatory text about exports predates bundle v2. Keep these paths working; reuse asset verification/remapping but not keyframe ID semantics. |
| Photo Calibration | `ModernPhotoCalibrationEditor.photoChoices/refreshSources` aggregates library, saved animation projects and built-in demo originals; library links are project/keyframe names, demo IDs are namespaced. Local file import uses calibration-photo as a local ID; portable calibration v1/v2/v3 embeds original and observations + best result. `persist/restoreDraft` writes one version-2 draft at IDB curvature-photo-calibration/draft/active, including photo bytes, scene, committed and pending pairs, Undo/Redo, fit, stage, selected owner and views. `saveInline/readInline` uses a SINGLE localStorage curvature-calibration-inline-v2 slot keyed by physicalSessionId and photo ID. New photo/reset/import currently replaces work after confirmation, not a project switch. |
| Animation workspace precedent | `ModernAnimationDraftAutosave.normalizeCollection/withWorkspace/withoutWorkspace/reconcileCollection/writeCollectionMerged` implements multi-workspace collection, baseline-aware merging, fork on concurrent edits, guarded deletion and session-local recovery. `ModernAnimationWorkspaceSwitch` persists outgoing work and checks generation before activation; `ModernAnimationWorkspacePersistence` serializes writes and absorbs late completion. Pattern worth reusing; these concrete modules depend on animation schemas, library IDs, wizard/demo callbacks and localStorage backup of relatively small drafts. Do not transplant them unchanged or write original photo data URLs to localStorage. |

Audited current source at baseline, not just earlier design notes. No live
browser experiment in this audit.

### Overlay: register angular coordinates, not outer Canvas aspect

Keep the four normal Scene aspect presets and their existing codec domain.
Original photo width/height remain exact calibration inputs and persisted
reference dimensions; they need not be the Scene viewport ratio. Do not
round the photo's ratio, stretch it to fill the graph, or silently change
the optimized focal field to compensate. Transfer the seven fitted fields,
Eye-Lvl aim and captured physical hypothesis, select a supported Scene
display aspect (retain captured supported aspect if available, otherwise
the user's normal Scene aspect/default), keep the reference dimensions
separately. Show photo bounds, possibly clipped by the Scene. A presentation
zoom/fit can expose the entire registered rectangle later, but must scale
both layers together and not mutate physical camera parameters.

Source basis: `CameraPhysicalPose.photoCamera` uses centered full-raster
coordinates with screenSize=1, zoom=1, objectZExtend=0;
`CurvaturePhysicalCamera.create` derives sceneSize using the aspect-dependent
3:2 convention; `CurvatureMainCanvasRenderer.configureCamera` captures the
actual GraphX3DX camera/window via `CurvatureCanvasProjection.capture`.
`CameraLandmarkProjection.cameraProjector` and
`CurvatureCanvasDirectPreview.cameraProjection` use the same perspective
scale q = screenSize / sceneSize * (distance - objectZExtend) * zoom.
The existing renderer already returns projectionCamera when captureProjection
is requested, for both direct and accurate paths. Use the actual completed
render's transform, not DOM CSS dimensions or assumed height/width.

Proposed initial mathematical contract (derive/test before shipping):
for photo and Scene calibration-baseline cameras with identical position
and orientation, let q_p and q_s denote that perspective scale. For original
photo dimensions W,H, photo coordinates are
u = W/2 + H*q_p*(right/depth),
v = H/2 - H*q_p*(up/depth).
For the Scene captured window scales a_x,a_y (usually signed opposite)
and offsets b_x,b_y, the corresponding registration is
x = b_x + a_x*q_s/(H*q_p)*(u-W/2),
y = b_y - a_y*q_s/(H*q_p)*(v-H/2).
For square-pixel rendering the two positive scales agree; verify tolerance,
do not silently distort. Use backing-store pixels and transform to a
presentation layer with correct CSS/DPR mapping. If the viewport clips
part of the photo, clip in presentation rather than rescale independently.
A known photo point and a ray at the image center are test oracles. In the
Soundly example use original 1176x791 (not rounded preview). For identical
pose and same optical rays this mapping preserves the projected positions
at a different aspect; it does not assert that Canvas Direct and Accurate
produce identical rays.

Crucial distinction: the registration rectangle is anchored to the
*applied fit's baseline* and the selected viewport layout, not auto-refit
to the changing live camera or geometry. Recompute for resize/DPR and
explicit display aspect changes using baseline intrinsics. Do not use
live focal/pose changes to track/warp/realign the observation: that
would conceal the residual being investigated. Camera changes, atmosphere
or radius changes must remain visible against the fixed photo. If user
explicitly wants a different registration/zoom, keep it separate and
labeled, with reset to calibrated registration. No per-point homography
or elastic fitting. Retain source identity even when Overlay is off.

Initial modes: Scene only, Photo only, Overlay opacity. Split and Blink
are optional follow-up, not prerequisites to Apply. A separate presentation
layer must not repaint or mutate underlying optics, intercept Scene
navigation unintentionally, or contaminate ordinary accurate History
thumbnails. Reuse existing canvas-layer and presentation conventions;
avoid adapting the Animation keyframe photo panel into a physical
registration engine. A saved pure Scene render remains distinct from
an optionally exported overlay composite.

### Optical method policy

Transfer the best valid Canvas Direct camera and captured atmosphere,
without a mandatory Accurate-vs-Direct equality gate. Render normal
Accurate Scene afterwards, optionally select existing supported quality
modes by user choice. Treat fit RMS explicitly as Canvas Direct residual
under its source hypothesis and original raster; do not claim it is the
Accurate Scene error, or silently re-optimize/adjust temperature gradient.
The user may adjust the atmosphere/gradient after transfer, or create
another fit of the same compatible observations under a different
hypothesis. Measure renderer discrepancy when helpful; do not block use
of the fitted pose because the optical methods differ. Vacuum same-method
projection/overlay is a useful regression oracle, not a requirement that
all physics models produce equal images.

### Data model: one physical journal, editable projects, immutable results

Proposed entities (contracts; no names or schemas in production yet):

1. Reference observation: existing Image Library original plus canonical
   content identity. Use SHA-256 of decoded original file bytes and the
   validated decoded orientation/dimensions; hash bytes, not the data URL
   spelling or editable title/source metadata. Local library ID and
   built-in demo namespace remain lookup aliases, NOT portable identity.
   Distinct encoded files of the same scene are distinct unless explicitly
   related later; no automatic perceptual deduplication. Local-file
   calibration and demo original should be resolved/imported into the
   existing library before an applied link becomes durable, collision
   checked by bytes/dimensions, using existing verification/quota policy.
   Reuse a matching original; the ordinary image metadata may differ.
   Preserve assertion of source attribution, no external upload.
2. Calibration Project: stable project ID, name, timestamps and revision,
   one editable working draft (including captured hypothesis, reference
   identity, committed and pending material observations, Undo/Redo,
   stage, free fields, Fit/Validation roles, best candidate, view state).
   A project can exist before a fit or before a photo is selected. Store
   optional view state by project/session, not the shared inline slot.
   Support Open/New/Rename/Duplicate/Delete later. Duplicate with same
   compatible anchors to test an alternate atmosphere without re-picking.
   Do not introduce a separate global correspondence-set database yet:
   clone/version rows inside projects and results; promote reusable sets
   only when the later workflow justifies it.
3. Calibration Result: immutable revision identity, binding to exact
   reference original, captured model/physics, initial and best pose,
   committed rows including roles, method/free fields and validated
   evaluation/status. Freeze at explicit Apply (and optional explicit
   archive in subsequent project UI), not every Worker progress event.
   Store project ID as an optional historical parent; not identity of a
   mutable draft. Preserve stopped/stalled valid candidates as such.
   Result can be reopened as a cloned editable project from any linked
   snapshot; editing/refitting cannot rewrite a previously linked result.
   Archive original once via asset store, not as a data URL in every
   result or snapshot. Reuse the portable calibration validator and
   material anchor binding; retain full observations and source data
   for reproducibility. Content-bound ID/digest plus collision checks
   prevents imports from redirecting older snapshot links.
4. Scene Snapshot: existing validated physical experiment in History,
   with bounded optional observation reference and calibration-origin
   summary (immutable result ID/digest, photo identity and dimensions,
   fit-method/status, Fit/Validation counts and RMS if known, baseline
   fitted camera/context identity). A generic photo-associated snapshot
   need not have a fit. Several snapshots can share one result or photo;
   a new fit has a new result identity. One primary reference initially,
   no general graph database. Do not duplicate physical snapshot storage
   in Photo Calibration.

Keep the compact origin in canonical experiment state (optional validated
extension, old v1 inputs must still work; decide version strategy with
compatibility tests before implementation), rather than a sidecar attached
only after saving History: `experimentSnapshot/applyExperiment`, session
autosave, protected recovery, URL and portable History must round-trip the
link. An active calibration origin then exists BEFORE user clicks Save.
No image bytes or entire fit/rows in the canonical physical JSON or URL.
Compact origin sufficient to show attribution even when full local result
or original is unavailable; distinguish unavailable asset, unavailable
archived result, and ordinary unlinked snapshot. Do not create fake draft
or substitute a same-name image when resolving an imported link.
Use verified digests not local numeric History IDs for cross-browser links.
Compare's shared-camera A/B semantics must remain unchanged. Independent
fitted cameras from separate snapshots can be inspected via restore/overlay
and related list; a future independent-snapshot comparison is a distinct
feature, not current Compare.

Fit applicability: derive status from canonical current inputs against
stored fit baseline. Exact/tolerance-normalized seven camera fields
(account for model.Update numerical round-trip), Eye-Lvl and calibrated
object/geometry/atmospheric hypothesis; distinguish active vs inactive
atmosphere controls; display-only guides/aspect/opacity do not invalidate
fit as long as registered photo projection uses the baseline. A changed
camera/aim/physical hypothesis is "Derived from calibration", not a fresh
calibrated fit. A Compare A/B experiment with changed or mixed physical
hypotheses must not be labeled calibrated for both sides. Keep origin
historical; reset/new unrelated preset clears it, derived edits preserve
it with explicit current-vs-source summary; restore/reload derives same
status. Historical fit RMS is never a generic live score.

### History and reference library navigation

History remains one physical-snapshot journal with current pinned/recent,
selection, restore, edit metadata, export and deletion behaviors. Add
filter group for all / calibration-linked (exact and derived) / other,
and optional Calibrated vs Derived distinction and photo-identity filter.
A photo-linked but never calibrated snapshot is not calibrated. Extend
both HistoryFilters and ApplicationPreferences normalization plus controls
and shared presentation, with legacy defaults and Studio picker/wizard
regressions (these use same filter helper). Keyword search includes source
photo title and compact calibration data, but exact filter uses identity.
Filter operation is read-only. Each linked card/details shows historical
method/status/RMS, photo and origin applicability clearly. Actions:
Restore Scene, View original, Open calibration result/project (explicit
open/clone, preserve other in-progress work), Related experiments. Reuse
existing selected-card focus outside filters, without modifying the
user's saved filters or auto-restoring the scene.

Reference Image Library adds related snapshot/results/projects counts and
links for selected photo, and start calibration for that photo using
explicit current Scene capture. Derive the reverse lookup from authoritative
History entries, project summaries and result records by content identity,
not a second persistent index initially. The existing Library limits make
read-only scans reasonable; do not read all full-resolution photos for
every card or block startup. Refresh on committed store changes and guard
old asynchronous selection response (existing library is lazy with a
busy/dirty check). Keep existing animation keyframe links visible but
separately identified. Existing raw link names are not calibration proof.
Use stable lookup even after title edits or ID remaps. Preserve focused
navigation on missing/deleted item without changing Scene. A later
referential index only if profiling warrants it.

### Multi-project calibration storage and migration

One mutable active draft is not sufficient to resume work on a second
photo. Add a lightweight Calibration Projects library inside existing
Photo Calibration, not a second immutable physical History. A landing
list can show photo, name, stage, row count, fit status/RMS, updated time,
linked snapshot count; opening an item restores its exact draft, including
pending endpoint and Undo/Redo. Keep one active editor at a time. Separate
per-project revision/checkpoint and immutable result archive from view
preferences. A named project may contain additional completed runs later;
archive only applied/explicit results initially.

Migration: validate existing IDB draft/active and optional matching inline
view (physicalSessionId and photo identity). Create a project UUID and
adopt the old record with all rows, photo, fit and editor state, atomic
versioned migration / marker. Do not remove old record or old localStorage
slot until new durable checkpoint verifies; idempotent reload, no
duplicate migration. Unsupported Flat draft must remain recoverable/exportable
per existing rejection policy; not silently dropped or converted. Prevent
startup auto-enter from overwriting a pending restore. Stored photo bytes
can be migrated to a verified Library asset before referencing; retain
old copy on quota/failure. Keep one-project Apply usable while adding
multi-project UI afterwards.

Reuse Animation's sequencing / generation / conflict-fork pattern, not the
concrete schemas. IDB project records with per-ID revisions and small
metadata index; transaction compare-and-swap on current revision.
Serialize writes with fixed project ID + generation captured at scheduling,
not the active ID at eventual commit. Concurrent same-project edits:
explicit conflict/fork preserving both; independent projects do not
overwrite each other; stale delete cannot wipe newer work. Switching
while Worker active: explicitly stop/retain best or refuse until stopped;
discard late Worker/image/restore callbacks using session/project generation.
Require outgoing checkpoint success before switching, preserve original
draft if incoming validation/decode fails, restore UI busy flags.
Return an observable persistence outcome (current persist is void and
catches internally; not adequate as an apply/switch commit promise).
Store large originals and full checkpoint only in IDB, localStorage
optional bounded UI/session metadata (no data URLs or pretend
synchronous backup of huge records). Expose unsaved status and portable
export if durable storage fails. Protect unfinished and linked data;
no silent eviction.

Delete rules: deleting snapshot never deletes projects/results/photos;
deleting mutable project never deletes archived results used by snapshots
(or implicitly deletes snapshots/photos). Reopen archived result as a
new project even if its original parent was deleted. Initially retain
archived results, keep Library original deletion disabled as now.
Later explicit cleanup requires checking snapshots, projects, archives,
Studio saved/draft/Undo links, missing imported refs and race protection;
no cascade. Imported historical dangling links remain inspectable as
metadata. Reverse counts derived from authoritative stores, not manually
maintained counters.

### Apply first; portability and identity foundations

Do not wait for all project-library features. First create the minimal
durable identity/immutable-result infrastructure and pure mapping; preserve
the current single draft. Validate source/target, stop or disallow running
Worker/pending pair edits, capture stable candidate, verify original,
commit result archive, then protect outgoing physical Scene with existing
History record(...,'recovery',...) and await success. Recheck candidate,
navigation and exact outgoing signature after awaits; no overwriting
newer edits. Because stores are separate IDB databases there is no global
atomic transaction: stage durable prerequisites before apply, retry
idempotently by content/revision; an unlinked archived result/recovery
checkpoint after an aborted apply is recoverable, not justification to
delete data or fake success. Reuse applyExperiment/setMode/controls/
autosave/Previous flow with rollback and render-error distinction from
8F.7a. Calibration draft and archive stay intact. No automatic final
manual snapshot; user saves via existing button. A new unrelated Scene
or failed application must not retain wrong calibration origin.

Fingerprint/portability dependencies: `ModernExperimentFingerprint.exactSignature`
currently JSON-serializes the full validated experiment (except Compare
selected editor); include canonical observation/result identity in exact
signature (not mutable alias/title), so independently sourced equal
physics does not collapse, and the existing Save button doesn't falsely
hide. Keep physicalSignature/auto-history semantics and thumbnail viewKey
based on render inputs, independent of provenance and photo overlay UI.
Audit History import dedup, Session/URL round-trip, Studio baseExperiment
and camera/physics applyValue, compatibility reference contracts and
exports; these validate full experiment and may compare JSON equality.
Provenance is not a new animated physical parameter; derived frame edits
do not inherit a claim of a fresh fit. History portable export of compact
links remains usable without bytes, explicitly label metadata-only.
A portable research export with verified originals and immutable results
can reuse the Animation Library asset collection/remap design; imported
same-ID-different-content records must be rejected/remapped without
rewriting existing associations. Preserve standalone old calibration
exports v1/v2/v3, History v1 and animation v1/v2; decide optional versioned
extensions before coding. Never silently strip a known origin or silently
replace an original.

### Revised sequence and acceptance

- 8F.7b.1 — canonical compact reference/calibration origin, asset identity
  and minimal immutable result archive; pure validated calibration-to-
  Scene mapping with supported aspect and Eye-Lvl, old source defaults
  and tests. No new global aspect domain. Persistence failure/retry,
  content collision, archived candidate immutability, versioned old data
  compatibility, exact vs derived classification and fingerprint checks.
- 8F.7b.2 — Apply Best Camera to Scene, protected outgoing recovery,
  candidate/generation checks, ordinary Scene render with explicit existing
  Save Snapshot. Reload/restore retains link and draft. Exercise real
  Soundly 14-point camera fit (1176x791), old import and unrelated outgoing
  Scene, failure cases, previous and normal Back to Scene.
- 8F.7c — registered Reference Photo Overlay, photo only/scene only/opacity;
  numerical angular mapping tests for different ratios/resize/DPR and
  live pose/focal changes (photo must not follow fit errors); browser
  validation with real reference. No renderer parity gate. Split/Blink
  optional. Pure accurate snapshot thumbnails remain unaffected.
- 8F.7d — History filters/details/navigation for exact calibrated/derived/
  other and selected photo; restore existing pinned and ordinary entries;
  portable origin-only links and explicit unavailable asset/result status.
- 8F.7e — Calibration Projects library, migrate active legacy draft,
  per-project autosave/inline state, independent open/new/duplicate,
  guarded switches/deletes/reload/conflicts; reopen immutable result
  as a separate draft. No new physical journal.
- 8F.7f — Reference Image Library related items and reciprocal focused
  navigation; optional explicit full research bundle (original+result+
  snapshots/projects) after compact portability tests.
- 8F.7g — full Node/Chromium/architecture and manual end-to-end research
  cycle; close stage only after CI. 8F.8 may add sharing material
  correspondences across verified compatible geometry, profile sweep
  and independent snapshot comparison. Do not imply a unique atmospheric
  solution from minimum RMS.

No production code, schema or tests changed in this audit. Formula and
UI/identity contracts are proposed and need actual numerical/browser
verification. Existing CI on 5c33675 was green per 8F.7a; this docs-only
revision is not a new test run.

---

## 8F.7a — Calibration to Scene: transfer architecture audit

Baseline: 5c33675b21d7ecad8f1110c5f02c3ff9153d6967; GitHub Actions run
44683469032 completed successfully. The user confirmed the fresh Soundly fit
and approved returning its calibrated camera to the ordinary Scene, then
saving a deliberate History snapshot. This is an audit, not an implementation.
The physical solver, existing workspaces, Legacy and on-disk schemas are unchanged.

### Existing implementation and reuse points

- `src/ui/modern/ModernPhotoCalibrationEditor.js`: `prepareScene` (1125),
  `exportExperiment` (1263), `validateFitResult` (277), `paintBest` (1401),
  `receiveFit` (1432), worker lifecycle and `persist` (672). A calibration
  owns an independent captured model, physics, original photograph, rows and
  best candidate. Reopening it does not recapture the live Scene. Imports
  and restored drafts can be from another scene entirely. Never merge a pose
  blindly into the currently visible physical model. Never take a camera
  from the physical Free View or from Result pan/zoom.
- `src/ui/modern/ModernApp.js`: `getPhotoCalibrationScene` (7523),
  `experimentSnapshot` (1034), `applyExperiment` (4704),
  `restoreHistorySnapshot` (4381), protected preset switch (7190 onward),
  `setMode` (6905), `redraw` (6792). The canonical Modern experiment codec
  already provides prevalidated whole-scene restoration; the existing
  protected History transaction and preset stale-state/rollback pattern are
  the appropriate reusable primitives. Do not call the existing
  camera-only `applyCameraPose` as the transfer operation.
- `ModernExperimentHistory.record(current,'recovery',thumbnail)` commits
  a pinned non-automatic checkpoint, including promotion/deduplication of
  an existing exact match. A thumbnail is optional when the hidden physical
  canvas is not current. Wait for commit before changing live state.
- Use the existing `setMode('scene',true)`, control synchronization,
  autosave and History save action, not a second Scene creation or snapshot
  path. `redraw` deliberately ignores a hidden calibration workspace, so
  activate Scene before requesting the authoritative visible render.

### Blocker A: exact framing is not yet transferable

`CameraPhysicalFit.poseOf` includes the seven finite camera parameters plus
`viewcenterHorizon:3` (Eye-Lvl) and `deviceRatio:width/height`.
`CameraPhysicalPose.photoCamera` constructs a centered full-raster physical
camera using the original image dimensions and the 43.2 mm diagonal field
convention. The legacy-compatible physical camera has an aspect-dependent
sceneSize rule for ratios wider than 1.5. The raster ratio is not an optional
cosmetic setting. Result preview uses its own raster dimensions, which may
be rounded after downscaling; equivalence must be based on the original
photo raster, not a CSS box, Free View, or preview zoom.

Soundly fixture `tests/fixtures/soundly-mixed-calibration.json`:
1176 x 791, exact ratio 1176/791 (approximately 1.4867269). Scene's
`ModernExperimentState.validate` accepts only 1.5, 2/3, 16/9, 9/16
for the active and saved camera. `ModernSceneState.setDeviceRatio`
also restricts to these four. The canonical graph is authored at 100% width
and 66.67% height, and `CurvatureMainCanvasRenderer.configureCamera`
captures the actual GraphX3DX viewport transform after setting its viewport
and camera. Changing just the model ratio is not proof of image conformity.
A regular viewport can letterbox the calibrated image rectangle; the
actual projection, not the outer canvas dimension, must match.

Proposed contract: transfer exact original dimensions/ratio and Eye-Lvl;
support finite custom ratio within the already bounded camera domain
[0.1,10] (reject out-of-domain inputs rather than round or crop silently).
Inventory consumers of the aspect contract before implementation:
experiment capture/validate, saved positions, camera sequences and
interpolation, Scene/Compare graph sizing and coordinate transforms,
History/session/URL transport, Studio and exports (including fixed output
sizes), thumbnails, interaction and guides. Keep the four existing presets
and old saved experiments working unchanged. A calibrated image rectangle
can be fitted inside a differently sized output; cropping or stretching
must be explicit. No global Legacy aspect-policy change. A separate unused
"photo aspect" metadata field does not fix projection. Test both a
nonstandard ratio and a supported ratio, portrait/landscape and resize/HiDPI.

### Blocker B: physical hypothesis and renderer are different concerns

The captured calibration model holds both object banks, surface radius,
initial camera, and authored scene fields. `getPhotoCalibrationScene`
currently captures only atmosphere and temperatureProfile from physics,
not the whole canonical Modern experiment. Calibration supports only
Globe with vacuum, standard or temperature-lapse. The solver optimizes
Canvas Direct (local effective-radius approximation), NOT the Accurate
RK4 physical renderer. `paintBest` likewise calls Canvas Direct directly,
with thin outlines; normal Scene `draw` calls
`CurvatureMainCanvasRenderer.renderPhysical` with live visualization and
quality settings. Canvas Direct uses the captured graph transform on this
route, unlike the independent centered photo raster.

Build the destination as an allowlisted canonical Modern experiment, not
an Object.assign of imported model properties into CurveApp. Map the
captured object bank arrays, Globe radius, supported atmosphere and
temperature profile; validate both source and destination. Force
viewcenterHorizon=3 and the exact photo ratio. Recalculate derived camera
and geometry state through model.Update; do not transfer stale derived
fields (camViewAngle, geometryRadius, etc.). rFEarth is not serialized by
the normal Modern codec (default 10007543); it is inactive for the Globe
Eye-Lvl aim but imported noncanonical values must be checked for any other
downstream effect rather than silently claiming arbitrary-model parity.
Calibration's larger allowed object count (up to 10000) is not a promise
that the normal codec (up to 200 per bank) accepts it. Fail before mutation
on unsupported values, including ranges for object and camera fields.

Preserve the captured scene title/description and use a custom scene
selection for the fitted state; reset preset should be well-defined
(captured preset for new complete captures, explicit safe policy for old
imports, never falsely label the result as an unmodified preset).
For future captures add a validated canonical context or equivalent
allowlisted extension. Old calibration v1/v2/v3 only contain the available
model + atmosphere/temperatureProfile; retain import compatibility and
document the deterministic defaults for uncaptured controls. Do not
substitute live unrelated visibility/refraction settings. Visibility is a
display effect; use neutral visibility for equivalence to calibration
unless captured/explicitly selected. Compare config should be initialized
from the transferred Scene, not silently inherited from an unrelated
experiment. Treat camera positions and sequences from the old Scene as
protected with the old experiment; do not carry unrelated paths over.
Ordinary UI preferences (layout/theme etc.) are not calibration data.

First validate with the same Canvas Direct method at original dimensions,
neutral decorations and exact framing. Then render the ordinary Accurate
Scene for the user. Report any reprojection delta between methods in
original photo pixels separately from the fit residual; never claim
Accurate reproduces a Canvas Direct fit exactly, or change fitted
parameters silently. In Vacuum projection parity is a strong regression
target, but must be measured. Standard and lapse need explicit measured
method differences; no universal error bound is established by this audit.
History thumbnails are currently eligible only when effective quality is
'accurate', a render is complete and history view keys match. Preserve this
guard. Do not save a Canvas Direct result image as an Accurate Scene
thumbnail or insert an automatic final snapshot to work around it.

### Proposed transaction / UI contract (8F.7b)

Result action: Apply Best Camera to Scene; ordinary Back to Scene remains
navigation only. Enable only for a validated retained best candidate,
matching current captured context, committed rows and free fields; no
worker running or unfinished correspondence draft. Stopped/stalled fits
with valid best results are allowed with an explicit status/RMS, not a
claim of convergence. Invalid initial fits, stale results, failed previews
or unsupported target values must not mutate the Scene. Revalidate old
imported results (legacy binding rules are weaker); never trust the fit
status label or serialized metrics as proof of numerical parity.

1. Produce a detached, validated transfer request from the editor, with
   captured source, best pose, photo dimensions, candidate identity and
   fit metadata. No live state mutation.
2. Build/validate destination, show what will be replaced and confirm
   applying the calibrated experiment; preserve the completed draft.
3. In the app, guard against overlapping apply/preset/History operations.
   Stop pending camera edits/playback and save a protected exact recovery
   checkpoint using History. If storage/validation fails, retain Scene and
   draft. Guard against newer live state, navigation and candidate changes
   during the asynchronous transaction, as in preset-switch signature
   check; never overwrite a newer edit.
4. Apply the canonical target via applyExperiment, sync all UI state,
   invalidate obsolete render keys and select Scene. If synchronous
   application fails, restore pre-apply state and workspace. Distinguish
   committed state from later render/History-refresh failure; report
   those failures without pretending a backup failed. Link the previous
   protected entry via existing Previous/History navigation. Ensure the
   autosave reflects the applied experiment and not a stale queued write.
5. Render an authoritative Scene (Accurate for normal Snapshot), expose
   status and let the user intentionally save via the existing Save
   Snapshot control. Preserve the calibration project for later editing.
   No automatic final manual snapshot. Camera-only changes do not affect
   physicalSignature, so do not assume idle auto-history will save it.

### Provenance (8F.7d, design only)

The existing experiment codec is strict/allowlisted, and History entries
derive the exact signature and features from that codec. There is no
calibration metadata field today. ReferenceImage IDs are local and shipped
IDs can collide; the calibration export embeds the original. Do not
insert large data URLs or full residual tables into every experiment/URL.
Propose compact, versioned optional provenance, validated and explicitly
carried by session/History export/import, with reference title, original
dimensions, stable content identity (e.g. SHA-256, to implement), optional
source URL, fit method/status, initial/final and weighted RMS, Fit and
Validation counts and metrics kept separate, fitted pose, free fields and
context identity. Retain full portable calibration JSON separately;
local IDs alone cannot identify originals across browsers. Decide whether
to link/import the original into the image library in a separate step;
never silently upload it. Distinguish historical calibration provenance
from current fit validity after subsequent edits (camera/framing/geometry/
atmosphere changes); do not present old residuals as the new state's
measurements. Specify deduplication behavior explicitly: two identical
physical states may have different provenance. Do not change physical
fingerprints/auto-history semantics accidentally.

### Implementation sequence and acceptance

- 8F.7b.1 — exact photo framing across canonical state and Scene viewport;
  compatibility audit and tests before any destructive transfer action.
- 8F.7b.2 — pure validated transfer mapping, captured context/default
  policy, candidate validity and preflight; unit tests with cloned/imported
  data, arbitrary live Scene and rejection cases.
- 8F.7b.3 — UI and protected recovery transaction; test storage failure,
  duplicate/reentrant apply, stale async completion, rollback, Previous,
  reload, preserved draft and Back to Scene remaining navigation-only.
- 8F.7c — projection/renderer equivalence: Soundly 14 points (1176x791),
  compare original-pixel predictions in calibration vs matching Canvas
  Direct Scene at the same image rectangle (propose <=0.05 px per point
  initially for deterministic numeric parity; verify feasibility before
  adopting); then measure/report Accurate delta and its RMS independently.
  Test viewport resizing, both nonstandard and standard ratios, translations,
  roll and non-vacuum profiles. Include actual Chromium and a manually
  saved/restored calibrated History snapshot without stale thumbnails.
- 8F.7d — compact calibration provenance with portable persistence,
  reference identity, edit validity and duplicate policy.
- 8F.7e — complete Node/Chromium/architecture CI, manual Soundly workflow
  and documentation; tag only a verified stable revision.

No production tests were run during this read-only source audit. Existing
CI was verified against the baseline. The aspect, snapshot transport and
projection contracts must be implemented and tested before claiming fit
equivalence. Runtime and format changes are deferred to the following stages.

---

## 8F.5d — Integrated correspondence editing

The integrated pair action row includes Edit pair. Existing observations are
copied into an explicit editable draft, including their weight and photo
pixel. Confirming a new Vertex/Edge/Surface or Fast Vertex replaces only
the draft material point; Update pair commits through the existing Undo and
fit invalidation path, preserving observation ID, role and row order.
Changing a legacy vertex's identity upgrades it to a material anchor.
Photo dragging outside explicit edit retains the existing immediate Undoable
edit; inside an edit it updates only that draft. Cancel edit leaves the
committed observation unchanged. Draft restoration uses the existing storage.
8F.5c was manually validated by the user. Next: Functional Parity before
legacy Globe cleanup. Browser and full CI verification remain pending.

## 8F.5b.4a.4 — Draft lifecycle

The editor's pending model vertex is the sole source of truth for a
Fast Vertex draft; its cyan marker is derived in the viewer independently
of staged/confirmed local material points. Local staging survives Navigate,
Owner Inspection and other pick mode switches; only its originating mode
can confirm it. A new successful pick replaces the single staged point;
empty clicks retain it. Reset/navigation/Best Camera parking do not cancel
the pair. Cancel draft pair (or Escape outside local staging) cancels the
editor draft without resetting the camera or deleting observations.
Clear point clears only local inspection. Deleting an unrelated pair
preserves the draft; failed saves retain the draft for retry or cancel.
Old optional Fast Vertex confirmed markers are not restored as local points.
Persisted pending vertex and pixel are checked against the current scene
and photo. Legacy Flat pairing remains supported. Remaining: .5 Functional
Parity, .4b cleanup, then 8F.5c/d/e.

## 8F.5b.4a.3 — Integrated Owner Inspection

Owner Inspection in the integrated Globe Pick menu selects the top painted
owner (object or individual span) using the existing optical/physical
painter paths, including line coverage and horizon masks. It neither stages
a material point nor changes the orbit or observations. It reuses the
editor's existing owner packages, labels and selection, exposes the selected
owner's primitive list and approximate range, and shows a dashed contextual
outline (which may include occluded portions). Owner identity and mode
are persisted with the existing draft/session. Best Camera remains read-only;
legacy tools and Flat are retained. Remaining: .4 Draft Lifecycle,
.5 Functional Parity, .4b cleanup, then 8F.5c/d/e.

## 8F.5b.4a.2 — Integrated session persistence

Integrated viewport snapshots are stored in the browser beside the existing
IndexedDB calibration draft, bound to its session ID, photo ID and optical
source. Initial/Free View and Best Camera have separate snapshots. Free View
rebuilds the original physical frame before restoring orientation, projection,
zoom, pan, wireframe, rebased orbit pivot and validated local picks/candidates.
Legacy magnifier session v1 remains unchanged. Undo history (last 50 states)
is included in the atomic draft and validated on restore. Photo view, active
pair and incomplete pair were already stored there. Orbit sensitivity is
already a global UI preference. No new panel persistence or independent
Initial/Free optical-region history is introduced; Free View retains its
entry region and Reset View deliberately returns to the full optical source.
Invalid optional viewport/history state is discarded without deleting pairs.
Regression coverage added; browser and CI validation pending.

Remaining order: .3 Owner Inspection, .4 Draft Lifecycle, .5 Functional
Parity, then 8F.5b.4b legacy cleanup and 8F.5c/d/e.

## 8F.5b.4a.1 — Integrated Fast Vertex pairing

8F.5b.3c navigation was manually confirmed by the user. The integrated
Globe viewer now offers Fast Vertex separately from local Vertex/Edge/Surface
inspection. A unique visible vertex enters the existing legacy vertex identity
and chooseModel/savePair path; ambiguous candidates require Use vertex.
Photo-first and model-first pairing use the same observations, Undo and
draft storage. Best Camera remains read-only on the model side. The existing
floating viewer and Flat workflow remain unchanged. Added Free View pairing
callback regression to the DOM fixture; CI and manual validation pending.

Remaining migration: 8F.5b.4a.2 Owner Inspection; .3 Draft Lifecycle;
.4 Session Persistence (including pivot); .5 Functional Parity; then .4b
legacy Globe cleanup and 8F.5c/d/e.

## 8F.5b.3c — Selected physical point orbit pivot

Integrated Globe Free View uses the staged/confirmed material point or selected
correspondence on entry, otherwise the existing visible-owner seed. Selecting
another material point or correspondence in Free View rebases the orbit without
moving the current camera, changing its zoom, or changing calibration data.
The crosshair marks the pivot; the last valid pivot remains until a new point
is selected or the optical view is reset. Invalid/behind-camera pivots cannot
replace a valid pivot. Canvas Direct and the effective-radius optics are
unchanged. Initial/Best parking retains the orbit in memory. The old floating
crop session contract remains unchanged; durable integrated session restoration
is still 8F.5b.4a. Added math and DOM lifecycle regressions; full CI and manual
Soundly validation are required before 8F.5b.4a.

## 8F.5b.3b — Integrated Globe model viewer

The Globe route now defaults to the integrated Model Viewer beside the
photograph (Initial Camera, read-only Best Camera, physical Free View).
Legacy model tools and manual controls remain usable during migration.
Initial viewport state is retained in memory while the fitted source is
displayed; source updates preserve Best zoom. The current Free View pivot
uses a visible owner seed near the viewport center, not yet a selected
anchor pivot. Inline material points are still local drafts, not committed
observations. Full inline draft migration, fast vertex pairing and owner
inspection remain 8F.5b.4a. Previous 8F.5b.3a full CI succeeded.
34 focused viewer tests (including DOM mock) passed; new Chromium
coverage added, full CI pending.

## Subsequent refinement

The original package-selection/modal/front-view MVP and precise owner
selection (8F.2a) have been implemented and user-tested. The agreed primary
workflow is now a generic 3D Scene Magnifier: rectangle selection, modeless
window, optical re-rendering of the same crop, independent local geometric
orbit, and exact reset. See stages 8F.2b–d in the current
[implementation plan](landmark-editor.md), which supersede the original
single-owner selection, context and initial-view defaults below. The
authored owner and fixed anchor contracts remain unchanged. The old
audit's geometric-only viewer describes Free View, not Scene View; the
latter must preserve the main optical projection. Mode-specific picking
must be audited in 8F.3.

The canonical material value representation was implemented in 8F.4a;
see [current contract](landmark-editor.md#8f4a--canonical-material-anchor-representation-implemented).
The original proposals below are historical; uniform index/weight tuples,
Globe-only authoring and persistence ahead of UI supersede earlier choices.

## Source audit and decisions

| Existing source | Finding / consequence |
| --- | --- |
| `src/geometry/CurvatureGeometryEngine.js`: localObject, createPlacedObjectScene, placeOnPlane, towerPlacement, objectSequence, createObjectSequenceScene | All local object types produce 2D polygon/line coordinates, placed by an affine plane basis. Variant geometry depends on sequence context (drawn, total, bank, side, variation, type), not merely type. The sequence also authors connecting world-space polygons. |
| `src/geometry/CurvaturePhysicalWorldGeometry.js`: placement | Shared physical surface placement retains the Globe/Flat east/north convention; local axes contain object size and scale. |
| `src/renderers/CurvatureCanvasDirectPreview.js`: objects, objectIdentityColor, paintGroup, drawPrimitive | Existing RGB identity pass identifies placed packages; painter order and terrain mask are approximate, not a depth test. Identity pass makes styled primitives opaque. |
| `src/ui/modern/ModernPhotoCalibrationEditor.js`: ownerAt, visiblePick, renderModel, prepareScene, pickAt, updateObjects, selectLandmark | Ownership raster, hover highlight, manual bank/object menus and vertex picking already exist. Object-interior click without a vertex currently does not select a correspondence. Reuse this infrastructure, not a new full-scene ray caster. |
| `src/geometry/CurvatureEarClip.js`: triangulate, inspect | Conservative 2D ear clipping with duplicate/collinear removal and self-intersection rejection; returns coordinate triangles, not original vertex IDs. Cannot store its output triangle ordinal as durable identity. |
| `src/scene/CurvatureSceneContract.js` | Renderer-independent finite 3D lines and polygons, mode, style and arbitrary metadata. No indexed solid mesh or thickness contract. |
| `src/calibration/CameraLandmarkProjection.js`: create, bank, fromWorld, vertex, authoredVertexRanges | Shared projector accepts metric and legacy vertex landmarks. Bank generation differs by method; use exact authored mesh for each projection path and shared fromWorld, not a second optical formula. |
| `src/calibration/CameraPhysicalFit.js`: observations, evaluator, prepare, diagnose | Current accepted kinds metric/vertex; dispatches by kind. Scale uses authored vertex ranges. Extend validation and range resolution; keep camera-only least squares and SVD unchanged. |
| `src/calibration/CameraCalibrationWorker.js` | Worker imports geometry/projection/fit dependencies; add new pure modules to worker and browser loading paths in implementation. |
| `src/ui/modern/ModernPhotoCalibrationEditor.js`: pair, upsert, importExperiment, restoreDraft, initialProjection, bestProjection, meshDraw | Vertex-only validation, ID-as-row-key, vertex lookup for markers, draft v1 and portable experiment v1/v2. Residual projection already dispatches by kind. Need explicit migration and transactional edits. |

## 1. Geometry and viewer

The authored object is primarily a **planar cutout**, not a closed solid.
For local coordinates (u,v), world placement is O + u X + v Y. The local
viewer must display this actual polygon/line geometry; do not extrude,
invent unseen side faces or add selectable thickness. Standard orbit view
remains useful for spans and context, but an isolated planar support is
best inspected face-on. Include a Front/reset view as default, an orthographic
option and back-side indication; an exactly edge-on plane cannot provide
a well-conditioned surface hit. Display the actual physical dimensions in
metres. For coincident coplanar fills, preserve authored paint order as the
default, with explicit cycling/list of ambiguous primitives. Do not use
arbitrary z offsets as geometric coordinates.

Use a small dependency-free Canvas 2D isolated viewer, with a local 3D
camera, pure projection/unprojection, and analytic ray/triangle and projected
edge/vertex tests. No WebGL/WebGPU or new third-party scene library required
for this first implementation. Keep depth/picking independent of Canvas
draw order for noncoplanar surfaces; painter-sorted display is sufficient only
where it agrees with pick visibility. If necessary, report/order ambiguous
intersections rather than promise perfect arbitrary mesh visibility. Test
view consistency. Separate viewer camera, hover, selected primitive and
uncommitted anchor from physical state. Face-on view, orbit, pan, zoom,
wireframe, conventional axes, and click-versus-drag are sufficient.
Use a local orthonormal basis centered near the placed support, transforming
the real authored physical world points (Height=0); spans use the same frame.
This keeps metre precision and includes actual connected geometry. Do not
reuse the physical camera's viewport or model mutation. Reopen object in
front view or restore local viewer state only. Scene-selection MVP is for
the existing calibration Canvas Direct view; Accurate remains supported by
the headless projector, not a new Accurate identity pass.

## 2. Identity contract (snapshot-scoped, not globally persistent)

Existing painter key = placedObjectIndex * 2 + bank + 1. Existing vertex
ID = b{bank}:p{global primitive index}:v{vertex index}. Both depend on
enumeration. Inserting a span/primitive, changing counts, or reordering
columns can shift them. They must not be new persistent geometric identities.

Proposed canonical descriptors (JSON data only, no live JS objects):
- Object owner: bank, objectType, stationIndex (sequence index expressed
  near-to-far = configured count - 1 - drawn for a nontruncated sequence),
  column (existing assigned column, 0 for single row). Include authoring
  context and reject truncated or ambiguous instances. Display far-to-near
  placed index as before; it is not the canonical identifier.
- Span owner: bank, objectType, endpoint object owners (far/near in authored
  order), role (bridge-road, soundly-road, tensas-road, tensas-shore), side
  or edge where applicable. Current Tensas metadata does not retain the edge;
  attach it during authoring instead of inferring from pixels. Existing spans
  are grouped under the later placed instance for painter purposes; preserve
  that grouping/order. For 8F.1 select the package; in the isolated viewer
  include its incoming span(s) with their own identities, optional visibility
  and explicit labels. No main-scene span-specific RGB pass required initially.
- Primitive identity: owner + local authored primitive ordinal (or span role
  within its endpoint pair). Preserve original vertex order/indices, including
  repeated closing points for legacy ID compatibility. Add nonvisual metadata
  at the geometry-authoring boundary; keep primitive order, geometry and style.
- Guard: deterministic versioned authoring/topology signature for each bank,
  binding all layout fields (NObjects, ObjType, ObjDist, ObjDeltaDist,
  ObjSideType, ObjSidePos, ObjSideVar, ObjSizeType, ObjSize, ObjSizeVar) and
  canonical ordered owner/primitive/vertex topology; bind local authored
  coordinates or equivalent stable geometry revision so same-count semantic
  changes are not silently accepted. Define canonical encoding and tolerances
  in implementation, do not hash camera-dependent world floating-point
  coordinates. Exclude camera, photo, atmosphere, display and hypothesis
  curvature/R from the signature; require topology parity across supported
  projection branches, fail explicitly if not. Layout changes invalidate
  rather than silently remap anchors. This intentionally conservative scope
  avoids pretending to have universal feature IDs. Existing v1/v2 legacy
  vertices retain original interpretation; do not retroactively claim they
  had this guard.

## 3. Anchor and observation contract

Keep outer row {kind, landmark, pixel, weight, included}. Introduce kind
'edge' and 'surface' (and keep existing 'vertex' and headless 'metric').
New authored landmark contains id, owner, primitive identity, signature,
and one of:
- vertex: original index;
- edge: ordered pair of adjacent original indices and finite t in [0,1];
- surface: three distinct original indices forming a canonical accepted
  triangle and finite nonnegative weights summing to 1 (absolute tolerance
  1e-9; reject outside tolerance; normalize once at input).
New vertex anchors may share this descriptor; legacy vertex path retained.
Use deterministic triangle vertex tuples, not ordinal triangles, screen
pixels, or unstable post-clipping vertices. Edge indices refer only to
authored perimeter/line segments, not triangulation diagonals. Canonicalize
reversed edges and triangle vertex permutations with their weights. Snap
endpoints to vertices and surface boundary edges to edge anchors where
appropriate; do not turn an internal diagonal into an authored edge.
Reject degenerate segments, triangles, weights, unknown owner/role and stale
signature. No silent fallbacks.

Current landmark.id is also used as row identity for UI markers, duplicate
checks, Undo and solver result matching; moving a legacy vertex changes its
ID. For new anchors differentiate a stable observation ID from geometric
identity: landmark.id remains the opaque observation key sent to fit and
result diagnostics; geometric descriptor has separate canonical anchor key.
Keep old IDs on import; allow a legacy row to become a new anchor while
preserving its row ID (v3 accepts opaque IDs for new descriptors). Do not
change existing saved legacy vertex ID rules. Reject duplicate observation
IDs; prevent duplicate geometric anchors in UI using canonical descriptor
and explicit geometric coincidence tolerance, not observation IDs alone.
Exact key encoding and migration tests belong to 8F.4/8F.6.
No optimizing anchor coordinates: all anchors fixed for fit and diagnose.

## 4. Triangulation, selection and projection

8F.3a implementation: physical local points are scaled in a stable plane;
EarClip carries the original integer vertex index as its third coordinate.
The adapter does not modify EarClip or its legacy callers. Near clipping
for edges preserves the original parameter; perspective screen interpolation
is corrected by reciprocal camera depth. Free View unprojection uses its
actual off-axis rolled camera and forward-depth parameter. Coplanar hits
are returned as distinct primitive candidates; the default ordering is
reverse authored item order within the depth tie, not certified painter
parity. Invalid fills are reported separately, so visibility is explicitly
geometric-only; UI reconciliation and interaction belong to 8F.3b/c.
Scene View inverse remains a separate audited stage (8F.3d).


For planar authored filled polygons (mode & 2), triangulate in their own
plane, using existing conservative EarClip logic with an index-preserving
adapter or extension. Retain original index mapping after duplicate/collinear
cleanup; never change legacy polygon rendering or triangulate wire-only
mode-1 polygons into selectable surfaces. Show outlines/wires and allow
vertex/edge picking on authored segments. For a failed/self-crossing/
degenerate polygon, report surface unavailable, preserve legitimate
edge/vertex choices. No fan triangulation of arbitrary concave polygons.
For spans project to a locally defined plane for planarity/triangulation
checks; if nonplanar beyond defined scale-aware tolerance, do not invent
a diagonal or certify Canvas Direct fill parity; restrict to edges/vertices
until a shared explicit triangulated surface is authored. Use canonical
physical geometry to define indexed triangle connectivity once and check it
across optical variants, rather than choosing a new triangle per pose.

Local ray hit determines barycentric weights on selected actual triangle.
For a local planar object the affine placement commutes with interpolation:
P = sum(w_i * P_i). For a span apply the same weights to its authored world
vertices, respecting both endpoint frames. The physical anchor is a fixed
material descriptor, not a frozen screen position or a metric ground point.
Do not interpolate projected pixels, ray angles or refracted samples.

Projection must resolve the same descriptor in the existing method's bank:
- Accurate: physical Globe/Flat surface, Height already subtracted; resolve
  world point then existing fromWorld ray shooting/visibility.
- Canvas Direct Globe: effective-radius authored geometry with Height=0;
  resolve world point then existing observer translation and terrain mask.
- Canvas Direct Flat: physical zero-curvature authored geometry with Height=0;
  resolve world point *before* signed flatRefractionPoint (nonlinear).
Preserve original pixel dimensions; preview scales only for display. Extend
authoredVertexRanges via shared resolver for new anchors using physical
geometry/initial tangent frame, then reuse the current median range rule.
Keep legacy numerical parity, visibility statuses and invalid objective
handling; mesh occlusion remains not-tested in the headless projector.

## 5. Integration boundaries and stage acceptance

- 8F.1: enrich stable owner metadata/descriptor extraction; reuse RGB
  ownership and highlight, add explicit object-selection action/mode and
  retain legacy vertex clicking. Manual bank/object fallback when raster
  ownership is unavailable. Selecting a package alone must not create row,
  change camera, cancel fit or replace pending pixel. Original painter order
  unchanged. Tests for overlapping packages, two columns, connected spans,
  no vertex near click, and existing vertex selection regression.
- 8F.2: independent local viewer (pure geometry/frame, local camera, input
  lifecycle) using actual authored package and optional connected spans.
  No calibration schema changes required yet.
- 8F.3: indexed triangulation and ray/edge/vertex picking, hover/cancel/
  apply staging, face-on accuracy and overlap/degenerate handling.
- 8F.4: validated anchor resolver shared by physical projection, fit and
  diagnose. Mixed kinds, exact vertex/endpoint parity, analytic interior
  barycentric points, correct Flat signed-refraction ordering, Globe with
  effective vs physical radius, camera movement, span endpoints and invalid
  topology. Test actual Canvas Direct/Accurate supported paths, noting
  renderer approximation and nonplanar policy. Preserve old baseline.
- 8F.5: update all vertex-only editor paths (label, selected, pending,
  byLandmark markers, edit/drag, snapshot, initial/best/residual fit controls);
  separate transaction from viewer navigation. On Apply only, preserve photo
  point, row ID for new anchors, weight, Fit/Validation, row order, record one
  undo and invalidate stale result/cancel worker. Cancel does not mutate.
  Existing workspace Tab/Escape/Delete shortcuts must not leak into viewer.
  Nonvertex markers need direct shared-projector result, not nearest vertex.
- 8F.6: portable v3 + versioned draft payload; strict v1/v2 imports,
  old draft migration, new descriptor validation including pending state,
  saved result consistency/invalidation, no silent remapping on topology
  mismatch. Validate before replacing current draft/import. Recompute or
  discard stale diagnostics. IndexedDB storage version need not change if
  object store is unchanged.
- 8F.7: synthetic and same-photo verification as in implementation plan;
  retain held-out set and avoid fitting anchor locations to residuals.

## 6. Measured bounded checks

Executed repository geometry and EarClip JavaScript directly, no browser.
For each local object type 0..9 sampled drawn=0..127, total=128, bank=0,
variation=0, sidePos=50, hidden=false. For each filled polygon passed
[u,v,0] to the unmodified EarClip triangulate. Source order maintained.
Counts include all repeated variants, not unique shapes.

| Type | Primitives | Filled | Lines / unfilled | Failed fills |
| --- | ---: | ---: | ---: | ---: |
| 0 | 325 | 320 | 5 | 1 |
| 1 | 1024 | 896 | 128 | 0 |
| 2 | 768 | 640 | 128 | 0 |
| 3 | 512 | 128 | 384 | 0 |
| 4 | 1962 | 1364 | 598 | 0 |
| 5 | 597 | 128 | 469 | 0 |
| 6 | 512 | 512 | 0 | 0 |
| 7 | 1038 | 1038 | 0 | 0 |
| 8 | 1304 | 1248 | 56 | 0 |
| 9 | 1304 | 1248 | 56 | 0 |

The type-0, drawn-0, primitive-0 fill returned self-intersection.
A rejection is not proof that the original Canvas fill was wrong. The
isolated viewer must handle it explicitly rather than claim a surface.

Using the existing 13-point Soundly experiment's captured numeric model
(bank 0 type 8, N=128, single row, size 1, variation 0, lateral position
55.5 m, bank 1 empty), generated Height=0 banks in these variants:
physical Globe, Canvas Direct vacuum Globe, synthetic effective-radius
Globe (4R/3, geometry test only), physical Flat. All four had 128 placed
objects, 1558 primitives and 254 soundly-road quads. Exact equality of
ordered primitive type, mode, vertex count and current metadata held against
physical Globe. Maximum fourth-point distance from the plane through
first three road vertices respectively 1.51e-10, 8.59e-9, 1.71e-8 and
2.63e-15 m; zero above 1 mm in each variant. This is a limited topology/
planarity check, not a general proof for arbitrary layouts, Tensas, bank 1
variants, near-antipodal sequences or renderer/picker parity. The 4R/3
variant is not a calibrated atmosphere. No private photo bytes are stored.

No runtime implementation was made. No browser, Node suite, new triangulator,
picking or new projection tests were run. No external viewer library needed
for selected first design. Next commit should implement bounded 8F.1 only.


## Integrated calibration model viewer — architecture audit

8F.5b.2, audited baseline `53386a66d610670e58d67d007d76b661c7fe7283` on
`built-in-demo`. CI 44646834128 completed successfully. User confirmed
selection UX works and proposed replacing the separate Main Model and
floating Magnifier with an integrated model editor beside the photograph.

This is a source audit and revised implementation plan, not an implemented
UI or a browser/performance qualification.

## Current ownership and dependencies

| Source | Current responsibilities | Target |
| --- | --- | --- |
| ModernPhotoCalibrationEditor.js (1478 lines) | Captured scene, original photograph, rows/activePair/pending/editing/Undo, fit worker, residuals, draft v2 and portable v1–v3; also Main Model raster, picking, object masks, preview and floating-viewer lifecycle | Keep calibration state and image-side controller. Supply read-only model scene contracts and explicit selection/authoring commands to viewer. |
| ModernLandmarkViewer.js (1005 lines) | Isolated object viewer, optical crop and physical Free View, stable authored picking, local draft/confirmed point, committed marker rendering/selection, floating window geometry and session restoration | Extract host-independent model viewport lifecycle; mount inline in calibration grid. No independent observation store. |
| CurvatureCanvasDirectPreview.js | Paint effective-radius scene, source-pixel capture, owner/identity passes and vector paintCrop | Reuse painter and capture. No second optics implementation. |
| CurvatureModern.html / ModernApp.css | Photo and Main Model grid plus separate modeless dialog; fixed-window location/resize and fixed-size status slots | One inline model viewport for Globe. Keep stable raster layout and responsive stacked layout. |
| test_modern_smoke.py | Manual and full-scene picking, isolated object selection, floating-window move/resize, crop, Free View, fit, draft/portable | Preserve semantic coverage; replace obsolete window/canvas assumptions after routing changes. |

### Main Model is not just an image

`renderModel` (around 771–842) generates modelRaster, cropSource,
package identity pass, exact owner pass, approximate painter-visible
vertex index, and material marker projector. `openRegion` (around
891–905) uses ownerSpans and packages to choose a physical pivot.
`chooseModel`, `choosePhoto`, `savePair` (1011–1027) implement both
creation orders and legacy fast vertex pairing. `paintBest`,
`drawFitPreview`, `receiveFit` and worker completion (1382 onward)
manage the read-only fitted pose; completed fit automatically switches
to Best Camera. Do not remove these dependencies until their replacement
exists. In particular do not discard the exact owner pass before
replacing its pivot/inspection role. The approximate vertex index and
object mask have separate uses; remove only after parity tests.

### Magnifier is not yet a general optical navigation viewport

`openCrop` takes a fixed, validated source rectangle and paint/build
callbacks. `paintCrop` already supports the entire source raster
region and directly replays vector paths under a source-to-target CTM.
However wheel and drag in Scene View currently enter Free View; they
do not zoom/pan the optical image. `regionGeometry` requires an
owner and physical pivot from a visible owner seed. It transforms
all authored primitives across both banks into a local physical frame,
with 100000 primitive / 1000000 vertex budgets. An empty/sky crop has
no build callback; at present this also prevents optical capture/picking.
Separate optical navigation/capture from availability of a physical orbit
pivot. Keep explicit failure if physical geometry cannot be resolved;
never invent a calibration anchor for a pivot. Use selected visible
owner/point when appropriate, otherwise deterministic visible seed
near view center; no Free View if no valid pivot.

`regionCamera` holds a crop-dependent physical origin/focal scale.
Do not use virtual-radius points as physical coordinates, or convert
viewport pixels into saved photo pixels. Optical zoom/pan only transforms
the displayed source raster; it is not a change of FocalLengthField,
camera pose, Earth radius or atmosphere. Free View is geometric inspection
only. Use original source dimensions for capture and projector, not
current CSS or backing canvas dimensions.

## Target UI and invariants

- Photograph at left, one model viewport at right; at narrow widths
  stack vertically. Default Initial Camera Scene View, full captured
  optical frame. Navigate selects numbered correspondences, wheel zooms
  about cursor, drag pans; explicit Free View enters physical orbit.
  Reset View returns to full initial optical frame, not a camera reset.
  Retain optional rectangle zoom within the same viewport, not a popup.
- Initial and Best are two optical sources in the same viewport. Best
  is read-only for model authoring, but supports navigation and selection.
  Keep automatic Best on fit completion and return to Initial. No change
  to captured scene. Free View is explicit and based on Initial physical
  authoring; when going to Best, retain the initial local view separately
  rather than reusing an initial capture with the fitted pose.
- One activePair, one correspondence collection, one pending pair flow.
  Existing marker colors/numbers, hover, hidden statuses, overlap cycling,
  Fit/Validation, original-photo residuals, cancellation and Undo survive.
  Navigation and selection must not mutate rows, alter fit or cancel worker.
- Maintain stable viewport sizing independent of status text. Host
  lifecycle must not rely on dialog.open/show/close, fixed positioning,
  title dragging or global dialog key suppression in the inline path.
  Keep focus-scoped shortcuts (Tab for candidates only when appropriate;
  no accidental Delete/Undo while typing; Escape semantics explicit).
- Preserve fast legacy Vertex pairing (one direct click when unambiguous,
  explicit choice when ambiguous), legacy bN:pN:vN identity and manual
  fallback during migration. New Edge/Surface use explicit confirmation
  in 8F.5c; do not silently commit local picks. No Flat material authoring:
  retain existing Flat legacy read/vertex behavior during rollout rather
  than broadening new real-photo support. Do not change other Scene,
  Compare or legacy renderer screens.
- Keep object/span inspection capability; exact owner picking and physical
  pivot choice are useful, but separate floating isolated viewer is not
  required in the target Globe layout. Do not retire old object UI before
  covering equivalent inspection or an intentional documented fallback.
- Preserve photo raster original dimensions, numerical fit, worker
  contract, resolver, canonical anchor schemas and portable v1/v2/v3.
  No format bump for portable UI-only changes. Captured scene refresh
  still explicitly invalidates fit; pure viewport redraw never calls
  renderModel's current unconditional invalidateFit path.
- UI persistence is separate from portable data. Old IndexedDB draft v1/v2
  and localStorage curvature-calibration-magnifier-v1 currently bind
  session to id and serialized cropSource. Read old draft and migrate
  valid modelView/crop/local state to inline viewport; if unresolvable,
  fall back to full Initial view without discarding rows, photo or fit.
  Verify topology before restoring local points; no window rect migration
  needed. Persist view/source mode separately from worker/observations;
  avoid serializing embedded photo data on every hover or render.
- Performance: current Main Model runs ordinary/identity/exact-owner
  passes and projects all vertices; Magnifier replays vector paint on
  hover and builds indexed physical mesh. Do not retain both costly
  pipelines indefinitely. Reuse source capture/geometry while only
  viewport transform changes; measure real Soundly before removing
  fallback. Consider separate marker overlay or cached paint for hover
  if profiling shows a need. No unmeasured speed-up claims.

## Implementation sequence and gates

| Stage | Scope |
| --- | --- |
| 8F.5b.3a | Host-neutral viewport contract and optical navigation. Inline-capable lifecycle without changing currently shipping host. Full-frame and cropped source transform, anchored wheel zoom, pan, rectangle/reset; explicit Free View transition and pivot failure. Source/capture and physical geometry independence tests. |
| 8F.5b.3b | Mount one inline Globe viewport beside photo. Route initial and fitted camera source through it, preserve read-only Best and fit completion behavior; stable layout and selection including hidden/out-of-crop markers. Keep temporary legacy fallback route until migration gates pass. |
| 8F.5b.3c | Selected physical point orbit pivot; manual Soundly navigation gate. |
| 8F.5b.4a | Migrate fast vertex, manual fallback, owner/span inspection and draft/viewport session restoration. Test existing v1/v2/v3, old crop sessions, hidden workspace, reset/import/photo replacement, source changes and active fit. Keep Flat legacy route as compatibility boundary. |
| 8F.5b.4b | Remove superseded Globe Main Model event handlers, duplicate raster/index/hit/marker paths and obsolete window chrome/storage after parity. Rework browser tests from window position to inline viewport semantics. Measure Soundly; no alpha release with two visible model editors. |
| 8F.5c | Explicit Use in calibration for confirmed material point in inline model viewer; both creation orders, pending state, stable ID and no duplicate commit. |
| 8F.5d | Transactional Edit selected point (Vertex/Edge/Surface conversion), Apply/Cancel/Undo, original photo/ID/role/weight preserved. Local edit leaves fit valid; commit cancels worker and invalidates stale fit. |
| 8F.5e | Full browser and real interaction qualification, including non-Soundly layout, compatibility and numerical parity. Continue existing 8F.6/7 gates. |

Acceptance before 8F.5c: default full optical view, optical zoom/pan do
not enter Free View, explicit Free View and Reset, no modal/floating
window in normal Globe workflow, both optical source poses rendered
correctly, existing 13-point Soundly calibration unchanged (rows and fit),
click selection on photograph/table/model, hidden-marker identity,
fast Vertex pairing, migration without data loss and stable raster
across wheel increments and status changes. All current CI suites and
manual check of actual UI; document any gaps. No new authoring or editing
UI yet.

## Audit limitations

Static inspection of source and existing tests plus CI status. No local
browser or performance benchmark was executed. The precise inline layout,
gesture modifiers and pivot behavior are proposed defaults, to be validated
in implementation. The old isolated object and Flat fallback retirement
is conditional, not a promise to delete compatibility paths.
