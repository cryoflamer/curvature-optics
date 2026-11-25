# Architecture — current runtime

This page describes the **active post-#140.12.74 tree**, not the chronological migration plan. For practical controls, see [user guide](user-guide.md); for ray equations, see [physics](physics.md).

## One primary Modern entry and a preserved Legacy diagnostics entry

```text
CurvatureApp.html?ui=legacy (diagnostics)    CurvatureModern.html (primary)
  Legacy animation/control UI                 Scene / Compare A-B / Demos UI
  CurvatureDemos, ModelAnimation              ModernApp, Scene/Compare state
               |                                         |
        CurvatureModel.js                     CurvatureModel.js
               |                                         |
    Legacy drawing and diagnostics         Physical scene assembly
               |                                         |
          shared scene / geometry / optical / rendering modules
```

- `CurvatureApp.html?ui=legacy` loads the original demo and playback stack, backed by the authored catalog in `src/animation/CurvatureDemos.js`, the instance factory in `src/animation/LegacyDemoManager.js`, `src/app/CurvatureModel.js` and browser controls. Its nine demonstrations contain **80 key states / 71 defined transitions**, as pinned by [the preservation contract](legacy-preservation-contract.md). Its fast animation should **not** be silently replaced with an RK4 per-frame animation.
- **Modern Demos** loads a dedicated, slim `CurvatureDemosHost.html` (not the old `CurvatureApp.html`) in a same-origin isolated frame, using the narrow catalog/state/command bridge (`ModernDemos.js` and `LegacyDemoEmbed.js`). The dedicated host now exposes a same-origin `subscribe`/`command` runtime port, which Modern uses directly; the older `postMessage` bridge remains a compatibility fallback. This removes the dependency on the standalone Legacy HTML shell; its controller has injected manager/output ports and the isolated host uses a DOM insertion port instead of `document.writeln`, but the renderer still has Legacy globals, so the iframe remains an isolation boundary for now. See [host migration notes](demo-engine-host.md). The nine demo families remain authored exclusively in `CurvatureDemos.js`; changing demos stops playback, with no conversion to RK4 or Modern experiment state.
- The Legacy runtime now constructs its model and Canvas through `src/app/LegacyAppContext.js`. Its model-state port can deserialize into an explicitly supplied `CurveAppClass` instance, and its redraw port owns the mounted `GraphX3D` instance. The historical `CurveApp` and `graph` globals remain compatibility aliases: other renderer, panel and animation modules still access them, so **this does not make direct in-document mounting or iframe retirement safe yet**. The context factory is tested with two isolated model/Canvas pairs.
- The authored `DrawModel(g)` entrypoint now also accepts an explicitly supplied model as its **third** argument (`DrawModel(g, diagnosticOptions, model)`). Horizon/object partitions and geographic point helpers receive that same model, and the normal Canvas presenter passes its owning `legacyAppContext.model` through the frame-audit bridge. Old one- and two-argument calls, including controlled diagnostic captures, still use the Legacy global for compatibility. This isolates the geometry **model reference**, not the remaining drawing DOM, audit globals or `ControlPanels`; direct Modern mounting is not yet safe.
- Legacy Canvas routing now lives in `src/app/LegacyCanvasPresenter.js`. Each presenter receives the model, renderer, mode, diagnostic capture and fallback through explicit ports; two presenters can use independent graphs and status displays in one JS realm. `DrawMainCanvasFrame()` remains the historical callback for `GraphX3D`. This is a **draw-routing boundary**, not complete isolation of legacy drawing globals or a justification for removing the Demos iframe.
- `src/ui/modern/ModernLocationCatalog.js` is a read-only, browser-loaded
  identity registry for the [native scenario compatibility contract](native-scenario-compatibility.md).
  It does not register unsupported Scene presets or convert authored Legacy states.
- `CurvatureModern.html` loads its own UI (`src/ui/modern/ModernApp.js`), state validators, scene composition and renderers. **Scene** has one viewport; **Compare** renders two physical configurations using separate A/B graphs with shared camera/object inputs. Compare A and B can use different surface and atmosphere settings.
- `src/ui/modern/ModernRoute.js` routes bare `CurvatureApp.html` and old `?ui=modern` bookmarks to the **canonical `CurvatureModern.html` document** without rewriting browser history back to Legacy. Explicit `?ui=legacy` and historical `?state=`, `?demo=`, `?pos=`, `?play=`, `?tab=`, `?embed=` links still boot the unchanged Legacy runtime for reference and compatibility. Legacy `?state=` and Modern `?experiment=` are **different formats** and are not interchangeable.

Both entry points load some of the same code. In particular, `src/legacy/GraphX3DX.js` is used in **both**. Directory names are insufficient evidence for deletion or ownership.

## Source ownership and flow

| Layer | Notable files | Responsibility |
| --- | --- | --- |
| Browser UI | `src/ui/modern/ModernApp.js`, `ModernSceneState.js`, `ModernCompareState.js`, `ModernExperimentState.js`, `ModernExperimentLibrary.js` | Validated user inputs, A/B configuration, versioned URLs, local experiment storage |
| Application/model | `src/app/CurvatureModel.js`, `LegacyAppContext.js`, `CurvaturePhysicalCamera.js`, `CurvatureMainCanvasRenderer.js` | Shared model inputs, physical camera and rendering orchestration |
| Physical geometry | `src/geometry/CurvatureSurfaceGeometry.js`, `CurvaturePhysicalWorldGeometry.js`; `src/scene/` | Flat/spherical surfaces, object placement, scene/frame contracts |
| Optical solver | `src/optics/OpticalRayTracer.js`, `OpticalTargetProjection.js`, `OpticalSharedRayField.js`, `OpticalRayHorizon.js` | 2D refracted ray integration, target projection, first-ground-contact classification, reuse of optical fields |
| Scene optics | `src/optics/CurvaturePhysicalSceneOptics.js`, `CurvaturePhysicalPolygonFills.js`, `OpticalTowerSilhouette.js` | Visibility and physical scene projection |
| Presentation | `src/renderers/CurvatureFrameRenderer.js`, `CurvatureWebGLGeometryRenderer.js` and Canvas renderers | Rasterize/project prepared scene geometry; optional WebGL2 path |
| Legacy storyboard | `src/animation/CurvatureDemos.js`, `LegacyDemoManager.js`, `src/animation/ModelAnimationX.js`, `src/legacy/` | Authored demonstrations, separately instantiable playback manager and Legacy drawing |
| Verification | `tests/`, `tests/fixtures/`, `tools/check-refactor-closure.js` | Behavioral, numerical and reference-image checks |

Not every module is solely owned by the listed layer. Verify **actual callers and HTML script order** before moving or deleting it. The [isolation audit](legacy-isolation-audit.md) records that discipline; some older counts in it predate the research archival and should not be interpreted as current counts.

## Rendering and performance boundaries

