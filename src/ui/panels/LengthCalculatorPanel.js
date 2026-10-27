


ControlPanels.NewPanel( {
    Name: 'Units-Calculator',
    ModelRef: 'LengthModel',
    OnModelChange: UpdateLengthModel,
    NCols: 2,
    Format: 'std',
    Digits: 10
  }

).AddTextField( {
    Name: 'm',
    Label: 'Length',
    Units: 'm'
  }

).AddTextField( {
    Name: 'km',
    Label: '-',
    Units: 'km'
  }

).AddTextField( {
    Name: 'sm',
    Label: '(sea mile)',
    Units: 'sm'
  }

).AddTextField( {
    Name: 'mile',
    Label: '(statute)',
    Units: 'mile'
  }

).AddTextField( {
    Name: 'in',
    Label: '-',
    Units: 'in (Zoll)'
  }

).AddTextField( {
    Name: 'cm',
    Label: '',
    Units: 'cm'
  }

).AddTextField( {
    Name: 'ft',
    Label: '-',
    Units: 'ft'
  }

).AddTextField( {
    Name: 'fl',
    Label: 'FL',
    Units: ''
  }

).Render();
