# Portable Modern storage backup — migration safety boundary

The portable storage codec lives in
[ModernPortableBackup.js](../src/ui/modern/ModernPortableBackup.js);
its focused contracts live in
[ModernPortableBackup.test.js](../tests/ModernPortableBackup.test.js).
This is the **initial, read-only foundation** for [Issue #31](https://github.com/cryoflamer/curvature-optics/issues/31), also intended for later opt-in external transport in #45.

## Current inventory (before session migration)

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

## Safety and limitations

`capture()` uses `indexedDB.databases()`, opens only **existing** databases without an upgrade, uses read-only transactions, reads Web Storage and compares two complete read passes. A changed record, blocked database, missing Web Storage or unsupported browser inventory API fails closed. All origin data is left untouched.

**Two identical read passes are not an atomic snapshot across databases**: a writer can change and restore data between observations. At this stage the archive explicitly declares `writerCoordination:false` and `eligibleForMigration:false`. The codec is not wired to a download button, does not yet freeze/cooperate with active document writers, and deliberately exposes no live restore or destructive replace operation. A green Node test does not establish a usable real-user-data backup.

Before #31's safety gate can be accepted:

1. Coordinate/quiesce all active Modern writers and record acknowledged revisions, or fail export as incomplete. Read/verify again across databases; distinguish clean commits from pending, failed or legacy recovery.
2. Validate the original photograph bytes, SHA-256 identities, project links and archive provenance. Fail a snapshot with missing/unsupported required sources.
3. Provide a browser download outside origin storage, validate its re-import, preview collisions and versions, and restore into an **isolated empty namespace** without touching live databases.
4. Perform a populated-data export → validate → isolated restore → compare (IDs, revisions, original bytes, digests and references) in the target browser, including corruption/quota/concurrent-edit and recovery cases. Keep the validated file outside browser-managed storage.

No existing `localStorage`/`sessionStorage` write or reader is removed by this foundation. Scene/Compare/Calibration/Animation behavior and Legacy links are unchanged. The proposed extensible UI-state registry remains blocked by this gate.

## Targeted validation

From the repository root:

```sh
node --test tests/ModernPortableBackup.test.js
```

This tests codec structure and content integrity, corruption/missing-store rejection, duplicate keys, binary round-trips, read-only empty-store capture and detection of changing Web Storage. It is **not** evidence of a full populated IndexedDB/browser restore.
