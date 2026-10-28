


var ThisPageUrl = 'http://walter.bislins.ch/projekte/javascript/CurvatureApp/CurvatureApp.html?v=1';
var DefaultDigits = 6;

function toRad( a ) { return a * Math.PI / 180; }
function toDeg( a ) { return a * 180 / Math.PI; }

// meta data for Json generation and loading

var CurveAppMetaData = {
  Compact: false,
  DefaultPrec: 8,
  Properties: [
    { Name: 'DemoText',          Type: 'str',  Default: '' },
    { Name: 'Description',       Type: 'str',  Default: '' },

    { Name: 'Height',            Type: 'num',  Default: 100 },
    { Name: 'FocalLengthField',  Type: 'num',  Default: 33.9 },
    { Name: 'Roll',              Type: 'num',  Default: 0 },
    { Name: 'Nick',              Type: 'num',  Default: 0 },
    { Name: 'Pan',               Type: 'num',  Default: 0 },

    { Name: 'nLines',            Type: 'int',  Default: 45 },
    { Name: 'showModel',         Type: 'int',  Default: 1 },
    { Name: 'showGrid',          Type: 'int',  Default: 1 },
    { Name: 'showData',          Type: 'bool', Default: false },
    { Name: 'showTangent',       Type: 'bool', Default: false },
    { Name: 'showEyeLevel',      Type: 'bool', Default: true },
    { Name: 'deviceRatio',       Type: 'num',  Default: 1.5 },
    { Name: 'viewcenterHorizon', Type: 'int',  Default: 0 },

    { Name: 'ObjType',           Type: 'arr', Size: 2, ArrayType: 'int', Default: [ 3, 3 ] },
    { Name: 'NObjects',          Type: 'arr', Size: 2, ArrayType: 'int', Default: [ 0, 0 ] },
    { Name: 'ObjDist',           Type: 'arr', Size: 2, ArrayType: 'num', Default: [ 500, 600 ] },
    { Name: 'ObjDeltaDist',      Type: 'arr', Size: 2, ArrayType: 'num', Default: [ 300, 300 ] },
    { Name: 'ObjSideType',       Type: 'arr', Size: 2, ArrayType: 'int', Default: [ 0, 0 ] },
    { Name: 'ObjSidePos',        Type: 'arr', Size: 2, ArrayType: 'num', Default: [ 0, 0 ] },
    { Name: 'ObjSideVar',        Type: 'arr', Size: 2, ArrayType: 'num', Default: [ 0, 0 ] },
    { Name: 'ObjSizeType',       Type: 'arr', Size: 2, ArrayType: 'int', Default: [ 0, 0 ] },
    { Name: 'ObjSize',           Type: 'arr', Size: 2, ArrayType: 'num', Default: [ 65, 100 ] },
    { Name: 'ObjSizeVar',        Type: 'arr', Size: 2, ArrayType: 'num', Default: [ 0, 0 ] },

    { Name: 'opticsMode',        Type: 'str',  Default: 'legacy-k' },
    { Name: 'opticsProfile',     Type: 'str',  Default: 'standard' },
    { Name: 'refractionCoeff',   Type: 'num',  Default: 0 },
    { Name: 'tempGradient',      Type: 'num',  Default: -0.0065 },
    { Name: 'refractionSync',    Type: 'int',  Default: 1 },
    { Name: 'pressure',          Type: 'num',  Default: 1013.25 },
    { Name: 'temperatureC',      Type: 'num',  Default: 15 },
    { Name: 'refractionFactMin', Type: 'num',  Default: 0.5 },
    { Name: 'refractionFactMax', Type: 'num',  Default: 10000 },

    { Name: 'rEarth',            Type: 'num',  Default: 6371000 },
    { Name: 'rFEarth',           Type: 'num',  Default: 10007543 },
  ],
};


// Curve App

