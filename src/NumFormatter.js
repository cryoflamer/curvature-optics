// NumFormatter.js (C) Walter Bislin; walter.bislins.ch; Juli 2013
//
// description and download:
//  http://walter.bislins.ch/doku/NumFormatter
//
// dependecies:
//  none
//
// History:
//  2013-08-08: first Version

function CNumFormatter() {
  this.Lang        = 'iso';     // iso, en, de, ch, '' = iso
  this.DecimalChar = ',';
  this.MantGrpChar = ' ';
  this.MantGrpSize = 3;
  this.MantGrpMinSize = 4;
  this.FracGrpChar = ' ';
  this.FracGrpSize = 3;
  this.FracGrpMinSize = 4;
  this.TableLike   = true;     // true -> always use MantGrpSize and fracGrpsSize to group digits
  this.ExpChar     = ' E';     // 'E' or 'e' only! A space in front of e/E is allowed.
  this.ExpLeadZero = 2;        // 1-3
  this.ShowExpPlus = true;
  this.HideZeroExp = false;
  this.UnitSepChar = ' ';
  this.Mode        = 'std';    // std, prec, fix, fix0, weak, weak0, sci, eng, unit
  this.AltMode     = 'eng';    // sci, eng
  this.AltPrec     = 13;       // precision if fix and weak mode alters to sci or eng (MaxDigits-(5 or 4)) dep. on ExpLeadZero
  this.Precision   = 8;
  this.Prefix      = [ 'a', 'f', 'p', 'n', '&mu;', 'm', '', 'k', 'M', 'G', 'T', 'P', 'E' ];
  this.Prefix0     = 6;
  this.MaxPrec     = 13;       // < 17! rounding errors occour with MaxPrec > 13
  this.MaxDigits   = 17;
}

CNumFormatter.prototype.SetLang = function( aLang ) {
  // aLang = 'ch', 'de', 'fr', 'en', '' = 'en'
  if (aLang == 'en') {
    this.DecimalChar = '.';
    this.MantGrpChar = ',';
    this.MantGrpSize = 3;
    this.MantGrpMinSize = 4;
    this.FracGrpChar = '';
    this.FracGrpSize = 3;
    this.FracGrpMinSize = 4;
  } else if (aLang == 'de') {
    this.DecimalChar = ',';
    this.MantGrpChar = '.';
    this.MantGrpSize = 3;
    this.MantGrpMinSize = 4;
    this.FracGrpChar = '';
    this.FracGrpSize = 3;
    this.FracGrpMinSize = 4;
  } else if (aLang == 'ch') {
    this.DecimalChar = ',';
    this.MantGrpChar = '\'';
    this.MantGrpSize = 3;
    this.MantGrpMinSize = 4;
    this.FracGrpChar = '';
    this.FracGrpSize = 3;
    this.FracGrpMinSize = 4;
  } else {
    // aLang = 'iso' and others
    this.DecimalChar = ',';
    this.MantGrpChar = ' ';
    this.MantGrpSize = 3;
    this.MantGrpMinSize = 4;
    this.FracGrpChar = ' ';
    this.FracGrpSize = 3;
    this.FracGrpMinSize = 4;
  }
  this.Lang = aLang;
}

CNumFormatter.prototype.SetPrefix = function( aPrefixList, aPrefix0 ) {
  this.Prefix = aPrefixList;
  this.Prefix0 = aPrefix0;
}

CNumFormatter.prototype.GetPrefixFromNumParts = function( aNumParts ) {
  var ix = aNumParts.PrefixIx;
  if (ix >= 0 && ix < this.Prefix.length) {
    return this.Prefix[ix];
  } else {
    return '';
  }
}

CNumFormatter.prototype.IsArray = function( aObj ) {
  return (Object.prototype.toString.call(aObj) === '[object Array]');
}

