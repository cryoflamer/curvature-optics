# Independent object geometry — compatch 79

The first object bank's `ObjType=3` (Tower Type 1) now has a pure local
geometry generator. `towerSequence`, horizon partitioning and composition
select Type 1 for `objIx=0` and Type 2 for `objIx=1`, matching `DrawShape`.

The original Type 2 public API is unchanged. Both local variants are checked
against the actual `DrawShape` implementation by `CurvatureTowerType1.test.js`.

**Not yet ported:** Bedford (0), M-Rod (1), ship (2), city (4), mountain (5),
bridge (6), Tensas Bayou (7), Causeway south/north (8/9). These shapes include
conditional draw-count branches, arcs, circles, path composition and mutable
plane-axis mirroring. They must be ported with explicit semantics rather than
silently substituting a tower. Production `DrawModel` remains unchanged.
