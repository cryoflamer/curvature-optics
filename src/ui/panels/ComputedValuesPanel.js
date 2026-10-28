


ControlPanels.NewPanel( {
  Name: 'Output-Panel',
  ModelRef: 'CurveApp',
  OnModelChange: UpdateAll,
  NCols: 2,
  ReadOnly: true,
  Format: 'std',
  Digits: DefaultDigits

} ).AddTextField( {
  Name: 'hDip',
  Label: 'DipHeight&nbsp;b',
  Units: 'm'

} ).AddTextField( {
  Name: 'aDip',
  Label: 'DipAngle&nbsp;&alpha;',
  Mult: Math.PI / 180,
  Units: '&deg;'

} ).AddTextField( {
  Name: 'dHorizon',
  Label: 'HorDist&nbsp;s',
  Units: 'm'

} ).AddTextField( {
  Name: 'aEarth',
  Label: 'AngDiameter',
  Mult: Math.PI / 180,
  Units: '&deg;'

} ).AddTextField( {
  Name: 'rDisk',
  Label: 'HorDistX&nbsp;d',
  Units: 'm'

} ).AddTextField( {
  Name: 'dDelta',
  Label: 'Legacy LineSpacing',
  Units: 'm'

} ).AddTextField( {
  Name: 'zDisk',
  Label: 'HorDistZ&nbsp;p',
  Units: 'm'

} ).AddTextField( {
  Name: 'sceneWidth',
  Label: 'DsplHorWidth',
  Units: 'm'

} ).AddTextField( {
  Name: 'dView',
  Label: 'HorDistView&nbsp;v',
  Units: 'm'

} ).AddTextField( {
  Name: 'rEarth',
  Label: 'RadiusPlanet',
  Mult: 1000,
  Units: 'km',
  ReadOnly: false

} ).Render();