CNumFormatter.prototype.IsNumeric = function( x ) {
  // returns true if x is type number or numeric string. '100%' -> false!
  // Source: jQuery
  return (!this.IsArray(x) && (x - parseFloat(x) >= 0));
}

CNumFormatter.prototype.FormatNumStr = function( aNumStr ) {
  // inserts SepChar and FracChar into aNumStr
  // aNumStr = 12345.678912 -> 12'234.678 912 or 12.234,678912 or ...
  var x = aNumStr.split( '.' );
  if (!this.IsNumeric(x[0]) || (x.length > 1 && !this.IsNumeric(x[1]))) return aNumStr;
  var x1 = x[0];
  var x2 = x.length > 1 ? x[1] : '';
  if (this.MantGrpChar != '' && this.MantGrpSize > 0 && x1 != '' && (this.TableLike || x1.length > this.MantGrpMinSize)) {
    var rgx = new RegExp( '(\\d+)(\\d{' + this.MantGrpSize + '})', '' );
    while (rgx.test(x1)) {
      x1 = x1.replace( rgx, '$1' + this.MantGrpChar + '$2' );
    }
  }
  if (this.FracGrpChar != '' && this.FracGrpSize > 0 && x2 != '' && (this.TableLike || x2.length > this.FracGrpMinSize)) {
    var rgx = new RegExp( '(\\d{' + this.FracGrpSize + '})(\\d+)', '' );
    while (rgx.test(x2)) {
      x2 = x2.replace( rgx, '$1' + this.FracGrpChar + '$2' );
    }
  }
  if (x2 != '') x1 += this.DecimalChar + x2;
  return x1;
}

CNumFormatter.prototype.CutTrailingZeros = function( aNumStr ) {
  // cuts unneeded zeros behind decimal point
  var p = aNumStr.indexOf( '.' );
  if (p < 0) return aNumStr;
  var s = aNumStr.replace( /0+$/, '' );
  // remove point if it is last left char at end
  if (p == (s.length - 1)) {
    s = s.substr( 0, p );
  }
  return s;
}

CNumFormatter.prototype.SplitNumStr = function( aNumStr ) {
  // returns { MantStr: str, ExpStr: str, Exp: +/-int }
  var exp = 0;
  var expStr = '';
  var mantStr = aNumStr;
  var p = mantStr.indexOf( 'e' );
  if (p < 0) p = mantStr.indexOf( 'E' );
  if (p > 0) {
    // handle exponent
    expStr = mantStr.substr( p+1 );
    mantStr = mantStr.substr( 0, p );
    exp = parseInt( expStr, 10 );
  }
  return { MantStr: mantStr, ExpStr: expStr, Exp: exp };
}

CNumFormatter.prototype.GetExponent = function( aNum, aPrec ) {
  if (aPrec < 1) aPrec = 1;
  var numSciStr = aNum.toExponential( aPrec-1 );
  var numStrParts = this.SplitNumStr( numSciStr );
  return numStrParts.Exp;
}

CNumFormatter.prototype.NDigits = function( aNumStr ) {
  // count digits after removing exponent and all not digit chars
  var s = aNumStr.replace( /[eE][+-]?\d+/, '' );
  s = s.replace( /\D/g, '' );
  return s.length;
}

CNumFormatter.prototype.ExpToStr = function( aExp, aLeadingZeros ) {
  // converts an exponent integer into a string and prepends it with leading zeros
  var expStr = aExp.toFixed(0);
  while (expStr.length < aLeadingZeros) expStr = '0' + expStr;
  return expStr;
}

