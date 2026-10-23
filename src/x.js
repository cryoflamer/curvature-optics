// x.js, X v3.15.4, Cross-Browser.com DHTML Library
// Copyright (c) 2004 Michael Foster, Licensed LGPL (gnu.org)
// havily edited (c) 2005-2016 Walter Bislin, walter.bislins.ch
//
// 15.02.2007: Change: xOnLoad()/xOnUnload(): functions are called in order of registration
// 24.11.2009: Fix: xPageX(), xPageY(): correction with xScrollLeft() and xScrollTop()
// 10.12.2009: new: xDisplay(), xIsDisplayed(), xOnDisplay()
// 30.01.2013: new: xAddClass(), xHasClass(), xRemoveClass(), xSetCookie(), xGetCookie(), xDeleteCookie()
// 16.06.2014: new: xObj()..xBool(), xIsNumeric(), xDefAny()..xDefBool(); see Wiki Page: "xDef, xAny, xObj and more"
// 13.10.2014: New: xTransform() functions
// 14.10.2014: Improved type checking using methods from jQuery 1.11.1
// 15.10.2014: New: xFStr(), xTransformOrigin()
// 01.12.2014: Added: requestAnimationFrame() support
// 05.12.2014: New: support for classList added in xAddClass(), xHasClass(), xRemoveClass(); added xToggleClass()
// 13.12.2014: Optimizations
// 16.04.2015: Changed: xOpacity(): opacity range = 0..1 (no more 0..100)
// 01.05.2015: New: xDataset()
// 05.05.2015: New: xNaturalWidth() and xNaturalHeight() for Image elements; xImgOnLoad(); xOnDomReady()
// 08.05.2015: New: Polyfill for Object.create(), SubClass.inheritsFrom(parentClass), this.parentClass.constructor.call(...)
// 20.01.2016: Support for IE8 removed!
//             Changed: xGetElementById() -> xElement(); xClipboard() -> xToClipboard()
//             New: xGet() (shortcut for document.getElementById())
// 12.02.2016: Changed: xAddEvent() registers events such, so they return an xEvent instead a nativ event
//             xAddEventListener() -> xAddEvent();
//             xRemoveEventListener() -> xRemoveEvent();
//             xGetElementsByTagName() -> xGetByTag()
// 24.02.2016: Fixed: xSetCW(), xSetCH(): BorderBoxSizing was inverted
// 12.06.2016: Fixed: xIsDisplayed() gets false when an elements display is set none via a class too
//             New: xGetByClass(), xIsElementAndNotRoot()
//             Changed: xIsRoot(e) returns false, if e is not defined or null
//             Fixed: xHasClass(), xAddClass(), xRemoveClass() are now working correct if xIsRoot(element)
// 29.06.2016  Changed: Functions in CallbackChains are now called in order of registration
// 20.07.2016  New: xOnResize()
// 14.08.2016  New: xArrForEach,xArrFind,xArrRemove..
//             Change: xCallbackChain: linked list implementation changed to array
//             New/Change: xEventManager implements all event functions; some event functions renamed
// 13.09.2016  New: xGetFirst(), xGetAll()
// 11.10.2016  New: polyfill für Math.log10()

var xClass2Type = {};

(function(){
  // see jQuery 1.11.1
  var types = "Boolean Number String Function Array Date RegExp Object Error".split(" ");
  var len = types.length;
  for (var i = 0; i < len; i++) {
    var name = types[i];
    xClass2Type[ "[object " + name + "]" ] = name.toLowerCase();
  }
})();

function xType(obj) {
  // see jQuery 1.11.1
  if (obj == null) return obj + "";
  return typeof obj === "object" || typeof obj === "function" ?
    xClass2Type[Object.prototype.toString.call(obj)] || "object" :
    typeof obj;
}

function xDef(x) { // same as xAnyOrNull()
  // true if x is defined (null -> true)
  return (typeof(x) !== 'undefined');
}

function xAny(x) {
  // true if x is any object (defined and not null, null -> false)
  return (typeof(x) !== 'undefined' && x !== null);
}

function xObj(x) {
  // true if x is object (not: null, array, boolean, number, string, function)
  return (typeof(x) === 'object' && !xArray(x) && x !== null);
}

function xObjOrNull(x) {
  // true if x is object or null (not: array, boolean, number, string, function)
  return (typeof(x) === 'object' && !xArray(x));
}

function xFunc(x) {
  // true if x is Function and not null
  // see jQuery 1.11.1
  return xType(x) === 'function';
}

function xFuncOrNull(x) {
  // true if x is Function or null
  // see jQuery 1.11.1
  return (x === null || xType(x) === 'function');
}

var xArray = Array.isArray || function( obj ) {
  // true if x is array (not object, null, ...)
  // see jQuery 1.11.1
  return xType(obj) === 'array';
};

function xStr(x) {
  // true if x is String
  return (typeof(x) === 'string');
}

function xNum(x) {
  // true if x is Number (not string)
  return (typeof(x) === 'number');
}

function xBool(x) {
  // true if x is Boolean (not: number, string)
  return (typeof(x) === 'boolean');
}

function xIsNumeric(x) {
  // returns true if x is type number or plain numeric string. '100%' -> false!
  // see jQuery 1.11.1
  return (!xArray(x) && (x - parseFloat(x) >= 0));
}

function xDefAny( aRef, aDefault ) {
  // if aRef is not undefined and not null return aRef else aDefault (aRef === null -> aDefault)
  return (typeof(aRef) === 'undefined' || aRef === null) ? aDefault : aRef;
}

function xDefAnyOrNull( aRef, aDefault ) {
  // if aRef is not undefined return aRef else aDefault (aRef === null -> null (aRef))
  return (typeof(aRef) === 'undefined') ? aDefault : aRef;
}

function xDefObj( aRef, aDefault ) {
  // if aRef is object and not null return aRef else aDefault (aRef === null -> aDefault)
  return (typeof(aRef) === 'object' && !xArray(aRef) && aRef !== null) ? aRef : aDefault;
}

function xDefObjOrNull( aRef, aDefault ) {
  // if aRef is object or null return aRef else aDefault (aRef === null -> null (aRef))
  return (typeof(aRef) === 'object' && !xArray(aRef)) ? aRef : aDefault;
}

function xDefFunc( aRef, aDefault ) {
  // if aRef is function and not null return aRef else aDefault (aRef === null -> aDefault)
  return xFunc(aRef) ? aRef : aDefault;
}

function xDefFuncOrNull( aRef, aDefault ) {
  // if aRef is function or null return aRef else aDefault (aRef === null -> aRef)
  return xFuncOrNull(aRef) ? aRef : aDefault;
}

