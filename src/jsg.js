// jsg.js, (C) Walter Bislin, walter.bislins.ch, Februar 2009
//
// description and download:
//  http://walter.bislins.ch/doku/jsg
//
// dependecies:
//  x.js
//
// History:
//  06.11.2016 new: graphic clipping implemented: SetGraphClipping()
//  30.08.2016 update: MakeSnapshot() uses canvas as buffer instead image, is mutch mutch faster!
//  19.08.2016 new: TextBox(), SetTextRotation(), JsgTrans2D.GetTrans(), SaveTrans(), RestoreTrans()
//             update: JsgTrans2D.AddTrans() accepts also a JsgTrans2D object plus a matrix 2x3
//  27.05.2016 new function SplineCurve
//  24.05.2016 some functions also accept JsgVect2 instead of x, y
//  13.03.2016 Complete Redesign
//  14.02.2009: first Version

////////////////////////////////////
// JsgColor

var JsgColor = {
  RGB: function( r, g, b ) {
    return [ r, g, b, 1 ];
  },

  RGBA: function( r, g, b, a ) {
    return [ r, g, b, a ];
  },

  BW: function( v ) {
    return [ v, v, v, 1 ];
  },

  Black: function() {
    return [ 0, 0, 0, 1 ];
  },

  White: function() {
    return [ 1, 1, 1, 1 ];
  },

  Ok: function( col ) {
    return xArray(col);
  },

  Alpha: function( col ) {
    return xDefNum( col[3], 1 );
  },

  SetAlpha: function( col, a ) {
    col[3] = xDefNum( a, 1 );
    return col;
  },

  SetRGBA: function( col, r, g, b, a ) {
    col[0] = r; col[1] = g; col[2] = b; col[3] = a;
    return col;
  },

  SetRGB: function( col, r, g, b ) {
    col[0] = r; col[1] = g; col[2] = b; col[3] = 1;
    return col;
  },

  SetBW: function( col, v ) {
    col[0] = v; col[1] = v; col[2] = v; col[3] = 1;
    return col;
  },

  SetBlack: function( col ) {
    col[0] = 0; col[1] = 0; col[2] = 0; col[3] = 1;
    return col;
  },

  SetWhite: function( col ) {
    col[0] = 1; col[1] = 1; col[2] = 1; col[3] = 1;
    return col;
  },

  Copy: function( src ) {
    return [ src[0], src[1], src[2], this.DefNum(src[3],1) ];
  },

  CopyTo: function( src, dest ) {
    dest[0] = src[0]; dest[1] = src[1]; dest[2] = src[2]; dest[3] = this.DefNum(src[3],1);
    return dest;
  },

  Scale: function( col, s ) {
    col[0] *= s; col[1] *= s; col[2] *= s;
    return col;
  },

  Add: function( col, add ) {
    col[0] += add[0]; col[1] += add[1]; col[2] += add[2];
    return col;
  },

  Mult: function( col, mul ) {
    col[0] *= mul[0]; col[1] *= mul[1]; col[2] *= mul[2];
    return col;
  },

  ToString: function( col ) {
    // element of col: number; number usually 0..1 but may be out of this range too
    function normCol( cx ) {
      cx = Math.round( cx * 255 );
      return (cx > 255) ? 255 : ((cx < 0) ? 0 : cx);
    }
    function toHex( cx ) {
      cx = normCol(cx);
      var hex = cx.toString(16);
      return cx < 16 ? "0" + hex : hex;
    }
    var a = normCol(this.DefNum(col[3],1));
    if (a == 255) {
      return '#' + toHex(col[0]) + toHex(col[1]) + toHex(col[2]);
    } else {
      return 'rgba('
        + normCol(col[0]).toFixed(0) + ','
        + normCol(col[1]).toFixed(0) + ','
        + normCol(col[2]).toFixed(0) + ','
        + (a/255).toFixed(3) + ')';
    }
  },

  HSV: function( h, s, v, a ) {
    // h, s, v, a = number(0..1)
    // h = Hue = color: 0 = red; 1/6 = yellow; 2/6 = green; 3/6 = cyan; 4/6 = blue; 5/6 = magenta
    // s = Saturation: 0 = gray; 1 = full color
    // v = Luminosity: 0 = black; 1 = full color
    // returns JsgColor = [ r, g, b, a ]

    var Num = this.DefNum, Limit = this.Limit01;
    h = Limit( Num( h, 1 ) );
    s = Limit( Num( s, 1 ) );
    v = Limit( Num( v, 1 ) );
    a = Limit( Num( a, 1 ) );
    var r, g, b, hi;
    h *= 6;
    hi = Math.floor(h) % 6;
    h = h % 1;
    switch(hi) {
      case 0:
        r = 1; g = h; b = 0;
        break;
      case 1:
        r = 1 - h; g = 1; b = 0;
        break;
      case 2:
        r = 0; g = 1; b = h;
        break;
      case 3:
        r = 0; g = 1 - h; b = 1;
        break;
      case 4:
        r = h; g = 0; b = 1;
        break;
      default:
        r = 1; g = 0; b = 1 - h;
    }
    r = v * (1 - (1 - r) * s);
    g = v * (1 - (1 - g) * s);
    b = v * (1 - (1 - b) * s);
    return [ r, g, b, a ];
  },

  HL: function( h, l, a ) {
    // l -> s, v: l=0 -> v=0, s=1; l=0.5 -> v=1, s=1; l=1 -> v=1, s=0
    // h = Hue = color: 0 = red; 1/6 = yellow; 2/6 = green; 3/6 = cyan; 4/6 = blue; 5/6 = magenta
    // s = Saturation: 0 = gray; 1 = full color
    // v = Luminosity: 0 = black; 1 = full color

    l = this.Limit01( this.DefNum( l, 0.5 ) );
    var s, v;
    if (l < 0.5) {
      s = 1; v = 2 * l;
    } else {
      v = 1; s = 1 - 2 * (l - 0.5);
    }
    return this.HSV( h, s, v, a );
  },

  DefNum: function( x, def ) {
    return (typeof(x) === 'number') ? x : def;
  },

  Limit01: function(x) {
    return (x < 0) ? 0 : ((x > 1) ? 1 : x);
  }

};

////////////////////////////////////
// JsgVect2

var JsgVect2 = {

  New: function( x, y ) {
    return [ x, y ];
  },

  Set: function( v, x, y ) {
    v[0] = x;
    v[1] = y;
    return v;
  },

  Null: function() {
    return [ 0, 0 ];
  },

  Ok: function( v ) {
    return xArray(v); // && v.length >= 2
  },

  Scale: function( v, s ) {
    return [ s * v[0], s * v[1] ];
  },

  Add: function( v1, v2 ) {
    return [ v1[0] + v2[0], v1[1] + v2[1] ];
  },

  Sub: function( v1, v2 ) {
    return [ v1[0] - v2[0], v1[1] - v2[1] ];
  },

  Length: function( v ) {
    var x = v[0], y = v[1];
    return Math.sqrt( x * x + y * y );
  },

  Length2: function( x, y ) {
    return x * x + y * y;
  },

  Norm: function( v ) {
    var s = this.Length(v);
    if (s == 0) s = 1;
    return [ v[0] / s, v[1] / s ];
  },

  ScalarProd: function( v1, v2 ) {
    return v1[0] * v2[0] + v1[1] * v2[1];
  },

  VectProd: function( u, v ) {
    return u[0] * v[1] - u[1] * v[0];
  },

  Rotate: function( v, ang ) {
    var c = Math.cos( ang );
    var s = Math.sin( ang );
    return [ c * v[0] - s * v[1], s * v[0] + c * v[1] ];
  },

  Angle: function( u, v, norm ) {
    // require u and v are of length 1  -> Norm()
    // returns angle between vectors from u to v.
    // positiv angle is counter clockwise
    // -pi < angle <= pi
    norm = xDefBool( norm, false );
    if (norm) {
      u = this.Norm( u );
      v = this.Norm( v );
    }
    var sign = Math.asin( this.VectProd( u, v ) ) < 0 ? -1 : 1;
    return sign * Math.acos( this.ScalarProd( u, v ) );
  },

};

//////////////////////////////////
// JsgMat2

JsgMat2 = {

  Zero: function() {
    return [ [0, 0, 0], [0, 0, 0] ];
  },

  Unit: function() {
    return [ [1, 0, 0], [0, 1, 0] ];
  },

  Ok: function( mat ) {
    return xArray(mat);
  },

  RotatingToXY: function( x, y ) {
    // returns a rotation matrix that rotates by the angle between (x,y) and the X-Axes.
    var vl = Math.sqrt( x * x + y * y );
    if (vl == 0) {
      x = 1;   y = 0;
    } else {
      x /= vl; y /= vl;
    }
    return [ [ x, -y, 0 ], [ y, x, 0 ] ];
  },

  Transformation: function( sx, sy, rot, x, y ) {
    var cosRot = Math.cos(rot);
    var sinRot = Math.sin(rot);
    return [ [ cosRot*sx, -sinRot*sy, x ], [ sinRot*sx, cosRot*sy, y ] ];
  },

  Moving: function( x, y ) {
    return [ [1,  0,  x], [0,  1,  y] ];
  },

  Scaling: function( sx, sy ) {
    return [ [sx, 0, 0], [0, sy, 0] ];
  },

  Rotating: function( ang ) {
    var c = Math.cos(ang);
    var s = Math.sin(ang);
    return [ [c, -s, 0], [s, c, 0] ];
  },

  Mult: function( matA, matB ) {
    r = this.Null();
    for (var i = 0; i < 2; i++) {
      for (var j = 0; j < 2; j++) {
        r[i][j] = matA[i][0] * matB[0][j] + matA[i][1] * matB[1][j];
      }
      r[i][2] = matA[i][0] * matB[0][2] + matA[i][1] * matB[1][2] + matA[i][2];
    }
    return r;
  },

  Move: function( mat, x, y ) {
    return this.Mult( mat, this.Moving( x, y ) );
  },

  Rotate: function( mat, ang ) {
    return this.Mult( mat, this.Rotating( ang ) );
  },

  Scale: function( mat, sx, sy ) {
    return this.Mult( mat, this.Scaling( sx, sy ) );
  },

  Trans: function( mat, v ) {
    // v: JsgVect2
    var x   = v[0] * mat[0][0] + v[1] * mat[0][1] + mat[0][2];
    v[1]    = v[0] * mat[1][0] + v[1] * mat[1][1] + mat[1][2];
    v[0]    = x;
  },

  TransPolyXY: function( mat, polyX, polyY, size ) {
    var l = xDefNum( size, polyX.length );
    for (var i = 0; i < l; i++) {
      var x    = polyX[i] * mat[0][0] + polyY[i] * mat[0][1] + mat[0][2];
      polyY[i] = polyX[i] * mat[1][0] + polyY[i] * mat[1][1] + mat[1][2];
      polyX[i] = x;
    }
  },

};

////////////////////////////////////
// JsgRect

function JsgRect( x, y, w, h ) {
  this.Set( x, y, w, h );
}

JsgRect.prototype.SetPos = function( x, y ) {
  this.x = x;
  this.y = y;
}

JsgRect.prototype.SetSize = function( w, h ) {
  this.w = w;
  this.h = h;
}

JsgRect.prototype.Set = function( x, y, w, h ) {
  this.x = x;
  this.y = y;
  this.w = w;
  this.h = h;
}

JsgRect.Ok = function( obj ) {
  return xDef(obj) && xDef(obj.x) && xDef(obj.w);
};

////////////////////////////////////
// JsgGradient

function JsgGradient( gradType, canvasGrad, gradDef ) {
  this.Type           = gradType; // 'linear' or 'radial'
  this.CanvasGradient = canvasGrad;
  this.GradientDef    = gradDef;
}

JsgGradient.Ok = function( obj ) {
  return xObj(obj) && xDef(obj.CanvasGradient);
};

////////////////////////////////////
// JsgPolygon, for 2D and 3D

function JsgPolygon( Type3D, owner ) {
  // if Type3D is true then Z-Array is used else it is null and ignored
  // Note: Arrays X, Y and Z are usually larger then Size. Use Copy function to optain arrays of size aSize.
  this._Owner = xDefStr( owner, '' );
  this.Init( Type3D );
}

JsgPolygon.prototype.Is3D = function() {
  return this.Z != null;
}

JsgPolygon.prototype.Init = function( Type3D ) {
  // if Type3D is true then Z-Array is used else it is null and ignored (2D polygon)
  this.X = [];
  this.Y = [];
  this.Z = Type3D ? [] : null;
  this.Size = 0;
  return this;
}

JsgPolygon.Ok = function( obj ) {
  return xObj(obj) && xArray(obj.X);
}

JsgPolygon.prototype.Reset = function() {
  // keep and reuse arrays!
  this.Size = 0;
  return this;
}

JsgPolygon.prototype.IsEmpty = function() {
  return this.Size == 0;
}

JsgPolygon.prototype.GetFirstPoint3D = function( p ) {
  if (this.Size < 0) return false;
  p[0] = this.X[0]; p[1] = this.Y[0]; p[2] = this.Z[0];
  return true;
}

JsgPolygon.prototype.GetLastPoint3D = function( p ) {
  var last = this.Size-1;
  if (last < 0) return false;
  p[0] = this.X[last]; p[1] = this.Y[last]; p[2] = this.Z[last];
  return true;
}

JsgPolygon.prototype.AddPoint = function( x, y, z ) {
  // z is ignored if poly is only 2D
  // automatic enlarges arrays if array.length <= Size
  this.X[this.Size] = x;
  this.Y[this.Size] = y;
  if (this.Z) this.Z[this.Size] = z;
  this.Size++
  return this;
}

JsgPolygon.prototype.AddPoint3D = function( p ) {
  // p: array[3] of number (e.g. JsgVect3)
  // automatic enlarges arrays if array.length <= Size
  this.X[this.Size] = p[0];
  this.Y[this.Size] = p[1];
  this.Z[this.Size] = p[2];
  this.Size++
  return this;
}

JsgPolygon.prototype.AddPoly = function( poly, offset ) {
  offset = xDefNum( offset, 0 );
  var xs = poly.X;
  var ys = poly.Y;
  var zs = poly.Z;
  var xd = this.X;
  var yd = this.Y;
  var zd = this.Z;
  var dSize = this.Size;
  var size = poly.Size;
  for (var i = offset; i < size; i++) {
    xd[dSize] = xs[i];
    yd[dSize] = ys[i];
    if (zd) zd[dSize] = zs[i];
    dSize++;
  }
  this.Size = dSize;
  return this;
}

JsgPolygon.prototype.RemoveLastPoint = function() {
  this.Size--;
  if (this.Size < 0) this.Size = 0;
  return this;
}

JsgPolygon.prototype.Close = function() {
  // adds first point of poly to the end if they are not equal
  // returns true if points weren't equal and point is added
  // use RemoveLastPoint to remove added point if necessary
  if (this.Size < 2) return false;
  if (this.IsSamePoint( 0, this, this.Size-1 )) return false;
  if (this.Z) {
    this.AddPoint( this.X[0], this.Y[0], this.Z[0] );
  } else {
    this.AddPoint( this.X[0], this.Y[0] );
  }
  return true;
}

JsgPolygon.prototype.IsSamePoint = function( i, poly, j ) {
  // returns true if point i of this is the same as point j of poly
  if (this.Z) {
    return this.X[i] == poly.X[j] && this.Y[i] == poly.Y[j] && this.Z[i] == poly.Z[j];
  } else {
    return this.X[i] == poly.X[j] && this.Y[i] == poly.Y[j];
  }
}

JsgPolygon.prototype.Copy = function( to, useNewArrays ) {
  // to: JsgPolygon (optional)
  // returns a copy in 'to' or in a new JsgPolygon object.
  // if useNewArray is true, returned arrays are not reused arrays and have.length = this.Size, never larger!
  to = to || new JsgPolygon( this.Is3D() );
  if (useNewArrays) to.Init( this.Is3D );
  var toX = to.X
  var toY = to.Y;
  var toZ = to.Z;
  var fromX = this.X;
  var fromY = this.Y;
  var fromZ = this.Z;
  var len = this.Size;
  for (var i = 0; i < len; i++) {
    toX[i] = fromX[i];
    toY[i] = fromY[i];
    if (fromZ) toZ[i] = fromZ[i];
  }
  to.Size = len;
  return to;
}

JsgPolygon.WorkArray = [];

