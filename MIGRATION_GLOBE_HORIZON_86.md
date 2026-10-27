# Independent globe horizon reference geometry (#86)

`CurvatureGeometryEngine.globeHorizonGuides(model, options)` generates the non-occluding reference primitives previously issued directly by the globe branch of `DrawModel`: the optional flat projection of the horizon (`showGrid & 2`), the always-visible globe horizon circle, and the tangent segment (`showTangent || showData`) rotated by `-PanRad`.

The returned scene is a **visual guide layer**, not the filled white horizon occlusion mask. Mask composition remains in `createHorizonScenes` / `createObjectHorizonComposition`. Circles are tessellated (`segments`, default 128); their rasterization is not asserted pixel-identical to legacy `CircleOnPlane`. Eye-level text, viewport labels, and optical overlays are intentionally not migrated in this patch. `DrawModel` and the live UI remain unchanged.