function xDefArray( aRef, aDefault ) {
  // if aRef is array and not null return aRef else aDefault (aRef === null -> aDefault)
  return xArray(aRef) ? aRef : aDefault;
}

function xDefStr( aRef, aDefault ) {
  // if aRef is a string return aRef else aDefault (aRef === null or undefined -> aDefault)
  return (typeof(aRef) === 'string') ? aRef : aDefault;
}

function xDefNum( aRef, aDefault ) {
  // if aRef is is a number return aRef else aDefault (aRef === null or undefined -> aDefault)
  return (typeof(aRef) === 'number') ? aRef : aDefault;
}

function xDefBool( aRef, aDefault ) {
  // if aRef is a boolean return aRef else aDefault (aRef === null or undefined -> aDefault)
  return (typeof(aRef) === 'boolean') ? aRef : aDefault;
}

function xArgsToArray( args ) {
  // converts an object of type arguments to an array
  return Array.prototype.slice.call(args);
}

function xFStr( format, etc ) {
  // builds a string: xFStr( 'translate(#px,#px)', 20, 30 ) -> 'translate(20px,30px)'
  var arg = arguments;
  var i = 1;
  return format.replace( /(#(#)?)/g, function(match,p1,p2){ return p2 || arg[i++]; } );
}

// some Array functions ---------------------------

function xArrFind( start, arr, func, thisArg ) {
  // or xArrFind( arr, func, thisArg )
  // func.call( thisArg, arr[i], i, arr ): bool -> true if arr[i] maches
  // require start>=0 && xArray(arr) && xFunc(func)
  // returns arr element or undefined
  if (!xNum(start)) return xArrFind( 0, start, arr, func );
  var t, undef
  if (arguments.lenth > 3) t = thisArg;
  var n = arr.length;
  for (var i = start; i < n; i++) {
    if (func.call( t, arr[i], i, arr )) return arr[i];
  }
  return undef;
}

function xArrFindIndex( start, arr, func, thisArg ) {
  // or xArrFindIndex( arr, func, thsArg )
  // func.call( thisArg, arr[i], i, arr ): bool -> true if arr[i] maches
  // require start>=0 && xArray(arr) && xFunc(func)
  // returns element index or -1
  if (!xNum(start)) return xArrFindIndex( 0, start, arr, func );
  var t
  if (arguments.lenth > 3) t = thisArg;
  var n = arr.length;
  for (var i = start; i < n; i++) {
    if (func.call( t, arr[i], i, arr )) return i;
  }
  return -1;
}

function xArrForEach( arr, func, thisArg ) {
  // func.call( thisArg, arr[i], i, arr )
  // require xArray(arr) && xFunc(func)
  var t
  if (arguments.length > 2) t = thisArg;
  var n = arr.length;
  for (var i = 0; i < n; i++) {
    func.call( t, arr[i], i, arr );
  }
}

function xArrayMap( arr, func, thisArg ) {
  // func.call( thisArg, arr[i], i, arr ): any -> newArr[i]
  // require xArray(arr) && xFunc(func)
  // returns newArr
  var t
  if (arguments.length > 2) t = thisArg;
  var n = arr.length;
  var newArr = Array(n);
  for (var i = 0; i < n; i++) {
    newArr[i] = func.call( t, arr[i], i, arr );
  }
  return newArr;
}

function xArrRemove( arr, func, thisArg ) {
  // func.call( thisArg, arr[i], i, arr ): bool
  // removes first element from arr where func returns true and stops there
  // returns removed element or undefined
  // require xArray(arr) && xFunc(func)
  var t, undef
  if (arguments.length > 2) t = thisArg;
  var i = 0;
  while (i < arr.length) {
    if (func.call( t, arr[i], i, arr )) {
      var ele = arr[i];
      arr.splice( i, 1 );
      return ele;
    } else {
      i++;
    }
  }
  return undef;
}

function xArrRemoveAll( arr, func, thisArg ) {
  // func.call( thisArg, arr[i], i, arr ): bool
  // removes all elements from arr where func returns true
  // returns number of removed elements
  // require xArray(arr) && xFunc(func)
  var t
  if (arguments.length > 2) t = thisArg;
  var n = 0;
  var i = 0;
  while (i < arr.length) {
    if (func.call( t, arr[i], i, arr )) {
      arr.splice( i, 1 );
      n++;
    } else {
      i++;
    }
  }
  return n;
}


// DOM functions ----------------------------

function xGet(id) {
  return document.getElementById(id);
}

function xGetFirst(selectors) {
  return document.querySelector(selectors);
}

function xGetAll(selectors) {
  return document.querySelectorAll(selectors);
}

function xElement(e) {
  return (typeof(e) === 'string') ? document.getElementById(e) : e;
}

function xDataset(e,name) {
  return xElement(e).getAttribute( 'data-'+name );
}

function xInnerHTML(e,t) {
  if (xStr(t)) {
    xElement(e).innerHTML = t;
  } else {
    t = xElement(e).innerHTML;
  }
  return t;
}

function xInnerText(e,defaultText) {
  e = xElement(e);
  if (xDef(e.innerText)) {
    return e.innerText;
  }
  if (xDef(e.textContent)) {
    return e.textContent;
  }
  return defaultText;
}

function xTagName(e) {
  // returns tag name in upper case
  return xElement(e).tagName;
}

function xShow(e) { xVisibility(e, 1); }
function xHide(e) { xVisibility(e, 0); }

function xVisibility(e,v)
// v: Boolean or Integer (0,>0) or String ('visible', 'hidden')
{
  if (xDef(v)) {
    if (!xStr(v)) v = v ? 'visible' : 'hidden';
    xElement(e).style.visibility = v;
  } else {
    v = xElement(e).style.visibility;
  }
  return v;
}

function xDisplay(e,v) {
  // v = '' (default), 'none', 'inline', 'block', ...
  // calls functions registered with xOnDisplay()
  e = xElement(e);
  var old = e.style.display;
  if (xStr(v)) {
    e.style.display = v;
    if (old != v) xTriggerEventDisplayChange(e);
  } else {
    v = old;
  }
  return v;
}

function xIsDisplayed(e) {
  // checks wether e and all parents are displayed by checking the computed style 'display'
  // note: visibility states caused by css rules are taken into account!
  e = xElement(e);
  while (xIsElementAndNotRoot(e)) {
    if (getComputedStyle(e).getPropertyValue('display') == 'none') return false;
    e = e.parentNode;
  }
  return true;
}

function xMoveTo(e,iX,iY) {
  // iX, iY: Integer
  e = xElement(e);
  e.style.left = iX + 'px';
  e.style.top = iY + 'px';
}

function xLeft(e,iX) {
  // iX: Integer; return Integer
  e = xElement(e);
  if (xStr(e.style.left)) {
    if (xNum(iX)) {
      e.style.left = iX + 'px';
    } else {
      iX = parseInt(e.style.left,10);
      if (isNaN(iX)) iX = 0;
    }
  }
  else if (xDef(e.style.pixelLeft)) {
    if (xNum(iX)) {
      e.style.pixelLeft = iX;
    } else {
      iX = e.style.pixelLeft;
    }
  } else {
    iX = 0;
  }
  return iX;
}

function xTop(e,iY) {
  // iY: Integer; return Integer
  e = xElement(e);
  if (xStr(e.style.top)) {
    if (xNum(iY)) {
      e.style.top = iY + 'px';
    } else {
      iY = parseInt(e.style.top,10);
      if (isNaN(iY)) iY=0;
    }
  }
  else if (xDef(e.style.pixelTop)) {
    if (xNum(iY)) {
      e.style.pixelTop = iY;
    }
    else {
      iY = e.style.pixelTop;
    }
  } else {
    iY = 0;
  }
  return iY;
}

function xOpacity(e,uO) {
  if (xNum(uO)) {
    xElement(e).style.opacity = uO;
  } else {
    uO = xElement(e).style.opacity;
  }
  return uO;
}

function xResizeTo(e,uW,uH,bBorderBoxSizing) {
  // bBorderBoxSizing: bool true -> use border box sizing model: uW, uH are the outer most pixels without margin
  xWidth(e,uW,bBorderBoxSizing);
  xHeight(e,uH,bBorderBoxSizing);
}

function xElementWidth(e,uW) {
  if (xNum(uW)) {
    xElement(e).width = uW;
  }
  else {
    uW = xElement(e).width;
  }
  return uW;
}

function xWidth(e,uW,bBorderBoxSizing) {
  // returns style.offsetWidth (visible element width + scrollbar + padding + border, not including margin)
  // or sets style.width to pixels:
  // * bBorderBoxSizing = true (default): style.width = uW - (padding + border) -> offsetWith = uW
  // * bBorderBoxSizing = false: style.width = uW -> offsetWidth => uW + padding + border
  // width returned is not affected by transform scale
  // use xElementWidth to set or read e.width instead of e.style.width
  // use xStyle(e,'width') to set or read e.style.width (my be undefined)
  if (xNum(uW)) {
    if (uW < 0) uW = 0;
    uW = Math.round(uW);
    xSetCW(xElement(e),uW,bBorderBoxSizing);
  } else {
    uW = xElement(e).offsetWidth;
  }
  return uW;
}

function xScrollWidth(e) {
  // returns the total width with padding, regardless how much of it is displayed
  return xElement(e).scrollWidth;
}

function xNaturalWidth(img) {
  // returns the natural width of an image element
  img = xElement(img);
  if (xDef(img.naturalWidth)) return img.naturalWidth;
  var tmpImg = new Image();
  tmpImg.src = img.src;
  return tmpImg.width;
}

function xElementHeight(e,uH) {
  if (xNum(uH)) {
    xElement(e).height = uH;
  } else {
    uH = xElement(e).height;
  }
  return uH;
}

function xHeight(e,uH,bBorderBoxSizing) {
  // returns style.offsetHeight (visible element height + scrollbar + padding + border, not including margin)
  // or sets style.height to pixels:
  // * bBorderBoxSizing = true (default): style.height = uH - (padding + border) -> offsetHeight = uH
  // * bBorderBoxSizing = false: style.height = uH -> offsetHeight => uH + padding + border
  // height returned is not affected by transform scale
  // use xElementHeight to set or read e.height instead of e.style.height
  if (xNum(uH)) {
    if (uH < 0) uH = 0;
    uH = Math.round(uH);
    xSetCH(xElement(e),uH,bBorderBoxSizing);
  }
  else {
    uH = xElement(e).offsetHeight;
  }
  return uH;
}

function xScrollHeight(e) {
  // returns the total height with padding, regardless how much of it is displayed
  return xElement(e).scrollHeight;
}

function xNaturalHeight(img) {
  // returns the natural height of an image element
  img = xElement(img);
  if (xDef(img.naturalHeight)) return img.naturalHeight;
  var tmpImg = new Image();
  tmpImg.src = img.src;
  return tmpImg.height;
}

function xGetCS(ele,sP){
  return parseInt(window.getComputedStyle(ele,'').getPropertyValue(sP),10);
}

function xSetCW(ele,uW,bBorderBoxSizing){
  // sets style.width to uW, if bBoderBoxSizing is false,
  // or to uW - (padding + border) if bBorderBoxSizing is true (corresponding to style.offsetWidth)
  var pl = 0, pr = 0, bl = 0, br = 0;
  bBorderBoxSizing = xDefBool( bBorderBoxSizing, true );
  var cssW = uW;
  if (bBorderBoxSizing) {
    if (window.getComputedStyle) {
      pl = xGetCS(ele,'padding-left');
      pr = xGetCS(ele,'padding-right');
      bl = xGetCS(ele,'border-left-width');
      br = xGetCS(ele,'border-right-width');
    }
    else if (xDef(ele.currentStyle)){
      pl = parseInt(ele.currentStyle.paddingLeft,10);
      pr = parseInt(ele.currentStyle.paddingRight,10);
      bl = parseInt(ele.currentStyle.borderLeftWidth,10);
      br = parseInt(ele.currentStyle.borderRightWidth,10);
    }
    else {
      ele.style.width = uW + 'px';
      pl = ele.offsetWidth - uW;
    }
    if (isNaN(pl)) pl = 0;
    if (isNaN(pr)) pr = 0;
    if (isNaN(bl)) bl = 0;
    if (isNaN(br)) br = 0;
    cssW -= (pl + pr + bl + br);
  }
  if (cssW < 0) cssW = 0;
  ele.style.width = cssW + 'px';
}

function xSetCH(ele,uH,bBorderBoxSizing){
  // sets style.height to uH, if bBoderBoxSizing is false,
  // or to uH - (padding + border) if bBorderBoxSizing is true (corresponding to style.offsetHeight)
  var pt = 0, pb = 0, bt = 0, bb = 0;
  bBorderBoxSizing = xDefBool( bBorderBoxSizing, true );
  var cssH = uH;
  if (bBorderBoxSizing) {
    if (window.getComputedStyle) {
      pt = xGetCS(ele,'padding-top');
      pb = xGetCS(ele,'padding-bottom');
      bt = xGetCS(ele,'border-top-width');
      bb = xGetCS(ele,'border-bottom-width');
    }
    else if (xDef(ele.currentStyle)){
      pt = parseInt(ele.currentStyle.paddingTop,10);
      pb = parseInt(ele.currentStyle.paddingBottom,10);
      bt = parseInt(ele.currentStyle.borderTopWidth,10);
      bb = parseInt(ele.currentStyle.borderBottomWidth,10);
    }
    else {
      ele.style.height = uH + 'px';
      pt = ele.offsetHeight - uH;
    }
    if (isNaN(pt)) pt = 0;
    if (isNaN(pb)) pb = 0;
    if (isNaN(bt)) bt = 0;
    if (isNaN(bb)) bb = 0;
    cssH -= (pt + pb + bt + bb);
  }
  if (cssH < 0) cssH = 0;
  ele.style.height = cssH + 'px';
}

function xClientWidth() {
  // returns width of viewport (inner width of window)
  var w = 0;
  if (document.compatMode == 'CSS1Compat' && !window.opera && document.documentElement && document.documentElement.clientWidth) {
    w = document.documentElement.clientWidth;
  }
  else if (document.body && document.body.clientWidth) {
    w = document.body.clientWidth;
  }
  else if (xDef(window.innerWidth) && xDef(window.innerHeight) && xDef(document.height)) {
    w = window.innerWidth;
    if (document.height > window.innerHeight) {
      w -= 16;
    }
  }
  return w;
}

function xClientHeight() {
  // returns height of viewport (inner height of window)
  var h = 0;
  if (document.compatMode == 'CSS1Compat' && !window.opera && document.documentElement && document.documentElement.clientHeight) {
    h = document.documentElement.clientHeight;
  }
  else if (document.body && document.body.clientHeight) {
    h = document.body.clientHeight;
  }
  else if (xDef(window.innerWidth) && xDef(window.innerHeight) && xDef(document.width)) {
    h = window.innerHeight;
    if (document.width > window.innerWidth) {
      h -= 16;
    }
  }
  return h;
}

function xPageX(e) {
  // returns x position in pixels relative to page
  e = xElement(e);
  var x = 0;
  var n = e;
  while (xIsElementAndNotRoot(e)) {
    x += e.offsetLeft;
    e = e.offsetParent;
  }
  // correct by all scrollings
  e = n;
  while (xIsElementAndNotRoot(e)) {
    x -= e.scrollLeft;
    e = e.parentNode;
  }
  return x;
}

function xPageY(e) {
  // returns y position in pixels relative to page
  e = xElement(e);
  var y = 0;
  var n = e;
  while (xIsElementAndNotRoot(e)) {
    y += e.offsetTop;
    e = e.offsetParent;
  }
  // correct by all scrollings
  e = n;
  while (xIsElementAndNotRoot(e)) {
    y -= e.scrollTop;
    e = e.parentNode;
  }
  return y;
}

function xIsRoot(e) {
  // e: dom element or null or undefined.
  // return true if e is defined and not null and a root element like document, html or body
  return (xAny(e) && (e == document || e.tagName == 'HTML' || e.tagName == 'BODY'));
}

function xIsElementAndNotRoot(e) {
  // e: dom element or null or undefined. Use xGet() to find dom elements by id
  // return true, if e is not undefined and not null and no dom element like document, html or body
  return (xAny(e) && !(e == document || e.tagName == 'HTML' || e.tagName == 'BODY'));
}

function xScrollLeft(e,bWin,val) {
  var offset = 0;
  if (!xDef(e) || bWin || xIsRoot(e)) {
    var w = window;
    if (bWin && e) w = e;
    if (w.document.documentElement && w.document.documentElement.scrollLeft) {
      if (xNum(val)) {
        w.document.documentElement.scrollLeft = val;
      } else {
        offset = w.document.documentElement.scrollLeft;
      }
    }
    else if (w.document.body && xDef(w.document.body.scrollLeft)) {
      if (xNum(val)) {
        w.document.body.scrollLeft = val;
      } else {
        offset = w.document.body.scrollLeft;
      }
    }
  }
  else {
    if (xNum(val)) {
      xElement(e).scrollLeft = val;
    } else {
      offset = xElement(e).scrollLeft;
    }
  }
  return offset;
}

function xScrollTop(e,bWin,val)
{
  var offset = 0;
  if (!xDef(e) || bWin || xIsRoot(e)) {
    var w = window;
    if (bWin && e) w = e;
    if (w.document.documentElement && w.document.documentElement.scrollTop) {
      if (xNum(val)) {
        w.document.documentElement.scrollTop = val;
      } else {
        offset = w.document.documentElement.scrollTop;
      }
    }
    else if (w.document.body && xDef(w.document.body.scrollTop)) {
      if (xNum(val)) {
        w.document.body.scrollTop = val;
      } else {
        offset = w.document.body.scrollTop;
      }
    }
  }
  else {
    if (xNum(val)) {
      xElement(e).scrollTop = val;
    } else {
      offset = xElement(e).scrollTop;
    }
  }
  return offset;
}

function xZIndex(e,uZ)
{
  if (xNum(uZ)) {
    xElement(e).style.zIndex = uZ;
  } else {
    uZ = parseInt(xElement(e).style.zIndex,10);
  }
  return uZ;
}

function xCursor(e,c)
{
  if (xStr(c)) {
    xElement(e).style.cursor = c;
  } else {
    c = xElement(e).style.cursor;
  }
  return c;
}

function xStyle(e,sStyle,sVal) {
  if (xDef(sVal)) {
    xElement(e).style[sStyle] = sVal;
  } else {
    sVal = xElement(e).style[sStyle];
  }
  return sVal;
}

function xMaskRegExp(s) {
  return s.replace( /\-/g, '\\-' );
}

function xHasClass(e,cls) {
  // returns false if e is undefined or null or root element
  if (!(e = xElement(e))) return false;
  if (xDef(e.classList)) {
    // assert xIsElementAndNotRoot()
    return e.classList.contains(cls);
  } else {
    if (xIsRoot(e)) return false;
    return e.className.match(new RegExp('(\\s|^)' + xMaskRegExp(cls) + '(\\s|$)'));
  }
}

function xAddClass(e,cls) {
  // does nothing if e is undefined or null or root element
  if (!(e = xElement(e))) return;
  if (xDef(e.classList)) {
    // assert xIsElementAndNotRoot()
    e.classList.add(cls);
  } else {
    if (xIsRoot(e)) return;
    if (!this.xHasClass(e,cls)) e.className += ' ' + cls;
  }
}

function xRemoveClass(e,cls) {
  // does nothing if e is undefined or null or root element
  if (!(e = xElement(e))) return;
  if (xDef(e.classList)) {
    // assert xIsElementAndNotRoot()
    e.classList.remove(cls);
  } else {
    if (xIsRoot(e)) return;
    if (xHasClass(e,cls)) {
      var reg = new RegExp('(\\s|^)' + xMaskRegExp(cls) + '(\\s|$)');
      e.className = e.className.replace( reg, ' ' ).replace( /^\s+|\s+$/g, '' );
    }
  }
}

function xToggleClass(e,cls) {
  // does nothing if e is undefined or null or root element
  if (!(e = xElement(e))) return;
  if (xDef(e.classList)) {
    // assert xIsElementAndNotRoot()
    e.classList.toggle(cls);
  } else {
    if (xHasClass(e,cls)) {
      xRemoveClass(e,cls);
    } else {
      xAddClass(e,cls);
    }
  }
}

function xSetClassIf(e,cond,cls) {
  // does nothing if e is undefined or null or root element
  // if cond is true then cls is added else removed from e
  if (cond) {
    xAddClass(e,cls);
  } else {
    xRemoveClass(e,cls);
  }
}

function xSetEnabled(e,enabled,cls) {
  xSetClassIf(e,enabled,xDefStr(cls,'enabled'));
}

function xSetDisabled(e,disabled,cls) {
  xSetClassIf(e,disabled,xDefStr(cls,'disabled'));
}

// HTML-Tree functions

function xParent(e,bNode) {
  bNode = xDefBool( bNode, true );
  if (bNode) {
    return xElement(e).parentNode;
  }
  else {
    return xElement(e).offsetParent;
  }
}

function xCreateElement(sTag) {
  return document.createElement(sTag);
}

function xCreateTextNode(s) {
  return document.createTextNode(s);
}

function xHasChildNodes(oParent) {
  return oParent.hasChildNodes();
}

function xChildNodes(oParent) {
  return oParent.childNodes;
}

function xAppendChild(oParent, oChild) {
  return oParent.appendChild(oChild);
}

function xInsertBefore(oParent, oChild, oRef) {
  return oParent.insertBefore(oChild,oRef);
}

function xRemoveChild(oParent, oChild) {
  return oParent.removeChild(oChild);
}

function xGetByTag(t,p) {
  t = t || '*';
  p = p || document;
  return p.getElementsByTagName(t);
}

function xGetByClass(className,p) {
  p = p || document;
  return p.getElementsByClassName(className);
}

function xAddEvent(e,eventType,callback,cap)
// e: string element id or element
// eventType: string event type (click, load, resize, ...)
// callback: function(xEvent) to call back
// cap: false -> call on bubble up phase like IE
// Note: callback is passed an new xEvent not the nativ event object, so its the same in all browsers!
{
  cap = xDefBool( cap, false );
  var wrapper = function xOnCallbackEventWrapper(e){ callback(new xEvent(e)); };
  callback.xWrapperFunc = wrapper;
  xElement(e).addEventListener(eventType,wrapper,cap);
}

function xRemoveEvent(e,eventType,callback,cap){
  cap = xDefBool( cap, false );
  xElement(e).removeEventListener(eventType,callback.xWrapperFunc,cap);
}

function xEvent(evt){
  // standardizes xEvent object defines the following properties for all brwosers:
  // event: Event = native Event object (evt)
  // type: String
  // target: dom object
  // relatedTarget: dom object
  // pageX, pageY: Integer
  // offsetX, offsetY: Integer
  // keyCode: Integer
  // shiftKey,ctrlKey, altKey: Boolean
  // button: Integer = mouse button pressed (0 = left, 1 = middle, 2 = rigth)

  this.Init(evt);
}

xEvent.prototype.Init = function(evt){
  var e = evt || window.event;
  if (!e) return;
  this.event = e;
  this.type = e.type;
  this.target = e.target || e.srcElement;
  // defeat Safari bug
  if (this.target.nodeType == 3) this.target = this.target.parentNode;
  this.relatedTarget = e.relatedTarget;
  if (e.type == 'mouseover') {
    this.relatedTarget = e.fromElement;
  }
  else if (e.type == 'mouseout') {
    this.relatedTarget = e.toElement;
  }
  if (xDef(e.pageX)) {
    this.pageX = e.pageX;
    this.pageY = e.pageY;
  }
  else if (xDef(e.clientX)) {
    this.pageX = e.clientX + xScrollLeft();
    this.pageY = e.clientY + xScrollTop();
  }
  if (xDef(e.offsetX)) {
    this.offsetX = e.offsetX;
    this.offsetY = e.offsetY;
  }
  else {
    this.offsetX = this.pageX - xPageX(this.target);
    this.offsetY = this.pageY - xPageY(this.target);
  }
  this.keyCode = e.keyCode || e.which || 0;
  this.shiftKey = e.shiftKey;
  this.ctrlKey = e.ctrlKey;
  this.altKey = e.altKey;
  if (typeof e.type == 'string') {
    if (e.type.indexOf('click') != -1) {
      this.button = 0;
    }
    else if (e.type.indexOf('mouse') != -1) {
      this.button = e.button;
      if (e.button & 1) {
        this.button = 0;
      }
      else if (e.button & 4) {
        this.button = 1;
      }
      else if (e.button & 2) {
        this.button = 2;
      }
    }
  }
};

xEvent.prototype.PreventDefault = function() {
  if (!this.event) return;
  if (this.event.preventDefault) this.event.preventDefault();
  this.event.returnValue = false;
};

xEvent.prototype.StopPropagation = function() {
  if (!this.event) return;
  if (this.event.stopPropagation) this.event.stopPropagation();
  this.event.cancelBubble = true;
};

function xImgOnLoad(img,loadCallback,errorCallback) {
  // calls loadCallback as soon as img is loaded. loadCallback is always called, even if img is already loaded!
  // loadCallback( img )
  // errorCallback( img, abort ); abort = false -> error loading image; abort = true -> loading aborted
  // Implementation: a helper image is created, callbacks are installed there, then helper.src = img.src
  // Note: callbacks are freed after first event happens by freeing helper image
  img = xElement(img);
  loadCallback = xDefFuncOrNull( loadCallback, null );
  errorCallback = xDefFuncOrNull( errorCallback, null );
  var helperImg = new Image();
  img._xHelperImg = helperImg;
  if (loadCallback) {
    helperImg.addEventListener(
      'load',
      function CB_OnImgLoad(){
        img._xHelperImg = null;
        loadCallback(img);
      },
      false
    );
  }
  if (errorCallback) {
    helperImg.addEventListener(
      'error',
      function CB_OnImgError(){
        img._xHelperImg = null;
        errorCallback(img,false);
      },
      false
    );
    helperImg.addEventListener(
      'abort',
      function CB_OnImgAbort(){
        img._xHelperImg = null;
        errorCallback(img,true);
      },
      false
    );
  }
  helperImg.src = img.src;
}

function xCallbackChain() {
  this.FuncList = [];
  this.Active = false;
}

xCallbackChain.prototype.Add = function( aFunc, once ) {
  // added functions are called in order of registration
  // once = true -> only add aFunc if not already in list
  // returns true, if aFunc is added to list
  once = xDefBool( once, false );
  if (once && this.Containes(aFunc)) return false;
  this.FuncList.push( aFunc );
  return true;
}

xCallbackChain.prototype.Contains = function( aFunc ) {
  return xDef(
    xArrFind(
      this.FuncList,
      function CB_Compare_Funcs(func){
        return func == aFunc;
      }
    )
  );
}

xCallbackChain.prototype.Remove = function( aFunc ) {
  // returns number of removed elements
  return xArrRemoveAll(
    this.FuncList,
    function CB_Compare_Funcs(func){
      return func == aFunc;
    }
  );
}

xCallbackChain.prototype.Call = function( aArg, aExceptionFunc ) {
  if (this.FuncList.length == 0 || this.Active) return; // prevent recursion
  this.Active = true;
  // make a copy of FuncList because FuncList may be changed in callbacks!
  var funcListCopy = this.FuncList.slice();
  xArrForEach(
    funcListCopy,
    function CB_Call_CallbackChainFunc(func) {
      try {
        func(aArg);
      } catch(e) {
        if (xFunc(aExceptionFunc)) aExceptionFunc(e);
      }
    },
    aArg
  );
  this.Active = false;
}

// xEventManager -------------------------------------------------------------------------

var xOnLoadFinished = false; // synchroniced with xEventManager.PageLoadFired

var xEventManager = {
  DomReadyHandlers: new xCallbackChain(),
  MyDomReadyHandlers: [],
  DomReadyFired: false,

  PageLoadHandlers: new xCallbackChain(),
  MyPageLoadHandler: null,
  PageLoadFired: false, // synchroniced with xOnLoadFinished

  PageUnloadHandlers: new xCallbackChain(),
  OldWindowOnUnloadHandler: null,
  MyPageUnloadHandler: null,

  LayoutChangeHandlers: new xCallbackChain(),
  MyLayoutChangeHandler: null,

  WindowResizeHandlers: new xCallbackChain(),
  WindowResizeTimer: null,
  MyWindowResizeHandler: null,

  DisplayChangeHandlers: new xCallbackChain(),

  AddDomReadyHandler: function( aFunc ) {
    var myDomReadyHandler = function xOnEventManager_DomReady(){
      xEventManager.DomReadyFired = true;
      xEventManager.RemoveDomReadyHandler( aFunc );
      try {
        aFunc();
      } catch(e) {};
    }
    this.MyDomReadyHandlers.push( { Func: aFunc, Handler: myDomReadyHandler } );
    if (this.DomReadyFired) {
      // exec aFunc as soon as possible
      setTimeout( myDomReadyHandler, 1 );
    } else if (document.addEventListener) {
      // Use the handy event callback
      document.addEventListener( "DOMContentLoaded", myDomReadyHandler, false );
    } else {
      // use xOnLoad but with a separate callback chain that is called before other onload callbacks
      this.DomReadyHandlers.Add( myDomReadyHandler );
    }
  },

  RemoveDomReadyHandler: function( aFunc ) {
    var handlerInfo = xArrFind(
      this.MyDomReadyHandlers,
      function CB_Compare_Funcs(item){
        return item.Func == aFunc;
      }
    );
    if (!handlerInfo) return;
    var myDomReadyHandler = handlerInfo.Handler;
    if (document.addEventListener) {
      document.removeEventListener( "DOMContentLoaded", myDomReadyHandler, false );
    } else {
      this.DomReadyHandlers.Remove( myDomReadyHandler );
    }
    xArrRemoveAll(
      this.MyDomReadyHandlers,
      function CB_Compare_Funcs(item){
        return item.Func == aFunc;
      }
    );
  },

  AddPageLoadHandler: function( aFunc ) {
    // installed functions are called in order of registration
    // if this function is called after onload is fired then func is called via timer as soon as possible
    if (!this.MyPageLoadHandler) {
      this.MyPageLoadHandler = function xOnEventManager_PageLoad() {
        xEventManager.PageLoadFired = true;
        // first call functions registered in xOnDomReady() on old brwosers
        xEventManager.DomReadyHandlers.Call();
        // call registered handlers
        xEventManager.PageLoadHandlers.Call();
        xOnLoadFinished = true;
      }
      window.addEventListener( 'load', this.MyPageLoadHandler );
    }
    if (this.PageLoadFired) {
      // call aFunc as soon as possible
      setTimeout(
        function CB_OnTimeout_PageLoadFired(){
          try {
            aFunc();
          }catch(e){}
        }, 1
      );
    } else {
      this.PageLoadHandlers.Add( aFunc );
    }
  },

  RemovePageLoadHander: function( aFunc ) {
    this.PageLoadHandlers.Remove( aFunc );
  },

  TriggerPageLoad: function() {
    this.PageLoadHandlers.Call(window);
  },

  AddPageUnloadHandler: function( aFunc ) {
    // installed functions are called in order of registration
    if (!this.MyPageUnloadHandler) {
      this.OldWindowOnUnloadHandler = window.onunload;
      this.MyPageUnloadHandler = function xOnEventManager_CallingOldUnloadHandler() {
        // call previous installed window.onload handler
        if (xEventManager.OldWindowOnUnloadHandler) {
          try {
            xEventManager.OldWindowOnUnloadHandler();
          } catch(e) {}
        }
        // call registered handlers
        xEventManager.PageUnloadHandlers.Call();
      }
      window.onunload = this.MyPageUnloadHandler;
    }
    this.PageUnloadHandlers.Add( aFunc );
  },

  RemovePageUnloadHander: function( aFunc ) {
    this.PageUnloadHandlers.Remove( aFunc );
  },

  TriggerPageUnload: function() {
    this.PageUnloadHandlers.Call(window);
  },

  AddLayoutChangeHandler: function( aFunc ) {
    // registers aFunc to be called when a page layout changes via call to TriggerLayoutChang()
    // or when a window resize occours
    // aFunc = function(arg)
    this.LayoutChangeHandlers.Add( aFunc );
    if (!this.MyLayoutChangeHandler) {
      this.MyLayoutChangeHandler = function xOnEventManager_OnLayoutChange(arg){
        xEventManager.TriggerLayoutChange(arg);
      }
      this.AddWindowResizeHandler( this.MyLayoutChangeHandler );
    }
  },

  RemoveLayoutChangeHandler: function( aFunc ) {
    this.LayoutChangeHandlers.Remove( aFunc );
  },

  TriggerLayoutChange: function( aArg ) {
    xOptions.Transform.OffsetElement = null;
    this.LayoutChangeHandlers.Call( aArg );
  },

  AddWindowResizeHandler: function( aFunc ) {
    // aFunc is only called after the size of the window is unchanged for some time (250ms) after a resize
    if (!this.MyWindowResizeHandler) {
      this.MyWindowResizeHandler = function xOnEventManager_OnWindowResize() {
        if (xEventManager.WindowResizeTimer) {
          clearTimeout( xEventManager.WindowResizeTimer );
        }
        xEventManager.WindowResizeTimer = setTimeout(
          function CB_OnTimeout_WindowResize() {
            clearTimeout( xEventManager.WindowResizeTimer );
            xEventManager.WindowResizeTimer = null;
            xEventManager.WindowResizeHandlers.Call();
          },
          250
        );
      }
      xAddEvent( window, 'resize', this.MyWindowResizeHandler );
    }
    this.WindowResizeHandlers.Add( aFunc );
  },

  RemoveWindowResizeHandler: function( aFunc ) {
    this.WindowResizeHandlers.Remove( aFunc );
  },

  TriggerWindowResize: function( aArg ) {
    this.WindowResizeHandlers.Call( aArg );
  },

  AddDisplayChangeHandler: function( aFunc ) {
    // registers aFunc to be called when a elements display property changes via TriggerDisplayChange()
    // aFunc = function( aEle ) where aEle is element that changes display property
    this.DisplayChangeHandlers.Add( aFunc );
  },

  RemoveDisplayChangeHandler: function( aFunc ) {
    this.DisplayChangeHandlers.Remove( aFunc );
  },

  TriggerDisplayChange: function( aArg ) {
    this.DisplayChangeHandlers.Call( aArg );
  },
};

// LayoutChange Event Handling
function xAddEventLayoutChange( aFunc )    { xEventManager.AddLayoutChangeHandler( aFunc ); }
function xRemoveEventLayoutChange( aFunc ) { xEventManager.RemoveLayoutChangeHandler( aFunc ); }
function xTriggerEventLayoutChange( aArg ) { xEventManager.TriggerLayoutChange( aArg ); }

// DisplayChange Event Handling
function xAddEventDisplayChange( aFunc )    { xEventManager.AddDisplayChangeHandler( aFunc ); }
function xRemoveEventDisplayChange( aFunc ) { xEventManager.RemoveDisplayChangeHandler( aFunc ); }
function xTriggerEventDisplayChange( aEle ) { xEventManager.TriggerDisplayChange( aEle ); }

// Window Resize Event Handling
function xAddEventWindowResize( aFunc )    { xEventManager.AddWindowResizeHandler( aFunc ); }
function xRemoveEventWindowResize( aFunc ) { xEventManager.RemoveWindowResizeHandler( aFunc ); }

// DOM Event Handling
function xOnDomReady( aFunc ) { xEventManager.AddDomReadyHandler( aFunc ); }
function xOnLoad( aFunc )     { xEventManager.AddPageLoadHandler( aFunc ); }
function xOnUnload( aFunc )   { xEventManager.AddPageUnloadHandler( aFunc ); }

// Transform Functions (faster than xMoveTo and xResizeTo ----------

var xOptions = {
  Transform: {
    PropertyNames: [ 'webkitTransform', 'MozTransform', 'msTransform', 'OTransform', 'transform' ],
    PropertyName: '?',
    OffsetElement: null, // caching
    OffsetX: 0,
    OffsetY: 0
  }
};

function xGetTransformPropertyName(e) {
  // returns property name of transform style (e.g. 'msTransform')
  // or '' if transforms are not supported
  var tf = xOptions.Transform;
  if (tf.PropertyName != '?') return tf.PropertyName;
  var names = tf.PropertyNames;
  var len = names.length;
  for (var i = 0; i < len; i++) {
    var name = names[i];
    if (xDef(e.style[name])) {
      tf.PropertyName = name;
      return name;
    }
  }
  tf.PropertyName = '';
  return '';
}

function xSupportsTransform(e) {
  // e: htmlElement or undefined
  if (!e) e = document.createElement('div');
  return xGetTransformPropertyName(e) != '';
}

function xTransform( e, trans ) {
  // trans: valid transform string (e.g. 'translate(10px,20px) scale(2,3)')
  // returns true if transforms are supported and transform is applied to e's style
  // Tip: use xFStr() to build trans strings
  e = xElement(e);
  var name = xGetTransformPropertyName(e);
  if (name == '') return false;
  e.style[name] = trans;
  return true;
}

function xTransformOrigin( e, origin ) {
  // origin: valid transform-origin string (e.g. 'left top', '50% 50%')
  // returns true if transforms are supported and transform is applied to e's style
  e = xElement(e);
  var name = xGetTransformPropertyName(e);
  if (name == '') return false;
  e.style[name+'Origin'] = origin;
  return true;
}

function xGetTransformDocOffset( e ) {
  // returns offset of doc origin refered to window origin
  // Note: translate(0,0) moves to doc origin, xMoveTo(0,0) moves to window origin
  var tf = xOptions.Transform;
  if (tf.OffsetElement != e) {
    tf.OffsetElement = e;
    tf.OffsetX = 0;
    tf.OffsetY = 0;
    if (!xTransform( e, 'translate(0px,0px)' )) return tf;
    tf.OffsetX = xPageX(e);
    tf.OffsetY = xPageY(e);
  }
  return tf; // = { OffsetX, OffsetY }
}

function xTransformNone( e ) {
  // removes all transformations if supported, else moves e via xMoveTo(0,0)
  e = xElement(e);
  if (!xTransform( e, 'none' )) xMoveTo( e, 0, 0 );
}

function xTransformTranslate( e, x, y, useWinOrigin ) {
  // uses style transforms to move e if supported, else uses xMoveTo
  e = xElement(e);
  useWinOrigin = xDefBool( useWinOrigin, false );
  var tx = x, ty = y;
  if (useWinOrigin) {
    var tf = xGetTransformDocOffset( e );
    tx -= tf.OffsetX;
    ty -= tf.OffsetY;
  }
  if (!xTransform( e, xFStr('translate(#px,#px)',tx,ty) )) xMoveTo( e, x, y );
}

function xTransformTranslateScale( e, x, y, w, h, wRef, hRef, useWinOrigin ) {
  // uses style transforms to move upper left point of e to (x,y) and size e to (w,h)
  // falls back to xMoveTo and xResizeTo if transforms are not supported
  // Note: to compute the transform matrix, the original size of e must be supported in (wRef,hRef)
  e = xElement(e);
  useWinOrigin = xDefBool( useWinOrigin, false );
  var tx = x, ty = y;
  if (useWinOrigin) {
    var t = xGetTransformDocOffset( e );
    tx -= t.OffsetX;
    ty -= t.OffsetY;
  }
  var xScale = w / wRef;
  var yScale = h / hRef;
  var xMove = (wRef/2)*(xScale-1) + tx;
  var yMove = (hRef/2)*(yScale-1) + ty;
  var trans = xFStr( 'matrix(#,0,0,#,#,#)', xScale, yScale, xMove, yMove );
  if (!xTransform( e, trans )) {
    xMoveTo( e, x, y );
    xResizeTo( e, w, h );
  }
}

// ---------

var xClipboardBuffer = null;

function xToClipboard(text) {
  // tryes to copy text to clipboard, returns true on success
  // must take place as a direct result of a user action, e.g. onClick event handler.
  if (xDef(window.clipboardData)) {
    window.clipboardData.setData('Text',text);
    return true;
  }
  else if (document.queryCommandSupported && document.queryCommandSupported('copy')) {
    var textArea = document.createElement("textarea");
    textArea.style.position = 'fixed';
    textArea.style.width = '2em';
    textArea.style.height = '2em';
    textArea.style.padding = 0;
    textArea.style.border = 'none';
    textArea.style.outline = 'none';
    textArea.style.boxShadow = 'none';
    textArea.style.background = 'transparent';

    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    var done = false;
    try {
      done = document.execCommand('copy');
    } catch (clipboardError) { }
    document.body.removeChild(textArea);
    return done;
  }
  return false;
}

function xTimeMS() {
  return (new Date()).getTime();
}

function xImage(aImgFilename) {
  var img = new Image();
  img.src = aImgFilename;
  return img;
}

function xChangeImage(aImgID,aImg) {
  var img = xElement(aImgID);
  if (img) {
    img.src = aImg.src;
  }
}

// var b1Img = new xMultiImage( 'b1', 'stuff/b1_up.gif', 'stuff/b1_down.gif' );
//
// <a href="next.html" onmouseover="b1Img.Show(1)" onmouseout="b1Img.Show(0)">
// <img id="b1" src="stuff/b1_up.gif" width="123" height="45" alt="next"></a>

function xMultiImage(aImgID) {
  this.ImgID = aImgID;
  this.Images = [];
  var a = xMultiImage.arguments;
  for (var i = 1; i < a.length; i++) {
    this.Images[i-1] = xImage(a[i]);
  }
}

xMultiImage.prototype.Show = function( aImageNumber ) {
  xChangeImage(this.ImgID,this.Images[aImageNumber]);
};

var xDbgMess = '';
var xDbgSep = '\n';
function xDbg( aMess ) {
  if (aMess) {
    xDbgMess += aMess + xDbgSep;
  }
  else {
    alert(xDbgMess);
  }
}

// uses a <textarea id="xdbgout" style="width:100%" rows=12></textarea>

function xDbgOut(x) {
  var o = xGet('xdbgout');
  if (o) {
    o.value = x;
  }
}

function xDbgApp(x) {
  var o = xGet('xdbgout');
  if (o) {
    o.value += x+'\n';
  }
}

// cookie functions

function xSetCookie(name,value,days) {
  days = days || 1;
  var date = new Date();
  date.setTime( date.getTime() + (days*24*60*60*1000) );
  var expires = '; expires=' + date.toGMTString();
  document.cookie = name + '=' + escape(value) + expires + '; path=/';
}

function xGetCookie(name) {
  var cName;
  var ca = document.cookie.split( ';' );
  for( var i = 0; i < ca.length; i++ ) {
    var c = ca[i];
    var eqPos = c.indexOf( '=' );
    if (eqPos >= 0) {
      cName = c.substr( 0, eqPos ).replace( /^\s+|\s+$/g, '' );
    } else {
      cName = c.replace( /^\s+|\s+$/g, '' );
    }
    if (name == cName) {
      if (eqPos < 0) return '';
      return unescape( c.substr( eqPos + 1 ) );
    }
  }
  return null;
}

function xDeleteCookie(name) {
  xSetCookie( name, '', -1 );
}

// some utility functions

function htmlString( aStr ) {
  var s = aStr;
  s = s.replace( /</g, '&lt;' );
  s = s.replace( />/g, '&gt;' );
  return s;
}

// http://paulirish.com/2011/requestanimationframe-for-smart-animating/
// http://my.opera.com/emoller/blog/2011/12/20/requestanimationframe-for-smart-er-animating

// requestAnimationFrame polyfill by Erik Möller
// fixes from Paul Irish and Tino Zijdel

(function() {
  var lastTime = 0;
  var vendors = ['ms', 'moz', 'webkit', 'o'];
  for(var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
    window.requestAnimationFrame = window[vendors[x]+'RequestAnimationFrame'];
    window.cancelAnimationFrame = window[vendors[x]+'CancelAnimationFrame']
                               || window[vendors[x]+'CancelRequestAnimationFrame'];
  }

  if (!window.requestAnimationFrame)
    window.requestAnimationFrame = function(callback, element) {
      var currTime = new Date().getTime();
      var timeToCall = Math.max(0, 16 - (currTime - lastTime));
      var id = window.setTimeout(function() { callback(currTime + timeToCall); },
        timeToCall);
      lastTime = currTime + timeToCall;
      return id;
    };

  if (!window.cancelAnimationFrame)
    window.cancelAnimationFrame = function(id) {
      clearTimeout(id);
    };
}());

// This polyfill covers the main use case which is creating a new object
// for which the prototype has been chosen but doesn't take the second argument into account.
// https://developer.mozilla.org/de/docs/Web/JavaScript/Reference/Global_Objects/Object/create

// usage:
//
// function SuperClass( params ) {
//   :
// }
//
// SuperClass.prototype.Override = function( arg ) {}
//
// function SubClass( params ) {
//   this.parentClass.constructor.call( this, params );
//   :
// }
//
// SubClass.inheritsFrom( SuperClass );
//
// SubClass.prototype.Override = function( arg ) {
//   this.parentClass.Override.call( this, arg );
//   :
// }

if (typeof Object.create != 'function') {
  Object.create = (function() {
    var Temp = function() {};
    return function (prototype) {
      if (arguments.length > 1) {
        throw Error('Second argument not supported');
      }
      if (typeof prototype != 'object') {
        throw TypeError('Argument must be an object');
      }
      Temp.prototype = prototype;
      var result = new Temp();
      Temp.prototype = null;
      return result;
    };
  })();
}

Function.prototype.inheritsFrom = function( parentClass ){
  this.prototype = Object.create( parentClass.prototype );
  this.prototype.constructor = this;
  this.prototype.parentClass = parentClass.prototype;
  return this;
}

// polyfill für Math.log10()

Math.log10 = Math.log10 || function(x) {
  return Math.log(x) / Math.LN10;
};