function CurveAppClass() {

  this.DemoText = '';
  this.Description = '';
  this.StateDisplay = null;
  this.AllStatesChanged = false;
  this.pause = 0; // dummy for animation delays

  this.rEarth = 6371000;
  this.rFEarth = 10007543; // this.rEarth * Math.PI / 2;
  this.nLines = 45;
  this.showModel = 1; // 1 -> globe, 2 -> flat, 3 -> both
  this.showGrid = 1; // 0 -> none, 1 -> on, 3 -> projection of globe to flat
  this.showData = false;
  this.showTangent = false;
  this.showEyeLevel = true;
  this.deviceRatio = 3 / 2; // width / height of device screen
  this.sceneWidth = 0;
  this.sceneHeight = 0;
  this.viewcenterHorizon = 0;  // 0 -> globe, 1 -> flat earth, 2 -> between, 3 -> eye level

  // Optical backend selection (scaffold only; legacy rendering is unchanged).
  this.opticsMode = 'legacy-k';
  this.opticsProfile = 'standard';
  // Geometry radius is independent of the legacy effective refraction radius.
  this.geometryRadius = this.rEarth;

  // refraction
  this.BaroModel = null;
  // refractionSync = 0 -> off, 1 -> T,P, 2 -> std, 3 -> k=0.13, 4 -> k=0.17, 5 -> a=7/6, 6 -> a=7/2
  this.refractionSync = 1;
  this.refractionFactMax = 10000;
  this.refractionFactMin = 0.5;
  this.pressure = 1013.25;      // mBar
  this.pressureLast = 1013.25;
  this.temperature = 288.15;    // K
  this.temperatureC = 15;       // Celsius
  this.temperatureCLast = 15;
  this.tempGradient = -0.0065;  // K/m
  this.tempGradientLast = -0.0065;
  this.refractionCoeff = 0;
  this.refractionCoeffLast = 0;
  this.refractionFact = 1;
  this.refractionFactLast = 1;
  this.refractionRadius = this.rEarth;
  this.refractionRadiusLast = this.rEarth;
  this.refractionSlider = 0;
  this.refractionSliderLast = 0;

  this.HeightSlider = 0;
  this.HeightSliderLast = 0;
  this.Height = 100;

  this.ViewAngle = 0;  // viewAngle in deg
  this.ViewAngleField = 0;
  this.ViewAngleSlider = 0;
  this.ViewAngleSliderLast = 0;
  this.Roll = 0;
  this.Nick = 0;
  this.LastNick = 0;
  this.NickSlider = 0;
  this.LastNickSlider = 0;
  this.Pan = 0;
  this.LastPan = 0;
  this.PanSlider = 0;
  this.LastPanSlider = 0;
  this.PanRad = 0;
  this.FocalLength = 0;
  this.FocalLengthField = 33.9;
  this.FocalLengthSlider = 0;
  this.FocalLengthSliderLast = 0;

  this.rDisk = 0;          // d
  this.dHorizon = 0;       // s
  this.zDisk = 0;          // p
  this.hDisk = 0;          // R - b
  this.hDip = 0;           // b
  this.aDip = 0;           // alpha
  this.aEarth = 0;         // 180 - 2 * alpha
  this.dView = 0;          // v
  this.aDelta = 0;         // aDip / nLines
  this.posEarth = [ 0, 0, -this.refractionRadius ];
  this.camViewAngle = 0.1; // rad
  this.camPos = [ 0, 0, 0 ];
  this.camUp = [ 0, 0, 1 ];
  this.camViewCenter = [ 0, 1, 0 ];
  this.camSceneSize = 1;

  // object settings
  this.ObjType = [ 3, 3 ]; // 0 = Bedford, 1 = scale, 2 = ship, 3 = T-Tower, 4 = city, 5 = mountain, 6 = bridge, 7 = tensas bayou, 8 = Causew-S, 9 = Causew-N
  this.ObjSideType = [ 0, 0 ]; // 0 = lin, 1 = 2col, 2 = rand, 3 = cos, 4 = sin
  this.ObjSizeType = [ 0, 0 ]; // 0 = lin, 1 = 2col, 2 = rand, 3 = cos, 4 = sin

  this.ObjDist = [ 500, 600 ];
  this.Slider_ObjDist_Log = [ 0, 0 ];
  this.Slider_ObjDist_Log_Last = [ 0, 0 ];

  this.ObjSidePos = [ 0, 0 ];
  this.Slider_ObjSidePos_Log = [ 0, 0 ];
  this.Slider_ObjSidePos_Log_Last = [ 0, 0 ];

  this.ObjSize = [ 65, 100 ];
  this.Slider_ObjSize_Log = [ 0, 0 ];
  this.Slider_ObjSize_Log_Last = [ 0, 0 ];

  this.ObjDeltaDist = [ 300, 300 ];
  this.Slider_ObjDeltaDist_Log = [ 0, 0 ];
  this.Slider_ObjDeltaDist_Log_Last = [ 0, 0 ];

  this.ObjSideVar = [ 0, 0 ];
  this.Slider_ObjSideVar_Log = [ 0, 0 ];
  this.Slider_ObjSideVar_Log_Last = [ 0, 0 ];

  this.ObjSizeVar = [ 0, 0 ];
  this.NObjects = [ 0, 0 ];

  // object draw loop variables
  this.aObjDelta = [ 0, 0 ];
  this.aObjFirst = [ 0, 0 ];
  this.aObjLast = [ 0, 0 ];
  this.NObjectsDrawn = [ 0, 0 ];
  this.MaxNObjectsToDraw = [ 0, 0 ];
  this.aObjCurr = [ 0, 0 ];
  this.isHiddenObj = [ false, false ];
  this.LastPosValid = [ false, false ];

  // computed object values
  this.HorizonRefrAng = 0;
  this.ObjRefrAng = 0;
  this.ObjViewDist = 0;
  this.ObjLiftAbs = 0;
  this.ObjLiftRel = 0;
  this.ObjAngSize = 0;

  // colors; for some elements '' -> do not draw element
  this.EyeLvlCol = 'magenta';
  this.FEEqCol = 'black';
  this.FEGridCol = 'black';
  this.GlobeGridCol = 'blue';
  this.GlobeFGridCol = 'red';
  this.TangentCol = 'black';
  this.FrameCol = 'black';

  this.Update();
}

