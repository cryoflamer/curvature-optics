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

The opt-in shared document-session adapter now uses the fixed
`sessions/shared-document` key and v2 metadata envelope
(`sessionId: "shared"`, workspace and the three existing domain bindings).
The row revision remains independent of the envelope schema version.
`ModernDocumentSession.emptyShared()` creates the initial metadata candidate;
`select()`, `planRestore()` and the save tracker support it without a tab ID.
`ModernUiSessionStore.create(env).sharedDocumentSessions(contract)` reuses
the exact baseline CAS and post-commit readback implementation of the old
adapter. Each instance must read before writing; a stale revision or
different baseline fails closed. No sessionStorage, UUID, identity claim
or fork is involved. Pagehide invalidates the in-memory access capability
and aborts tracked transactions where possible; a cached page must reload.
Construction does not open IndexedDB. The adapter is metadata only:
domain verification before pointer CAS remains the caller's responsibility.
The Scene/Compare domain adapter also supports a shared lifetime capability
(`captureSharedDocumentLifetime()`) with the same pagehide transaction guard.
Its fixed domain identity `shared-experiment` is disjoint from all old
`working-<tabId>` IDs. It reuses immutable revision, HEAD CAS, digest,
readback and recovery-checkpoint code; no fork API is exposed.
Shared recovery staging additionally checks the current HEAD against its
base revision in the same transaction, so a stale writer cannot recreate
an old draft after another writer commits and retires its draft.
The shared migration candidate is copied only from matching legacy
IndexedDB/localStorage evidence, with source/destination checks before,
during and after copy. Any other key in the working-session store
(including prior preview copies, orphan recovery, or edited shared HEAD)
blocks automatic initial migration; evidence remains intact. An identical
initial retry is allowed. Explicit recovery selection of divergent old
records, metadata inventory and cross-database write coordination remain
necessary before mounting a shared consumer. This is not yet activation
of the shared writer in Modern. The old v1 format and `document:<tabId>` keys remain readable and
unchanged; a separate key avoids collisions with historical tab IDs.

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

### Explicit document-session row adapter

`ModernUiSessionStore.create(env).documentSessions(ModernDocumentSession)`
reuses the exclusive tab lease and IndexedDB database
`curvature-modern-ui-state` (version 1), object store `sessions`.
The key `document:<tabId>` is disjoint from UI rows. Construction does not
open IndexedDB or write Web Storage. An explicit owned read can initialize
the existing database if absent; a missing document row yields revision
zero and null, not an inherited binding. A duplicate's new identity has
an independent empty document session. No automatic document fork is implied.

Writing requires a writable lease, exact tab ID and validated read within
that lease. Reading during resume is allowed; writing requires completion
of lifecycle validation and reconciliation of the newly read row.
The write transaction checks the previous revision and normalized envelope,
validates the stored schema and increments the revision only on successful
CAS. A separate post-commit readback must match the written row before an
acknowledgement is returned. Failed or ambiguous database operations
invalidate the read baseline and require explicit reconciliation. Loss of
ownership aborts pending document transactions where possible and rejects
late receipts; an already committed transaction cannot be undone.

The adapter adds no Web Storage keys, document payloads or live Modern
navigation owner. It is exercised explicitly by tests; no HTML mounting,
domain migration, automatic recovery or deletion API is provided. The
existing portable backup inventories present databases and stores, so the
row remains within that inventory; this is not an atomic multi-DB backup.

### Read-first Scene/Compare working-copy candidate

The existing domain owner, `ModernSessionAutosave`, provides an explicit
`prepareWorkingCopy()` migration primitive and a digest-verified
`readWorkingCopy()`. It does not mount a new live reader or writer. An
external URL/import intent skips private reads. Otherwise the caller supplies
a claimed tab ID, explicit generation guard, Web Crypto and the existing
experiment validator. This primitive is not itself a tab-lease authority.

The first stage copies only a valid durable legacy `current` checkpoint.
A present localStorage fallback must have exactly the same canonical JSON
experiment and a matching timestamp (or no timestamp); divergent, malformed,
local-only or incomplete evidence blocks migration instead of guessing which
copy to open. Source and destination are checked together inside the existing
working-session IndexedDB store under its coordinated writer path. The
candidate is add-only at `working-copy:working-<tabId>`, with format/version,
stable ID, SHA-256 revision of canonical raw experiment JSON, and the original
checkpoint snapshot (including timestamp). Canonical JSON sorts object keys
without reordering arrays; the existing validator supplies the same normalized
experiment for subsequent domain reads. Raw legacy evidence is not rewritten.

