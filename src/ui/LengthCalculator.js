


function CLengthModel() {
  this.m = 0;
  this.km = 0;
  this.sm = 0;
  this.mile = 0;
  this.in = 0;
  this.cm = 0;
  this.ft = 0;
  this.fl = 0;
  this.mLast = 0;
  this.kmLast = 0;
  this.smLast = 0;
  this.mileLast = 0;
  this.inLast = 0;
  this.cmLast = 0;
  this.ftLast = 0;
  this.flLast = 0;
}

CLengthModel.prototype.calcOthersFromMeter = function() {
  this.km = this.m / 1000;
  this.sm = this.m / 1852;
  this.mile = this.m / 1609.344;
  this.in = this.m / 0.0254;
  this.cm = this.m * 100;
  this.ft = this.m / 0.3048;
  this.fl = this.ft / 100;
}

CLengthModel.prototype.Update = function() {
  if (this.m != this.mLast) {
    this.calcOthersFromMeter();
  }
  else if (this.km != this.kmLast) {
    this.m = this.km * 1000;
    this.calcOthersFromMeter();
  }
  else if (this.sm != this.smLast) {
    this.m = this.sm * 1852;
    this.calcOthersFromMeter();
  }
  else if (this.mile != this.mileLast) {
    this.m = this.mile * 1609.344;
    this.calcOthersFromMeter();
  }
  else if (this.in != this.inLast) {
    this.m = this.in * 0.0254;
    this.calcOthersFromMeter();
  }
  else if (this.cm != this.cmLast) {
    this.m  = this.cm / 100;
    this.calcOthersFromMeter();
  }
  else if (this.ft != this.ftLast) {
    this.m = this.ft * 0.3048;
    this.calcOthersFromMeter();
  }
  else if (this.fl != this.flLast) {
    this.m = this.fl * 100 * 0.3048;
    this.calcOthersFromMeter();
  }
  this.mLast = this.m;
  this.kmLast = this.km;
  this.smLast = this.sm;
  this.mileLast = this.mile;
  this.inLast = this.in;
  this.cmLast = this.cm;
  this.ftLast = this.ft;
  this.flLast = this.fl;
}

var LengthModel = new CLengthModel();

function UpdateLengthModel() {
  LengthModel.Update();
  ControlPanels.Update( 'Units-Calculator' );
}

xOnLoad( UpdateLengthModel );
