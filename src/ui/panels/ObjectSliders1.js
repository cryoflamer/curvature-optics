


ControlPanels.NewSliderPanel( {
  Name: 'Object-Sliders1',
  ModelRef: 'CurveApp',
  OnModelChange: UpdateAll,
  Format: 'std',
  Digits: DefaultDigits,
  ReadOnly: false,
  PanelFormat: 'InputMediumWidth'

} ).AddValueSliderField( {
  Name: 'NObjects',
  ValueRef: 'NObjects[1]',
  Label: 'NObjects',
  Color: 'black',
  Format: 'fix',
  Digits: 0,
  Min: 0,
  Max: 200,
  Steps: 200,

} ).AddValueSliderField( {
  Name: 'ObjDist',
  Label: 'Dist',
  ValueRef: 'ObjDist[1]',
  SliderValueRef: 'Slider_ObjDist_Log[1]',
  Units: 'm',
  Color: 'blue',
  Min: 0,
  Max: 5,

} ).AddValueSliderField( {
  Name: 'ObjDeltaDist',
  Label: 'DeltaDist',
  ValueRef: 'ObjDeltaDist[1]',
  SliderValueRef: 'Slider_ObjDeltaDist_Log[1]',
  Units: 'm',
  Color: 'blue',
  Min: 0,
  Max: 4,

} ).AddValueSliderField( {
  Name: 'ObjSidePos',
  Label: 'SidePos',
  ValueRef: 'ObjSidePos[1]',
  SliderValueRef: 'Slider_ObjSidePos_Log[1]',
  Units: 'm',
  Color: 'green',
  Min: -3,
  Max: 3,

} ).AddValueSliderField( {
  Name: 'ObjSideVar',
  Label: 'SideVar',
  ValueRef: 'ObjSideVar[1]',
  SliderValueRef: 'Slider_ObjSideVar_Log[1]',
  Units: 'm',
  Color: 'green',
  Min: -5,
  Max: 5,

} ).AddValueSliderField( {
  Name: 'ObjSize',
  ValueRef: 'ObjSize[1]',
  SliderValueRef: 'Slider_ObjSize_Log[1]',
  Units: 'm',
  Color: 'red',
  Min: 0,
  Max: 4,

} ).AddValueSliderField( {
  Name: 'ObjSizeVar',
  ValueRef: 'ObjSizeVar[1]',
  Label: 'SizeVar',
  Units: '%',
  Mult: 0.01,
  Color: 'red',
  Min: -1,
  Max: 1,

} ).Render();
