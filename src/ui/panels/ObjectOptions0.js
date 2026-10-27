


ControlPanels.NewPanel( {
  Name: 'Object-Options0',
  ModelRef: 'CurveApp',
  NCols: 1,
  OnModelChange: UpdateAll

} ).AddRadiobuttonField( {
  Name: 'ObjType[0]',
  Label: 'ObjType',
  ValueType: 'int',
  NCols: 6,
  Items: [
    {
      Name: 'T-Tower',
      Value: 3
    }, {
      Name: 'City',
      Value: 4
    }, {
      Name: 'Mountain',
      Value: 5
    }, {
      Name: 'Bridge',
      Value: 6
    },{
      Name: 'Ship',
      Value: 2
    }, {
      Name: 'M-Rod',
      Value: 1
    }, {
      Name: 'Bedford',
      Value: 0
    }, {
      Name: 'Tensas B',
      Value: 7
    }, {
      Name: 'Causew-S',
      Value: 8
    }, {
      Name: 'Causew-N',
      Value: 9
    }
  ]

} ).AddRadiobuttonField( {
  Name: 'ObjSideType[0]',
  Label: 'SideVar',
  ValueType: 'int',
  Items: [
    {
      Name: 'Lin',
      Value: 0
    }, {
      Name: '2-Col',
      Value: 1
    }, {
      Name: 'Rand',
      Value: 2
    }, {
      Name: 'Cos',
      Value: 3
    }, {
      Name: 'Sin',
      Value: 4
    }
  ]

} ).AddRadiobuttonField( {
  Name: 'ObjSizeType[0]',
  Label: 'SizeVar',
  ValueType: 'int',
  Items: [
    {
      Name: 'Lin',
      Value: 0
    }, {
      Name: 'Alt',
      Value: 1
    }, {
      Name: 'Rand',
      Value: 2
    }, {
      Name: 'Cos',
      Value: 3
    }, {
      Name: 'Sin',
      Value: 4
    }
  ]

} ).Render();
