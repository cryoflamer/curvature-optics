





ControlPanels.NewSliderPanel( {
  ModelRef: 'CurveApp',
  OnModelChange: UpdateAll,
  Format: 'std',
  Digits: DefaultDigits,
  ReadOnly: false,
  PanelFormat: 'InputMediumWidth'

} ).AddValueSliderField( {
  Name: 'Height',
  ValueRef: 'Height',
  SliderValueRef: 'HeightSlider',
  Units: 'm',
  Color: 'blue',
  Min: 0,
  Max: 1

} ).AddValueSliderField( {
  Name: 'FocalLength',
  ValueRef: 'FocalLengthField',
  SliderValueRef: 'FocalLengthSlider',
  Label: 'Zoom f',
  Units: 'mm',
  Color: 'black',
  Min: 0,
  Max: 1

} ).AddValueSliderField( {
  Name: 'ViewAngle',
  Label: 'View&ang;',
  ValueRef: 'ViewAngleField',
  SliderValueRef: 'ViewAngleSlider',
  Units: '&deg;',
  Color: 'black',
  Min: 0.82,
  Max: 91.6

} ).AddValueSliderField( {
  Name: 'Pan',
  ValueRef: 'Pan',
  SliderValueRef: 'PanSlider',
  Format: 'std',
  Digits: 3,
  Units: '&deg;',
  Color: 'green',
  Min: -1,
  Max: 1

} ).AddValueSliderField( {
  Name: 'Nick',
  ValueRef: 'Nick',
  SliderValueRef: 'NickSlider',
  Format: 'std',
  Digits: 3,
  Units: '&deg;',
  Color: 'green',
  Min: -1,
  Max: 1

} ).AddValueSliderField( {
  Name: 'Roll',
  Format: 'std',
  Digits: 3,
  Units: '&deg;',
  Color: 'green',
  Min: -45,
  Max: 45

} ).Render();
