# 137.2.2 — Portable hand cursors for camera drag

The native CSS `grab` cursor appeared as an unexpected four-way glyph in
Opera on the tested Windows configuration. Chrome displayed native `grab`
correctly on the same machine. The camera interaction and raster drag preview
already worked, so this change is limited to pointer affordances.

- `src/ui/modern/cursors/hand-open.png`: 48×48 RGBA open-hand cursor;
  CSS hotspot `(16, 8)`.
- `src/ui/modern/cursors/hand-closed.png`: 48×48 RGBA closed-hand cursor;
  CSS hotspot `(23, 20)`.
- Both CSS selectors and the existing inline style override select these
  PNG cursors, with native `grab`/`grabbing` as fallback. Global dragging
  uses the closed hand and restores the previous host cursor on release.
- Modern CSS and camera-preview JS URLs are versioned to bypass stale caches.

The file path is relative to the stylesheet in CSS and relative to the page's
`<base href="./">` in JavaScript. No physical renderer, camera angles, drag
handling or preview transform was changed.

**Verification:** run `node --test tests/*.test.js`; manually verify in
Opera and Chrome that the open hand appears on hover and the closed hand
appears only while dragging, both in Scene and both Compare canvases.
Automated unit tests can verify the image bytes and styles, but not the
actual system pointer icon shown by Opera.