CNumFormatter.prototype.SplitNum = function( aNum, aFormat ) {
  // aFormat = { Mode, Precision, Units }
  // Mode = 'std', 'prec', 'fix', 'fix0', 'weak', 'weak0', 'sci', 'eng', 'unit'
  // Precision = positive Int
  // if Mode = 'unit' then exp is corrected for used unit-prefix and return.PrefixIx is index into used this.Prefix
  // returns { MantSign: +/-1, Mant: +num, ExpSign: +/-1, Exp: +int, Exp3: int, PrefixIx: int, Mode: str, InitMode: str, Precision: +int, Units: str };

  var mode = this.Mode;
  var prec = this.Precision;
  var units = '';
  if (typeof(aFormat) == 'object') {
    if (typeof(aFormat.Mode) == 'string') { mode = aFormat.Mode; }
    if (typeof(aFormat.Units) == 'string') { units = aFormat.Units; }
    if (typeof(aFormat.Precision) == 'number') { prec = aFormat.Precision; }
  }
  if (prec < 0) { prec = 0; }
  if (prec > this.MaxPrec) { prec = this.MaxPrec; }
  var numParts = { MantSign: 1, Mant: aNum, ExpSign: 1, Exp: 0, Exp3: 0, PrefixIx: -1, InitMode: mode, Mode: mode, Precision: prec, Units: units };

  var mantSign = 1;
  var mant = aNum;
  if (mant < 0) {
    mant = -mant;
    mantSign = -1;
  }
  numParts.MantSign = mantSign;
  numParts.Mant = mant;

  // if mode = 'prec' and exponent is negativ then use standard mode with trailing zeros
  if (mode == 'prec') {
    var exp = this.GetExponent( mant, prec );
    if (exp < 0) {
      mode = 'std';
      numParts.Mode = mode;
    }
  }

  // handle mode std, fix, fix0, prec, weak, weak0
  if (mode == 'std') {
    if (prec < 1) { prec = 1; }
    numParts.Precision = prec;
    var nd = prec;
    var exp = this.GetExponent( mant, prec );
    var prec1 = prec - 1;
    if (exp >= prec1) {
      nd += exp - prec1;
    } else {
      nd += -exp;
    }
    if (nd > this.MaxDigits ) {
      mode = this.AltMode;
    } else {
      return numParts;
    }

  } else if (mode == 'fix' || mode == 'fix0') {
    var precStr = mant.toFixed( prec );
    var forceExp = (precStr.indexOf('e') > 0 || precStr.indexOf('E') > 0);
    if (mode == 'fix') precStr = this.RemoveTrailingZeros(precStr);
    var nd = this.NDigits( precStr );
    if (nd > this.MaxDigits || forceExp) {
      mode = this.AltMode;
      prec = this.AltPrec;
      if (prec > this.MaxPrec) { prec = this.MaxPrec; }
    } else {
      return numParts;
    }

  } else if (mode == 'weak' || mode == 'weak0') {
    var exp = this.GetExponent( mant, prec );
    var precStr = mant.toFixed( prec );
    var forceExp = (precStr.indexOf('e') > 0 || precStr.indexOf('E') > 0);
    if (mode == 'weak') precStr = this.RemoveTrailingZeros(precStr);
    var nd = this.NDigits( precStr );
    if (nd > this.MaxDigits || exp < -prec || forceExp) {
      mode = this.AltMode;
      prec = this.AltPrec;
      if (prec > this.MaxPrec) { prec = this.MaxPrec; }
    } else {
      return numParts;
    }

  } else if (mode == 'prec') {
    if (prec < 1) { prec = 1; }
    numParts.Precision = prec;
    var exp = this.GetExponent( mant, prec );
    var precStr = mant.toPrecision( prec );
    var forceExp = (precStr.indexOf('e') > 0 || precStr.indexOf('E') > 0);
    var nd = this.NDigits( precStr );
    if (nd > this.MaxDigits || exp <= -prec || exp >= prec || forceExp) {
      mode = this.AltMode;
    } else {
      return numParts;
    }

  } else if (mode !== 'sci' && mode !== 'eng' && mode !== 'unit') {
    // invalid mode -> use 'sci'
    mode = 'sci';
    numParts.Mode = mode;
  }

  // handle mode sci and eng:
  // split mantisse and exponent into mantSign, mant, expSign, exp
  if (prec < 1) { prec = 1; }
  var exp = 0;
  var expSign = 1;
  var exp3 = 0;
  if ((mode == 'eng' || mode == 'unit') && prec < 3) prec = 3;
  exp = this.GetExponent( mant, prec );
  if (exp < 0) {
    expSign = -1;
    exp = -exp;
  }
  mant /= Math.pow( 10, expSign * exp );
  // handle mode eng by correcting mant and exp
  if (mode === 'eng' || mode === 'unit') {
    var corr = exp % 3;
    if (expSign < 0) {
      corr = (3 - corr) % 3;
    }
    if (corr > 0) {
      exp -= expSign * corr;
      mant *= Math.pow( 10, corr );
    }
    prec -= corr;
    exp3 = expSign * Math.floor( exp / 3 );
    if (mode === 'unit') {
      var prefixIx = exp3 + this.Prefix0;
      //if (prefixIx >= 0 && prefixIx < this.Prefix.length && exp3 != 0) {
      if (prefixIx >= 0 && prefixIx < this.Prefix.length) {
        exp -= expSign * exp3 * 3;
        numParts.PrefixIx = prefixIx;
      }
    }
  }
  // make numParts
  numParts.Mode = mode;
  numParts.MantSign = mantSign;
  numParts.Mant = mant;
  numParts.ExpSign = expSign;
  numParts.Exp = exp;
  numParts.Exp3 = exp3;
  numParts.Precision = prec;
  return numParts;
}

