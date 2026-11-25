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
`readDocumentGraph`, `inspectUsage`, `verifyIntegrity`, `recount`, `withRetained` and
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
without materializing all payloads simultaneously: integrity, recount and
reclamation inspect one payload at a time within the same transaction.
This bounds the application-side payload working set by the largest record,
not by the total stored payload size; graph metadata and browser-internal
buffering are not included in that bound. The core supports explicit
single-object collection or a bounded batch of up to
64 distinct candidate IDs. Batch maintenance acquires nonblocking exclusive
locks in sorted order, skips busy IDs, verifies the entire graph/payload
contract once before deletion, rechecks incoming strong counts inside one
transaction, and may collect newly eligible children only if they are among
the explicitly locked candidates. It re-derives counts before commit and
reports collected, blocked, retained and missing IDs separately.
`listGarbageCandidates({limit})` returns at most 64 zero-strong-count
IDs after checking current graph metadata, without reading payload bodies.
This result is only a maintenance hint; the subsequent batch revalidates
all payloads and references under the resource locks and transaction. A
candidate retained since discovery must not be deleted. Tombstones continue
to prohibit ID reuse; no automatic compaction or lifetime limit is assumed.
No automatic
collector or production deletion is enabled. Performance and backup
integration must be qualified before adoption. Writes are revision-checked, repeatable same-slot
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

## Domain adapter API

`src/storage/ModernManagedResources.js` supplies opt-in adapters for existing
History, Reference Image Library, saved Animation, Calibration Result and
Calibration Project formats. Their existing validators remain authoritative.
The History entry and observation aliases are preserved in namespaced document
IDs, separately from immutable resource IDs. Managed document revisions are
separate from legacy source revisions/timestamps. A History metadata edit may
reuse a snapshot only after comparing its complete validated data and evidence
mapping, including Compare selection. Image observations may reuse an original
only after verified dimensions, digest and exact byte equality. Original blobs
are not resized or reencoded; portable Base64 is reconstructed on read.
Classification and attribution remain separate per observation.

`readDocumentGraph` reads one revision and its strong closure in one IDB
transaction; domain materialization verifies target types and identity and
rechecks original raster/digest before returning portable records.
Managed originals are verified directly from Blob bytes (header, MIME,
browser-decoded orientation-aware dimensions and SHA-256). The temporary
object URL is always revoked. Portable Base64 is constructed only when a
portable image record is actually returned. Working collection preflight
verifies each immutable original once per graph closure and never builds
Base64; distinct observation attribution is still retained. No verification
cache survives a transaction or an operation.
The autosave adapters use a separate indexed `readDocumentClosureForWrite`
preflight for the previous revision. It validates the complete immutable
strong closure, declared edges, weak target existence and cycles in one
read transaction, but is not a global integrity report. The subsequent
`writeDocument` still checks the full current metadata graph and CAS revision;
public restores, explicit integrity/recount and reclamation retain their
original global validation. No cached graph is treated as write authority.
Saved Animation owns its full project and retained observation versions.
Its local sourceSnapshotId is provenance, not a strong dependency. Historical
image attribution is preserved by the retained observation version, including
subsequent edits of a saved Animation after its gallery alias is removed.
Previously verified fit evidence cannot be downgraded by a metadata edit.
Calibration Results retain the verified original; Calibration Projects retain
their original plus archived results and hydrate existing checkpoint/Undo/Redo
data through the existing checkpoint adapter with a managed original lookup.
Locally calibrated snapshots and animations retain exact archived evidence;
an explicitly standalone portable import with no evidence retains only its
inline historical origin and is not presented as verified external evidence.

The opt-in working checkpoint adapter stores the acknowledged shared physical
checkpoint as one document with strong committed and optional draft snapshot
slots. It reuses the existing shared checkpoint digest/binding validator and
preserves the source revision separately from the managed CAS revision.
Identical retained snapshots can be reused, including promotion of a draft.
The selection envelope is preserved as metadata, not activation of an
auxiliary editor; mapping and validating its domain bindings remains a cutover
requirement.

