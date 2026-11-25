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

A live editor may use `withDocumentRetained(id, callback)` to retain both
its logical document identity and its exact immutable strong closure until
the callback settles. Explicit removal takes the document's exclusive lock
before taking its direct target locks. CAS edits in another tab remain
allowed; if they replace the direct targets, the previous closure remains
protected from GC by the editor's original shared resource locks. Opening
rechecks the document revision after acquiring its target locks. All these
locks are nonblocking, and resource target order is deterministic. This
mechanism is opt-in and does not yet wire any production editor.

### Atomic multi-document changes

`writeDocuments(plans)` extends the single-document CAS contract to a
nonempty set of distinct roots. Every expected revision is checked before
mutation; new resource definitions are unique across the batch, and the
final graph is checked and reference counts derived in the same IDB
transaction. No partial success is returned. The existing single-root API
uses the same implementation. The managed History `setHistoryPinned` port
uses this operation to preserve all-or-nothing bulk pin/unpin, including
recovery protection and the existing promotion rule for unpinned automatic
entries. No physical snapshot is rewritten by that operation.

### Managed History save and portable import

The opt-in `recordHistory` and `importHistory` ports preserve deliberate
save deduplication, adjacent automatic deduplication, recovery protection,
conservative automatic capacity refusal and portable name/notes identity.
A portable import may preserve explicitly standalone inline calibration
provenance if its referenced local archive is absent; a present mismatched
archive is not accepted. Metadata changes retain the exact existing snapshot.
A complete live kind inventory (IDs and revisions) is checked inside the
same transaction as the planned writes, including no-op reuse and capacity
refusal. Thus concurrent insertion, removal or revision changes cannot
acknowledge a stale deduplication decision. A synchronous caller guard is
checked before mutation. No automatic pruning, legacy import receipt,
production UI routing or cutover is enabled by these ports.

The existing `ModernExperimentHistory.create` factory accepts an explicit
`managedResources` dependency with `protectedRetention: true` and returns
the managed application port rather than opening the old database. Every
displayed row carries `managedRevision`. Exact-row metadata and pin edits
reject stale displayed records and honor the transaction guard. Existing
list/get/record/import return shapes are preserved, with the additional
revision. Destructive and non-revisioned management and legacy migration
methods explicitly refuse; an invalid dependency never falls back to the
legacy writer. This is the factory seam for controlled activation, not a
user-selectable production route: startup must still establish a single
authority and handle the old migration receipt before supplying it.

### Managed observation application writes

Single-observation creation, calibration original ingestion, attribution plus
classification edits and classification-only edits are available as opt-in
application operations. The existing library validators and quotas apply
to the verified live collection, and the whole live inventory is checked
in the commit transaction. Original reuse checks digest, raster dimensions,
MIME and exact Blob bytes; identical originals can serve distinct observation
identities. Calibration ingestion preserves the existing observation and
returns the incoming source separately. Attribution edits create immutable
observation versions retaining the same original; classification-only edits
retain the exact observation resource. Original and classification revisions
remain distinct and stale revisions or caller guards refuse the whole
operation. This is not the active Image Library route. Bulk portable import,
backup restore, Where used? integration and global activation remain open.

Managed portable asset import and Image Library backup merge now share an
atomic planner. All incoming originals pass the decoder before writing,
including reused records. Existing records with conflicting aliases are
preserved and imports receive stable remappings. Retired aliases are not
recycled. Distinct observations of the same verified original share one
binary resource, including originals staged together within one import.
The library's existing backup format and merge rules remain available:
missing classifications may be added, while existing local attribution
and classification are not replaced. Distinct incoming aliases are not
collapsed onto the same remapped observation. Whole-collection CAS guards
both mutations and no-op reimports; quotas and all planned writes commit
together. This is a portable merge, not a complete-profile restore or
automatic production migration.

### Image Library application port

`ModernReferenceImageLibrary.createPort({managedResources})` exposes the
existing db-first library contract backed by the managed adapter, with
classification already supported. It is bound to the injected IndexedDB
factory; a mismatched context or missing dependency is an error, not a
legacy fallback. Calibration lookup chooses a deterministic current alias
after verified identity and matching bytes, and ingestion returns the
incoming attribution separately. Existing caller decoder callbacks are
honored. Metadata-only updates retain classification, and revisioned
classification and portable backup operations retain their existing shapes.
Deletion still refuses.

`inspectDocumentGraph` is an explicitly observational, existing-database-only
read. It never creates/upgrades storage or requests the shared writer lock,
so a coordinated read-only usage/backup snapshot can invoke it while holding
the exclusive barrier. It validates the same revision-consistent closure as
the normal read; an absent database returns null, an unsupported version or
concurrent failed open refuses. The Image Library port uses it for
`inspectOriginal`. This does not migrate the old Where used? scan to the
managed graph or authorize deletion. No default route has changed.

### Calibration archive application port

The managed archive port retains the current archive API, result validator,
append-only identity, first archived attribution/time, and quota. Unlike
the previous cross-database ingestion, the managed `archiveExperiment`
plans the original observation (if needed) and the result root together.
Both complete kind inventories are CAS-checked in the same transaction,
including reuse decisions, and no partial original/result publication is
acknowledged. A portable result save still requires a verified current
gallery original. Previously archived results retain their original
independently. `inspectUsage` uses existing-only document inventory/closure
reads; it can run under the exclusive backup/usage barrier without creating
or upgrading a database. This port is explicitly injected; no production
routing or automatic deletion is enabled.

