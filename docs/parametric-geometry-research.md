# Parametric geometry and LLM-assisted 3D reconstruction — research and design

> **Status:** architecture research and proposal, **not an implemented feature**. Prepared against `main` at `306d591394ff43af566e94c13c0dd079774e3b02` (2026-11-22). GitHub Issues, not this document, govern current execution state and acceptance. No measured 3D reconstruction accuracy or runtime performance is claimed.
>
> **Purpose:** preserve the research evidence, alternatives, scientific constraints and proposed incremental implementation of a deterministic Geometry DSL / Geometry Workshop, eventually driven by image-capable LLMs and calibrated photographs.

## 1. Problem and intended workflow

Real optical observations require recognizable **physical silhouettes and occluding surfaces**, not merely attractive meshes. Manually editing many supports, bridge spans, transmission-line structures, buildings or terrain elements is slow and error-prone. A user should be able to describe or photograph a real structure, obtain a **parameterized hypothesis of its geometry**, inspect/edit it, and compare its optical projection against independent observations.

Proposed workflow:

1. Import one or more original reference photographs, with their provenance; optionally import drawings, dimensional measurements, GIS geometry or survey data.
2. An image-capable LLM identifies *candidate* parts (e.g. supports, deck, rails, repeated spans), topology and constraints, then emits **validated declarative geometry**, not executable source code.
3. A deterministic compiler expands the description into stable, identified world-space primitives.
4. A geometry-only 3D preview shows parts, dimensions and uncertainty without promising correct physical visibility.
5. A photograph/calibration comparison measures image-space residuals; a numerical optimizer adjusts bounded dimensions and, where identifiable, camera parameters under a fixed physical/atmospheric hypothesis.
6. Only supported geometry and visibility semantics are admitted to the scientific Scene/Compare rendering path, with explicit unverified cases.

The non-AI Geometry Workshop must remain useful on its own. The LLM is one interchangeable **authoring client**, not the geometry engine or scientific oracle.

## 2. Verified repository architecture (2026-11-22 `main`)

### Existing components and integration boundaries

| Component | Verified behavior | Consequence |
| --- | --- | --- |
| `src/geometry/CurvatureGeometryEngine.js` | Generates hard-coded object silhouettes and repeated sequences, including bridge road spans, towers and other catalog object types; emits line/polygon primitives and owner metadata. `objectSequence` currently operates on two legacy object banks with indexed type/layout parameters. | Reuse proven geometric principles and test fixtures, not the fixed object-bank schema as the new DSL. |
| `src/scene/CurvatureSceneContract.js` | `createScene` and `adoptScene` validate world-space `line` (two 3D points) and `polygon` (at least three 3D points) primitives, styles/modes, and scene source `legacy` or `optical-p4`. | A new compiler can target these primitive forms through a constrained adapter; the contract is **not** a general mesh/CAD format. |
| `src/geometry/CurvaturePhysicalWorldGeometry.js` and `CurvatureSurfaceGeometry.js` | Physical local surface geometry and placement handle the flat limit and spherical surface with metre-based coordinates. | Distinguish metric local coordinates, surface placement and any future WGS84 georeferencing. |
| `src/scene/CurvatureIndependentComposition.js` | `composeOpticalMain` generates optics-neutral object layers and guides from the existing two groups, without Legacy horizon masks, then passes them to physical optics. | Add a new, separately gated composition input rather than inserting arbitrary DSL data into `ObjType` or silently changing existing scenes. |
| `src/ui/modern/ModernSceneState.js`, `ModernExperimentState.js` | Modern Scene has two banks of numeric object parameters, with allowlisted v1 snapshot/portable validation. | Existing experiment records do **not** persist arbitrary Geometry DSL/scene graphs. A new versioned asset/binding is needed, with explicit import/migration compatibility. |
| `src/ui/modern/ModernLandmarkViewer.js`, `src/geometry/CurvatureEarClip.js` | Physical Free View and vertex/edge/surface selection operate on authored primitives. Triangulation validates planarity and rejects degenerate/self-intersecting polygons. | Reuse or adapt viewer/picking techniques, but respect their current assumptions and owner metadata. |
| `src/calibration/CameraMaterialAnchor.js`, `CameraMaterialAnchorResolver.js` | Material anchors reference bank, exact authored owner, primitive, indices/weights, and a geometry/topology SHA-256 signature. | DSL edits need revision-aware landmark mapping and explicit invalidation; names alone are insufficient to preserve calibration. |
| `src/calibration/CameraPhysicalFit.js` | Performs bounded camera-pose/focal least-squares for **fixed** model geometry; projective residuals include geometry-dependent landmark queries. | Joint geometry/camera fitting is **new research**, not a capability already present. |