CNumFormatter.prototype.RemoveTrailingZeros = function( numStr ) {
  numStr = numStr.replace( /(\.\d*?)0+$/, '$1' );
  numStr = numStr.replace( /\.$/, '' );
  return numStr;
}

CNumFormatter.prototype.NumPartsToString = function( aNumParts ) {
  // numParts = { MantSign: +/-1, Mant: +int, ExpSign: +/-1, Exp: +int, Exp3: int, PrefixIx: int, InitMode: str, Mode: str, Precision: +int, Units: str };

  function NZeros( aNumZeros ) {
    var zz = '00000000000000000000';
    return zz.substr( 0, aNumZeros );
  }

  if (isNaN(aNumParts.Mant) || !isFinite(aNumParts.Mant)) return aNumParts.Mant.toString();
  var numStr = '';
  var mode = aNumParts.Mode;
  var zerosOnly = false;

  if (mode == 'std') {
    var prec1 = aNumParts.Precision - 1;
    numStr = aNumParts.Mant.toExponential( prec1 );
    var numStrParts = this.SplitNumStr( numStr );
    // returns { MantStr: str, ExpStr: str, Exp: +/-int }
    var mantStr = numStrParts.MantStr.replace( '.', '' );
    var exp = numStrParts.Exp;
    if (exp >= 0) {
      if (exp < prec1) {
        // insert decimal point
        var p = exp + 1;
        numStr = mantStr.substr( 0, p ) + '.' + mantStr.substr( p );
      } else {
        // append zeros
        numStr = mantStr + NZeros( exp - prec1 );
      }
    } else {
      // insert zeros after 0.
      numStr = '0.' + NZeros( -exp - 1 ) + mantStr;
    }
    if (aNumParts.InitMode !== 'prec') {
      numStr = this.CutTrailingZeros( numStr );
    }
    numStr = this.FormatNumStr( numStr );

  } else if (mode == 'prec') {
    numStr = aNumParts.Mant.toPrecision( aNumParts.Precision );
    numStr = this.FormatNumStr( numStr );

  } else if (mode == 'fix' || mode == 'fix0' || mode == 'weak' || mode == 'weak0') {
    numStr = aNumParts.Mant.toFixed( aNumParts.Precision );
    // limit significant digits to this.MaxPrec
    var nDigi = this.NDigits( numStr );
    if (nDigi > this.MaxPrec) {
      var prec1 = this.MaxPrec - 1;
      var mantStr = aNumParts.Mant.toExponential( prec1 );
      var numStrParts = this.SplitNumStr( mantStr );
      // returns { MantStr: str, ExpStr: str, Exp: +/-int }
      mantStr = numStrParts.MantStr.replace( '.', '' );
      var exp = numStrParts.Exp;
      if (exp >= 0) {
        if (exp < prec1) {
          // insert decimal point
          var p = exp + 1;
          numStr = mantStr.substr( 0, p ) + '.' + mantStr.substr( p );
          // fill zeros to aNumParts.Precision
          var nZeros = aNumParts.Precision - (this.MaxPrec - p);
          numStr += NZeros( nZeros );
        } else {
          // append zeros until dezimal point
          numStr = mantStr + NZeros( exp - prec1 );
          if (mode == 'fix0' || mode == 'weak0') {
            // append zeros after dezimal point
            if (aNumParts.Precision > 0) numStr += '.' + NZeros( aNumParts.Precision );
          }
        }
      // else use nativ toFixed format
      }
    }
    if (mode == 'fix' || mode == 'weak') numStr = this.RemoveTrailingZeros( numStr );
    zerosOnly = (numStr.replace( /[\.0]/g, '' ) == '');
    numStr = this.FormatNumStr( numStr );

  } else {
    // mode = 'sci' or 'eng' or 'unit'
    numStr = aNumParts.Mant.toFixed( aNumParts.Precision-1 );
    if (aNumParts.InitMode == 'std') {
      numStr = this.CutTrailingZeros( numStr );
    }
    numStr = this.FormatNumStr( numStr );
    if (aNumParts.Exp > 0 || (!this.HideZeroExp && aNumParts.PrefixIx == -1)) {
      numStr += this.ExpChar;
      if (aNumParts.ExpSign < 0) {
        numStr += '-';
      } else if (this.ShowExpPlus) {
        numStr += '+';
      }
      numStr += this.ExpToStr( aNumParts.Exp, this.ExpLeadZero );
    }
  }

  if (aNumParts.MantSign < 0 && !zerosOnly) {
    numStr = '-' + numStr;
  }

  if (numStr != 'NaN' && aNumParts.Units != '') {
    numStr += this.UnitSepChar;
    numStr += this.GetPrefixFromNumParts( aNumParts );
    numStr += aNumParts.Units;
  }
  return numStr;
}