The opt-in Animation working collection uses the existing acknowledged
collection validator and digest, retaining one immutable collection resource
per managed revision. Its inventory covers every active/inactive workspace,
both sides of a named-save intent and the temporary keyframe journal (original,
workspace, candidate, past/future and pending History experiment). Source
snapshot IDs and selection receipts are provenance/navigation, not new roots.
Photo alias versions are retained for the lifetime of that alias in the
collection; a newly introduced alias must resolve to a verified observation.
Archived fit evidence is strong; explicitly standalone unresolved origins
have a null mapping, never a fabricated archive. Pending intents are
preserved as recovery evidence, not replayed during adoption. The whole-row
copy and verification costs require measurement before active autosave routing.

These adapters are not the active Modern UI save path. Editing other retained
owners after gallery removal, complete live-use coverage, working checkpoint
and Animation collection adoption, legacy conflict drafts, limits and production cutover remain
required before enabling user-facing deletion.

## Backup and cutover

Portable backup inventories the managed database as an additional optional V1
descriptor; earlier archives may omit it while it is absent. Managed operations
participate in the existing backup writer barrier when provided (including
schema-capable reads); uncoordinated callers are not eligible for cutover.
Exact empty-profile restore preserves binary payloads and compound edge keys;
full graph qualification must additionally validate types, closure and derived
counts, and recompute counts where needed. Temporary browser locks are not portable
roots. The explicit `restoreAndQualifyManagedArchive` drill restores only
into an empty disposable profile. After exact byte/record restore it verifies
the typed graph, independently derives counts and refuses discrepancies
(rather than silently repairing an archive), verifies every live original
including unreachable ones, and reopens every live supported domain root
through its existing adapter. Unknown document kinds and incorrect alias
bindings fail closed. A coordinated recapture checks that managed records
did not change during qualification. This is a disposable-profile drill,
not a concurrent live validation or activation; no pending intents are
replayed, and no automatic cleanup is attempted on failure. Reuse the existing structured binary codec and coordinated backup
barrier, keeping its documented limits. Existing explicit portable exports
remain self-contained. Preserve exact original bytes, calibration evidence,
physical invariants and independent Compare A/B atmosphere settings.

The explicit `rehearseLegacyArchive` entry point reads a checksum-verified
portable archive into a disposable empty browser profile, never opens its
source databases, and refuses an occupied target. It imports supported owners
in dependency order, deduplicates verified originals, reports skipped records,
unresolved standalone evidence and unhandled stores/Web Storage, and verifies
the resulting graph. An acknowledged row that cannot be reopened fails the
rehearsal rather than being reported as skipped. This is a best-effort rehearsal,
not an in-place migration or production activation. It additionally adopts the
exact acknowledged shared physical checkpoint and Animation working collection
after the named owners. Other keys in those same legacy databases remain
reported as unhandled; pending selection/save/edit intents are preserved, not
replayed. Only fit IDs absent from the source archive may be explicitly
standalone during this adoption; a failed migration of an existing result
does not authorize dropping its evidence. It never returns migration
eligibility, and a failed rehearsal profile can be discarded.

Before adopting destructive operations, verify an external backup, prevent
old writers from participating, migrate supported local data best-effort and
report skipped records. A controlled clean restart is acceptable for the
current single-user deployment; silent loss of newly acknowledged data is not.
Keep existing deletion protections until every relevant owner is integrated
and verified. No production deletion is authorized by this document alone.

### Domain gallery reads

The managed core exposes a read-only revisioned document inventory by kind.
Domain adapters return verified rows or existing summary shapes paired with
`managedRevision`; each closure is read individually, followed by a second
inventory check. A concurrent add, edit or removal causes a reload/retry
refusal rather than a mixed-revision list. Retired document IDs are excluded
from gallery reads. The explicit `suggestHistoryId()` includes retired IDs
when choosing the next numeric alias, but is not an allocation reservation:
the initial document CAS rejects a competing create. These opt-in read ports
are preparation for routing, not a second live UI authority.