CurveAppClass.prototype.Update = function() {
  var pi90 = Math.PI / 2;

  // input validation
  if ( this.rEarth  < 100000 ) this.rEarth  = 100000;
  if ( this.rFEarth < 100000 ) this.rFEarth = 100000;
  if (this.nLines > 200) this.nLines = 200;
  this.showModel = Math.floor(this.showModel);
  if (this.showModel < 1 || this.showModel > 3) this.showModel = 1;
  this.showGrid = Math.floor(this.showGrid);
  if (this.showGrid < 0 || this.showGrid > 3) this.showGrid = 1;
  if (this.deviceRatio <= 0) this.deviceRatio = 1.5;
  this.viewcenterHorizon = Math.floor(this.viewcenterHorizon);
  if (this.viewcenterHorizon < 0 || this.viewcenterHorizon > 3) this.viewcenterHorizon = 0;

  // handle height changes
  if ( this.HeightSliderLast != this.HeightSlider ) {
    this.Height = Math.pow( 10, 0 + 9 * this.HeightSlider );
  }
  if ( this.Height < 0.001 ) this.Height = 0.001;
  if ( this.Height > 1000000000 ) this.Height = 1000000000;
  this.HeightSlider = ( Math.log10( this.Height ) - 0 ) / 9;
  this.HeightSliderLast = this.HeightSlider;
  if (this.BaroModel) {
    // BaroModel depends on Height
    this.BaroModel.Update();
  }

  // handle refraction changes
  // refractionSync: 0 -> off, 1 -> T,P, 2 -> std, 3 -> k=0.13, 4 -> k=0.17, 5 -> a=7/6, 6 -> a=7/2

  this.refractionSync = Math.floor(this.refractionSync);
  if (this.refractionSync < 0 || this.refractionSync > 6) this.refractionSync = 1;
  if (this.refractionFactMin < 0.1) this.refractionFactMin = 0.1;
  if (this.refractionFactMin > 1) this.refractionFactMin = 1;
  if (this.refractionFactMax < 10000) this.refractionFactMax = 10000;
  var k_min = 1 - 1 / this.refractionFactMin;
  var k_max = 1 - 1 / this.refractionFactMax;
  if (this.refractionCoeff < k_min) this.refractionCoeff = k_min;
  if (this.refractionCoeff > k_max) this.refractionCoeff = k_max;
  if (this.pressure < 0) this.pressure = 0;
  if (this.pressure > 1200) this.pressure = 1200;
  if (this.temperatureC < -100) this.temperatureC = -100;
  if (this.temperatureC > 100) this.temperatureC = 100;

  // revert sync mode to T,P or off if some refraction values have changed manually
  if (this.AllStatesChanged) {
    // refractionsSync has priority if multiple values have changed
    if (this.refractionSync == 2 || this.refractionSync == 0) {
      // ensure that tempGradient has priority
      this.tempGradientLast = this.tempGradient + 1;
      this.refractionCoeffLast = this.refractionCoeff;
    } else {
      // ensure that refractionCoeff has priority
      this.refractionCoeffLast = this.refractionCoeff + 1;
      this.tempGradientLast = this.tempGradient;
    }
  } else {
    if (this.refractionSync >= 2 &&
        (this.refractionSlider != this.refractionSliderLast ||
         this.tempGradient != this.tempGradientLast ||
         this.refractionCoeff != this.refractionCoeffLast ||
         this.refractionFact != this.refractionFactLast ||
         this.refractionRadius != this.refractionRadiusLast)
    )
    {
      this.refractionSync = 1;
    } else if (this.refractionSync > 0 &&
               (this.temperatureC != this.temperatureCLast ||
                this.pressure != this.pressureLast)
    )
    {
      this.refractionSync = 0;
    }
  }

  // synchronize refraction pressure, temp and gradient with baro settings
  if (this.refractionSync >= 1) {
    if (this.Height > 84852) {
      this.temperatureC = -86.204;
      this.pressure = 0.00373383;
      if (this.refractionSync == 2) {
        this.tempGradient = -0.002;
        this.tempGradientLast = this.tempGradient - 1; // indicate a change
        this.refractionCoeffLast = this.refractionCoeff;
      }
    } else if (this.BaroModel) {
      var baroModel = this.BaroModel;
      this.temperatureC = baroModel.T_C;
      this.pressure = baroModel.p / 100;
      if (this.refractionSync == 2) {
        this.tempGradient = baroModel.alpha;
        this.tempGradientLast = this.tempGradient - 1; // indicate a change
        this.refractionCoeffLast = this.refractionCoeff;
      }
    }
  }

  // handle sync modes
  if (this.refractionSync == 3) {
    this.refractionCoeff = 0.13;
    this.refractionCoeffLast = this.refractionCoeff + 1; // indicate change
  } else if (this.refractionSync == 4) {
    this.refractionCoeff = 0.17;
    this.refractionCoeffLast = this.refractionCoeff + 1; // indicate change
  } else if (this.refractionSync == 5) {
    this.refractionFact = 7 / 6;
    this.refractionFactLast = this.refractionFact + 1; // indicate change
  } else if (this.refractionSync == 6) {
    this.refractionFact = 7 / 2;
    this.refractionFactLast = this.refractionFact + 1; // indicate change
  }

  // handle changes of refraction input fields and sliders
  this.temperature = this.temperatureC + 273.15;
  if (this.refractionSlider != this.refractionSliderLast) {
    // slider changed
    this.refractionCoeff = k_max * this.refractionSlider;
  } else if (this.refractionCoeff != this.refractionCoeffLast) {
    // k changed
  } else if (this.tempGradient != this.tempGradientLast) {
    // dT/dh changed
    if (this.temperature < 3) this.temperature = 3;
    this.refractionCoeff = 503 * (this.pressure / (this.temperature*this.temperature)) * (0.0343 + this.tempGradient);
  } else if (this.refractionFact != this.refractionFactLast) {
    // a changed
    if (this.refractionFact < this.refractionFactMin) this.refractionFact = this.refractionFactMin;
    if (this.refractionFact > this.refractionFactMax) this.refractionFact = this.refractionFactMax;
    this.refractionCoeff = 1 - 1 / this.refractionFact;
  } else if (this.refractionRadius != this.refractionRadiusLast) {
    // R' changed
    this.refractionFact = this.refractionRadius / this.rEarth;
    if (this.refractionFact < this.refractionFactMin) this.refractionFact = this.refractionFactMin;
    if (this.refractionFact > this.refractionFactMax) this.refractionFact = this.refractionFactMax;
    this.refractionCoeff = 1 - 1 / this.refractionFact;
  }

  // limit some inputs
  if (this.refractionCoeff < k_min) this.refractionCoeff = k_min;
  if (this.refractionCoeff > k_max) this.refractionCoeff = k_max;
  if (this.temperature < 3) this.temperature = 3;
  if (this.temperature > 10000) this.temperature = 10000;
  this.temperatureC = this.temperature - 273.15;
  if (this.pressure < 0.001) this.pressure = 0.001;
  if (this.pressure > 10000) this.pressure = 10000;
  if (Math.abs(this.refractionCoeff) < 0.000002) this.refractionCoeff = 0;

  // compute refraction values
  this.tempGradient = (this.refractionCoeff * this.temperature * this.temperature) / (503 * this.pressure) - 0.0343;
  if (Math.abs(this.tempGradient) < 0.000001) this.tempGradient = 0;
  this.refractionFact = 1 / (1 - this.refractionCoeff);
  this.refractionRadius = this.rEarth * this.refractionFact;
  this.refractionSlider = this.refractionCoeff / k_max;

  // store current refration values for detecting user changes
  this.refractionSliderLast = this.refractionSlider;
  this.refractionCoeffLast = this.refractionCoeff;
  this.tempGradientLast = this.tempGradient;
  this.refractionFactLast = this.refractionFact;
  this.refractionRadiusLast = this.refractionRadius;
  this.temperatureCLast = this.temperatureC;
  this.pressureLast = this.pressure;

  // handle ViewAngle and FocalLength changes
  if ( this.FocalLengthSlider != this.FocalLengthSliderLast ) {
    var f = (3000-21) * Math.pow(this.FocalLengthSlider,2) + 21;  // f = 21..3000
    this.ViewAngle = toDeg( 2 * Math.atan( 43.2 / 2 / f ) );
  } else if ( this.FocalLengthField != this.FocalLength ) {
    this.ViewAngle = toDeg( 2 * Math.atan( 43.2 / 2 / this.FocalLengthField ) );
  } else if ( this.ViewAngleSlider != this.ViewAngleSliderLast ) {
    this.ViewAngle = this.ViewAngleSlider;
  } else if ( this.ViewAngleField != this.ViewAngle ) {
    this.ViewAngle = this.ViewAngleField;
  }
  if ( this.ViewAngle < 0.1 ) this.ViewAngle = 0.1;
  if ( this.ViewAngle > 160 ) this.ViewAngle = 160;
  this.camViewAngle = toRad( this.ViewAngle );
  this.FocalLength = 43.2 / ( 2 * Math.tan( this.camViewAngle / 2 ) );
  this.FocalLengthField = this.FocalLength;
  var f = this.FocalLength - 21;
  if (f < 0) f = 0;
  this.FocalLengthSlider = Math.pow(f/(3000-21),1/2);
  this.FocalLengthSliderLast = this.FocalLengthSlider;
  this.ViewAngleField = this.ViewAngle;
  this.ViewAngleSlider = this.ViewAngle;
  this.ViewAngleSliderLast = this.ViewAngle;

  this.UpdateObjectInput(0);
  this.UpdateObjectInput(1);

  // In ray-tracing mode only the *geometry* is switched to the physical
  // radius. Optical rays are not yet implemented (vacuum preview).
  // The legacy k controls and their computed values remain untouched.
  this.geometryRadius = this.opticsMode === 'ray-tracing'
    ? this.rEarth : this.refractionRadius;

  // compute diverse values
  // At extremely large radii acos(R/(R+H)) rounds to zero and the old
  // difference R - R*cos(dip) loses the eye height. The physical renderer
  // uses an observer-fixed camera; nevertheless keep these legacy derived
  // fields finite when a Physical radius slider explores the flat limit.
  // Ordinary legacy Earth values retain their historical exact arithmetic.
  if (this.geometryRadius > 1e12) {
    var q = this.Height / this.geometryRadius;
    this.aDip = Math.atan(Math.sqrt(q) * Math.sqrt(2+q));
    this.rDisk = this.geometryRadius * Math.sin(this.aDip);
    this.dHorizon = this.geometryRadius * this.aDip;
    this.hDip = this.Height / (1+q);
    this.hDisk = this.geometryRadius - this.hDip;
    this.dView = Math.sqrt(this.Height) * Math.sqrt(this.geometryRadius) * Math.sqrt(2+q);
  } else {
    this.aDip = Math.acos( this.geometryRadius / (this.geometryRadius + this.Height) );
    this.rDisk = this.geometryRadius * Math.sin( this.aDip );
    this.dHorizon = this.geometryRadius * this.aDip;
    this.hDisk = this.geometryRadius * Math.cos( this.aDip );
    this.hDip = this.geometryRadius - this.hDisk;
    this.dView = ( this.Height + this.geometryRadius ) * Math.sin( this.aDip );
  }
  this.aEarth = Math.PI - 2 * this.aDip;
  this.aDelta = this.aDip / this.nLines;
  this.dDelta = this.showModel & 1 ? this.aDelta * this.geometryRadius : 0;
  this.posEarth = [ 0, 0, -(this.geometryRadius + this.Height) ];
  this.zDisk = this.geometryRadius>1e12?this.Height+this.hDip:
    (this.geometryRadius + this.Height) - ( this.geometryRadius * Math.cos( this.aDip ) );

  // Nick and Pan slider synchronization
  if (this.Nick != this.LastNick) {
    if (this.Nick < -85) this.Nick = -85;
    if (this.Nick >  45) this.Nick =  45;
    if (this.Nick > 0) {
      this.NickSlider = Math.sqrt( this.Nick / 45 );
    } else {
      this.NickSlider = - Math.sqrt( -this.Nick / 85 );
    }
  } else if (this.NickSlider != this.LastNickSlider) {
    if (this.NickSlider > 0) {
      this.Nick = Math.pow( this.NickSlider, 2 ) * 45;
    } else {
      this.Nick = - Math.pow( this.NickSlider, 2 ) * 85;
    }
  }
  this.LastNick = this.Nick;
  this.LastNickSlider = this.NickSlider;

  if (this.Pan != this.LastPan) {
    if (this.Pan < -180) this.Pan = -180;
    if (this.Pan >  180) this.Pan =  180;
    if (this.Pan > 0) {
      this.PanSlider = Math.sqrt( this.Pan / 90 );
    } else {
      this.PanSlider = - Math.sqrt( -this.Pan / 90 );
    }
  } else if (this.PanSlider != this.LastPanSlider) {
    if (this.PanSlider > 0) {
      this.Pan = Math.pow( this.PanSlider, 2 ) * 90;
    } else {
      this.Pan = - Math.pow( this.PanSlider, 2 ) * 90;
    }
  }
  this.PanRad = toRad( this.Pan );
  this.LastPan = this.Pan;
  this.LastPanSlider = this.PanSlider;

  // compute camViewCenter from panning
  if (this.Roll < -180) this.Roll = -180;
  if (this.Roll >  180) this.Roll = 180;
  var dvc, avc, nickRad;
  nickRad = toRad( this.Nick );
  dvc = Math.sqrt( this.rDisk * this.rDisk + this.zDisk * this.zDisk );
  if (this.viewcenterHorizon == 0) {
    // view center is globe horizon
    avc = this.aDip;
  } else if (this.viewcenterHorizon == 1) {
    // view center is flat earth equator
    avc = Math.atan( this.Height / this.rFEarth );
  } else if (this.viewcenterHorizon == 2) {
    // view center is between globe horizon and flat earth equator
    avc = (Math.atan( this.Height / this.rFEarth ) + this.aDip) / 2;
  } else {
    // view center is eye level
    avc = 0;
  }
  avc -= nickRad;
  if ( avc > 0.9999*pi90 ) avc = 0.9999*pi90;
  if ( avc < -0.9999*pi90 ) avc = -0.9999*pi90;
  var zvc = - dvc * Math.sin( avc );
  var rvc = dvc * Math.cos( avc );
  var xvc = rvc * Math.sin( this.PanRad );
  var yvc = rvc * Math.cos( this.PanRad );
  this.camViewCenter = [ xvc, yvc, zvc ];
  var nvc = JsgVect3.Norm( this.camViewCenter );
  var v = JsgVect3.Norm( [ xvc, yvc, 0 ] );
  var n = JsgVect3.Mult( v, [ 0, 0, 1 ] );
  var up = JsgVect3.Mult( n, nvc );

  // compute camera up and pos
  var a = toRad( this.Roll );
  this.camUp = JsgVect3.Add( JsgVect3.Scale( n, Math.sin(a) ), JsgVect3.Scale( up, Math.cos(a) ) );
  this.camPos = [ 0, 0, 0 ];

  // compute scene size taking device ratio into account
  var vpRatio = 3 / 2;
  var diag = 2 * this.dView * Math.tan( this.camViewAngle / 2 );
  this.sceneHeight = diag / Math.sqrt( 1 + this.deviceRatio*this.deviceRatio );
  this.sceneWidth = this.deviceRatio * this.sceneHeight;
  if ( this.deviceRatio > vpRatio ) {
    // device is wider then viewport
    this.camSceneSize = this.sceneWidth / vpRatio;
  } else {
    this.camSceneSize = this.sceneHeight;
  }

  function compObjVect( dist, side, size, rad, h ) {
    var R = rad + size;
    var a1 = side / R;
    var a2 = dist / R;
    var r = R * Math.cos( a1 );
    var vx = R * Math.sin( a1 );
    var vy = r * Math.sin( a2 );
    var vz = r * Math.cos( a2 ) - (rad + h);
    return [ vx, vy, vz ];
  }

  function compViewDist( v ) {
    return Math.sqrt( v[0]*v[0] + v[1]*v[1] + v[2]*v[2] );
  }

  function compVectAng( v1, v2 ) {
    var sp = JsgVect3.ScalarProd( JsgVect3.Norm(v1), JsgVect3.Norm(v2) );
    if (sp >  1) sp =  1; // handle rounding errors
    if (sp < -1) sp = -1; // handle rounding errors
    return toDeg( Math.acos( sp ) );
  }

  // some computed object values
  var aDip = Math.acos( this.rEarth / (this.rEarth + this.Height) );
  var dHorizon = this.rEarth * aDip;
  var v_norm = compObjVect( dHorizon, 0, 0, this.rEarth, this.Height );
  var v_refr = compObjVect( this.dHorizon, 0, 0, this.geometryRadius, this.Height );
  this.HorizonRefrAng = compVectAng( v_norm, v_refr );
  if (this.HorizonRefrAng < 0.00001) this.HorizonRefrAng = 0;

  var objIx = 0;
  if (this.NObjects[0] == 0) objIx = 1;
  if (this.NObjects[0] > 0 && this.NObjects[1] > 0 && this.ObjDist[0] > this.ObjDist[1]) objIx = 1;

  if (this.NObjects[objIx] > 0) {

    var v_base = compObjVect( this.ObjDist[objIx], this.ObjSidePos[objIx], 0, this.rEarth, this.Height );
    var v_norm = compObjVect( this.ObjDist[objIx], this.ObjSidePos[objIx], this.ObjSize[objIx], this.rEarth, this.Height );
    var v_refr = compObjVect( this.ObjDist[objIx], this.ObjSidePos[objIx], this.ObjSize[objIx], this.geometryRadius, this.Height );

    this.ObjAngSize = compVectAng( v_base, v_norm );
    this.ObjRefrAng = compVectAng( v_norm, v_refr );
    if (this.ObjAngSize < 0.00001) this.ObjAngSize = 0;
    if (this.ObjRefrAng < 0.00001) this.ObjRefrAng = 0;

    this.ObjLiftAbs = 0;
    this.ObjLiftRel = 0;
    if (this.ObjAngSize != 0) {
      this.ObjLiftAbs = this.ObjSize[objIx] * this.ObjRefrAng / this.ObjAngSize;
      var horizonLift = this.ObjSize[objIx] * this.HorizonRefrAng / this.ObjAngSize;
      this.ObjLiftRel = this.ObjLiftAbs - horizonLift;
    }

    var v_refr = compObjVect( this.ObjDist[objIx], this.ObjSidePos[objIx], this.ObjSize[objIx]/2, this.geometryRadius, this.Height );
    this.ObjViewDist = compViewDist( v_refr );

  } else {

    this.ObjRefrAng = this.HorizonRefrAng;
    this.ObjViewDist = 0;
    this.ObjLiftAbs = 0;
    this.ObjLiftRel = 0;
    this.ObjAngSize = 0;

  }
  this.AllStatesChanged = false;
}

