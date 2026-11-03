# 140.0 — GPU capability diagnostics

The **Display → GPU capabilities → Check GPU** action is an opt-in probe. It
creates temporary WebGL / WebGL2 canvases (requesting
`failIfMajorPerformanceCaveat`) and releases only those probe contexts. It
also requests a WebGPU adapter, when supported. No active Scene/Compare canvas,
shimmer shader, physics calculation, render configuration, or saved experiment
is altered by the probe.

The readout reports API availability, an optional unmasked renderer string,
float-texture capabilities, and an intentionally conservative hardware status.
`WEBGL_debug_renderer_info` is privacy/driver-dependent; an absent renderer
string is reported as **Not disclosed**. The tool labels recognizable software
renderers **software renderer suspected**, but cannot establish hardware
acceleration from API availability or a vendor name alone. WebGPU availability
is independent of WebGL2. "Float textures" reports WebGL2 renderable floating
color attachments (or WebGL1 sampleable floating textures); it is not a complete
feature benchmark.

The active physical scene backend remains **Canvas 2D**, whether the probe
passes or fails. The GPU is currently used only for the optional Atmospheric
Shimmer presentation effect. GPU mode selection and speed benchmarking are
explicitly deferred to later stages.

To test manually: open the modern UI; navigate to **Display**; click **Check
GPU**; inspect the statuses; enable Atmospheric Turbulence on Scene and Compare
to verify that the normal output remains unchanged. Repeat on a browser with
WebGPU disabled or on software rendering to verify graceful reporting.
