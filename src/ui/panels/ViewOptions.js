


ControlPanels.NewPanel( {
  Name: 'Options',
  ModelRef: 'CurveApp',
  NCols: 2,
  OnModelChange: UpdateAll

} ).AddRadiobuttonField( {
  Name: 'showModel',
  Label: 'Model',
  ValueType: 'int',
  Items: [
    {
      Name: 'Globe',
      Value: 1
    }, {
      Name: 'FlatEarth',
      Value: 2
    }, {
      Name: 'Globe+FE',
      Value: 3
    }
  ]

} ).AddRadiobuttonField( {
  Name: 'viewcenterHorizon',
  Label: 'CameraAim',
  ValueType: 'int',
  Items: [
    {
      Name: 'Horizon',
      Value: 0
    }, {
      Name: 'Betwn',
      Value: 2
    }, {
      Name: 'FE-Eq',
      Value: 1
    }, {
      Name: 'Eye-Lvl',
      Value: 3
    }
  ]

} ).AddRadiobuttonField( {
  Name: 'showGrid',
  Label: 'Grid',
  ValueType: 'int',
  Items: [
    {
      Name: 'Off',
      Value: 0
    }, {
      Name: 'On',
      Value: 1
    }, {
      Name: 'Projected',
      Value: 3
    }
  ]

} ).AddRadiobuttonField( {
  Name: 'nLines',
  Label: 'Lines',
  ValueType: 'int',
  Items: [
    {
      Name: '15',
      Value: 15
    }, {
      Name: '30',
      Value: 30
    }, {
      Name: '45',
      Value: 45
    }, {
      Name: '60',
      Value: 60
    }, {
      Name: '90',
      Value: 90
    }
  ]

} ).AddCheckboxField( {
  Name: 'Show',
  Label: 'Show',
  Items: [
    {
      Name: 'showEyeLevel',
      Text: 'Eye-Level',
    }, {
      Name: 'showTangent',
      Text: 'Tangent',
    }, {
      Name: 'showData',
      Text: 'Data',
    }
  ]

} ).AddRadiobuttonField( {
  Name: 'deviceRatio',
  Label: 'AspectRatio',
  ValueType: 'num',
  Items: [
    {
      Name: '3:2',
      Value: 3/2
    }, {
      Name: '2:3',
      Value: 2/3
    }, {
      Name: '16:9',
      Value: 16/9
    }, {
      Name: '9:16',
      Value: 9/16
    }
  ]

} ).Render();