CurveAppClass.prototype.UpdateObjectInput = function( objIx ) {

  // object settings
  this.NObjects[objIx] = Math.round(this.NObjects[objIx]);
  if (this.NObjects[objIx] < 0) this.NObjects[objIx] = 0;
  if (this.NObjects[objIx] > 500) this.NObjects[objIx] = 500;

  if (this.Slider_ObjDist_Log_Last[objIx] != this.Slider_ObjDist_Log[objIx]) {
    var distSign = this.Slider_ObjDist_Log[objIx] < 0 ? -1 : 1;
    var distVal = Math.abs( this.Slider_ObjDist_Log[objIx] );
    if (distVal < 1) {
      this.ObjDist[objIx] = 100 * distVal;
    } else {
      this.ObjDist[objIx] = 10 * Math.pow( 10, this.Slider_ObjDist_Log[objIx] );
    }
    this.ObjDist[objIx] *= distSign;
  }
  var distLimit = this.geometryRadius * Math.PI / 4;
  if (this.ObjDist[objIx] < -distLimit) this.ObjDist[objIx] = -distLimit;
  if (this.ObjDist[objIx] >  distLimit) this.ObjDist[objIx] =  distLimit;
  var distSign = this.ObjDist[objIx] < 0 ? -1 : 1;
  var distVal  = Math.abs( this.ObjDist[objIx] );
  if (distVal < 100) {
    this.Slider_ObjDist_Log[objIx] = distVal / 100;
  } else {
    this.Slider_ObjDist_Log[objIx] = Math.log10( distVal / 10 );
  }
  this.Slider_ObjDist_Log[objIx] *= distSign;
  this.Slider_ObjDist_Log_Last[objIx] = this.Slider_ObjDist_Log[objIx];

  if (this.Slider_ObjSidePos_Log[objIx] != this.Slider_ObjSidePos_Log_Last[objIx]) {
    var sidePosSign = this.Slider_ObjSidePos_Log[objIx] < 0 ? -1 : 1;
    var sidePosVal = Math.abs( this.Slider_ObjSidePos_Log[objIx] );
    if (sidePosVal < 1) {
      this.ObjSidePos[objIx] = 100 * sidePosVal;
    } else {
      this.ObjSidePos[objIx] = 10 * Math.pow( 10, sidePosVal );
    }
    this.ObjSidePos[objIx] *= sidePosSign;
  }
  var sidePosLimit = this.geometryRadius * Math.PI / 4;
  if (this.ObjSidePos[objIx] < -sidePosLimit) this.ObjSidePos[objIx] = -sidePosLimit;
  if (this.ObjSidePos[objIx] > sidePosLimit) this.ObjSidePos[objIx] = sidePosLimit;
  var sidePosSign = this.ObjSidePos[objIx] < 0 ? -1 : 1;
  var sidePosVal = Math.abs( this.ObjSidePos[objIx] );
  if (sidePosVal < 100) {
    this.Slider_ObjSidePos_Log[objIx] = sidePosVal / 100;
  } else {
    this.Slider_ObjSidePos_Log[objIx] = Math.log10( sidePosVal / 10 );
  }
  this.Slider_ObjSidePos_Log[objIx] *= sidePosSign;
  this.Slider_ObjSidePos_Log_Last[objIx] = this.Slider_ObjSidePos_Log[objIx];

  if (this.Slider_ObjSideVar_Log[objIx] != this.Slider_ObjSideVar_Log_Last[objIx]) {
    var sideVarSign = this.Slider_ObjSideVar_Log[objIx] < 0 ? -1 : 1;
    var sideVarVal = Math.abs( this.Slider_ObjSideVar_Log[objIx] );
    if (sideVarVal < 1) {
      this.ObjSideVar[objIx] = 10 * sideVarVal;
    } else {
      this.ObjSideVar[objIx] = Math.pow( 10, sideVarVal );
    }
    this.ObjSideVar[objIx] *= sideVarSign;
  }
  var sideVarLimit = this.geometryRadius * Math.PI / 4;
  if (this.ObjSideVar[objIx] < -sideVarLimit) this.ObjSideVar[objIx] = -sideVarLimit;
  if (this.ObjSideVar[objIx] > sideVarLimit) this.ObjSideVar[objIx] = sideVarLimit;
  var sideVarSign = this.ObjSideVar[objIx] < 0 ? -1 : 1;
  var sideVarVal = Math.abs( this.ObjSideVar[objIx] );
  if (sideVarVal < 10) {
    this.Slider_ObjSideVar_Log[objIx] = sideVarVal / 10;
  } else {
    this.Slider_ObjSideVar_Log[objIx] = Math.log10( sideVarVal );
  }
  this.Slider_ObjSideVar_Log[objIx] *= sideVarSign;
  this.Slider_ObjSideVar_Log_Last[objIx] = this.Slider_ObjSideVar_Log[objIx];

  if (this.Slider_ObjSize_Log[objIx] != this.Slider_ObjSize_Log_Last[objIx]) {
    this.ObjSize[objIx] = Math.pow( 10, this.Slider_ObjSize_Log[objIx] );
  }
  if (this.ObjSize[objIx] < 0.001) this.ObjSize[objIx] = 0.001;
  if (this.ObjSize[objIx] > 1e9) this.ObjSize[objIx] = 1e9;
  this.Slider_ObjSize_Log[objIx] = Math.log10( this.ObjSize[objIx] );
  this.Slider_ObjSize_Log_Last[objIx] = this.Slider_ObjSize_Log[objIx];

  if (this.Slider_ObjDeltaDist_Log[objIx] != this.Slider_ObjDeltaDist_Log_Last[objIx]) {
    this.ObjDeltaDist[objIx] = 10 * Math.pow( 10, this.Slider_ObjDeltaDist_Log[objIx] );
  }
  var deltaDistLimit = this.geometryRadius * Math.PI / 2;
  if (this.ObjDeltaDist[objIx] < 0.001) this.ObjDeltaDist[objIx] = 0.001;
  if (this.ObjDeltaDist[objIx] > deltaDistLimit) this.ObjDeltaDist[objIx] = deltaDistLimit;
  this.Slider_ObjDeltaDist_Log[objIx] = Math.log10( this.ObjDeltaDist[objIx] / 10 );
  this.Slider_ObjDeltaDist_Log_Last[objIx] = this.Slider_ObjDeltaDist_Log[objIx];

}