A repeated attempt only accepts the exact same source/candidate. A changed
source or conflicting existing row is not overwritten. A successful
transaction is followed by a separate digest-checked readback and source
recheck, then returns a document binding candidate; no session pointer is
written or activated. The legacy current key, localStorage, History, explicit
URL and physical behavior stay unchanged. A failed or interrupted migration
may leave a verified but unbound candidate, which must be reconciled rather
than deleted. Future editable working-copy CAS, local-only recovery,
cross-store binding, actual lease/generation integration and consumer switch
are separate steps. The existing database and store remain compatible with
the portable backup inventory.

### Editable Scene/Compare revision adapter

The explicit `openWorkingCopy(indexedDB,{lease,codec,crypto})` adapter
borrows the existing tab owner's generation-bound `captureDocumentLease()`.
The migration row stays immutable. Each edit is a validated, immutable
`working-revision:<id>:<revision>` row; its revision token contains a
monotonic sequence and SHA-256 of canonical experiment JSON. Returning to
identical historical content cannot reuse an earlier revision token. An
atomic transaction adds that row and updates `working-head:<id>` only after
comparing the previously read head and payload. No-op edits are rejected.
The adapter requires an explicit current read before a write and invalidates
its baseline on an attempted database write. It acknowledges only after
transaction completion and exact verified head/payload readback.

A captured lease is invalid after pagehide even if the same tab reacquires
ownership. Domain transactions participate in the existing backup writer
barrier and are tracked by the tab lease for abort on pagehide. An already
committed transaction may survive lost acknowledgement; a fresh read and
reconciliation are mandatory before retry. The explicit `readRevision()`
reads the exact bound immutable revision even if a later head exists, so
a failed session CAS does not lose the previously acknowledged document.
This is not a completed two-database commit protocol: a head ahead of its
session binding requires explicit reconciliation before editing or activation.
No revision deletion, garbage collection, live consumer switch, or automatic
URL rewrite is implemented here. Existing legacy checkpoint, migration
snapshot, History and independent A/B physics remain untouched.

### Headless experiment session controller

`ModernDocumentSession.createExperimentController()` coordinates the
existing owned session and working-copy adapters without a live UI consumer.
Explicit external intent skips private reads. An unbound session may bind
only a verified migration candidate whose revision matches the durable head.
Migration accepts the same captured tab lease for transaction tracking and
ownership checks. Existing non-experiment workspace/recovery bindings are
not replaced by this controller.

Opening an existing binding reads its exact acknowledged immutable revision
and the current domain head. Divergence enters `recovering`, exposing both
versions and a recovery offer tied to the observed session revision and
head. No editing or automatic promotion is allowed. Explicit acceptance
rereads both stores and CASes only an unchanged offer. A normal save uses
the existing save tracker: domain write/readback, followed by session CAS
and acknowledgement. If an acknowledgement fails, recovery rereads both
stores; it must not invent a saved edit or blindly repeat a write. The
caller retains unsaved input. A later edit during a failed save blocks recovery
until the caller handles that unsaved input explicitly. This controller does not provide crash
recovery for edits that never reached IndexedDB, a UI recovery chooser,
or a new active-workspace owner. No URL or default persistence changes.

### Scene/Compare document session preview

The explicit `?document-session=preview` route uses the owned experiment
controller for startup, edit checkpoints and F5. Adding this flag to an
exact locally registered automatic working URL preserves its verified
resume intent: the flag alone is removed for the identity comparison,
and the generated-entry marker is pinned in the current history entry
without rewriting the address. Later ordinary tabs may replace the
origin-wide issued URL without affecting those pinned entries on reload.
A foreign working marker is not sufficient evidence; explicit experiment
links still import their payload. The ordinary route and explicit
shared/Studio/mode/tab/model routes retain existing behavior; the
document preview and UI registry preview are not combined. Only Scene and
Compare are enabled: other workspaces, History navigation and reset are
disabled pending migration. Startup locks the physical workspace until
verified binding; absent or conflicting evidence fails closed without
falling back to the legacy writer. A divergent head shows the acknowledged
revision read-only and offers explicit confirmation of the exact durable
head. Confirming it CASes the session then reloads. A diagnostic JSON export
contains the two verified revisions and the in-memory experiment, not photo
bytes or a complete portable backup. No destructive recovery.

Each physical edit snapshots the experiment immediately for the recovery
controller, and the normal debounced save calls the controller instead of
writing the legacy working checkpoint or publishing an automatic URL.
The status distinguishes a pending checkpoint, a verified recoverable
draft, and an acknowledged document. The recovery panel has separate
actions for accepting divergent HEAD and restoring unsaved edits. A draft
is loaded explicitly, with autosave disabled during physical and workspace
hydration; afterwards normal debounce commits it. The diagnostic export
includes the latest in-memory input and verified draft when available.
The selected Scene/Compare mode is included in the session acknowledgement.
A no-op edit verifies both stores without allocating a new revision.
A failed write leaves the preview blocked, retaining live data and old
durable records; the explicit share action remains available. Closing or
reloading with unacknowledged edits requests the browser's unload warning;
the warning listener is installed only while a save or unsaved edit is pending
and performs no write. It is removed after acknowledgement. Explicit Copy
experiment URL removes the private document-session preview flag.
Only an acknowledged recovery checkpoint (or committed document) is
durable; an edit still in memory or an interrupted checkpoint transaction
is not guaranteed recoverable. Native BFCache return requires
reload, not stale lease reuse. Existing local UI preferences and unrelated
legacy startup modules remain; this is not yet final ID-only persistence.

