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
both offline export controls (PNG ZIP and WebM/MP4). The second integration
reuses the same helper for these existing status surfaces:

- History actions, snapshot save readiness and failures, and portable JSON
  import/export (including oversized or invalid files).
- Animation Library operation and JSON backup errors, rendered within its
  independently rebuilt card gallery; Snapshot Picker errors continue to use
  Animation Studio's existing message panel.
- Working-session persistence, Display preferences, camera sequence/positions,
  GPU capability probe and Demos host errors.
- Scene/Compare viewport summaries, optical quality and geometry backend
  diagnostics. Renderer exceptions are `error`; unresolved optical pieces and
  geometry fallback are `warning`, not silent rendering failures. Ordinary
  viewport progress remains legible on dark footer backgrounds.

These paths keep their existing messages and error handling: only presentation
semantics and explicit severity classification have changed. Local success or
progress updates can replace an earlier error on the *same status node*; the
helper never starts an auto-dismiss timer and does not globally lock all
status updates. In particular, this is not a new logging or error-recovery
system. Rich optical diagnostics and physical caveat boxes keep their separate
presentation rather than being flattened into a single-line status.

## Verification

Run `node --test tests/ModernStatusMessage*.test.js
 tests/ModernExperimentHistory.test.js
 tests/ModernAnimationLibrary.test.js` to cover severity changes,
copy semantics and real export click handlers. Run the full Node test suite
and the Legacy isolation/boundary audits before packaging.
