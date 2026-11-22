# Reference images and observation sources

Status: 7C.5 foundation, local Library, keyframe links, presentation and portable asset transport implemented. See [built-in demo contract](demo-catalog.md) for implementation and [#33](https://github.com/cryoflamer/curvature-optics/issues/33) for remaining browser acceptance,
[camera calibration](camera-calibration.md) for the deferred research project.

## Purpose and boundaries

A reference image is an independent observation, not a simulation screenshot,
cover, calibration result or physical-model parameter. One image can support
multiple keyframes and experiments, with different models or atmospheres. A
change of atmosphere must never change, invalidate or silently replace the
photograph. The same observation can be used to evaluate both Globe and Flat.
The model may disagree with it: do not select or crop away contrary evidence.
Keep the original framing and source information. A presentation may show a
thumbnail or fit the original into a panel, always with the observation label.

The existing `ModernExperimentThumbnail` cache owns disposable, bounded
rendered-state screenshots keyed by exact physical state. It is unsuitable
for observation originals: eviction, physical fingerprinting and low-resolution
capture would destroy or mislabel evidence. Reuse image display/decoding helpers
where safe, but do not store observations in this cache or LocalStorage.

## Foundation record (version 1)

`src/animation/ModernReferenceImage.js` is a pure Classic Script/CommonJS
validator (also loaded by Modern before the app). It owns no DOM, persistence,
physics, project or transport side effects. `validate` returns an owned frozen
record; `validateCollection` preserves input order and rejects duplicate IDs;
`validId` checks stable opaque IDs (1–80 ASCII letters, digits, `_`, `-`). A
record has required `version: 1`, `id`, `title`, `original`; optional
`thumbnail`, `description`, `author`, `sourceUrl`, `license`, `cameraMetadata`,
`notes`. Missing provenance is not invented; unknown license is not permission
for republication. Text is trimmed, bounded and must be rendered as plain text.
Source URL, if nonempty, must be HTTP(S), without credentials. It is a citation,
not an automatic image download or a trusted external page.

Each raster descriptor has `{dataUrl, width, height}`. Originals retain input
bytes, including embedded metadata (no recoding); thumbnails are distinct
optional bytes. Supported acquisition copies: PNG, JPEG, WebP; RAW/TIFF and
other formats require a separately documented conversion workflow, not a
silent substitution for the original. Per-original limit: 20 MiB decoded,
32,768 per dimension and 100 million declared pixels. Thumbnail limit: 512 KiB
and 1024 per dimension. Strict canonical base64 and MIME signatures are checked;
actual file decoding, matching decoded dimensions, EXIF orientation, decoded
memory limits and safe thumbnail generation must be checked at ingestion in
7C.2. Signature checks are not full file integrity or authenticity checks.
Limits are initial engineering choices, not scientific limits; revisit using
real photograph sizes. Collection/portable total byte quotas and errors must
be added at the storage/transport boundaries. Data URL is the foundation
representation, not a commitment to storing base64 rather than Blob internally.

### Acquisition metadata

Every supplied `cameraMetadata` field is an independent fact, with `status`
`measured`, `reported`, `estimated` or `unknown`. Measured means supported by
independent measurement; reported transcribes a source or metadata without
certifying its accuracy; estimated is inferred (including a fit, with method
and assumptions in notes). An unknown fact has no value and can carry notes.
A missing field means no entry, not zero. Numeric known facts may include a
nonnegative `uncertainty` in the same units (document meaning in `notes`, no
automatic statistical interpretation); textual facts cannot. Capture date is
source text, preserving partial date/time, timezone or uncertainty instead of
fabricating a full timestamp. Prefer ISO date/time when known.

Numeric fields: `cameraHeightM`, `latitudeDeg`, `longitudeDeg`, `headingDeg`,
`pitchDeg`, `rollDeg`, `focalLengthMm`, `equivalentFocalLengthMm`,
`horizontalFovDeg`, `verticalFovDeg`, `sensorWidthMm`, `sensorHeightMm`.
Text fields: `cameraModel`, `lensModel`, `location`, `heightDatum`, `framing`,
`captureDate`. Geographic coordinates are degrees; heading is clockwise from
true north when known, pitch positive up, roll convention and camera height
reference must be documented in notes when ambiguous. These are observation
facts, **not** Modern `Pan`, `Nick`, `CameraEast`, `CameraNorth` or
`FocalLengthField`. Conversion to the simulation frame and the exact camera
conventions must be audited in the calibration research. Focal length and
35 mm-equivalent focal length are separate facts; cropping and optical center
may alter effective FOV. Neither model fit nor EXIF alone establishes measured
camera height. No optimizer-specific fields, point lists or model parameters
are in the foundation schema.

Example (metadata excerpt, not a complete image record or an actual Soundly
measurement):

```json
{
  "cameraHeightM": {"status":"measured","value":10,"uncertainty":0.2,"notes":"above local water level"},
  "equivalentFocalLengthMm": {"status":"estimated","value":2000,"notes":"from framing; crop unknown"},
  "pitchDeg": {"status":"unknown"}
}
```

## Local Library (7C.2)

Open **Image Library** directly from the top-level Modern workspace tabs,
beside Animation Studio and Photo Calibration. It is no longer nested inside
Animation Studio's project Library. Import a local file, direct image URL or
clipboard image there; select a saved observation, edit its details and click
**Save details**. Camera facts have individual statuses, values, numeric
uncertainties and notes. Not recorded is distinct from explicit Unknown. No
EXIF facts are automatically inferred; the original file retains embedded
metadata. Use **Download original** to retain an external copy, **Refresh** to
reload the current list, or inspect the disabled **Delete observation** control. 7C.2 initially allowed deletion; 7C.3 disables it to protect references. The panel is outside the presentation
stage. Image records are not loaded merely by opening Modern without entering
the Image Library workspace.

`ModernReferenceImageLibrary` uses its own IndexedDB database, version 1,
`observations` store keyed by stable ID. Explicit metadata updates retain the
original and thumbnail byte-for-byte. A monotonic revision protects stale
updates/deletes across tabs. Transactions only report success on completion;
no eviction or LocalStorage fallback. Initial aggregate cap: 100 observations
and 64 Mi UTF-16 code units of serialized records (not an estimate of actual
browser disk usage); individual limits are unchanged. Lists expose thumbnails
and dimensions, not originals; a bounded `getAll` is used internally for atomic
quota checks and listing. Browser quota, decode and transaction errors surface
in the panel. Browser storage remains local and may be cleared/evicted by the
browser; external backups are essential. As implemented in 7C.5, newly exported
linked-animation bundles include their original assets, while older ID-only
files do not; see **Portable transport** below.

`ModernReferenceImageImport` inspects raster header dimensions before decoding,
uses the browser image decoder and verifies decoded display dimensions against
encoded dimensions (including a possible EXIF rotation swap). It preserves the
encoded bytes, creates a separate JPEG preview up to 512 pixels on the long
side, and does not crop. The header check bounds declared dimensions, not all
possible decoder allocations or malformed/animated file behaviour; browser
image decode is not a forensic integrity check. Metadata dimensions describe
the browser's oriented display, not necessarily the encoded axes. No EXIF
parsing or automatic calibration is performed. A browser refusing to decode a
file rejects ingestion; use supported local image files and document any
external conversion.

## Keyframe references (7C.3)

Select a keyframe in the editable Keyframe Editor in Animation Studio. Under
**Reference photographs**, click **Browse photographs** to open the shared
context-aware Image Picker. Select one or several **local** originals and
confirm **Attach selected**. Selected IDs are verified against fresh Library
rows before the one-frame change; browsing or Cancel does not modify the draft.
Multiple linked photos are ordered, using arrow buttons; **Unlink** removes
only this use. One original may be attached to any number of frames or
projects. Read-only demo authoring is disabled.
The list displays titles when the local library resolves an ID, `Missing
local photograph` after a successful lookup without a match, and `Unresolved
local photograph` before lookup or if storage fails. Retry with Browse photographs.
No replacement by title, no automatic remote download. Import a photograph
first using the independent Reference Image Library.

Both v1 and v2 projects (including unfinished and Experimental v2) accept the
optional `keyframes[].referenceImageIds` array of up to 100 ordered distinct
IDs, each matching the observation ID grammar. An empty array is normalized
to absence. Existing projects with no references remain unchanged. The array
is owned and frozen. Draft history, reordering, autosave/recovery, library
save/copy/import and atmosphere variants preserve references; timeline exposes
IDs for the subsequent presentation panel. Library deduplication includes
ordered IDs so that different authored evidence is not silently discarded.
Frame experiments, physical compatibility, exact-state thumbnails and camera
parameters remain independent of references. A missing local observation does
not prevent playback or saving, but must be visibly labeled when resolved.

7C.3–7C.4 JSON backups preserved links only. Starting with 7C.5, new linked
exports include originals and metadata (see transport below). Older linked
ID-only files can be parsed but cannot be safely restored into a named project;
re-export them from the original browser. Existing older applications may reject
new formats; keep prior exports. Do not delete original files outside the app. Authored IDs
stay unchanged when switching atmosphere, including Storyboard variant JSON.

**Deletion safety:** 7C.3 deliberately disables all observation deletion at
both the UI and storage API, not only deletion from a visible frame. A scan
of the currently open project is insufficient: other saved projects, inactive
workspaces, unsaved changes, Undo/Redo and concurrent tabs can cite an image.
A future durable ownership/transaction strategy must cover these before
re-enabling deletion. 7C.5 retains the guard; revisit during 7E. Unlinking and deleting a
keyframe/project do not delete original image bytes. Reload old open tabs
when upgrading (pre-7C.3 code cannot enforce this guard). Browser storage
clearing/eviction is outside application control. This is a conservative
interim limitation, especially near the library quota.

## Reference presentation (7C.4)

The selected-frame editor's **Browse photographs** action opens the shared
Image Picker, showing thumbnails of unlinked local observations with search,
kind/source filters and metadata preview. Explicit **Attach selected** adds
all chosen references in one undoable Studio edit; linked rows retain their
thumbnail, reorder and Unlink actions.
Click a linked thumbnail to open the original, dimensions, provenance,
license, recorded metadata with status/uncertainty, source and download.
Missing images/thumbnails have labeled placeholders; no automatic remote
fetch. The editor does not load originals until explicit inspection.

Studio and Presentation share the same playback stage and independent viewer
layout: **Side by side** (reference to the left of Scene or Globe/Flat),
**Below**, or **Hidden**. Previous/next follows the authored ID order and
starts at the first photo on entering another hold. The divider is adjustable
by pointer or keyboard arrows (20–60%; below uses viewport-height units).
The original is displayed with contain fitting, preserving aspect ratio and
without cropping. Viewer layout and divider sizes last for the current page
session only; they do not change camera, FOV, project or atmosphere. The
original details dialog also works within the fullscreen stage.

Reference ownership is checked against the **painted** timestamp, never the
advancing playhead or selected editor card. A photo is valid at its keyframe
arrival and hold; during travel it is removed immediately (no stale fade),
with space reserved when either adjacent keyframe has observations. A zero-hold
frame can be inspected by jumping to its arrival. A frame without references
and travel between unrelated frames do not reserve space. Failed/unpainted
frames do not show an observation. In-flight reads are invalidated on frame,
choice or project change and hiding; repeated paints in one hold do not read
storage repeatedly. A missing/error observation is not substituted with a
simulation. Metadata is reread on observation navigation or original inspection.

This is a UI-only comparison, not an assertion of camera registration. No
automatic calibration or pixel-aligned overlay yet; the latter is planned after
8A–8E. Existing PNG/video exports still render only simulations. Portable
JSON includes linked originals from 7C.5. Do not claim a match merely because a
photograph is associated with a keyframe.

## Portable transport (7C.5)

The `curvature-modern-animations` envelope remains v1 for projects without
references; linked projects use envelope v2 with a top-level `referenceImages`
array. Nested project schema and local observation records are unchanged.
Every distinct linked ID must have exactly one validated asset; unreferenced,
duplicate or missing entries are rejected. A shared photo is stored once per
bundle even across projects. Original and optional thumbnail bytes, title,
license, provenance, camera facts and uncertainty are preserved. Missing
originals block export with an explicit error. Both compact and complete
Storyboard JSON include observations; only simulated keyframe thumbnails differ.
Library exports retain authored state, Storyboard exports selected atmosphere.
Unlinked observations are not included even in Export all. Keep external originals.

The initial aggregate bounds are 100 observations, 64 Mi characters of serialized
reference data, 80 million characters for whole JSON (the file picker also checks
bytes), and the existing original/thumbnail raster limits. These are application
limits, not a guarantee of available browser memory or disk quota.

Import validates the envelope, links and all raster headers/decoded dimensions
before writes. The observation transaction checks quota and resolves all IDs:
identical same-ID records are reused; conflicts preserve the existing record
and remap incoming links to an independent observation. A repeated unchanged
import reuses its remapping. Complete normalized content, including metadata,
is compared; conflicting provenance is not merged. Then the separate animation
transaction creates or deduplicates projects using remapped IDs, clears History
IDs and leaves the active draft unchanged. The two databases cannot share an
atomic transaction: if the animation write fails after observations commit,
the imported observations remain available; retry safely reuses unchanged assets.
No project is committed with missing imported evidence. A legacy ID-only linked
file is rejected at live import, rather than silently associating unrelated local
IDs; export it again from the browser containing the originals.

Catalog v2 assets are frozen, self-contained and resolved directly from the
shipped bundle during read-only playback, without local observation writes.
Create copy imports its observations using the same collision policy. Built-in
assets undergo structural validation at catalog generation; validate their image
content and publication rights before shipping. Existing Soundly remains unchanged.
No photography is added here. PNG/video composition and safe deletion remain deferred.

## Historical delivery evidence (outstanding gates are GitHub Issues)

- 7C.2: implemented as above; accepted in Opera.
- 7C.3: implemented local ID links as above; accepted in Opera.
- 7C.4: implemented as above; Opera acceptance pending.
- 7C.5: implemented as above; cross-browser acceptance pending. Safe deletion
  remains blocked pending a durable cross-workspace ownership strategy.
- 7D–7E: generic narrative/presentation completion, with independent visual
  and numeric verification and browser acceptance; defer final photo-matched
  Soundly authoring until after calibration tooling (9A–9B).

Source collection for Soundly Causeway must use bridge photographs, not the
separate Pontchartrain transmission-line experiment. Original photo author,
source and publication permission, camera metadata and correspondence to the
bridge scene must be verified before inclusion in shipped assets. No photos
are added in 7C.1. Final images need not correspond to existing Legacy camera
waypoints: explanatory frames and calibrated observational frames serve
separate purposes.

## Canonical calibration photo identity

The existing library records remain version 1; their local IDs are aliases.
For calibration, `ModernReferenceImageImport.identify(record, env)` verifies
the original raster through the browser decoder (orientation-aware dimensions)
and returns a frozen `{version: 1, sha256, width, height}` identity. SHA-256 is
over the decoded base64 file bytes, not pixels, title, thumbnail, or local ID.
Use secure-context Web Crypto (including localhost); fail explicitly otherwise.

`ModernReferenceImageLibrary.ensureOriginal(db, record, crypto, verifyOriginal)`
verifies input, reuses a byte-identical original regardless of alias/metadata,
or allocates a new ID if needed. Pass the real decoder callback
`record => ModernReferenceImageImport.verifyOriginal(record, window)`.
It returns identity, durable row, original source record (retain its attribution
in the future archive), and reuse flag. `findOriginal(db, identity, crypto,
verifyOriginal)` resolves a verified identity, returning null if absent.
Multiple identical aliases resolve deterministically by ID. Hash collisions or
inconsistent dimensions fail closed. No metadata replacement or automatic
merging/deletion. Digests are computed outside the write transaction and the
original set is rechecked atomically; concurrent changes trigger bounded retry.
Existing quota and portable Studio import semantics are unchanged. Scans are
bounded by existing library limits; no persistent digest index or schema migration
is introduced. This API is not yet called by an Apply UI.

## Single entry point for manual image acquisition (#26)

**Permanent architecture rule:** users manually add reference-image originals **only in
Image Library**. Its explicit acquisition surfaces are local PNG/JPEG/WebP files,
direct HTTP(S) image URLs (subject to browser CORS and the 20 MiB limit), and
PNG/JPEG/WebP clipboard image data (Paste image button or scoped paste shortcut).
Image uploads validate signatures, image decode/dimensions and retained original
bytes; `ensureOriginal()` reuses verified byte-identical originals without
overwriting previously saved metadata. Downloading from arbitrary webpages or
bypassing CORS is not supported. A source URL describes provenance, not proof
of photographic authenticity.

**Consumers select existing assets, never manually import them.** Photo Calibration
and Animation Studio Storyboard references use the common, selection-only Image
Picker and apply only verified Library originals. Any future image-backed UI must
reuse this boundary; no independent file/URL/clipboard acquisition controls are
allowed. Picker cancellation or a failed selection leaves the original and
current project state untouched. When no suitable image exists, use Image Library
first, then return to the consumer without losing unsaved state. The
current Calibration and Storyboard editors provide explicit **Open Image Library**
and corresponding **Return to Calibration / Return to Storyboard** controls.
These same-document transitions must retain unsaved correspondences, Studio
working drafts and existing reference links; targeted Chromium and manual Opera
acceptance remain required under #26.

**Necessary transport exception:** restoring/importing existing portable animation,
calibration or complete library backups can restore embedded, verified originals
and reconcile aliases to preserve project integrity. Those internal low-level
functions are not alternative manual upload UI. Preserve ID namespace separation,
SHA-256 and oriented-dimension verification, original bytes, provenance, and
linked project references. Existing demo originals are separate until explicitly
adopted via a supported project operation. Generated simulation screenshots,
render thumbnails and preview pixels are **not** reference photographs and are
not automatically added by Storyboard or a picker.

## Top-level workspace navigation (#26 Stage 3 structural follow-up)

Image Library owns **one** UI mount at `#ModernReferenceImageLibrary`, hosted
in `#ModernImageLibraryWorkspace` and activated by
`#ModernImageLibraryTab` in the existing `CurvatureModern.html`. Its gallery
is no longer inside `#ModernAnimationLibraryView`. The workspace is presentation
only: it does not change the active Scene/Compare physical experiment, open
or create an animation project, or start a separate IndexedDB store.
The Image Library mode (`images`) is a validated browser-local application
navigation preference, not an optics or animation-project mode.
A deliberate selection of this tab is also retained in the current browser
history entry, so an older `studioView` URL parameter cannot unexpectedly
reactivate Animation Studio on F5; the previous Studio subview remains available
when returning to Animation. The gallery loads its existing local and demo
references lazily on entry.

Calibration and Storyboard **Open Image Library** controls use this same
top-level tab. The originating flow enables a conditional **Return to
Calibration** or **Return to Storyboard** action in the gallery; opening the
Image Library tab directly has neither return action. Return restores the
existing editor/workspace rather than importing a new copy. All consumers
retain their existing selection-only Image Picker flow. Retained drafts and
linked originals must survive workspace navigation and reload. Verification
is tracked in Issue #26; no Chromium success substitutes for manual Opera
acceptance of real clipboard permissions, image download CORS and layout.

## Known local uses — read-only usage graph (#26 Stage 4)

Image Library's **Where used?** inspector queries the existing **Animation
Library** project store, **Calibration Projects** metadata store, and
**Animation Studio** recoverable workspace collection. Browser-local recovery
copies and the live Studio/Calibration state are included when accessible.
This is a bounded, on-demand read, not a second authoritative cross-project
index. The inspector groups linked saved animation keyframes, Calibration
Projects, recoverable Storyboards and currently mounted editing contexts.
Each result identifies an owner, its source and — for animation — the exact
keyframe; multiple owners may reference the same original.

**Identity rules:** animation keyframes reference local image IDs; saved
Calibration Projects instead store verified SHA-256 original identity **plus
oriented width/height**. Calibration matching must compare those values, not
an arbitrary matching alias ID or a demo's bare ID. Saved animation navigation
opens the actual project through the existing guarded switch and selects its
exact keyframe; Calibration navigation uses the project's guarded open
operation. Neither path silently imports or replaces original bytes.

**Honest coverage and deletion safety:** the inspector only reports discoverable
local records. It cannot authoritatively prove the absence of references in
other browsers, unreachable tabs, portable files, exported archives, stale
Undo/Redo records or inaccessible stores. Failed reads, inaccessible localStorage and malformed retained recovery
snapshots are reported as **incomplete**; they are never interpreted as an
empty list. Recovery helpers may skip unreadable backups to let the editor
load, but the inspector counts skipped slots and does not claim full coverage. Recoverable
Storyboard links use guarded draft switching **only if** the corresponding
workspace still exists in the active local recovery collection; inaccessible
or foreign-tab drafts report a navigation error rather than reconstructing a
different project. An unsent session-local snapshot that differs from the
loaded workspace remains visible as historical recovery evidence, without
an **Open use** action that could silently select a different version.
These records must first be restored through Animation Studio recovery. Saved owner navigation verifies the current project
revision and refuses stale links until the inspector is refreshed.
**Zero known uses never authorizes deletion**; the physical-delete control
remains disabled until the Stage 5 lifecycle safety contract exists.

A visually consistent Image Library file chooser and toolbar are scoped to
this workspace; the cross-application design system remains tracked by #46.
Automated browser and targeted Node tests do not substitute for manual Opera
acceptance of owner navigation and real stored project data.

## Shared context-aware Image Picker (#26 Stage 2)

Stage 2 replaces the two different selection surfaces with the single
`src/ui/modern/ModernImagePicker.js` Classic Script/CommonJS module. It loads
from the **existing** `CurvatureModern.html` entrypoint before the Studio
and Photo Calibration consumers; there is **no new database**, schema bump,
independent copy of originals or new HTML entrypoint.

- **Browse:** a native modal `<dialog>` with focus restoration, Escape/Cancel,
  thumbnail cards (or explicit no-thumbnail placeholders), search by title,
  author, license and known animation labels, source filter (local/demo),
  kind filter and title/source sorting. The choice inspector shows available
  title, dimensions, source, author, license and existing animation link labels.
  It does **not** claim to enumerate all local usages; `Where used?` remains
  Stage 4. Since v1 observations have no persisted classification, their
  kind is displayed honestly as **Unclassified (legacy)** until Stage 3.
- **Context-specific selection:** Photo Calibration passes `mode: 'single'`
  and namespaced `['library', id]` or `['demo', demoId, id]` keys. Its
  `photoChoices()` still preserves links and demo provenance, but the old
  long selection dropdown is hidden and no longer the user-facing browser.
  The confirmed selection follows the existing `confirmReplacement()`,
  `acceptPhoto()` verified decode/SHA-256/oriented-dimension flow and
  `ensureOriginal()`. A declined replacement leaves the Picker open and
  preserves correspondence rows and the active photo.
- **Frame attachment:** Animation Studio passes `mode: 'multiple'` for
  **unlinked local observations only**, capped by the existing 100-reference
  per-frame bound. The caller re-reads each selected local original through
  the existing validated Library `get()` before changing
  `referenceImageIds`. One confirmation creates one undoable change to
  the selected frame. Unlinking/reordering remains frame-local and never
  deletes an original. Built-in demo IDs are not accepted as local links;
  importing a demo remains an explicit, independent action.
- **Safety:** opening/searching/selecting/canceling the modal only touches
  in-memory UI selection. There is no implicit local photo import, IndexedDB
  write, calibration reset, physics change, preview capture or project save.
  A missing/changed original fails visibly **inside** the Picker and permits
  retry after the issue is resolved. The image library's physical `remove()`
  API remains deliberately disabled.
- **Scope boundaries:** source filtering is real today, but kind metadata,
  tags and unified Library classification still await Stage 3. Full local
  ownership reconciliation, per-owner `Where used?` navigation and deletion
  eligibility await Stages 4–5; no UI usage label authorizes deletion.

Targeted regression evidence includes Node selection/namespace/filter/Cancel
and confirmation contracts, Studio DOM contracts, and Chromium scenarios for
Calibration local/demo identity collision, selected original reuse, declined
replacement, search/source/kind filters, Cancel without mutation, one/multiple
Studio reference attachment, Undo/Redo, missing originals and retry. These
tests do not replace a manual Opera acceptance pass or test every external
browser's archive/restore behavior.

## Unified Image Library — classification and opt-in migration (#26 Stage 3)

The **Image Library** (formerly the nested Reference Image Library panel,
now a standalone top-level workspace) has a thumbnail gallery, search over names/attribution/tags/collections,
source (local vs built-in demo) and independent kind filters, and a local
record inspector. Local records retain the original import and camera-fact
editing form, full-resolution original download and disabled physical delete.
Built-in demo originals are browsable with a **read-only** inspector, and
their keys are namespaced as `['demo', demoId, observationId]`; no shipped
data are automatically copied to the browser's local observations.

**Storage ownership and backward compatibility:**
- Original `ModernReferenceImage` records are **still exactly v1** and
  remain in the `observations` store of
  `curvature-modern-reference-images`. Their encoded raster bytes, IDs,
  verified identity, attribution, license, source URL and typed camera
  metadata are not modified merely by introducing classifications.
- Classification is separate: `kind` (unclassified, photograph, diagram,
  map, graph, render, screenshot, illustration, other), bounded `tags`
  (maximum 20 × 64 characters) and `collections` (12 × 80 characters).
  A new `annotations` object store in **the same IndexedDB database**
  uses observation IDs and **independent optimistic revisions**.
  Missing annotations are always displayed as **Unclassified (legacy)**;
  no kind or scientific evidence claim is inferred from the MIME type,
  filename or currently linked project.
- Ordinary reads, imports and observation metadata edits use an
  *unversioned* IndexedDB open, so a user's existing v1 database is **not
  automatically upgraded**. The classification editor remains disabled
  until explicitly activated. A user first clicks **Download full backup**,
  verifies the JSON file was saved, then confirms **Enable kind & tags**.
  That explicitly upgrades the same database to schema v2 without rewriting
  observations. If another tab blocks the upgrade, it fails visibly; closing
  the blocking tab and retrying is necessary. An older application version
  that opens `curvature-modern-reference-images` with version 1 may then
  fail with `VersionError`; there is **no silent downgrade**.
- The full local-library backup has
  `{format:'curvature-image-library-backup',version:1,observations,annotations}`;
  it includes **all original bytes**, validated record revisions and optional
  classifications, distinct from portable Animation Project JSON. The
  **Restore complete backup (merge)** input validates every record and
  annotation and actually decodes each raster before any IndexedDB write.
  It inserts originals and their annotations within **one transaction**.
  Existing rows and classifications are not overwritten or deleted. IDs with
  conflicting provenance are safely remapped, retaining both aliases.
  Attempting to restore annotated data into a v1 database fails closed until
  classification is explicitly enabled. This is a *non-destructive merge*,
  not a destructive whole-browser rollback or a cloud backup service.
- The original observation metadata revision and independent classification
  revision must both match when saving details; an editor save is one
  `readwrite` transaction across both stores. Stale tabs, invalid tags,
  size/quota violations, missing originals and corrupted classification rows
  must fail without changing the photograph or its provenance.
  Import/export of existing Animation v1/v2 bundles remains unchanged;
  classification is **not silently inserted** into their project schemas.

**Testing and acceptance:** targeted Node tests cover a seeded v1 database,
version-neutral reading, explicit v2 upgrade, byte-for-byte original
preservation, atomic two-revision edits, annotation validation, import ID
collision, corrupt backup/decoder failure and safe merge/restore. Targeted
Chromium covers the actual download → upgrade → classification → reload →
backup restore path, and read-only built-in/local ID separation. These
checks are distinct from manual Opera UX acceptance and from Stage 4's
authoritative **Where used?** usage graph. Asset deletion remains disabled.

## Unified Image Library architecture and migration contract (#26)

This section fixes the ownership, identity, migration and safety requirements
**before any schema upgrade or shared-picker implementation**. The existing
Reference Image Library remains the one physical source of user-imported
originals. The following is the planned compatibility contract, **not** a claim
that unified classification, a complete usage graph, or safe deletion already
exists.

### Existing owners and resolution boundaries

| Source or owner | Durable identity and actual relationship | Discovery or hazard |
| --- | --- | --- |
| Local Reference Image Library | `curvature-modern-reference-images` IndexedDB v1, `observations`, records `{id,revision,record}`; `record.version===1` contains original raster, optional thumbnail, provenance and camera facts | Authoritative local raster. The existing 100-record / 64 Mi-character quota, revision CAS and disabled `remove()` remain. `list()` is metadata-only; `get()` returns the full original. |
| Saved Animation Library | `curvature-modern-animation-library` IndexedDB v1 `projects`; `project.keyframes[].referenceImageIds` addresses **local** observation aliases | Scan all saved projects and their exact frame references. Project keyframes have **no independent stable frame ID** in the current portable v1/v2 format; ordinal/name are not long-lived identity. |
| Animation Studio working state | `curvature-modern-animation-draft` IndexedDB v1, version-2 collection, saved checkpoints, removals/tombstones; tab-local session recovery and bounded editor Undo/Redo | Active and inactive persisted workspaces are distinct from the saved Library. Recoverable tab-local/other-tab edits may not be enumerable by another tab; never call a partial scan exhaustive. Studio draft frames have their own `key`. |
| Built-in demos | `ModernDemoCatalog` bundles carry their own `referenceImages` alongside read-only projects | Shipped assets belong to `(demo, catalog ID, observation ID)`, not `(local, observation ID)`. Browsing a demo does not import its originals; explicit Create copy uses collision-aware import. |
| Photo Calibration working editor | `ModernPhotoCalibrationEditor` carries a verified original and working correspondence/Undo state; `photoChoices()` combines local observation rows, saved animation project labels and built-in demos using namespaced picker entries (the older long dropdown was replaced in Stage 2) | Selection alone does not create a local alias. `acceptPhoto()` calls `ensureOriginal()` before committing a new photograph and discards correspondences only through its existing confirmation path. |
| Saved Calibration Projects | `curvature-photo-calibration` IndexedDB v2 `projects` plus summaries; `project.photo.identity={version:1,sha256,width,height}`, with separate `aliasId` and source; image bytes are **not** stored in project checkpoints | Find the asset by **verified digest + oriented dimensions**, not by alias or thumbnail; the stored alias is provenance, not a guaranteed current local row ID. Scan active *and inactive* projects, including conflict forks and their retained checkpoints. |
| Calibration result archive | `curvature-modern-calibration-results` IndexedDB v1 `results`; the immutable result payload refers to verified photo identity | Results are separate durable users of an original, even when a Calibration Project is deleted or inactive. Do not deduce use from the current editor alone. |
| Compare registration and presentation | Existing Compare/reference display and calibration-result navigation resolve originals through their owning archive or animation frame; generated simulation thumbnails live in separate caches | Count only actual durable photo links in the underlying owner, **not** image previews, temporary rendered pixels or repeated UI displays. New independently persisted presentation links require their own later relation adapter. |
| Portable transport and recovery | `curvature-modern-animations` v1 for unlinked data, v2 with exact `referenceImages` for linked projects; calibration/photo formats and recovery checkpoints are distinct | Every referenced local ID must resolve before linked export. Import validates content and remaps conflicts before committing linked animation projects; an ID-only legacy linked file cannot safely choose a local original. Inaccessible exports and other browsers are **not** locally discoverable. |

The image viewer, rendered History screenshots, gallery covers, calibrated
residual plots and generated frame previews are **not automatically original
observations**. They may become explicitly authored generated assets in a later
feature, but must not be silently relabeled as independent photographic evidence.

### Identity, namespaces, classification and quotas

- **Canonical original:** use the existing verified `{version:1,sha256,width,height}`
  identity, where SHA-256 covers **original encoded file bytes**, and dimensions
  are browser-decoded/orientation-aware. Both `identify()` and
  `ensureOriginal()/findOriginal()` must retain real decoder verification and
  fail on inconsistent dimensions or digest collisions. A hash without decoded
  verification is insufficient. Different encodings with identical visible
  pixels remain **distinct originals**, not automatically interchangeable.
- **Local alias:** `('local', observationId)` is never equivalent to
  `('demo', demoId, observationId)` merely because the string IDs match.
  Calibration identity can resolve multiple local aliases with the same
  verified original. Such aliases need not have identical attribution or
  image-kind metadata; never rewrite their provenance or the old links
  merely to reduce duplicate rows.
- **Image kind** describes the source material, not its use: photograph,
  diagram, map, graph/plot, render, screenshot, illustration or other.
  Existing observation v1 has no kind field: show a conservative
  **legacy/unclassified** presentation until a user classifies it; do not infer
  a scientific evidence claim from the MIME type or a filename. A simulation
  screenshot may be a valid *presentation asset* without being an observation.
- **Tags and collections** are optional bounded user metadata (no automatic
  category from filenames, source URLs or imported captions). A role such as
  calibration input, animation frame reference or illustration is derived from
  a real owner relation; it must **not** become a single mutable `image.type`.
- **Implemented migration design:** keep `ModernReferenceImage` v1
  raster/provenance records and portable animation v1/v2 payloads unchanged.
  Classification/tags live in the versioned `annotations` store in the
  **same** Reference Image Library database with independent optimistic
  revisions. All original read/write call sites use version-neutral opens;
  explicit upgrade to schema v2 occurs only after backup and confirmation.
  Metadata edits that involve annotations are atomic. Missing annotations
  default to unclassified without rewriting any v1 original or generating
  thumbnails during upgrade.
- **Compatibility:** existing observation rows, photo identity, metadata,
  calibration project checkpoints, archive references and portable animation
  v1/v2 exports must still load byte-identically. If classification is carried
  in a future export, use an explicitly versioned optional transport extension
  **without changing legacy payload interpretation**; older clients must
  not silently misread annotations as original provenance. A newly upgraded
  database may be unreadable by the older IndexedDB-v1 application
  (`VersionError`): provide a validated legacy export and an explicit
  backup/restore path *before* upgrade, not a claim of transparent rollback.
- **Quota:** annotations/indexes and migration scratch space require explicit
  bounded size accounting without weakening the 20 MiB original, 512 KiB
  thumbnail, 100-original, or 64 Mi-character collection limits. Prevent a
  partial upgrade, oversized tag entry or browser quota failure from silently
  dropping original bytes; retain disabled deletion as the default.

### “Where used?” relation and completeness contract

“**All known local uses**” means all references discoverable from the
**successfully scanned, accessible** authoritative sources listed above at the
time of inspection. Results must carry a per-source status (`scanned`,
`unavailable`, `stale` or `unsupported`), read revision and explanation.
An error in one source is *partial visibility*, never “zero uses”.

Recommended read-only relation descriptor:

- `asset`: namespaced local/demo key **and/or** verified original identity,
  with a distinction between an exact alias link and a content-identity match;
- `owner`: type and stable project/result/workspace ID, source database,
  revision or generation, and a readable project name;
- `location`: selected keyframe identity or locator, calibration photo role
  or archived-result ID; `role` reflects actual field usage, not user tags;
- `evidence`: exact source path and lookup time, plus availability/revision
  status; `navigate` is offered only when its target can be revalidated.

For saved animations the current schema supplies **frame ordinal and project
revision**, not a permanent frame UUID. A “Go to frame” link must fetch the
project again, check its saved revision and original reference at the ordinal,
and either navigate to that confirmed frame or show **moved/changed**, without
silently opening another frame. Adding stable frame IDs later requires its own
versioned project-migration design; do not repurpose `sourceSnapshotId` (History
provenance) as a frame key. Studio working drafts already have frame `key`,
but a stored checkpoint or a concurrent tab may supersede them. A checkpoint's
`savedAt` alone is not a complete identity: two divergent tab snapshots may
carry an equal timestamp. Navigation re-reads IndexedDB and compares the full
captured draft content in addition to the timestamp and frame/photo link.
If the requested historical snapshot is not loaded and current, fail closed
instead of silently choosing a newer workspace with the same ID.

Calibration links match photo identity, **not** just `aliasId`. Saved
Calibration Projects and separately archived results can both reference the
same digest and remain separate usage rows. A selected demo asset can have
shipped demo frames as usages; their keys remain namespaced and must not
show local users merely because an ID string collides. Deduplicate duplicate
**displays** of the same persisted owner relation, not distinct authored uses.

Project-cover images uploaded in Animation Studio are **presentation covers**,
not linked reference photographs. That existing cover-specific file input is
distinct from the Image Library's sole manual reference-image acquisition
entry point. JSON project, calibration and History imports likewise remain
portable-data transport exceptions.

The current read-only local scanner also inspects immutable Calibration Result
Archive summaries by SHA-256 and oriented dimensions. Archived results remain
listed independently of any surviving Calibration Project; without a dedicated
result viewer, they carry no misleading substitute project navigation.
Built-in demo images are inspected separately in their shipped namespace.
The inspector shows their exact shipped keyframe ordinals without importing
the asset or joining a coincidentally equal local image ID. These read-only
demo rows currently have no direct frame-navigation action.

A projected usage index may accelerate the inspector, but every view must
reconcile against the appropriate authoritative records; never use cached
counts or absent index rows as proof of global non-use. Explicitly label
unavailable other-browser data, unopened external files, superseded session
states and older application tabs as **outside guaranteed coverage**.
Navigation must pass the owner’s existing unsaved-changes, revision and
workspace-routing guards. Missing owners or unresolved images get actionable
error states; no title-based or nearest-match substitution.

**Delete remains disabled** until the system has a defensible deletion
protocol across all durable stores *and* pending/in-memory/recoverable state
in other tabs. Different IndexedDB databases do not share a transaction.
A successful usage scan followed by an unrelated asset deletion is not
atomic. A cross-tab lease/index can be stale, and cannot by itself prove
absence of an older-tab Undo/recovery reference. If an authoritative,
transaction-bound revalidation or stronger shared ownership protocol cannot
guarantee safety, fail closed. Unlinking is a change to **one verified owner
relation only**, and never deletes or recodes the original.

### Rollout and pre-migration verification gates

1. **Read-only usage scanner and coverage reporting first.** Enumerate saved
   animation projects, all durable Studio workspaces, Calibration Projects
   (including inactive/forks) and result archives by their own native APIs.
   Include demos separately. Test partial/read errors, unverified aliases,
   cloned or stale tabs, removed owners and missing originals. Keep global
   deletion disabled.
2. **Shared picker contract (implemented in Stage 2):** context
   supplied by caller (`calibration` single-select verified original versus
   `animation-reference` bounded multiselect local alias), namespaced choice
   keys, thumbnails, search and metadata, explicit Apply/Cancel and a
   post-selection domain recheck. Browse/select/cancel performs **no write**.
   Reuse calibration’s existing decoder/SHA/dimension/`ensureOriginal` path
   only after the user confirms replacement; preserve correspondences and
   unsaved project state on any failure. Never attach demo IDs directly as
   local frame reference IDs.
3. **Migration tests before an annotation-store upgrade:** seed actual v1
   IndexedDB rows, linked animation v1/v2 projects, two different attribution
   aliases with one original, active/inactive drafts, verified calibration
   identities and archived results; then upgrade and assert unchanged
   originals, revisions, IDs, provenance, camera metadata, links and decoded
   hashes. Test malformed/oversized kind or tag data, quota abort, blocked
   upgrade with old tabs, corrupted/missing annotation rows, and explicit
   legacy backup export. The old v1 application must either safely fail to
   open the newer schema or use a separately verified read-only fallback:
   never write a downgrade migration that discards classifications or photos.
4. **Portable / multi-owner tests:** ensure project import ID remapping never
   redirects existing links; repeated import is idempotent; linked v2 bundle
   includes one original for multiple uses; old ID-only linked exports fail
   safely; duplicate demo/local ID strings stay separate; cross-browser
   restore hydrates calibration identities only from verified originals.
   Verify undo/recovery/tombstones, owner deletion and concurrent-tab
   revisions; failed second-database writes must be retryable without
   half-linked projects or unacknowledged orphan removal.
5. **Browser and safety acceptance:** after the above APIs exist, targeted
   Chromium tests must exercise both pickers, browse/cancel/no mutation,
   missing and invalid originals, Where used? navigation and per-source
   incomplete coverage. Manual Opera verification and real-data export/import
   acceptance are separate. Do not close #26 on a green unit test or a
   decorative use counter.

This design deliberately defers the storage schema, metadata migration,
shared visual picker and deletion enablement until the corresponding
targeted implementation stages can enforce these contracts.

