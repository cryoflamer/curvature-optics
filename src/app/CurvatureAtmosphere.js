


var BaroConst = {
  hIx: 0,

  // air level data of standard atmosphere model
  hLimitTab: [
    11000,
    20000,
    32000,
    47000,
    51000,
    71000,
    84852,
        0
  ],
  hRefTab: [
        0,
    11000,
    20000,
    32000,
    47000,
    51000,
    71000,
    NaN
  ],
  alphaTab: [
    -0.0065,
     0,
     0.001,
     0.0028,
     0,
    -0.0028,
    -0.002,
    NaN
  ],
  TRefTab: [
    288.15,
    216.65,
    216.65,
    228.65,
    270.65,
    270.65,
    214.65,
    NaN
  ],
  rhoRefTab: [
    1.225,
    0.363918,
    0.0880348,
    0.013225,
    0.00142753,
    0.000861605,
    0.000064211,
    NaN
  ],
  pRefTab: [
    101325,
    22632.1,
    5474.89,
    868.019,
    110.906,
    66.9389,
    3.95642,
    NaN
  ],

  // some general constants
  g:     9.80665,
  R:     8.31432,
  RS:    287.053,
  kappa: 1.4,
  M:     28.9644,

  // private function
  defIx:  function(i) { return xDefNum( i, this.hIx ); },

  // set altitude range for following functions
  SetAltRange: function( h ) {
    for (var i = 0; i < this.hLimitTab.length; i++) {
      if (h <= this.hLimitTab[i]) {
        this.hIx = i;
        return;
      }
    }
    this.hIx = this.hLimitTab.length - 1;
  },

  // query level dependent constants
  // default for i is this.hIx, see SetAltRange(h)
  hRef:   function(i) { return this.hRefTab[this.defIx(i)]; },
  alpha:  function(i) { return this.alphaTab[this.defIx(i)]; },
  TRef:   function(i) { return this.TRefTab[this.defIx(i)]; },
  rhoRef: function(i) { return this.rhoRefTab[this.defIx(i)]; },
  pRef:   function(i) { return this.pRefTab[this.defIx(i)]; }

};

var ConvertUnit = {
  ms_kt: function( v ) { return v * 1.944; },
  kt_ms: function( v ) { return v / 1.944; },
  ft_m:   function( h ) { return h * 0.3048; },
  m_ft:   function( h ) { return h / 0.3048; },
  K_C:    function( t ) { return t - 273.15; },
  C_K:    function( t ) { return t + 273.15; },
  K_F:    function( t ) { return t * 1.8 - 459.67; },
  F_K:    function( t ) { return (t + 459.67) / 1.8; }
}

var BaroModel = {

  h: -1,  // used for optimisation, CurveApp.Height is used instead,
  T_C: 0,
  T: 0,
  p: 0,
  rho: 0,
  alpha: 0,

  TempOfH: function( h ) {
    return BaroConst.TRef() +
      BaroConst.alpha() * (h - BaroConst.hRef());
  },

  PressureOfH: function( h ) {
    var alpha = BaroConst.alpha();
    if (alpha == 0) {
      // isoterm
      var hs = BaroConst.RS * BaroConst.TRef() / BaroConst.g;
      var p = BaroConst.pRef() * Math.exp( -(h - BaroConst.hRef()) / hs );
      return p;
    } else {
      var beta = BaroConst.g / BaroConst.RS / alpha;
      var p = BaroConst.pRef() * Math.pow( 1 + alpha * (h - BaroConst.hRef()) / BaroConst.TRef(), -beta );
      return p;
    }
  },

  DensityOfH: function( h ) {
    var alpha = BaroConst.alpha();
    if (alpha == 0) {
      // isoterm
      var hs = BaroConst.RS * BaroConst.TRef() / BaroConst.g;
      var r = BaroConst.rhoRef() * Math.exp( -(h - BaroConst.hRef()) / hs );
      return r;
    } else {
      var beta = BaroConst.g / BaroConst.RS / alpha;
      var r = BaroConst.rhoRef() * Math.pow( 1 + alpha * (h - BaroConst.hRef()) / BaroConst.TRef(), -beta-1 );
      return r;
    }
  },

  Update: function() {
    if (this.h == CurveApp.Height) return;
    BaroConst.SetAltRange( CurveApp.Height );
    this.alpha = BaroConst.alpha();
    this.T = this.TempOfH( CurveApp.Height );
    this.T_C = this.T - 273.15;
    this.p = this.PressureOfH( CurveApp.Height );
    //this.rho = this.DensityOfH( CurveApp.Height );  not used
    this.h = CurveApp.Height;
  }

};

