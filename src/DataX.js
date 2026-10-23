// DataX.js, (C) 2017, Walter Bislin, http://walter.bislins.ch/doc/DataX
//
// Module for Data Exchange between javascript objects, json objects and url paramaters
//
// Creates a Json format data dump from an object: JsonStore.ToJson()
// Loads Object Properties from a Json format string: JsonStore.FromJson()
//
// Uses metaData to define which Properties are saved.
// Objects can be nested, e.g. Properties may be objects and arrays.
// FromJason() does not replace Objects or Arrays but rather overwrites the Properties and Array Elements,
// so that external references to Properties remain pointing to the original Objects Properties rather than the Json Object Properties.
//
// MetaData format:
// {
//   Compact: bool,  // only stores values different than Default; default = false
//   DefaultPrec: int,
//   Properties: [
//     { [ Name: string, ] Type: string [, Default: any] [, Prec: int ] [, Format: string ]
//       [, ArrayType: Type | (array of) Type | MetaData [, Size ] ] [, ObjType: Properties },
//     :
//   ],
// }
// Type: 'bool', 'int', 'num', 'str', 'arr', 'obj'
// Prec: int; default = 7
// Format: 'fix', 'prec'; default = 'prec'
//
// Note for Arrays:
// * The Array is reused (resized as nessecary)
// * size = undefined: size is as contained in data (json or stream)
// * size >= 0: array is size accordingly and filled with data from json or stream

