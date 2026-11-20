# Reference images and observation sources

Status: 7C.5 foundation, local Library, keyframe links, presentation and portable asset transport implemented. See [demo roadmap](modern-demo-catalog.md) for order and
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

Open **Reference Image Library** below Animation Library in Animation Studio.
Import a local file, select a saved observation, edit its details and click
**Save details**. Camera facts have individual statuses, values, numeric
uncertainties and notes. Not recorded is distinct from explicit Unknown. No
EXIF facts are automatically inferred; the original file retains embedded
metadata. Use **Download original** to retain an external copy, **Refresh** to
reload the current list, or inspect the disabled **Delete observation** control. 7C.2 initially allowed deletion; 7C.3 disables it to protect references. The panel is outside the presentation
stage. No storage is accessed merely by loading Modern with the panel closed.

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
browser; external backups are essential. Project exports include reference IDs but not these
assets yet.

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
**Reference photographs**, click **Load photographs**, select an existing
observation and **Attach**. Multiple photos are ordered, using arrow buttons;
**Unlink** removes only this use. One observation may be attached to any
number of distinct frames or projects. Read-only demo authoring is disabled.
The list displays titles when the local library resolves an ID, `Missing
local photograph` after a successful lookup without a match, and `Unresolved
local photograph` before lookup or if storage fails. Retry with Load photographs.
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

The selected-frame editor's **Load photographs** action shows a scrollable
thumbnail gallery of unlinked local observations. Select a thumbnail then
**Attach**; linked rows retain the thumbnail, reorder and Unlink actions.
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

## Remaining delivery steps

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
