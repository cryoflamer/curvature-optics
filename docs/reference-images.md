# Reference images and observation sources

Status: 7C.2 foundation and local Library implemented; links, presentation and
portable transport are subsequent steps. See [demo roadmap](modern-demo-catalog.md) for order and
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
reload the current list, or **Delete observation** after confirmation. There
are no links in this stage: before 7C.3 enables links it must protect all uses
from deletion (or disable deletion). The panel is outside the presentation
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
browser; external backups are essential. Project exports do not include these
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

## Remaining delivery steps

- 7C.2: implemented as above; browser acceptance pending.
- 7C.3 (next): optional ordered references by ID on a keyframe, sharing one asset
  across uses; preserve through editing, copies, Undo/Redo and recovery;
  define stable ownership/access and handle missing IDs explicitly. Keep
  metadata out of active physics/compatibility and exact-state cache keys.
- 7C.4: Studio and Presentation observation panels, original full-size view,
  source/author/license, known/unknown facts and clear model-vs-photo labeling.
  Respect painted timeline and selected keyframe; do not change camera or
  atmosphere. Read-only demos cannot edit observation data.
- 7C.5: self-contained portable bundle with each referenced asset at most
  once, validated links, quotas and collision policy. Existing v1/v2 projects
  remain readable. Complete and compact storyboard export distinguish
  observation assets from optional simulated thumbnails; never silently discard
  evidence. Save/Library exports use authored state; Storyboard uses selected
  variant with the same references. Stage schema and catalog changes here or
  at the first point required by links; test import/copy/reload/all launch paths.
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
