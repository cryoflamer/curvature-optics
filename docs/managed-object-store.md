# Managed Object Store — architectural contract

This is the target contract for Modern persistent resource ownership, not a
description of an already deployed store. Existing session and document
coordination remains supported. See [runtime architecture](architecture.md),
[reference images](reference-images.md) and [Animation](modern-animation-contract.md).

## Resource identity and ownership

A managed resource has an opaque never-reused ID, registered type, schema
version, immutable validated payload and declared outgoing strong references.
Domain adapters validate payloads and identify their references; the lifecycle
core does not depend on domain types. Mutable document, library entry and
observation identity is separate from payload identity. An edit creates a new
payload and replaces the owner's reference atomically. Do not split small
fields into individual resources without a concrete benefit.

Strong references retain their targets. Weak provenance/navigation references
do not; unresolved weak links must be reported honestly. Required scientific
evidence must be retained by a strong reference or embedded immutable evidence.
A History alias is not the identity of a physical experiment. Original image
bytes are distinct from observation metadata and attribution.

## Transaction boundary and proposed storage schema

Use one new IndexedDB database for authoritative reference-bearing documents,
objects, payloads and edges. Proposed logical stores:

| Store | Key | Contents |
| --- | --- | --- |
| documents | document ID | kind, revision, mutable metadata, root ownership |
| objects | object ID | type, schema version, derived incoming strong count |
| payloads | object ID | immutable structured value or Blob/ArrayBuffer |
| references | owner kind + owner ID + slot | target ID and strong/weak classification |

Index references by target and owner. Use stable slot identities (not array
positions that change on reorder). Each distinct strong slot counts once.
An object's outgoing references are immutable; root slots may be replaced
under document revision CAS. Reject strong cycles; weak cycles are allowed.
Canonical edges are authoritative; counts are derived and repairable.
Never let domain code edit counts or raw storage records.

Commit creation, root attachment/replacement, revision, edge and count changes
in one transaction; acknowledge only after transaction completion. Prepare
validation, hashing and binary conversion before opening the transaction;
recheck existence, revisions and identity within it. Abort on stale revision,
missing strong target, invalid count, unsupported schema or write failure.
Do not silently recreate missing objects. Keep projections, UI preferences and
reconstructible caches outside the authority. Web Locks are not cross-database
transactions. No mandatory content deduplication for the initial core;
optional dedup must verify exact typed/versioned content, never approximate
physical signatures. Store binary originals as Blob where possible, preserving
bytes and existing portable representations at adapter boundaries.

## Multiple tabs: explicit refusal instead of automatic conflict resolution

Preserve existing session synchronization, revision checks and multiple active
tabs. Do not impose a global single-writer or single-tab restriction.
For difficult cross-tab conflicts, prefer a simple actionable refusal and retry
over automatic merges, eviction, recovery relocation or additional coordination.

Durable roots include named documents, library entries, acknowledged working
checkpoints, retained drafts/recovery and persisted undo where supported.
An external portable file is not a local root. Temporary editing/undo/import
operations must retain resources they need until finished. Prefer existing
durable checkpoint ownership when sufficient. For live-only use, a candidate
minimal mechanism is shared per-resource Web Locks held during use, with
nonblocking exclusive acquisition for deletion. Acquire before reading or
activating the resource; recheck existence after acquisition. Release when
no longer needed; browser context termination releases Web Locks. The deletion
path must hold exclusion through transaction completion. If unavailable,
uncertain or conflicting, refuse destructive work. A usage scan, timeout or
unload notification alone is not sufficient proof. Avoid nested lock waits:
for a cascade, use a bounded candidate set, deterministic acquisition and
abort/retry if the set changes or any lock cannot be obtained. Exact lock
adapter and integration require targeted browser verification before deletion.

An explicit deletion request must leave the requested entry unchanged when
it conflicts with another active editor. Report that the resource is in use
and ask the user to close the relevant editor/tab and retry. A durable
dependency is different: report the owning document and explain that closing
a tab alone cannot remove it. Removing a gallery root is distinct from
physically reclaiming an object shared by other durable owners. Never remove
another owner's edge to satisfy deletion. Automatic pruning skips protected
entries; it must not bypass the same safety checks. Keep existing conflict
handling where it already works; no broad session refactor is required.