CurveApp.BaroModel = BaroModel;

ControlPanels.NewPanel( {
  Name: 'Refraction-Panel',
  ModelRef: 'CurveApp',
  OnModelChange: UpdateAll,
  NCols: 2,
  ReadOnly: false,
  Format: 'std',
  Digits: DefaultDigits

} ).AddSliderField( {
  Name: 'refractionSlider',
  Label: 'Refraction',
  Color: 'red',
  ColSpan: 3,
  Min: 0,
  Max: 1,

} ).AddTextField( {
  Name: 'refractionCoeff',
  Label: 'Coeff. k',

} ).AddTextField( {
  Name: 'tempGradient',
  Label: 'dT/dh',
  Units: '&deg;C/m',

} ).AddTextField( {
  Name: 'refractionFact',
  Label: 'Factor a',

} ).AddTextField( {
  Name: 'temperatureC',
  Label: 'Temp. T',
  Units: '&deg;C',

} ).AddTextField( {
  Name: 'refractionRadius',
  Label: 'Radius R\'',
  Mult: 1000,
  Units: 'km',

} ).AddTextField( {
  Name: 'pressure',
  Label: 'Press. P',
  Units: 'mBar',

} ).AddTextField( {
  Name: 'ObjRefrAng',
  Label: 'ObjRefr&ang;',
  ReadOnly: true,
  Units: '&deg;',

} ).AddTextField( {
  Name: 'ObjAngSize',
  Label: 'ObjSize&ang;',
  ReadOnly: true,
  Units: '&deg;',

} ).AddTextField( {
  Name: 'ObjLiftAbs',
  Label: 'ObjLiftAbs',
  ReadOnly: true,
  Units: 'm',

} ).AddTextField( {
  Name: 'ObjLiftRel',
  Label: 'ObjLiftRel',
  ReadOnly: true,
  Units: 'm',

} ).AddRadiobuttonField( {
  Name: 'refractionSync',
  Label: 'BaroLink',
  ColSpan: 3,
  ValueType: 'int',
  Items: [
    {
      Name: 'off',
      Value: 0
    }, {
      Name: 'T,P',
      Value: 1
    }, {
      Name: 'Std-Atm',
      Value: 2
    }, {
      Name: 'k=0.13',
      Value: 3
    }, {
      Name: 'k=0.17',
      Value: 4
    }, {
      Name: 'a=7/6',
      Value: 5
    }, {
      Name: 'a=7/2',
      Value: 6
    }
  ]
} ).Render();

function ResetRefr() {
  CurveApp.refractionSync = 1;
  CurveApp.refractionCoeff = 0;
  UpdateAll();
}

ControlPanels.NewPanel( {
  Name: 'RefractionBaro-Panel',
  ModelRef: 'CurveApp',
  OnModelChange: UpdateAll,
  NCols: 2,
  ReadOnly: true,
  Format: 'std',
  Digits: DefaultDigits

} ).AddHeader( {
  Text: 'Std-Atmosphere Barometer: use BaroLink to link with Refraction settings' +
    ControlPanels.SmallButtonR( 'Refr k=0', 'ResetRefr()', 'Red' ),
  ColSpan: 4,

} ).AddSliderField( {
  Name: 'HeightSlider',
  Label: 'Height h',
  Color: 'blue',
  ColSpan: 3,
  Min: 0,
  Max: 1,

} ).AddTextField( {
  Name: 'Height',
  Label: 'Height h',
  Units: 'm',
  ReadOnly: false,

} ).AddTextField( {
  Name: 'BaroModel.T_C',
  Label: 'T(h)',
  Units: '&deg;C',

} ).AddTextField( {
  Name: 'BaroModel.alpha',
  Label: 'Td/dh(h)',
  Units: '&deg;C/m',

} ).AddTextField( {
  Name: 'BaroModel.p',
  Label: 'P(h)',
  Units: 'mBar',
  Mult: 100,

} ).Render();