JsgPolygon.InvertArrays = function( xArr, yArr, zArr, size ) {
  // inverses the order of elements in arrays
  function InvertArray( a ) {
    var last = Math.floor(size/2) - 1;
    for (var i = 0, j = size-1; i <= last; i++, j--) {
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
  }
  size = xDefNum( size, xArr.length );
  if (size < 2) return;
  InvertArray( xArr );
  InvertArray( yArr );
  if (zArr) InvertArray( zArr );
}

JsgPolygon.prototype.Invert = function( ) {
  JsgPolygon.InvertArrays( this.X, this.Y, this.Z, this.Size );
}

JsgPolygon.RollArrays = function( xArr, yArr, zArr, n, size ) {
  // rolls elements of array a down n steps or up, if n is negative
  function RollArray( a ) {
    var src = Math.abs(n) % size;
    if (n < 0) src = size - src;
    var newArr = JsgPolygon.WorkArray;
    for (var dest = 0; dest < size; dest++) {
      newArr[dest] = a[src++];
      if (src >= size) src = 0;
    }
    for (var i = 0; i < size; i++) a[i] = newArr[i];
  }
  size = xDefNum( size, xArr.length );
  if (size < 2) return;
  RollArray( xArr );
  RollArray( yArr );
  if (zArr) RollArray( zArr );
}

JsgPolygon.prototype.Roll = function( n ) {
  // rolls points of polygon down n steps or up, if n is negative
  JsgPolygon.RollArrays( this.X, this.Y, this.Z, n, this.Size );
}

////////////////////////////////////
// JsgPolygonList

function JsgPolygonList( Type3D, owner ) {
  // set Type3D true if poly list contains 3D polygons
  // Note: PolyList is usually larger then Size.
  this._Owner = xDefStr( owner, '' );
  this.PolyList = [];
  this.Size = 0;
  this.CurrPoly = null;
  this.Type3D = xDefBool( Type3D, false );
}

JsgPolygonList.Ok = function( obj ) {
  return xObj(obj) && xArray(obj.PolyList);
}

JsgPolygonList.prototype.Is3D = function() {
  return this.Type3D;
}

JsgPolygonList.prototype.IsEmpty = function() {
  return this.Size == 0 || this.PolyList[0].IsEmpty();
}

JsgPolygonList.prototype.Reset = function() {
  this.Size = 0;
  this.CurrPoly = null;
  return this;
}

JsgPolygonList.prototype.NewPoly = function() {
  if (this.PolyList.length > this.Size) {
    this.PolyList[this.Size].Reset();
  } else {
    this.PolyList[this.Size] = new JsgPolygon( this.Type3D );
  }
  this.CurrPoly = this.PolyList[this.Size];
  this.Size++;
  return this;
}

JsgPolygonList.prototype.GetLastPoly = function() {
  // returns last JsgPolygon in PolyList
  // requires Size > 0
  return this.PolyList[this.Size-1];
}

JsgPolygonList.prototype.GetFirstPoly = function() {
  // returns first JsgPolygon in PolyList
  // requires Size > 0
  return this.PolyList[0];
}

JsgPolygonList.prototype.GetFirstPoint3D = function( p ) {
  if (this.Size == 0) return false;
  return this.PolyList[this.Size-1].GetFirstPoint3D( p );
}

JsgPolygonList.prototype.GetLastPoint3D = function( p ) {
  if (this.Size == 0) return false;
  return this.PolyList[this.Size-1].GetLastPoint3D( p );
}

JsgPolygonList.prototype.AddPoint = function( x, y, z ) {
  // z on 2D polygons is ignored
  // require this.Size > 0
  this.CurrPoly.AddPoint( x, y, z );
  return this;
}

JsgPolygonList.prototype.AddPoint3D = function( p ) {
  // z on 2D polygons is ignored
  // require this.Size > 0
  this.CurrPoly.AddPoint3D( p );
  return this;
}

JsgPolygonList.prototype.AddPoly = function( polys, appendMode ) {
  // polys: JsgPolygon or JsgPolygonList
  // appendMode = 0: (new) add polys as all new polys
  // appendMode = 1: (extend) append if this and polys have common point else (new)
  // appendMode = 2: (append) append polys to this
  // appendMode != 0 merge common points
  appendMode = xDefNum( appendMode, 0 );
  if (!JsgPolygonList.Ok(polys)) return this.AddSinglePoly( polys, appendMode );
  var n = polys.Size;
  for (var i = 0; i < n; i++) {
    this.AddSinglePoly( polys.PolyList[i], appendMode );
  }
  return this;
}

JsgPolygonList.prototype.AddSinglePoly = function( poly, appendMode ) {
  // private function
  if (appendMode == 0) {
    this.NewPoly();
    this.CurrPoly.AddPoly( poly, 0 );
  } else {
    var offset = 0;
    if (this.Size == 0) {
      this.NewPoly();
    } else {
      var currPoly = this.CurrPoly;
      if (poly.Size > 0 && poly.IsSamePoint( 0, currPoly, currPoly.Size-1 )) {
        offset = 1;
      } else if (appendMode == 1) {
        this.NewPoly();
      }
    }
    this.CurrPoly.AddPoly( poly, offset );
  }
  return this;
}

JsgPolygonList.prototype.RemoveLastPoint = function() {
  // requires last poly in PolyList must have Size > 0
  this.PolyList[this.Size-1].RemoveLastPoint();
}

JsgPolygonList.prototype.Close = function() {
  // adds first point of first poly to the end of last poly if they are not equal
  // returns true if points weren't equal and point is added
  // use RemoveLastPoint to remove added point if necessary
  if (this.Size == 0) return false;
  var firstPoly = this.PolyList[0];
  var lastPoly = this.PolyList[this.Size-1];
  if (firstPoly.Size < 1 || lastPoly.Size < 1) return false;
  if (firstPoly.IsSamePoint( 0, lastPoly, lastPoly.Size-1 )) return false;
  if (this.Type3D) {
    lastPoly.AddPoint( firstPoly.X[0], firstPoly.Y[0], firstPoly.Z[0] );
  } else {
    lastPoly.AddPoint( firstPoly.X[0], firstPoly.Y[0] );
  }
  return true;
}

////////////////////////////////////
// JsgSnapshot

function JsgSnapshot( sx, sy, sw, sh, srcCanvas ) {
  this.x = sx;
  this.y = sy;
  this.w = sw;
  this.h = sh;
  this.ImageData = null;
  var buffer = xCreateElement('canvas');
  if (buffer) {
    buffer.width = sw;
    buffer.height = sh;
    buffer.getContext('2d').drawImage( srcCanvas, sx, sy, sw, sh, 0, 0, sw, sh );
    this.ImageData = buffer;
  }
}

////////////////////////////////////
// JsgTrans

function JsgTrans( aTransName ) {
  this.Name = aTransName;
  this.x = 0;
  this.y = 0;
  this.x1 = 0;
  this.y1 = 0;
  this.x2 = 0;
  this.y2 = 0;
  this.Reset();
}

JsgTrans.prototype.Reset = function() {
  this.Xmin = 0;
  this.Ymin = 0;
  this.Width = 1;
  this.Height = 1;
  this.ScaleX = 1;
  this.ScaleY = 1;
  this.OffsetX = 0;
  this.OffsetY = 0;
}

JsgTrans.prototype.TransX = function( x ) {
  return x * this.ScaleX + this.OffsetX;
}

JsgTrans.prototype.TransY = function( y ) {
  return y * this.ScaleY + this.OffsetY;
}

JsgTrans.prototype.TransXY = function( x, y ) {
  this.x = x * this.ScaleX + this.OffsetX;
  this.y = y * this.ScaleY + this.OffsetY;
}

JsgTrans.prototype.ObjTransXY = function( otr, x, y ) {
  if (otr) {
    otr.TransXY( x, y );
    this.x = otr.x * this.ScaleX + this.OffsetX;
    this.y = otr.y * this.ScaleY + this.OffsetY;
  } else {
    this.x = x * this.ScaleX + this.OffsetX;
    this.y = y * this.ScaleY + this.OffsetY;
  }
}

JsgTrans.prototype.ObjTransXY2 = function( otr, x1, y1, x2, y2 ) {
  if (otr) {
    otr.TransXY2( x1, y1, x2, y2 );
    this.x1 = otr.x1 * this.ScaleX + this.OffsetX;
    this.y1 = otr.y1 * this.ScaleY + this.OffsetY;
    this.x2 = otr.x2 * this.ScaleX + this.OffsetX;
    this.y2 = otr.y2 * this.ScaleY + this.OffsetY;
  } else {
    this.x1 = x1 * this.ScaleX + this.OffsetX;
    this.y1 = y1 * this.ScaleY + this.OffsetY;
    this.x2 = x2 * this.ScaleX + this.OffsetX;
    this.y2 = y2 * this.ScaleY + this.OffsetY;
  }
}

JsgTrans.prototype.InvTransX = function( x ) {
  return (x - this.OffsetX) / this.ScaleX;
}

JsgTrans.prototype.InvTransY = function( y ) {
  return (y - this.OffsetY) / this.ScaleY;
}

////////////////////////////////////
// JsgTrans2D

function JsgTrans2D( aTrans2D ) {
  this.x = 0;
  this.y = 0;
  this.x1 = 0;
  this.y1 = 0;
  this.x2 = 0;
  this.y2 = 0;
  if (xDef(aTrans2D)) {
    this.CopyFrom( aTrans2D );
  } else {
    this.Reset();
  }
}

JsgTrans2D.prototype.Reset = function() {
  this.a00 = 1;
  this.a01 = 0;
  this.a02 = 0;
  this.a10 = 0;
  this.a11 = 1;
  this.a12 = 0;
  this.IsMoveOnly = true;
  this.IsUnitTrans = true;
  this.Enabled = true;
}

JsgTrans2D.prototype.Enable = function( aFlag ) {
  var old = this.Enabled;
  this.Enabled = aFlag;
  return old;
}

JsgTrans2D.prototype.CheckTransType = function() {
  this.IsMoveOnly = (this.a00 == 1 && this.a01 == 0 && this.a10 == 0 && this.a11 == 1);
  this.IsUnitTrans = (this.IsMoveOnly && this.a02 == 0 && this.a12 == 0);
}

JsgTrans2D.prototype.SetTrans = function( mat ) {
  this.a00 = mat[0][0];
  this.a01 = mat[0][1];
  this.a02 = mat[0][2];
  this.a10 = mat[1][0];
  this.a11 = mat[1][1];
  this.a12 = mat[1][2];
  this.CheckTransType();
}

JsgTrans2D.prototype.GetTrans = function() {
  // returns copy of internal trans array[2x3]; can be reused with SetTrans()
  return [ [ this.a00, this.a01, this.a02 ], [ this.a10, this.a11, this.a12 ] ];
}

JsgTrans2D.prototype.Copy = function() {
  return new JsgTrans2D( this );
}

JsgTrans2D.prototype.CopyFrom = function( aTrans2D ) {
  this.a00 = aTrans2D.a00;
  this.a01 = aTrans2D.a01;
  this.a02 = aTrans2D.a02;
  this.a10 = aTrans2D.a10;
  this.a11 = aTrans2D.a11;
  this.a12 = aTrans2D.a12;
  this.IsMoveOnly  = aTrans2D.IsMoveOnly;
  this.IsUnitTrans = aTrans2D.IsUnitTrans;
  this.Enabled = aTrans2D.Enabled;
}

JsgTrans2D.prototype.AddTrans = function( mat ) {
  // this.a = mat * this.a
  // mat: array[2x3] or JsTrans2D
  var c00, c01, c02, c10, c11, c12
  if (xArray(mat)) {
    c00 = mat[0][0] * this.a00 + mat[0][1] * this.a10;
    c01 = mat[0][0] * this.a01 + mat[0][1] * this.a11;
    c02 = mat[0][0] * this.a02 + mat[0][1] * this.a12 + mat[0][2];
    c10 = mat[1][0] * this.a00 + mat[1][1] * this.a10;
    c11 = mat[1][0] * this.a01 + mat[1][1] * this.a11;
    c12 = mat[1][0] * this.a02 + mat[1][1] * this.a12 + mat[1][2];
  } else {
    c00 = mat.a00 * this.a00 + mat.a01 * this.a10;
    c01 = mat.a00 * this.a01 + mat.a01 * this.a11;
    c02 = mat.a00 * this.a02 + mat.a01 * this.a12 + mat.a02;
    c10 = mat.a10 * this.a00 + mat.a11 * this.a10;
    c11 = mat.a10 * this.a01 + mat.a11 * this.a11;
    c12 = mat.a10 * this.a02 + mat.a11 * this.a12 + mat.a12;
  }
  this.a00 = c00;
  this.a01 = c01;
  this.a02 = c02;
  this.a10 = c10;
  this.a11 = c11;
  this.a12 = c12;
  this.CheckTransType();
}

JsgTrans2D.prototype.Move = function( x, y ) {
  this.a02 += x;
  this.a12 += y;
  this.CheckTransType();
}

JsgTrans2D.prototype.Scale = function( sx, sy ) {
  this.a00 *= sx;
  this.a01 *= sx;
  this.a02 *= sx;
  this.a10 *= sy;
  this.a11 *= sy;
  this.a12 *= sy;
  this.CheckTransType();
}

JsgTrans2D.prototype.Rotate = function( ang ) {
  var cosa = Math.cos(ang);
  var sina = Math.sin(ang);
  var c = [ [ cosa, -sina, 0 ], [ sina, cosa, 0 ] ];
  this.AddTrans( c );
}

JsgTrans2D.prototype.TransX = function( x, y ) {
  if (this.IsUnitTrans || !this.Enabled) return x;
  if (this.IsMoveOnly) return x + this.a02;
  return this.a00 * x + this.a01 * y + this.a02;
}

JsgTrans2D.prototype.TransY = function( x, y ) {
  if (this.IsUnitTrans || !this.Enabled) return y;
  if (this.IsMoveOnly) return y + this.a12;
  return this.a10 * x + this.a11 * y + this.a12;
}

JsgTrans2D.prototype.TransXY = function( x, y ) {
  this.x = x;
  this.y = y;
  if (this.IsUnitTrans || !this.Enabled) return;
  if (this.IsMoveOnly) {
    this.x += this.a02;
    this.y += this.a12;
    return;
  }
  this.x = this.a00 * x + this.a01 * y + this.a02;
  this.y = this.a10 * x + this.a11 * y + this.a12;
}

JsgTrans2D.prototype.TransXY2 = function( x1, y1, x2, y2 ) {
  this.x1 = x1;
  this.y1 = y1;
  this.x2 = x2;
  this.y2 = y2;
  if (this.IsUnitTrans || !this.Enabled) return;
  if (this.IsMoveOnly) {
    this.x1 += this.a02;
    this.y1 += this.a12;
    this.x2 += this.a02;
    this.y2 += this.a12;
    return;
  }
  this.x1 = this.a00 * x1 + this.a01 * y1 + this.a02;
  this.y1 = this.a10 * x1 + this.a11 * y1 + this.a12;
  this.x2 = this.a00 * x2 + this.a01 * y2 + this.a02;
  this.y2 = this.a10 * x2 + this.a11 * y2 + this.a12;
}

JsgTrans2D.prototype.MaxScaling = function() {
  var abs = Math.abs;
  var t1 = abs( this.a00 ) + abs( this.a01 );
  var t2 = abs( this.a10 ) + abs( this.a11 );
  return Math.sqrt( (t1 * t1 + t2 * t2) / 2 );
}

////////////////////////////////////
// JsgAttrs

function JsgAttrs( aGraph ) {
  this.ScaleRef = aGraph.ScaleRef;
  this.LimitScalePix = aGraph.LimitScalePix;
  this.AutoScalePix = aGraph.AutoScalePix;
  this.ScalePixInt = aGraph.ScalePixInt;
  this.ObjTrans = aGraph.ObjTrans.Copy();
  this.Trans = aGraph.Trans;
  this.AngleMeasure = aGraph.AngleMeasure;
  this.Alpha = aGraph.Alpha;
  this.LineJoin = aGraph.LineJoin;
  this.LineCap = aGraph.LineCap;
  this.Color = aGraph.Color;
  this.BgColor = aGraph.BgColor;
  this.BgGradient = aGraph.BgGradient;
  this.LineWidth = aGraph.LineWidth;
  this.MarkerSymbol = aGraph.MarkerSymbol;
  this.MarkerSize = aGraph.MarkerSize;
  this.TextRendering = aGraph.TextRendering;
  this.TextClass = aGraph.TextClass;
  this.TextFont = aGraph.TextFont;
  this.TextSize = aGraph.TextSize;
  this.TextRitation = aGraph.TextRotation;
  this.TextColor = aGraph.TextColor;
  this.FontStyle = aGraph.FontStyle;
  this.FontWeight = aGraph.FontWeight;
  this.TextHAlign = aGraph.TextHAlign;
  this.TextVAlign = aGraph.TextVAlign;
  this.TextHPad = aGraph.TextHPad;
  this.TextVPad = aGraph.TextVPad;
  this.LineHeight = aGraph.LineHeight;
  this.CurvePrecision = aGraph.CurvePrecision;
}

////////////////////////////////////
// JsGraph main class
////////////////////////////////////


function NewGraph2D( aParams ) {
  return new JsGraph( aParams );
}

function JsGraph( aParams ) {
  // aParams =
  //   Id: String; Default 'JsGraph<n>', where <n> is a counter number
  //   Width: Number(>0) or string; default '100%'; numbers are in pixel
  //   Height: Number(>0) or string; default '75%'
  //   DrawFunc: function(JsGraph); optional; default null
  //   BorderWidth: number(>=0); default 1;
  //   BorderColor: string; default see class JsGraph { border-color }
  //   TextRendering: string; 'canvas' (default), 'html'
  //   GraphClass: string; default 'JsGraph'
  //   GraphFormat: string; default ''; additional CSS classes
  //   ScaleRef: Integer(>0); Default 800; Referenzbreite des Containers in Pixel, siehe SetScaleRef()
  //   AutoScalePix: Boolean; default false; true -> Skaliert Pixel-Argumente entsprechend ScaleRef -> ScalePix()
  //   LimitScalePix: Boolean; default true; true -> Pixel-Scaling ends when CanvasWidth is greater than ScaleRef
  //   ScalePixInt: Boolean; Default false; -> true automatisches ScalePix() liefert immer ganze Zahlen
  //   MinLineWidth: Number(>0); Default 0.1; Minimale Strickdicke bei automatischem ScalePix()
  //   MinTextSize: Number(>0); Default 1; Minimale Textgrösse bei automatischem ScalePix()
  //   MinMarkerSize: number(>0); Default 1; Minimale Grösser der Markersymbole bei automatischem ScalePix()
  //   DefaultAttrs: object; default standard; see SetAttrs()
  //   OnClick: function(xEvent,JsGraph)
  //   EventHandlers: [ { Event: String, Func: function(xEvent,JsGraph), Capture: Boolean }, .... ]
  // }

  aParams = xDefObj( aParams, {} );

  this.HighResolution = xDefBool( aParams.HighResolution, true );
  this.HighResSet = false;
  this.DevicePixelRatio = 1;
  this.CanvasPixelRatio = 1;
  this.PixelRatio = 1;
  this.LastPixelRatio = 0; // 0 = undefined

  this.InitInternals();
  this.MakeMarkers();
  this.CreateCanvas( aParams );

  // init some properties from aParams
  if (xNum (aParams.ScaleRef))      this.ScaleRef = aParams.ScaleRef;
  if (xBool(aParams.AutoScalePix))  this.AutoScalePix = aParams.AutoScalePix;
  if (xBool(aParams.LimitScalePix)) this.LimitScalePix = aParams.LimitScalePix;
  if (xBool(aParams.ScalePixInt))   this.ScalePixInt = aParams.ScalePixInt;
  if (xNum (aParams.MinLineWidth))  this.MinLineWidth = this.MinSize( aParams.MinLineWidth, 0 );
  if (xNum (aParams.MinTextSize))   this.MinTextSize = this.MinSize( aParams.MinTextSize, 0 );
  if (xNum (aParams.MinMarkerSize)) this.MinMarkerSize = this.MinSize( aParams.MinMarkerSize, 0 );
  if (xAny (aParams.DefaultAttrs))  this.SetAttrs( aParams.DefaultAttrs );
  if (xStr (aParams.TextRendering)) this.SetTextRendering( aParams.TextRendering );
  this.DeferedDrawTime = xDefNum( aParams.DeferedDrawTime, 50 );
  this.AutoReset = xDefBool( aParams.AutoReset, true );
  this.AutoClear = xDefBool( aParams.AutoClear, true );
  this.ClientResetFunc = null; // is called in Draw if AutoReset is true

  // event handlers are saved in this.EventHandlers list and installed later onDomReady event
  var me = this;
  this.OnResizeFunc      = function CB_OnTimeout_CheckWindowResize() { me.CheckResizeRegularly(); };
  this.OnDrawFunc        = function CB_OnTimeout_Draw()              { me.Draw(); };
  this.OnDeferedDrawFunc = function CB_OnTimeout_DeferedDraw()       { me.DeferedDraw(); };

  if (xFunc(aParams.OnClick)) {
    this.EventHandlers.push( { Event: 'click', Func: aParams.OnClick, Capture: false } );
  }
  if (xArray(aParams.EventHandlers)) {
    var handlers = aParams.EventHandlers
    for (var i = 0; i < handlers.length; i++) {
      var handler = handlers[i];
      if (xStr(handler.Event) && xFunc(handler.Func)) this.EventHandlers.push( handler );
    }
  }
  // setup an OnDomReady function, which installs all event handlers in this.EventHandlers for this.Canvas
  if (this.EventHandlers.length > 0) {
    xOnDomReady(
      function CB_InstallEventHandlers() {
        var nHandlers = me.EventHandlers.length;
        for (var i = 0; i < nHandlers; i++) {
          var handler = me.EventHandlers[i];
          me.AddEventHandler( handler.Event, handler.Func, handler.Capture );
        }
        me.EventHandlers = [];
      }
    );
  }

  this.SaveAttrs();
  this.SaveDefaultAttrs();
  this.SetDriverAttrs();

  this.InitResizeCheck();
  this.CheckResizeRegularly();
  this.DrawPending++;
  if (xFunc(aParams.DrawFunc)) this.SetDrawFunc( aParams.DrawFunc );
  if (xFunc(aParams.DeferedDrawFunc)) this.SetDeferedDrawFunc( aParams.DeferedDrawFunc );
  if (xFunc(aParams.BeforeResetFunc)) this.SetBeforeResetFunc( aParams.BeforeResetFunc );
}

JsGraph.prototype.InitInternals = function() {
  // private function
  this.LastX = 0.0;
  this.LastY = 0.0;
  this.BorderWidth = 0;
  this.CanvasWidth = 0;
  this.CanvasHeight = 0;
  this.CanvasRatioHW = 0.0; // = 0 -> fixed sized canvas; > 0 -> resizable canvas
  this.VpXmin = 0;
  this.VpYmin = 0;
  this.VpWidth = 0;
  this.VpHeight = 0;
  this.VpInnerWidth = 0;
  this.VpInnerHeight = 0;
  this.WinXmin = 0.0;
  this.WinXmax = -1;
  this.WinYmin = 0.0;
  this.WinYmax = -1;
  this.WinWidth = -1;
  this.WinHeight = -1;

  this.ObjTrans = new JsgTrans2D();
  this.ObjTransStack = [];
  this.ContextScale = 1;
  this.Trans = 'window';
  this.AngleMeasure = 'deg';  // 'deg' or 'rad'
  this.CanvasTrans = new JsgTrans( 'canvas' );
  this.VpTrans = new JsgTrans( 'viewport' );
  this.WinTrans = new JsgTrans( 'window' );
  this.CurrTrans = this.WinTrans;
  this.TransByName = {
    canvas:   this.CanvasTrans,
    viewport: this.VpTrans,
    window:   this.WinTrans
  };
  this.GraphClipEnabled = false;
  this.GraphClipExtend = 1;     // times CanvasWidth is range of outer clip
  this.GraphClipMargin = 1;     // adds to inner clip range
  this.GraphClipInnerXmin = 0;  // computed in Clip() and SetClipRect()/SetClipplin()
  this.GraphClipInnerXmax = 0;
  this.GraphClipInnerYmin = 0;
  this.GraphClipInnerYmax = 0;
  this.GraphClipOuterXmin = 0;  // computet in UpdateGraphClipOuterRange()
  this.GraphClipOuterXmax = 0;
  this.GraphClipOuterYmin = 0;
  this.GraphClipOuterYmax = 0;

  this.DrawFunc = null;  // function(this){}
  this.DeferedDrawFunc = null; // function(this){}
  this.BeforeResetFunc = null;
  this.Snapshots = [];  // array of JsgSnapshot
  this.Poly = new JsgPolygon( false, 'JsGraph.Poly' );
  this.WorkPoly = new JsgPolygon( false, 'JsGraph.WorkPoly' );
  this.WorkPoly2 = new JsgPolygon( false, 'JsGraph.WorkPoly2' );
  this.WorkRect = new JsgRect( 0, 0, 0, 0 );
  this.EventHandlers = [];

  this.Alpha = 1;
  this.Color = 'black';
  this.BgColor = 'white';
  this.BgGradient = null;
  this.LineWidth = 1;
  this.MarkerSymbol = 'Circle';
  this.MarkerSize = 8;
  this.DriverMarkerSize = 8;
  this.TextRendering = 'canvas';  // canvas, html
  this.TextCanvasRendering = true;
  this.TextClass = '';
  this.TextFont = 'Arial';
  this.TextSize = 15;  // as int in pixel
  this.TextRotation = 0; // in rad or deg
  this.CanvasFontSize = 15;
  this.CTextCurrFontVers = 0;
  this.CTextLastFontVers = -1;
  this.TextColor = 'black';
  this.FontStyle = 'normal';
  this.FontWeight = 'normal';
  this.TextHAlign = 'center';
  this.TextVAlign = 'middle';
  this.TextHPad = 0;
  this.TextVPad = 0;
  this.CanvasTextHPad = 0;
  this.CanvasTextVPad = 0;
  this.LineHeight = 0;
  this.CanvasLineHeight = 0;
  this.LineJoin = 'round';
  this.LineCap = 'butt';
  this.ScaleRef = 800;
  this.AutoScalePix = false;
  this.LimitScalePix = true;
  this.ScalePixInt = false;

  this.MinLineWidth = 0.01;
  this.MinTextSize = 1;
  this.MinMarkerSize = 1;
  this.CurvePrecision = 0.25; // pixel
  this.MaxCurveSegments = 1024; // 8192 must be 4*2^n with n > 1
  this.NumBezierSegments = 64;
  this.DisableNativeArc = false;
  this.DisableNativeBezier = false;
  this.SavedAttrs = null;
  this.SavedDefaultAttrs = null;

  this.PenDown = false;
  this.IsPathOpen = false;
  this.CurrPath = [];
  this.CurrPathSize = 0;
  this.CommonPathElePool = [];
  this.CommonPathElePoolSize = 0;
  this.ArcPathElePool = [];
  this.ArcPathElePoolSize = 0;
  this.BezierPathElePool = [];
  this.BezierPathElePoolSize = 0;

  this.ContainerDiv = null;
  this.ClippingDiv = null;
  this.Canvas = null;
  this.Context2D = null;
  this.HtmlTextHandler = null;

  this.IsResettingAll = false;
  this.DrawTime = 50;
  this.ResizeTimer = null; // timer
  this.DrawTimer = null; // timer
  this.DeferedDrawTimer = null; // timer
  this.LastContWidthDrawn = 0;
  this.LastContWidth = 0;
  this.LastPixelRatioDrawn = 0;
  this.LastPixelRatioOnResize = 0;
  this.LastCanvasWidth = 0;
  this.DrawingCount = 0; // incremeted in BeginDrawing, decremented in EndDrawing
  this.DrawPending = 0;
}

JsGraph.prototype.SetDriverAttrs = function() {
  // Init Context2D attributes with current atttributes
  this.SetLineAttr( this.Color, this.LineWidth );
  this.SetBgColor( this.BgColor );
  this.SetTextRendering( this.TextRendering );
  this.SetTextClass( '' );
  this.SetTextAttr( this.TextFont, this.TextSize, this.TextColor, this.FontWeight, this.FontStyle, this.TextHAlign, this.TextVAlign, this.TextHPad, this.TextVPad, this.TextRotation );
  this.SetLineHeight( this.LineHeight );
  this.SetLineJoin( this.LineJoin );
  this.SetLineCap( this.LineCap );
}

JsGraph.prototype.IdCounter = 0;

JsGraph.prototype.CreateCanvas = function( aParams ) {
  // aParams =
  //   Id: String; Default 'JsGraph<n>', where <n> is a counter number
  //   Width: number(>0) or string; default '100%'; numbers are in pixel
  //   Height: number(>0) or string; default '75%'
  //   BorderWidth: number(>=0); default 1;
  //   BorderColor: string; default see class JsGraph { border-color }
  //   GraphClass: string; default 'JsGraph'
  //   GraphFormat: string; default ''; additional CSS classes
  // }
  JsGraph.prototype.IdCounter++;
  if (xStr(aParams.Id)) {
    this.Id = aParams.Id;
  } else {
    this.Id = 'JsGraph' + JsGraph.prototype.IdCounter;
  }
  this.BorderWidth = xDefNum( aParams.BorderWidth, 1 );

  this.CreateDomObjects( aParams );

  this.Context2D = this.Canvas.getContext('2d');
  this.HtmlTextHandler = new JsgHtmlTextHandler( this.ClippingDiv, this.Canvas, this.Context2D );

  // save clipping state..
  this.Context2D.save();

  // init transformations
  this.UpdateCanvasSize();
  this.SetViewport();
}

JsGraph.prototype.CreateDomObjects = function( aParams ) {
  // Assert( this.Id and this.BorderWidth are defined )
  // Creates this.ContainerDiv, this.ClippingDiv, this.Canvas
  //
  // aParams =
  //   Width: number(>0) or string; default '100%'; numbers are in pixel
  //   Height: number(>0) or string; default '75%'
  //   BorderColor: string; default see class JsGraph { border-color }
  //   GraphClass: string; default 'JsGraph'
  //   GraphFormat: string; default ''; additional CSS classes
  // }
  var width, height;

  var borderColor = xDefStr( aParams.BorderColor, '' );
  if (borderColor != '') borderColor = 'border-color:' + borderColor + ';';

  var cssContainer = 'bdBoxSizing';
  var cssClippingBox = '';
  var cssCanvas = '';

  var cssDefault = xDefStr( aParams.GraphClass, 'JsGraph' );
  cssContainer = this.AddCssClass( cssContainer, cssDefault );
  cssClippingBox = this.AddCssClass( cssClippingBox, cssDefault+'-ClippingBox' );
  cssCanvas = this.AddCssClass( cssCanvas, cssDefault+'-Canvas' );

  if (xStr(aParams.GraphFormat)) cssContainer = this.AddCssClass( cssContainer, aParams.GraphFormat );
  if (cssContainer !== '') cssContainer = ' class="' + cssContainer + '"';
  if (cssClippingBox !== '') cssClippingBox = ' class="' + cssClippingBox + '"';
  if (cssCanvas !== '') cssCanvas = ' class="' + cssCanvas + '"';

  var reqWidth = '100%';
  var reqHeight = '75%';
  if (xIsNumeric(aParams.Width ) || this.IsNumericPercent(aParams.Width )) reqWidth  = aParams.Width;
  if (xIsNumeric(aParams.Height) || this.IsNumericPercent(aParams.Height)) reqHeight = aParams.Height;

  var commonStyle = 'margin:0;padding:0;';
  var noborderStyle = 'border:none;';
  if (this.IsNumericPercent(reqWidth)) {

    // aWidth is a percentage number
    var containerStyle = 'width:'+reqWidth+';height:100%;' + 'border-width:' + this.BorderWidth + 'px;padding:0;' + borderColor;

    var clippingBoxStyle = 'width:100%;height:100%;font-size:0;line-height:0;overflow:hidden;' + commonStyle + noborderStyle;

    var canvasStyle = commonStyle + noborderStyle;
    if (containerStyle != '') containerStyle = ' style="' + containerStyle + '"';
    if (clippingBoxStyle != '') clippingBoxStyle = ' style="' + clippingBoxStyle + '"';
    if (canvasStyle != '') canvasStyle = ' style="' + canvasStyle + '"';

    var s = '<div id="' + this.Id + '"' + cssContainer + containerStyle + '>';
    s += '<div id="' + this.Id + '-ClippingBox"' + cssClippingBox + clippingBoxStyle + '>';
    s += '<canvas id="' + this.Id + '-Canvas"' + cssCanvas + canvasStyle + '></canvas>';
    s += '</div></div>';
    document.writeln( s );

    this.ContainerDiv = xGet( this.Id );
    this.ClippingDiv = xGet( this.Id+'-ClippingBox' );
    this.Canvas = xGet( this.Id+'-Canvas' );

    this.LastContWidth = xWidth( this.ContainerDiv );
    width = this.LastContWidth - 2 * this.BorderWidth;
    height = this.ParseHWInt( reqHeight, width );

    this.CanvasRatioHW = height / width;
    this.Canvas.width = width;
    this.Canvas.height = height;

  } else {

    // reqWidth is a pixel number (xIsNumeric(reqWidth) === true)
    width = this.ParseHWInt( reqWidth );
    height = this.ParseHWInt( reqHeight, width );

    var containerStyle = 'width:'+width+'px;' + 'border-width:' + this.BorderWidth + 'px;padding:0;' + borderColor;

    width -= 2 * this.BorderWidth;
    height -= 2 * this.BorderWidth;
    var clippingBoxStyle = 'width:'+width+'px;height:'+height+'px;font-size:0;line-height:0;overflow:hidden;' + commonStyle + noborderStyle;
    var canvasStyle = commonStyle + noborderStyle;
    if (containerStyle != '') containerStyle = ' style="' + containerStyle + '"';
    if (clippingBoxStyle != '') clippingBoxStyle = ' style="' + clippingBoxStyle + '"';
    if (canvasStyle != '') canvasStyle = ' style="' + canvasStyle + '"';

    var s = '<div id="' + this.Id + '"' + cssContainer + containerStyle + '>';
    s += '<div id="' + this.Id + '-ClippingBox"' + cssClippingBox + clippingBoxStyle + '>';
    s += '<canvas id="' + this.Id + '-Canvas" width="' + width + 'px" height="' + height + 'px"' + cssCanvas + canvasStyle + '></canvas>';
    s += '</div></div>';
    document.writeln( s );

    this.ContainerDiv = xGet( this.Id );
    this.ClippingDiv = xGet( this.Id+'-ClippingBox' );
    this.Canvas = xGet( this.Id+'-Canvas' );

  }
  var clippingDiv = this.ClippingDiv;
  var canvas = this.Canvas;
  if (!clippingDiv.style.position) clippingDiv.style.position = 'relative';
  canvas.style.position = 'absolute';
  canvas.style.top = 0;
  canvas.style.left = 0;
  canvas.style.margin = 0;
  canvas.style.padding = 0;
}

JsGraph.prototype.AddEventHandler = function( aEventType, aEventHandler, aCapture ) {
  // aEventType: String; see javascript addEventListener(), e.g. 'click'
  // aEventHandler: function( xEvent, JsGraph )
  // aCapture; Boolean; Optional; Default = false; see addEventListener()
  //
  // Click event can be installed also by defining parameter OnClick on NewGraph2D()
  // Note: aEventHandler is passed a xEvent object not a native event object. Second Argument is this JsGraph!
  //
  // use TransCnvsWinX(), TransCnvsWinY() to transform mouse coordinates to window coordinates

  if (!xFunc(aEventHandler)) return;
  var me = this;
  xAddEvent(
    this.Canvas,
    aEventType,
    function CB_Call_EventHandler(evnt) {
      aEventHandler(evnt,me);
    },
    xDefBool(aCapture,false)
  );
}

JsGraph.prototype.Redraw = function() {
  this.Draw();
}

JsGraph.prototype.SetDrawFunc = function( aDrawFunc, bDrawNow ) {
  // aDrawFunc = function( JsGraph )
  this.DrawFunc = xDefAnyOrNull( aDrawFunc, null );
  if (aDrawFunc && (this.DrawPending || bDrawNow)) {
    this.QueueDraw();
  }
}

JsGraph.prototype.SetDeferedDrawFunc = function( aDrawFunc ) {
  // aDrawFunc = function( JsGraph )
  if (this.DeferedDrawTimer) {
    clearTimeout( this.DeferedDrawTimer );
    this.DeferedDrawTimer = null;
  }
  this.DeferedDrawFunc = xDefAnyOrNull( aDrawFunc, null );
}

JsGraph.prototype.SetBeforeResetFunc = function( aBeforeClearFunc ) {
  // aBeforeClearFunc = function( JsGraph )
  // aBeforeClearFunc is called before Clear() is invoked and before DrawFunc is called after a window resize
  // Use this callback to stop an asynchrone drawing process
  this.BeforeResetFunc = xDefFunc( aBeforeClearFunc, null );
}

JsGraph.prototype.BeginDrawing = function() {
  if (this.DrawingCount == 0) { this.DrawPending = 0; }
  this.DrawingCount++;
}

JsGraph.prototype.EndDrawing = function( bEndAll ) {
  if (bEndAll) { this.DrawingCount = 1; }
  this.DrawingCount--;
  if (this.DrawingCount < 0) { this.DrawingCount = 0; }
  if (this.DrawingCount == 0 && this.DrawPending) {
    this.QueueDraw();
  }
}

JsGraph.prototype.CancelPendingDraws = function() {
  if (this.DrawTimer) {
    clearTimeout( this.DrawTimer );
    this.DrawTimer = null;
  }
  if (this.DeferedDrawTimer) {
    clearTimeout( this.DeferedDrawTimer );
    this.DeferedDrawTimer = null;
  }
  this.DrawPending = 0;
}

JsGraph.prototype.QueueDraw = function() {
  if (this.DrawTimer) {
    clearTimeout( this.DrawTimer );
    this.DrawTimer = null;
  }
  if (this.DeferedDrawTimer) {
    clearTimeout( this.DeferedDrawTimer );
    this.DeferedDrawTimer = null;
  }
  if (this.DrawFunc) {
    this.DrawTimer = setTimeout( this.OnDrawFunc, 50 );
  }
}

JsGraph.prototype.Draw = function() {
  //console.log( 'JsGraph.Draw' );
  if (this.DrawTimer) {
    clearTimeout( this.DrawTimer );
    this.DrawTimer = null;
  }
  if (this.DeferedDrawTimer) {
    clearTimeout( this.DeferedDrawTimer );
    this.DeferedDrawTimer = null;
  }
  if (!this.DrawFunc) return;
  if (!xOnLoadFinished) {
    this.QueueDraw();
    return;
  }
  if (this.IsDrawing()) {
    if (this.DrawPending == 0) this.DrawPending++;
    this.QueueDraw();
    return;
  }
  if (this.BeforeResetFunc) {
    try {
      this.BeforeResetFunc( this );
    }
    catch(err) { }
  }
  if (this.AutoReset) {
    this.Reset( this.AutoClear );
    if (this.ClientResetFunc) {
      try {
        this.ClientResetFunc( this );
      }
      catch(err) { }
    }
  }

  // call callback
  this.BeginDrawing();
  try {
    this.DrawFunc( this );
  } catch(err) { }
  this.EndDrawing();

  if (this.DeferedDrawFunc) {
    this.DeferedDrawTimer = setTimeout( this.OnDeferedDrawFunc, this.DeferedDrawTime );
  }
}

JsGraph.prototype.DeferedDraw = function() {
  //console.log( 'JsGraph.DeferedDraw' );
  if (this.DeferedDrawTimer) {
    clearTimeout( this.DeferedDrawTimer );
    this.DeferedDrawTimer = null;
  }
  if (!this.DeferedDrawFunc || this.IsDrawing()) return;

  // call callback
  this.BeginDrawing();
  try {
    this.DeferedDrawFunc( this );
  } catch(err) { }
  this.EndDrawing();
}

JsGraph.prototype.IsDrawing = function() {
  return this.DrawingCount;
}

JsGraph.prototype.IsDrawPending = function() {
  return this.DrawPending;
}

JsGraph.prototype.IsInvalidDrawing = function() {
  // Returns true if current draw operation can be aborted
  // because canvas has changed and a OnDrawFunc is installed.
  return (this.DrawPending > 0) && (this.DrawFunc);
}

JsGraph.prototype.InitResizeCheck = function() {
  if (!this.ContainerDiv) return;
  this.LastContWidthDrawn = xWidth(this.ContainerDiv);
  this.LastPixelRatioDrawn = this.PixelRatio;
  this.LastPixelRatioOnResize = this.PixelRatio;
}

JsGraph.prototype.CheckResizeRegularly = function() {
  // check resize regularly to correct canvas size and transformations and to call for redraw
  //console.log( 'JsGraph.CheckResizeRegularly' );
  if (this.ResizeTimer) {
    clearTimeout( this.ResizeTimer );
    this.ResizeTimer = null;
  }
  if (!this.ContainerDiv) return;
  this.UpdatePixelRatios();
  var width = xWidth(this.ContainerDiv);
  if (width != this.LastContWidth || this.LastPixelRatioOnResize != this.PixelRatio) {
    this.LastContWidth = width;
    this.LastPixelRatioOnResize = this.PixelRatio;
  } else {
    // only call redraw if resize is finished (LastContWidth = width)
    if (this.LastContWidthDrawn != width || this.LastPixelRatioDrawn != this.PixelRatio) {
      this.UpdateCanvasSize( width );
      this.DeleteSnapshots();
      this.DrawPending++;
      this.QueueDraw();
      this.LastContWidthDrawn = width;
      this.LastPixelRatioDrawn = this.PixelRatio;
    }
  }
  this.ResizeTimer = setTimeout( this.OnResizeFunc, this.DrawTime );
}

JsGraph.prototype.Reset = function( clear ) {
  clear = xDefBool( clear, true );
  this.IsResettingAll = true; // prevents Resetting Attrs in SetClipping()/Clip()
  this.LastX = 0.0;
  this.LastY = 0.0;
  this.PenDown = false;
  this.IsPathOpen = false;
  this.CurrPathSize = 0;

  this.ObjTrans.Reset();
  this.ObjTransStack = [];
  this.Trans = 'window';
  this.CanvasTrans.Reset();
  this.VpTrans.Reset();
  this.WinTrans.Reset();
  this.CurrTrans = this.WinTrans;

  this.UpdateCanvasTrans();
  this.SetViewport();
  this.SetGraphClipping( false, 'canvas' );
  this.ResetAttrs();
  if (clear) this.Clear();
  this.IsResettingAll = false;
}

JsGraph.prototype.UpdateCanvasTrans = function() {
  this.CanvasTrans.Width = this.CanvasWidth;
  this.CanvasTrans.Height = this.CanvasHeight;
}

JsGraph.prototype.GetObjTrans = function() {
  // private
  var otr = this.ObjTrans;
  return (!otr.IsUnitTrans && otr.Enabled) ? otr : null;
}

JsGraph.prototype.IsNumericPercent = function( x ) {
  if (!xStr(x) || x === '') return false;
  var p = x.lastIndexOf('%');
  if (p !== x.length-1) return false;
  x = x.substr(0,p);
  if (!xIsNumeric(x)) return false;
  return true;
}

JsGraph.prototype.ParseHWInt = function( h, w ) {
  var result;
  if (xDef(w) && this.IsNumericPercent(h)) {
    result = w * (parseFloat(h) / 100.0);
  } else if (xStr(h)) {
    result = parseFloat(h);
  } else {
    result = h;
  }
  result = Math.round( result );
  if (result <= 0) retult = 1;
  return result;
}

JsGraph.prototype.AddCssClass = function( css, addCss ) {
  if (addCss === '') return css;
  if (css !== '') css += ' ';
  return css + addCss;
}

JsGraph.prototype.SetHighResolution = function( aOnOff ) {
  var old = this.HighResolution;
  aOnOff = xDefBool( aOnOff, true );
  if (aOnOff == old) return old;
  this.HighResolution = aOnOff;
  this.HighResSet = false;
  this.UpdateCanvasSize();
  return old;
}

JsGraph.prototype.AdjustForHighResolutionDisplays = function() {
  // implementation see http://www.html5rocks.com/en/tutorials/canvas/hidpi/
  // Note: UpdatePixelRatios() must be called before this function

  var context = this.Context2D;
  var canvas = this.Canvas;

  // upscale the canvas if the two ratios don't match
  if (this.HighResolution && this.DevicePixelRatio !== this.CanvasPixelRatio) {

    var ratio = this.PixelRatio;
    var oldWidth = this.CanvasWidth;
    var oldHeight = this.CanvasHeight;
    if (canvas.width != oldWidth * ratio) {
      canvas.width = oldWidth * ratio;
      canvas.height = oldHeight * ratio;
    }
    xStyle( canvas, 'width', oldWidth + 'px' );
    xStyle( canvas, 'height', oldHeight + 'px' );

  } else {

    // reset all to 1:1
    var ratio = 1;
    var width = this.CanvasWidth;
    var height = this.CanvasHeight;
    if (canvas.width != width) {
      // resize canvas itself not only his style
      canvas.width = width;
      canvas.height = height;
    }
    xStyle( canvas, 'width', width + 'px' );
    xStyle( canvas, 'height', height + 'px' );

  }

  // now scale the context to counter
  // the fact that we've manually scaled
  // our canvas element
  context.setTransform( 1, 0, 0, 1, 0, 0 );
  context.scale( ratio, ratio );
  this.ContextScale = ratio;

  this.HighResSet = true;
  this.LastPixelRatio = this.PixelRatio;
}

JsGraph.prototype.UpdatePixelRatios = function() {
  // implementation see http://www.html5rocks.com/en/tutorials/canvas/hidpi/
  var context = this.Context2D;
  this.DevicePixelRatio = window.devicePixelRatio || 1;
  this.CanvasPixelRatio = context.webkitBackingStorePixelRatio ||
                          context.mozBackingStorePixelRatio ||
                          context.msBackingStorePixelRatio ||
                          context.oBackingStorePixelRatio ||
                          context.backingStorePixelRatio || 1;
  this.PixelRatio = this.DevicePixelRatio / this.CanvasPixelRatio;
}

JsGraph.prototype.UpdateCanvasSize = function( aContainerWidth ) {
  if (!this.ContainerDiv) return;
  if (!xDef(aContainerWidth)) aContainerWidth = xWidth(this.ContainerDiv);
  this.UpdatePixelRatios();
  if (this.CanvasRatioHW == 0) {
    // fixed size canvas:
    // get current canvas size
    this.CanvasWidth = aContainerWidth - 2 * this.BorderWidth;
    this.CanvasHeight = xHeight(this.ContainerDiv) - 2 * this.BorderWidth;
    if (!this.HighResSet || this.PixelRatio != this.LastPixelRatio) {
      this.AdjustForHighResolutionDisplays();
    }
  } else {
    // variable size canvas:
    // on percentage size resize ContainerDiv
    var width = aContainerWidth - 2 * this.BorderWidth;
    if (this.LastCanvasWidth == width && this.PixelRatio == this.LastPixelRatio) {
      if (!this.HighResSet) {
        this.AdjustForHighResolutionDisplays();
      }
      return;
    }
    var height = width * this.CanvasRatioHW;
    xHeight( this.ContainerDiv, height + 2 * this.BorderWidth, true );
    this.CanvasWidth = width;
    this.CanvasHeight = height;
    this.LastCanvasWidth = width;
    this.AdjustForHighResolutionDisplays();
  }
  this.UpdateCanvasTrans();
  this.UpdateGraphClipOuterRange();
}

JsGraph.prototype.UpdateGraphClipOuterRange = function() {
  if (this.GraphClipExtend >= 0) {
    var xExtend = this.CanvasWidth * this.GraphClipExtend;
    if (xExtend < this.GraphClipMargin) xExtend = this.GraphClipMargin;
    var yExtend = this.CanvasHeight * this.GraphClipExtend;
    if (yExtend < this.GraphClipMargin) yExtend = this.GraphClipMargin;
    this.GraphClipOuterXmin = -xExtend;
    this.GraphClipOuterXmax = this.CanvasWidth + xExtend;
    this.GraphClipOuterYmin = -yExtend;
    this.GraphClipOuterYmax = this.CanvasHeight + yExtend;
  } else {
    // debug: make inner clip range smaller by extend and set outer clip range to canvas - GraphClipMargin
    var xExtend = -this.CanvasWidth * this.GraphClipExtend / 2;
    if (xExtend < this.GraphClipMargin) xExtend = this.GraphClipMargin;
    var yExtend = -this.CanvasHeight * this.GraphClipExtend / 2;
    if (yExtend < this.GraphClipMargin) yExtend = this.GraphClipMargin;
    this.GraphClipInnerXmin = xExtend;
    this.GraphClipInnerXmax = this.CanvasWidth - xExtend;
    this.GraphClipInnerYmin = yExtend;
    this.GraphClipInnerYmax = this.CanvasHeight - yExtend;
    xExtend *= 0.8; yExtend *= 0.8;
    this.GraphClipOuterXmin = xExtend;
    this.GraphClipOuterXmax = this.CanvasWidth - xExtend;
    this.GraphClipOuterYmin = yExtend;
    this.GraphClipOuterYmax = this.CanvasHeight - yExtend;
  }
}

JsGraph.prototype.Clear = function() {
  this.Context2D.clearRect( 0, 0, this.CanvasWidth, this.CanvasHeight );
  this.HtmlTextHandler.Clear();
}

JsGraph.prototype.DeleteSnapshots = function() {
  this.Snapshots = [];
}

JsGraph.prototype.GetSnapshot = function( id ) {
  if (this.Snapshots[id]) return this.Snapshots[id];
  return null;
}

JsGraph.prototype.MakeSnapshot = function( id, x, y, w, h ) {
  // or MakeSnapshot( id ) for whole canvas
  // or MakeSnapshot( id, 'viewport' ) for viewport
  var pixelRatio = this.DevicePixelRatio;
  if (!xDef(x)) {
    x = 0;
    y = 0;
    w = Math.floor( this.CanvasWidth * pixelRatio );
    h = Math.floor( this.CanvasHeight * pixelRatio );
  } else if (xStr(x)) {
    var box = this.GetViewportDeviceRect();
    x = box.x;
    y = box.y;
    w = box.w;
    h = box.h;
  } else {
    x = Math.floor( x * pixelRatio );
    y = Math.floor( y * pixelRatio );
    w = Math.floor( w * pixelRatio );
    h = Math.floor( h * pixelRatio );
  }
  var snapshot = new JsgSnapshot( x, y, w, h, this.Canvas );
  if (!snapshot.ImageData) return; // canvas buffer could not be created, discard snapshot
  this.Snapshots[id] = snapshot;
}

JsGraph.prototype.DrawSnapshot = function( id, clear ) {
  clear = xDefBool( clear, true );
  var snapshot = this.GetSnapshot( id );
  if (!snapshot) return false;
  var ctx = this.Context2D;
  var pixelRatio = this.DevicePixelRatio;
  var x = snapshot.x / pixelRatio;
  var y = snapshot.y / pixelRatio;
  var w = snapshot.w / pixelRatio;
  var h = snapshot.h / pixelRatio;
  var oldAlpha = ctx.globalAlpha;
  ctx.globalAlpha = 1;
  ctx.beginPath();
  if (clear) ctx.clearRect( x, y, w, h );
  ctx.drawImage( snapshot.ImageData, x, y, w, h );
  ctx.globalAlpha = oldAlpha;
  return true;
}

// Transformations

JsGraph.prototype.SetAngleMeasure = function( am ) {
  // am: string 'deg' or 'rad'; init = 'deg'
  // returns previsous angle measure
  var old = this.AngleMeasure;
  if (am == 'rad') {
    this.AngleMeasure = 'rad';
  } else {
    this.AngleMeasure = 'deg';
  }
  return old;
}

JsGraph.prototype.ResetTrans = function() {
  this.ObjTrans.Reset();
  return this;
}

JsGraph.prototype.SaveTrans = function( reset ) {
  // pushes a copy of object trans onto a stack and returns a reference to this copy
  // the returned obj trans can be used in SetTrans()
  // if reset == true then function ResetTrans() is called
  var copyTrans = this.ObjTrans.Copy();
  this.ObjTransStack.push( copyTrans );
  if (reset) this.ObjTrans.Reset();
  return copyTrans;
}

JsGraph.prototype.RestoreTrans = function() {
  if (this.ObjTransStack.length > 0) this.ObjTrans = this.ObjTransStack.pop();
}

JsGraph.prototype.TransMove = function( x, y ) {
  if (JsgVect2.Ok(x)) return this.TransMove( x[0], x[1] );
  this.ObjTrans.Move( x, y );
  return this;
}

JsGraph.prototype.TransScale = function( sx, sy ) {
  if (JsgVect2.Ok(sx)) return this.TransScale( sx[0], sx[1] );
  this.ObjTrans.Scale( sx, sy );
  return this;
}

JsGraph.prototype.TransRotate = function( ang ) {
  this.ObjTrans.Rotate( this.AngleToRad(ang) );
  return this;
}

JsGraph.prototype.TransRotateAtPoint = function( x, y, ang ) {
  if (JsgVect2.Ok(x)) return this.TransRotateAtPoint( x[0], x[1], y );
  this.ObjTrans.Move( -x, -y );
  this.ObjTrans.Rotate( this.AngleToRad(ang) );
  this.ObjTrans.Move( x, y );
  return this;
}

JsGraph.prototype.AddTrans = function( mat ) {
  // mat: 2x3 or 3x3 array
  this.ObjTrans.AddTrans( mat );
  return this;
}

JsGraph.prototype.ObjTransPoly = function( poly ) {
  // poly: JsgPolygon
  // applies object transformations to poly
  var otr = this.GetObjTrans();
  if (!otr) return;
  var xArr = poly.X;
  var yArr = poly.Y;
  var size = poly.Size;
  for (var i = 0; i < size; i++) {
    otr.TransXY( xArr[i], yArr[i] );
    xArr[i] = otr.x;
    yArr[i] = otr.y;
  }
}

JsGraph.prototype.TransPoly = function( poly ) {
  // poly: JsgPolygon
  // applies all transformations to poly; returned poly is in viewport coordinates
  var ctr = this.CurrTrans;
  var otr = this.GetObjTrans();
  var xArr = poly.X;
  var yArr = poly.Y;
  var size = poly.Size;
  for (var i = 1; i < size; i++ ) {
    ctr.ObjTransXY( otr, xArr[i], yArr[i] );
    xArr[i] = ctr.x;
    yArr[i] = ctr.y;
  }
}

JsGraph.prototype.ObjTransXY = function( x, y ) {
  // x, y: number; position in current coordinate system
  // applies object transformation to x, y
  // returns this.ObjTrans.x, this.ObjTrans.y; this.ObjTrans: JsgTrans2D
  var otr = this.ObjTrans;
  otr.TransXY( x, y );
  return otr;
}

JsGraph.prototype.TransXY = function( x, y ) {
  // x, y: number; position in current coordinate system
  // applies all transformations to poly; returned poly is in viewport coordinates
  // returns this.CurrTrans.x, this.CurrTrans.y; this.CurrTrans: JsgTrans
  var ctr = this.CurrTrans;
  ctr.ObjTransXY( this.GetObjTrans(), x, y );
  return ctr;
}

JsGraph.prototype.SelectTrans = function( aTrans ) {
  // aTrans: string = 'canvas', 'viewport', 'window'; init = 'window'
  if (this.Trans == aTrans || !this.TransByName[aTrans]) return this.Trans;
  var oldTrans = this.Trans;
  this.CurrTrans = this.TransByName[aTrans];
  this.Trans = aTrans;
  return oldTrans;
}

JsGraph.prototype.SetViewport = function( aX, aY, aWidth, aHeight, bScalePix, bClip ) {
  var doClip = xDef( aX );
  aWidth = xDefNum( aWidth, 0 );
  aHeight = xDefNum( aHeight, 0 );
  aX = xDefNum( aX, 0 );
  aY = xDefNum( aY, 0 );
  bScalePix = xDefBool( bScalePix, false );
  bClip = xDefBool( bClip, false );
  if (bScalePix) {
    aX = this.ScalePix( aX, this.ScalePixInt );
    aY = this.ScalePix( aY, this.ScalePixInt );
    if (aWidth < 0) aWidth = this.ScalePix( aWidth, this.ScalePixInt );
    if (aHeight < 0) aHeight = this.ScalePix( aHeight, this.ScalePixInt );
  }
  this.VpXmin = aX;
  this.VpYmin = aY;
  if (aWidth <= 0) {
    this.VpWidth = this.CanvasWidth + aWidth - aX;
  } else {
    this.VpWidth = aWidth;
  }
  if (aHeight <= 0) {
    this.VpHeight = this.CanvasHeight + aHeight - aY;
  } else {
    this.VpHeight = aHeight;
  }
  this.VpInnerWidth = this.VpWidth - 1;
  this.VpInnerHeight = this.VpHeight - 1;
  this.SetViewportTrans();
  this.SetWindow();
  this.ResetInnerClipRange();
  if (doClip) {
    if (bClip) {
      this.SetClipping( 'viewport' );
    } else {
      this.SetClipping( 'canvas' );
    }
  }
  // debug:
  if (this.GraphClipExtend < 0) this.UpdateGraphClipOuterRange();
}

JsGraph.prototype.ResetInnerClipRange = function() {
  // Init GraphClipInnerRange
  this.GraphClipInnerXmin = -this.GraphClipMargin;
  this.GraphClipInnerXmax = this.CanvasWidth + this.GraphClipMargin;
  this.GraphClipInnerYmin = -this.GraphClipMargin;
  this.GraphClipInnerYmax = this.CanvasHeight + this.GraphClipMargin;
}

JsGraph.prototype.SetViewportRel = function( aLeft, aTop, aRight, aBottom, bScalePix, bClip ) {
  aLeft   = xDefNum( aLeft, 0 );
  aTop    = xDefNum( aTop, aLeft );
  aRight  = xDefNum( aRight, aLeft );
  aBottom = xDefNum( aBottom, aTop );
  bScalePix = xDefBool( bScalePix, true );
  bClip = xDefBool( bClip, true );
  if (bScalePix) {
    aLeft = this.ScalePix( aLeft, this.ScalePixInt );
    aTop = this.ScalePix( aTop, this.ScalePixInt );
    aRight = this.ScalePix( aRight, this.ScalePixInt );
    aBottom = this.ScalePix( aBottom, this.ScalePixInt );
  }
  this.VpWidth = this.VpWidth - aLeft - aRight;
  this.VpHeight = this.VpHeight - aTop - aBottom;
  this.VpXmin = this.VpXmin + aLeft;
  this.VpYmin = this.VpYmin + aTop;
  this.VpInnerWidth = this.VpWidth - 1;
  this.VpInnerHeight = this.VpHeight - 1;
  this.SetViewportTrans();
  this.SetWindow();
  if (bClip) {
    this.SetClipping( 'viewport' );
  } else {
    this.SetClipping( 'canvas' );
  }
}

JsGraph.prototype.SetViewportTrans = function() {
  var trans = this.VpTrans;
  // set trans geom
  trans.Xmin = this.VpXmin;
  trans.Ymin = this.VpYmin;
  trans.Width = this.VpWidth;
  trans.Height = this.VpHeight;
  // set viewport transformation
  trans.OffsetX = this.VpXmin + 0.5;
  trans.OffsetY = this.VpYmin + 0.5;
  trans.ScaleX = 1;
  trans.ScaleY = 1;
}

JsGraph.prototype.SetWindow = function( aXmin, aYmin, aXmax, aYmax ) {
  // args: real
  aXmin = xDefNum( aXmin, 0 );
  aYmin = xDefNum( aYmin, 0 );
  aXmax = xDefNum( aXmax, 0 );
  aYmax = xDefNum( aYmax, 0 );
  if (aXmin == aXmax) aXmax = this.VpInnerWidth;
  if (aYmin == aYmax) aYmax = this.VpInnerHeight;
  this.WinXmin = aXmin;
  this.WinXmax = aXmax;
  this.WinYmin = aYmin;
  this.WinYmax = aYmax;
  this.WinWidth = aXmax - aXmin;
  this.WinHeight = aYmax - aYmin;
  // set trans geom
  var trans = this.WinTrans;
  trans.Xmin = this.WinXmin;
  trans.Ymin = this.WinYmin;
  trans.Width = this.WinWidth;
  trans.Height = this.WinHeight;
  // set window transformation
  var sx = this.VpInnerWidth / this.WinWidth;
  trans.ScaleX = sx;
  trans.OffsetX = (-this.WinXmin * sx) + this.VpXmin + 0.5;
  var sy = -(this.VpInnerHeight / this.WinHeight);
  trans.ScaleY = sy;
  trans.OffsetY = this.VpInnerHeight - this.WinYmin * sy + this.VpYmin + 0.5;
}

JsGraph.prototype.SetWindowWH = function( aXnull, aYnull, aWidth, aHeight ) {
  // compute with and height from viewport aspect ratio
  aXnull = xDefNum( aXnull, 0 );
  aYnull = xDefNum( aYnull, 0 );
  aWidth = xDefNum( aWidth, 0 );
  aHeight = xDefNum( aHeight, 0 );
  if (aWidth == 0) {
    var aspectRatio = this.VpInnerWidth / this.VpInnerHeight;
    aWidth = aHeight * aspectRatio;
  } else if (aHeight == 0) {
    var aspectRatio = this.VpInnerWidth / this.VpInnerHeight;
    if (aspectRatio != 0) aHeight = aWidth / aspectRatio;
  }
  this.SetWindow( aXnull, aYnull, aXnull + aWidth, aYnull + aHeight );
}

JsGraph.prototype.MapWindow = function( aXcenter, aYcenter, aWidth, aHeight, aAlign ) {
  // compute with and height from viewport aspect ratio
  aXcenter = xDefNum( aXcenter, 0 );
  aYcenter = xDefNum( aYcenter, 0 );
  aWidth = xDefNum( aWidth, 0 );
  aHeight = xDefNum( aHeight, 0 );
  aAlign = xDefNum( aAlign, 0 );
  var vpAscpectRatio = this.VpInnerWidth / this.VpInnerHeight;
  if (aWidth == 0) {
    aWidth = aHeight * vpAscpectRatio;
  } else if (aHeight == 0) {
    if (vpAscpectRatio != 0) aHeight = aWidth / vpAscpectRatio;
  } else {
    // assert( aWidth != 0 && aHeight != 0 )
    var winAscpectRatio = aWidth / aHeight;
    if (vpAspectRatio >= winAspectRatio) {
      var winWidth = aHeight * vpAscpectRatio;
      var padding = (winWidth - aWidth) / 2;
      aXcenter -= aAlign * padding;
      aWidth = winWidth;
    } else {
      var winHeight = aWidth / vpAscpectRatio;
      var padding = (winHeight - aHeight) / 2;
      aYcenter -= aAlign * padding;
      aHeight = winHeight;
    }
  }
  var xmin = aXcenter - aWidth / 2;
  var ymin = aYcenter - aHeight / 2;
  var xmax = xmin + aWidth;
  var ymax = ymin + aHeight;
  this.SetWindow( xmin, ymin, xmax, ymax );
}

JsGraph.prototype.SetClipRect = function( aX, aY, aWidth, aHeight, aTrans ) {
  aX = xDefNum( aX, 0 );
  aTrans = xDefStr( aTrans, '' );
  var oldTrans = this.Trans;
  if (aTrans != '') {
    this.SelectTrans( aTrans );
  }
  var otr = this.ObjTrans;
  var enableObjTrans = (this.Trans == 'window');
  var oldEnable = otr.Enable( enableObjTrans );

  this.OpenPath();
  this.RectWH( aX, aY, aWidth, aHeight );
  this.Clip();

  if (this.Trans == 'viewport') {
  // Init GraphClipInnerRange
    this.GraphClipInnerXmin = this.VpXmin   - this.GraphClipMargin;
    this.GraphClipInnerXmax = this.VpWidth  + this.GraphClipMargin;
    this.GraphClipInnerYmin = this.VpYmin   - this.GraphClipMargin;
    this.GraphClipInnerYmax = this.VpHeight + this.GraphClipMargin;
  } else {
    // this.Trans is window or canvas
    this.ResetInnerClipRange();
  }

  otr.Enable( oldEnable );
  if (aTrans != '') {
    this.SelectTrans( oldTrans );
  }
}

JsGraph.prototype.SetClipping = function( aClipRange ) {
  aClipRange = xDefStr( aClipRange, 'canvas' );
  if (aClipRange == 'window') {
    this.SetClipRect( this.WinXmin, this.WinYmin, this.WinWidth, this.WinHeight, 'window' );
  } else if (aClipRange == 'viewport') {
    this.SetClipRect( this.VpXmin, this.VpYmin, this.VpWidth, this.VpHeight, 'canvas' );
  } else {
    this.SetClipRect( 0, 0, this.CanvasWidth, this.CanvasHeight, 'canvas' );
  }
}

JsGraph.prototype.SetGraphClipping = function( clipping, clipRange, extendFactor ) {
  // clipping = true -> clips graphic elements before clipping at canvas clipping range to account for
  // problems when drawing graphics much greater then canvas size
  // extendFactor default is 1 which means 1 times the canvas size in each direction
  // if exendFactor is not defined, doesnt change it
  // note: negative extendFactor can be used to debug clipping

  this.GraphClipEnabled = xDefBool( clipping, true );
  if (xStr(clipRange) && clipRange != '') this.SetClipping( clipRange );
  if (xNum(extendFactor)) this.GraphClipExtend = extendFactor;
  this.UpdateGraphClipOuterRange();
}

JsGraph.prototype.SetAutoScalePix = function( bAutoScale ) {
  bAutoScale = xDefBool( bAutoScale, true );
  var old = this.AutoScalePix;
  this.AutoScalePix = bAutoScale;
  return old;
}

JsGraph.prototype.SetLimitScalePix = function( bLimtiScalePix ) {
  bLimtiScalePix = xDefBool( bLimtiScalePix, true );
  var old = this.LimtiScalePix;
  this.LimtiScalePix = bLimtiScalePix;
  return old;
}

JsGraph.prototype.SetScalePixInt = function( bScalePixInt ) {
  bScalePixInt = xDefBool( bScalePixInt, false );
  var old = this.ScalePixInt;
  this.ScalePixInt = bScalePixInt;
  return old;
}

JsGraph.prototype.SetScaleRef = function( aScaleRef, bLimitScalePix, bAutoScalePix, bScalePixInt ) {
  // or SetScaleRef( JsgAttrsDef )
  if (xObj(aScaleRef)) {
    this.SetScaleRef( aScaleRef.ScaleRef, aScaleRef.LimitScalePix, aScaleRef.AutoScalePix, aScaleRef.ScalePixInt );
    return;
  }
  if (xNum(aScaleRef)) {
    this.ScaleRef = aScaleRef;
    this.SavedDefaultAttrs.ScaleRef = aScaleRef;
  }
  if (xBool(bLimitScalePix)) {
    this.LimitScalePix = bLimitScalePix;
    this.SavedDefaultAttrs.LimitScalePix = bLimitScalePix;
  }
  if (xBool(bAutoScalePix)) {
    this.AutoScalePix = bAutoScalePix;
    this.SavedDefaultAttrs.AutoScalePix = bAutoScalePix;
  }
  if (xBool(bScalePixInt)) {
    this.ScalePixInt = bScalePixInt;
    this.SavedDefaultAttrs.ScalePixInt = bScalePixInt;
  }
}

JsGraph.prototype.GetPixScaling = function() {
  var r = this.CanvasWidth / this.ScaleRef;
  if (this.LimitScalePix && r > 1) r = 1;
  return r;
}

JsGraph.prototype.ScalePix = function( aSize, bInt ) {
  var m = aSize < 0 ? -1 : 1;
  var r = m * aSize * this.GetPixScaling();
  if (bInt) {
    r = Math.round( r );
    if (r < 1) r = 1;
  }
  return m * r;
}

JsGraph.prototype.ScalePixI = function( aSize ) {
  return this.ScalePix( aSize, true );
}

JsGraph.prototype.ScalePixMax = function( aSize, aMaxSize, bInt ) {
  var m = aSize < 0 ? -1 : 1;
  var r = m * aSize * this.GetPixScaling();
  if (r > aMaxSize) r = aMaxSize;
  if (bInt) {
    r = Math.round( r );
    if (r < 1) r = 1;
  }
  return m * r;
}

JsGraph.prototype.ScalePixMaxI = function( aSize, aMaxSize ) {
  return this.ScalePixMax( aSize, aMaxSize, true );
}

JsGraph.prototype.ScalePixMin = function( aSize, aMinSize, bInt ) {
  var m = aSize < 0 ? -1 : 1;
  var r = m * aSize * this.GetPixScaling();
  if (r < aMinSize) r = aMinSize;
  if (bInt) {
    r = Math.round( r );
    if (r < 1) r = 1;
  }
  return m * r;
}

JsGraph.prototype.ScalePixMinI = function( aSize, aMinSize ) {
  return this.ScalePixMin( aSize, aMinSize, true );
}

JsGraph.prototype.ScalePixMinMax = function( aSize, aMinSize, aMaxSize, bInt ) {
  var m = aSize < 0 ? -1 : 1;
  var r = m * aSize * this.GetPixScaling();
  if (r < aMinSize) r = aMinSize;
  if (r > aMaxSize) r = aMaxSize;
  if (bInt) {
    r = Math.round( r );
    if (r < 1) r = 1;
  }
  return m * r;
}

JsGraph.prototype.ScalePixMinMaxI = function( aSize, aMinSize, aMaxSize ) {
  return this.ScalePixMinMax( aSize, aMinSize, aMaxSize, true );
}

JsGraph.prototype.MinSize = function( aSize, aMinSize ) {
  return (aSize < aMinSize) ? aMinSize : aSize;
}

JsGraph.prototype.MaxSize = function( aSize, aMaxSize ) {
  return (aSize > aMaxSize) ? aMaxSize : aSize;
}

JsGraph.prototype.MinMaxSize = function( aSize, aMinSize, aMaxSize ) {
  var r = aSize;
  if (r < aMinSize) r = aMinSize;
  if (r > aMaxSize) r = aMaxSize;
  return r;
}

JsGraph.prototype.Limit01 = function( x ) {
  return (x < 0) ? 0 : ((x > 1) ? 1 : x);
}

JsGraph.prototype.ScaleToTic = function( aValue, aTic ) {
  var v = (Math.round(Math.abs(aValue)/aTic + 0.3) + 0.5) * aTic
  return (aValue < 0) ? -v : v;
}

JsGraph.prototype.ScaleWinX = function() {
  return Math.abs( this.WinTrans.ScaleX );
}

JsGraph.prototype.ScaleWinY = function() {
  return Math.abs( this.WinTrans.ScaleY );
}

JsGraph.prototype.TransWinVpX = function( x ) {
  // transforms window to viewport
  var cx = this.WinTrans.TransX( x );
  return this.VpTrans.InvTransX( cx );
}

JsGraph.prototype.TransWinVpY = function( y ) {
  var cy = this.WinTrans.TransY( y );
  return this.VpTrans.InvTransY( cy );
}

JsGraph.prototype.TransWinCnvsX = function( x ) {
  // transforms window to canvas
  return this.WinTrans.TransX( x );
}

JsGraph.prototype.TransWinCnvsY = function( y ) {
  return this.WinTrans.TransY( y );
}

JsGraph.prototype.TransVpCnvsX = function( x ) {
  // transforms viewport to canvas
  return this.VpTrans.TransX( x );
}

JsGraph.prototype.TransVpCnvsY = function( y ) {
  return this.VpTrans.TransY( y );
}

JsGraph.prototype.TransVpWinX = function( x ) {
  // transforms viewport to window
  var cx = this.VpTrans.TransX( x );
  return this.WinTrans.InvTransX( cx );
}

JsGraph.prototype.TransVpWinY = function( y ) {
  var cy = this.VpTrans.TransY( y );
  return this.WinTrans.InvTransY( cy );
}

JsGraph.prototype.TransCnvsWinX = function( x ) {
  return this.WinTrans.InvTransX( x );
}

JsGraph.prototype.TransCnvsWinY = function( y ) {
  return this.WinTrans.InvTransY( y );
}

JsGraph.prototype.TransCnvsVpX = function( x ) {
  // transforms canvas to viewport
  return this.VpTrans.InvTransX( x );
}

JsGraph.prototype.TransCnvsVpY = function( y ) {
  return this.VpTrans.InvTransY( y );
}

// attribute management

JsGraph.prototype.GetAttrs = function() {
  return new JsgAttrs( this );
}

JsGraph.prototype.SetAttrs = function( aAttrs ) {
  // aAttrs as JsgAttrs
  if (!xObj(aAttrs)) return;
  if (aAttrs.Reset) this.ResetAttrs();
  this.SetScaleRef( aAttrs );
  if (xDef(aAttrs.CurvePrecision)) this.CurvePrecision = aAttrs.CurvePrecision;
  if (xDef(aAttrs.AngleMeasure))   this.SetAngleMeasure( aAttrs.AngleMeasure );
  if (xDef(aAttrs.ObjTrans))       this.ObjTrans.CopyFrom( aAttrs.ObjTrans );
  if (xDef(aAttrs.Trans))          this.SelectTrans( aAttrs.Trans );
  if (xDef(aAttrs.Alpha))          this.SetAlpha( aAttrs.Alpha );
  if (xDef(aAttrs.LineJoin))       this.SetLineJoin( aAttrs.LineJoin );
  if (xDef(aAttrs.LineCap))        this.SetLineCap( aAttrs.LineCap );
  if (xDef(aAttrs.Color))          this.SetColor( aAttrs.Color );
  if (xObj(aAttrs.BgGradient)) {
    this.SetBgColor( aAttrs.BgGradient );
  } else if (xDef(aAttrs.BgColor)) {
    this.SetBgColor( aAttrs.BgColor );
  }
  if (xDef(aAttrs.LineWidth))      this.SetLineWidth( aAttrs.LineWidth );
  if (xDef(aAttrs.MarkerSymbol))   this.SetMarkerSymbol( aAttrs.MarkerSymbol );
  if (xDef(aAttrs.MarkerSize))     this.SetMarkerSize( aAttrs.MarkerSize );
  if (xDef(aAttrs.TextRendering))  this.SetTextRendering( aAttrs.TextRendering );
  if (xDef(aAttrs.TextClass))      this.SetTextClass( aAttrs.TextClass );
  if (xDef(aAttrs.TextFont))       this.SetTextFont( aAttrs.TextFont );
  if (xDef(aAttrs.TextSize))       this.SetTextSize( aAttrs.TextSize );
  if (xDef(aAttrs.TextRotation))   this.SetTextRotation( aAttrs.TextRotation );
  if (xDef(aAttrs.TextColor))      this.SetTextColor( aAttrs.TextColor );
  if (xDef(aAttrs.FontStyle))      this.SetFontStyle( aAttrs.FontStyle );
  if (xDef(aAttrs.FontWeight))     this.SetFontWeight( aAttrs.FontWeight );
  if (xDef(aAttrs.TextHAlign))     this.SetTextHAlign( aAttrs.TextHAlign );
  if (xDef(aAttrs.TextVAlign))     this.SetTextVAlign( aAttrs.TextVAlign );
  if (xDef(aAttrs.TextHPad))       this.SetTextPadding( aAttrs.TextHPad, this.TextVPad );
  if (xDef(aAttrs.TextVPad))       this.SetTextPadding( this.TextHPad, aAttrs.TextVPad );
  if (xDef(aAttrs.LineHeight))     this.SetLineHeight( aAttrs.LineHeight );
}

JsGraph.prototype.SaveAttrs = function() {
  this.SavedAttrs = this.GetAttrs();
}

JsGraph.prototype.RestoreAttrs = function() {
  if (!this.SavedAttrs) return;
  this.SetAttrs( this.SavedAttrs );
}

JsGraph.prototype.SaveDefaultAttrs = function() {
  // private function
  this.SavedDefaultAttrs = this.GetAttrs();
}

JsGraph.prototype.ResetAttrs = function() {
  // private function
  this.SetAttrs( this.SavedDefaultAttrs );
}

// Utility functions

JsGraph.prototype.BoxWHOverlapping = function( aBox1, aBox2 ) {
  // aBox1, aBox2: JsgRect
  // returns true if boxes overlap
  if (!aBox1 || !aBox2) return false;
  var xmin1 = aBox1.x;
  var xmax1 = aBox1.x + aBox1.w;
  if (xmin1 > xmax1) { var tmp = xmin1; xmin1 = xmax1; xmax1 = tmp; }
  var xmin2 = aBox2.x;
  var xmax2 = aBox2.x + aBox2.w;
  if (xmin2 > xmax2) { var tmp = xmin2; xmin2 = xmax2; xmax2 = tmp; }
  if (xmax1 < xmin2 || xmax2 < xmin1) return false;
  var ymin1 = aBox1.y;
  var ymax1 = aBox1.y + aBox1.h;
  if (ymin1 > ymax1) { var tmp = ymin1; ymin1 = ymax1; ymax1 = tmp; }
  var ymin2 = aBox2.y;
  var ymax2 = aBox2.y + aBox2.h;
  if (ymin2 > ymax2) { var tmp = ymin2; ymin2 = ymax2; ymax2 = tmp; }
  if (ymax1 < ymin2 || ymax2 < ymin1) return false;
  return true;
}

JsGraph.prototype.MapToRange = function( val, range ) {
  // maps val to the range (0..range]
  var absVal = Math.abs(val);
  var n = Math.floor( absVal / range );
  var newVal = absVal - n * range;
  if (val < 0) {
    newVal = range - newVal;
    if (newVal >= range) newVal -= range;
  } else {
    if (newVal < 0) newVal += range;
  }
  return newVal;
}

JsGraph.prototype.NormalizeAngles = function( angles ) {
  // angles = { delta, start, end }
  // maps angles.start and angles.end to range [-2Pi..2Pi] so
  // that angles.end can be reached from angles.start in direction angles.delta
  // and maximal difference between angles is 2Pi
  // note: aligned angles correspond to an arc of lengt zero, not a circle!
  var Pi2 = Math.PI * 2;
  if (angles.delta >= 0) {
    var angleDiff = angles.end - angles.start;
    if (angleDiff > 0) {
      // angleDiff > 0 && delta > 0
      if (angleDiff > Pi2) angleDiff = Pi2;
      angles.start = this.MapToRange( angles.start, Pi2 );
      angles.end = angles.start + angleDiff;
      if (angles.end > Pi2) {
        angles.start -= Pi2;
        angles.end -= Pi2;
      }
    } else {
      // angleDiff < 0 && delta > 0
      angles.start = this.MapToRange( angles.start, Pi2 );
      angles.end = this.MapToRange( angles.end, Pi2 );
      if (angles.start > angles.end) angles.start -= Pi2;
    }
  } else {
    // delta < 0
    var angleDiff = angles.end - angles.start;
    if (angleDiff < 0) {
      // angleDiff < 0 && delta < 0
      if (angleDiff < -Pi2) angleDiff = -Pi2;
      angles.start = this.MapToRange( angles.start, Pi2 );
      angles.end = angles.start + angleDiff;
    } else {
      // angleDiff > 0 && delta < 0
      angles.start = this.MapToRange( angles.start, Pi2 );
      angles.end = this.MapToRange( angles.end, Pi2 );
      if (angles.end > angles.start) angles.end -= Pi2;
    }
  }
}

JsGraph.prototype.NormalizeAngle = function( angle ) {
  return this.MapToRange( angle, 2*Math.PI );
}

JsGraph.prototype.CompDeltaAngle = function( radius, precision ) {
  // radius > 0, precision > 0
  // returns a delta angle > 0 in range (Pi/4..Pi/MaxCurveSegments), so
  // that the pixel error for an arc with radius is less than precision and
  // angle is a an integer fraction of Pi/2.

  var da = 2 * Math.acos( (radius - precision) / radius );
  da = (Math.PI / 2) / (Math.floor( Math.PI / 2 / da ) + 1);
  if (da > Math.PI / 4) da = Math.PI / 4;
  if (this.MaxCurveSegments > 0 && da < Math.PI / this.MaxCurveSegments) da = Math.PI / this.MaxCurveSegments;
  //var nSeg = Math.PI / da * 2; // debug
  return da;
}

JsGraph.prototype.MakeUnityArcPolygon = function( aAngles ) {
  // computes an unity arc from start to end angle with delta increment and direction
  // aAngles = { delta, start, end }; use this.NormalizeAngles() for appropriate angles
  // returns this.WorkPoly: JsgPolygon
  // note: arc points are aligned to angles 0, Pi/2, Pi, 3/2Pi

  var poly = this.WorkPoly.Reset();
  var sin = Math.sin;
  var cos = Math.cos;
  if (aAngles.delta > 0) {
    var delta = aAngles.delta - this.MapToRange( aAngles.start, aAngles.delta );
    if (delta == 0) delta = aAngles.delta;
    var currAng = aAngles.start;
    var lastAng = aAngles.end - aAngles.delta/1000;
    while (currAng < lastAng) {
      poly.AddPoint( cos(currAng), sin(currAng) );
      currAng += delta;
      delta = aAngles.delta;
    }
    poly.AddPoint( cos(aAngles.end), sin(aAngles.end) );
  } else if (aAngles.delta < 0) {
    var delta = - this.MapToRange( aAngles.start, -aAngles.delta );
    if (delta == 0) delta = aAngles.delta;
    var currAng = aAngles.start;
    var lastAng = aAngles.end + aAngles.delta/1000;
    while (currAng > lastAng) {
      poly.AddPoint( cos(currAng), sin(currAng) );
      currAng += delta;
      delta = aAngles.delta;
    }
    poly.AddPoint( cos(aAngles.end), sin(aAngles.end) );
  }
  return poly;
}

// Styles

JsGraph.prototype.SetAlpha = function( a ) {
  // a: number 0..1, 0 = invisible, 1 = not tranparent
  this.Alpha = this.MinMaxSize( xDefNum( a, 1 ), 0, 1 );
  this.Context2D.globalAlpha = this.Alpha;
}

JsGraph.prototype.SetLineJoin = function( j ) {
  // j: 'miter', 'round', 'bevel' (Default 'miter')
  this.LineJoin = j;
  this.Context2D.lineJoin = j;
}

JsGraph.prototype.SetLineCap = function( c ) {
  // c: 'butt', 'round', 'square' (Default 'butt')
  this.LineCap = c;
  this.Context2D.lineCap = c;
}

JsGraph.prototype.SetLineAttr = function( color, width ) {
  // color: string CSS: 'red', '#f00', '#ff0000' or JsgGradient
  // width: int >= 0
  if (xAny(color)) this.SetColor( color );
  if (xAny(width)) this.SetLineWidth( width );
}

JsGraph.prototype.SetAreaAttr = function( bgColor, borderColor, borderWidth ) {
  // bgColor: string CSS: 'red', '#f00', '#ff0000' or JsgGradient
  // borderColor: string CSS: 'red', '#f00', '#ff0000'
  // borderWidth: int >= 0
  if (xAny(bgColor))     this.SetBgColor( bgColor );
  if (xAny(borderColor)) this.SetColor( borderColor );
  if (xAny(borderWidth)) this.SetLineWidth( borderWidth );
}

JsGraph.prototype.SetMarkerAttr = function( aSymbolName, size, borderColor, bgColor, borderWidth ) {
  // aSymbolName: string: 'ArrowLeft'...'Star'
  // size: real or int marker size in pixel
  // bgColor: string CSS: 'red', '#f00', '#ff0000' or JsgGradient
  // borderColor: string CSS: 'red', '#f00', '#ff0000'
  // borderWidth: int >= 0
  if (xAny(aSymbolName)) this.SetMarkerSymbol( aSymbolName );
  if (xAny(size))        this.SetMarkerSize( size );
  this.SetAreaAttr( bgColor, borderColor, borderWidth );
}

JsGraph.prototype.SetTextAttr = function( aFont, aSize, aColor, aWeight, aStyle, aHAlign, aVAlign, aHPad, aVPad, aRot ) {
  if (xAny(aFont))   this.SetTextFont( aFont );
  if (xAny(aSize))   this.SetTextSize( aSize );
  if (xAny(aRot))    this.SetTextRotation( aRot );
  if (xAny(aColor))  this.SetTextColor( aColor );
  if (xAny(aWeight)) this.SetFontWeight( aWeight );
  if (xAny(aStyle))  this.SetFontStyle( aStyle );
  if (xAny(aHAlign)) this.SetTextHAlign( aHAlign );
  if (xAny(aVAlign)) this.SetTextVAlign( aVAlign );
  if (xAny(aHPad))   this.SetTextPadding( aHPad, aVPad );
}

JsGraph.prototype.ClearTextAttr = function( ) {
  this.SetTextAttr( '', 0, '', '', '', '', '', 0, 0 );
  this.SetLineHeight( -1 );
}

JsGraph.prototype.SetColor = function( color ) {
  // color: string Css: 'red', '#ff0000', 'rgb(...)', 'rgba(...)' or JsgColor
  color = xDefAny( color, this.SavedDefaultAttrs.Color );
  if (JsgColor.Ok(color)) color = JsgColor.ToString(color);
  this.Color = color;
  this.Context2D.strokeStyle = this.Color;
}

JsGraph.prototype.SetBgColor = function( color ) {
  // color: string Css: 'red', '#ff0000' or JsgColor or JsgGradient
  color = xDefAny( color, this.SavedDefaultAttrs.BgColor );
  if (JsgColor.Ok(color)) color = JsgColor.ToString(color);
  if (xStr(color)) {
    this.BgColor = color;
    this.BgGradient = null;
    this.Context2D.fillStyle = this.BgColor;
  } else if (JsgGradient.Ok(color)) {
    this.BgGradient = color;
    this.Context2D.fillStyle = color.CanvasGradient;
  }
}

JsGraph.prototype.CreateLinearGradient = function( aGradientDef ) {
  // aGradientDef = { X1, Y1, X2, Y2, Stops: [ { Pos, Color }, ... ] }
  // returns JsgGradient of Type = 'linear'
  aGradientDef.X1 = xDefNum( aGradientDef.X1, 0 );
  aGradientDef.Y1 = xDefNum( aGradientDef.Y1, 0 );
  aGradientDef.X2 = xDefNum( aGradientDef.X2, aGradientDef.X1 );
  aGradientDef.Y2 = xDefNum( aGradientDef.Y2, aGradientDef.Y1 );
  aGradientDef.Stops = xArray(aGradientDef.Stops) ? aGradientDef.Stops : [];
  var ctr = this.CurrTrans;
  ctr.ObjTransXY2( this.GetObjTrans(), aGradientDef.X1, aGradientDef.Y1, aGradientDef.X2, aGradientDef.Y2 );
  var grad = this.Context2D.createLinearGradient( ctr.x1, ctr.y1, ctr.x2, ctr.y2 );
  var stops = aGradientDef.Stops;
  var last = stops.length-1;
  for (var i = 0; i <= last; i++) {
    var color = xDefAny( stops[i].Color, 'gray' );
    if (JsgColor.Ok(color)) color = JsgColor.ToString(color);
    grad.addColorStop( xDefNum( stops[i].Pos, i/last ), color );
  }
  return new JsgGradient( 'linear', grad, aGradientDef );
}

JsGraph.prototype.SetLinearGradientGeom = function( aLinearGradient, aGeom ) {
  // aGeom = { X1, Y1, X2, Y2 }
  var gradDef = aLinearGradient.GradientDef;
  gradDef.X1 = xDefNum( aGeom.X1, gradDef.X1 );
  gradDef.Y1 = xDefNum( aGeom.Y1, gradDef.Y1 );
  gradDef.X2 = xDefNum( aGeom.X2, gradDef.X2 );
  gradDef.Y2 = xDefNum( aGeom.Y2, gradDef.Y2 );
  var ctr = this.CurrTrans;
  ctr.ObjTransXY2( this.GetObjTrans(), gradDef.X1, gradDef.Y1, gradDef.X2, gradDef.Y2 );
  var grad = this.Context2D.createLinearGradient( ctr.x1, ctr.y1, ctr.x2, ctr.y2 );
  var stops = gradDef.Stops;
  var last = stops.length-1;
  for (var i = 0; i <= last; i++) {
    var color = xDefAny( stops[i].Color, 'gray' );
    if (JsgColor.Ok(color)) color = JsgColor.ToString(color);
    grad.addColorStop( xDefNum( stops[i].Pos, i/last ), color );
  }
  aLinearGradient.CanvasGradient = grad;
  if (aLinearGradient == this.BgGradient) {
    this.Context2D.fillStyle = this.BgGradient.CanvasGradient;
  }
}

JsGraph.prototype.CreateRadialGradient = function( aGradientDef ) {
  // aGradientDef = { X1, Y1, R1, X2, Y2, R2, Stops: [ { Pos, Color }, ... ] }
  // returns JsgGradient of Type = 'radial'
  aGradientDef.X1 = xDefNum( aGradientDef.X1, 0 );
  aGradientDef.Y1 = xDefNum( aGradientDef.Y1, 0 );
  aGradientDef.R1 = xDefNum( aGradientDef.R1, 0 );
  aGradientDef.X2 = xDefNum( aGradientDef.X2, aGradientDef.X1 );
  aGradientDef.Y2 = xDefNum( aGradientDef.Y2, aGradientDef.Y1 );
  aGradientDef.R2 = xDefNum( aGradientDef.R2, aGradientDef.R1 + 100 );
  var ctr = this.CurrTrans;
  var otrScaling = this.ObjTrans.MaxScaling();
  ctr.ObjTransXY2( this.GetObjTrans(), aGradientDef.X1, aGradientDef.Y1, aGradientDef.X2, aGradientDef.Y2 );
  var cnvsR1 = ctr.ScaleX * otrScaling * aGradientDef.R1;
  var cnvsR2 = ctr.ScaleX * otrScaling * aGradientDef.R2;
  var grad = this.Context2D.createRadialGradient( ctr.x1, ctr.y1, cnvsR1, ctr.x2, ctr.y2, cnvsR2 );
  var stops = xDefArray( aGradientDef.Stops, [] );
  var last = stops.length-1;
  for (var i = 0; i <= last; i++) {
    var color = xDefAny( stops[i].Color, 'gray' );
    if (JsgColor.Ok(color)) color = JsgColor.ToString(color);
    grad.addColorStop( xDefNum( stops[i].Pos, i/last ), color );
  }
  return new JsgGradient( 'radial', grad, aGradientDef );
}

JsGraph.prototype.SetRadialGradientGeom = function( aRadialGradient, aGeom ) {
  // aGeom = { X1, Y1, R1, X2, Y2, R2 }
  var gradDef = aRadialGradient.GradientDef;
  gradDef.X1 = xDefNum( aGeom.X1, gradDef.X1 );
  gradDef.Y1 = xDefNum( aGeom.Y1, gradDef.Y1 );
  gradDef.R1 = xDefNum( aGeom.R1, gradDef.R1 );
  gradDef.X2 = xDefNum( aGeom.X2, gradDef.X2 );
  gradDef.Y2 = xDefNum( aGeom.Y2, gradDef.Y2 );
  gradDef.R2 = xDefNum( aGeom.R2, gradDef.R2 );
  var ctr = this.CurrTrans;
  var otrScaling = this.ObjTrans.MaxScaling();
  ctr.ObjTransXY2( this.GetObjTrans(), gradDef.X1, gradDef.Y1, gradDef.X2, gradDef.Y2 );
  var cnvsR1 = ctr.ScaleX * otrScaling * gradDef.R1;
  var cnvsR2 = ctr.ScaleX * otrScaling * gradDef.R2;
  var grad = this.Context2D.createRadialGradient( ctr.x1, ctr.y1, cnvsR1, ctr.x2, ctr.y2, cnvsR2 );
  var stops = gradDef.Stops;
  var last = stops.length-1;
  for (var i = 0; i <= last; i++) {
    var color = xDefAny( stops[i].Color, 'gray' );
    if (JsgColor.Ok(color)) color = JsgColor.ToString(color);
    grad.addColorStop( xDefNum( stops[i].Pos, i/last ), color );
  }
  aRadialGradient.CanvasGradient = grad;
  if (aRadialGradient == this.BgGradient) {
    this.Context2D.fillStyle = this.BgGradient.CanvasGradient;
  }
}

JsGraph.prototype.SetLineWidth = function( width ) {
  // width in pixel: Number >= 0; if 0 then width internal width is set so, that 1 pixel width is drawn on all scales
  width = xDefNum( width, this.SavedDefaultAttrs.LineWidth );
  if (width < 0) width = 0;
  this.LineWidth = width;
  if (this.AutoScalePix && width > 0) width = this.ScalePixMin( width, this.MinLineWidth, this.ScalePixInt );
  if (width == 0) width = 1 / this.DevicePixelRatio;
  this.Context2D.lineWidth = width;
}

JsGraph.prototype.SetTextClass = function( aClassName, aClearAttrs ) {
  aClassName = xDefStr( aClassName, '' );
  aClearAttrs = xDefBool( aClearAttrs, false );
  if (aClearAttrs) this.ClearTextAttr();
  this.TextClass = aClassName;
  this.HtmlTextHandler.TextClass = aClassName;
}

JsGraph.prototype.SetTextRendering = function( aRenderMethod ) {
  // aRenderMethod: String = canvas, html
  var oldRendering = this.TextRendering;
  if (!(this.Context2D.strokeText && this.Context2D.fillText)) aRenderMethod = 'html';
  if (aRenderMethod == 'html') {
    this.TextRendering = 'html';
    this.TextCanvasRendering = false;
  } else {
    this.TextRendering = 'canvas';
    this.TextCanvasRendering = true;
  }
  return oldRendering;
}

JsGraph.prototype.SetTextFont = function( aFont ) {
  // set aFont = '' if fontStyle is defined in TextClass or in another CSS
  this.TextFont = xDefStr( aFont, this.SavedDefaultAttrs.TextFont );
  this.HtmlTextHandler.TextStyles.fontFamily = this.TextFont;
  this.CTextCurrFontVers++;
}

JsGraph.prototype.SetTextSize = function( aSize ) {
  // aSize in pixel: Number
  aSize = xDefNum( aSize, this.SavedDefaultAttrs.TextSize );
  if (aSize < 0) aSize = 0;
  this.TextSize = aSize;
  if (aSize > 0) {
    if (this.AutoScalePix) aSize = this.ScalePixMin( aSize, this.MinTextSize, this.ScalePixInt );
    this.HtmlTextHandler.TextStyles.fontSize = aSize + 'px';
    this.CanvasFontSize = aSize;
  } else {
    this.HtmlTextHandler.TextStyles.fontSize = '';
    this.CanvasFontSize = 15;
  }
  this.CTextCurrFontVers++;
}

JsGraph.prototype.SetTextRotation = function( aRot ) {
  aRot = xDefNum( aRot, this.SavedDefaultAttrs.TextRotation );
  this.TextRotation = aRot;
}

JsGraph.prototype.SetTextColor = function( color ) {
  // color: string Css: 'red', '#ff0000', 'rgb(...)', 'rgba(...)' or JsgColor
  // set color = '' if color is set in TextClass or other CSS
  color = xDefAny( color, this.SavedDefaultAttrs.TextColor );
  if (JsgColor.Ok(color)) color = JsgColor.ToString(color);
  this.TextColor = color;
  this.HtmlTextHandler.TextStyles.color = this.TextColor;
}

JsGraph.prototype.SetLineHeight = function( aHeight ) {
  // aHeight: Number (Pixels); aHeight = 0 -> '100%'
  // set aHeight = -1 if lineHeight is set in TextClass or other CSS
  aHeight = xDefNum( aHeight, this.SavedDefaultAttrs.LineHeight );
  if (aHeight < 0) aHeight = -1;
  this.LineHeight = aHeight;
  if (aHeight > 0) {
    if (this.AutoScalePix) aHeight = this.ScalePix( aHeight, this.ScalePixInt );
    this.HtmlTextHandler.TextStyles.lineHeight = aHeight + 'px';
    this.CanvasLineHeight = aHeight;
  } else if (aHeight == 0) {
    this.HtmlTextHandler.TextStyles.lineHeight = '100%';
    this.CanvasLineHeight = 0;
  } else {
    this.HtmlTextHandler.TextStyles.lineHeight = '';
    this.CanvasLineHeight = 0;
  }
  this.CTextCurrFontVers++;
}

JsGraph.prototype.SetFontStyle = function( aStyle, aWeight ) {
  // aStyle = '', 'normal', 'italic'
  // set aStyle = '' if fontStyle is defined in TextClass or other CSS
  aStyle = xDefStr( aStyle, this.SavedDefaultAttrs.FontStyle );
  this.FontStyle = aStyle;
  this.HtmlTextHandler.TextStyles.fontStyle = aStyle;
  if (xStr(aWeight)) this.SetFontWeight(aWeight);
  this.CTextCurrFontVers++;
}

JsGraph.prototype.SetFontWeight = function( aWeight, aStyle ) {
  // aWeigth = '', 'normal', 'bold'
  // set aWeight = '' if fontWeight is defined in TextClass or other CSS
  aWeight = xDefStr( aWeight, this.SavedDefaultAttrs.FontWeight );
  this.FontWeight = aWeight;
  this.HtmlTextHandler.TextStyles.fontWeight = aWeight;
  if (xStr(aStyle)) this.SetFontStyle(aStyle);
  this.CTextCurrFontVers++;
}

JsGraph.prototype.SetTextAlign = function( aHAlign, aVAlign ) {
  if (xStr(aHAlign)) this.SetTextHAlign( aHAlign );
  if (xStr(aVAlign)) this.SetTextVAlign( aVAlign );
}

JsGraph.prototype.SetTextHAlign = function( aAlign ) {
  // aAlign: string: 'left', 'center', 'right', 'justify'
  aAlign = xDefStr( aAlign, this.SavedDefaultAttrs.TextHAlign );
  this.TextHAlign = aAlign;
  this.HtmlTextHandler.TextStyles.textAlign = aAlign;
  if (aAlign == 'justify') aAlign = 'center';
  this.HtmlTextHandler.TextHAlign = aAlign;
}

JsGraph.prototype.SetTextVAlign = function( aAlign ) {
  // aAlign: string: 'top', 'middle', 'bottom'
  aAlign = xDefStr( aAlign, this.SavedDefaultAttrs.TextVAlign );
  this.TextVAlign = aAlign;
  this.HtmlTextHandler.TextVAlign = aAlign;
}

JsGraph.prototype.SetTextPadding = function( aHPad, aVPad ) {
  aHPad = xDefNum( aHPad, 0 );
  aVPad = xDefNum( aVPad, aHPad );
  this.TextHPad = aHPad;
  this.TextVPad = aVPad;
  if (this.AutoScalePix) {
    aHPad = this.ScalePix( aHPad, this.ScalePixInt );
    aVPad = this.ScalePix( aVPad, this.ScalePixInt );
  }
  this.CanvasTextHPad = aHPad;
  this.HtmlTextHandler.TextHPad = aHPad;
  this.CanvasTextVPad = aVPad;
  this.HtmlTextHandler.TextVPad = aVPad;
}

JsGraph.prototype.SetMarkerSymbol = function( aSymbolName ) {
  aSymbolName = xDefStr( aSymbolName, this.SavedDefaultAttrs.MarkerSymbol );
  if (!xDef(this.Markers[aSymbolName])) return;
  this.MarkerSymbol = aSymbolName;
}

JsGraph.prototype.SetMarkerSize = function( aSize ) {
  aSize = xDefNum( aSize, this.SavedDefaultAttrs.MarkerSize );
  if (aSize < 0) aSize = 0;
  this.MarkerSize = aSize;
  if (this.AutoScalePix) aSize = this.ScalePixMin( aSize, this.MinMarkerSize, this.ScalePixInt );
  this.DriverMarkerSize = aSize;
}

// path functions

JsGraph.prototype.OpenPath = function( penUp ) {
  this.ClearPath();
  this.IsPathOpen = true;
  if (xDef(penUp)) this.PenDown = !penUp;
}

JsGraph.prototype.ClearPath = function() {
  this.CurrPathSize = 0;
  this.CommonPathElePoolSize = 0;
  this.ArcPathElePoolSize = 0;
  this.BezierPathElePoolSize = 0;
  this.IsPathOpen = false;
}

JsGraph.prototype.Path = function( mode, clear ) {
  // draws a path according to mode
  // mode: 1 -> draw border, 2 -> fill, 3 -> border and fill, 4 -> close path, default = 1
  mode = xDefNum( mode, 1 );
  clear = xDefBool( clear, true );
  if (mode & 2) {
    if (this.DriverDrawPath( false, true )) {
      this.Context2D.fill();
    }
  }
  if (mode & 1) {
    if (this.DriverDrawPath( (mode&4) > 0, false )) {
      this.Context2D.stroke();
    }
  }
  if (clear) this.ClearPath();
}

JsGraph.prototype.Clip = function( clear ) {
  // skips resetting attrs here if this.IsResttingAll is true
  clear = xDefBool( clear, true );
  // disable clipping for this function
  var oldClipEnabled = this.GraphClipEnabled;
  this.GraphClipEnabled = false;

  if (this.DriverDrawPath( false, false )) {
    this.Context2D.restore();
    this.Context2D.save();
    this.Context2D.clip();
  }
  if (clear) this.ClearPath();

  this.GraphClipEnabled = oldClipEnabled;
  // reset attrs in driver to current attrs
  if (!this.IsResettingAll) this.SetDriverAttrs();
  // Init GraphClipInnerRange
  this.ResetInnerClipRange();
}

JsGraph.prototype.NewCommonPathEle = function( t, x, y ) {
  var ele, pool = this.CommonPathElePool;
  if (this.CommonPathElePoolSize < pool.length) {
    ele = pool[this.CommonPathElePoolSize++];
    ele.t = t; ele.x = x; ele.y = y;
  } else {
    ele = { t: t, x: x, y: y };
    pool[this.CommonPathElePoolSize++] = ele;
  }
  return ele;
}

JsGraph.prototype.NewArcPathEle = function( x, y, r, sa, ea, cc ) {
  var ele, pool = this.ArcPathElePool;
  if (this.ArcPathElePoolSize < pool.length) {
    ele = pool[this.ArcPathElePoolSize++];
    ele.t = 3; ele.x = x; ele.y = y; ele.r = r; ele.sa = sa; ele.ea = ea; ele.cc = cc;
  } else {
    ele = { t: 3, x: x, y: y, r: r, sa: sa, ea: ea, cc: cc };
    pool[this.ArcPathElePoolSize++] = ele;
  }
  return ele;
}

JsGraph.prototype.NewBezierPathEle = function( cx1, cy1, cx2, cy2, ex, ey ) {
  var ele, pool = this.BezierPathElePool;
  if (this.BezierPathElePoolSize < pool.length) {
    ele = pool[this.BezierPathElePoolSize++];
    ele.t = 4; ele.cx1 = cx1; ele.cy1 = cy1; ele.cx2 = cx2; ele.cy2 = cy2; ele.ex = ex; ele.ey = ey;
  } else {
    ele = { t: 4, cx1: cx1, cy1: cy1, cx2: cx2, cy2: cy2, ex: ex, ey: ey };
    pool[this.BezierPathElePoolSize++] = ele;
  }
  return ele;
}


// Element-Codes: 0 = close; 1 = lineTo; 2 = moveTo; 3 = arc

JsGraph.prototype.ClosePath = function() {
  this.CurrPath[this.CurrPathSize++] = this.NewCommonPathEle( 0, 0, 0 );
}

JsGraph.prototype.PathMoveTo = function( x, y ) {
  this.CurrPath[this.CurrPathSize++] = this.NewCommonPathEle( 2, x, y );
}

JsGraph.prototype.PathLineTo = function( x, y ) {
  this.CurrPath[this.CurrPathSize++] = this.NewCommonPathEle( 1, x, y );
}

JsGraph.prototype.PathAppendArc = function( x, y, r, sa, ea, cc, cont, close ) {
  var arcStartX = x + r * Math.cos( sa );
  var arcStartY = y + r * Math.sin( sa );
  if (!cont) {
    this.PathMoveTo( arcStartX, arcStartY );
  }

  this.CurrPath[this.CurrPathSize++] = this.NewArcPathEle( x, y, r, sa, ea, cc );

  if (close) {
    this.PathLineTo( arcStartX, arcStartY );
  }
}

JsGraph.prototype.PathAppendPolygon = function( xArray, yArray, cont, close, size ) {
  // note: polygon is transformed here to canvas coordinates!
  // cont -> continue last path without move
  var ctr = this.CurrTrans;
  var otr = this.GetObjTrans();
  ctr.ObjTransXY( otr, xArray[0], yArray[0] );
  if (cont) {
    this.PathLineTo( ctr.x, ctr.y );
  } else {
    this.PathMoveTo( ctr.x, ctr.y );
  }

  size = xDefNum( size, xArray.length );
  for (var i = 1; i < size; i++ ) {
    ctr.ObjTransXY( otr, xArray[i], yArray[i] );
    this.PathLineTo( ctr.x, ctr.y );
  }

  if (close) {
    if (xArray[0] != xArray[xArray.length-1] || yArray[0] != yArray[yArray.length-1]) {
      ctr.ObjTransXY( otr, xArray[0], yArray[0] );
      this.PathLineTo( ctr.x, ctr.y );
    }
  }
}

JsGraph.prototype.PathAppendBezierTo = function( cx1, cy1, cx2, cy2, ex, ey ) {
  // note: points in canvas coordinates
  // first point of bezier must be inserted with PathMoveTo or PathLineTo
  this.CurrPath[this.CurrPathSize++] = this.NewBezierPathEle( cx1, cy1, cx2, cy2, ex, ey );
}

JsGraph.prototype.DriverPathPoly = new JsgPolygon( false, 'JsGraph.DriverPathPoly' );
JsGraph.prototype.DriverPathClipPoly = new JsgPolygon( false, 'JsGraph.DrverPathClipPoly' );
JsGraph.prototype.DriverPathClipPolyList = new JsgPolygonList( false, 'JsGraph.DriverPathClipPolyList' );

JsGraph.prototype.DriverDrawPath = function( close, areaMode ) {
  // returns true if some path is put to context, false if all is clipped

  var plen = this.CurrPathSize;
  if (!this.GraphClipEnabled) {
    return this.DriverDrawPathPart( 0, plen, true, close );
  }

  if (areaMode) {

    var quadrant = this.GetPathClipQuadrant( 0, plen );
    if (quadrant == 0) {
      // full inside -> no clipping
      return this.DriverDrawPathPart( 0, plen, true, close );
    } else if (quadrant == 1) {
      // full outside -> no drawing
      return false;
    }
    // clip area path
    var poly = this.DriverGetPathPoly( 0, 0, false );
    var polyClipped = this.ClipPolygonArea( poly,
      this.GraphClipInnerXmin, this.GraphClipInnerXmax, this.GraphClipInnerYmin, this.GraphClipInnerYmax,
      this.DriverPathClipPoly
    );
    return this.DriverDrawPathPoly( polyClipped, true, false );

  } else {

    // clip and draw path as contour set
    var last;
    var from = 0;
    var newPath = true;
    while ( (last = this.DriverNextPathEnd(from+1)) > 0 ) {

      if (last - from > 1) {
        var closeLast = (last == plen && close);
        var quadrant = this.GetPathClipQuadrant( from, last );
        if (quadrant == 0) {

          // full inside -> no clipping
          if (this.DriverDrawPathPart( from, last, newPath, closeLast )) {
            newPath = false;
          }

        } else if (quadrant == 2) {

          // clip path contour part
          var poly = this.DriverGetPathPoly( from, last, closeLast );

          var polyListClipped = this.ClipPolygon( poly,
            this.GraphClipInnerXmin, this.GraphClipInnerXmax, this.GraphClipInnerYmin, this.GraphClipInnerYmax, this.Context2D.lineWidth/2,
            this.DriverPathClipPolyList
          );

          if (polyListClipped.Size > 0) {
            for (var i = 0; i < polyListClipped.Size; i++) {
              var polyClipped = polyListClipped.PolyList[i];
              if (this.DriverDrawPathPoly( polyClipped, newPath, false )) {
                newPath = false;
              }
            }
          }

        } // else full outside -> no drawing
      }
      from = last;

    } // end while

    return !newPath;
  }
}

JsGraph.prototype.DriverGetPathPoly = function( from, to, closeLast ) {
  // creates a polygon from all path elements between from until to
  // if to = 0 then the whole path is fetched
  // the last sub area is closed and the first point is added to the end if closeLast is true
  // no duplicate points are addet

  var poly = this.DriverPathPoly.Reset();
  var p = this.CurrPath;
  var plen = this.CurrPathSize;
  var closeArea = false;
  if (to == 0) {
    from = 0;
    to = plen;
    closeArea = true;
  }
  var lastMoveIx = from;
  for (var i = from; i < to; i++) {
    var c = p[i];
    var t = c.t;
    if (t == 1) {
      // lineTo element
      poly.AddPoint( c.x, c.y );
    } else if (t == 2) {
      // moveTo:
      if (i > from) {
        if (p[i-1].t == 2) {
          // last element is moveTo: replace last moveTo with current moveTo
          poly.RemoveLastPoint();
        } else {
          // close last element
          var cl = p[lastMoveIx];
          poly.AddPoint( cl.x, cl.y );
        }
      }
      poly.AddPoint( c.x, c.y );
      lastMoveIx = i;
    } else if (t == 0) {
      // close path element
      var c = p[lastMoveIx];
      poly.AddPoint( c.x, c.y );
    } else if (t == 3) {
      // arc element
      var startAng = this.RadToAngle(c.sa);
      var endAng = this.RadToAngle(c.ea)
      var rad = c.cc ? -c.r : c.r;
      var ell = this.MakeEllipseArcPolygon( c.x, c.y, rad, c.r, 0, startAng, endAng );
      poly.AddPoly( ell );
    } else if (t == 4) {
      // bezier element
      var cprev = p[i-1];
      var bezier = this.MakeBezierPolygon( cprev.x, cprev.y, c.cx1, c.cy1, c.cx2, c.cy2, c.ex, c.ey, this.NumBezierSegments );
      poly.AddPoly( bezier );
    }
  }

  // close last area part from end to last moveTo and then connect last with first point
  if (closeArea || closeLast) {
    var px = p[lastMoveIx].x;
    var py = p[lastMoveIx].y;
    var last = poly.Size - 1;
    if (px != poly.X[last] || py != poly.Y[last] ) {
      poly.AddPoint( px, py );
    }
  }
  if (closeArea) {
    var px = p[0].x;
    var py = p[0].y;
    var last = poly.Size - 1;
    if (px != poly.X[last] || py != poly.Y[last] ) {
      poly.AddPoint( px, py );
    }
  }

  return poly;
}

JsGraph.prototype.DriverDrawPathPart = function( from, to, newPath, close ) {
  // returns true if some elements are put to context
  var p = this.CurrPath;
  var ctx = this.Context2D;
  if (newPath) ctx.beginPath();
  for (var i = from; i < to; i++) {
    var c = p[i];
    var t = c.t;
    if (t == 1) {
      ctx.lineTo( c.x, c.y );
    } else if (t == 2) {
      ctx.moveTo( c.x, c.y );
    } else if (t == 0) {
      ctx.closePath();
    } else if (t == 3) {
      ctx.arc( c.x, c.y, c.r, c.sa, c.ea, c.cc );
    } else if (t == 4) {
      ctx.bezierCurveTo( c.cx1, c.cy1, c.cx2, c.cy2, c.ex, c.ey );
    }
  }
  if (close) ctx.closePath();
  return to > from;
}

JsGraph.prototype.DriverDrawPathPoly = function( poly, newPath, close ) {
  // returns true if some elements are put to context
  // note: a new path is ony if return is true and newPath is true
  var size = poly.Size;
  if (size < 2) return false;
  var ctx = this.Context2D;
  var xs = poly.X;
  var ys = poly.Y;
  if (newPath) ctx.beginPath();
  ctx.moveTo( xs[0], ys[0] );
  for (var i = 1; i < size; i++) {
    ctx.lineTo( xs[i], ys[i] );
  }
  if (close) ctx.closePath();
  return true;
}

JsGraph.prototype.DriverNextPathEnd = function( from ) {
  // returns index of next path contour part starting at from
  // returns this.CurrPathSize if no path end (moveTo element) is found after from
  // returns -1 if from >= this.CurrPathSize
  var plen = this.CurrPathSize;
  if (from >= plen) return -1;
  var p = this.CurrPath;
  for (var i = from; i < plen; i++) {
    var c = p[i];
    var t = c.t;
    if (t == 2) {
      // moveTo marks begin of new contour
      return i;
    }
  }
  return plen;
}

JsGraph.prototype.GetPathClipQuadrant = function( from, to ) {
  // returns clip quadrant of path part between from until to
  // 0 -> full inside GraphClip inner range or crossing inner range and full inside outer range -> no clipping needet
  // 1 -> full outside inner range -> invisibe, skip drawing
  // 2 -> crossing inner and outer range -> clipping at GraphClip inner range needet

  function minmax( x, y ) {
    if (x < xmin) xmin = x;
    if (x > xmax) xmax = x;
    if (y < ymin) ymin = y;
    if (y > ymax) ymax = y;
  }

  // speed optimization: quick check wether path is full inside inner clip range
  if (this.DriverIsPathInsideRect( from, to, this.GraphClipInnerXmin, this.GraphClipInnerXmax, this.GraphClipInnerYmin, this.GraphClipInnerYmax )) {
    return 0;
  }

  // find bounding rectangle
  var xmin = this.GraphClipOuterXmax + 1000;
  var xmax = this.GraphClipOuterXmin - 1000;
  var ymin = this.GraphClipOuterYmax + 1000;
  var ymax = this.GraphClipOuterYmin - 1000;
  var p = this.CurrPath;
  for (var i = from; i < to; i++) {
    var c = p[i];
    var t = c.t;
    if (t == 1 || t == 2) {
      minmax( c.x, c.y );
    } else if (t == 3) {
      minmax( c.x-c.r, c.y-c.r );
      minmax( c.x+c.r, c.y+c.r );
    } else if (t == 4) {
      minmax( c.cx1, c.cy1 );
      minmax( c.cx2, c.cy2 );
      minmax( c.ex, c.ey );
    }
  }

  // check clip quadrant of bounding rectangle
  return this.GetRectClipQuadrant( xmin, xmax, ymin, ymax );
}

JsGraph.prototype.DriverIsPathInsideRect = function( from, to, xmin, xmax, ymin, ymax ) {
  // returns true if path is complete inside rectangle xmin..ymax
  var p = this.CurrPath;
  for (var i = from; i < to; i++) {
    var c = p[i];
    var t = c.t;
    if (t == 1 || t == 2) {
      if (c.x < xmin || c.x > xmax || c.y < ymin || c.y > ymax) return false;
    } else if (t == 3) {
      var x = c.x - c.r;
      var y = c.y - c.r;
      if (x < xmin || x > xmax || y < ymin || y > ymax) return false;
      var x = c.x + c.r;
      var y = c.y + c.r;
      if (x < xmin || x > xmax || y < ymin || y > ymax) return false;
    } else if (t == 4) {
      if (c.cx1 < xmin || c.cx1 > xmax || c.cy1 < ymin || c.cy1 > ymax) return false;
      if (c.cx2 < xmin || c.cx2 > xmax || c.cy2 < ymin || c.cy2 > ymax) return false;
      if (c.ex < xmin || c.ex > xmax || c.ey < ymin || c.ey > ymax) return false;
    }
  }
  return true;
}


// drawing primitives

JsGraph.prototype.PenUp = function() {
  this.PenDown = false;
}

JsGraph.prototype.MoveTo = function( x, y ) {
  // or MoveTo( pt )
  // x, y: real coordinates
  // pt: JsgVect2
  if (JsgVect2.Ok(x)) return this.MoveTo( x[0], x[1] );
  this.LastX = x;
  this.LastY = y;
  if (this.IsPathOpen) {
    var ctr = this.CurrTrans;
    ctr.ObjTransXY( this.GetObjTrans(), x, y );
    this.PathMoveTo( ctr.x, ctr.y );
  }
  this.PenDown = true;
  return this;
}

JsGraph.prototype.LineTo = function( x, y ) {
  // or LineTo( pt )
  // x, y: real coordinates
  // pt: JsgVect2
  // if PenUp is called previously, this call is equivalent to MoveTo
  if (JsgVect2.Ok(x)) return this.LineTo( x[0], x[1] );
  var ctr = this.CurrTrans;
  if (this.IsPathOpen) {
    ctr.ObjTransXY( this.GetObjTrans(), x, y );
    if (this.PenDown) {
      this.PathLineTo( ctr.x, ctr.y );
    } else {
      this.PathMoveTo( ctr.x, ctr.y );
    }
  } else {
    if (this.PenDown) {
      this.WorkLineXArray[0] = this.LastX;
      this.WorkLineXArray[1] = x;
      this.WorkLineYArray[0] = this.LastY;
      this.WorkLineYArray[1] = y;
      this.DriverDrawPoly( this.WorkLineXArray, this.WorkLineYArray, 2, false, false );
    }
  }
  this.PenDown = true;
  this.LastX = x;
  this.LastY = y;
  return this;
}

JsGraph.prototype.WorkLineXArray = [ 0, 0 ];
JsGraph.prototype.WorkLineYArray = [ 0, 0 ];

JsGraph.prototype.Line = function( x1, y1, x2, y2, append ) {
  // or Line( pt1, pt2, append )
  // x1, y1, x2, y2: real coordinates
  // pt1, pt2: JsgVect2
  // append: bool; true -> append line to path and draw a line from last point in path to (x1,y1)
  if (JsgVect2.Ok(x1)) return this.Line( x1[0], x1[1], y1[0], y1[1], x2 );
  append = xDefBool( append, false );
  if (this.IsPathOpen) {
    var ctr = this.CurrTrans;
    ctr.ObjTransXY2( this.GetObjTrans(), x1, y1, x2, y2 );
    if (append) {
      this.PathLineTo( ctr.x1, ctr.y1 );
    } else {
      this.PathMoveTo( ctr.x1, ctr.y1 );
    }
    this.PathLineTo( ctr.x2, ctr.y2 );
  } else {
    this.WorkLineXArray[0] = x1;
    this.WorkLineXArray[1] = x2;
    this.WorkLineYArray[0] = y1;
    this.WorkLineYArray[1] = y2;
    this.DriverDrawPoly( this.WorkLineXArray, this.WorkLineYArray, 2, false, false );
  }
  this.PenDown = true;
  this.LastX = x2;
  this.LastY = y2;
  return this;
}

JsGraph.prototype.Arrow = function( x1, y1, x2, y2, variant, mode, sym1, sym2 ) {
  // or Arrow( pt1, pt2, variant, mode )
  // x1, y1, x2, y2: real coordinates
  // pt1, pt2: JsgVect2
  // variant: bitmask (default = 1): 1 -> symbol at end, 2 -> symbol at start, 4 -> hide line, 8 -> shorten line
  // mode: bitmask (default = 3): 1 -> border, 2 -> fill, 4 -> not used, 8 -> append line to path
  // if sym1 is defined then SetMarkerSymbol(sym1) is called for start and end symbol
  // if sym2 is defined then SetMarkerSymbol(sym2) is called for end symbol
  // draws a line with arror markers on one or both ends.
  // Use SetMarkerAttr to set marker and line attributes

  if (JsgVect2.Ok(x1)) return this.Arrow( x1[0], x1[1], y1[0], y1[1], x2, y2 );

  variant = xDefNum( variant, 1 );
  mode = xDefNum( mode, 1+2 );

  var ctr = this.CurrTrans;
  ctr.ObjTransXY2( this.GetObjTrans(), x1, y1, x2, y2 );

  // if path open and mode = append, draw line from last point to startpoint of arrow
  if (this.IsPathOpen && (mode & 8)) {
    this.PathLineTo( ctr.x1, ctr.y1 );
  }

  if (x1 == x2 && y1 == y2) {
    if (this.IsPathOpen) {
      this.PathMoveTo( ctr.x2, ctr.y2 );
    }
    this.PenDown = true;
    this.LastX = x2;
    this.LastY = y2;
    return this;
  }

  var otr = this.ObjTrans;
  var cnvsX1 = ctr.x1, cnvsY1 = ctr.y1, cnvsX2 = ctr.x2, cnvsY2 = ctr.y2;
  otr.TransXY2( x1, y1, x2, y2 );
  var x1orig = otr.x1, y1orig = otr.y1, x2orig = otr.x2, y2orig = otr.y2;
  var x1corr = otr.x1, y1corr = otr.y1, x2corr = otr.x2, y2corr = otr.y2;
  var oldTransState = otr.Enable( false );

  if ((variant & 8) && (variant & 1)) {
    // shorten line end by 1/4 lineWidth
    var v = JsgVect2.New( cnvsX2-cnvsX1, cnvsY2-cnvsY1 );
    var vd = JsgVect2.Scale( JsgVect2.Norm( v ), -this.Context2D.lineWidth/2 );
    var vs = JsgVect2.Add( v, vd );
    if (JsgVect2.ScalarProd( vs, v ) <= 0) {
      // hide line
      variant |= 4;
    }
    x2corr = ctr.InvTransX( vs[0] + cnvsX1 );
    y2corr = ctr.InvTransY( vs[1] + cnvsY1 );
  }

  if ((variant & 8) && (variant & 2)) {
    // shorten line start by 1/4 lineWidth
    var v = JsgVect2.New( cnvsX1-cnvsX2, cnvsY1-cnvsY2 );
    var vd = JsgVect2.Scale( JsgVect2.Norm( v ), -this.Context2D.lineWidth/2 );
    var vs = JsgVect2.Add( v, vd );
    if (JsgVect2.ScalarProd( vs, v ) <= 0) {
      // hide line
      variant |= 4;
    }
    var x1corr = ctr.InvTransX( vs[0] + cnvsX2 );
    var y1corr = ctr.InvTransY( vs[1] + cnvsY2 );
  }

  if (!(variant & 4)) {
    // only draw line if it is after shortening not zero length and not inversed
    var drawit = true;
    if (variant & 8) {
      var v1 = JsgVect2.New( x2orig-x1orig, y2orig-y1orig );
      var v2 = JsgVect2.New( x2corr-x1corr, y2corr-y1corr );
      drawit = (JsgVect2.ScalarProd( v1, v2 ) > 0);
    }
    if (drawit) {
      this.Line( x1corr, y1corr, x2corr, y2corr );
    }
  }
  if (xStr(sym1)) this.SetMarkerSymbol( sym1 );
  if (variant & 2) {
    var mat = JsgMat2.RotatingToXY( cnvsX1-cnvsX2, cnvsY1-cnvsY2 );
    this.Marker( x1corr, y1corr, mode&3, mat );
  }
  if (xStr(sym2)) this.SetMarkerSymbol( sym2 );
  if (variant & 1) {
    var mat = JsgMat2.RotatingToXY( cnvsX2-cnvsX1, cnvsY2-cnvsY1 );
    this.Marker( x2corr, y2corr, mode&3, mat );
  }
  otr.Enable( oldTransState );

  if (this.IsPathOpen) {
    this.PathMoveTo( cnvsX2, cnvsY2 );
  }

  this.PenDown = true;
  this.LastX = x2;
  this.LastY = y2;
  return this;
}

JsGraph.prototype.PolygonArrow = function( xArray, yArray, variant, lineMode, arrowMode, size, sym1, sym2 ) {
  // or PolygonArrow( poly, variant, lineMode, arrowMode )
  //
  // variant: bitmask (default = 1): 1 -> symbol at end, 2 -> symbol at start, 4 -> hide line, 8 -> shorten line
  // lineMode: bitmask (default = 1): 1 -> border, 2 -> fill, 4 -> close polygon, 8 -> append line to path
  // arrowMode: bitmask (default = 3): 1 -> border, 2 -> fill
  // size -> specifies number of segments to draw from xArray and yArray; defaults to xArray.length
  // if sym1 is defined then SetMarkerSymbol(sym1) is called for start and end symbol
  // if sym2 is defined then SetMarkerSymbol(sym2) is called for end symbol
  // see Arrow() for description of arguments

  if (JsgPolygon.Ok(xArray)) return this.PolygonArrow( xArray.X, xArray.Y, yArray, variant, lineMode, xArray.Size );

  variant = xDefNum( variant, 1 );
  lineMode = xDefNum( lineMode, 1 );
  arrowMode = xDefNum( arrowMode, 1+2 );
  size = xDefNum( size, xArray.length );

  if (size <  1) return this;
  if (size == 1) return this.Line( xArray[0], yArray[0], xArray[0], yArray[0], ((lineMode & 8) > 0) );
  if (size == 2) return this.Arrow( xArray[0], yArray[0], xArray[1], yArray[1], variant, arrowMode );

  // assert size > 2
  var last = size-1;

  // append polygon to path
  if (this.IsPathOpen && (lineMode & 8)) {
    var ctr = this.CurrTrans;
    ctr.ObjTransXY( this.GetObjTrans(), xArray[0], yArray[0] );
    this.PathLineTo( ctr.x, ctr.y );
  }

  if (!(variant & 4)) {

    // polygon is not hidden
    if (lineMode & 4) {

      // polygon is closed -> use normal polygon function; skip appending
      this.Polygon( xArray, yArray, lineMode & ~8, size );

    } else {

      // polygon is not closed -> draw polygon with shortened ends where an arrow is drawn, except in paths
      var skip = ((variant & 1) && (variant & 2) && (size == 3));
      if (!skip) {
        if (this.IsPathOpen) {
          // do not close or append polygon here -> lineMode&3
          this.Polygon( xArray, yArray, lineMode&3, size );
        } else {
          // polygon is big enough to draw parts of it
          var x1 = xArray[0];
          var y1 = yArray[0];
          var x2 = xArray[last];
          var y2 = yArray[last];
          if (variant & 2) {
            xArray[0] = xArray[1];
            yArray[0] = yArray[1];
          }
          if (variant & 1) {
            xArray[last] = xArray[last-1]
            yArray[last] = yArray[last-1]
          }
          // do not close or append polygon here -> lineMode&3
          this.Polygon( xArray, yArray, lineMode&3, size );
          xArray[0] = x1;
          yArray[0] = y1;
          xArray[last] = x2;
          yArray[last] = y2;
        }
      }
    }

  }

  // draw first and/or last segment of polygon as arrows
  var hideSeg = this.IsPathOpen ? 4 : 0;
  if (variant & 2) {
    var x1 = xArray[0], y1 = yArray[0];
    var x2 = xArray[1], y2 = yArray[1];
    this.Arrow( x1, y1, x2, y2, (variant&8)+hideSeg+2, arrowMode&(1+2), sym1 );
  }
  if (variant & 1) {
    var x1 = xArray[last-1], y1 = yArray[last-1];
    var x2 = xArray[last], y2 = yArray[last];
    this.Arrow( x1, y1, x2, y2, (variant&8)+hideSeg+1, arrowMode&(1+2), sym2 );
  }

  var i = (lineMode & 4) ? 0 : last;
  this.PenDown = true;
  this.LastX = xArray[i];
  this.LastY = yArray[i];

  // move cursor of path to last position
  if (this.IsPathOpen) {
    var ctr = this.CurrTrans;
    ctr.ObjTransXY( this.GetObjTrans(), this.LastX, this.LastY );
    this.PathMoveTo( ctr.x, ctr.y );
  }
  return this;
}

JsGraph.prototype.RectWH = function( x, y, w, h, mode, roll ) {
  // or RectWH( JsgRect, mode )
  // x, y: real coordinates of edge with least or most negativ values
  // w, h: real > 0 width and height
  // mode: 1 -> draw border, 2 -> fill, 3 -> border and fill, default = 1
  // mode & 4 -> inverse drawing direction for holes in paths
  // mode & 8 -> continue path

  if (JsgRect.Ok(x)) return this.Rect( x.x, x.y, x.x+x.w, x.y+x.h, y, w );
  return this.Rect( x, y, x+w, y+h, mode, roll );
}

JsGraph.prototype.Rect = function( x1, y1, x2, y2, mode, roll ) {
  // or Rect( pt1, pt2, mode, roll )
  // or Rect( { xmin, ymin, xmax, ymax }, mode, roll )
  // or Rect( JsgRect, mode, roll )
  // or Rect() -> Rect( GetFrame(), 1 )
  // x1, y1, x2, y2: real coordinates of any two opposite edges
  // mode: 1 -> draw border, 2 -> fill, 3 -> border and fill, default = 1
  // mode & 4 -> inverse drawing direction for holes
  // mode & 8 -> continue path

  if (!xDef(x1)) {
    // Rect( x1 = GetFrame(): JsgRect, y1 = mode = 1 )
    var oldTransState = this.ObjTrans.Enable( false );
    this.Rect( this.GetFrame(), 1 )
    this.ObjTrans.Endable( oldTransState );
    return this;
  }

  if (xObj(x1)) {
    if (JsgRect.Ok(x1)) return this.Rect( x1.x, x1.y, x1.x+x1.w, x1.y+x1.h, y1, x2 );
    return this.Rect( x1.xmin, x1.ymin, x1.xmax, x1.ymax, y1, x2 );
  }

  if (JsgVect2.Ok(x1)) return this.Rect( x1[0], x1[1], y1[0], y1[1], x2, y2 );

  this.DriverDrawRect( x1, y1, x2, y2, mode, roll );

  return this;

}

JsGraph.prototype.DriverDrawRect = function( x1, y1, x2, y2, mode, roll ) {
  // x1, y1, x2, y2: real coordinates of any two opposite edges
  // mode: 1 -> draw border, 2 -> fill, 3 -> border and fill, default = 1
  // mode & 4 -> inverse drawing direction for holes
  // mode & 8 -> continue path

  mode = xDefNum( mode, 1 );
  roll = xDefNum( roll, 0 );
  var ctr = this.CurrTrans;
  var otr = this.ObjTrans;
  var inv = !!(mode & 4);

  if (this.IsPathOpen) {
    // add rect as polygon to path
    var poly = this.MakeRectPolygon( x1, y1, x2, y2, inv, roll );
    this.Polygon( poly, mode & 11 );
    return;
  }

  if (otr.Enabled && !otr.IsMoveOnly) {
    // if object transformation is not move-only then draw rect as polygon
    this.RectAsPolygon( x1, y1, x2, y2, mode, inv, roll );
    return;
  }

  // ObjTrans is move only, unity trans or disabled, and path is not open
  // draw rect with native functions
  ctr.ObjTransXY2( this.GetObjTrans(), x1, y1, x2, y2 );
  if (ctr.x1 > ctr.x2) { var tmp = ctr.x1; ctr.x1 = ctr.x2; ctr.x2 = tmp; }
  if (ctr.y1 > ctr.y2) { var tmp = ctr.y1; ctr.y1 = ctr.y2; ctr.y2 = tmp; }

  var ctx = this.Context2D;

  var quadrant = 0; // init rectangle full inside clipping range
  if (this.GraphClipEnabled) {
    quadrant = this.GetRectClipQuadrant( ctr.x1, ctr.x2, ctr.y1, ctr.y2 );
  }

  if (quadrant == 0) {

    // rectangle full inside clipping range, draw it using native rectangle function
    if (mode & 2) {

      ctx.fillRect( ctr.x1, ctr.y1, ctr.x2-ctr.x1, ctr.y2-ctr.y1 );

    }
    if (mode & 1) {
      var oldJoin = ctx.lineJoin;
      var oldCap = ctx.lineCap;
      if (oldJoin == 'round') {
        ctx.lineCap = 'round';
      } else {
        ctx.lineJoin = 'miter';
        ctx.lineCap = 'square';
      }

      ctx.strokeRect( ctr.x1, ctr.y1, ctr.x2-ctr.x1, ctr.y2-ctr.y1 );

      ctx.lineJoin = oldJoin;
      ctx.lineCap = oldCap;
    }

  } else if (quadrant == 2) {

    // rectangle needs clipping, convert it to polygon and draw and clip rectangle
    this.RectAsPolygon( x1, y1, x2, y2, mode, inv, roll );

  } // else rectangle full outside clipping range, don't draw it

}

JsGraph.prototype.RectAsPolygon = function( x1, y1, x2, y2, mode, inv, roll ) {
  // x1, y1, x2, y2: Number; p1, p2: JsgVect2; coordinates of any two opposite edges
  // roll: Integer: rolls point of rectangle down (n > 0) or up (n < 0) n steps.
  // n = 1 rotates start/endpoint clockwise one step, lower left point becomes lower right point.
  // inv = true -> points of polygon are inversed

  var poly = this.MakeRectPolygon( x1, y1, x2, y2, inv, roll );
  var oldJoin = this.LineJoin;
  var oldCap = this.LineCap;
  if (oldJoin == 'round') {
    this.SetLineCap( 'round' );
  } else {
    this.SetLineJoin( 'miter' );
    this.SetLineCap( 'square' );
  }

  this.Polygon( poly, mode & 11 );

  this.SetLineJoin( oldJoin );
  this.SetLineCap( oldCap );
}

JsGraph.prototype.MakeRectPolygon = function( x1, y1, x2, y2, inverse, roll ) {
  // or MakeRectPolygon( p1, p2, inverse, roll )
  // or MakeRectPolygon( { xmin, ymin, xmax, ymax }, clockWise, roll )
  // or MakeRectPolygon( JsgRect, inverse, roll )
  // Returns this.WorkPoly: JsgPolygon
  //
  // Returns a polygon consisting of 5 edge points of a rectangle in current coordinate system.
  // x1, y1, x2, y2: Number; p1, p2: JsgVect2; coordinates of any two opposite edges
  // roll: Integer: rolls point of rectangle down (n > 0) or up (n < 0) n steps.
  // n = 1 rotates start/endpoint clockwise one step, lower left point becomes lower right point.
  // inverse = true -> points of polygon are inversed

  if (JsgVect2.Ok(x1)) return this.MakeRectPolygon( x1[0], x1[1], y1[0], y1[1], x2, y2 );
  if (xObj(x1)) {
    if (JsgRect.Ok(x1)) return this.MakeRectPolygon( x1.x, x1.y, x1.x+x1.w, x1.y+x1.h, y1, x2 );
    return this.MakeRectPolygon( x1.xmin, x1.ymin, x1.xmax, x1.ymax, y1, x2 );
  }

  inverse = xDefBool( inverse, false );
  roll = xDefNum( roll, 0 );

  if (x1 > x2) { var tmp = x1; x1 = x2; x2 = tmp; }
  if (y1 > y2) { var tmp = y1; y1 = y2; y2 = tmp; }

  var poly = this.WorkPoly.Reset();
  poly.AddPoint( x1, y1 );
  poly.AddPoint( x2, y1 );
  poly.AddPoint( x2, y2 );
  poly.AddPoint( x1, y2 );

  // rotate polygon
  if (roll !== 0) poly.Roll( roll );

  // close polygon
  poly.AddPoint( poly.X[0], poly.Y[0] );

  // inverse polygon
  if (inverse) poly.Invert( );

  return poly;
}

JsGraph.prototype.DegToRad = function( a ) {
  return a / 180 * Math.PI;
}

JsGraph.prototype.RadToDeg = function( a ) {
  return a / Math.PI * 180;
}

JsGraph.prototype.AngleToRad = function( a ) {
  return this.AngleMeasure == 'deg' ? this.DegToRad(a) : a;
}

JsGraph.prototype.RadToAngle = function( a ) {
  // returns a if AngleMeasure is 'rad', else a is converted into degrees
  return this.AngleMeasure == 'deg' ? this.RadToDeg(a) : a;
}

JsGraph.prototype.AngleOfVector = function( x, y ) {
  // or AngleOfVector( pt )
  if (JsgVect2.Ok(x)) return this.AngleOfVector( x[0], x[1] );
  var r = Math.sqrt( x*x + y*y );
  var ang = 0;
  if (r > 0) ang = Math.acos( x / r );
  if (y < 0) ang = 2 * Math.PI - ang;
  if (this.AngleMeasure == 'deg') ang = this.RadToDeg(ang);
  return ang;
}

JsGraph.prototype.MakeArcFromPoints = function( x1, y1, x2, y2, r, big ) {
  // returns { x, y, r, start, end }
  var arc = { x:x1, y:y1, r:r, start:0, end:0 };
  var absr = Math.abs(r);
  var mx = (x2 - x1) / 2;
  var my = (y2 - y1) / 2;
  var ml = Math.sqrt( mx*mx + my*my );
  if (ml == 0) return arc;
  var hl = 0;
  if (absr > ml) hl = Math.sqrt( absr*absr - ml*ml );
  var hx = - hl * my / ml;
  var hy =   hl * mx / ml;
  if ((r < 0) ^ big) {
    hx = -hx;
    hy = -hy;
  }
  arc.x = x1 + mx + hx;
  arc.y = y1 + my + hy;
  arc.start = this.AngleOfVector( x1 - arc.x, y1 - arc.y );
  arc.end   = this.AngleOfVector( x2 - arc.x, y2 - arc.y );
  return arc;
}

JsGraph.prototype.MakeEllipseArcPolygon = function( x, y, rx, ry, rot, start, end, rPixel ) {
  // or MakeEllipseArcPolygon( pt, rx, ry, rot, start, end, rPixel )
  // all coordinates in current coordinate system
  // all angles in current angle measure
  // rPixel (optional) as the greatest radius in canvas coordinates. If not defined, it will be calculated here.
  // returns this.WorkPoly: JsgPolygon

  if (JsgVect2.Ok(x)) return this.MakeEllipseArcPolygon( x[0], x[1], y, rx, ry, rot, start, end );

  ry    = xDefNum( ry, Math.abs(rx) );
  rot   = xDefNum( rot, 0 );
  start = xDefNum( start, 0 );
  end   = xDefNum( end, start+this.RadToAngle(2*Math.PI) );

  var abs = Math.abs, max = Math.max;
  var ctr = this.CurrTrans;
  var otr = this.ObjTrans;

  // compute gratest pixel radius rPixel
  var absRx = abs( rx );
  var absRy = abs( ry );
  if (!xDef(rPixel)) {
    var maxR  = max( absRx, absRy );
    var s = otr.MaxScaling();
    var cnvsRx = abs( s * ctr.ScaleX * maxR );
    var cnvsRy = abs( s * ctr.ScaleY * maxR );
    rPixel = max( cnvsRx, cnvsRy );
  }

  rot   = this.AngleToRad( rot );
  start = this.AngleToRad( start );
  end   = this.AngleToRad( end );

  // compute delta angle
  var delta = this.CompDeltaAngle( rPixel, this.CurvePrecision / this.DevicePixelRatio );

  // create unity circle polygon
  var angles = { delta: delta, start: start, end: end };
  if (rx < 0) angles.delta *= -1;
  this.NormalizeAngles( angles );
  rot = this.NormalizeAngle( rot );

  var poly = this.MakeUnityArcPolygon( angles );

  // transform unity arc to ellipse arc
  var mat = JsgMat2.Transformation( absRx, absRy, rot, x, y );
  JsgMat2.TransPolyXY( mat, poly.X, poly.Y, poly.Size );

  return poly;
}

JsGraph.prototype.Circle = function( x, y, r, mode, startAngle ) {
  // or Circle( pt, r, mode, startAngle )
  // r < 0 -> clockwise, r > 0 -> counterclockwise
  // mode: 1 -> draw border, 2 -> fill, 3 -> border and fill, default = 1
  // (mode & 4 -> close circle) ignored, circles are closed anyway
  // mode & 8 -> continue path

  if (JsgVect2.Ok(x)) return this.Circle( x[0], x[1], y, r, mode );

  startAngle = xDefNum( startAngle, 0 );
  var start = startAngle;
  var end = startAngle + this.RadToAngle(2*Math.PI);
  if (r < 0) {
    start = end;
    end = startAngle;
  }
  this.Arc( x, y, r, start, end, mode );
  return this;
}

JsGraph.prototype.Arc = function( x, y, r, start, end, mode ) {
  // or Arc( pt, r, start, end, mode )
  // x, y: real coordinates
  // r: real radius
  // r < 0 -> clockwise, r > 0 -> counterclockwise
  // start, end: real angles in radians or degress (see AngleMeasure)
  // mode: 1 -> draw border, 2 -> fill, 3 -> border and fill, default = 1
  // mode & 4 -> close arc by drawing a line from last to first point of arc
  // mode & 8 -> continue path

  if (JsgVect2.Ok(x)) return this.Arc( x[0], x[1], y, r, start, end );

  var ctr = this.CurrTrans;
  var cnvsRX = Math.abs( ctr.ScaleX * r );
  var cnvsRY = Math.abs( ctr.ScaleY * r );
  var cnvsRDiff = Math.abs( cnvsRX - cnvsRY );

  if (this.DisableNativeArc || !this.ObjTrans.IsMoveOnly || cnvsRDiff > this.CurvePrecision/this.DevicePixelRatio) {

    // if transformed arc is distorted to elliptic arc, draw as EllipseArc
    this.EllipseArcAsPolygon( x, y, r, Math.abs(r), 0, start, end, mode );

  } else {

    this.DriverDrawArc( x, y, r, start, end, mode );

  }
  return this;
}

JsGraph.prototype.ArcTo = function( x, y, r, big, mode ) {
  // or ArcTo( pt, r, big, mode )
  // x, y: real endpoint
  // r: real radius
  // r < 0 -> clockwise, r > 0 -> counterclockwise
  // big: boolean: chose short or long arc
  // mode: 1 -> draw border, 2 -> fill, 3 -> border and fill, default = 1
  // mode & 4 -> close polygon

  if (JsgVect2.Ok(x)) return this.ArcTo( x[0], x[1], y, r, big );
  this.ArcPt( this.LastX, this.LastY, x, y, r, big, mode|8 );
  return this;
}

JsGraph.prototype.ArcPt = function( x1, y1, x2, y2, r, big, mode ) {
  // or ArcPt( pt1, pt2, r, big, mode )
  // x1, y1, x2, y2: real startpoint and endpoint
  // r: real radius
  // r < 0 -> clockwise, r > 0 -> counterclockwise
  // big: boolean: chose short or long arc
  // mode: 1 -> draw border, 2 -> fill, 3 -> border and fill, default = 1
  // mode & 4 -> close polygon
  // mode & 8 -> continue path

  if (JsgVect2.Ok(x1)) return this.ArcPt( x1[0], x1[1], y1[0], y1[1], x2, y2, r );

  big = xDefBool( big, false );
  mode = xDefNum( mode, 1 );
  var arc = this.MakeArcFromPoints( x1, y1, x2, y2, r, big );
  this.Arc( arc.x, arc.y, arc.r, arc.start, arc.end, mode );
  this.PenDown = true;
  this.LastX = x2;
  this.LastY = y2;
  return this;
}

JsGraph.prototype.DriverDrawArc = function( x, y, r, start, end, mode ) {
  // Draws arc with native Context2D function if no clipping is required.
  // Requires in that case that a perfect circular arc after transformation
  // If cannot draw native, arc is drawn using EllipseArcAsPolygon.
  // x, y: real coordinates in active coordinate system.
  // r: real radius
  // r < 0 -> inverse
  // start, end: real angles in radians or degress (see AngleMeasure)
  // mode: 1 -> draw border, 2 -> fill, 3 -> border and fill, default = 1
  // mode & 4 -> close arc by drawing a line from last to first point of arc
  // mode & 8 -> continue path
  // require( this.ObjTrans.IsMoveOnly )

  start = xDefNum( start, 0 );
  end   = xDefNum( end, start+this.RadToAngle(2*Math.PI) );
  mode  = xDefNum( mode, 1 );
  var cnvsStart = this.AngleToRad(start);
  var cnvsEnd   = this.AngleToRad(end);

  var ctx = this.Context2D;
  var ctr = this.CurrTrans;
  ctr.ObjTransXY( this.GetObjTrans(), x, y );
  var cnvsRX = Math.abs( ctr.ScaleX * r );
  var angles = { delta: r, start: cnvsStart, end: cnvsEnd };
  if (ctr.ScaleX * ctr.ScaleY < 0) {
    angles.delta *= -1;
    angles.start *= -1;
    angles.end *= -1;
  }
  this.NormalizeAngles( angles );
  var inverse = (angles.delta < 0);

  if (this.IsPathOpen) {

    this.PathAppendArc( ctr.x, ctr.y, cnvsRX, angles.start, angles.end, inverse, ((mode&8) > 0), ((mode&4) > 0) );

  } else {

    var quadrant = 0; // init circle full inside
    if (this.GraphClipEnabled) {
      quadrant = this.GetCircleClipQuadrant( ctr.x, ctr.y, cnvsRX );
    }

    if (quadrant == 0) {

      // circle full inside clipping range, draw it using native arc function
      if (mode & 2) {
        ctx.beginPath();
        ctx.arc( ctr.x, ctr.y, cnvsRX, angles.start, angles.end, inverse );
        ctx.fill();
      }
      if (mode & 1) {
        ctx.beginPath();
        ctx.arc( ctr.x, ctr.y, cnvsRX, angles.start, angles.end, inverse );
        if (mode & 4) ctx.closePath();
        ctx.stroke();
      }

    } else if (quadrant == 2) {

      // circle needs clipping, convert it to polygon and draw and clip polygon
      this.EllipseArcAsPolygon( x, y, r, Math.abs(r), 0, start, end, mode );

    } // else circle full outside clipping range, don't draw it

  }

  var rAbs = Math.abs(r);
  this.LastX = x + rAbs * Math.cos( end );
  this.LastY = y + rAbs * Math.sin( end );

}

JsGraph.prototype.Ellipse = function( x, y, rx, ry, rot, mode, startAngle ) {
  // or Ellipse( pt, rx, ry, rot, mode, startAngle )
  // x, y: real center
  // pt: JsgVect2
  // rx, ry: real radius
  // rx < 0 -> clockwise, rx > 0 -> counterclockwise
  // mode: 1 -> draw border, 2 -> fill, 3 -> border and fill, default = 1
  // rot: real angle in radians or degrees (see AngleMeasure)
  // mode & 4 -> close polygon
  // mode & 8 -> continue path

  if (JsgVect2.Ok(x)) return this.Ellipse( x[0], x[1], y, rx, ry, rot, mode );

  startAngle = xDefNum( startAngle, 0 );
  var start = startAngle;
  var end = startAngle + this.RadToAngle(2*Math.PI);
  if (rx < 0) {
    start = end;
    end = startAngle;
  }
  this.EllipseArc( x, y, rx, ry, rot, start, end, mode );
  return this;
}

JsGraph.prototype.EllipseArc = function( x, y, rx, ry, rot, start, end, mode ) {
  // or EllipseArc( pt, rx, ry, rot, start, end, mode )
  // x, y: real center
  // pt: JsgVect2
  // rx, ry: real radius
  // rx < 0 -> clockwise, rx > 0 -> counterclockwise
  // start, end: real angles in ellipse coordinates as radians or degrees (see AngleMeasure)
  // mode: 1 -> draw border, 2 -> fill, 3 -> border and fill, default = 1
  // mode & 4 -> force close polygon
  // mode & 8 -> continue path

  if (JsgVect2.Ok(x)) return this.EllipseArc( x[0], x[1], y, rx, ry, rot, start, end );

  var ctr = this.CurrTrans;
  var abs = Math.abs;
  var precision = this.CurvePrecision/this.DevicePixelRatio;
  var isCircular = !this.DisableNativeArc && this.ObjTrans.IsMoveOnly;

  if (isCircular) {
    // check wether rx in canvas coordinates is same in x and y direction
    var cnvsRxx = abs( ctr.ScaleX * rx );
    var cnvsRxy = abs( ctr.ScaleY * rx );
    if (abs(cnvsRxx - cnvsRxy) > precision) isCircular = false;

    if (isCircular) {
      // check wether ry in canvas coordinates is same in x and y direction
      var cnvsRyx = abs( ctr.ScaleX * ry );
      var cnvsRyy = abs( ctr.ScaleY * ry );
      if (abs(cnvsRyx - cnvsRyy) > precision) isCircular = false;

      if (isCircular) {
        // check wether rx and ry in canvas coordinates are equal within some precition
        if (abs(cnvsRxx - cnvsRyx) > precision) isCircular = false;
      }
    }
  }

  if (isCircular) {

    // allipse arc is a circular arc, so use native arc draw function
    rot   = xDefNum( rot, 0 );
    start = xDefNum( start, 0 );
    end   = xDefNum( end, start+this.RadToAngle(2*Math.PI) );
    this.DriverDrawArc( x, y, rx, start+rot, end+rot, mode );

  } else {

    this.EllipseArcAsPolygon( x, y, rx, ry, rot, start, end, mode );
  }
  return this;
}

JsGraph.prototype.IsClosedPolygon = function( xArray, yArray, size ) {
  // or IsClosedPolygon( JsgPolygon )
  // returns true if polygon startpoint and endpoints are closer than 1/2 pixels

  if (JsgPolygon.Ok(xArray)) return this.IsClosedPolygon( xArray.X, xArray.Y, xArray.Size );

  size = xDefNum( size, xArray.length );
  var closed = false;
  var last = size-1;
  if (last >= 2) {
    var refLen = 0.5 / this.DevicePixelRatio;
    if (JsgVect2.Length2( xArray[0] - xArray[last], yArray[0] - yArray[last] ) <= (refLen*refLen)) closed = true;
  }
  return closed;
}

JsGraph.prototype.EllipseArcAsPolygon = function( x, y, rx, ry, rot, start, end, mode ) {
  // draws ellipse arc as a polygon, no native driver function used
  // x, y: real center in active coordinate system
  // rx, ry: real radius in current coordinate system
  // rx < 0 -> clockwise, rx > 0 -> counterclockwise
  // start, end: real angles in ellipse coordinates as radians or degrees (see AngleMeasure)
  // mode: 1 -> draw border, 2 -> fill, 3 -> border and fill, default = 1
  // mode & 4 -> force close polygon
  // mode & 8 -> continue path

  mode  = xDefNum( mode, 1 );

  var ell = this.MakeEllipseArcPolygon( x, y, rx, ry, rot, start, end );

  var closed = this.IsClosedPolygon( ell.X, ell.Y, ell.Size );

  if (closed) {

    var ctx = this.Context2D
    var oldJoin = ctx.lineJoin;
    var oldCap = ctx.lineCap;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    this.Polygon( ell, mode );

    ctx.lineJoin = oldJoin;
    ctx.lineCap = oldCap;

  } else {

    this.Polygon( ell, mode );

  }

}

JsGraph.prototype.DriverWorkPoly = new JsgPolygon( false, 'JsGraph.DriverWorkPoly' );
JsGraph.prototype.DriverWorkClipPoly = new JsgPolygon( false, 'JsGraph.DriverWorkClipPoly' );
JsGraph.prototype.DriverWorkClipPolyList = new JsgPolygonList( false, 'JsGraph.DriverWorkClipPolyList' );

JsGraph.prototype.DriverDrawPoly = function( xArray, yArray, size, fillMode, close, poly ) {
  // transforms, clips and draws a polygon to the context2D
  // returns this.DriverWorkPoly to reuse it in the next call with the same polygon to avoid multiple transformations
  // first call für any polygon must omit poly
  // require size > 0

  var ctr = this.CurrTrans;
  var otr = this.GetObjTrans();
  var ctx = this.Context2D;

  // make and transform polygon from parameters
  if (!xDef(poly)) {
    poly = this.DriverWorkPoly.Reset();
    poly.Quadrant = -1;
    for (var i = 0; i < size; i++) {
      ctr.ObjTransXY( otr, xArray[i], yArray[i] );
      poly.AddPoint( ctr.x, ctr.y );
    }
  } // else reuse poly

  if (this.GraphClipEnabled) {

    // handle clipping: first find out wether poly is visible and needs clipping
    var quadrant = poly.Quadrant;
    if (quadrant == -1) {
      quadrant = this.GetPolygonClipQuadrant( poly.X, poly.Y, poly.Size );
      poly.Quadrant = quadrant;
    }

    if (fillMode) {

      // area clipping
      var polyClipped = null;
      if (quadrant == 0) {

        // full inside, no clipping needet
        polyClipped = poly;

      } else if (quadrant == 2) {

        // clip poly; poly needs to be closed for clipping to work properly
        var didClosePoly = this.ClosePolygon( poly );

        polyClipped = this.ClipPolygonArea( poly,
          this.GraphClipInnerXmin, this.GraphClipInnerXmax, this.GraphClipInnerYmin, this.GraphClipInnerYmax,
          this.DriverWorkClipPoly
        );

        if (didClosePoly) poly.RemoveLastPoint();

      } // else full outside -> skip drawing

      if (polyClipped) {
        if (this.DriverDrawPathPoly( polyClipped, true, false )) {
          ctx.fill();
        }
      }

    } else {

      // contour clipping
      if (quadrant == 0) {

        // full inside, no clipping needet
        if (this.DriverDrawPathPoly( poly, true, close )) {
          ctx.stroke();
        }

      } else if (quadrant == 2) {

        // clip and draw poly
        var didClosePoly = false;
        if (close) didClosePoly = this.ClosePolygon( poly );

        var polyListClipped = this.ClipPolygon( poly,
          this.GraphClipInnerXmin, this.GraphClipInnerXmax, this.GraphClipInnerYmin, this.GraphClipInnerYmax, ctx.lineWidth/2,
          this.DriverWorkClipPolyList
        );

        if (polyListClipped.Size > 0) {
          var newPath = true;
          for (var i = 0; i < polyListClipped.Size; i++) {
            var polyClipped = polyListClipped.PolyList[i];
            if (this.DriverDrawPathPoly( polyClipped, newPath, false )) {
              newPath = false;
            }
          }
          if (!newPath) ctx.stroke();
        }
        if (didClosePoly) poly.RemoveLastPoint();

      } // else full outside -> skip drawing

    }

  } else {

    // clipping disabled
    if (this.DriverDrawPathPoly( poly, true, close )) {
      if (fillMode) {
        ctx.fill();
      } else {
        ctx.stroke();
      }
    }

  }
  return poly;
}

JsGraph.prototype.DriverDrawBezierCurve = function( sx, sy, cx1, cy1, cx2, cy2, ex, ey, mode, nSegments ) {
  // Draws bezier curve with native Context2D function if no clipping is required.
  // If bezier needs clipping, bezier is drawn using BezierCurveAsPolygon.
  // All coordinates in active coordinate system.
  // sx/sy: startpoint; cx1/cy1/cx2/cy2: ontrol points; ex/ey: endpoint
  // mode: 1 -> draw border, 2 -> fill, 3 -> border and fill, default = 1
  // mode & 4 -> close curve by drawing a line from end point to start point
  // mode & 8 -> continue path

  mode = xDefNum( mode, 1 );

  var ctx = this.Context2D;
  var ctr = this.CurrTrans;
  var otr = this.GetObjTrans();
  ctr.ObjTransXY( otr, sx, sy );
  var cnvsSx = ctr.x, cnvsSy = ctr.y;
  ctr.ObjTransXY( otr, cx1, cy1 );
  var cnvsCx1 = ctr.x, cnvsCy1 = ctr.y;
  ctr.ObjTransXY( otr, cx2, cy2 );
  var cnvsCx2 = ctr.x, cnvsCy2 = ctr.y;
  ctr.ObjTransXY( otr, ex, ey );
  var cnvsEx = ctr.x, cnvsEy = ctr.y;

  if (this.IsPathOpen) {

    if (mode & 8) {
      this.PathLineTo( cnvsSx, cnvsSy );
    } else {
      this.PathMoveTo( cnvsSx, cnvsSy );
    }
    this.PathAppendBezierTo( cnvsCx1, cnvsCy1, cnvsCx2, cnvsCy2, cnvsEx, cnvsEy );
    if (mode & 4) {
      this.PathLineTo( cnvsSx, cnvsSy );
    }

  } else {

    if (mode & 8) {
      if (this.LastX != sx || this.LastY != sy ) {
        this.Line( this.LastX, this.LastY, sx, sy );
      }
    }

    var quadrant = 0; // init bezier curve full inside
    if (this.GraphClipEnabled) {
      quadrant = this.GetBezierClipQuadrant( cnvsSx, cnvsSy, cnvsCx1, cnvsCy1, cnvsCx2, cnvsCy2, cnvsEx, cnvsEy );
    }

    if (quadrant == 0) {

      // bezier curve full inside clipping range, draw it using native bezier function
      if (mode & 2) {

        ctx.beginPath();
        ctx.moveTo( cnvsSx, cnvsSy );
        ctx.bezierCurveTo( cnvsCx1, cnvsCy1, cnvsCx2, cnvsCy2, cnvsEx, cnvsEy );
        ctx.fill();
      }
      if (mode & 1) {
        ctx.beginPath();
        ctx.moveTo( cnvsSx, cnvsSy );
        ctx.bezierCurveTo( cnvsCx1, cnvsCy1, cnvsCx2, cnvsCy2, cnvsEx, cnvsEy );
        if (mode & 4) ctx.closePath();
        ctx.stroke();
      }

    } else if (quadrant == 2) {

      // bezier curve needs clipping, convert it to polygon and draw and clip polygon
      this.BezierCurveAsPolygon( sx, sy, cx1, cy1, cx2, cy2, ex, ey, mode, nSegments );

    } // else bezier curve full outside clipping range, don't draw it

  }

  this.PenDown = true;
  if (mode & 4) {
    this.LastX = sx;
    this.LastY = sy;
  } else {
    this.LastX = ex;
    this.LastY = ey;
  }

}

JsGraph.prototype.NewPoly = function() {
  this.Poly.Reset();
  return this;
}

JsGraph.prototype.CopyPoly = function( to, reuseArrays ) {
  // returns a copy of this.Poly: { X: array(Size) of number, Y: array(Size) of number, Size: integer }
  reuseArrays = xDefBool( reuseArrays, false );
  return this.Poly.Copy( to, !reuseArrays );
}

JsGraph.prototype.AddPointToPoly = function( x, y ) {
  // or AddPointToPoly( pt )
  this.Poly.AddPoint( x, y );
  return this;
}

JsGraph.prototype.AddVectToPoly = function( vec ) {
  this.Poly.AddPoint( vec[0], vec[1] );
  return this;
}

JsGraph.prototype.DrawPoly = function( mode ) {
  // mode: 1 -> draw border, 2 -> fill, 3 -> border and fill, default = 1
  // mode & 4 -> close polygon by drawing a line from last to first point of polygon
  // mode & 8 -> continue path
  // mode & 16 -> inverse Polygon
  mode = xDefNum( mode, 1 );
  if (mode & 16) this.Poly.Invert();
  this.Polygon( this.Poly, mode );
}

JsGraph.prototype.DrawPolyArrow = function( variant, lineMode, arrowMode ) {
  // variant: bitmask (default = 1): 1 -> symbol at end, 2 -> symbol at start, 4 -> hide line, 8 -> shorten line
  // lineMode: bitmask (default = 1): 1 -> border, 2 -> fill, 4 -> close polygon, 8 -> append line to path
  // arrowMode: bitmask (default = 3): 1 -> border, 2 -> fill
  // size -> specifies number of segments to draw from xArray and yArray; defaults to xArray.length
  // see Arrow() for description of arguments
  this.PolygonArrow( this.Poly, variant, lineMode, arrowMode );
}

JsGraph.prototype.DrawPolyMarker = function( mode, mat ) {
  // mode: int: 1 -> border, 2 -> fill, 3 -> fill and border
  // mat: JsgMat2 (optional) -> additional transformation matrix (e.g. rotation)
  // Use RotationMatrixToVect( x, y ) to create mat
  this.Marker( this.Poly, mode, mat );
}

JsGraph.prototype.Polygon = function( xArray, yArray, mode, size ) {
  // or Polygon( JsgPolygon, mode )
  // xArray, yArray: array of real coordinates
  // mode: 1 -> draw border, 2 -> fill, 3 -> border and fill, default = 1
  // mode & 4 -> close polygon by drawing a line from last to first point of polygon
  // mode & 8 -> continue path
  // size -> specifies number of segments to draw from xArray and yArray; defaults to xArray.length

  if (JsgPolygon.Ok(xArray)) return this.Polygon( xArray.X, xArray.Y, yArray, xArray.Size );

  mode = xDefNum( mode, 1 );
  size = xDefNum( size, xArray.length );
  if (size < 1) return this;

  if (this.IsPathOpen) {
    this.PathAppendPolygon( xArray, yArray, ((mode&8) > 0), ((mode&4) > 0), size );
  } else {
    var poly;
    if (mode & 2) {
      // save transformed poly
      poly = this.DriverDrawPoly( xArray, yArray, size, true, false );
    }
    if (mode & 1) {
      // reuse transformed poly from previous call to DirverMakePath
      this.DriverDrawPoly( xArray, yArray, size, false, (mode&4) > 0, poly );
    }
  }
  var i = (mode & 4) ? 0 : xArray.length-1;
  this.PenDown = true;
  this.LastX = xArray[i];
  this.LastY = yArray[i];
  return this;
}

JsGraph.prototype.PolygonList = function( polyList, mode ) {
  // or PolygonList( poly: JsgPolygon, mode )
  // draws all polygons in polyList with function Polygon
  if (!JsgPolygonList.Ok(polyList)) return g.Polygon( polyList, mode );
  for (var i = 0; i < polyList.Size; i++) {
    this.Polygon( polyList.PolyList[i], mode );
  }
  return this;
}

JsGraph.prototype.ClosePolygon = function( poly ) {
  // returns true if poly has been closed, false if poly has already been closed
  var last = poly.Size - 1;
  if (last < 1) return false;
  if (poly.X[0] != poly.X[last] || poly.Y[0] != poly.Y[last]) {
    poly.AddPoint( poly.X[0], poly.Y[0] );
    return true;
  }
  return false;
}

JsGraph.prototype.WorkPolyClipped = new JsgPolygon( false, 'JsGraph.WorkPolyClipped' );

JsGraph.prototype.ClipPolygonArea = function( poly, xmin, xmax, ymin, ymax, polyClipped ) {
  // returns cliped poly in polyClipped
  // if polyClipped is not defined, a new JsgPolygon is created and returned
  // use GetPolygonQuadrant() or GetPolygonClipQuadrant() to check wether poly needs clipping or not

  polyClipped = polyClipped || new JsgPolygon();
  var polyClipped2 = this.WorkPolyClipped;
  this.ClipPolygonAtLine( poly,         xmin, false, false, polyClipped2 );
  this.ClipPolygonAtLine( polyClipped2, ymin, false, true,  polyClipped  );
  this.ClipPolygonAtLine( polyClipped,  xmax, true,  false, polyClipped2 );
  this.ClipPolygonAtLine( polyClipped2, ymax, true,  true,  polyClipped  );
  return polyClipped;
}

JsGraph.prototype.WorkPolyListClipped = new JsgPolygonList( false, 'JsGraph.WorkPolyListClipped' );

JsGraph.prototype.ClipPolygon = function( poly, xmin, xmax, ymin, ymax, extend, polyListClipped ) {
  // returns cliped poly in polyListClipped of type JsgPolgonList
  // if polyListClipped is not defined, a new JsgPolygonList is created and returned
  // use GetPolygonQuadrant() or GetPolygonClipQuadrant() to check wether poly needs clipping or not

  extend = xDefNum( extend, 0 );
  if (extend != 0) {
    xmin -= extend;
    xmax += extend;
    ymin -= extend;
    ymax += extend;
  }

  polyListClipped = polyListClipped || new JsgPolygonList();
  var polyListClipped2 = this.WorkPolyListClipped;

  polyListClipped2.Reset();
  this.ClipPolygonAtLine( poly, xmin, false, false, polyListClipped2 );

  polyListClipped.Reset();
  for (var i = 0; i < polyListClipped2.Size; i++) {
    this.ClipPolygonAtLine( polyListClipped2.PolyList[i], ymin, false, true, polyListClipped );
  }

  polyListClipped2.Reset();
  for (var i = 0; i < polyListClipped.Size; i++) {
    this.ClipPolygonAtLine( polyListClipped.PolyList[i], xmax, true, false, polyListClipped2 );
  }

  polyListClipped.Reset();
  for (var i = 0; i < polyListClipped2.Size; i++) {
    this.ClipPolygonAtLine( polyListClipped2.PolyList[i], ymax, true, true, polyListClipped );
  }

  return polyListClipped;
}

JsGraph.prototype.ClipPolygonAtLine = function( poly, clipCoord, clipAtMax, clipHorizontal, polyClipped ) {
  // polyClipped: JsgPolygon or JsgPolygonList

  function AddPointToPolyClipped( x, y ) {
    if (clipHorizontal) {
      polyClipped.AddPoint( y, x );
    } else {
      polyClipped.AddPoint( x, y );
    }
  }

  function IsInside( x ) {
    return clipAtMax ? x <= clipCoord : x >= clipCoord;
  }

  // return empty polygon if poly is empty
  var isBorderClipMode = JsgPolygonList.Ok( polyClipped );
  if (!isBorderClipMode) polyClipped.Reset();
  if (poly.Size == 0) return;

  // change coordinates if clipHorizontal is selected
  var isP1Inside, isP2Inside, polyX, polyY;
  if (clipHorizontal) {
    polyX = poly.Y;
    polyY = poly.X;
  } else {
    polyX = poly.X;
    polyY = poly.Y;
  }

  // check if poly is only one point
  isP1Inside = IsInside( polyX[0] );
  if (poly.Size == 1) {
    if (isP1Inside) {
      if (isBorderClipMode) polyClipped.NewPoly();
      polyClipped.AddPoint( poly.X[0], poly.Y[0] );
    }
    return;
  }

  // area in poly must be closed
  var polyClosed = false;
  if (!isBorderClipMode) {
    polyClosed = this.ClosePolygon( poly );
  }

  // loop for all poly segments
  var isLastP2Added = false;
  var nlast = poly.Size - 2;
  for (var i = 0; i <= nlast; i++) {

    var i2 = i + 1;
    isP2Inside = IsInside( polyX[i2] );

    if (isP1Inside && isP2Inside) {

      // both points inside: add segment to clipPoly
      if (!isLastP2Added) {
        if (isBorderClipMode) polyClipped.NewPoly();
        AddPointToPolyClipped( polyX[i], polyY[i] );
      }
      AddPointToPolyClipped( polyX[i2], polyY[i2] );
      isLastP2Added = true;

    } else if (isP1Inside != isP2Inside) {

      // segment intersects clipping line: handle clipping
      var intersectCoord = this.ClipIntersectionCoord( polyX[i], polyY[i], polyX[i2], polyY[i2], clipCoord );
      if (isP1Inside) {

        // line segment exits inside
        if (!isLastP2Added) {
          if (isBorderClipMode) polyClipped.NewPoly();
          AddPointToPolyClipped( polyX[i], polyY[i] );
        }
        AddPointToPolyClipped( clipCoord, intersectCoord );
        isLastP2Added = false;

      } else {

        // line segment enters inside
        if (isBorderClipMode) polyClipped.NewPoly();
        AddPointToPolyClipped( clipCoord, intersectCoord );
        AddPointToPolyClipped( polyX[i2], polyY[i2] );
        isLastP2Added = true;

      }

//  } else { nothing to do if both points are outside

    }

    isP1Inside = isP2Inside;

  } // next segment

  if (polyClosed) poly.RemoveLastPoint();
}

JsGraph.prototype.GetRectQuadrant = function( rxmin, rxmax, rymin, rymax, xmin, xmax, ymin, ymax ) {
  // rxmin..rymax : rect geometry
  // xmin..ymax: clipping range
  // returns: 0 -> rect full inside; 1 -> full outside; 2 -> crossing

  if (rxmin >= xmin && rxmax <= xmax && rymin >= ymin && rymax <= ymax) return 0;
  if (rxmax < xmin || rxmin > xmax || rymax < ymin || rymin > ymax) return 1;
  return 2;
}

JsGraph.prototype.GetRectClipQuadrant = function( rxmin, rxmax, rymin, rymax ) {
  // rxmin..rymax : rect geometry in canvas coordinates
  // returns:
  //   0 -> full inside GraphClip inner range or crossing inner range and full inside outer range -> no clipping needet
  //   1 -> full outside inner range -> invisibe, skip drawing
  //   2 -> crossing inner and outer range -> clipping at GraphClip inner range needet

  // check full inside inner range
  if (
    rxmin >= this.GraphClipInnerXmin &&
    rxmax <= this.GraphClipInnerXmax &&
    rymin >= this.GraphClipInnerYmin &&
    rymax <= this.GraphClipInnerYmax
  ) return 0;
  // check full outside inner range
  if (
    rxmax < this.GraphClipInnerXmin ||
    rxmin > this.GraphClipInnerXmax ||
    rymax < this.GraphClipInnerYmin ||
    rymin > this.GraphClipInnerYmax
  ) return 1;
  // assert: rect cannot be full outside outer range here

  // rect is crossing inner range, check crossing outer range
  // check full inside outer range
  if (
    rxmin >= this.GraphClipOuterXmin &&
    rxmax <= this.GraphClipOuterXmax &&
    rymin >= this.GraphClipOuterYmin &&
    rymax <= this.GraphClipOuterYmax
  ) return 0;
  // rect cannot be full inside outer range not full outside outer range, so it must be crossing inner and outer range here
  return 2;
}

JsGraph.prototype.GetPolygonClipQuadrant = function( xArray, yArray, size ) {
  //   0 -> full inside GraphClip inner range or crossing inner range and full inside outer range -> no clipping needet
  //   1 -> full outside inner range -> invisibe, skip drawing
  //   2 -> crossing inner and outer range -> clipping at GraphClip inner range needet
  // require size > 0

  // optimization: quick check wether polygon is full inside inner range
  if (this.IsPolygonArrayInsideRect( xArray, yArray, size, this.GraphClipInnerXmin, this.GraphClipInnerXmax, this.GraphClipInnerYmin, this.GraphClipInnerYmax )) {
    return 0;
  }

  // find minimum and maximum coordinates
  var xmin = xArray[0];
  var xmax = xmin;
  var ymin = yArray[0];
  var ymax = ymin;
  for (var i = 1; i < size; i++) {
    var x = xArray[i];
    var y = yArray[i];
    if (x < xmin) xmin = x;
    if (x > xmax) xmax = x;
    if (y < ymin) ymin = y;
    if (y > ymax) ymax = y;
  }
  return this.GetRectClipQuadrant( xmin, xmax, ymin, ymax );
}

JsGraph.prototype.GetCircleClipQuadrant = function( x, y, r ) {
  // returns: 0 -> circle full inside; 1 -> full outside; 2 -> crossing
  return this.GetRectClipQuadrant( x-r, x+r, y-r, y+r );
}

JsGraph.prototype.GetBezierClipQuadrant = function( px1, py1, cx1, cy1, cx2, cy2, px2, py2 ) {
  // returns: 0 -> bezier curve full inside; 1 -> full outside; 2 -> crossing
  var rxmin = Math.min( px1, cx1, cx2, px2 );
  var rxmax = Math.max( px1, cx1, cx2, px2 );
  var rymin = Math.min( py1, cy1, cy2, py2 );
  var rymax = Math.max( py1, cy1, cy2, py2 );
  return this.GetRectClipQuadrant( rxmin, rxmax, rymin, rymax );
}

JsGraph.prototype.IsPointInsideRect = function( x, y, xmin, xmax, ymin, ymax ) {
  return (x >= xmin && x <= xmax && y >= ymin && y <= ymax);
}

JsGraph.prototype.IsPolygonInsideRect = function( xArray, yArray, size, xmin, xmax, ymin, ymax ) {
  // or IsPolygonInsideRect( JsgPolygon, xmin, xmax, ymin, ymax )
  // returns true if poly is complete inside rectangle
  if (JsgPolygon.Ok(xArray)) {
    return this.IsPolygonArrayInsideRect( xArray.X, xArray.Y, xArray.Size, yArray, size, xmin, xmax );
  } else {
    return this.IsPolygonArrayInsideRect( xArray, yArray, size, xmin, xmax, ymin, ymax );
  }
}

JsGraph.prototype.IsPolygonArrayInsideRect = function( xArray, yArray, size, xmin, xmax, ymin, ymax ) {
  // returns true if poly is complete inside rectangle
  for (var i = 0; i < size; i++) {
    if (xArray[i] < xmin || xArray[i] > xmax || yArray[i] < ymin || yArray[i] > ymax) return false;
  }
  return true;
}

JsGraph.prototype.ClipIntersectionCoord = function( x1, y1, x2, y2, clipx ) {
  return (y2 - y1) * (clipx - x1) / (x2 - x1) + y1;
}

JsGraph.prototype.BezierCurveTo = function( cx1, cy1, cx2, cy2, ex, ey, mode ) {
  // or BezierCurveTo( cpt1, cpt2, ept, mode )
  // or BezierCurveTo( JsgPolygon, mode )
  // LastX/LastY: startpoint; cx1/cy1/cx2/cy2: control points; ex/ey: endpoint
  // mode: 1 -> draw border, 2 -> fill, 3 -> border and fill, default = 1
  // mode & 4 -> close curve by drawing a line from end point to start point

  if (JsgVect2.Ok(cx1))   return this.BezierCurve( this.LastX, this.LastY, cx1[0], cx1[1], cy1[0], cy1[1], cx2[0], cx2[1], cy2 );
  if (JsgPolygon.Ok(cx1)) return this.BezierCurve( this.LastX, this.LastY, sx.X[0], sx.Y[0], sx.X[1], sx.Y[1], sx.X[2], sx.Y[2], sy );

  mode = xDefNum( mode, 1 ) | 8;

  this.BezierCurve( this.LastX, this.LastY, cx1, cy1, cx2, cy2, ex, ey, mode );
  return this;
}

JsGraph.prototype.BezierCurve = function( sx, sy, cx1, cy1, cx2, cy2, ex, ey, mode, nSegments ) {
  // or BezierCurve( spt, cpt1, cpt2, ept, mode, nSegments )
  // or BezierCurve( JsgPolygon, mode, startIx, nSegments )
  // sx/sy: startpoint; cx1/cy1/cx2/cy2: ontrol points; ex/ey: endpoint
  // mode: 1 -> draw border, 2 -> fill, 3 -> border and fill, default = 1
  // mode & 4 -> close curve by drawing a line from end point to start point
  // mode & 8 -> continue path
  // if nSegments is defined then native bezier is replaced by BezierPolygon

  if (JsgVect2.Ok(sx)) {
    return this.BezierCurve( sx[0], sx[1], sy[0], sy[1], cx1[0], cx1[1], cy1[0], cy1[1], cx2, cx1 );
  }
  if (JsgPolygon.Ok(sx)) {
    var i = xDefNum( cx1, 0 ); // i = startIx
    return this.BezierCurve( sx.X[i], sx.Y[i], sx.X[i+1], sx.Y[i+1], sx.X[i+2], sx.Y[i+2], sx.X[i+3], sx.Y[i+3], sy, cy1 );
  }

  if (this.DisableNativeBezier || xNum(nSegments)) {

    this.BezierCurveAsPolygon( sx, sy, cx1, cy1, cx2, cy2, ex, ey, mode, nSegments );

  } else {

    this.DriverDrawBezierCurve( sx, sy, cx1, cy1, cx2, cy2, ex, ey, mode, nSegments );

  }

  return this;
}

JsGraph.prototype.MakeBezierPolygon = function( sx, sy, cx1, cy1, cx2, cy2, ex, ey, nSegments, add, polyRet ) {
  // or MakeBezierPolygon( poly, startIx, nSegments, add, polyRet )
  // or MakeBezierPolygon( s, c1, c2, e, nSegments, add, polyRet )
  // if add is true then bezier polygon is added to polyRet
  // polyRet: JsgPolygon(2D) or undefined
  // returns polyRet or this.WorkPoly2

  if (JsgVect2.Ok(sx)) {
    return this.MakeBezierPolygon(
      sx[0], sx[1], sy[0], sy[1], cx1[0], cx1[1], cy1[0], cy1[1], cx2, cy2, ex
    );
  }

  if (JsgPolygon.Ok(sx)) {
    polyRet = polyRet || this.WorkPoly2;
    var startIx = xDefNum( sy, 0 );
    if (sx.Size < startIx+4) {
      add = xDefBool( add, false );
      if (!add) polyRet.Reset();
      return polyRet;
    }

    var i = xDefNum( sy, 0 ); // startIx
    return this.MakeBezierPolygon(
      sx.X[i+0], sx.Y[i+0], sx.X[i+1], sx.Y[i+1], sx.X[i+2], sx.Y[i+2], sx.X[i+3], sx.Y[i+3], cx1, cy1, cx2
    );
  }

  nSegments = xDefNum( nSegments, this.NumBezierSegments );
  add = xDefBool( add, false );
  var polyRet = polyRet || this.WorkPoly2;
  if (!add) polyRet.Reset();
  var dt = 1 / nSegments;
  var tlast = 1 + dt / 2;
  for (var t = 0; t < tlast; t += dt) {
    var t2 = t * t;
    var t3 = t * t2;
    var mt = 1 - t;
    var mt2 = mt * mt;
    var mt3 = mt * mt2;
    var x = sx * mt3 + cx1 * 3 * mt2 * t + cx2 * 3 * mt * t2 + ex * t3;
    var y = sy * mt3 + cy1 * 3 * mt2 * t + cy2 * 3 * mt * t2 + ey * t3;
    polyRet.AddPoint( x, y );
  }
  return polyRet;
}

JsGraph.prototype.MakeSplineCurve = function( xArray, yArray, tension, mode, size, nSegments, polyRet ) {

  // or MakeSplineCurve( JsgPolygon, tension, mode, nSegments, polyRet )
  //
  // xArray, yArray: array of real coordinates
  //
  // tension: number; curve parameter usually between 0 and 1 (0.5 is a good value) but not restricted to this range
  //
  // mode: default = 0
  // mode & 4 -> draw closed spline
  // mode & 16 -> skip first segment if spline is not closed
  // mode & 32 -> skip last segment if spline is not closed
  // mode & 64 -> use endpoints as spline points, else use endpoints as bezier control points
  //
  // size -> specifies number of segments to draw from xArray and yArray; defaults to xArray.length
  // nSegments: 0 or undefined -> this.NumBezierSegments
  // polyRet: JsgPolygon or undefined
  //
  // returns polyRet or WorkPoly2, which contains the resulting spline polygon

  if (JsgPolygon.Ok(xArray)) {
    // MakeSplineCurve( JsgPolygon, tension, mode, polyRet )
    return this.MakeSplineCurve( xArray.X, xArray.Y, yArray, tension, xArray.Size, mode );
  }

  // compute bezier points and control points -> this.WorkPoly
  var bezierPoly = this.SplineCurve( xArray, yArray, tension, mode, size );

  // add bezier segments
  polyRet = polyRet || this.WorkPoly2;
  polyRet.Reset();
  first = 0;
  last = poly.Size - 1;
  // skip first / last bezier segment if they are spline control points
  if (!(mode & 4) && (mode & 64)) {
    if ((mode & 16) && (last-first > 3)) first += 3;
    if ((mode & 32) && (last-first > 3)) last -= 3;
  }

  for (var i = first; i < last; i += 3) {
    // MakeBezierPolygon( poly, startIx, nSegments, add, polyRet )
    this.MakeBezierPolygon( bezierPoly, i, nSegments, true, polyRet );
  }

  return polyRet;
}

JsGraph.prototype.BezierCurveAsPolygon = function( sx, sy, cx1, cy1, cx2, cy2, ex, ey, mode, nSegments ) {
  // private function
  nSegments = xDefNum( nSegments, this.NumBezierSegments );
  var poly = this.MakeBezierPolygon( sx, sy, cx1, cy1, cx2, cy2, ex, ey, nSegments );
  this.Polygon( poly, mode );
}

JsGraph.prototype.ComputeBezierControlPoints = function( poly, tension, last ) {

  // Computes Control Points for quadratic Bezier Curves defined in poly
  //
  // poly: CPolygon = { X: array of number, Y: array of number, Size: integer }
  // poly format: [ P0, C0b, C1a, P1, C1b, C2a, P2, C2b, C3a, P3, ... ]
  //
  // Note: places for control points C<i>a and C<i>b must already exist in poly
  // last: index of last pivot point (not poly index but original spline point index)
  //
  // source: http://scaledinnovation.com/analytics/splines/aboutSplines.html

  function LengthFor( side1, side2 ) {
    return Math.sqrt( side1 * side1 + side2 * side2 );
  }

  var fa, fb;
  var px = poly.X;
  var py = poly.Y;
  for (var i = 1; i <= last; i++) {
    var pivot = 3 * i;
    var left  = pivot - 3;
    var right = pivot + 3;
    var ca    = pivot - 1;
    var cb    = pivot + 1;
    var d01 = LengthFor( px[pivot] - px[left], py[pivot] - py[left] );
    var d12 = LengthFor( px[right] - px[pivot], py[right] - py[pivot] );
    var d = d01 + d12;
    if (d > 0) {
      fa = tension * d01 / d;
      fb = tension * d12 / d;
    } else {
      // note: d01 and d12 are also 0, so we are save if we set fa = fb = 0
      fa = 0;
      fb = 0;
    }
    var w = px[right] - px[left];
    var h = py[right] - py[left];
    px[ca] = px[pivot] - fa * w;
    py[ca] = py[pivot] - fa * h;
    px[cb] = px[pivot] + fb * w;
    py[cb] = py[pivot] + fb * h;
  }
}

JsGraph.prototype.SplineCurve = function( xArray, yArray, tension, mode, size ) {

  // or SplineCurve( JsgPolygon, tension, mode )
  //
  // xArray, yArray: array of real coordinates
  //
  // tension: number; curve parameter usually between 0 and 1 (0.5 is a good value) but not restricted to this range
  //
  // mode: 1 -> draw border, 2 -> fill, 3 -> border and fill, default = 1
  // mode & 4 -> draw closed spline
  // mode & 8 -> continue path
  // mode & 16 -> skip first segment if spline is not closed
  // mode & 32 -> skip last segment if spline is not closed
  // mode & 64 -> use endpoints as spline points, else use endpoints as bezier control points
  //
  // size -> specifies number of segments to draw from xArray and yArray; defaults to xArray.length
  //
  // returns WorkPoly, which contains all Bezier segments

  if (JsgPolygon.Ok(xArray)) {
    return this.SplineCurve( xArray.X, xArray.Y, yArray, tension, xArray.Size );
  }

  tension = xDefNum( tension, 0.5 );
  size = xDefNum( size, xArray.length );
  if (size < 2) return this;
  if (size == 2) {
    return this.Line( xArray[0], yArray[0], xArray[1], yArray[1], (mode & 8) > 0 );
  }

  // make intermediate polygon for points and controlpoints [ p1, cp12, cp21, p2, cp22, cp31, p3, ... ]
  var poly = this.WorkPoly.Reset();
  var first = 0;
  var last = size - 1;
  var nPoints = size;
  var firstIsControlPoint = (!(mode & 4) && (mode & 16) && !(mode & 64) && (nPoints >= 3));
  if (firstIsControlPoint) {
    first++;
    nPoints--;
  }
  var lastIsControlPoint = (!(mode & 4) && (mode & 32) && !(mode & 64) && (nPoints >= 3));
  if (lastIsControlPoint) {
    last--;
    nPoints--;
  }
  poly.AddPoint( xArray[first], yArray[first] );
  for (var i = first+1; i <= last; i++) {
    poly.AddPoint( 0, 0 ); // placeholder for control point 1
    poly.AddPoint( 0, 0 ); // placeholder for control point 2
    poly.AddPoint( xArray[i], yArray[i] );
  }
  var finalPolySize = poly.Size;

  if (mode & 4) {

    // closed spline: replicate first two points
    poly.AddPoint( 0, 0 );
    poly.AddPoint( 0, 0 );
    poly.AddPoint( xArray[0], yArray[0] );
    poly.AddPoint( 0, 0 );
    poly.AddPoint( 0, 0 );
    poly.AddPoint( xArray[1], yArray[1] );
    finalPolySize = poly.Size - 3;

  } else {

    // set first and last control point
    poly.X[1] = xArray[0];
    poly.Y[1] = yArray[0];
    var last = poly.Size - 2;
    poly.X[last] = xArray[size-1];
    poly.Y[last] = yArray[size-1];

  }

  // compute control points
  var last = (mode & 4) ? size : size - 2;
  if (firstIsControlPoint) last--;
  if (lastIsControlPoint) last--;
  this.ComputeBezierControlPoints( poly, tension, last );

  // closed spline: move control points of last extra segment to first segment and cutoff p1 from poly
  if (mode & 4) {
    var i = poly.Size - 3;
    poly.X[1] = poly.X[i];
    poly.Y[1] = poly.Y[i];
    poly.Size = finalPolySize;
  }

  // return if no draw mode is given
  if (!(mode & 3)) return this.WorkPoly;

  // open path to concatenate bezier segments
  var oldIsPathOpen = this.IsPathOpen;
  if (!oldIsPathOpen) {
    this.OpenPath();
  }

  // draw bezier segments
  first = 0;
  last = poly.Size - 1;
  // skip first / last bezier segment from drawing if they are spline control points
  if (!(mode & 4) && (mode & 64)) {
    if ((mode & 16) && (last-first > 3)) first += 3;
    if ((mode & 32) && (last-first > 3)) last -= 3;
  }
  // clear flags 4, 16, 32, 64 (close, skip first, skip last) -> keep flags 1+2+8 = 11
  var closedBorder = ((mode & 5) == 5);
  mode = mode & 11;
  for (var i = first; i < last; i += 3) {

    this.BezierCurve( poly, mode, i );

    mode |= 8; // continue path
  }

  if (!oldIsPathOpen) {

    if (closedBorder) {
      var ctx = this.Context2D
      var oldCap = ctx.lineCap;
      ctx.lineCap = 'round';

      this.Path( mode & 3 );

      ctx.lineCap = oldCap;

    } else {

      this.Path( mode & 3 );

    }
  }

  return this.WorkPoly;
}

JsGraph.prototype.GetTextSize = function( txt, w ) {
  // Gets Text Size without padding
  // w optional with of limiting text box
  // returns WorkRect: JsgRect with box size in w and h; x = 0, y = 0

  var box = this.WorkRect;
  box.SetPos( 0, 0 );

  if (this.TextCanvasRendering) {

    this.GetCanvasTextSize( txt, box );

  } else {

    w = xDefNum( w, 0 );
    this.HtmlTextHandler.GetTextSize( txt, w, box );

  }

  box.w /= Math.abs( this.CurrTrans.ScaleX );
  box.h /= Math.abs( this.CurrTrans.ScaleY );

  return box;
}

JsGraph.prototype.GetTextBox = function( txt, x, y, w ) {
  // or GetTextBox( txt, pt, w )
  // x, y: real text reference point; pt: JsgVect2
  // w: optional with of limiting text box in current coordinates (ignored when TextRendering = 'canvas')
  // returns WorkRect: JsgRect
  //
  // You can draw the computed text box with the function JsGraph:RectWH()
  // Note: compared with GetTextSize the box may be corrected if it overlaps with canvas border.
  // Note: ObjTrans is not applied to x and y!

  if (!xDef(x)) return this.GetTextBox( txt, 0, 0 );
  if (JsgVect2.Ok(x)) return this.GetTextBox( txt, x[0], x[1], y );

  var box = this.WorkRect;
  w = xDefNum( w, 0 );
  var ctr = this.CurrTrans;
  var cnvsX = ctr.TransX( x );
  var cnvsY = ctr.TransY( y );

  if (this.TextCanvasRendering) {

    this.GetCanvasTextBox( txt, cnvsX, cnvsY, box );

  } else {

    this.HtmlTextHandler.GetTextBox( txt, cnvsX, cnvsY, w, box );

  }

  // trick: to get the least or most negativ edge for all trans, compute the edge over the box center:
  var cx = ctr.InvTransX( box.x + (box.w / 2) );
  var cy = ctr.InvTransY( box.y + (box.h / 2 ) );
  box.w = box.w / Math.abs(ctr.ScaleX);
  box.h = box.h / Math.abs(ctr.ScaleY);
  box.x = cx - box.w / 2;
  box.y = cy - box.h / 2;

  return box;
}

JsGraph.prototype.Text = function( txt, x, y, WidthOrMode ) {
  // or Text( txt, pt, WidthOrMode )
  // x, y: real text reference point
  // w: optional limiting text rectangle width in pixels
  // mode: default = 0: (canvas text only)
  // 0 -> fill using TextColor, 1 -> stroke using LineColor, 2 -> fill using BgColor, 3 -> fill and stroke (canvas text only)
  // x is left, center or right coordinate, depending on horizontal align
  // y is top, middle or bottom coordinate, depending on vertical align

  if (JsgVect2.Ok(x)) return this.Text( txt, x[0], x[1], y );

  WidthOrMode = xDefNum( WidthOrMode, 0 );

  var ctr = this.CurrTrans;
  ctr.ObjTransXY( this.GetObjTrans(), x, y );

  if (this.GraphClipEnabled && !this.IsPointInsideRect( ctr.x, ctr.y, this.GraphClipOuterXmin, this.GraphClipOuterXmax, this.GraphClipOuterYmin, this.GraphClipOuterYmax )) {
    // if text position is outside clipping range don't draw text
    return this;
  }

  if (this.TextCanvasRendering) {

    this.DrawCanvasText( txt, ctr.x, ctr.y, WidthOrMode );

  } else {

    this.HtmlTextHandler.DrawText( txt, ctr.x, ctr.y, WidthOrMode );

  }
  return this;
}

JsGraph.prototype.TextBox = function( txt, x, y, mode, roll, width ) {
  // or Text( txt, pt, mode, roll, width )
  // draws the textbox for txt at pos x,y taking into account object transformation, text alignment, rotation and padding
  // x, y: text reference point
  // mode: 1 -> draw border, 2 -> fill, 3 -> border and fill, default = 1
  // mode & 4 -> inverse drawing direction for holes
  // mode & 8 -> continue path
  // width: optional limiting text rectangle width in pixels (only for TextRendering = 'html')

  if (JsgVect2.Ok(x)) return this.TextBox( txt, x[0], x[1], y, mode, roll );

  if (this.TextCanvasRendering) {

    var objTrans = this.SaveTrans( true );
    this.TransMove( -x, -y );
    this.TransScale( this.CurrTrans.ScaleX, this.CurrTrans.ScaleY );
    this.TransRotate( this.TextRotation );
    this.TransScale( 1 / this.CurrTrans.ScaleX, 1 / this.CurrTrans.ScaleY );
    this.TransMove( x, y );
    this.AddTrans( objTrans );
    this.Rect( this.GetTextBox( txt, x, y ), mode, roll );
    this.RestoreTrans();

  } else {

    this.Rect( this.GetTextBox( txt, x, y, width ), mode, roll );

  }
  return this;
}

JsGraph.prototype.DrawCanvasText = function( txt, x, y, mode ) {
  // private function
  // x, y: in current coord system

  this.SetCanvasFont();
  var ctr = this.CurrTrans;
  var otr = this.ObjTrans;
  var ctx = this.Context2D;

  var oldFillStyle = ctx.fillStyle;

  if (mode == 0) {
    // fill text with TextColor
    mode = 2;
    ctx.fillStyle = this.TextColor;
  }

  if (!otr.IsUnitTrans || this.TextRotation != 0) {
    // handle object transformation
    ctx.setTransform( 1, 0, 0, 1, 0, 0 );
    ctx.scale( this.ContextScale, this.ContextScale );
    ctx.translate( x, y );
    ctx.scale( ctr.ScaleX, ctr.ScaleY );
    ctx.transform( otr.a00, otr.a10, otr.a01, otr.a11, 0, 0 );
    ctx.scale( 1/ctr.ScaleX, 1/ctr.ScaleY );
    ctx.rotate( this.AngleToRad( this.TextRotation ) );
    x = y = 0;
  }

  var box = this.WorkRect;
  this.GetCanvasTextSize( txt, box );
  box.w += 2 * this.CanvasTextHPad;
  box.h += 2 * this.CanvasTextVPad;
  if (this.TextHAlign == 'left')   x += box.w / 2;
  if (this.TextHAlign == 'right')  x -= box.w / 2;
  if (this.TextVAlign == 'top')    y += box.h / 2;
  if (this.TextVAlign == 'bottom') y -= box.h / 2;

  if (mode & 2) {
    ctx.fillText( txt, x, y );
  }
  if (mode & 1) {
    ctx.strokeText( txt, x, y );
  }

  if (!otr.IsUnitTrans || this.TextRotation != 0) {
    // Reinitialize Transform to Unity + Scale( this.ContextScale )
    ctx.setTransform( 1, 0, 0, 1, 0, 0 );
    ctx.scale( this.ContextScale, this.ContextScale );
  }
  ctx.fillStyle = oldFillStyle;
}

JsGraph.prototype.GetCanvasTextSize = function( txt, box ) {
  // private function: modifies box.w and box.h but not box.x and box.h
  // box: JsgRect
  this.SetCanvasFont();
  var data = this.Context2D.measureText( txt );
  box.SetSize( data.width, this.CanvasFontSize );
}

JsGraph.prototype.GetCanvasTextBox = function( txt, x, y, box ) {
  // private function: modifies box.w and box.h and corrects box.x and box.h with alignment and padding
  // x, y: reference point in canvas coordinates
  // box: JsgRect
  // output (box.x, box.y) is top left corner in canvas coordinates
  this.GetCanvasTextSize( txt, box );
  box.SetPos( x, y);
  box.w += 2 * this.CanvasTextHPad;
  box.h += 2 * this.CanvasTextVPad;
  var hAlign = this.TextHAlign;
  if (hAlign == 'justify') hAlign = 'center';
  var vAlign = this.TextVAlign;
  if (hAlign == 'center') box.x -= box.w / 2;
  if (hAlign == 'right' ) box.x -= box.w;
  if (vAlign == 'middle' ) box.y -= box.h / 2;
  if (vAlign == 'bottom' ) box.y -= box.h;
}

JsGraph.prototype.SetCanvasFont = function() {
  // private function
  if (!this.TextCanvasRendering || this.CTextCurrFontVers == this.CTextLastFontVers) return;
  this.CTextLastFontVers = this.CTextCurrFontVers;

  var ctx = this.Context2D;
  var attr = '';
  if (this.FontStyle == 'italic') attr += 'italic ';
  if (this.FontWeight == 'bold') attr += 'bold ';
  attr += this.CanvasFontSize + 'px ';
  if (this.CanvasLineHeight > 0) attr += '/ ' + this.CanvasLineHeight + 'px ';
  if (this.CanvasLineHeight == 0) attr += '/ 100% ';
  attr += this.TextFont;
  ctx.font = attr;

  // always use this text align
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
}

// axes and grids

JsGraph.prototype.StartXright = function( x, dx, winBorderLeft ) {
  if ( x < winBorderLeft ) {
    // move x into window
    x = Math.floor( winBorderLeft / dx ) * dx;
    if ( x < winBorderLeft ) x += dx;
    // assert( x >= winBorderLeft );
  }
  return x;
}

JsGraph.prototype.StartXleft = function( x, dx, winBorderRight ) {
  if ( x > winBorderRight ) {
    // move x into window
    x = - Math.floor( -winBorderRight / dx ) * dx;
    if ( x > winBorderRight ) x -= dx;
    // assert( x <= winBorderRight );
  }
  return x;
}

JsGraph.prototype.StartYup = function( y, dy, winBorderBottom ) {
  if ( y < winBorderBottom ) {
    // move y into window
    y = Math.floor( winBorderBottom / dy ) * dy;
    if ( y < winBorderBottom ) y += dy;
    // assert( y >= winBorderBottom );
  }
  return y;
}

JsGraph.prototype.StartYdown = function( y, dy, winBorderTop ) {
  if ( y > winBorderTop ) {
    // move y into window
    y = - Math.floor( -winBorderTop / dy ) * dy;
    if ( y > winBorderTop ) y -= dy;
    // assert( y <= winBorderTop );
  }
  return y;
}

JsGraph.prototype.Frame = function( mode ) {
  // draws frame fully inside window/viewport
  mode = xDefNum( mode, 1 );
  var oldTrans = this.SelectTrans('viewport');
  var oldObjTransEnable = this.ObjTrans.Enable( false );
  var oldLineJoin = this.LineJoin;
  var lwh = this.Context2D.lineWidth / 2 - 0.5;
  this.SetLineJoin( 'miter' );

  this.Rect( lwh, lwh, this.VpInnerWidth-lwh, this.VpInnerHeight-lwh, mode );

  this.SetLineJoin( oldLineJoin );
  this.ObjTrans.Enable( oldObjTransEnable );
  this.SelectTrans( oldTrans );
}

JsGraph.prototype.GetFrame = function() {
  // returns limits of current view (canvas, viewport or window)
  // { xmin, ymin, xmax, ymax }
  var rect = this.GetFrameRect();
  return { xmin: rect.x, ymin: rect.y, xmax: rect.x+rect.w, ymax: rect.y+rect.h };
}

JsGraph.prototype.GetFrameRect = function() {
  var rect = this.GetTransRect();
  if (this.Trans == 'viewport') {
    rect.w = this.VpInnerWidth;
    rect.h = this.VpInnerHeight;
  }
  return rect;
}

JsGraph.prototype.GetTransRect = function( aTrans ) {
  // get geom of transformation aTrans or this.Trans
  if (!xStr(aTrans) || !this.TransByName[aTrans]) aTrans = this.Trans;
  var trans = this.TransByName[aTrans];
  return new JsgRect( trans.Xmin, trans.Ymin, trans.Width, trans.Height );
}

JsGraph.prototype.GetCanvasRect = function() {
  return new JsgRect( 0, 0, this.CanvasWidth, this.CanvasHeight );
}

JsGraph.prototype.GetViewportRect = function() {
  // returns bounding box rect of current viewport in canvas coordinates (integers)
  var xmin = Math.floor( this.VpXmin );
  var ymin = Math.floor( this.VpYmin );
  var xmax = Math.floor( this.VpXmin + this.VpWidth + 0.9999 );
  var ymax = Math.floor( this.VpYmin + this.VpHeight + 0.9999 );
  return new JsgRect( xmin, ymin, xmax-xmin, ymax-ymin );
}

JsGraph.prototype.GetViewportDeviceRect = function( box ) {
  // returns bounding box rect of current vierport in device pixel coordinates
  var xmin = Math.floor( this.VpXmin * this.DevicePixelRatio );
  var ymin = Math.floor( this.VpYmin * this.DevicePixelRatio );
  var xmax = Math.floor( (this.VpXmin + this.VpWidth) * this.DevicePixelRatio + 0.9999 );
  var ymax = Math.floor( (this.VpYmin + this.VpHeight) * this.DevicePixelRatio + 0.9999 );
  return new JsgRect( xmin, ymin, xmax-xmin, ymax-ymin );
}

JsGraph.prototype.Grid = function( xTic, yTic, skipZero, skipLimit ) {
  this.GridX( xTic, skipZero, skipLimit );
  this.GridY( yTic, skipZero, skipLimit );
}

JsGraph.prototype.GridX = function( dx, skipZero, skipLimit ) {
  dx = xDefNum( dx, 1 );
  if (dx <= 0) return;
  skipZero = xDefBool( skipZero, true );
  skipLimit = xDefBool( skipLimit, false );
  var ctr = this.CurrTrans;
  var box = this.GetFrame();
  var ctx = this.Context2D;
  // if dx - lineWidth is smaller then 1 devicePixel, don't draw the grid
  var deviceLineSpacing = (Math.abs(ctr.ScaleX * dx) - ctx.lineWidth) * this.DevicePixelRatio;
  if (deviceLineSpacing < 1) return;

  var cnvsYmin = ctr.TransY( box.ymin );
  var cnvsYmax = ctr.TransY( box.ymax );
  if (box.xmin > box.xmax) { var tmp = box.xmin; box.xmin = box.xmax; box.xmax = tmp; }
  var epsX = 1.0 / Math.abs(ctr.ScaleX);
  ctx.beginPath();
  if (box.xmax >= 0) {
    var x = this.StartXright( ((skipZero) ? dx : 0), dx, box.xmin );
    var xEnd = box.xmax + epsX;
    if (skipLimit) xEnd -= dx;
    while (x <= xEnd) {
      var cnvsX = ctr.TransX( x );
      ctx.moveTo( cnvsX, cnvsYmin );
      ctx.lineTo( cnvsX, cnvsYmax );
      x += dx;
    }
  }
  if (box.xmin <= 0) {
    var x = this.StartXleft( -dx, dx, box.xmax );
    var xEnd = box.xmin - epsX;
    if (skipLimit) xEnd += dx;
    while (x >= xEnd) {
      var cnvsX = ctr.TransX( x );
      ctx.moveTo( cnvsX, cnvsYmin );
      ctx.lineTo( cnvsX, cnvsYmax );
      x -= dx;
    }
  }
  var oldCap = ctx.lineCap;
  ctx.lineCap = 'butt';
  ctx.stroke();
  ctx.lineCap = oldCap;
}

JsGraph.prototype.GridY = function( dy, skipZero, skipLimit ) {
  dy = xDefNum( dy, 1 );
  if (dy <= 0) return;
  skipZero = xDefBool( skipZero, true );
  skipLimit = xDefBool( skipLimit, false );
  var ctr = this.CurrTrans;
  var box = this.GetFrame();
  var ctx = this.Context2D;
  // if dy - lineWidth is smaller then 1 devicePixel, don't draw the grid
  var deviceLineSpacing = (Math.abs(ctr.ScaleY * dy) - ctx.lineWidth) * this.DevicePixelRatio;
  if (deviceLineSpacing < 1) return;

  var cnvsXmin = ctr.TransX( box.xmin );
  var cnvsXmax = ctr.TransX( box.xmax );
  if (box.ymin > box.ymax) { var tmp = box.ymin; box.ymin = box.ymax; box.ymax = tmp; }
  var epsY = 1.0 / Math.abs(ctr.ScaleY);
  ctx.beginPath();
  if (box.ymax >= 0) {
    var y = this.StartYup( ((skipZero) ? dy : 0), dy, box.ymin );
    var yEnd = box.ymax + epsY;
    if (skipLimit) yEnd -= dy;
    while (y <= yEnd) {
      var cnvsY = ctr.TransY( y );
      ctx.moveTo( cnvsXmin, cnvsY );
      ctx.lineTo( cnvsXmax, cnvsY );
      y += dy;
    }
  }
  if (box.ymin <= 0) {
    var y = this.StartYdown( -dy, dy, box.ymax );
    var yEnd = box.ymin - epsY;
    if (skipLimit) yEnd += dy;
    while (y >= yEnd) {
      var cnvsY = ctr.TransY( y );
      ctx.moveTo( cnvsXmin, cnvsY );
      ctx.lineTo( cnvsXmax, cnvsY );
      y -= dy;
    }
  }
  var oldCap = ctx.lineCap;
  ctx.lineCap = 'butt';
  ctx.stroke();
  ctx.lineCap = oldCap;
}

JsGraph.prototype.Axes = function( xPos, yPos, ArrowSymbol, ArrowSize ) {
  this.AxesX( yPos, ArrowSymbol, ArrowSize );
  this.AxesY( xPos, ArrowSymbol, ArrowSize );
}

JsGraph.prototype.AxesX = function( yPos, ArrowSymbol, ArrowSize ) {
  yPos = xDefNum( yPos, 0 );
  ArrowSymbol = xDefStr( ArrowSymbol, '' );
  ArrowSize = xDefNum( ArrowSize, 8 );
  var box = this.GetFrame();
  var xMin = box.xmin;
  var xMax = box.xmax;
  if (xMin > xMax) { var tmp = xMin; xMin = xMax; xMax = tmp; }
  var yMin = box.ymin;
  var yMax = box.ymax;
  if (yMin > yMax) { var tmp = yMin; yMin = yMax; yMax = tmp; }
  var ctx = this.Context2D;
  var oldCap = ctx.lineCap;
  var oldObjTransEnable = this.ObjTrans.Enable( false );
  ctx.lineCap = 'butt';
  if (yPos >= yMin && yPos <= yMax) {
    if (ArrowSymbol != '') {
      this.SetMarkerSymbol( ArrowSymbol );
      this.SetMarkerSize( ArrowSize );
      this.Arrow( xMin, yPos, xMax, yPos, 9 );
    } else {
      this.Line( xMin, yPos, xMax, yPos );
    }
  }
  ctx.lineCap = oldCap;
  this.ObjTrans.Enable( oldObjTransEnable );
}

JsGraph.prototype.AxesY = function( xPos, ArrowSymbol, ArrowSize ) {
  xPos = xDefNum( xPos, 0 );
  ArrowSymbol = xDefStr( ArrowSymbol, '' );
  ArrowSize = xDefNum( ArrowSize, 8 );
  var box = this.GetFrame();
  var xMin = box.xmin;
  var xMax = box.xmax;
  if (xMin > xMax) { var tmp = xMin; xMin = xMax; xMax = tmp; }
  var yMin = box.ymin;
  var yMax = box.ymax;
  if (yMin > yMax) { var tmp = yMin; yMin = yMax; yMax = tmp; }
  var ctx = this.Context2D;
  var oldCap = ctx.lineCap;
  var oldObjTransEnable = this.ObjTrans.Enable( false );
  ctx.lineCap = 'butt';
  if (xPos >= xMin && xPos <= xMax) {
    if (ArrowSymbol != '') {
      this.SetMarkerSymbol( ArrowSymbol );
      this.SetMarkerSize( ArrowSize );
      this.Arrow( xPos, yMin, xPos, yMax, 9 );
    } else {
      this.Line( xPos, yMin, xPos, yMax );
    }
  }
  ctx.lineCap = oldCap;
  this.ObjTrans.Enable( oldObjTransEnable );
}

JsGraph.prototype.TicsX = function( yPos, dx, ticUp, ticDown, skipZero, skipLimit ) {
  // yPos: real y coordinate of x axes
  // dx: real distance between two tics on x axes
  // ticUp, ticDown: real tics size in pixels
  yPos = xDefNum( yPos, 0 );
  dx = xDefNum( dx, 1 );
  if (dx <= 0) return;
  ticUp = xDefNum( ticUp, 3 );
  ticDown = xDefNum( ticDown, ticUp );
  skipZero = xDefBool( skipZero, true );
  skipLimit = xDefBool( skipLimit, false );
  if (this.AutoScalePix) {
    ticUp = this.ScalePix( ticUp, this.ScalePixInt );
    ticDown = this.ScalePix( ticDown, this.ScalePixInt );
  }
  var ctr = this.CurrTrans;
  var box = this.GetFrame();
  var cnvsY = ctr.TransY( yPos );
  var ctx = this.Context2D;
  // if dx - lineWidth is smaller then 1 devicePixel, don't draw the tics
  var deviceLineSpacing = (Math.abs(ctr.ScaleX * dx) - ctx.lineWidth) * this.DevicePixelRatio;
  if (deviceLineSpacing < 1) return;

  if (box.xmin > box.xmax) { var tmp = box.xmin; box.xmin = box.xmax; box.xmax = tmp; }
  var epsX = 1.0 / Math.abs(ctr.ScaleX);
  ctx.beginPath();
  if ( box.xmax >= 0 ) {
    var x = this.StartXright( ((skipZero) ? dx : 0), dx, box.xmin );
    var xEnd = box.xmax + epsX;
    if ( skipLimit ) xEnd -= dx;
    while ( x <= xEnd ) {
      var cnvsX = ctr.TransX( x );
      ctx.moveTo( cnvsX, cnvsY-ticUp );
      ctx.lineTo( cnvsX, cnvsY+ticDown );
      x += dx;
    }
  }
  if ( box.xmin <= 0 ) {
    var x = this.StartXleft( -dx, dx, box.xmax );
    var xEnd = box.xmin - epsX;
    if ( skipLimit ) xEnd += dx;
    while ( x >= xEnd ) {
      var cnvsX = ctr.TransX( x );
      ctx.moveTo( cnvsX, cnvsY-ticUp );
      ctx.lineTo( cnvsX, cnvsY+ticDown );
      x -= dx;
    }
  }
  var oldCap = ctx.lineCap;
  ctx.lineCap = 'butt';
  ctx.stroke();
  ctx.lineCap = oldCap;
}

JsGraph.prototype.TicsY = function( xPos, dy, ticRight, ticLeft, skipZero, skipLimit ) {
  // xPos: real x coordinate of y axes
  // dy: real distance between two tics on y axes
  // ticLeft, ticRight: real tics size in pixels
  xPos = xDefNum( xPos, 0 );
  dy = xDefNum( dy, 1 );
  if (dy <= 0) return;
  ticRight = xDefNum( ticRight, 3 );
  ticLeft = xDefNum( ticLeft, ticRight );
  skipZero = xDefBool( skipZero, true );
  skipLimit = xDefBool( skipLimit, false );
  if (this.AutoScalePix) {
    ticRight = this.ScalePix( ticRight, this.ScalePixInt );
    ticLeft = this.ScalePix( ticLeft, this.ScalePixInt );
  }
  var ctr = this.CurrTrans;
  var box = this.GetFrame();
  var cnvsX = ctr.TransX( xPos );
  var ctx = this.Context2D;
  // if dy - lineWidth is smaller then 1 devicePixel, don't draw the grid
  var deviceLineSpacing = (Math.abs(ctr.ScaleY * dy) - ctx.lineWidth) * this.DevicePixelRatio;
  if (deviceLineSpacing < 1) return;

  if (box.ymin > box.ymax) { var tmp = box.ymin; box.ymin = box.ymax; box.ymax = tmp; }
  var epsY = 1.0 / Math.abs(ctr.ScaleY);
  ctx.beginPath();
  if ( box.ymax >= 0 ) {
    var y = this.StartYup( ((skipZero) ? dy : 0), dy, box.ymin );
    var yEnd = box.ymax + epsY;
    if ( skipLimit ) yEnd -= dy;
    while ( y <= yEnd ) {
      var cnvsY = ctr.TransY( y );
      ctx.moveTo( cnvsX-ticLeft, cnvsY );
      ctx.lineTo( cnvsX+ticRight, cnvsY );
      y += dy;
    }
  }
  if ( box.ymin <= 0 ) {
    var y = this.StartYdown( -dy, dy, box.ymax );
    var yEnd = box.ymin - epsY;
    if ( skipLimit ) yEnd += dy;
    while ( y >= yEnd ) {
      var cnvsY = ctr.TransY( y );
      ctx.moveTo( cnvsX-ticLeft, cnvsY );
      ctx.lineTo( cnvsX+ticRight, cnvsY );
      y -= dy;
    }
  }
  var oldCap = ctx.lineCap;
  ctx.lineCap = 'butt';
  ctx.stroke();
  ctx.lineCap = oldCap;
}

JsGraph.prototype.MakeLabel = function( value, scale, digits, unit ) {
  var v = (value * scale).toFixed(digits);
  if (!xStr(unit) || unit == '') return v;
  if (unit.indexOf('(#)') < 0) return v + unit;
  return unit.replace( /\(#\)/, v );
}

JsGraph.prototype.TicLabelsX = function( yPos, dx, yOff, scale, digits, skipZero, skipLimit, aUnit ) {
  // yPos: real y coordinate of x axes
  // dx: real distance between two tics on x axes
  // yOff: real offset in pixels: > 0 for label yOff above yPos, < 0 for under yPos
  // labels can be scaled by a factor of scale; use 1 if no scaling is required
  // digits: int [0..20]. specifies number of digits after decimal point
  // set TextAlign, TextSize, FontStyle, TextRotation and Color before as you wish
  yPos = xDefNum( yPos, 0 );
  dx = xDefNum( dx, 1 );
  if (dx <= 0) return;
  yOff = xDefNum( yOff, -4 );
  scale = xDefNum( scale, 1 );
  digits = xDefNum( digits, 0 );
  skipZero = xDefBool( skipZero, true );
  skipLimit = xDefBool( skipLimit, true );
  aUnit = xDefStr( aUnit, '' );
  if (this.AutoScalePix) yOff = this.ScalePix( yOff, this.ScalePixInt );

  var ctr = this.CurrTrans;
  var frame = this.GetFrame();
  var oldAlign = this.TextVAlign;
  var oldHPad = this.TextHPad;
  var oldVPad = this.TextVPad;
  this.SetTextVAlign( ((yOff < 0) ? 'top' : 'bottom') );
  this.SetTextPadding( 0 );

  if (frame.xmin > frame.xmax) { var tmp = frame.xmin; frame.xmin = frame.xmax; frame.xmax = tmp; }
  var epsX = 1.0 / Math.abs(ctr.ScaleX);

  // compute biggest textbox and increment dx so that boxes never collide
  var box = this.GetTextSize( this.MakeLabel( frame.xmin, scale, digits, aUnit )+'m' );
  var maxw = box.w;
  box = this.GetTextSize( this.MakeLabel( frame.xmax, scale, digits, aUnit )+'m' );
  if (box.w > maxw) maxw = box.w;
  var ddx = (Math.floor(maxw/dx) + 1) * dx;

  var oldObjTransEnable = this.ObjTrans.Enable( false );
  var y = ctr.InvTransY( ctr.TransY( yPos ) - yOff );
  if (frame.xmax >= 0) {
    var x = this.StartXright( ((skipZero) ? ddx : 0), ddx, frame.xmin );
    var xEnd = frame.xmax + epsX;
    if (skipLimit) xEnd -= ddx;
    while (x <= xEnd) {
      this.Text( this.MakeLabel( x, scale, digits, aUnit ), x, y );
      x += ddx;
    }
  }
  if (frame.xmin <= 0) {
    var x = this.StartXleft( -ddx, ddx, frame.xmax );
    var xEnd = frame.xmin - epsX;
    if (skipLimit) xEnd += ddx;
    while (x >= xEnd) {
      this.Text( this.MakeLabel( x, scale, digits, aUnit ), x, y );
      x -= ddx;
    }
  }
  this.SetTextVAlign( oldAlign );
  this.SetTextPadding( oldHPad, oldVPad );
  this.ObjTrans.Enable( oldObjTransEnable );
}

JsGraph.prototype.TicLabelsY = function( xPos, dy, xOff, scale, digits, skipZero, skipLimit, aUnit ) {
  // xPos: real x coordinate of y axes
  // dy: real distance between two tics on y axes
  // xOff: real offset in pixels: positiv for label xOff right of xPos, negativ for left of xPos
  // labels can be scaled by a factor of scale; use 1 if no scaling is required
  // digits: int [0..20]. specifies number of digits after decimal point
  // set TextVAlign, TextSize, FontStyle and Color before as you wish
  xPos = xDefNum( xPos, 0 );
  dy = xDefNum( dy, 1 );
  if (dy <= 0) return;
  xOff = xDefNum( xOff, -4 );
  scale = xDefNum( scale, 1 );
  digits = xDefNum( digits, 0 );
  skipZero = xDefBool( skipZero, true );
  skipLimit = xDefBool( skipLimit, true );
  aUnit = xDefStr( aUnit, '' );
  if (this.AutoScalePix) xOff = this.ScalePix( xOff, this.ScalePixInt );

  var ctr = this.CurrTrans;
  var frame = this.GetFrame();
  var oldAlign = this.TextHAlign;
  var oldHPad = this.TextHPad;
  var oldVPad = this.TextVPad;
  this.SetTextHAlign( ((xOff < 0) ? 'right' : 'left') );
  this.SetTextPadding( 0 );

  if (frame.ymin > frame.ymax) { var tmp = frame.ymin; frame.ymin = frame.ymax; frame.ymax = tmp; }
  var epsY = 1.0 / Math.abs(ctr.ScaleY);

  // compute biggest textbox and increment dy so that boxes never collide
  var box = this.GetTextSize( this.MakeLabel( frame.ymax, scale, digits, aUnit ) );
  var maxh = box.h;
  var ddy = (Math.floor(maxh/dy) + 1) * dy;

  var oldObjTransEnable = this.ObjTrans.Enable( false );
  var x = ctr.InvTransX( ctr.TransX( xPos ) + xOff );
  if (frame.ymax >= 0) {
    var y = this.StartYup( ((skipZero) ? ddy : 0), ddy, frame.ymin );
    var yEnd = frame.ymax + epsY;
    if (skipLimit) yEnd -= ddy;
    while (y <= yEnd) {
      this.Text( this.MakeLabel( y, scale, digits, aUnit ), x, y );
      y += ddy;
    }
  }
  if (frame.ymin <= 0) {
    var y = this.StartYdown( -ddy, ddy, frame.ymax );
    var yEnd = frame.ymin - epsY;
    if (skipLimit) yEnd += ddy;
    while (y >= yEnd) {
      this.Text( this.MakeLabel( y, scale, digits, aUnit ), x, y );
      y -= ddy;
    }
  }
  this.SetTextHAlign( oldAlign );
  this.SetTextPadding( oldHPad, oldVPad );
  this.ObjTrans.Enable( oldObjTransEnable );
}

JsGraph.prototype.MakeMarkers = function() {
  // coordinates in viewport
  this.MarkerName = [ 'ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'Circle', 'Square', 'Diamond', 'Triangle', 'Triangle2', 'Star4', 'Star5', 'Star6', 'Plus', 'Cross', 'Star', 'Arrow1', 'Arrow2' ];
  this.Markers = {
    ArrowLeft:  [ { type: 'Polygon', x: [ 0, 1, 1 ], y: [ 0, 0.5, -0.5 ] } ],
    ArrowRight: [ { type: 'Polygon', x: [ 0, -1, -1 ], y: [ 0, -0.5, 0.5 ] } ],
    ArrowDown:  [ { type: 'Polygon', x: [ 0, 0.5, -0.5 ], y: [ 0, -1, -1 ] } ],
    ArrowUp:    [ { type: 'Polygon', x: [ 0, -0.5, 0.5 ], y: [ 0, 1, 1 ] } ],
    Circle:     [ { type: 'Circle', x: 0, y: 0, r: -0.5 } ],
    Square:     [ { type: 'Polygon', x: [ -0.5, 0.5, 0.5, -0.5 ], y: [ 0.5, 0.5, -0.5, -0.5 ] } ],
    Diamond:    [ { type: 'Polygon', x: [ 0, 0.5, 0, -0.5 ], y: [ 0.5, 0, -0.5, 0 ] } ],
    Triangle:   [ { type: 'Polygon', x: [ -0.5, 0.5, 0 ], y: [ 0.289, 0.289, -0.577 ] } ],
    Triangle2:  [ { type: 'Polygon', x: [ 0, 0.5, -0.5 ], y: [ 0.577, -0.289, -0.289 ] } ],
    Star4:      [ { type: 'Polygon', x: [ 0.5, 0.125, 0, -0.125, -0.5, -0.125, 0, 0.125 ], y: [ 0, -0.125, -0.5, -0.125, 0, 0.125, 0.5, 0.125 ] } ],
    Star5:      [ { type: 'Polygon', x: [ 0, -0.112, -0.433, -0.182, -0.294, 0, 0.294, 0.182, 0.475, 0.112 ], y: [ -0.5, -0.155, -0.155, 0.059, 0.405, 0.155, 0.405, 0.059, -0.155, -0.155 ] } ],
    Star6:      [ { type: 'Polygon', x: [ 0, -0.145, -0.433, -0.25, -0.433, -0.145, 0, 0.145, 0.433, 0.25, 0.433, 0.145 ], y: [ -0.5, -0.25, -0.25, 0, 0.25, 0.25, 0.5, 0.25, 0.25, 0, -0.25, -0.25 ] } ],
    Plus:       [ { type: 'Line', x1: -0.5, y1: 0, x2: 0.5, y2: 0 }, { type: 'Line', x1: 0, y1: -0.5, x2: 0, y2: 0.5 } ],
    Cross:      [ { type: 'Line', x1: -0.5, y1: 0.5, x2: 0.5, y2: -0.5 }, { type: 'Line', x1: -0.5, y1: -0.5, x2: 0.5, y2: 0.5 } ],
    Star:       [ { type: 'Line', x1: -0.5, y1: 0, x2: 0.5, y2: 0 },
                  { type: 'Line', x1: -0.25, y1: -0.433, x2: 0.25, y2: 0.433 },
                  { type: 'Line', x1: -0.25, y1: 0.433, x2: 0.25, y2: -0.433 } ],
    Arrow1:     [ { type: 'Polygon', x: [ 0, -1.5, -1.5 ], y: [ 0, -0.375, 0.375 ] } ],
    Arrow2:     [ { type: 'Polygon', x: [ 0, -1.5, -1.25, -1.5 ], y: [ 0, -0.375, 0, 0.375 ] } ]
  };
}

JsGraph.prototype.ScaleAndMovePoly = function( poly, scale, moveX, moveY ) {
  var len = poly.Size;
  for (var i = 0; i < len; i++) {
    poly.X[i] = poly.X[i] * scale + moveX;
    poly.Y[i] = poly.Y[i] * scale + moveY;
  }
}

JsGraph.prototype.ScaleAndMoveCoord = function( coord, scale, move ) {
  return coord * scale + move;
}

JsGraph.prototype.Marker = function( x, y, mode, mat, size ) {
  // Marker( x:Number, y:Number, mode, mat )
  // Marker( pt:JsgVect2, mode, mat )
  // Marker( xArr:Array, yArr:Array, mode, mat, size )
  // Marker( poly:JsgPolygon, mode, mat )
  //
  // mode: int: 1 -> border, 2 -> fill, 3 -> fill and border, 4 -> inverse
  // mat: JsgMat2 (optional) -> additional transformation matrix (e.g. rotation)
  // Use RotationMatrixToVect( x, y ) to create mat

  if (JsgPolygon.Ok(x)) return this.Marker( x.X, x.Y, y, mode, x.Size );

  if (xArray(x) && xArray(y)) {
    size = xDefNum( size, x.length );
    for (var i = 0; i < size; i++) {
      this.Marker( x[i], y[i], mode, mat );
    }
    return this;
  }

  if (JsgVect2.Ok(x)) return this.Marker( x[0], x[1], y, mode );

  mode = xDefNum( mode, 3 );
  var ctr = this.CurrTrans;
  var otr = this.ObjTrans;
  ctr.ObjTransXY( this.GetObjTrans(), x, y );
  var oldTrans = this.SelectTrans('canvas');
  var oldObjTransEnable = otr.Enable( false );

  var symbol = this.Markers[this.MarkerSymbol];  // as array of elements

  // invert marker sequence and contours if bit 3 is set in mode
  var ix = 0;
  var deltaIx = 1;
  var inverse = false;
  if (mode & 4) {
    ix = symbol.length - 1;
    deltaIx = -1;
    inverse = true;
  }
  var drawMode = mode & 3;

  for ( var i = 0; i < symbol.length; i++ ) {
    var element = symbol[ix];
    if (element.type == 'Polygon') {
      var poly = this.WorkPoly.Reset();
      var len = element.x.length;
      for (var j = 0; j < len; j++) poly.AddPoint( element.x[j], element.y[j] );
      if (JsgMat2.Ok(mat)) {
        JsgMat2.TransPolyXY( mat, poly.X, poly.Y, poly.Size );
      }
      this.ScaleAndMovePoly( poly, this.DriverMarkerSize, ctr.x, ctr.y );
      if (inverse) poly.Invert();
      // drawMode + 4 = close poly
      this.Polygon( poly, drawMode+4 );
    }
    else if (element.type == 'Line') {
      var poly = this.WorkPoly.Reset();
      poly.AddPoint( element.x1, element.y1 );
      poly.AddPoint( element.x2, element.y2 );
      if (JsgMat2.Ok(mat)) {
        JsgMat2.TransPolyXY( mat, poly.X, poly.Y, poly.Size );
      }
      this.ScaleAndMovePoly( poly, this.DriverMarkerSize, ctr.x, ctr.y );
      this.Line( poly.X[0], poly.Y[0], poly.X[1], poly.Y[1] );
    }
    else if (element.type == 'Circle') {
      var cx = this.ScaleAndMoveCoord( element.x, this.DriverMarkerSize, ctr.x );
      var cy = this.ScaleAndMoveCoord( element.y, this.DriverMarkerSize, ctr.y );
      var cr = element.r * this.DriverMarkerSize;
      if (inverse) cr *= -1;
      this.Circle( cx, cy, cr, drawMode );
    }
    ix += deltaIx;
  }
  otr.Enable( oldObjTransEnable );
  this.SelectTrans( oldTrans );
  return this;
}

//------------------------------------------------
// JsgHtmlTextHandler implements the Html Text functions
// It uses the ClippingDiv object to strore text in div elements.

function JsgHtmlTextHandler( clippingDiv, canvas, context2d ) {
  this.ClippingDiv = clippingDiv;
  this.Canvas = canvas;
  this.Context2D = context2d;
  this.TextHAlign = 'left';
  this.TextVAlign = 'top';
  this.TextHPad = 0;
  this.TextVPad = 0;
  this.WorkRect = new JsgRect( 0, 0, 0, 0 );
  this.Text = [];
  this.Cache = [];
  this.CachePtr = 0;
  // create TextStyle and TextClass property and copy styles from clippingDiv
  // If TextClass is defined, TextClass is assigned to Text div's and TextStyles are ignored
  this.TextClass = '';
  this.TextStyles = this.NewTextStyles();
}

// These properties are applied to text div's that are rendered with DrawText.
JsgHtmlTextHandler.AppliedTextStyles = 'color fontFamily fontSize fontStyle fontWeight lineHeight textAlign'.split(' ');

JsgHtmlTextHandler.prototype.NewTextStyles = function( from ) {
  // from: { styles }
  var styles = {};
  var styleNames = JsgHtmlTextHandler.AppliedTextStyles;
  for (var i = 0; i < styleNames.length; i++) {
    styles[styleNames[i]] = '';
  }
  if (xObj(from)) this.CopyTextStyles( from, styles );
  return styles;
}

JsgHtmlTextHandler.prototype.CopyTextStyles = function( src, dest ) {
  // src, dest: { styles }
  var styleNames = JsgHtmlTextHandler.AppliedTextStyles;
  for (var i = 0; i < styleNames.length; i++) {
    var name = styleNames[i];
    if (src[name] != '') dest[name] = src[name];
  }
}

JsgHtmlTextHandler.prototype.SameTextStyles = function( styles1, styles2 ) {
  // styles1, styles2: { styles }
  var styleNames = JsgHtmlTextHandler.AppliedTextStyles;
  for (var i = 0; i < styleNames.length; i++) {
    var name = styleNames[i];
    if (styles1[name] != styles2[name]) return false;
  }
  return true;
}

JsgHtmlTextHandler.prototype.Clear = function() {
  for (var i = 0; i < this.Text.length; i++) {
    this.ClippingDiv.removeChild(this.Text[i]);
  }
  this.Text = [];
  this.ResetCache();
}

JsgHtmlTextHandler.prototype.ClearCache = function() {
  this.Cache = [];
  this.CachePtr = 0;
}

JsgHtmlTextHandler.prototype.ResetCache = function() {
  this.CachePtr = 0;
}

JsgHtmlTextHandler.prototype.FindTextSizeInCache = function( s, textClass, styles, aw, box ) {
  // returns true, if s with textClass, styles and aw is found in cache
  // box: JsgRect; modifies w and h with found cached size
  if (this.CachePtr >= this.Cache.length) return false;
  aw = xDefNum( aw, -1 );
  var c = this.Cache[this.CachePtr];
  if (c.Text == s && c.TextClass == textClass && this.SameTextStyles(c.Styles,styles) && c.ArgWidth == aw) {
    this.CachePtr++;
    box.SetSize( c.Width, c.Height );
    return true;
  }
  this.ClearCache();
  return false;
}

JsgHtmlTextHandler.prototype.AddToCache = function( s, textClass, styles, aw, width, height ) {
  var stylesCopy = this.NewTextStyles( styles );
  aw = xDefNum( aw, -1 );
  this.Cache.push( { Text: s, TextClass: textClass, Styles: stylesCopy, ArgWidth: aw, Width: width, Height: height } );
  this.CachePtr++;
}

JsgHtmlTextHandler.prototype.CreateTextNode = function( s, w ) {
  var txt = document.createElement('div');
  // apply classes and styles
  this.CopyTextStyles( this.TextStyles, txt.style )
  if (this.TextClass == '') {
    txt.style.margin = '0';
    txt.style.padding = '0';
  } else {
    txt.className = this.TextClass;
  }
  txt.style.position = 'absolute';
  txt.style.boxSizing = 'border-box';
  if (w > 0) txt.style.width = w+'px';
  txt.innerHTML = s;
  return txt;
}

JsgHtmlTextHandler.prototype.GetTextSize = function ( s, w, box ) {
  // Computes size of Textbox without reformating. Compare with GetTextBox.
  // box: JsgRect; modifies w and h but not x and y

  if (this.FindTextSizeInCache( s, this.TextClass, this.TextStyles, w, box )) return;

  var txtNode = this.CreateTextNode( s, w );
  txtNode.style.visibility = 'hidden';
  this.ClippingDiv.appendChild( txtNode );

  box.SetSize( txtNode.offsetWidth, txtNode.offsetHeight );

  this.ClippingDiv.removeChild( txtNode );

  this.AddToCache( s, this.TextClass, this.TextStyles, w, box.w, box.h );
}

JsgHtmlTextHandler.prototype.GetTextBox = function( s, x, y, w, box ) {
  // box: JsgRect; modifies x, y, w and h
  return this.HandleText( 0, s, x, y, w, box );
}

JsgHtmlTextHandler.prototype.DrawText = function( s, x, y, w ) {
  this.HandleText( 1, s, x, y, w, this.WorkRect );
}

JsgHtmlTextHandler.prototype.HandleText = function( mode, s, x, y, w, box ) {
  // mode = 0 -> compute size of textbox without drawing the text
  // mode = 1 -> compute size of textbox and draw text
  // box: JsgRect; modifies x, y, w and h
  // Note: Text may be reformated if overlaping with canvas. Compare with GetTextSize.
  // if w > 0 it specifies the wished text width without padding

  this.GetTextSize( s, w, box );
  box.w += 2 * this.TextHPad;
  box.h += 2 * this.TextVPad;
  var top = y;
  var left = x;
  var padleft = this.TextHPad;
  var padright = this.TextHPad;
  if (this.TextHAlign == 'center') left -= box.w / 2;
  if (this.TextHAlign == 'right')  left -= box.w;
  if (this.TextVAlign == 'middle') top  -= box.h / 2;
  if (this.TextVAlign == 'bottom') top  -= box.h;

  // recompute box if w = 0 and text box overlaps ClippingDiv border left or right
  if (w == 0) {
    var cw = this.ClippingDiv.offsetWidth;
    var right = left + box.w;
    var newleft = left;
    var newright = right;
    var borderCrossed = false;
    if (left < 0 && right > 0) {
      // crossing left clipping border; reduce width from left
      padleft = this.TextHPad + left;
      if (padleft < 0) padleft = 0;
      newleft = 0;
      borderCrossed = true;
    }
    if (left < cw && right > cw) {
      // crossing right clipping border; reduce with from right (additionally)
      padright -= right - cw;
      if (padright < 0) padright = 0;
      newright = cw;
      borderCrossed = true;
    }
    // of box not outside clipping div then compute new width w
    if (borderCrossed && newright > 0 && newleft < cw) {
      w = newright - newleft - padleft - padright;
      if (w < 0) w = 0;
    }
    if (w > 0) {
      // if w is adjusted, recompute textbox geom and position this time with new width
      var top = y;
      var left = newleft;
      this.GetTextSize( s, w, box );
      box.w += padleft + padright;
      box.h += 2 * this.TextVPad;
      if (this.TextVAlign == 'middle') top  -= box.h / 2;
      if (this.TextVAlign == 'bottom') top  -= box.h;
    }
  }
  box.SetPos( left, top );
  if (mode == 1) {
    var txtNode = this.CreateTextNode( s, w );
    txtNode.style.left = left + padleft + 'px';
    txtNode.style.top = top + this.TextVPad + 'px';
    this.ClippingDiv.appendChild( txtNode );
    this.Text.push( txtNode );
  }
}