### Ordinary Calibration Project application port

The explicit managed Calibration Project port retains the existing domain
revision and ordinary conflict-fork contract, while separately checking
managed root revisions and the project inventory for quota and identity
decisions. New photo resolution is checked against the observation
inventory. Existing original and result mappings are retained independently
of gallery aliases. Managed activation uses the project's own verified
closure rather than rehydrating through the gallery. Managed checkpoint
capture with the same original verifies the retained bytes and does not
recreate a removed observation; a newly selected photo follows normal
verified ingestion before the project transaction. The existing persistence
coordinator invokes these methods only for an explicitly injected managed
port. Shared selection receipts, shared lease tracking, legacy adoption
and destructive removal still refuse; this ordinary port is not sufficient
for production shared-session activation.

### Shared Calibration selection receipt

The managed Calibration port uses the existing validated receipt contract.
One reusable control root stores the pending receipt and retains the exact
committed project resource, plus the preceding resource when its exact
revision is available. The project change/fork and receipt are committed
in one root batch under the session lease, including inventory CAS.
The IndexedDB transaction participates in the lease's abort tracking and
checks its lifetime before and after durable completion. An unresolved
receipt blocks a new shared selection change and modifications of its
current project; ordinary unrelated project edits remain possible. Receipt
retirement checks the exact receipt and committed project, then clears the
control root's strong edges, not its identity. This permits subsequent
receipts without recycling a tombstone. Backup qualification validates the
receipt and its target, including a retired empty control root. The old
session-pointer acknowledgement protocol is preserved; startup routing
and the managed shared physical checkpoint adapter remain separate work.

The existing-only receipt path uses existing-only project closure inspection
as well, so an outer exclusive writer barrier never recursively requests a
shared writer lock. The controller's pending-pointer and already-committed
receipt recovery protocols remain unchanged; the managed domain port can
be tested against the existing shared checkpoint implementation before
the latter is routed to managed storage.

### Managed Animation Library application port

The explicit library port preserves named-save timestamp and exact-row CAS,
semantic duplicate detection, portable entry import and idempotent planned
update. A matching pending Named Save journal supplies retained observations
and Calibration evidence when gallery roots have disappeared; the journal
inventory is checked in the same transaction as the named update. Export
consumers can obtain original reference records from the immutable named
owner. Existing-only usage reads do not acquire the writer lock. Deletion
and production routing remain disabled. Portable entry import requires
available verified evidence; asset bundle orchestration and foreign standalone
calibration provenance need additional integration before cutover.

### Managed shared Animation working collection

The existing `openSharedCollection` transition engine accepts an explicit
managed dependency. It uses the same canonical row, digest, revision and
journal validators for Named Save, temporary keyframe editing and selection
acknowledgement. The backend checks the exact prior row plus managed root
CAS, tracks the write transaction under the shared page lifetime, and
reads existing schema without acquiring a recursive backup lock. No legacy
store is opened by this path. Legacy adoption refuses; explicit managed
initialization is reserved for controlled startup after migration fencing.
A newly created selection receipt also roots the previous collection
resource until retirement, including its original photos and fit evidence.
A historical imported receipt without its previous collection cannot
reconstruct that resource. This is an opt-in port, not production routing.

### Managed shared physical checkpoint

The existing `openSharedCheckpoint` transition engine accepts an explicit
managed dependency. Canonical checksum, Scene/Compare transitions, stage,
promote, auxiliary selection and receipt proof are unchanged. The managed
backend compares the exact observed row and root revision, uses the shared
lifetime transaction lease, and reads existing-only storage. The injected
route never opens the historical working-session database. An observational
adapter cannot mutate. Explicit initialization is for controlled startup;
legacy inspection/adoption and empty-profile migration decisions remain
fenced until the coordinated cutover. Restoring a physical payload whose
archived fit is no longer listed may still require an explicit evidence
handoff from its current owner; this port does not authorize a downgrade.

### Verified physical evidence handoff

The managed shared checkpoint can retain an exact History snapshot and its
verified Calibration result even when the archive gallery entry has been
removed. The source is an exact validated experiment, not a guessed alias;
multiple different verified targets fail closed. The History inventory is
CAS-checked in the destination transaction. New History records can likewise
retain verified evidence from the committed or staged working checkpoint
with the same calibration origin, reusing an exact snapshot where possible.
The working root revision is checked atomically. Low-level explicit import
semantics and standalone provenance policy remain separate. No removed
gallery root is recreated; no broad automatic resource reclamation is
introduced. This does not yet establish all Animation/Calibration handoffs.


### Cooperative cutover writer fence

The backup barrier checks the origin-wide `curvature-modern-storage-route-v1`
localStorage marker inside each granted shared writer lock. An absent marker
preserves the existing opt-in behavior. A validated marker (format
`curvature-modern-storage-route`, version 1, state `preparing` or `managed`,
and the external backup SHA-256) permits only the managed object writer
during preparation; the managed route also permits the UI registry writer.
All other registered owners refuse, including unknown future owners.
Malformed markers fail closed. Observational exclusive snapshots remain
available for qualification and diagnostics. A transition must hold the
exclusive barrier so acknowledged preceding writes drain before the marker
changes and queued writes check the new state.

This is a cooperative fence, not a complete startup migration protocol.
Older code and unregistered localStorage writers are not fenced; they must
not run during cutover. No production caller creates the marker yet, and
no migration, default route switch or deletion is authorized by this API.