1. The physical optical solution is computed on the **CPU** (the production standard-atmosphere path uses a fused-gradient RK4 optimization); this is independent of the final rasterizer.
2. **Canvas 2D** is the default/reference drawing backend in Modern. The selectable **WebGL2** geometry renderer rasterizes already projected geometry and may differ in line styling/antialiasing; selecting it does not move shooting to a GPU.
3. **Check GPU** queries browser capabilities only. It is not the archived WebGPU optics solver. The optional render profiler is part of Modern diagnostics and is distinct from the removed ten-action CPU research panel.
4. Legacy's animation is optimized for its own presentation/model; preserving it does not mean reproducing its frames with Modern's expensive physical optics.
5. **Atmospheric extinction (optional visual effect):** `CurvatureAtmosphericVisibility.js` modifies Physical object strokes and foundations **after** the cached CPU optical rays have been solved, before the shared Canvas 2D/WebGL2 painter. A visibility range is the approximate 5%-contrast distance: `T = exp(-3 × distance / range)`, with white airlight to match the white Canvas background. Distance is the authored object's observer-relative **geometric range**, a near-horizontal approximation to the optical path, **not** the integrated ray length. Extinction is separate from `n(h)`, horizon/footing classification and clipping. Original optical compositions and ground guides remain unchanged, so changing visibility does not require shooting new rays. Scene has its own persistable setting; Compare shares one enabled flag and visibility range across A/B, persisted in both A/B slots for backward-compatible experiment URLs. Older links without visibility load with extinction off; older A/B-divergent links are migrated using A as the shared source. This is not a calibrated atmospheric-scattering or depth-per-pixel simulation.
6. **Horizon palette parity:** Legacy paints behind-horizon towers with `#666` strokes and `#dcc493` foundations, masks them with a white horizon disk, then paints foreground towers with black strokes and `#a38d60` foundations. The independent geometric compositor reproduces this two-pass styling (in Scene/Compare where that compositor is selected); the Physical path colors visible tower contours according to the **optically classified footing** using that same palette, while its ray-traced silhouettes and sampled polygon fills continue to clip the actually blocked portions. The Physical classification uses the same atmosphere-dependent field as the outlines/fills, never the Legacy disk cutoff; ambiguous or failed footing probes remain at their original styling instead of being labelled blocked. Because a whole tower is tinted from one sampled footing, this is a presentation cue, **not** a pixel-level visibility test or a claim about mesh occlusion. Refracted visibility and ground clipping belong to the physical ray solver. The Legacy Demos iframe continues to use its original renderer.

## State persistence and compatibility

- Modern configuration is an allowlisted, versioned payload managed by `ModernExperimentState.js`. **Copy experiment URL** writes a Modern `?ui=modern&experiment=...` link. **History** is the sole active archive in IndexedDB; portable History JSON retains names, descriptions, pins, screenshots and versioned experiment states. `ModernExperimentLibrary.js` remains loaded only as a backward-compatible plain-JSON codec and to migrate old named localStorage entries (`curvature-modern-library-v1`) without deleting that data. History imports are validated before a single IndexedDB transaction, and its JSON format is separate from the URL experiment schema.
- Legacy uses its existing `?demo=...`, one-based `?pos=...`, `?play=...` and `?state=` semantics. For actual precedence and delayed application, see [Legacy preservation](legacy-preservation-contract.md).
- There is **no promised one-to-one conversion** of Legacy demos or saved states to Modern. See [compatibility findings](legacy-modern-compatibility.md) for the mapping barriers.

## Protected and historical boundaries

**Keep in active tree:** Legacy demos and export, Modern Scene/Compare, production CPU RK4, WebGL2 geometry rendering, required shared modules, physical regression tests, six original Legacy browser reference PNGs and their checksum lock.