## Lifecycle API

The opt-in core in `src/storage/ModernManagedObjectStore.js` exposes
`newObjectId`, `createAndAttach`, `writeDocument` (whole root-slot replacement
and optional atomic batch creation),
`setReference`, `detach`, `removeDocument`, `get`, `getDocument`,
`inspectUsage`, `verifyIntegrity`, `recount`, `withRetained` and
`collectGarbage`. It is not loaded by the application. `detach` is a normal
revision-checked edit, not a user-facing deletion operation. `removeDocument`
acquires nonblocking exclusive locks on its direct strong targets, rechecks
the document revision, and retires its root slots atomically. `withRetained`
holds a shared lock only while its asynchronous callback is pending.
Batch creation permits references to other new IDs in the same transaction;
all new objects must be strongly reachable from a durable document root.
ID allocation alone does not reserve or persist a resource.
The initial core keeps document/object ID tombstones, scans metadata on each
mutation, validates payload/edge agreement during explicit integrity/recount/GC,
and collects one object per call. This prioritizes correctness over throughput;
performance and backup integration must be qualified before adoption. Writes are revision-checked, repeatable same-slot
operations are idempotent, and replacement adjusts old and new target counts.
Zero references means eligible, not necessarily immediately deleted.
Reclamation rechecks canonical edges and temporary retention, removes outgoing
edges and updates their targets in the same transaction or bounded atomic
batches. Integrity failure blocks reclamation. A read-only usage report is
diagnostic, not permission to delete. Recount validates graph closure and
cycles before repairing derived counts; reachability provides independent
verification. Unknown types fail closed, never become silently collectible.

## Domain boundaries

| Domain | Retained resources and ownership |
| --- | --- |
| History | Entry owns immutable experiment; pin/metadata belong to entry; preview is reconstructible. |
| Animation | Saved project and retained draft/undo own base/frame state and required photo assets; sourceSnapshotId is weak provenance when complete frame state is owned. Verify picker/edit/navigation paths before adopting this rule. |
| Reference images | Observation owns original bytes; linked documents retain required original/observation evidence; thumbnails are cache. Attribution remains independent of binary dedup. |
| Calibration | Project/checkpoint owns required photo and result references; archived result owns verified photo evidence. Applied experiment retains required calibration evidence; its embedded provenance is not current physics. Verify overlay/archive readers before cutover. |
| Shared session | Acknowledged physical and auxiliary checkpoints/recovery own required resources; selection and UI preferences alone are not permanent roots. |
| Built-in demos / Legacy | Shipped immutable catalog remains outside local GC; preserve portable and Legacy semantics. |
| Future assets | Register a type and validation/reference adapter; reuse the same lifecycle core. |

Existing History, Animation, Calibration and Reference Image validators and
portable codecs remain domain adapters. Existing usage discovery can assist
migration and diagnostics, but is not the authoritative reference index.
Existing session CAS and backup write barrier remain useful. Separate legacy
authoritative writers are retired only at controlled cutover; do not maintain
two indefinite authorities. The existing keyframe thumbnail cache remains
reconstructible. Current original-photo limit is 20 MiB, photo thumbnail
512 KiB, experiment thumbnail 750000 characters, and shared Animation recovery
80000000 characters; these are input limits, not measured storage sizes.

## Backup and cutover

Portable backup must capture the canonical graph, payloads and roots with
closure and hash verification; restore validates types, remaps IDs where
necessary and recomputes counts. Temporary browser locks are not portable
roots. Reuse the existing structured binary codec and coordinated backup
barrier, keeping its documented limits. Existing explicit portable exports
remain self-contained. Preserve exact original bytes, calibration evidence,
physical invariants and independent Compare A/B atmosphere settings.

Before adopting destructive operations, verify an external backup, prevent
old writers from participating, migrate supported local data best-effort and
report skipped records. A controlled clean restart is acceptable for the
current single-user deployment; silent loss of newly acknowledged data is not.
Keep existing deletion protections until every relevant owner is integrated
and verified. No production deletion is authorized by this document alone.