var DataX = {

  LineBreak: '\n',
  Indent: '  ',
  DefaultPrec: 7,

  ToJson: function( name, obj, metaData ) {
    // returns a json string from obj according to metaData.
    // if name != '' then return is 'name = ' + json

    var compact = xDefBool( metaData.Compact, false );
    var defPrec = xDefNum( metaData.DefaultPrec, this.DefaultPrec );
    var json = this.PropToJson( '', obj, { Type: 'obj', ObjType: metaData.Properties }, compact, defPrec, '', false );
    if (name != '') json = name + ' = ' + json;
    return json;
  },

  FromJson: function( obj, metaData, jsonStr ) {
    // parses jsonStr into a json object and stores the values of the json object in obj according to metaData
    // returns true on success
    // calls alert() on exceptions

    var jsonObj;
    try {
      jsonObj = JSON.parse( jsonStr );
    } catch(e) {
      alert(e.description);
      return false;
    }
    this.JsonObjToObj( obj, metaData.Properties, jsonObj );
    return true;
  },

  // stream functions

  ToStream: function( obj, metaData ) {
    // returns a stream string from obj according to metaData.

    var compact = xDefBool( metaData.Compact, false );
    var defPrec = xDefNum( metaData.DefaultPrec, this.DefaultPrec );
    this.ResetStream();
    this.PropToStream( obj, { Type: 'obj', ObjType: metaData.Properties }, compact, defPrec );
    return this.ZipStream( this.StreamStr );
  },

  FromStream: function( obj, metaData, str ) {
    // parses str and stores the values in obj according to metaData

    this.ResetStream( this.UnzipStream( str ) );
    this.StreamToObj( obj, metaData.Properties );
  },

  // URL parameter query

  UrlParams: null,

  ParseUrl: function( url ) {
    // if url is undefined then location.href is used
    // this function is called from GetUrlXxx() functions but does nothing if not called the first time
    // if url is defined, parameters in url are decoded rather than location.href

    if (!xStr(url) && this.UrlParams) return;
    this.UrlParams = {};
    url = xDefStr( url, location.href );
    // finde parameters in url: after '?'
    var pos = url.indexOf( '?' );
    if (pos < 0) return;
    var paramListStr = url.substr( pos+1 );
    if (paramListStr == '') return;
    // remove anchor target: after '#'
    var pos = paramListStr.indexOf('#');
    if (pos >= 0) paramListStr = paramListStr.substr( 0, pos );
    if (paramListStr == '') return;
    // separate parameters and process them
    var paramList = paramListStr.split( '&' );
    for (i = 0; i < paramList.length; i++) {
      var paramStr = paramList[i];
      var pos = paramStr.indexOf( '=' );
      if (pos > 0) {
        var name = paramStr.substr( 0, pos ).toLowerCase();
        var value = paramStr.substr( pos+1 );
        try { value = decodeURIComponent( value ); } catch (err) {}
        this.UrlParams[name] = value;
      }
    }
  },

  GetUrlStr: function( name, def ) {
    this.ParseUrl();
    name = name.toLowerCase();
    if (xDef(this.UrlParams[name])) return this.UrlParams[name];
    return xDef(def) ? def : '';
  },

  GetUrlInt: function( name, def ) {
    this.ParseUrl();
    var param = this.GetUrlStr( name );
    if (param != '') {
      var val = parseInt( param );
      if (!isNaN(val)) return val;
    }
    return xDef(def) ? def : '';
  },

  GetUrlNum: function( name, def ) {
    this.ParseUrl();
    var param = this.GetUrlStr( name );
    if (param != '') {
      var val = parseFloat( param );
      if (!isNaN(val)) return val;
    }
    return xDef(def) ? def : '';
  },

  // private --------------------------------------------

  FormatNum: function( num, prec ) {
    // removes unnecessary zeros
    var str = num.toPrecision(prec);
    str = str.replace(/(\.\d*?)0+(e|E|$)/, "$1$2");
    str = str.replace(/\.(e|E|$)/, "$1");
    return str;
  },

  PropToJson: function( propName, val, prop, compact, defPrec, indent, cont ) {
    if (!xStr(prop.Type)) return '';
    var propType = prop.Type;

    var json = indent;
    var sep = cont ? ',' : '';
    if (propName != '') {
      json += '"' + propName + '": ';
    }

    if (propType == 'bool' || propType == 'int') {
      if (!compact || !xDef(prop.Default) || val != prop.Default) {
        return json + val + sep + this.LineBreak;
      }

    } else if (propType == 'num') {
      if (!compact || !xDef(prop.Default) || val != prop.Default) {
        var format = xDefStr( prop.Format, 'prec' );
        var prec = xDefNum( prop.Prec, defPrec );
        var valStr;
        if (format == 'fix') {
          valStr = val.toFixed( prec );
        } else {
          valStr = this.FormatNum( val, prec );
        }
        return json + valStr + sep + this.LineBreak;
      }

    } else if (propType == 'str') {
      if (!compact || !xDef(prop.Default) || val != prop.Default) {
        var s = val.replace( /\"/g, '\\"' );
        return json + '"' + s + '"' + sep + this.LineBreak;
      }

    } else if (propType == 'arr') {

      // require val: array
      if (!xDef(prop.ArrayType)) return '';
      var arrType = prop.ArrayType;
      if (!xArray(arrType)) arrType = [ arrType ];
      var nTypes = arrType.length;

      var arrSize = val.length;
      if (xNum(prop.Size)) {
        if (prop.Size < arrSize) arrSize = prop.Size;
      }

      json += '[';
      if (arrSize > 0) json += this.LineBreak;

      var eleProp = { Type: null };
      for (var i = 0; i < arrSize; i++) {
        var eleType = arrType[i % nTypes];
        if (xObj(eleType)) {
          // element is object
          if (xDef(eleType.ObjType)) {
            var s = this.PropToJson( '', val[i], eleType, compact, defPrec, indent + this.Indent, i < arrSize-1 );
          }
        } else {
          eleProp.Type = eleType;
          var s = this.PropToJson( '', val[i], eleProp, false, defPrec, indent + this.Indent, i < arrSize-1 );
        }
        if (s != '') json += s;
      }

      json += indent + ']' + sep + this.LineBreak;
      return json;

    } else if (propType == 'obj') {

      json += '{' + this.LineBreak;
      if (!xArray(prop.ObjType)) return '';
      if (xNum(prop.DefaultPrec)) defPrec = prop.DefaultPrec;
      var props = prop.ObjType;
      var nProps = props.length;
      for (var i = 0; i < nProps; i++) {
        var propi = props[i];
        if (xObj(propi) && xStr(propi.Name)) {
          var s = this.PropToJson( propi.Name, val[propi.Name], propi, compact, defPrec, this.Indent, i < nProps-1 );
          if (s != '') json += s;
        }
      }
      json += indent + '}' + sep + this.LineBreak;
      return json;

    }
    return '';
  },

  JsonObjToObj: function( obj, props, jsonObj ) {
    var nProps = props.length;
    for (var i = 0; i < nProps; i++) {
      this.JsonPropToObj( obj, props[i], jsonObj );
    }
  },

  JsonPropToObj: function( obj, prop, jsonObj ) {
    // obj, jsonObj: Object or Array
    var propName = prop.Name;
    // get new value from jsonObj or prop.Default
    var value;
    if (xDef(jsonObj[propName])) {
      value = jsonObj[propName];
    } else if (xDef(prop.Default)) {
      value = prop.Default;
    }
    // check new value is defined
    if (!xDef(value)) return;
    // check correct type
    if (!xDef(prop.Type)) return;
    var propType = prop.Type;
    var typeMatch = false;
    if (propType == 'int' || propType == 'num') {
      typeMatch = xNum(value);
    } else if (propType == 'str') {
      typeMatch = xStr(value);
    } else if (propType == 'bool') {
      typeMatch = xBool(value);
    } else if (propType == 'arr') {
      typeMatch = xArray(value);
    } else if (propType == 'obj') {
      typeMatch = xObjOrNull(value);
    }
    if (!typeMatch) return;

    // assign value to object (recursion for obj)
    if (propType == 'arr') {

      if (!xDef(prop.ArrayType)) return;
      var arrType = prop.ArrayType;
      if (!xArray(arrType)) arrType = [ arrType ];
      var arrTypeSize = arrType.length;
      var objArr = obj[propName];
      var arrSize = objArr.length;
      if (!xNum(prop.Size)) {
        // clear array
        objArr.length = 0;
        arrSize = value.length;
      }
      // assert xArray(value) && xArray(obj[propName])
      if (value.length < arrSize) arrSize = value.length;
      var arrProp = { Name: null, Type: null };
      for (var i = 0; i < arrSize; i++) {
        var eleType = arrType[i % arrTypeSize];
        if (xObj(eleType)) {

          // array element is object
          if (xDef(eleType.ObjType)) {
            this.JsonObjToObj( objArr[i], eleType.ObjType, value[i] );
          }

        } else {

          arrProp.Name = i;
          arrProp.Type = eleType;
          this.JsonPropToObj( objArr, arrProp, value );

        }
      }

    } else if (propType == 'obj') {

      if (xDef(prop.ObjType)) {
        this.JsonObjToObj( obj[propName], prop.ObjType, value );
      }

    } else {

      obj[propName] = value;

    }
  },

  // private stream functions

  ZipStream: function( s ) {
    s = s.replace( /!/g, '!0' );
    s = s.replace( /~{3,11}/g,
      function( match ) {
        return '!' + (match.length-2);
      }
    );
    return s;
  },

  UnzipStream: function( s ) {
    s = s.replace( /!(\d)/g,
      function( match, p1 ) {
        var ZipChars = '~~~~~~~~~~~';
        var n = parseInt( p1 );
        if (n == 0) {
          return '!';
        } else {
          return ZipChars.substr( 0, n + 2 );
        }
      }
    );
    return s;
  },

  PropToStream: function( val, prop, compact, defPrec ) {

    if (!xDef(prop.Type)) {
      this.StreamAddNone();
      return;
    }
    var propType = prop.Type;

    if (propType == 'bool') {
      if (!compact || !xDef(prop.Default) || val != prop.Default) {
        this.StreamAddInt( val ? 1 : 0 );
      } else {
        this.StreamAddNone();
      }

    } else if (propType == 'int') {
      if (!compact || !xDef(prop.Default) || val != prop.Default) {
        this.StreamAddInt( val );
      } else {
        this.StreamAddNone();
      }

    } else if (propType == 'num') {
      if (!compact || !xDef(prop.Default) || val != prop.Default) {
        var format = xDefStr( prop.Format, 'prec' );
        var prec = xDefNum( prop.Prec, defPrec );
        var valStr;
        if (format == 'fix') {
          valStr = val.toFixed( prec );
        } else {
          valStr = this.FormatNum( val, prec );
        }
        this.StreamAddNumStr( valStr );
      } else {
        this.StreamAddNone();
      }

    } else if (propType == 'str') {
      if (!compact || !xDef(prop.Default) || val != prop.Default) {
        this.StreamAddStr( val );
      } else {
        this.StreamAddNone();
      }

    } else if (propType == 'arr') {

      // require val: array
      var arrType = null;
      if (xDef(prop.ArrayType)) {
        arrType = prop.ArrayType;
      }
      if (!xArray(arrType)) arrType = [ arrType ];
      var nTypes = arrType.length;

      var arrSize = val.length;
      var valSize = arrSize;
      if (xNum(prop.Size)) {
        arrSize = prop.Size;
        if (arrSize < 0) arrSize = 0;
      } else {
        this.StreamAddInt( arrSize );
      }

      var eleProp = { Type: null };
      for (var i = 0; i < arrSize; i++) {
        if (i >= valSize || !arrType) {
          this.StreamAddNone();
        } else {
          // assert i < valSize && xArray(arrType)
          var eleType = arrType[i % nTypes];
          if (xObj(eleType)) {
            // element is object
            if (xDef(eleType.ObjType)) {
              this.PropToStream( val[i], eleType, compact, defPrec );
            } else {
              this.StreamAddNone();
            }
          } else {
            eleProp.Type = eleType;
            if (xDef(prop.Default)) {
              if (xArray(prop.Default)) {
                eleProp.Default = prop.Default[i % prop.Default.length];
              } else {
                eleProp.Default = prop.Default;
              }
            }
            this.PropToStream( val[i], eleProp, compact, defPrec );
          }
        }
      }

    } else if (propType == 'obj') {

      var props = prop.ObjType;
      var nProps = props.length;
      if (xNum(prop.DefaultPrec)) defPrec = prop.DefaultPrec;
      for (var i = 0; i < nProps; i++) {
        var prop = props[i];
        this.PropToStream( val[prop.Name], prop, compact, defPrec );
      }

    }
  },

  StreamToObj: function( obj, props ) {

    var nProps = props.length;
    for (var i = 0; i < nProps; i++) {
      this.StreamPropToObj( obj, props[i] );
    }
  },

  StreamPropToObj: function( obj, prop ) {
    // obj: Object or Array

    var propName = prop.Name;
    var propType = prop.Type;

    // assign value to object (recursion for obj and array)
    if (propType == 'bool') {

      if (xBool(prop.Default)) obj[propName] = prop.Default;
      if (!this.StreamIsNone()) {
        obj[propName] = this.StreamGetInt() > 0 ? true : false;
      }

    } else if (propType == 'int') {

      if (this.StreamIsNone()) {
        if (xNum(prop.Default)) {
          var defInt = Math.floor(prop.Default);
          if (defInt < 0) defInt += 1;
          obj[propName] = defInt;
        }
      } else {
        obj[propName] = this.StreamGetInt();
      }

    } else if (propType == 'num') {

      if (this.StreamIsNone()) {
        if (xNum(prop.Default)) obj[propName] = prop.Default;
      } else {
        obj[propName] = this.StreamGetNum();
      }

    } else if (propType == 'str') {

      if (this.StreamIsNone()) {
        if (xStr(prop.Default)) obj[propName] = prop.Default;
      } else {
        obj[propName] = this.StreamGetStr();
      }

    } else if (propType == 'arr') {

      // if prop.Size is defined then exactly prop.Size array values follow in stream
      var arrType = null;
      var nTypes = 0;
      if (xDef(prop.ArrayType)) {
        arrType = prop.ArrayType;
        if (!xArray(arrType)) arrType = [ arrType ];
        nTypes = arrType.length;
      }

      var arrSize;
      if (xNum(prop.Size)) {
        arrSize = prop.Size;
        if (arrSize < 0) arrSize = 0;
      } else {
        arrSize = this.StreamGetInt();
        // resize
        obj[propName].length = 0;
      }

      var arrProp = { Name: null, Type: null };
      for (var i = 0; i < arrSize; i++) {
        if (arrType) {
          var eleType = arrType[i % nTypes];
          if (xObj(eleType)) {

            // array element is object
            if (xObj(eleType.ObjType)) {
              this.StreamToObj( obj[i], eleType.ObjType );
            }

          } else {

            arrProp.Name = i;
            arrProp.Type = eleType;
            if (xDef(prop.Default)) {
              if (xArray(prop.Default)) {
                arrProp.Default = prop.Default[i % prop.Default.length];
              } else {
                arrProp.Default = prop.Default;
              }
            }
            this.StreamPropToObj( obj[propName], arrProp );

          }
        } else {
          // eat none indicator from stream and let array element undefined
          this.StreamIsNone();
        }
      }

    } else if (propType == 'obj') {

      if (xObj(prop.ObjType)) {
        this.StreamToObj( obj[propName], prop.ObjType );
      }

    }
  },

  // stream parser and serializer

  StreamStr: '',
  StreamPos: 0,
  StreamSep: '~',

  ResetStream: function( s ) {
    this.StreamStr = xStr(s) ? s : '';
    this.StreamPos = 0;
    return this;
  },

  StreamAddNone: function() {
    this.StreamStr += this.StreamSep;
    return this;
  },

  StreamAddInt: function( i ) {
    this.StreamStr += i + this.StreamSep;
    return this;
  },

  StreamAddNum: function( num ) {
    this.StreamStr += this.FormatNum( num, this.DefaultPrec ) + this.StreamSep;
    return this;
  },

  StreamAddNumStr: function( numStr ) {
    this.StreamStr += numStr + this.StreamSep;
    return this;
  },

  StreamAddStr: function( s ) {
    this.StreamAddInt( s.length );
    this.StreamStr += s + this.StreamSep;
    return this;
  },

  StreamIsNone: function() {
    if (this.StreamPos >= this.StreamStr.length) return true;
    if (this.StreamStr[this.StreamPos] != this.StreamSep) return false;
    this.StreamPos++;
    return true;
  },

  StreamGetInt: function( def ) {
    def = xDefNum( def, 0 );
    if (this.StreamPos >= this.StreamStr.length) return def;
    var p = this.StreamStr.indexOf( this.StreamSep, this.StreamPos );
    if (p < 0) return def;
    var s = this.StreamStr.slice( this.StreamPos, p );
    this.StreamPos = p + 1;
    if (s == '') return def;
    var i = parseInt( s );
    if (isNaN(i)) return def;
    return i;
  },

  StreamGetNum: function( def ) {
    def = xDefNum( def, 0 );
    if (this.StreamPos >= this.StreamStr.length) return def;
    var p = this.StreamStr.indexOf( this.StreamSep, this.StreamPos );
    if (p < 0) return def;
    var s = this.StreamStr.slice( this.StreamPos, p );
    this.StreamPos = p + 1;
    if (s == '') return def;
    var num = parseFloat( s );
    if (isNaN(num)) return def;
    return num;
  },

  StreamGetStr: function( def ) {
    def = xStr( def, '' );
    if (this.StreamPos >= this.StreamStr.length) return def;
    var l = this.StreamGetInt();
    if (l < 0) return def;
    var last = this.StreamPos + l;
    if (last > this.StreamStr.length) return def;
    var s = this.StreamStr.slice( this.StreamPos, last );
    this.StreamPos = last + 1;
    return s;
  },

};

