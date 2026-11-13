# Modern status messages

Modern UI distinguishes application feedback from explanatory text. The shared
`src/ui/modern/ModernStatusMessage.js` utility owns the accessible and visual
status presentation, while the caller still owns when and what to report.

## Status kinds

- `error`: persistent high-contrast red alert with a copyable diagnostic. Do
  not dismiss on a timer. Its text is not rewritten or truncated.
- `warning`: amber message for intentional cancellation and recoverable risks.
- `success`: restrained green confirmation for completed operations.
- `info`: subdued inline status for readiness and frame-by-frame progress;
  repeated progress updates should not look like failures.

Use `CurvatureModernStatusMessage.set(node, message, kind)` or
`decorate(node, kind)` after setting `textContent`. Both methods replace the
previous status kind; a retry clears the old error styling and copy control.
The original diagnostic is inserted as text, never `innerHTML`. When a browser
clipboard API is available, the **Copy error** button copies the exact source
message without the button label.

The helper sets `role="alert"` and `aria-live="assertive"` for errors, and
`role="status"` / `aria-live="polite"` otherwise. `aria-atomic="true"` keeps
updates intelligible to assistive technology. It does not alter render state,
project storage, or error-handling paths.

## Migration boundaries

The first integration covers the Animation Studio draft/preview message and
both offline export controls (PNG ZIP and WebM/MP4). Their underlying progress,
cancellation, worker validation and download handlers are unchanged. Statuses
remain visible until the next operation updates them; they do not auto-hide.
Other Modern status surfaces (History, Snapshot Picker, preferences, optics and
render diagnostics) retain their existing logic and are candidates for the
following dedicated UI integration, not an implicit global style rewrite.

## Verification

Run `node --test tests/ModernStatusMessage.test.js
 tests/ModernStatusMessageExportUI.test.js
 tests/ModernAnimationVideoFilenamePreview.test.js` to cover severity changes,
copy semantics and real export click handlers. Run the full Node test suite
and the Legacy isolation/boundary audits before packaging.