### Duplicate experiment document

The document preview requests `claimTab({documentFork:true})`. On a live
token collision, the new identity is claimed and a `document-fork:<childId>`
row is added in the existing sessions store, containing the parent's exact
acknowledged document-session row at that transaction's read. The row is
read back before the copied sessionStorage token is replaced. Failure
retains the original token; an abandoned origin row is harmless evidence.
No new Web Storage key is required. A reload of an unbound child reads
this durable origin, not the current parent selection or legacy checkpoint.

The domain adapter copies the exact immutable parent revision, verifies
its digest and workspace, and adds an independent
`curvature-modern-working-fork` base row with its own working-copy ID,
content revision and source identity/revision/session revision. It never
reads the parent's mutable head or writes the parent. A newer unacknowledged
parent head and unsaved edits are not inherited. Source and candidate
are checked again within the domain writer transaction; identical retries
are permitted, differing records are preserved. Missing or invalid parent
binding/revision fails closed, without legacy fallback. Normal session CAS
then binds the verified child. Fork origins and immutable revisions remain
retained; cleanup and orphan handling are future work. Ordinary UI-only
tab claims remain independent of this document-fork contract.

### Working-copy recovery checkpoint adapter

The existing working-session database has a disjoint
`working-recovery:<working-copy-id>` record. It contains the validated
experiment, owning document ID, immutable base revision, unique draft
revision, format/version and SHA-256 over all recovery fields. It is not a
document head, history entry, or another tab's migration source. A read
verifies the base revision and payload digest; invalid or unsupported bytes
are preserved. No Web Storage payload or new database/schema is needed.

`stageRecovery(experiment, baseRevision, expectedRevision)` snapshots the
input before awaiting I/O, uses the same owned lease and backup writer
barrier, and performs CAS against the observed draft and base bytes in one
readwrite transaction. `null` expects no existing draft. A newer draft
receives a distinct token even if its payload is identical. The adapter
acknowledges only after completion and verified readback. It refuses a
backward base revision. `readRecovery()` restores the draft independently
of HEAD; it does not activate or promote anything.

`retireRecovery(expectedRevision, acknowledgedRevision)` removes only the
exact draft whose payload equals the verified immutable acknowledged
revision (at or after the base). It refuses stale acknowledgements and
mismatched data. The controller must verify session CAS acknowledgement
before invoking retirement; a domain adapter cannot prove that separate
database's transaction. A draft left after interrupted retirement is
recoverable evidence. Parent forks still copy only acknowledged documents.

The live preview uses this adapter via the recovery-aware controller.
Memory-only input and interrupted IndexedDB writes are not guaranteed durable.

### Recovery-aware experiment controller (opt-in)

The recovery-aware controller composes the existing experiment controller,
rather than replacing its domain/session CAS. `markDirty(experiment)`
captures a snapshot synchronously and starts a serialized, coalescing
checkpoint writer immediately. The latest queued edit supersedes older
queued (not in-flight) input. `flushCheckpoint()` confirms the current
snapshot's durable readback; `save()` waits for it before starting normal
document/session CAS. The checkpoint writer may stage subsequent edits
while document CAS is pending, using the then-acknowledged base. A later
draft remains intact when an older save completes. Retirement is serialized
against staging and requires the exact saved payload and acknowledged
session; an edit arriving during retirement is staged afterwards. A write
failure is visible and the latest in-memory input remains available for
export, not silently marked saved.

On open, explicit external intent still bypasses private reads. A draft
matching the freshly verified acknowledged document may be retired without
a new revision (interruption after session CAS). Otherwise, the controller
offers the exact draft for explicit loading, rechecking session, HEAD and
draft before activation. A divergent HEAD is reconciled through the existing
explicit head offer first, retaining any different draft and then offering
it separately. A draft may be based on an earlier immutable revision of
the same document; it is never silently promoted or inherited by a fork.
Loading a draft updates only the controller's in-memory dirty state; the
caller activates its returned payload and separately requests save.

ModernApp mounts this API only on the explicit document-session preview
route. A pending checkpoint is not crash-durable until acknowledgement;
a failed checkpoint requires reload/export or a future explicit retry UX.
No Web Storage changes or new URL behavior are introduced.

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
