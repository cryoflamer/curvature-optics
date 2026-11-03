# 102 — Atmospheric profiles and analytic ray qualifications

Source: Y. M. Maslovsky, *Can Atmospheric Refraction Reproduce Geometric Horizon Occlusion?* (2026-07-31), equations (27), (32), (37), (53), (69), (73). This milestone adds no Canvas rendering changes.

## Contract

`CurvatureRayTracer.atmosphere(kind, options)` supports:

- `standard`: `n=1+N exp(-h/H)`, `dn=-N exp(-h/H)/H` (the existing configurable physical reference).
- `exponential-occlusion`: `n=n0 exp(h/R)`, `dn=n/R`; `R=options.occlusionRadius` is required. Exact flat-ray family: `h(x)=hm-R log(cos((x-xm)/R))`.
- `inverse-spherical`: `n=n0 sqrt(1+(1+h/R)^4-(1+h/R)^2)`, with analytical derivative; `R=options.occlusionRadius` is required. Numerically stable evaluation near the ground uses `t=h/R`, `1+t(2+t)(1+t)^2`. Exact limiting one-sided horizon distance is `d(h)=R acos(R/(R+h))`.

`options.n0` defaults to 1 in the two engineered profiles. Absolute scaling of `n` does not change ray geometry. All quantities use SI units (metres), and `occlusionRadius` describes the *sphere whose occlusion law is emulated*, **not** `trace({radius})`, which describes real Globe geometry. The special profiles intentionally have `dn/dh > 0`, unlike the standard model; they are mathematical inverse models, not normal terrestrial atmospheres.

## Independent checks

`tests/OpticalAtmosphericProfiles102.test.js` compares the RK4 integrator to the **exact exponential trajectory** at two initial heights and several steps, and to independent tangent-point positions derived from the exponential and spherical grazing-distance laws for several heights and three distinct radii. Additional tests check the analytic `dn/dh`, standard-atmosphere compatibility, sign of bending, radius separation and invalid inputs. The tangent-point evaluation deliberately integrates past the turning point with `stopAtGround:false` and locates the specified x coordinate using a local signed RK4 step, avoiding an artificial ground-event tolerance in the numerical oracle.

## What is not claimed

- Agreement of the horizon **threshold** does not imply equality of apparent angular size, entire projected geometry or magnification between Globe and Flat.
- These new atmospheric profiles are made available to the ray tracer but are **not** wired into the UI selector or Canvas. Existing `custom` inputs/UI are unchanged.
- General atmospheric point-to-point shooting and unique-ray guarantees remain future work. No mirage/multipath implementation is planned for this phase.
- Although grazing rays are verified against exact formulae at selected heights, this is not a mathematical proof of completeness of the sampled event detector for arbitrary profiles.

## Proposed focused path

103: atmospheric point projection and visibility statuses with controlled root finding; 104: shared cached ray field for the entire tower-bounding prism; 105: interpolation accuracy / throughput benchmarks; 106: physical tower silhouettes; 107: Independent Canvas integration; 108: Globe/Flat comparison under normal and engineered profiles. Speed/accuracy should be chosen on **measured pixel and visibility error**, not speculative refinement or per-tower ray integration. Document the decision after 105.