**Archived in Git:** standalone `tools/webgpu-optics.html`, the Modern CPU research panel, dedicated CPU/WebGPU research modules and their research-only tests (removed in #140.12.74). The source can be inspected through the [research archive](research-archive.md), provided the pre-removal tag exists in the target clone. Do **not** mistake the retained `OpticalConformalPredictor.js` dependency or GPU capability panel for a revived user-facing experiment.

A future refactor should begin with a specific defect or maintenance goal and pass the [development verification](development.md), rather than another speculative sweep for unused code.

## Focused architectural references
[Interactive rendering](interactive-rendering.md) documents the current shared Canvas Direct/Accurate fallback and camera interaction contract. Remaining browser and optical-quality gates are recorded in [#32](https://github.com/cryoflamer/curvature-optics/issues/32), not a staged Markdown roadmap.

The general architecture above is the current entry point. Keep the following
specialized evidence accessible where maintenance or regression analysis needs
it: [Legacy bundle provenance](legacy-bundle-provenance.md),
[Legacy / Modern compatibility limitations](legacy-modern-compatibility.md),
[camera interaction baseline](modern-camera-interaction-baseline.md), and
[WebGL2 renderer scope](modern-gpu-geometry.md). Earlier step-by-step migration
and cleanup notes are recoverable through [historical records](historical-records.md).

## Portable Modern storage backup — experimental #31 foundation

The portable storage codec lives in
[ModernPortableBackup.js](../src/storage/ModernPortableBackup.js);
its focused contracts live in
[ModernPortableBackup.test.js](../tests/ModernPortableBackup.test.js).
This is the **initial, read-only foundation** for [Issue #31](https://github.com/cryoflamer/curvature-optics/issues/31), also intended for later opt-in external transport in #45.

### Current inventory (before session migration)

The codec explicitly inventories these existing IndexedDB databases, including absence and schema version, without creating an absent database:

| Database | Existing logical contents |
| --- | --- |
| `curvature-modern-working-session` | Scene/Compare working experiment |
| `curvature-modern-animation-draft` | Animation drafts and workspaces |
| `curvature-modern-animation-library` | Saved Animation projects |
| `curvature-modern-reference-images` | Original photo records and optional classifications |
| `curvature-modern-experiment-history` | Experiment History snapshots |
| `curvature-modern-calibration-results` | Archived Calibration results |
| `curvature-photo-calibration` | Legacy draft/active plus named Calibration Projects, summaries and control records |

Any additional same-origin database whose name begins with `curvature-` or `curvature_` is included rather than silently dropped. All object stores are read, not just those known today, with primary keys, values, store key paths, auto-increment settings and index definitions. Current-tab `localStorage` and `sessionStorage` keys under the same prefix are included as **raw strings**, not parsed or migrated. Other origin-storage keys are excluded and their counts are recorded; unsupported/corrupt source values cause failure rather than disappearing.

The records include embedded original photo data URLs where held by the Reference Image Library, not thumbnails alone. A typed, tagged JSON encoding preserves arrays, ordinary objects, dates, binary buffers/views, blobs, files and big integers; unsupported objects fail closed. An archive has a versioned manifest, per-store record counts and SHA-256 hashes plus a whole-payload SHA-256 checksum. `inspect()` verifies these **before any future restoration**. Archive integrity does **not** establish that photo bytes decode to the claimed dimensions, match stored photo SHA-256 identities or satisfy cross-library references; those are separate acceptance checks.

### Safety and limitations

`capture()` uses `indexedDB.databases()`, opens only **existing** databases without an upgrade, uses read-only transactions, reads Web Storage and compares two complete read passes. A changed record, blocked database, missing Web Storage or unsupported browser inventory API fails closed. All origin data is left untouched.

**Two identical read passes are not an atomic snapshot across databases**: a writer can change and restore data between observations. At this stage the archive explicitly declares `writerCoordination:false` and `eligibleForMigration:false`. The codec is not wired to a download button, does not yet freeze/cooperate with active document writers, and deliberately exposes no live restore or destructive replace operation. A green Node test does not establish a usable real-user-data backup.

`restoreIsolated()` first validates the full archive, checks that its reserved `__curvature_backup_verify__<token>__…` database targets do not exist, creates **new isolated databases only**, and reads them back against every captured primary key, record, index and schema version. It never targets a live source name and does not expose an overwrite/merge operation. A repeated token fails closed. These isolated proof databases are left in the origin for deliberate later cleanup; their reserved names are excluded from normal `curvature-` source inventory. A failure can leave an incomplete **isolated** set, but must never change any existing source store. Verification of byte-for-byte structured records is narrower than validation of photo decoding, provenance and cross-database ownership. Browser contract coverage is in [test_modern_smoke.py](../tests/browser/test_modern_smoke.py).

`qualifyEvidence()` is an additional, read-only gate **after** archive `inspect()`. It hashes embedded Reference Image Library originals from their bytes (not IDs or thumbnails), requires the existing browser decoder to check actual image dimensions and MIME, checks annotation ownership, and matches Calibration Projects and archived results by the original SHA-256 + image dimensions. Calibration photo aliases may legitimately differ from the Library record ID. It also checks named Calibration Project summary/revision consistency, project-to-result links, and saved Storyboard frame references. Missing/corrupt originals, orphan annotations, stale summaries, missing result records, and unsupported decoders fail closed. This check is deliberately only **covered-sources qualification**: legacy recovery, Animation working drafts, unresolved session writers and the source-coordination cut still prevent migration acceptance. Only a browser-supplied, read-only decoder should be passed, e.g. `record => CurvatureModernReferenceImageImport.verifyOriginal(record, window)`; callback validation cannot authorize writes.

`fileBlob()` and `readFile()` provide an explicit opt-in, version-preserving JSON `Blob`/`File` transport. Both validate the archive integrity envelope before accepting file contents; malformed, tampered or oversized files fail without restoring data. The bounded JSON transport currently rejects archives above 512 MiB rather than silently truncating them, so larger populated galleries need a separately designed streaming format. The generated filename deliberately says **unqualified** and the API does not trigger an automatic download or expose a UI backup button. This can verify file round-trips but is not yet a coordinated, user-held safety copy or permission to migrate session storage.

### Opt-in cross-tab writer barrier (not yet connected to production stores)

[`ModernBackupWriteBarrier.js`](../src/storage/ModernBackupWriteBarrier.js) defines the common lock protocol for stage 0A, without injecting it into the Modern application or changing existing persistence behavior. A domain writer registers an owner and runs each complete **acknowledged** IndexedDB transaction within `writer.commit(async () => ...)`; the callback must settle only on `transaction.oncomplete` or reject on failure/abort. A backup reader calls `barrier.snapshot(async () => readOnlyCapture())`. Both use one stable, same-origin Web Locks name: cooperating writers hold **shared** locks and can commit concurrently, while the snapshot holds an **exclusive** lock until all its reads complete. If Web Locks are unavailable or not granted, the operation fails closed; no misleading unlocked fallback is used.

**Scope is deliberately limited.** Web Locks do not freeze legacy writers that have not registered, cannot flush uncommitted editor state, and do not prove that tabs with independent recovery data have acknowledged their latest revisions. The returned snapshot reports `coordination:'participating-writers-only'`, lists registrations in the **current JavaScript context**, and always returns `eligibleForMigration:false`. This is a tested coordination primitive, **not** a complete application-wide snapshot or authorization to delete/migrate sources. The first production owner, Scene/Compare working-session `ModernSessionAutosave.write/clear`, now uses this protocol when `navigator.locks` is present; the remaining sources are still unregistered. This alone cannot qualify any backup. Cross-tab browser tests cover a held writer blocking an exclusive snapshot; unit tests cover multiple shared writers, waiting readers/writers, denial, and aborted callbacks.

Future integration must register **every** Modern write owner at transaction boundaries (including legacy recovery transitions), coordinate tab-local pending/failed data and reject incomplete registration or unacknowledged revisions. A wrapper that resolves on IDB request success rather than transaction completion violates this contract. Avoid nested acquisition of the same lock within callbacks: the browser does not guarantee reentrant locks.

### First cooperating source: Scene/Compare working-session checkpoints

The current `ModernSessionAutosave` adapter registers `working.session` through `ModernBackupWriteBarrier` when Web Locks are available on the origin. Its `write()` and `clear()` acquire a shared lock **before opening** the IndexedDB `curvature-modern-working-session` database and release it only when the existing transaction reports `oncomplete`, `onerror` or `onabort`. Ordinary `read()` is unchanged. The existing schema, localStorage sync fallback, URL intent rules, timestamp reconciliation and F5 paths are unchanged. The module publishes a read-only `coordination` flag (`participating-writer` or `uncoordinated`); `makeAdapter(lockManager)` supports isolated tests without changing the active browser instance.

If Web Locks are missing, ordinary user saves still use the prior IndexedDB path (and synchronous fallback); this **cannot** be treated as evidence for a coordinated backup. If the lock manager is present but rejects a lock, the IndexedDB save must fail rather than silently bypass its coordination request; the existing application already reports a failed IDB checkpoint while preserving its synchronous recovery copy. The backup process itself still makes no migration-ready claim. Multi-tab Chromium tests now cover a real working-session write held behind an exclusive backup reader, followed by durable readback and F5. These tests do not cover unregistered Animation, Calibration, History, Library or Web Storage writers.

## Shared Modern session target

The intended contract is **one working session per browser origin/profile**,
shared by all Modern tabs. Normal startup/F5 restores the latest acknowledged
global workspace and document selection; it may differ from the old in-memory
view in that tab. Duplicating a browser tab does not duplicate a document.
Real-time cross-tab synchronization and simultaneous independent editing
sessions are not required. Explicit import/deep navigation still takes
precedence; an ordinary reload is not a new import.

Documents, immutable revisions, originals, archived experiments and recovery
evidence retain their domain identity and ownership. A stale view must not
silently replace a newer checkpoint: use expected-revision CAS, verified
readback, generation guards, explicit conflict/reload/recovery and early
durable checkpoints. A rejected edit remains recoverable/exportable; do not
automatically rebase a stale snapshot. Cross-database acknowledgement still
requires domain commit/readback before session-pointer CAS. UI hydration
must not write back or change a document. Keep workspace-specific panel and
subview choices distinct from global application preferences.

The registry supports a shared `workspace` scope, addressed by workspace name
alone (`sessions/shared-workspace:<workspace>` in the existing UI database).
It requires no sessionStorage, UUID or Web Lock claim. The `global` scope
remains available for shared preferences. Shared workspace writes use CAS
and post-commit readback; a stale manager cannot replace another writer's
acknowledged revision. The new scope is opt-in and not yet mounted in Modern.
One registered owner supplies each complete workspace envelope; do not
split the same envelope among partial registries.

The historical shared document-session adapter reads the fixed
`sessions/shared-document` key and v2 metadata envelope
(`sessionId: "shared"`, workspace and three domain bindings).
`ModernDocumentSession.emptyShared()` and `select()` construct normalized
envelopes for the atomic checkpoint. The old metadata writer and two-phase
save tracker are removed. Historical metadata remains read-only migration
evidence; pagehide invalidates the shared lifetime and aborts tracked
transactions where possible. No tab identity or Web Storage is accessed.

The shared lifetime capability is used by the atomic Scene/Compare
checkpoint. The old metadata and working-copy formats remain readable for
explicit migration. The origin-wide operation lock coordinates migration
with cooperating historical writers, not every live atomic save; the
atomic record's CAS is sufficient for normal edits. Old writers outside
that lock must be stopped before migration.

The opt-in live consumer is `CurvatureModern.html?document-session=shared`
(and historical `document-session=preview` alias). Both use the atomic
controller. Normal Modern remains unchanged pending acceptance. First open
without an atomic record shows verified migration choices in the recovery
panel. Explicit selection and backup/test-profile confirmation are required.
The confirmation is not proof of a verified backup. Existing URL/import
intent, History and auxiliary workspace restrictions are unchanged.

Old per-tab preview rows, fork provenance, pending
journals and immutable revisions are migration/recovery evidence. Do not
auto-merge divergent copies, select one arbitrarily, or delete old bytes.
Verify a selected source and the new shared record before changing startup
or retiring legacy persistence. No tab-token or Web Storage payload is
needed for final session restoration; transient writer coordination may
remain independent of persisted selection. Existing backup/restore gates,
explicit URL compatibility, protected Legacy behavior and asset ownership
checks remain required.

## Extensible Modern UI-state and session primitives

The per-tab mechanisms described below are the **existing opt-in experimental
implementation**, not the target session model. Preserve their data until
verified migration; their identity leases, per-tab forks and UI journals are
not required features of the shared session.

Issue [#31](https://github.com/cryoflamer/curvature-optics/issues/31) provides a
**single future onboarding contract** for Scene, Compare, Animation, Calibration,
the new [Object Explorer #47](https://github.com/cryoflamer/curvature-optics/issues/47),
and further Modern pages. Register a new owner and its UI keys; do **not** add
new handwritten `localStorage` keys, URL autosave behavior or per-panel unload
handlers. This is separate from domain documents, originals and draft payloads.

**Opt-in foundation (loaded as dormant modules by Modern; state is used only in explicit preview mode):**

- `src/storage/ModernStateRegistry.js` defines
  `register({key,scope,version,defaultValue,validate,migrate?})`,
  `get/set/reset/subscribe`, `snapshot(scope,context)`, and
  `hydrate(envelope,context)`. Keys are namespaced and uniquely owned.
  Unsupported newer/unknown/corrupt values remain as inspectable raw
  `evidence()`; invalid data does not silently replace a valid choice.
  Programmatic hydration is silent (no subscription events or save calls).
- Scopes are `per-tab`, `per-tab-and-workspace`, and deliberate `global`.
  One tab's Object Explorer tree must not overwrite another tab's layout.
  Shared preferences have a separate owner from workspace session state.
- `src/storage/ModernUiSessionStore.js` defines an **explicit-use** IndexedDB
  adapter with a versioned `curvature-modern-ui-state` database: `sessions`
  and `preferences` stores. The only new sessionStorage value is
  `curvature-modern-ui-tab-id-v1`, an opaque tab token. Writes require
  `expectedRevision` and report success **only on transaction completion**;
  stale revision conflicts fail instead of clobbering another checkpoint.
  `read()` returns the revision and envelope for registry hydration.
  A duplicated tab that copies this token must eventually fork its
  identity before production activation; the current adapter is not a
  finished duplicate-tab lease system.

Example of a completely new Object Explorer field (the registration alone
contains no storage or unload code):

```js
const ui = CurvatureModernStateRegistry.create();
ui.register({
  key: 'object-explorer.tree.expanded',
  scope: 'per-tab-and-workspace',
  version: 1,
  defaultValue: [],
  validate: value => Array.isArray(value) &&
    value.every(id => typeof id === 'string')
});
```

The opt-in `src/storage/ModernUiSessionManager.js` now links the registry and
storage adapter. A new page registers state keys once, calls `restore()`,
and uses `bindDetails(key, element)` or `bindChoices(key, items)` for ordinary
disclosures and selectable views. User changes automatically queue
revision-guarded IndexedDB writes; `flush()` awaits acknowledged completion,
`lastErrors()` exposes failures, and a stale external revision is rejected.
Bindings are attached only **after** state hydration; restoration and
unchanged values never write. Missing optional DOM nodes are allowed.
No per-page `localStorage`, `pagehide` handler or special serializer is needed.

The targeted Node/Chromium tests exercise an entirely new Object Explorer
tree key and `details` binding, explicit save and F5 restoration, separate
tab/workspace state, shared preferences, collision detection and silent DOM
hydration. These do not implement Object Explorer #47 itself; duplicated-tab
identity leases remain future integration work.

### Read-first preview of Scene/Compare sections and workspace navigation

The **existing** Modern `details[data-workspace-section]` controller has an
explicit preview path for all **18 validated disclosure section suffixes**
(declared in `workspaceInitialSections`): Camera, Surface, Atmosphere, Objects
and Display. Each suffix is registered once as a namespaced key,
`workspace.section.<suffix>`, and scoped independently to Scene/Compare.
A new supported native disclosure joins the same mechanism by being declared
in the section defaults and marked with `data-workspace-section`; no new
storage or event-handler implementation is added. The registry accepts
already-shipped camelCase section identifiers (`camera.savedViews`,
`camera.frameName`) as well as lowercase names, retaining their original
suffixes without rewriting existing saved preference keys.
Visit `CurvatureModern.html?ui-state-registry=preview` **in a disposable private
profile** to enable the preview; normal Modern and explicit share/import links
keep the legacy path. The new modules are loaded but instantiate no new
session storage unless the query switch is present. The query parameter is a
development-only enable switch — it does **not** encode the UI state or
automatically persist a share URL.

`ModernWorkspaceStateBridge` composes the generic Registry, Session Store and
Manager; the same registered key has `per-tab-and-workspace` scope for both
`scene` and `compare`. Its registered default reads the already validated
`ModernApplicationPreferences` section preference **without writing it to
IndexedDB**. If a compatible committed IndexedDB value already exists for this
tab, that value wins for the corresponding preview key. Values absent from
an older registry snapshot fall back to their validated legacy defaults.
The native `toggle` listener is reused, even for separately rendered
Scene/Compare Surface and Atmosphere details: a preview change retains the
ordinary legacy preference for rollback and queues a versioned IndexedDB
snapshot. On first restore, neither old preferences nor new IndexedDB records
are rewritten. Programmatic restoration is silent, and an intervening panel
edit prevents a delayed async preview restore from overwriting the choice.

The preview is deliberately **not** a general production migration or
automatic promotion of all layout choices: unsupported/corrupt records cause
a reported `incompatible` preview status and the original Legacy-controlled
folds remain usable. An unsupported newer/unknown key **blocks whole-envelope
writes** in the generic Session Manager, so the saved raw evidence cannot be
discarded by an older client. The preview records its status through
`CurvatureModernApp.getWorkspaceUiRegistryPreview()`. A full layout reset
now uses the generic `setMany()` batch operation: **one acknowledged
transaction per changed workspace**, not one per panel. The old legacy
preferences remain readable, and no second DOM listener/controller is mounted.
Targeted Node/Chromium tests verify all 18 declarations, read-only legacy
fallback, independent Scene/Compare values, multi-section activation, F5,
no spurious version bumps, incompatible version preservation, reset batching
and the normal-mode no-new-database contract. Before turning this on by default,
verify copied-tab identity handling, startup timing, conflict/failure recovery
and imported legacy data in a disposable profile.

The same opt-in preview now also registers `workspace.settingsTab` in each
Scene/Compare workspace and `workspace.active` with `per-tab` scope.
These keys use the generic manager and existing Settings-tab and workspace
navigation handlers; no competing DOM controllers or storage writers are
added. Legacy `workspace.sceneTab`, `compareTab`, and `mode` values are
validated read-first fallbacks, and the original localStorage preferences
remain present as rollback evidence. Committed private IndexedDB selections
win on F5 unless there is explicit URL/import intent: `mode`/`tab` query
hints, shared experiments, existing Studio subview routes and deliberate
history-entry workspace selections retain precedence. Registry restoration
is delayed until Calibration startup recovery settles and is abandoned if
user navigation or a panel/tab edit intervenes. No document ID is restored
by these layout keys. The per-tab mode and two per-workspace snapshots are
separate acknowledged transactions, not a falsely atomic cross-scope
commit. Reset restores Camera tabs and the mode fallback along with the
folds. Incompatible future keys disable preview without discarding the
stored envelope. Targeted tests cover legacy read-first defaults, separate
tab/workspace ownership, F5 without save side effects, explicit URL priority,
reset, and future-schema refusal.

The opt-in registry also declares `workspace.view` for Animation
(`library`, `editor`, `preview`) and Calibration (`editor`, `projects`),
each with independent `per-tab-and-workspace` ownership. Their existing
`setStudioView` and `showProjectList` controllers remain authoritative:
only an intentional selection is written to the registry, and silent
hydration does not record a spurious user edit or create a new revision.
A valid explicit `studioView` URL route outranks the private Animation
selection; stale asynchronous registry restoration is abandoned if a view,
workspace, tab or panel was edited meanwhile. When Calibration is active,
only the visible Projects disclosure is restored, not the selected project,
project list identity, editor draft or any underlying photograph. A Preview
selected behind an inactive Animation workspace is initialized lazily on
entry. Normal Modern and the older recovery stores continue working
unchanged. These are **preview-only UI choices**, not completion of the
unified document/session migration.

For the opt-in registry, a browser Web Locks lease now verifies the
`sessionStorage` tab ID **before** reading any scoped IndexedDB record.
Duplicated tabs often copy that storage; a simultaneously live original keeps
its lease, so the duplicate generates a new opaque ID. The duplicate may use
its parent's compatible committed UI envelope as a read-only initial fallback,
with revision zero for its own namespace; its first explicit change writes
only to the new ID. No parent record is moved, removed or overwritten, and
ordinary reload reuses the existing ID after the earlier document releases
the lease. If Web Locks are unavailable or the lock request fails, the preview
refuses session restoration/writes and falls back to the existing legacy UI,
rather than treating an unverified cloned token as unique. This is *not*
a general solution for copied legacy draft IDs, crash recovery, or future
multi-tab session documents: those remain separate #31 acceptance gates.

The opt-in UI Session Manager also provides an **explicit** `retryFailed()`
path (via the preview bridge and
`CurvatureModernApp.retryWorkspaceUiRegistryPreview()` for diagnostics).
Before retrying it rereads each failed scope's durable revision. A transient
failure may persist the latest in-memory UI selection with CAS; an IDB write
that committed but lost its acknowledgement is recognized by matching the
saved envelope and revision **without** an extra write. If another writer
advanced that revision with different bytes, retry refuses to overwrite it
and leaves the user's in-memory choice and error available for reconciliation.
This is not automatic background retry or a substitute for future visible
export/retry/resolve controls and document-level recovery.

**Immediate reload before a UI write is acknowledged:** the opt-in
`ModernUiSessionStore` maintains a small, synchronous, tab-scoped
`sessionStorage` write-ahead intent *only for registered UI envelopes*.
Every intentional UI change stages the latest validated snapshot before the
asynchronous IndexedDB transaction starts. Successful acknowledgement removes
the intent (or advances its expected revision when another UI edit is pending).
On F5, after claiming tab identity, the manager first reads the durable IDB
record and validates the pending envelope; it writes an uncommitted intent
only when the stored revision still matches the original CAS expectation, or
accepts identical already committed bytes without a second write. A different
revision, newer schema or corrupt staging record **fails closed**, preserving
both original records for explicit resolution. The journal is not a second
source of truth, is not shared between tabs, never stores physical experiments
or projects, and cannot guarantee recovery if the browser clears
`sessionStorage` itself. The normal Modern route does not create the journal.

Opt-in preview errors now have an accessible, globally visible recovery banner,
independent of the current Scene, Compare, Animation or Calibration workspace.
`Retry UI save` calls the existing generic CAS-guarded `retryFailed()` only
for recoverable live write failures. Revision conflicts, unknown versions or
failed synchronous staging keep Retry disabled rather than offering an unsafe
overwrite. `Download UI recovery JSON` is a **diagnostic evidence export**:
it contains the preview error/status, current opaque UI tab ID, raw pending UI
journal entries (preserving corrupt bytes), and the readable UI-only IndexedDB
envelopes/revisions for that tab; unreadable durable scopes carry read errors.
If a startup journal is malformed, stale against a newer committed revision,
or uses a future key version, the same banner is shown before activating the
preview. It offers evidence export but no unsafe Retry; old preferences remain
usable. The export leaves journal strings and committed rows untouched.
If Web Storage access or an individual read fails, export includes
`storageErrors` and still collects every other readable UI-only record.
It never includes experiment geometry, photograph bytes or Animation/Calibration
project payloads; it is not an import command or an automatic merge.
No recovery bar or new store appears on the normal Modern route. User acceptance
must confirm downloaded file bytes, keyboard accessibility and visual alignment
in Opera before promoting the preview.

**BFCache and tab lease lifecycle:** `pagehide` must relinquish the
exclusive Web Lock **every time**, including when the document is eligible
for the browser back/forward cache. On `pageshow.persisted`, the opt-in
bridge reacquires **the exact same** opaque tab identity; it does not run
the duplicated-tab fork path while keeping the old page's in-memory state.
The resumed lock remains non-writable while each registered UI scope
re-reads durable IndexedDB revisions and its staged journal. Only matching
acknowledged revisions with no pending/failed write authorize writes again.
A lock collision, foreign revision, corrupt pending journal, or any
unacknowledged in-flight edit fails closed; the recovery banner offers a
UI-only diagnostic export and instructs a reload rather than overwriting
another tab. This contract is limited to the opt-in UI state and does
not resolve saved projects, draft identity, crashes, or actual Opera BFCache
eligibility; test browser restoration separately from synthetic lifecycle
event tests. `pageshow.persisted=false` uses normal new-document restore.

**Restore ordering at later integration:** explicit share/import or URL intent
first, document identity and acknowledged revision second, tab/workspace UI
state third, DOM bindings last. Legacy preference keys and raw recovery
payloads stay readable until verified migration. The existing Modern DOM
section controller must be migrated rather than duplicated.

## Document session contract (headless foundation)

The v1 tab-addressed contract and previews below describe retained
experimental code and stored evidence. They are superseded as the target
architecture by the shared Modern session contract above; do not extend
per-tab ownership to additional workspaces.

[ModernDocumentSession.js](../src/storage/ModernDocumentSession.js) defines the
versioned **metadata-only** session envelope and save/restore contract. It is
not mounted in Modern and creates no database or Web Storage keys. Domain
persistence coordinators remain the sole owners of their payloads. The
IndexedDB adapter stores the envelope under the opaque tab ID with a
separate compare-and-swap session row revision, as specified below.

- Envelope version 1 contains `tabId`, `workspace` and three document slots.
  Scene/Compare share the experiment slot (independent A/B settings remain in
  the domain payload); Calibration and Animation retain their own selected
  identities even when another workspace is active. Images and Demos have no
  editable document binding in this version. History is an archive/import
  source, not another working document. UI presentation stays separate.
- A binding is `{id, revision, recovery}`. Revision is an opaque, exact,
  domain-verified token. Calibration can encode its numeric revision;
  Animation must identify the actual committed workspace checkpoint, not its
  collection-wide activeId; Scene/Compare needs a unique working-copy ID and
  verified revision (the legacy timestamp alone is insufficient).
  Recovery is null or `{id, revision, baseRevision}` referencing durable
  evidence belonging to the same document and base revision. No payloads,
  photo bytes or unknown/future schema fields enter this envelope.
- `select()` builds a candidate only. Selection requires an outgoing edit
  guard, incoming domain preflight and verified session CAS before activation.
  `planRestore()` gives explicit external URL/import intent priority without
  reading private pointers; otherwise it reads the exact identity/revision
  and recovery pointer through injected domain readers. Missing or stale
  references never pick a different last-used document. Activation must
  recheck its generation, including asset/provenance verification.
- Live status is clean, dirty, saving, committed, failed or recovering.
  A save token captures tab, document, base revision, session revision and
  edit generation. First the domain owner commits and verifies the document;
  only then may the caller CAS the session pointer. The tracker marks
  committed only after the exact candidate and next session row revision
  are acknowledged. Later edits remain dirty; stale receipts cannot finish
  another attempt. A fork requires separate verified activation.
- Failure after domain commit retains the candidate for reconciliation.
  Recovery rereads both stores and retains original evidence, never blindly
  retries over a newer session revision. A loaded recovery pointer is retired
  only after an acknowledged replacement; actual evidence deletion is outside
  this contract. Dirty/saving/failed/recovering states block switching.

This is a protocol foundation, not a completed cross-database transaction,
durable recovery payload store or migration. Domain adapters must
supply actual verified readbacks and CAS receipts; the tracker confers no
storage authority. The existing opt-in UI journal is temporary and does not
satisfy the final ID-only sessionStorage requirement.
Focused tests: [ModernDocumentSession.test.js](../tests/ModernDocumentSession.test.js).

### Document-session row adapter

The only metadata writer is `sharedDocumentSessions(contract)`, using
`sessions/shared-document`. Historical `document:<tabId>` and fork rows
are read by `inspectLegacyDocuments()`, never written by the application.
The shared metadata reader validates the historical envelope; pagehide
invalidates the captured lifetime. Historical tab document and working-copy
records are read-only migration evidence.

### Explicit Scene/Compare migration

`ModernSessionAutosave.openWorkingCopy()` exposes one migration path:
`inspectMigration(storage)` inventories verified localStorage and IndexedDB
sources, including historical working copies, revisions and recovery drafts.
An explicit user choice identifies the exact source and canonical digest;
there is no implicit selection by timestamp, tab ID, or agreement between
checkpoints. Invalid records are reported without changing their bytes.

The retired intermediate import writer is no longer available. Historical
`working-copy:shared-experiment` import records retain their provenance
and are decoded without alteration. `inspectSources()` and
`migrateSource()` select and write directly to the atomic checkpoint.
Historical fixtures are seeded explicitly in tests, not by a production
import writer. The old `current` checkpoint, localStorage and historical
copy/fork/revision/recovery records remain migration evidence. Explicit
URL/import intent still skips private reads in the controller.
`readWorkingCopy()` and the historical schema decoders remain available
for compatibility with existing portable backups.

### Atomic shared Scene/Compare checkpoint primitive

The replacement primitive `openSharedCheckpoint()` uses the existing
working-session database and store, with one fixed `shared-checkpoint` row.
Version 1 contains the validated experiment, shared document envelope,
optional full draft, monotonic row revision, and SHA-256 of the canonical
row fields. The experiment binding uses `checkpoint:<sequence>`; unrelated
document slots are preserved. Staging changes only the draft and CAS
revision. Promotion replaces the current payload and its binding and clears
the draft in the **same IndexedDB transaction**. Reverted edits clear the
draft without changing the committed document identity.

Every mutation requires an observed baseline, compares the entire row
(including its draft) inside the readwrite transaction, and acknowledges
only after exact digest-verified readback. A lost acknowledgement requires
a fresh read. Page suspension aborts outstanding transactions. No new
immutable revision or HEAD row is produced.

For an already-bound old shared session, `inspectLegacy()` verifies its
session binding, HEAD, draft and draft base and returns a digest-bound
choice. `migrateLegacy()` rechecks the evidence under the same origin
operation lock as the old live controller, compares the exact old domain
rows in the destination transaction, and creates the atomic checkpoint
only if absent. A divergent HEAD is never silently preferred. A draft can
be kept if its base matches the selected revision (or its payload is
identical); otherwise it must remain archived in the old store. Choosing
archive does not delete anything. Old metadata is checked before and
after reading domain evidence under the cooperative lock; old writers
outside that lock must be stopped before migration.

For a profile without a bound shared experiment, `inspectSources()` and
`migrateSource()` use the same validated historical inventory, including
ordinary localStorage/current IDB checkpoints, retired per-tab records,
and orphaned shared imports/revisions/recovery. The explicit selection
includes the source digest and unbound metadata digest. The selected payload
becomes the initial committed experiment (no draft); an old recovery payload
is only promoted by explicitly selecting that source. Existing domain slots
are preserved. No intermediate legacy import or session binding is written.
Selected IDB bytes and any recovery base are compared inside the destination
transaction; localStorage is checked synchronously before put and on readback.
There is no cross-storage transaction for localStorage; stop old ordinary
writers before migration. A bound session must use the separate bound migration.

Both document-session preview route aliases now mount
`createAtomicExperimentController()`. The controller coalesces edits into
one durable draft, promotes it atomically, and queues later edits against
the newly acknowledged row. Reload reads the atomic row first and offers
its draft explicitly. There is no live divergent HEAD to reconcile.
Old bound sessions and unbound source inventories require an explicit
migration selection. For a divergent bound revision and HEAD, the UI offers
only compatible draft choices: keep a draft against its original base (or
identical payload), or archive it without deleting its old record. Cancelling
confirmation writes nothing. A kept draft must still be explicitly restored
after reload; archived drafts remain historical evidence. A clean experiment profile initializes revision one
from the current default scene without an intermediate legacy write. Existing
or invalid working evidence or historical document metadata blocks automatic
initialization. Absence of working-store keys is checked inside the destination
transaction; local evidence and the page generation are checked through readback.
Explicit URL/import startup bypasses the preview as before.
Ordinary Modern is unchanged pending acceptance. Old keys and backups
are not modified; the new key is included by raw backup inventory.

### Historical Scene/Compare revision reader

`openWorkingCopy(indexedDB,{lease,codec,crypto})` reads the historical
immutable revision, HEAD and recovery formats. It has no mutation API.
The exact bound revision remains readable even when HEAD has advanced.
The reader verifies payload digests, revision identities and recovery
bases; malformed evidence remains untouched. Migration captures all
relevant raw rows and compares them in the atomic destination transaction.
The old revision and HEAD writers have been retired.

### Atomic experiment session controller

The old two-store Scene/Compare controllers have been removed. The atomic
controller owns one acknowledged checkpoint, coalesces draft edits and
promotes the exact acknowledged draft. Later edits stay pending during
promotion. A stale CAS or failed acknowledgement blocks further editing
and preserves the latest input for export. Fresh readback distinguishes
a committed promotion from a retained draft. Historical domain/session
adapters remain temporarily for migration and their own contracts.

### Scene/Compare document session preview

The explicit `?document-session=shared` route (and its old
`?document-session=preview` alias) uses the shared experiment controller
for startup, edit checkpoints and F5. Adding this flag to an
exact locally registered automatic working URL preserves its verified
resume intent: the flag alone is removed for the identity comparison,
and the generated-entry marker is pinned in the current history entry
without rewriting the address. Later ordinary tabs may replace the
origin-wide issued URL without affecting those pinned entries on reload.
A foreign working marker is not sufficient evidence; explicit experiment
links still import their payload. The ordinary route and explicit
shared/Studio/mode/tab/model routes retain existing behavior. The joint opt-in
`?document-session=shared&ui-state-registry=preview` enables the shared UI
Registry after the physical document is verified. Scene/Compare settings tabs
and disclosure values use fixed workspace-scoped IndexedDB snapshots with
CAS, not tab IDs or sessionStorage. The document checkpoint remains the sole
active workspace owner; no automatic import of divergent old tab snapshots
occurs. Scene/Compare legacy layout values are verified and explicitly
backfilled once into missing shared workspace rows before editing is enabled;
existing complete rows are restored without rewriting or consulting the
legacy source for migration. Incomplete or unsupported shared rows block
activation. Auxiliary views remain on their staged migration path.
Legacy bytes are not updated by registry interactions. Global application preferences now use a complete versioned global Registry
snapshot: first backfill from validated legacy preferences is explicitly
acknowledged, subsequent restores read IndexedDB without rewriting the
legacy keys, and conflicting global writes surface the same recovery panel.
Global preferences do not own workspace or display-panel layout. A
preference-only redraw does not advance the physical checkpoint. Reset
preferences resets only global Registry values, not workspace folds,
selected document or legacy data; the existing Reset workspace layout
action separately resets workspace scopes.
A failed or incompatible UI restore blocks editing and offers diagnostic
export. The shared layout reset does not change physics or the active
document. Only Scene and Compare are enabled: other workspaces, History navigation and reset are
disabled pending migration. Startup locks the physical workspace until
verified binding; absent or conflicting evidence fails closed without
falling back to the legacy writer. Historical divergent HEADs are handled
only by explicit migration selection. The live atomic row contains the
committed payload and optional draft, not a divergent HEAD. The live controller
exposes only the acknowledged `bound` revision and optional `draft`; historical
HEAD choices remain confined to the migration inventory. Diagnostic JSON
exports include verified state and in-memory input, not photo bytes or a
complete portable backup. No destructive recovery.

Each physical edit snapshots the experiment immediately for the recovery
controller, and the normal debounced save calls the controller instead of
writing the legacy working checkpoint or publishing an automatic URL.
The status distinguishes a pending checkpoint, a verified recoverable
draft, and an acknowledged document. The recovery panel offers explicit
restoration of unsaved edits. A draft
is loaded explicitly, with autosave disabled during physical and workspace
hydration; afterwards normal debounce commits it. The diagnostic export
includes the latest in-memory input and verified draft when available.
The selected Scene/Compare mode is included in the session acknowledgement.
A no-op promotion clears the draft without changing the committed document identity.
A failed write leaves the preview blocked, retaining live data and old
durable records; the explicit share action remains available. Closing or
reloading with unacknowledged edits requests the browser's unload warning;
the warning listener is installed only while a save or unsaved edit is pending
and performs no write. It is removed after acknowledgement. Explicit Copy
experiment URL removes the private document-session preview flag (and the
joint UI preview flag if present).
Only an acknowledged recovery checkpoint (or committed document) is
durable; an edit still in memory or an interrupted checkpoint transaction
is not guaranteed recoverable. Native BFCache return requires
reload, not stale lease reuse. Existing local UI preferences and unrelated
legacy startup modules remain; this is not yet final ID-only persistence.

### Historical fork records

The former document-fork writers are removed. Existing
`document-fork:<childId>` metadata and
`curvature-modern-working-fork` base rows retain their format and are
read by migration inventory. No old records are deleted. UI-only tab
claims remain temporarily for the separate UI registry preview.

### Historical recovery evidence

The old `working-recovery:<working-copy-id>` record retains its format,
including document identity, base revision, UUID and SHA-256 digest.
`readRecovery()` verifies the base and payload without promoting or
retiring the record. Both historical recovery writers have been removed.
Live draft staging and promotion use only the atomic checkpoint; historical
drafts remain explicit migration choices. Memory-only input and interrupted
transactions are not guaranteed durable.

## One-user rollback drill

The pre-refactor safety check is intentionally minimal: use the small
[backup utility](../tools/storage-backup.html) to **Export JSON** from the
current browser origin, save the file outside browser storage, then use the
**same URL and port** in a new private browser window/profile to import into
a **completely empty Curvature origin**. The tool is a standalone maintenance
page: it does not initialize the Modern app or create an IndexedDB database
when opened. Its purpose is to make the empty-target precondition real.

The import first validates the versioned archive, per-store hashes and the
full SHA-256 checksum. It previews store/record/key counts and
**refuses any pre-existing Curvature IndexedDB database or Web Storage key**.
If the target is empty it restores the original IndexedDB database names,
versions, store schemas, indexes, primary keys and values, then the raw
Curvature localStorage/sessionStorage keys. It immediately reads everything
again and requires an exact tagged-value comparison, including photograph bytes.
On success, open `CurvatureModern.html` **in the same new tab** and reload (F5).
Keep the original profile untouched and retain the downloaded JSON plus a Git
tag pointing to the code baseline.

This is a deliberately single-user workflow. Before export, wait until Modern
reports the last edit as saved; navigate to the backup page in the *same tab*.
Do not edit in another tab during the backup. The existing two-pass capture
does not claim cross-database atomicity, and the archive retains its
`eligibleForMigration:false` marker because it was created without an
application-wide writer freeze. This marker is **not** a reason to block
the agreed manual one-user rollback drill once the user has verified a real
download and clean-profile import. A synthetic automated Chromium round trip
validates the tool's mechanics; only a user-held real-data round trip confirms
the user's own backup.

Failure during import can leave partially created databases **in the new
test profile only**; discard that test profile and use another clean one
rather than retrying into an occupied origin. The tool never deletes or
overwrites existing data. `file:` pages, unsupported database inventory,
corrupt JSON, hash mismatch, occupied targets and oversized archives fail
explicitly. Browser-private storage may be removed upon window closure, so
the downloaded file is the durable backup; the test profile is disposable.

The original more extensive coordinated/multi-tab durability design below
is **deferred** until after the State Registry refactor and is no longer a
precondition for the user's manual rollback checkpoint.

### Deferred production-grade backup hardening (not required for this drill)
Earlier proposed production-grade acceptance checks:

1. Coordinate/quiesce all active Modern writers and record acknowledged revisions, or fail export as incomplete. Read/verify again across databases; distinguish clean commits from pending, failed or legacy recovery.
2. Validate the original photograph bytes, SHA-256 identities, project links and archive provenance. Fail a snapshot with missing/unsupported required sources.
3. Provide a browser download outside origin storage, validate its re-import, preview collisions and versions, and restore into an **isolated empty namespace** without touching live databases.
4. Perform a populated-data export → validate → isolated restore → compare (IDs, revisions, original bytes, digests and references) in the target browser, including corruption/quota/concurrent-edit and recovery cases. Keep the validated file outside browser-managed storage.

No existing `localStorage`/`sessionStorage` write or reader is removed by this foundation. Scene/Compare/Calibration/Animation behavior and Legacy links are unchanged. The proposed extensible UI-state registry remains blocked by this gate.

### Targeted validation

From the repository root:

```sh
node --test tests/ModernPortableBackup.test.js
```

This tests codec structure and content integrity, corruption/missing-store rejection, duplicate keys, binary round-trips, read-only empty-store capture and detection of changing Web Storage. It is **not** evidence of a full populated IndexedDB/browser restore.

The atomic shared checkpoint also supports a guarded auxiliary document
selection contract (Calibration and Animation). The physical experiment
payload and its acknowledged revision are retained when the active workspace
is auxiliary. Selection requires a clean physical checkpoint, exact
domain-owned document/revision (and recovery identity when present), a
current page generation, full-row CAS and readback. The domain reference
is verified before the session transaction and after readback. These are
separate databases: a postflight failure retains the pointer as recovery
evidence and prevents activation; it does not roll back a committed domain
record. Physical edits cannot be staged while an auxiliary workspace is
active. The combined opt-in preview (`document-session=shared` and
`ui-state-registry=preview`) enables mounted Calibration selection and
restoration; an unsupported auxiliary restore still fails closed without
a domain reader. Calibration reuses project checkpoint hydration, verifying
the original photograph, full project readback and exact revision. It
rejects empty checkpoints and unresolved recovery references. Entering the
project library without a selected project is transient; it does not
replace the durable Scene/Compare pointer. Opening a verified project
commits selection, and leaving Calibration is guarded by acknowledged
project persistence. Viewer visibility and hydration are not edits. The
ordinary route and historical Web Storage evidence remain unchanged.
The Calibration presentation scope is initialized from verified legacy
preferences once and subsequently restored from its own shared IndexedDB
row. Active project Rename uses the same captured save/receipt path as
editor changes; later pending snapshots preserve captured metadata.
An unselected project can be renamed under the same operation lock after
verifying the shared checkpoint, then using a domain metadata-only CAS
that atomically requires receipt absence. This does not advance the shared
pointer or fork a stale record. A retained selected reference (including
while the physical workspace is selected) must be opened before Rename;
it uses the active receipt path instead. Explicit standalone legacy adoption
uses the existing verified asset-first migration and atomic project/summary/marker
transaction under the shared operation lock and lifetime. It checks the shared
checkpoint and rejects unresolved receipts and changed legacy inline bytes.
Adoption creates an independent project without selecting it, preserves the
raw draft and Web Storage evidence, and never repeats a retained marker.
Concurrent legacy-route editors must remain closed; Web Storage is not part
of an IndexedDB transaction. The Image Library is an explicitly transient
workspace in this preview. Leaving Calibration flushes the editor and
acknowledges the physical workspace, preserving the retained Calibration
reference; F5 in the gallery restores that physical workspace. Return and
saved Calibration usage navigation verify the exact project revision before
activation, without a legacy tab marker. Other usage types remain visible
but cannot navigate until their document owners are migrated. Original
deletion remains blocked. Mounted Animation is not enabled by this contract.

Animation migration starts with a read-only inventory of the existing v1
IndexedDB checkpoint, v2 collection, legacy local checkpoint/collection and
all discoverable per-tab local backup slots. The inventory retains raw
source evidence and explicitly reports invalid records. It does not create
an absent database, choose a winner by timestamp, merge or prune sources.
Exact normalized variants retain source attribution, including divergent
checkpoints with identical timestamps. Source selection and durable migration
are separate operations; temporary keyframe recovery is not yet included.

The headless shared Animation adapter uses a versioned, SHA-256 sealed row
under a new key in the existing Animation draft store, without a schema
upgrade. The older v1/v2 keys remain untouched as migration evidence. Only
explicit adoption of an inspected source or verified absence of legacy
sources can initialize this row; divergent unselected sources remain raw
recovery evidence, not silently merged. Adoption checks the old IndexedDB
keys inside its transaction and local evidence immediately before writing;
concurrent legacy-route editors must remain closed. Each workspace has its
own monotonic revision token. The complete row is the CAS baseline, while
saving an acknowledged workspace changes only its checkpoint and revision
and atomically writes a selection receipt for the shared document session.
A receipt must be retired after the exact session acknowledgement, not by
repeating the document write. The historical collection activeId is not a
shared selection authority. Shared-preview startup resolves link intent
before initializing Animation: no legacy tab/window identity, local backup
replay, pruning or pagehide writer is started. Ordinary and explicit
compatibility routes keep their original recovery behavior. The adapter is
not yet mounted. The shared editor persistence coordinator now binds only
an exact acknowledged workspace, compares normalized checkpoint content
without its wall-clock timestamp, and drains captured edits under the
shared operation lock. It acknowledges each domain receipt before
retirement; explicit retry of a known receipt never writes the document
again. A lost retirement acknowledgement can be accepted only by exact
successor readback and revalidation of the shared selection. A stale
collection or unknown domain-write outcome blocks rebasing, retaining the
latest in-memory checkpoint for explicit recovery/export. Other legacy
source adoption, conflict recovery, keyframe editing and UI remain pending.

The headless Calibration Apply checkpoint adapter supports a single CAS
from an acknowledged Calibration selection to a new physical experiment.
It checks the entire outgoing physical payload, exact selected domain
revision, clean session and current operation generation. Both auxiliary
document slots are preserved. The mounted caller must first verify the
immutable archived result, link it to the project and pin the outgoing
experiment in History; it must hold the shared operation lock during the
final CAS. Live physics must not be mutated until durable acknowledgement.
An ambiguous postflight failure requires reload/readback, not a second
write or a rollback of the durable row. The mounted shared Calibration
Apply uses this adapter for Scene and explicit Compare A/B. It verifies
the archive transfer, exact linked project and pinned recovery readback
under the shared lock; only then may it update live physics and render.
An already acknowledged durable row is never rolled back because a live
render or activation fails. The archive-only Scene-to-Compare action
remains disabled until its separate shared physical transaction is migrated.

The Calibration persistence coordinator optionally uses the shared page
lifetime and an explicit session-selection acknowledgement callback. A
project transaction (including a domain conflict copy) commits first. The
coordinator retains its exact previous/current reference receipt until the
session CAS is acknowledged; failed selection acknowledgement does not
mark the editor clean or repeat the project write. Explicit retry retries
that receipt before saving any later in-memory edit. The shared lifetime
tracks and aborts active project write transactions on pagehide; a
suspended page cannot acknowledge a later save. In shared Calibration the
receipt is stored atomically with the project revision in its domain
database. On reload the controller proves either the exact original
session base or an already committed successor by reconstructing and
verifying the previous checkpoint digest; it must not rebase a receipt
onto a different session. A verified pending receipt offers explicit
`Complete Calibration save` recovery, followed by a new page load.
Retirement requires a verified pointer and exact domain readback. Unknown
or conflicting evidence fails closed without a repeated project write.
This is a two-database recovery protocol, not a cross-database atomic
transaction.

The document-session controller accepts distinct receipt owners for
Calibration and Animation. Startup inspects every configured owner before
restore; more than one unresolved receipt is an error rather than an
implicit ordering decision. Recovery exposes the exact owner and proves
its original session base or acknowledged successor. Ordinary selections,
auxiliary domain save bases and destructive operations reject any pending
receipt, including a receipt committed by another page after startup.
Only the exact domain acknowledgement may advance the pointer while that
receipt exists. The caller holds the shared operation lock throughout the
cross-database protocol.

### Shared Calibration project removal

Mounted Calibration selection, save/acknowledgement, receipt recovery and
Delete participate in the same exclusive origin-wide operation Web Lock.
Delete checks the current shared checkpoint and project revision and
rejects an unresolved domain receipt. If the target is the selected
Calibration project, the shared checkpoint first clears only that
document reference and returns to the acknowledged physical workspace.
The physical experiment and other document slots are preserved. After
CAS and readback of the detached checkpoint, the domain transaction
checks the exact project revision and absence of an outstanding receipt
and deletes its record and summary together. Deleting an unrelated
project does not rewrite the shared checkpoint. Photo originals and
archived results are independent and are not deleted. An interruption
after detachment may leave the original project in the library; it does
not authorize automatic replacement or a dangling pointer. Reload
restores the physical workspace, and a retained project can be opened
explicitly. A stale mounted writer must revalidate its shared base before
a domain write; it cannot silently recreate the selection. This
coordination applies to the combined shared preview, not concurrent
legacy-route editors, which must remain closed during migration.