### Critical physical rendering limitation

`src/optics/CurvaturePhysicalSceneOptics.js` uses refracted optical ray fields, projected silhouettes and `CurvaturePhysicalPolygonFills.js` to sample/ground-clip authored filled polygons. Its emitted composition **explicitly declares** that *mutual 3D mesh occlusion is not supported*. The geometry-only preview may display a complex solid, but such a preview is not evidence that its physical projection handles self-occlusion, overlapping solids, depth or complex topologies correctly.

`CurvatureWebGLGeometryRenderer.js` rasterizes already projected geometry; choosing WebGL2 does not move the physical optics to GPU and does not fix the above limitation.

**Non-negotiable gate:** isolate the new authoring/preview from production Scene/Compare until representative physical/visibility and painter-order test cases establish which shapes are supported. No silent fallback presented as “accurate”.

## 3. Alternatives and external technical references

The following resources motivate possible approaches, but do **not** establish their out-of-box compatibility with Curvature Optics:

- [OpenSCAD documentation](https://openscad.org/documentation.html): programmatic constructive/parametric modeling; useful examples of transforms, nested assemblies and repetitions. Running arbitrary generated scripts is **not** proposed.
- [CAD-Recode](https://cad-recode.github.io/): research on recovering executable CAD programs from 3D point clouds via a language-model-based approach. Its point-cloud input does not imply single-photo metric reconstruction is solved.
- [COLMAP documentation](https://colmap.github.io/tutorial.html): structure-from-motion/multi-view reconstruction and camera estimation with sufficiently overlapping photographs; a reference for optional **offline** preprocessing, not an in-browser MVP dependency.
- [glTF 2.0 specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html): portable **mesh interchange**, not a replacement for semantic parametric authoring, provenance, uncertainty and constraints.
- Contemporary image-to-3D generators may provide initial shape hypotheses, but plausible hidden surfaces are **not measured geometry**. Independently verify licenses, model/runtime requirements and any exported dimensions before selecting a provider.

**Decision proposal:** strict, deterministic JSON DSL with a small safe operation set. Export/import mesh formats later; start by accepting photos and measurements as evidence, not demanding a generative 3D service.

## 4. Geometry DSL — proposed v1 contract

A declarative JSON tree (possibly JSON Schema validated) with:

- `format`, integer `version`, explicit `units: "m"`, and coordinate frame; for the first prototype use a documented **local ENU** frame, not geodetic latitude/longitude mixed into the vertex arrays.
- Named numeric parameters, dimensional bounds and `source`/`evidence`: `measured`, `documented`, `estimated`, `assumed`, or `unknown`; maintain source references and confidence/uncertainty separately. Do not assign invented values as verified.
- Stable semantic component IDs; primitives such as `line`, `polygon`, `box` (expanded into planar faces), `extrude` (bounded/simple profiles), `group`, `transform`, `repeat`, and `path` (later). Specialized `bridge` or `tower` can be libraries built on the core grammar, not mandatory opaque types.
- Parameter references and a constrained expression grammar, if needed; **never** `eval`, arbitrary JS/Python execution, arbitrary external URLs or dynamically loaded code from an LLM.
- Explicit color/material and intended occlusion semantics. Do not pretend that a mesh with edges is necessarily an opaque solid in the present physical optics.
- Deterministic expansion order and structured diagnostic errors. Set upper limits on nesting, instances, polygons/vertices, coordinate magnitude, compilation time and generated memory.
- Semantic part/feature IDs and a separate generated topology signature; mapping to existing material-owner identities requires a deliberate adapter plus invalidation rules.
- Canonical serialization, hashes and versioning for reproducible exported/reopened records.

**Illustration only — not a validated implemented schema, and not measured Causeway dimensions:**

```json
{
  "format": "curvature-geometry",
  "version": 1,
  "units": "m",
  "coordinateFrame": "local-enu",
  "parameters": {
    "supportHeight": {"value": 8.0, "evidence": "assumed"},
    "spanLength": {"value": 25.0, "evidence": "assumed"}
  },
  "parts": [
    {
      "id": "support-row",
      "operation": "repeat",
      "count": 12,
      "step": [0, 25, 0],
      "prototype": {
        "id": "support",
        "type": "box",
        "size": [1.2, 1.2, "$supportHeight"]
      }
    }
  ]
}
```

The compiler may resolve `$supportHeight` through its own limited reference resolver and produce `line`/`polygon` 3D primitive arrays. `step` and `spanLength` being equal in this toy example does not define a future parameter-binding syntax; their interaction must be specified before implementation. A real schema should avoid duplicated authoritative values.

### Coordinate and geography boundaries

- Separate (1) physical geographic subject ID, (2) local model origin/orientation, (3) WGS84 position/geometry with provenance and datum, (4) observer/camera position and orientation, (5) optical world frame and atmosphere.
- Location, subject and scenario association are planned in [#47](https://github.com/cryoflamer/curvature-optics/issues/47). Maps are [#49](https://github.com/cryoflamer/curvature-optics/issues/49); neither is a prerequisite for compiling a local procedural model.
- Google Maps imagery or screen pixel coordinates do **not** provide verified object heights or camera pose. A real-world transform requires explicit control points, orientation, distances, height datum, uncertainty and tests.

## 5. Reconstruction from photographs — scientific plan

### Inputs and output

Retain original image bytes/identity and attributable source metadata; accept a set of 2D feature observations `u_i`, optional physically surveyed points/dimensions, explicit camera priors and a stated atmosphere. The reconstructed object is a **geometric hypothesis**, with a reproducible model program plus estimated parameters, residuals, assumptions and unsupported parts.

A candidate objective is:

```text
min over geometry p, camera c:
  sum_i w_i * ||Project(X_i(p), c, fixedAtmosphere) - observedPixel_i||^2
```

This equation is **proposed**. It is not yet implemented or shown to be identifiable. A free camera plus free dimensions from a single image often has scale/projective ambiguities; refraction and uncertain atmospheric conditions introduce additional confounders. An excellent training-image fit alone does not validate a 3D reconstruction or an Earth model.

### Division of responsibility

- **Vision LLM:** propose structural graph, part labels, approximate topology, plausible constraints, and generate a candidate DSL program. Mark quantities visually guessed from a photo as estimates.
- **Deterministic compiler:** validate, bound and expand geometry, preserve stable semantics and explain invalid constructs.
- **Geometric/optical renderer:** render under an explicitly fixed physical hypothesis and report unsupported occlusion.
- **Numerical optimization:** fit a *small identifiable subset* of continuous parameters with bounds; use hold-out landmarks/images and report degeneracy or failed solutions.
- **Human reviewer:** verify dimensions, landmarks, model interpretation and physical/visual acceptance.

### Suggested evaluation sequence

1. Render a **synthetic known-geometry** bridge/tower with known camera, reference lengths, zero/noise cases; confirm that parameters are recoverable before using real photos.
2. Test incorrect topology, ambiguous dimensions, occluded landmarks and poorly conditioned viewpoints; quantify failure and uncertainty, not just RMS.
3. Fix the camera and fit limited geometry parameters; only subsequently permit camera/geometry co-estimation with enough independent constraints.
4. Introduce multiple photos and, where sourced, external measurements or geodata.
5. Repeat under specified vacuum/standard/inverse atmosphere *separately*, distinguishing camera/geometry sensitivity from atmospheric differences.

### Real-world proof case

Pontchartrain Causeway is a candidate because repeating supports are naturally parameterizable, **not** because verified photos, surveyed dimensions or camera/geographic observations are already available. The real-source/rights/calibration requirements remain in [#37](https://github.com/cryoflamer/curvature-optics/issues/37). Do not conflate the physical bridge with Pontchartrain transmission-line towers, or distinct Causeway/Soundly scenarios with distinct real structures.

## 6. Incremental plan and acceptance gates (proposal)

**A. DSL specification and headless compiler** — parameter types, recursive node grammar, stable IDs, validation, bounds, deterministic expansion to existing world-space primitives, canonical hash and portable round-trip. Golden known-geometry tests; no Scene/Compare replacement.

**B. Geometry Workshop** — use established Modern UI design styles; JSON editor, numeric parameter controls, geometric Free View, structured diagnostics, undo/import/export and draft safety. Avoid a full CAD UI; offline geometry-only Preview is explicitly labelled as such.

**C. Photo-assisted parameter fitting** — original photos, independently measured feature constraints, initial/fixed camera, bounded numerical optimization, per-point residuals and held-out tests. Treat joint free camera/geometry fitting as gated research.

**D. LLM-assisted authoring** — explicit opt-in transfer of photos and measurements, user-controlled provider, schema-constrained output, validation/repair loop, reversible param edits, no automatic acceptance of model claims. Account for cost, privacy, offline operation and external API failure.

**E. Physically qualified integration** — separate independent geometric Preview from authoritative optical projection; explicit support matrix for solids, surface overlap, self-occlusion, ground clipping, transparency and painter ordering. Do not modify old History/Calibration/Animation snapshots silently.

**F. Geographic subject/link integration** — optional association with #47/#49 physical subject and #48 filters; subject identity, a procedural model asset and observations should be independently versioned and related, not collapsed into the same ID.

Targeted test classes: compiler golden tests, invalid recursive payload/property limits, deterministic hashing, topology edit/anchor invalidation, old experiment import/export preservation, synthetic reconstruction identifiability, physical visibility/parity tests, DOM/Chromium and manual Opera visual review. Full regression suites require explicit approval.

## 7. Important architectural decisions still open

1. How to persist and reuse procedural models independently of experiment snapshots, while preserving portable research bundles and source attribution.
2. Whether to expose an adapter that directly emits `CurvatureSceneContract` shapes or add a separate intermediate *semantic geometry* representation before lowering.
3. How stable part identities, per-instance identities and generated polygon ordinals survive parameter edits; which edits invalidate existing Material Anchors.
4. What physical visibility support is required before enabling a custom generated solid in the production optics pipeline.
5. Which external LLM/model services, if any, are allowed to receive copyrighted, licensed or private reference photographs; data retention, consent and cost constraints.
6. What reference dimensions or independent viewpoints are needed to establish geometric identifiability and useful uncertainty bounds.

These are design questions for implementation, **not acceptance already achieved**.

## 8. Related authoritative Issues and documentation

- [#7 — 3D Landmark Editor](https://github.com/cryoflamer/curvature-optics/issues/7): authored vertex/edge/surface identities and physical calibration workflow.
- [#6 — Camera Calibration](https://github.com/cryoflamer/curvature-optics/issues/6): pose/focal fitting and observations.
- [#37 — Photo-backed Soundly Causeway](https://github.com/cryoflamer/curvature-optics/issues/37): real source imagery, measurements and scientific demonstration.
- [#47 — Object Explorer](https://github.com/cryoflamer/curvature-optics/issues/47): typed geographic subject identity/links.
- [#48 — Geographic filters](https://github.com/cryoflamer/curvature-optics/issues/48): shared geographic discovery.
- [#49 — Geographic maps](https://github.com/cryoflamer/curvature-optics/issues/49): map/observer context.
- [`docs/architecture.md`](architecture.md), [`docs/landmark-editor.md`](landmark-editor.md), [`docs/camera-calibration.md`](camera-calibration.md), [`docs/physics.md`](physics.md).

**Implementation work and checkboxes are tracked only in the corresponding GitHub Issue**, not in this research document.