CNumFormatter.prototype.NumToString = function( aNum, aFormat ) {
  // aFormat = { Mode = str, Precision = +int, UsePrefix = bool, Units = str }
  // Mode = 'std', 'prec', 'fix', 'weak', 'sci', 'eng'
  // Precision = positive Int
  // if Mode = 'unit' then exp is corrected for used unit-prefix and return.PrefixIx is index into used this.Prefix
  // Units = '' or any units; if Units is not '' then computed prefix and Units are appendet to returned numStr

  var numParts = this.SplitNum( aNum, aFormat );
  return this.NumPartsToString( numParts );
}

CNumFormatter.prototype.StringToNum = function( aStr ) {
  function replaceRegExp( aSrcStr, aRegExpStr, aReplStr ) {
    return aSrcStr.replace( new RegExp(aRegExpStr,'g'), aReplStr );
  }
  var s = aStr;
  var c = this.MantGrpChar;
  if (c != '') {
    if (c == '\\') c = '\\\\';
    if (c == ']') c = '\\]';
    s = replaceRegExp( s, '[' + c + ']', '' );
  }
  c = this.FracGrpChar;
  if (c != '') {
    if (c == '\\') c = '\\\\';
    if (c == ']') c = '\\]';
    s = replaceRegExp( s, '[' + c + ']', '' );
  }
  s = replaceRegExp( s, ' ', '' );
  s = replaceRegExp( s, ',', '.' )
  return Number( s );
}

var NumFormatter = new CNumFormatter();

