// (C) http://walter.bislins.ch/doku/GraphX3D

var xClass2Type={};(function(){var types="Boolean Number String Function Array Date RegExp Object Error".split(" ");var len=types.length;for(var i=0;i<len;i++){var name=types[i];xClass2Type["[object "+name+"]"]=name.toLowerCase();}})();function xType(obj){if(obj==null)return obj+"";return typeof obj==="object"||typeof obj==="function"?xClass2Type[Object.prototype.toString.call(obj)]||"object":typeof obj;}
function xDef(x){return(typeof(x)!=='undefined');}
function xAny(x){return(typeof(x)!=='undefined'&&x!==null);}
function xObj(x){return(typeof(x)==='object'&&!xArray(x)&&x!==null);}
function xObjOrNull(x){return(typeof(x)==='object'&&!xArray(x));}
function xFunc(x){return xType(x)==='function';}
function xFuncOrNull(x){return(x===null||xType(x)==='function');}
var xArray=Array.isArray||function(obj){return xType(obj)==='array';};function xStr(x){return(typeof(x)==='string');}
function xNum(x){return(typeof(x)==='number');}
function xBool(x){return(typeof(x)==='boolean');}
function xIsNumeric(x){return(!xArray(x)&&(x-parseFloat(x)>=0));}
function xDefAny(aRef,aDefault){return(typeof(aRef)==='undefined'||aRef===null)?aDefault:aRef;}
function xDefAnyOrNull(aRef,aDefault){return(typeof(aRef)==='undefined')?aDefault:aRef;}
function xDefObj(aRef,aDefault){return(typeof(aRef)==='object'&&!xArray(aRef)&&aRef!==null)?aRef:aDefault;}
function xDefObjOrNull(aRef,aDefault){return(typeof(aRef)==='object'&&!xArray(aRef))?aRef:aDefault;}
function xDefFunc(aRef,aDefault){return xFunc(aRef)?aRef:aDefault;}
function xDefFuncOrNull(aRef,aDefault){return xFuncOrNull(aRef)?aRef:aDefault;}
function xDefArray(aRef,aDefault){return xArray(aRef)?aRef:aDefault;}
function xDefStr(aRef,aDefault){return(typeof(aRef)==='string')?aRef:aDefault;}
function xDefNum(aRef,aDefault){return(typeof(aRef)==='number')?aRef:aDefault;}
function xDefBool(aRef,aDefault){return(typeof(aRef)==='boolean')?aRef:aDefault;}
function xArgsToArray(args){return Array.prototype.slice.call(args);}
function xFStr(format,etc){var arg=arguments;var i=1;return format.replace(/(#(#)?)/g,function(match,p1,p2){return p2||arg[i++];});}
function xArrFind(start,arr,func,thisArg){if(!xNum(start))return xArrFind(0,start,arr,func);var t,undef
if(arguments.lenth>3)t=thisArg;var n=arr.length;for(var i=start;i<n;i++){if(func.call(t,arr[i],i,arr))return arr[i];}
return undef;}
function xArrFindIndex(start,arr,func,thisArg){if(!xNum(start))return xArrFindIndex(0,start,arr,func);var t
if(arguments.lenth>3)t=thisArg;var n=arr.length;for(var i=start;i<n;i++){if(func.call(t,arr[i],i,arr))return i;}
return-1;}
function xArrForEach(arr,func,thisArg){var t
if(arguments.length>2)t=thisArg;var n=arr.length;for(var i=0;i<n;i++){func.call(t,arr[i],i,arr);}}
function xArrayMap(arr,func,thisArg){var t
if(arguments.length>2)t=thisArg;var n=arr.length;var newArr=Array(n);for(var i=0;i<n;i++){newArr[i]=func.call(t,arr[i],i,arr);}
return newArr;}
function xArrRemove(arr,func,thisArg){var t,undef
if(arguments.length>2)t=thisArg;var i=0;while(i<arr.length){if(func.call(t,arr[i],i,arr)){var ele=arr[i];arr.splice(i,1);return ele;}else{i++;}}
return undef;}
function xArrRemoveAll(arr,func,thisArg){var t
if(arguments.length>2)t=thisArg;var n=0;var i=0;while(i<arr.length){if(func.call(t,arr[i],i,arr)){arr.splice(i,1);n++;}else{i++;}}
return n;}
function xGet(id){return document.getElementById(id);}
function xGetFirst(selectors){return document.querySelector(selectors);}
function xGetAll(selectors){return document.querySelectorAll(selectors);}
function xElement(e){return(typeof(e)==='string')?document.getElementById(e):e;}
function xDataset(e,name){return xElement(e).getAttribute('data-'+name);}
function xInnerHTML(e,t){if(xStr(t)){xElement(e).innerHTML=t;}else{t=xElement(e).innerHTML;}
return t;}
function xInnerText(e,defaultText){e=xElement(e);if(xDef(e.innerText)){return e.innerText;}
if(xDef(e.textContent)){return e.textContent;}
return defaultText;}
function xTagName(e){return xElement(e).tagName;}
function xShow(e){xVisibility(e,1);}
function xHide(e){xVisibility(e,0);}
function xVisibility(e,v)
{if(xDef(v)){if(!xStr(v))v=v?'visible':'hidden';xElement(e).style.visibility=v;}else{v=xElement(e).style.visibility;}
return v;}
function xDisplay(e,v){e=xElement(e);var old=e.style.display;if(xStr(v)){e.style.display=v;if(old!=v)xTriggerEventDisplayChange(e);}else{v=old;}
return v;}
function xIsDisplayed(e){e=xElement(e);while(xIsElementAndNotRoot(e)){if(getComputedStyle(e).getPropertyValue('display')=='none')return false;e=e.parentNode;}
return true;}
function xMoveTo(e,iX,iY){e=xElement(e);e.style.left=iX+'px';e.style.top=iY+'px';}
function xLeft(e,iX){e=xElement(e);if(xStr(e.style.left)){if(xNum(iX)){e.style.left=iX+'px';}else{iX=parseInt(e.style.left,10);if(isNaN(iX))iX=0;}}
else if(xDef(e.style.pixelLeft)){if(xNum(iX)){e.style.pixelLeft=iX;}else{iX=e.style.pixelLeft;}}else{iX=0;}
return iX;}
function xTop(e,iY){e=xElement(e);if(xStr(e.style.top)){if(xNum(iY)){e.style.top=iY+'px';}else{iY=parseInt(e.style.top,10);if(isNaN(iY))iY=0;}}
else if(xDef(e.style.pixelTop)){if(xNum(iY)){e.style.pixelTop=iY;}
else{iY=e.style.pixelTop;}}else{iY=0;}
return iY;}
function xOpacity(e,uO){if(xNum(uO)){xElement(e).style.opacity=uO;}else{uO=xElement(e).style.opacity;}
return uO;}
function xResizeTo(e,uW,uH,bBorderBoxSizing){xWidth(e,uW,bBorderBoxSizing);xHeight(e,uH,bBorderBoxSizing);}
function xElementWidth(e,uW){if(xNum(uW)){xElement(e).width=uW;}
else{uW=xElement(e).width;}
return uW;}
function xWidth(e,uW,bBorderBoxSizing){if(xNum(uW)){if(uW<0)uW=0;uW=Math.round(uW);xSetCW(xElement(e),uW,bBorderBoxSizing);}else{uW=xElement(e).offsetWidth;}
return uW;}
function xScrollWidth(e){return xElement(e).scrollWidth;}
function xNaturalWidth(img){img=xElement(img);if(xDef(img.naturalWidth))return img.naturalWidth;var tmpImg=new Image();tmpImg.src=img.src;return tmpImg.width;}
function xElementHeight(e,uH){if(xNum(uH)){xElement(e).height=uH;}else{uH=xElement(e).height;}
return uH;}
function xHeight(e,uH,bBorderBoxSizing){if(xNum(uH)){if(uH<0)uH=0;uH=Math.round(uH);xSetCH(xElement(e),uH,bBorderBoxSizing);}
else{uH=xElement(e).offsetHeight;}
return uH;}
function xScrollHeight(e){return xElement(e).scrollHeight;}
function xNaturalHeight(img){img=xElement(img);if(xDef(img.naturalHeight))return img.naturalHeight;var tmpImg=new Image();tmpImg.src=img.src;return tmpImg.height;}
function xGetCS(ele,sP){return parseInt(window.getComputedStyle(ele,'').getPropertyValue(sP),10);}
function xSetCW(ele,uW,bBorderBoxSizing){var pl=0,pr=0,bl=0,br=0;bBorderBoxSizing=xDefBool(bBorderBoxSizing,true);var cssW=uW;if(bBorderBoxSizing){if(window.getComputedStyle){pl=xGetCS(ele,'padding-left');pr=xGetCS(ele,'padding-right');bl=xGetCS(ele,'border-left-width');br=xGetCS(ele,'border-right-width');}
else if(xDef(ele.currentStyle)){pl=parseInt(ele.currentStyle.paddingLeft,10);pr=parseInt(ele.currentStyle.paddingRight,10);bl=parseInt(ele.currentStyle.borderLeftWidth,10);br=parseInt(ele.currentStyle.borderRightWidth,10);}
else{ele.style.width=uW+'px';pl=ele.offsetWidth-uW;}
if(isNaN(pl))pl=0;if(isNaN(pr))pr=0;if(isNaN(bl))bl=0;if(isNaN(br))br=0;cssW-=(pl+pr+bl+br);}
if(cssW<0)cssW=0;ele.style.width=cssW+'px';}
function xSetCH(ele,uH,bBorderBoxSizing){var pt=0,pb=0,bt=0,bb=0;bBorderBoxSizing=xDefBool(bBorderBoxSizing,true);var cssH=uH;if(bBorderBoxSizing){if(window.getComputedStyle){pt=xGetCS(ele,'padding-top');pb=xGetCS(ele,'padding-bottom');bt=xGetCS(ele,'border-top-width');bb=xGetCS(ele,'border-bottom-width');}
else if(xDef(ele.currentStyle)){pt=parseInt(ele.currentStyle.paddingTop,10);pb=parseInt(ele.currentStyle.paddingBottom,10);bt=parseInt(ele.currentStyle.borderTopWidth,10);bb=parseInt(ele.currentStyle.borderBottomWidth,10);}
else{ele.style.height=uH+'px';pt=ele.offsetHeight-uH;}
if(isNaN(pt))pt=0;if(isNaN(pb))pb=0;if(isNaN(bt))bt=0;if(isNaN(bb))bb=0;cssH-=(pt+pb+bt+bb);}
if(cssH<0)cssH=0;ele.style.height=cssH+'px';}
function xClientWidth(){var w=0;if(document.compatMode=='CSS1Compat'&&!window.opera&&document.documentElement&&document.documentElement.clientWidth){w=document.documentElement.clientWidth;}
else if(document.body&&document.body.clientWidth){w=document.body.clientWidth;}
else if(xDef(window.innerWidth)&&xDef(window.innerHeight)&&xDef(document.height)){w=window.innerWidth;if(document.height>window.innerHeight){w-=16;}}
return w;}
function xClientHeight(){var h=0;if(document.compatMode=='CSS1Compat'&&!window.opera&&document.documentElement&&document.documentElement.clientHeight){h=document.documentElement.clientHeight;}
else if(document.body&&document.body.clientHeight){h=document.body.clientHeight;}
else if(xDef(window.innerWidth)&&xDef(window.innerHeight)&&xDef(document.width)){h=window.innerHeight;if(document.width>window.innerWidth){h-=16;}}
return h;}
function xPageX(e){e=xElement(e);var x=0;var n=e;while(xIsElementAndNotRoot(e)){x+=e.offsetLeft;e=e.offsetParent;}
e=n;while(xIsElementAndNotRoot(e)){x-=e.scrollLeft;e=e.parentNode;}
return x;}
function xPageY(e){e=xElement(e);var y=0;var n=e;while(xIsElementAndNotRoot(e)){y+=e.offsetTop;e=e.offsetParent;}
e=n;while(xIsElementAndNotRoot(e)){y-=e.scrollTop;e=e.parentNode;}
return y;}
function xIsRoot(e){return(xAny(e)&&(e==document||e.tagName=='HTML'||e.tagName=='BODY'));}
function xIsElementAndNotRoot(e){return(xAny(e)&&!(e==document||e.tagName=='HTML'||e.tagName=='BODY'));}
function xScrollLeft(e,bWin,val){var offset=0;if(!xDef(e)||bWin||xIsRoot(e)){var w=window;if(bWin&&e)w=e;if(w.document.documentElement&&w.document.documentElement.scrollLeft){if(xNum(val)){w.document.documentElement.scrollLeft=val;}else{offset=w.document.documentElement.scrollLeft;}}
else if(w.document.body&&xDef(w.document.body.scrollLeft)){if(xNum(val)){w.document.body.scrollLeft=val;}else{offset=w.document.body.scrollLeft;}}}
else{if(xNum(val)){xElement(e).scrollLeft=val;}else{offset=xElement(e).scrollLeft;}}
return offset;}
function xScrollTop(e,bWin,val)
{var offset=0;if(!xDef(e)||bWin||xIsRoot(e)){var w=window;if(bWin&&e)w=e;if(w.document.documentElement&&w.document.documentElement.scrollTop){if(xNum(val)){w.document.documentElement.scrollTop=val;}else{offset=w.document.documentElement.scrollTop;}}
else if(w.document.body&&xDef(w.document.body.scrollTop)){if(xNum(val)){w.document.body.scrollTop=val;}else{offset=w.document.body.scrollTop;}}}
else{if(xNum(val)){xElement(e).scrollTop=val;}else{offset=xElement(e).scrollTop;}}
return offset;}
function xZIndex(e,uZ)
{if(xNum(uZ)){xElement(e).style.zIndex=uZ;}else{uZ=parseInt(xElement(e).style.zIndex,10);}
return uZ;}
function xCursor(e,c)
{if(xStr(c)){xElement(e).style.cursor=c;}else{c=xElement(e).style.cursor;}
return c;}
function xStyle(e,sStyle,sVal){if(xDef(sVal)){xElement(e).style[sStyle]=sVal;}else{sVal=xElement(e).style[sStyle];}
return sVal;}
function xMaskRegExp(s){return s.replace(/\-/g,'\\-');}
function xHasClass(e,cls){if(!(e=xElement(e)))return false;if(xDef(e.classList)){return e.classList.contains(cls);}else{if(xIsRoot(e))return false;return e.className.match(new RegExp('(\\s|^)'+xMaskRegExp(cls)+'(\\s|$)'));}}
function xAddClass(e,cls){if(!(e=xElement(e)))return;if(xDef(e.classList)){e.classList.add(cls);}else{if(xIsRoot(e))return;if(!this.xHasClass(e,cls))e.className+=' '+cls;}}
function xRemoveClass(e,cls){if(!(e=xElement(e)))return;if(xDef(e.classList)){e.classList.remove(cls);}else{if(xIsRoot(e))return;if(xHasClass(e,cls)){var reg=new RegExp('(\\s|^)'+xMaskRegExp(cls)+'(\\s|$)');e.className=e.className.replace(reg,' ').replace(/^\s+|\s+$/g,'');}}}
function xToggleClass(e,cls){if(!(e=xElement(e)))return;if(xDef(e.classList)){e.classList.toggle(cls);}else{if(xHasClass(e,cls)){xRemoveClass(e,cls);}else{xAddClass(e,cls);}}}
function xSetClassIf(e,cond,cls){if(cond){xAddClass(e,cls);}else{xRemoveClass(e,cls);}}
function xSetEnabled(e,enabled,cls){xSetClassIf(e,enabled,xDefStr(cls,'enabled'));}
function xSetDisabled(e,disabled,cls){xSetClassIf(e,disabled,xDefStr(cls,'disabled'));}
function xParent(e,bNode){bNode=xDefBool(bNode,true);if(bNode){return xElement(e).parentNode;}
else{return xElement(e).offsetParent;}}
function xCreateElement(sTag){return document.createElement(sTag);}
function xCreateTextNode(s){return document.createTextNode(s);}
function xHasChildNodes(oParent){return oParent.hasChildNodes();}
function xChildNodes(oParent){return oParent.childNodes;}
function xAppendChild(oParent,oChild){return oParent.appendChild(oChild);}
function xInsertBefore(oParent,oChild,oRef){return oParent.insertBefore(oChild,oRef);}
function xRemoveChild(oParent,oChild){return oParent.removeChild(oChild);}
function xGetByTag(t,p){t=t||'*';p=p||document;return p.getElementsByTagName(t);}
function xGetByClass(className,p){p=p||document;return p.getElementsByClassName(className);}
function xAddEvent(e,eventType,callback,cap)
{cap=xDefBool(cap,false);var wrapper=function xOnCallbackEventWrapper(e){callback(new xEvent(e));};callback.xWrapperFunc=wrapper;xElement(e).addEventListener(eventType,wrapper,cap);}
function xRemoveEvent(e,eventType,callback,cap){cap=xDefBool(cap,false);xElement(e).removeEventListener(eventType,callback.xWrapperFunc,cap);}
function xEvent(evt){this.Init(evt);}
xEvent.prototype.Init=function(evt){var e=evt||window.event;if(!e)return;this.event=e;this.type=e.type;this.target=e.target||e.srcElement;if(this.target.nodeType==3)this.target=this.target.parentNode;this.relatedTarget=e.relatedTarget;if(e.type=='mouseover'){this.relatedTarget=e.fromElement;}
else if(e.type=='mouseout'){this.relatedTarget=e.toElement;}
if(xDef(e.pageX)){this.pageX=e.pageX;this.pageY=e.pageY;}
else if(xDef(e.clientX)){this.pageX=e.clientX+xScrollLeft();this.pageY=e.clientY+xScrollTop();}
if(xDef(e.offsetX)){this.offsetX=e.offsetX;this.offsetY=e.offsetY;}
else{this.offsetX=this.pageX-xPageX(this.target);this.offsetY=this.pageY-xPageY(this.target);}
this.keyCode=e.keyCode||e.which||0;this.shiftKey=e.shiftKey;this.ctrlKey=e.ctrlKey;this.altKey=e.altKey;if(typeof e.type=='string'){if(e.type.indexOf('click')!=-1){this.button=0;}
else if(e.type.indexOf('mouse')!=-1){this.button=e.button;if(e.button&1){this.button=0;}
else if(e.button&4){this.button=1;}
else if(e.button&2){this.button=2;}}}};xEvent.prototype.PreventDefault=function(){if(!this.event)return;if(this.event.preventDefault)this.event.preventDefault();this.event.returnValue=false;};xEvent.prototype.StopPropagation=function(){if(!this.event)return;if(this.event.stopPropagation)this.event.stopPropagation();this.event.cancelBubble=true;};function xImgOnLoad(img,loadCallback,errorCallback){img=xElement(img);loadCallback=xDefFuncOrNull(loadCallback,null);errorCallback=xDefFuncOrNull(errorCallback,null);var helperImg=new Image();img._xHelperImg=helperImg;if(loadCallback){helperImg.addEventListener('load',function CB_OnImgLoad(){img._xHelperImg=null;loadCallback(img);},false);}
if(errorCallback){helperImg.addEventListener('error',function CB_OnImgError(){img._xHelperImg=null;errorCallback(img,false);},false);helperImg.addEventListener('abort',function CB_OnImgAbort(){img._xHelperImg=null;errorCallback(img,true);},false);}
helperImg.src=img.src;}
function xCallbackChain(){this.FuncList=[];this.Active=false;}
xCallbackChain.prototype.Add=function(aFunc,once){once=xDefBool(once,false);if(once&&this.Containes(aFunc))return false;this.FuncList.push(aFunc);return true;}
xCallbackChain.prototype.Contains=function(aFunc){return xDef(xArrFind(this.FuncList,function CB_Compare_Funcs(func){return func==aFunc;}));}
xCallbackChain.prototype.Remove=function(aFunc){return xArrRemoveAll(this.FuncList,function CB_Compare_Funcs(func){return func==aFunc;});}
xCallbackChain.prototype.Call=function(aArg,aExceptionFunc){if(this.FuncList.length==0||this.Active)return;this.Active=true;var funcListCopy=this.FuncList.slice();xArrForEach(funcListCopy,function CB_Call_CallbackChainFunc(func){try{func(aArg);}catch(e){if(xFunc(aExceptionFunc))aExceptionFunc(e);}},aArg);this.Active=false;}
var xOnLoadFinished=false;var xEventManager={DomReadyHandlers:new xCallbackChain(),MyDomReadyHandlers:[],DomReadyFired:false,PageLoadHandlers:new xCallbackChain(),MyPageLoadHandler:null,PageLoadFired:false,PageUnloadHandlers:new xCallbackChain(),OldWindowOnUnloadHandler:null,MyPageUnloadHandler:null,LayoutChangeHandlers:new xCallbackChain(),MyLayoutChangeHandler:null,WindowResizeHandlers:new xCallbackChain(),WindowResizeTimer:null,MyWindowResizeHandler:null,DisplayChangeHandlers:new xCallbackChain(),AddDomReadyHandler:function(aFunc){var myDomReadyHandler=function xOnEventManager_DomReady(){xEventManager.DomReadyFired=true;xEventManager.RemoveDomReadyHandler(aFunc);try{aFunc();}catch(e){};}
this.MyDomReadyHandlers.push({Func:aFunc,Handler:myDomReadyHandler});if(this.DomReadyFired){setTimeout(myDomReadyHandler,1);}else if(document.addEventListener){document.addEventListener("DOMContentLoaded",myDomReadyHandler,false);}else{this.DomReadyHandlers.Add(myDomReadyHandler);}},RemoveDomReadyHandler:function(aFunc){var handlerInfo=xArrFind(this.MyDomReadyHandlers,function CB_Compare_Funcs(item){return item.Func==aFunc;});if(!handlerInfo)return;var myDomReadyHandler=handlerInfo.Handler;if(document.addEventListener){document.removeEventListener("DOMContentLoaded",myDomReadyHandler,false);}else{this.DomReadyHandlers.Remove(myDomReadyHandler);}
xArrRemoveAll(this.MyDomReadyHandlers,function CB_Compare_Funcs(item){return item.Func==aFunc;});},AddPageLoadHandler:function(aFunc){if(!this.MyPageLoadHandler){this.MyPageLoadHandler=function xOnEventManager_PageLoad(){xEventManager.PageLoadFired=true;xEventManager.DomReadyHandlers.Call();xEventManager.PageLoadHandlers.Call();xOnLoadFinished=true;}
window.addEventListener('load',this.MyPageLoadHandler);}
if(this.PageLoadFired){setTimeout(function CB_OnTimeout_PageLoadFired(){try{aFunc();}catch(e){}},1);}else{this.PageLoadHandlers.Add(aFunc);}},RemovePageLoadHander:function(aFunc){this.PageLoadHandlers.Remove(aFunc);},TriggerPageLoad:function(){this.PageLoadHandlers.Call(window);},AddPageUnloadHandler:function(aFunc){if(!this.MyPageUnloadHandler){this.OldWindowOnUnloadHandler=window.onunload;this.MyPageUnloadHandler=function xOnEventManager_CallingOldUnloadHandler(){if(xEventManager.OldWindowOnUnloadHandler){try{xEventManager.OldWindowOnUnloadHandler();}catch(e){}}
xEventManager.PageUnloadHandlers.Call();}
window.onunload=this.MyPageUnloadHandler;}
this.PageUnloadHandlers.Add(aFunc);},RemovePageUnloadHander:function(aFunc){this.PageUnloadHandlers.Remove(aFunc);},TriggerPageUnload:function(){this.PageUnloadHandlers.Call(window);},AddLayoutChangeHandler:function(aFunc){this.LayoutChangeHandlers.Add(aFunc);if(!this.MyLayoutChangeHandler){this.MyLayoutChangeHandler=function xOnEventManager_OnLayoutChange(arg){xEventManager.TriggerLayoutChange(arg);}
this.AddWindowResizeHandler(this.MyLayoutChangeHandler);}},RemoveLayoutChangeHandler:function(aFunc){this.LayoutChangeHandlers.Remove(aFunc);},TriggerLayoutChange:function(aArg){xOptions.Transform.OffsetElement=null;this.LayoutChangeHandlers.Call(aArg);},AddWindowResizeHandler:function(aFunc){if(!this.MyWindowResizeHandler){this.MyWindowResizeHandler=function xOnEventManager_OnWindowResize(){if(xEventManager.WindowResizeTimer){clearTimeout(xEventManager.WindowResizeTimer);}
xEventManager.WindowResizeTimer=setTimeout(function CB_OnTimeout_WindowResize(){clearTimeout(xEventManager.WindowResizeTimer);xEventManager.WindowResizeTimer=null;xEventManager.WindowResizeHandlers.Call();},250);}
xAddEvent(window,'resize',this.MyWindowResizeHandler);}
this.WindowResizeHandlers.Add(aFunc);},RemoveWindowResizeHandler:function(aFunc){this.WindowResizeHandlers.Remove(aFunc);},TriggerWindowResize:function(aArg){this.WindowResizeHandlers.Call(aArg);},AddDisplayChangeHandler:function(aFunc){this.DisplayChangeHandlers.Add(aFunc);},RemoveDisplayChangeHandler:function(aFunc){this.DisplayChangeHandlers.Remove(aFunc);},TriggerDisplayChange:function(aArg){this.DisplayChangeHandlers.Call(aArg);},};function xAddEventLayoutChange(aFunc){xEventManager.AddLayoutChangeHandler(aFunc);}
function xRemoveEventLayoutChange(aFunc){xEventManager.RemoveLayoutChangeHandler(aFunc);}
function xTriggerEventLayoutChange(aArg){xEventManager.TriggerLayoutChange(aArg);}
function xAddEventDisplayChange(aFunc){xEventManager.AddDisplayChangeHandler(aFunc);}
function xRemoveEventDisplayChange(aFunc){xEventManager.RemoveDisplayChangeHandler(aFunc);}
function xTriggerEventDisplayChange(aEle){xEventManager.TriggerDisplayChange(aEle);}
function xAddEventWindowResize(aFunc){xEventManager.AddWindowResizeHandler(aFunc);}
function xRemoveEventWindowResize(aFunc){xEventManager.RemoveWindowResizeHandler(aFunc);}
function xOnDomReady(aFunc){xEventManager.AddDomReadyHandler(aFunc);}
function xOnLoad(aFunc){xEventManager.AddPageLoadHandler(aFunc);}
function xOnUnload(aFunc){xEventManager.AddPageUnloadHandler(aFunc);}
var xOptions={Transform:{PropertyNames:['webkitTransform','MozTransform','msTransform','OTransform','transform'],PropertyName:'?',OffsetElement:null,OffsetX:0,OffsetY:0}};function xGetTransformPropertyName(e){var tf=xOptions.Transform;if(tf.PropertyName!='?')return tf.PropertyName;var names=tf.PropertyNames;var len=names.length;for(var i=0;i<len;i++){var name=names[i];if(xDef(e.style[name])){tf.PropertyName=name;return name;}}
tf.PropertyName='';return'';}
function xSupportsTransform(e){if(!e)e=document.createElement('div');return xGetTransformPropertyName(e)!='';}
function xTransform(e,trans){e=xElement(e);var name=xGetTransformPropertyName(e);if(name=='')return false;e.style[name]=trans;return true;}
function xTransformOrigin(e,origin){e=xElement(e);var name=xGetTransformPropertyName(e);if(name=='')return false;e.style[name+'Origin']=origin;return true;}
function xGetTransformDocOffset(e){var tf=xOptions.Transform;if(tf.OffsetElement!=e){tf.OffsetElement=e;tf.OffsetX=0;tf.OffsetY=0;if(!xTransform(e,'translate(0px,0px)'))return tf;tf.OffsetX=xPageX(e);tf.OffsetY=xPageY(e);}
return tf;}
function xTransformNone(e){e=xElement(e);if(!xTransform(e,'none'))xMoveTo(e,0,0);}
function xTransformTranslate(e,x,y,useWinOrigin){e=xElement(e);useWinOrigin=xDefBool(useWinOrigin,false);var tx=x,ty=y;if(useWinOrigin){var tf=xGetTransformDocOffset(e);tx-=tf.OffsetX;ty-=tf.OffsetY;}
if(!xTransform(e,xFStr('translate(#px,#px)',tx,ty)))xMoveTo(e,x,y);}
function xTransformTranslateScale(e,x,y,w,h,wRef,hRef,useWinOrigin){e=xElement(e);useWinOrigin=xDefBool(useWinOrigin,false);var tx=x,ty=y;if(useWinOrigin){var t=xGetTransformDocOffset(e);tx-=t.OffsetX;ty-=t.OffsetY;}
var xScale=w/wRef;var yScale=h/hRef;var xMove=(wRef/2)*(xScale-1)+tx;var yMove=(hRef/2)*(yScale-1)+ty;var trans=xFStr('matrix(#,0,0,#,#,#)',xScale,yScale,xMove,yMove);if(!xTransform(e,trans)){xMoveTo(e,x,y);xResizeTo(e,w,h);}}
var xClipboardBuffer=null;function xToClipboard(text){if(xDef(window.clipboardData)){window.clipboardData.setData('Text',text);return true;}
else if(document.queryCommandSupported&&document.queryCommandSupported('copy')){var textArea=document.createElement("textarea");textArea.style.position='fixed';textArea.style.width='2em';textArea.style.height='2em';textArea.style.padding=0;textArea.style.border='none';textArea.style.outline='none';textArea.style.boxShadow='none';textArea.style.background='transparent';textArea.value=text;document.body.appendChild(textArea);textArea.select();var done=false;try{done=document.execCommand('copy');}catch(clipboardError){}
document.body.removeChild(textArea);return done;}
return false;}
function xTimeMS(){return(new Date()).getTime();}
function xImage(aImgFilename){var img=new Image();img.src=aImgFilename;return img;}
function xChangeImage(aImgID,aImg){var img=xElement(aImgID);if(img){img.src=aImg.src;}}
function xMultiImage(aImgID){this.ImgID=aImgID;this.Images=[];var a=xMultiImage.arguments;for(var i=1;i<a.length;i++){this.Images[i-1]=xImage(a[i]);}}
xMultiImage.prototype.Show=function(aImageNumber){xChangeImage(this.ImgID,this.Images[aImageNumber]);};var xDbgMess='';var xDbgSep='\n';function xDbg(aMess){if(aMess){xDbgMess+=aMess+xDbgSep;}
else{alert(xDbgMess);}}
function xDbgOut(x){var o=xGet('xdbgout');if(o){o.value=x;}}
function xDbgApp(x){var o=xGet('xdbgout');if(o){o.value+=x+'\n';}}
function xSetCookie(name,value,days){days=days||1;var date=new Date();date.setTime(date.getTime()+(days*24*60*60*1000));var expires='; expires='+date.toGMTString();document.cookie=name+'='+escape(value)+expires+'; path=/';}
function xGetCookie(name){var cName;var ca=document.cookie.split(';');for(var i=0;i<ca.length;i++){var c=ca[i];var eqPos=c.indexOf('=');if(eqPos>=0){cName=c.substr(0,eqPos).replace(/^\s+|\s+$/g,'');}else{cName=c.replace(/^\s+|\s+$/g,'');}
if(name==cName){if(eqPos<0)return'';return unescape(c.substr(eqPos+1));}}
return null;}
function xDeleteCookie(name){xSetCookie(name,'',-1);}
function htmlString(aStr){var s=aStr;s=s.replace(/</g,'&lt;');s=s.replace(/>/g,'&gt;');return s;}
(function(){var lastTime=0;var vendors=['ms','moz','webkit','o'];for(var x=0;x<vendors.length&&!window.requestAnimationFrame;++x){window.requestAnimationFrame=window[vendors[x]+'RequestAnimationFrame'];window.cancelAnimationFrame=window[vendors[x]+'CancelAnimationFrame']||window[vendors[x]+'CancelRequestAnimationFrame'];}
if(!window.requestAnimationFrame)
window.requestAnimationFrame=function(callback,element){var currTime=new Date().getTime();var timeToCall=Math.max(0,16-(currTime-lastTime));var id=window.setTimeout(function(){callback(currTime+timeToCall);},timeToCall);lastTime=currTime+timeToCall;return id;};if(!window.cancelAnimationFrame)
window.cancelAnimationFrame=function(id){clearTimeout(id);};}());if(typeof Object.create!='function'){Object.create=(function(){var Temp=function(){};return function(prototype){if(arguments.length>1){throw Error('Second argument not supported');}
if(typeof prototype!='object'){throw TypeError('Argument must be an object');}
Temp.prototype=prototype;var result=new Temp();Temp.prototype=null;return result;};})();}
Function.prototype.inheritsFrom=function(parentClass){this.prototype=Object.create(parentClass.prototype);this.prototype.constructor=this;this.prototype.parentClass=parentClass.prototype;return this;}
Math.log10=Math.log10||function(x){return Math.log(x)/Math.LN10;};
var JsgColor={RGB:function(r,g,b){return[r,g,b,1];},RGBA:function(r,g,b,a){return[r,g,b,a];},BW:function(v){return[v,v,v,1];},Black:function(){return[0,0,0,1];},White:function(){return[1,1,1,1];},Ok:function(col){return xArray(col);},Alpha:function(col){return xDefNum(col[3],1);},SetAlpha:function(col,a){col[3]=xDefNum(a,1);return col;},SetRGBA:function(col,r,g,b,a){col[0]=r;col[1]=g;col[2]=b;col[3]=a;return col;},SetRGB:function(col,r,g,b){col[0]=r;col[1]=g;col[2]=b;col[3]=1;return col;},SetBW:function(col,v){col[0]=v;col[1]=v;col[2]=v;col[3]=1;return col;},SetBlack:function(col){col[0]=0;col[1]=0;col[2]=0;col[3]=1;return col;},SetWhite:function(col){col[0]=1;col[1]=1;col[2]=1;col[3]=1;return col;},Copy:function(src){return[src[0],src[1],src[2],this.DefNum(src[3],1)];},CopyTo:function(src,dest){dest[0]=src[0];dest[1]=src[1];dest[2]=src[2];dest[3]=this.DefNum(src[3],1);return dest;},Scale:function(col,s){col[0]*=s;col[1]*=s;col[2]*=s;return col;},Add:function(col,add){col[0]+=add[0];col[1]+=add[1];col[2]+=add[2];return col;},Mult:function(col,mul){col[0]*=mul[0];col[1]*=mul[1];col[2]*=mul[2];return col;},ToString:function(col){function normCol(cx){cx=Math.round(cx*255);return(cx>255)?255:((cx<0)?0:cx);}
function toHex(cx){cx=normCol(cx);var hex=cx.toString(16);return cx<16?"0"+hex:hex;}
var a=normCol(this.DefNum(col[3],1));if(a==255){return'#'+toHex(col[0])+toHex(col[1])+toHex(col[2]);}else{return'rgba('
+normCol(col[0]).toFixed(0)+','
+normCol(col[1]).toFixed(0)+','
+normCol(col[2]).toFixed(0)+','
+(a/255).toFixed(3)+')';}},HSV:function(h,s,v,a){var Num=this.DefNum,Limit=this.Limit01;h=Limit(Num(h,1));s=Limit(Num(s,1));v=Limit(Num(v,1));a=Limit(Num(a,1));var r,g,b,hi;h*=6;hi=Math.floor(h)%6;h=h%1;switch(hi){case 0:r=1;g=h;b=0;break;case 1:r=1-h;g=1;b=0;break;case 2:r=0;g=1;b=h;break;case 3:r=0;g=1-h;b=1;break;case 4:r=h;g=0;b=1;break;default:r=1;g=0;b=1-h;}
r=v*(1-(1-r)*s);g=v*(1-(1-g)*s);b=v*(1-(1-b)*s);return[r,g,b,a];},HL:function(h,l,a){l=this.Limit01(this.DefNum(l,0.5));var s,v;if(l<0.5){s=1;v=2*l;}else{v=1;s=1-2*(l-0.5);}
return this.HSV(h,s,v,a);},DefNum:function(x,def){return(typeof(x)==='number')?x:def;},Limit01:function(x){return(x<0)?0:((x>1)?1:x);}};var JsgVect2={New:function(x,y){return[x,y];},Set:function(v,x,y){v[0]=x;v[1]=y;return v;},Null:function(){return[0,0];},Ok:function(v){return xArray(v);},Scale:function(v,s){return[s*v[0],s*v[1]];},Add:function(v1,v2){return[v1[0]+v2[0],v1[1]+v2[1]];},Sub:function(v1,v2){return[v1[0]-v2[0],v1[1]-v2[1]];},Length:function(v){var x=v[0],y=v[1];return Math.sqrt(x*x+y*y);},Length2:function(x,y){return x*x+y*y;},Norm:function(v){var s=this.Length(v);if(s==0)s=1;return[v[0]/s,v[1]/s];},ScalarProd:function(v1,v2){return v1[0]*v2[0]+v1[1]*v2[1];},VectProd:function(u,v){return u[0]*v[1]-u[1]*v[0];},Rotate:function(v,ang){var c=Math.cos(ang);var s=Math.sin(ang);return[c*v[0]-s*v[1],s*v[0]+c*v[1]];},Angle:function(u,v,norm){norm=xDefBool(norm,false);if(norm){u=this.Norm(u);v=this.Norm(v);}
var sign=Math.asin(this.VectProd(u,v))<0?-1:1;return sign*Math.acos(this.ScalarProd(u,v));},};JsgMat2={Zero:function(){return[[0,0,0],[0,0,0]];},Unit:function(){return[[1,0,0],[0,1,0]];},Ok:function(mat){return xArray(mat);},RotatingToXY:function(x,y){var vl=Math.sqrt(x*x+y*y);if(vl==0){x=1;y=0;}else{x/=vl;y/=vl;}
return[[x,-y,0],[y,x,0]];},Transformation:function(sx,sy,rot,x,y){var cosRot=Math.cos(rot);var sinRot=Math.sin(rot);return[[cosRot*sx,-sinRot*sy,x],[sinRot*sx,cosRot*sy,y]];},Moving:function(x,y){return[[1,0,x],[0,1,y]];},Scaling:function(sx,sy){return[[sx,0,0],[0,sy,0]];},Rotating:function(ang){var c=Math.cos(ang);var s=Math.sin(ang);return[[c,-s,0],[s,c,0]];},Mult:function(matA,matB){r=this.Null();for(var i=0;i<2;i++){for(var j=0;j<2;j++){r[i][j]=matA[i][0]*matB[0][j]+matA[i][1]*matB[1][j];}
r[i][2]=matA[i][0]*matB[0][2]+matA[i][1]*matB[1][2]+matA[i][2];}
return r;},Move:function(mat,x,y){return this.Mult(mat,this.Moving(x,y));},Rotate:function(mat,ang){return this.Mult(mat,this.Rotating(ang));},Scale:function(mat,sx,sy){return this.Mult(mat,this.Scaling(sx,sy));},Trans:function(mat,v){var x=v[0]*mat[0][0]+v[1]*mat[0][1]+mat[0][2];v[1]=v[0]*mat[1][0]+v[1]*mat[1][1]+mat[1][2];v[0]=x;},TransPolyXY:function(mat,polyX,polyY,size){var l=xDefNum(size,polyX.length);for(var i=0;i<l;i++){var x=polyX[i]*mat[0][0]+polyY[i]*mat[0][1]+mat[0][2];polyY[i]=polyX[i]*mat[1][0]+polyY[i]*mat[1][1]+mat[1][2];polyX[i]=x;}},};function JsgRect(x,y,w,h){this.Set(x,y,w,h);}
JsgRect.prototype.SetPos=function(x,y){this.x=x;this.y=y;}
JsgRect.prototype.SetSize=function(w,h){this.w=w;this.h=h;}
JsgRect.prototype.Set=function(x,y,w,h){this.x=x;this.y=y;this.w=w;this.h=h;}
JsgRect.Ok=function(obj){return xDef(obj)&&xDef(obj.x)&&xDef(obj.w);};function JsgGradient(gradType,canvasGrad,gradDef){this.Type=gradType;this.CanvasGradient=canvasGrad;this.GradientDef=gradDef;}
JsgGradient.Ok=function(obj){return xObj(obj)&&xDef(obj.CanvasGradient);};function JsgPolygon(Type3D,owner){this._Owner=xDefStr(owner,'');this.Init(Type3D);}
JsgPolygon.prototype.Is3D=function(){return this.Z!=null;}
JsgPolygon.prototype.Init=function(Type3D){this.X=[];this.Y=[];this.Z=Type3D?[]:null;this.Size=0;return this;}
JsgPolygon.Ok=function(obj){return xObj(obj)&&xArray(obj.X);}
JsgPolygon.prototype.Reset=function(){this.Size=0;return this;}
JsgPolygon.prototype.IsEmpty=function(){return this.Size==0;}
JsgPolygon.prototype.GetFirstPoint3D=function(p){if(this.Size<0)return false;p[0]=this.X[0];p[1]=this.Y[0];p[2]=this.Z[0];return true;}
JsgPolygon.prototype.GetLastPoint3D=function(p){var last=this.Size-1;if(last<0)return false;p[0]=this.X[last];p[1]=this.Y[last];p[2]=this.Z[last];return true;}
JsgPolygon.prototype.AddPoint=function(x,y,z){this.X[this.Size]=x;this.Y[this.Size]=y;if(this.Z)this.Z[this.Size]=z;this.Size++
return this;}
JsgPolygon.prototype.AddPoint3D=function(p){this.X[this.Size]=p[0];this.Y[this.Size]=p[1];this.Z[this.Size]=p[2];this.Size++
return this;}
JsgPolygon.prototype.AddPoly=function(poly,offset){offset=xDefNum(offset,0);var xs=poly.X;var ys=poly.Y;var zs=poly.Z;var xd=this.X;var yd=this.Y;var zd=this.Z;var dSize=this.Size;var size=poly.Size;for(var i=offset;i<size;i++){xd[dSize]=xs[i];yd[dSize]=ys[i];if(zd)zd[dSize]=zs[i];dSize++;}
this.Size=dSize;return this;}
JsgPolygon.prototype.RemoveLastPoint=function(){this.Size--;if(this.Size<0)this.Size=0;return this;}
JsgPolygon.prototype.Close=function(){if(this.Size<2)return false;if(this.IsSamePoint(0,this,this.Size-1))return false;if(this.Z){this.AddPoint(this.X[0],this.Y[0],this.Z[0]);}else{this.AddPoint(this.X[0],this.Y[0]);}
return true;}
JsgPolygon.prototype.IsSamePoint=function(i,poly,j){if(this.Z){return this.X[i]==poly.X[j]&&this.Y[i]==poly.Y[j]&&this.Z[i]==poly.Z[j];}else{return this.X[i]==poly.X[j]&&this.Y[i]==poly.Y[j];}}
JsgPolygon.prototype.Copy=function(to,useNewArrays){to=to||new JsgPolygon(this.Is3D());if(useNewArrays)to.Init(this.Is3D);var toX=to.X
var toY=to.Y;var toZ=to.Z;var fromX=this.X;var fromY=this.Y;var fromZ=this.Z;var len=this.Size;for(var i=0;i<len;i++){toX[i]=fromX[i];toY[i]=fromY[i];if(fromZ)toZ[i]=fromZ[i];}
to.Size=len;return to;}
JsgPolygon.WorkArray=[];JsgPolygon.InvertArrays=function(xArr,yArr,zArr,size){function InvertArray(a){var last=Math.floor(size/2)-1;for(var i=0,j=size-1;i<=last;i++,j--){var tmp=a[i];a[i]=a[j];a[j]=tmp;}}
size=xDefNum(size,xArr.length);if(size<2)return;InvertArray(xArr);InvertArray(yArr);if(zArr)InvertArray(zArr);}
JsgPolygon.prototype.Invert=function(){JsgPolygon.InvertArrays(this.X,this.Y,this.Z,this.Size);}
JsgPolygon.RollArrays=function(xArr,yArr,zArr,n,size){function RollArray(a){var src=Math.abs(n)%size;if(n<0)src=size-src;var newArr=JsgPolygon.WorkArray;for(var dest=0;dest<size;dest++){newArr[dest]=a[src++];if(src>=size)src=0;}
for(var i=0;i<size;i++)a[i]=newArr[i];}
size=xDefNum(size,xArr.length);if(size<2)return;RollArray(xArr);RollArray(yArr);if(zArr)RollArray(zArr);}
JsgPolygon.prototype.Roll=function(n){JsgPolygon.RollArrays(this.X,this.Y,this.Z,n,this.Size);}
function JsgPolygonList(Type3D,owner){this._Owner=xDefStr(owner,'');this.PolyList=[];this.Size=0;this.CurrPoly=null;this.Type3D=xDefBool(Type3D,false);}
JsgPolygonList.Ok=function(obj){return xObj(obj)&&xArray(obj.PolyList);}
JsgPolygonList.prototype.Is3D=function(){return this.Type3D;}
JsgPolygonList.prototype.IsEmpty=function(){return this.Size==0||this.PolyList[0].IsEmpty();}
JsgPolygonList.prototype.Reset=function(){this.Size=0;this.CurrPoly=null;return this;}
JsgPolygonList.prototype.NewPoly=function(){if(this.PolyList.length>this.Size){this.PolyList[this.Size].Reset();}else{this.PolyList[this.Size]=new JsgPolygon(this.Type3D);}
this.CurrPoly=this.PolyList[this.Size];this.Size++;return this;}
JsgPolygonList.prototype.GetLastPoly=function(){return this.PolyList[this.Size-1];}
JsgPolygonList.prototype.GetFirstPoly=function(){return this.PolyList[0];}
JsgPolygonList.prototype.GetFirstPoint3D=function(p){if(this.Size==0)return false;return this.PolyList[this.Size-1].GetFirstPoint3D(p);}
JsgPolygonList.prototype.GetLastPoint3D=function(p){if(this.Size==0)return false;return this.PolyList[this.Size-1].GetLastPoint3D(p);}
JsgPolygonList.prototype.AddPoint=function(x,y,z){this.CurrPoly.AddPoint(x,y,z);return this;}
JsgPolygonList.prototype.AddPoint3D=function(p){this.CurrPoly.AddPoint3D(p);return this;}
JsgPolygonList.prototype.AddPoly=function(polys,appendMode){appendMode=xDefNum(appendMode,0);if(!JsgPolygonList.Ok(polys))return this.AddSinglePoly(polys,appendMode);var n=polys.Size;for(var i=0;i<n;i++){this.AddSinglePoly(polys.PolyList[i],appendMode);}
return this;}
JsgPolygonList.prototype.AddSinglePoly=function(poly,appendMode){if(appendMode==0){this.NewPoly();this.CurrPoly.AddPoly(poly,0);}else{var offset=0;if(this.Size==0){this.NewPoly();}else{var currPoly=this.CurrPoly;if(poly.Size>0&&poly.IsSamePoint(0,currPoly,currPoly.Size-1)){offset=1;}else if(appendMode==1){this.NewPoly();}}
this.CurrPoly.AddPoly(poly,offset);}
return this;}
JsgPolygonList.prototype.RemoveLastPoint=function(){this.PolyList[this.Size-1].RemoveLastPoint();}
JsgPolygonList.prototype.Close=function(){if(this.Size==0)return false;var firstPoly=this.PolyList[0];var lastPoly=this.PolyList[this.Size-1];if(firstPoly.Size<1||lastPoly.Size<1)return false;if(firstPoly.IsSamePoint(0,lastPoly,lastPoly.Size-1))return false;if(this.Type3D){lastPoly.AddPoint(firstPoly.X[0],firstPoly.Y[0],firstPoly.Z[0]);}else{lastPoly.AddPoint(firstPoly.X[0],firstPoly.Y[0]);}
return true;}
function JsgSnapshot(sx,sy,sw,sh,srcCanvas){this.x=sx;this.y=sy;this.w=sw;this.h=sh;this.ImageData=null;var buffer=xCreateElement('canvas');if(buffer){buffer.width=sw;buffer.height=sh;buffer.getContext('2d').drawImage(srcCanvas,sx,sy,sw,sh,0,0,sw,sh);this.ImageData=buffer;}}
function JsgTrans(aTransName){this.Name=aTransName;this.x=0;this.y=0;this.x1=0;this.y1=0;this.x2=0;this.y2=0;this.Reset();}
JsgTrans.prototype.Reset=function(){this.Xmin=0;this.Ymin=0;this.Width=1;this.Height=1;this.ScaleX=1;this.ScaleY=1;this.OffsetX=0;this.OffsetY=0;}
JsgTrans.prototype.TransX=function(x){return x*this.ScaleX+this.OffsetX;}
JsgTrans.prototype.TransY=function(y){return y*this.ScaleY+this.OffsetY;}
JsgTrans.prototype.TransXY=function(x,y){this.x=x*this.ScaleX+this.OffsetX;this.y=y*this.ScaleY+this.OffsetY;}
JsgTrans.prototype.ObjTransXY=function(otr,x,y){if(otr){otr.TransXY(x,y);this.x=otr.x*this.ScaleX+this.OffsetX;this.y=otr.y*this.ScaleY+this.OffsetY;}else{this.x=x*this.ScaleX+this.OffsetX;this.y=y*this.ScaleY+this.OffsetY;}}
JsgTrans.prototype.ObjTransXY2=function(otr,x1,y1,x2,y2){if(otr){otr.TransXY2(x1,y1,x2,y2);this.x1=otr.x1*this.ScaleX+this.OffsetX;this.y1=otr.y1*this.ScaleY+this.OffsetY;this.x2=otr.x2*this.ScaleX+this.OffsetX;this.y2=otr.y2*this.ScaleY+this.OffsetY;}else{this.x1=x1*this.ScaleX+this.OffsetX;this.y1=y1*this.ScaleY+this.OffsetY;this.x2=x2*this.ScaleX+this.OffsetX;this.y2=y2*this.ScaleY+this.OffsetY;}}
JsgTrans.prototype.InvTransX=function(x){return(x-this.OffsetX)/this.ScaleX;}
JsgTrans.prototype.InvTransY=function(y){return(y-this.OffsetY)/this.ScaleY;}
function JsgTrans2D(aTrans2D){this.x=0;this.y=0;this.x1=0;this.y1=0;this.x2=0;this.y2=0;if(xDef(aTrans2D)){this.CopyFrom(aTrans2D);}else{this.Reset();}}
JsgTrans2D.prototype.Reset=function(){this.a00=1;this.a01=0;this.a02=0;this.a10=0;this.a11=1;this.a12=0;this.IsMoveOnly=true;this.IsUnitTrans=true;this.Enabled=true;}
JsgTrans2D.prototype.Enable=function(aFlag){var old=this.Enabled;this.Enabled=aFlag;return old;}
JsgTrans2D.prototype.CheckTransType=function(){this.IsMoveOnly=(this.a00==1&&this.a01==0&&this.a10==0&&this.a11==1);this.IsUnitTrans=(this.IsMoveOnly&&this.a02==0&&this.a12==0);}
JsgTrans2D.prototype.SetTrans=function(mat){this.a00=mat[0][0];this.a01=mat[0][1];this.a02=mat[0][2];this.a10=mat[1][0];this.a11=mat[1][1];this.a12=mat[1][2];this.CheckTransType();}
JsgTrans2D.prototype.GetTrans=function(){return[[this.a00,this.a01,this.a02],[this.a10,this.a11,this.a12]];}
JsgTrans2D.prototype.Copy=function(){return new JsgTrans2D(this);}
JsgTrans2D.prototype.CopyFrom=function(aTrans2D){this.a00=aTrans2D.a00;this.a01=aTrans2D.a01;this.a02=aTrans2D.a02;this.a10=aTrans2D.a10;this.a11=aTrans2D.a11;this.a12=aTrans2D.a12;this.IsMoveOnly=aTrans2D.IsMoveOnly;this.IsUnitTrans=aTrans2D.IsUnitTrans;this.Enabled=aTrans2D.Enabled;}
JsgTrans2D.prototype.AddTrans=function(mat){var c00,c01,c02,c10,c11,c12
if(xArray(mat)){c00=mat[0][0]*this.a00+mat[0][1]*this.a10;c01=mat[0][0]*this.a01+mat[0][1]*this.a11;c02=mat[0][0]*this.a02+mat[0][1]*this.a12+mat[0][2];c10=mat[1][0]*this.a00+mat[1][1]*this.a10;c11=mat[1][0]*this.a01+mat[1][1]*this.a11;c12=mat[1][0]*this.a02+mat[1][1]*this.a12+mat[1][2];}else{c00=mat.a00*this.a00+mat.a01*this.a10;c01=mat.a00*this.a01+mat.a01*this.a11;c02=mat.a00*this.a02+mat.a01*this.a12+mat.a02;c10=mat.a10*this.a00+mat.a11*this.a10;c11=mat.a10*this.a01+mat.a11*this.a11;c12=mat.a10*this.a02+mat.a11*this.a12+mat.a12;}
this.a00=c00;this.a01=c01;this.a02=c02;this.a10=c10;this.a11=c11;this.a12=c12;this.CheckTransType();}
JsgTrans2D.prototype.Move=function(x,y){this.a02+=x;this.a12+=y;this.CheckTransType();}
JsgTrans2D.prototype.Scale=function(sx,sy){this.a00*=sx;this.a01*=sx;this.a02*=sx;this.a10*=sy;this.a11*=sy;this.a12*=sy;this.CheckTransType();}
JsgTrans2D.prototype.Rotate=function(ang){var cosa=Math.cos(ang);var sina=Math.sin(ang);var c=[[cosa,-sina,0],[sina,cosa,0]];this.AddTrans(c);}
JsgTrans2D.prototype.TransX=function(x,y){if(this.IsUnitTrans||!this.Enabled)return x;if(this.IsMoveOnly)return x+this.a02;return this.a00*x+this.a01*y+this.a02;}
JsgTrans2D.prototype.TransY=function(x,y){if(this.IsUnitTrans||!this.Enabled)return y;if(this.IsMoveOnly)return y+this.a12;return this.a10*x+this.a11*y+this.a12;}
JsgTrans2D.prototype.TransXY=function(x,y){this.x=x;this.y=y;if(this.IsUnitTrans||!this.Enabled)return;if(this.IsMoveOnly){this.x+=this.a02;this.y+=this.a12;return;}
this.x=this.a00*x+this.a01*y+this.a02;this.y=this.a10*x+this.a11*y+this.a12;}
JsgTrans2D.prototype.TransXY2=function(x1,y1,x2,y2){this.x1=x1;this.y1=y1;this.x2=x2;this.y2=y2;if(this.IsUnitTrans||!this.Enabled)return;if(this.IsMoveOnly){this.x1+=this.a02;this.y1+=this.a12;this.x2+=this.a02;this.y2+=this.a12;return;}
this.x1=this.a00*x1+this.a01*y1+this.a02;this.y1=this.a10*x1+this.a11*y1+this.a12;this.x2=this.a00*x2+this.a01*y2+this.a02;this.y2=this.a10*x2+this.a11*y2+this.a12;}
JsgTrans2D.prototype.MaxScaling=function(){var abs=Math.abs;var t1=abs(this.a00)+abs(this.a01);var t2=abs(this.a10)+abs(this.a11);return Math.sqrt((t1*t1+t2*t2)/2);}
function JsgAttrs(aGraph){this.ScaleRef=aGraph.ScaleRef;this.LimitScalePix=aGraph.LimitScalePix;this.AutoScalePix=aGraph.AutoScalePix;this.ScalePixInt=aGraph.ScalePixInt;this.ObjTrans=aGraph.ObjTrans.Copy();this.Trans=aGraph.Trans;this.AngleMeasure=aGraph.AngleMeasure;this.Alpha=aGraph.Alpha;this.LineJoin=aGraph.LineJoin;this.LineCap=aGraph.LineCap;this.Color=aGraph.Color;this.BgColor=aGraph.BgColor;this.BgGradient=aGraph.BgGradient;this.LineWidth=aGraph.LineWidth;this.MarkerSymbol=aGraph.MarkerSymbol;this.MarkerSize=aGraph.MarkerSize;this.TextRendering=aGraph.TextRendering;this.TextClass=aGraph.TextClass;this.TextFont=aGraph.TextFont;this.TextSize=aGraph.TextSize;this.TextRitation=aGraph.TextRotation;this.TextColor=aGraph.TextColor;this.FontStyle=aGraph.FontStyle;this.FontWeight=aGraph.FontWeight;this.TextHAlign=aGraph.TextHAlign;this.TextVAlign=aGraph.TextVAlign;this.TextHPad=aGraph.TextHPad;this.TextVPad=aGraph.TextVPad;this.LineHeight=aGraph.LineHeight;this.CurvePrecision=aGraph.CurvePrecision;}
function NewGraph2D(aParams){return new JsGraph(aParams);}
function JsGraph(aParams){aParams=xDefObj(aParams,{});this.HighResolution=xDefBool(aParams.HighResolution,true);this.HighResSet=false;this.DevicePixelRatio=1;this.CanvasPixelRatio=1;this.PixelRatio=1;this.LastPixelRatio=0;this.InitInternals();this.MakeMarkers();this.CreateCanvas(aParams);if(xNum(aParams.ScaleRef))this.ScaleRef=aParams.ScaleRef;if(xBool(aParams.AutoScalePix))this.AutoScalePix=aParams.AutoScalePix;if(xBool(aParams.LimitScalePix))this.LimitScalePix=aParams.LimitScalePix;if(xBool(aParams.ScalePixInt))this.ScalePixInt=aParams.ScalePixInt;if(xNum(aParams.MinLineWidth))this.MinLineWidth=this.MinSize(aParams.MinLineWidth,0);if(xNum(aParams.MinTextSize))this.MinTextSize=this.MinSize(aParams.MinTextSize,0);if(xNum(aParams.MinMarkerSize))this.MinMarkerSize=this.MinSize(aParams.MinMarkerSize,0);if(xAny(aParams.DefaultAttrs))this.SetAttrs(aParams.DefaultAttrs);if(xStr(aParams.TextRendering))this.SetTextRendering(aParams.TextRendering);this.DeferedDrawTime=xDefNum(aParams.DeferedDrawTime,50);this.AutoReset=xDefBool(aParams.AutoReset,true);this.AutoClear=xDefBool(aParams.AutoClear,true);this.ClientResetFunc=null;var me=this;this.OnResizeFunc=function CB_OnTimeout_CheckWindowResize(){me.CheckResizeRegularly();};this.OnDrawFunc=function CB_OnTimeout_Draw(){me.Draw();};this.OnDeferedDrawFunc=function CB_OnTimeout_DeferedDraw(){me.DeferedDraw();};if(xFunc(aParams.OnClick)){this.EventHandlers.push({Event:'click',Func:aParams.OnClick,Capture:false});}
if(xArray(aParams.EventHandlers)){var handlers=aParams.EventHandlers
for(var i=0;i<handlers.length;i++){var handler=handlers[i];if(xStr(handler.Event)&&xFunc(handler.Func))this.EventHandlers.push(handler);}}
if(this.EventHandlers.length>0){xOnDomReady(function CB_InstallEventHandlers(){var nHandlers=me.EventHandlers.length;for(var i=0;i<nHandlers;i++){var handler=me.EventHandlers[i];me.AddEventHandler(handler.Event,handler.Func,handler.Capture);}
me.EventHandlers=[];});}
this.SaveAttrs();this.SaveDefaultAttrs();this.SetDriverAttrs();this.InitResizeCheck();this.CheckResizeRegularly();this.DrawPending++;if(xFunc(aParams.DrawFunc))this.SetDrawFunc(aParams.DrawFunc);if(xFunc(aParams.DeferedDrawFunc))this.SetDeferedDrawFunc(aParams.DeferedDrawFunc);if(xFunc(aParams.BeforeResetFunc))this.SetBeforeResetFunc(aParams.BeforeResetFunc);}
JsGraph.prototype.InitInternals=function(){this.LastX=0.0;this.LastY=0.0;this.BorderWidth=0;this.CanvasWidth=0;this.CanvasHeight=0;this.CanvasRatioHW=0.0;this.VpXmin=0;this.VpYmin=0;this.VpWidth=0;this.VpHeight=0;this.VpInnerWidth=0;this.VpInnerHeight=0;this.WinXmin=0.0;this.WinXmax=-1;this.WinYmin=0.0;this.WinYmax=-1;this.WinWidth=-1;this.WinHeight=-1;this.ObjTrans=new JsgTrans2D();this.ObjTransStack=[];this.ContextScale=1;this.Trans='window';this.AngleMeasure='deg';this.CanvasTrans=new JsgTrans('canvas');this.VpTrans=new JsgTrans('viewport');this.WinTrans=new JsgTrans('window');this.CurrTrans=this.WinTrans;this.TransByName={canvas:this.CanvasTrans,viewport:this.VpTrans,window:this.WinTrans};this.GraphClipEnabled=false;this.GraphClipExtend=1;this.GraphClipMargin=1;this.GraphClipInnerXmin=0;this.GraphClipInnerXmax=0;this.GraphClipInnerYmin=0;this.GraphClipInnerYmax=0;this.GraphClipOuterXmin=0;this.GraphClipOuterXmax=0;this.GraphClipOuterYmin=0;this.GraphClipOuterYmax=0;this.DrawFunc=null;this.DeferedDrawFunc=null;this.BeforeResetFunc=null;this.Snapshots=[];this.Poly=new JsgPolygon(false,'JsGraph.Poly');this.WorkPoly=new JsgPolygon(false,'JsGraph.WorkPoly');this.WorkPoly2=new JsgPolygon(false,'JsGraph.WorkPoly2');this.WorkRect=new JsgRect(0,0,0,0);this.EventHandlers=[];this.Alpha=1;this.Color='black';this.BgColor='white';this.BgGradient=null;this.LineWidth=1;this.MarkerSymbol='Circle';this.MarkerSize=8;this.DriverMarkerSize=8;this.TextRendering='canvas';this.TextCanvasRendering=true;this.TextClass='';this.TextFont='Arial';this.TextSize=15;this.TextRotation=0;this.CanvasFontSize=15;this.CTextCurrFontVers=0;this.CTextLastFontVers=-1;this.TextColor='black';this.FontStyle='normal';this.FontWeight='normal';this.TextHAlign='center';this.TextVAlign='middle';this.TextHPad=0;this.TextVPad=0;this.CanvasTextHPad=0;this.CanvasTextVPad=0;this.LineHeight=0;this.CanvasLineHeight=0;this.LineJoin='round';this.LineCap='butt';this.ScaleRef=800;this.AutoScalePix=false;this.LimitScalePix=true;this.ScalePixInt=false;this.MinLineWidth=0.01;this.MinTextSize=1;this.MinMarkerSize=1;this.CurvePrecision=0.25;this.MaxCurveSegments=1024;this.NumBezierSegments=64;this.DisableNativeArc=false;this.DisableNativeBezier=false;this.SavedAttrs=null;this.SavedDefaultAttrs=null;this.PenDown=false;this.IsPathOpen=false;this.CurrPath=[];this.CurrPathSize=0;this.CommonPathElePool=[];this.CommonPathElePoolSize=0;this.ArcPathElePool=[];this.ArcPathElePoolSize=0;this.BezierPathElePool=[];this.BezierPathElePoolSize=0;this.ContainerDiv=null;this.ClippingDiv=null;this.Canvas=null;this.Context2D=null;this.HtmlTextHandler=null;this.IsResettingAll=false;this.DrawTime=50;this.ResizeTimer=null;this.DrawTimer=null;this.DeferedDrawTimer=null;this.LastContWidthDrawn=0;this.LastContWidth=0;this.LastPixelRatioDrawn=0;this.LastPixelRatioOnResize=0;this.LastCanvasWidth=0;this.DrawingCount=0;this.DrawPending=0;}
JsGraph.prototype.SetDriverAttrs=function(){this.SetLineAttr(this.Color,this.LineWidth);this.SetBgColor(this.BgColor);this.SetTextRendering(this.TextRendering);this.SetTextClass('');this.SetTextAttr(this.TextFont,this.TextSize,this.TextColor,this.FontWeight,this.FontStyle,this.TextHAlign,this.TextVAlign,this.TextHPad,this.TextVPad,this.TextRotation);this.SetLineHeight(this.LineHeight);this.SetLineJoin(this.LineJoin);this.SetLineCap(this.LineCap);}
JsGraph.prototype.IdCounter=0;JsGraph.prototype.CreateCanvas=function(aParams){JsGraph.prototype.IdCounter++;if(xStr(aParams.Id)){this.Id=aParams.Id;}else{this.Id='JsGraph'+JsGraph.prototype.IdCounter;}
this.BorderWidth=xDefNum(aParams.BorderWidth,1);this.CreateDomObjects(aParams);this.Context2D=this.Canvas.getContext('2d');this.HtmlTextHandler=new JsgHtmlTextHandler(this.ClippingDiv,this.Canvas,this.Context2D);this.Context2D.save();this.UpdateCanvasSize();this.SetViewport();}
JsGraph.prototype.CreateDomObjects=function(aParams){var width,height;var borderColor=xDefStr(aParams.BorderColor,'');if(borderColor!='')borderColor='border-color:'+borderColor+';';var cssContainer='bdBoxSizing';var cssClippingBox='';var cssCanvas='';var cssDefault=xDefStr(aParams.GraphClass,'JsGraph');cssContainer=this.AddCssClass(cssContainer,cssDefault);cssClippingBox=this.AddCssClass(cssClippingBox,cssDefault+'-ClippingBox');cssCanvas=this.AddCssClass(cssCanvas,cssDefault+'-Canvas');if(xStr(aParams.GraphFormat))cssContainer=this.AddCssClass(cssContainer,aParams.GraphFormat);if(cssContainer!=='')cssContainer=' class="'+cssContainer+'"';if(cssClippingBox!=='')cssClippingBox=' class="'+cssClippingBox+'"';if(cssCanvas!=='')cssCanvas=' class="'+cssCanvas+'"';var reqWidth='100%';var reqHeight='75%';if(xIsNumeric(aParams.Width)||this.IsNumericPercent(aParams.Width))reqWidth=aParams.Width;if(xIsNumeric(aParams.Height)||this.IsNumericPercent(aParams.Height))reqHeight=aParams.Height;var commonStyle='margin:0;padding:0;';var noborderStyle='border:none;';if(this.IsNumericPercent(reqWidth)){var containerStyle='width:'+reqWidth+';height:100%;'+'border-width:'+this.BorderWidth+'px;padding:0;'+borderColor;var clippingBoxStyle='width:100%;height:100%;font-size:0;line-height:0;overflow:hidden;'+commonStyle+noborderStyle;var canvasStyle=commonStyle+noborderStyle;if(containerStyle!='')containerStyle=' style="'+containerStyle+'"';if(clippingBoxStyle!='')clippingBoxStyle=' style="'+clippingBoxStyle+'"';if(canvasStyle!='')canvasStyle=' style="'+canvasStyle+'"';var s='<div id="'+this.Id+'"'+cssContainer+containerStyle+'>';s+='<div id="'+this.Id+'-ClippingBox"'+cssClippingBox+clippingBoxStyle+'>';s+='<canvas id="'+this.Id+'-Canvas"'+cssCanvas+canvasStyle+'></canvas>';s+='</div></div>';document.writeln(s);this.ContainerDiv=xGet(this.Id);this.ClippingDiv=xGet(this.Id+'-ClippingBox');this.Canvas=xGet(this.Id+'-Canvas');this.LastContWidth=xWidth(this.ContainerDiv);width=this.LastContWidth-2*this.BorderWidth;height=this.ParseHWInt(reqHeight,width);this.CanvasRatioHW=height/width;this.Canvas.width=width;this.Canvas.height=height;}else{width=this.ParseHWInt(reqWidth);height=this.ParseHWInt(reqHeight,width);var containerStyle='width:'+width+'px;'+'border-width:'+this.BorderWidth+'px;padding:0;'+borderColor;width-=2*this.BorderWidth;height-=2*this.BorderWidth;var clippingBoxStyle='width:'+width+'px;height:'+height+'px;font-size:0;line-height:0;overflow:hidden;'+commonStyle+noborderStyle;var canvasStyle=commonStyle+noborderStyle;if(containerStyle!='')containerStyle=' style="'+containerStyle+'"';if(clippingBoxStyle!='')clippingBoxStyle=' style="'+clippingBoxStyle+'"';if(canvasStyle!='')canvasStyle=' style="'+canvasStyle+'"';var s='<div id="'+this.Id+'"'+cssContainer+containerStyle+'>';s+='<div id="'+this.Id+'-ClippingBox"'+cssClippingBox+clippingBoxStyle+'>';s+='<canvas id="'+this.Id+'-Canvas" width="'+width+'px" height="'+height+'px"'+cssCanvas+canvasStyle+'></canvas>';s+='</div></div>';document.writeln(s);this.ContainerDiv=xGet(this.Id);this.ClippingDiv=xGet(this.Id+'-ClippingBox');this.Canvas=xGet(this.Id+'-Canvas');}
var clippingDiv=this.ClippingDiv;var canvas=this.Canvas;if(!clippingDiv.style.position)clippingDiv.style.position='relative';canvas.style.position='absolute';canvas.style.top=0;canvas.style.left=0;canvas.style.margin=0;canvas.style.padding=0;}
JsGraph.prototype.AddEventHandler=function(aEventType,aEventHandler,aCapture){if(!xFunc(aEventHandler))return;var me=this;xAddEvent(this.Canvas,aEventType,function CB_Call_EventHandler(evnt){aEventHandler(evnt,me);},xDefBool(aCapture,false));}
JsGraph.prototype.Redraw=function(){this.Draw();}
JsGraph.prototype.SetDrawFunc=function(aDrawFunc,bDrawNow){this.DrawFunc=xDefAnyOrNull(aDrawFunc,null);if(aDrawFunc&&(this.DrawPending||bDrawNow)){this.QueueDraw();}}
JsGraph.prototype.SetDeferedDrawFunc=function(aDrawFunc){if(this.DeferedDrawTimer){clearTimeout(this.DeferedDrawTimer);this.DeferedDrawTimer=null;}
this.DeferedDrawFunc=xDefAnyOrNull(aDrawFunc,null);}
JsGraph.prototype.SetBeforeResetFunc=function(aBeforeClearFunc){this.BeforeResetFunc=xDefFunc(aBeforeClearFunc,null);}
JsGraph.prototype.BeginDrawing=function(){if(this.DrawingCount==0){this.DrawPending=0;}
this.DrawingCount++;}
JsGraph.prototype.EndDrawing=function(bEndAll){if(bEndAll){this.DrawingCount=1;}
this.DrawingCount--;if(this.DrawingCount<0){this.DrawingCount=0;}
if(this.DrawingCount==0&&this.DrawPending){this.QueueDraw();}}
JsGraph.prototype.CancelPendingDraws=function(){if(this.DrawTimer){clearTimeout(this.DrawTimer);this.DrawTimer=null;}
if(this.DeferedDrawTimer){clearTimeout(this.DeferedDrawTimer);this.DeferedDrawTimer=null;}
this.DrawPending=0;}
JsGraph.prototype.QueueDraw=function(){if(this.DrawTimer){clearTimeout(this.DrawTimer);this.DrawTimer=null;}
if(this.DeferedDrawTimer){clearTimeout(this.DeferedDrawTimer);this.DeferedDrawTimer=null;}
if(this.DrawFunc){this.DrawTimer=setTimeout(this.OnDrawFunc,50);}}
JsGraph.prototype.Draw=function(){if(this.DrawTimer){clearTimeout(this.DrawTimer);this.DrawTimer=null;}
if(this.DeferedDrawTimer){clearTimeout(this.DeferedDrawTimer);this.DeferedDrawTimer=null;}
if(!this.DrawFunc)return;if(!xOnLoadFinished){this.QueueDraw();return;}
if(this.IsDrawing()){if(this.DrawPending==0)this.DrawPending++;this.QueueDraw();return;}
if(this.BeforeResetFunc){try{this.BeforeResetFunc(this);}
catch(err){}}
if(this.AutoReset){this.Reset(this.AutoClear);if(this.ClientResetFunc){try{this.ClientResetFunc(this);}
catch(err){}}}
this.BeginDrawing();try{this.DrawFunc(this);}catch(err){}
this.EndDrawing();if(this.DeferedDrawFunc){this.DeferedDrawTimer=setTimeout(this.OnDeferedDrawFunc,this.DeferedDrawTime);}}
JsGraph.prototype.DeferedDraw=function(){if(this.DeferedDrawTimer){clearTimeout(this.DeferedDrawTimer);this.DeferedDrawTimer=null;}
if(!this.DeferedDrawFunc||this.IsDrawing())return;this.BeginDrawing();try{this.DeferedDrawFunc(this);}catch(err){}
this.EndDrawing();}
JsGraph.prototype.IsDrawing=function(){return this.DrawingCount;}
JsGraph.prototype.IsDrawPending=function(){return this.DrawPending;}
JsGraph.prototype.IsInvalidDrawing=function(){return(this.DrawPending>0)&&(this.DrawFunc);}
JsGraph.prototype.InitResizeCheck=function(){if(!this.ContainerDiv)return;this.LastContWidthDrawn=xWidth(this.ContainerDiv);this.LastPixelRatioDrawn=this.PixelRatio;this.LastPixelRatioOnResize=this.PixelRatio;}
JsGraph.prototype.CheckResizeRegularly=function(){if(this.ResizeTimer){clearTimeout(this.ResizeTimer);this.ResizeTimer=null;}
if(!this.ContainerDiv)return;this.UpdatePixelRatios();var width=xWidth(this.ContainerDiv);if(width!=this.LastContWidth||this.LastPixelRatioOnResize!=this.PixelRatio){this.LastContWidth=width;this.LastPixelRatioOnResize=this.PixelRatio;}else{if(this.LastContWidthDrawn!=width||this.LastPixelRatioDrawn!=this.PixelRatio){this.UpdateCanvasSize(width);this.DeleteSnapshots();this.DrawPending++;this.QueueDraw();this.LastContWidthDrawn=width;this.LastPixelRatioDrawn=this.PixelRatio;}}
this.ResizeTimer=setTimeout(this.OnResizeFunc,this.DrawTime);}
JsGraph.prototype.Reset=function(clear){clear=xDefBool(clear,true);this.IsResettingAll=true;this.LastX=0.0;this.LastY=0.0;this.PenDown=false;this.IsPathOpen=false;this.CurrPathSize=0;this.ObjTrans.Reset();this.ObjTransStack=[];this.Trans='window';this.CanvasTrans.Reset();this.VpTrans.Reset();this.WinTrans.Reset();this.CurrTrans=this.WinTrans;this.UpdateCanvasTrans();this.SetViewport();this.SetGraphClipping(false,'canvas');this.ResetAttrs();if(clear)this.Clear();this.IsResettingAll=false;}
JsGraph.prototype.UpdateCanvasTrans=function(){this.CanvasTrans.Width=this.CanvasWidth;this.CanvasTrans.Height=this.CanvasHeight;}
JsGraph.prototype.GetObjTrans=function(){var otr=this.ObjTrans;return(!otr.IsUnitTrans&&otr.Enabled)?otr:null;}
JsGraph.prototype.IsNumericPercent=function(x){if(!xStr(x)||x==='')return false;var p=x.lastIndexOf('%');if(p!==x.length-1)return false;x=x.substr(0,p);if(!xIsNumeric(x))return false;return true;}
JsGraph.prototype.ParseHWInt=function(h,w){var result;if(xDef(w)&&this.IsNumericPercent(h)){result=w*(parseFloat(h)/100.0);}else if(xStr(h)){result=parseFloat(h);}else{result=h;}
result=Math.round(result);if(result<=0)retult=1;return result;}
JsGraph.prototype.AddCssClass=function(css,addCss){if(addCss==='')return css;if(css!=='')css+=' ';return css+addCss;}
JsGraph.prototype.SetHighResolution=function(aOnOff){var old=this.HighResolution;aOnOff=xDefBool(aOnOff,true);if(aOnOff==old)return old;this.HighResolution=aOnOff;this.HighResSet=false;this.UpdateCanvasSize();return old;}
JsGraph.prototype.AdjustForHighResolutionDisplays=function(){var context=this.Context2D;var canvas=this.Canvas;if(this.HighResolution&&this.DevicePixelRatio!==this.CanvasPixelRatio){var ratio=this.PixelRatio;var oldWidth=this.CanvasWidth;var oldHeight=this.CanvasHeight;if(canvas.width!=oldWidth*ratio){canvas.width=oldWidth*ratio;canvas.height=oldHeight*ratio;}
xStyle(canvas,'width',oldWidth+'px');xStyle(canvas,'height',oldHeight+'px');}else{var ratio=1;var width=this.CanvasWidth;var height=this.CanvasHeight;if(canvas.width!=width){canvas.width=width;canvas.height=height;}
xStyle(canvas,'width',width+'px');xStyle(canvas,'height',height+'px');}
context.setTransform(1,0,0,1,0,0);context.scale(ratio,ratio);this.ContextScale=ratio;this.HighResSet=true;this.LastPixelRatio=this.PixelRatio;}
JsGraph.prototype.UpdatePixelRatios=function(){var context=this.Context2D;this.DevicePixelRatio=window.devicePixelRatio||1;this.CanvasPixelRatio=context.webkitBackingStorePixelRatio||context.mozBackingStorePixelRatio||context.msBackingStorePixelRatio||context.oBackingStorePixelRatio||context.backingStorePixelRatio||1;this.PixelRatio=this.DevicePixelRatio/this.CanvasPixelRatio;}
JsGraph.prototype.UpdateCanvasSize=function(aContainerWidth){if(!this.ContainerDiv)return;if(!xDef(aContainerWidth))aContainerWidth=xWidth(this.ContainerDiv);this.UpdatePixelRatios();if(this.CanvasRatioHW==0){this.CanvasWidth=aContainerWidth-2*this.BorderWidth;this.CanvasHeight=xHeight(this.ContainerDiv)-2*this.BorderWidth;if(!this.HighResSet||this.PixelRatio!=this.LastPixelRatio){this.AdjustForHighResolutionDisplays();}}else{var width=aContainerWidth-2*this.BorderWidth;if(this.LastCanvasWidth==width&&this.PixelRatio==this.LastPixelRatio){if(!this.HighResSet){this.AdjustForHighResolutionDisplays();}
return;}
var height=width*this.CanvasRatioHW;xHeight(this.ContainerDiv,height+2*this.BorderWidth,true);this.CanvasWidth=width;this.CanvasHeight=height;this.LastCanvasWidth=width;this.AdjustForHighResolutionDisplays();}
this.UpdateCanvasTrans();this.UpdateGraphClipOuterRange();}
JsGraph.prototype.UpdateGraphClipOuterRange=function(){if(this.GraphClipExtend>=0){var xExtend=this.CanvasWidth*this.GraphClipExtend;if(xExtend<this.GraphClipMargin)xExtend=this.GraphClipMargin;var yExtend=this.CanvasHeight*this.GraphClipExtend;if(yExtend<this.GraphClipMargin)yExtend=this.GraphClipMargin;this.GraphClipOuterXmin=-xExtend;this.GraphClipOuterXmax=this.CanvasWidth+xExtend;this.GraphClipOuterYmin=-yExtend;this.GraphClipOuterYmax=this.CanvasHeight+yExtend;}else{var xExtend=-this.CanvasWidth*this.GraphClipExtend/2;if(xExtend<this.GraphClipMargin)xExtend=this.GraphClipMargin;var yExtend=-this.CanvasHeight*this.GraphClipExtend/2;if(yExtend<this.GraphClipMargin)yExtend=this.GraphClipMargin;this.GraphClipInnerXmin=xExtend;this.GraphClipInnerXmax=this.CanvasWidth-xExtend;this.GraphClipInnerYmin=yExtend;this.GraphClipInnerYmax=this.CanvasHeight-yExtend;xExtend*=0.8;yExtend*=0.8;this.GraphClipOuterXmin=xExtend;this.GraphClipOuterXmax=this.CanvasWidth-xExtend;this.GraphClipOuterYmin=yExtend;this.GraphClipOuterYmax=this.CanvasHeight-yExtend;}}
JsGraph.prototype.Clear=function(){this.Context2D.clearRect(0,0,this.CanvasWidth,this.CanvasHeight);this.HtmlTextHandler.Clear();}
JsGraph.prototype.DeleteSnapshots=function(){this.Snapshots=[];}
JsGraph.prototype.GetSnapshot=function(id){if(this.Snapshots[id])return this.Snapshots[id];return null;}
JsGraph.prototype.MakeSnapshot=function(id,x,y,w,h){var pixelRatio=this.DevicePixelRatio;if(!xDef(x)){x=0;y=0;w=Math.floor(this.CanvasWidth*pixelRatio);h=Math.floor(this.CanvasHeight*pixelRatio);}else if(xStr(x)){var box=this.GetViewportDeviceRect();x=box.x;y=box.y;w=box.w;h=box.h;}else{x=Math.floor(x*pixelRatio);y=Math.floor(y*pixelRatio);w=Math.floor(w*pixelRatio);h=Math.floor(h*pixelRatio);}
var snapshot=new JsgSnapshot(x,y,w,h,this.Canvas);if(!snapshot.ImageData)return;this.Snapshots[id]=snapshot;}
JsGraph.prototype.DrawSnapshot=function(id,clear){clear=xDefBool(clear,true);var snapshot=this.GetSnapshot(id);if(!snapshot)return false;var ctx=this.Context2D;var pixelRatio=this.DevicePixelRatio;var x=snapshot.x/pixelRatio;var y=snapshot.y/pixelRatio;var w=snapshot.w/pixelRatio;var h=snapshot.h/pixelRatio;var oldAlpha=ctx.globalAlpha;ctx.globalAlpha=1;ctx.beginPath();if(clear)ctx.clearRect(x,y,w,h);ctx.drawImage(snapshot.ImageData,x,y,w,h);ctx.globalAlpha=oldAlpha;return true;}
JsGraph.prototype.SetAngleMeasure=function(am){var old=this.AngleMeasure;if(am=='rad'){this.AngleMeasure='rad';}else{this.AngleMeasure='deg';}
return old;}
JsGraph.prototype.ResetTrans=function(){this.ObjTrans.Reset();return this;}
JsGraph.prototype.SaveTrans=function(reset){var copyTrans=this.ObjTrans.Copy();this.ObjTransStack.push(copyTrans);if(reset)this.ObjTrans.Reset();return copyTrans;}
JsGraph.prototype.RestoreTrans=function(){if(this.ObjTransStack.length>0)this.ObjTrans=this.ObjTransStack.pop();}
JsGraph.prototype.TransMove=function(x,y){if(JsgVect2.Ok(x))return this.TransMove(x[0],x[1]);this.ObjTrans.Move(x,y);return this;}
JsGraph.prototype.TransScale=function(sx,sy){if(JsgVect2.Ok(sx))return this.TransScale(sx[0],sx[1]);this.ObjTrans.Scale(sx,sy);return this;}
JsGraph.prototype.TransRotate=function(ang){this.ObjTrans.Rotate(this.AngleToRad(ang));return this;}
JsGraph.prototype.TransRotateAtPoint=function(x,y,ang){if(JsgVect2.Ok(x))return this.TransRotateAtPoint(x[0],x[1],y);this.ObjTrans.Move(-x,-y);this.ObjTrans.Rotate(this.AngleToRad(ang));this.ObjTrans.Move(x,y);return this;}
JsGraph.prototype.AddTrans=function(mat){this.ObjTrans.AddTrans(mat);return this;}
JsGraph.prototype.ObjTransPoly=function(poly){var otr=this.GetObjTrans();if(!otr)return;var xArr=poly.X;var yArr=poly.Y;var size=poly.Size;for(var i=0;i<size;i++){otr.TransXY(xArr[i],yArr[i]);xArr[i]=otr.x;yArr[i]=otr.y;}}
JsGraph.prototype.TransPoly=function(poly){var ctr=this.CurrTrans;var otr=this.GetObjTrans();var xArr=poly.X;var yArr=poly.Y;var size=poly.Size;for(var i=1;i<size;i++){ctr.ObjTransXY(otr,xArr[i],yArr[i]);xArr[i]=ctr.x;yArr[i]=ctr.y;}}
JsGraph.prototype.ObjTransXY=function(x,y){var otr=this.ObjTrans;otr.TransXY(x,y);return otr;}
JsGraph.prototype.TransXY=function(x,y){var ctr=this.CurrTrans;ctr.ObjTransXY(this.GetObjTrans(),x,y);return ctr;}
JsGraph.prototype.SelectTrans=function(aTrans){if(this.Trans==aTrans||!this.TransByName[aTrans])return this.Trans;var oldTrans=this.Trans;this.CurrTrans=this.TransByName[aTrans];this.Trans=aTrans;return oldTrans;}
JsGraph.prototype.SetViewport=function(aX,aY,aWidth,aHeight,bScalePix,bClip){var doClip=xDef(aX);aWidth=xDefNum(aWidth,0);aHeight=xDefNum(aHeight,0);aX=xDefNum(aX,0);aY=xDefNum(aY,0);bScalePix=xDefBool(bScalePix,false);bClip=xDefBool(bClip,false);if(bScalePix){aX=this.ScalePix(aX,this.ScalePixInt);aY=this.ScalePix(aY,this.ScalePixInt);if(aWidth<0)aWidth=this.ScalePix(aWidth,this.ScalePixInt);if(aHeight<0)aHeight=this.ScalePix(aHeight,this.ScalePixInt);}
this.VpXmin=aX;this.VpYmin=aY;if(aWidth<=0){this.VpWidth=this.CanvasWidth+aWidth-aX;}else{this.VpWidth=aWidth;}
if(aHeight<=0){this.VpHeight=this.CanvasHeight+aHeight-aY;}else{this.VpHeight=aHeight;}
this.VpInnerWidth=this.VpWidth-1;this.VpInnerHeight=this.VpHeight-1;this.SetViewportTrans();this.SetWindow();this.ResetInnerClipRange();if(doClip){if(bClip){this.SetClipping('viewport');}else{this.SetClipping('canvas');}}
if(this.GraphClipExtend<0)this.UpdateGraphClipOuterRange();}
JsGraph.prototype.ResetInnerClipRange=function(){this.GraphClipInnerXmin=-this.GraphClipMargin;this.GraphClipInnerXmax=this.CanvasWidth+this.GraphClipMargin;this.GraphClipInnerYmin=-this.GraphClipMargin;this.GraphClipInnerYmax=this.CanvasHeight+this.GraphClipMargin;}
JsGraph.prototype.SetViewportRel=function(aLeft,aTop,aRight,aBottom,bScalePix,bClip){aLeft=xDefNum(aLeft,0);aTop=xDefNum(aTop,aLeft);aRight=xDefNum(aRight,aLeft);aBottom=xDefNum(aBottom,aTop);bScalePix=xDefBool(bScalePix,true);bClip=xDefBool(bClip,true);if(bScalePix){aLeft=this.ScalePix(aLeft,this.ScalePixInt);aTop=this.ScalePix(aTop,this.ScalePixInt);aRight=this.ScalePix(aRight,this.ScalePixInt);aBottom=this.ScalePix(aBottom,this.ScalePixInt);}
this.VpWidth=this.VpWidth-aLeft-aRight;this.VpHeight=this.VpHeight-aTop-aBottom;this.VpXmin=this.VpXmin+aLeft;this.VpYmin=this.VpYmin+aTop;this.VpInnerWidth=this.VpWidth-1;this.VpInnerHeight=this.VpHeight-1;this.SetViewportTrans();this.SetWindow();if(bClip){this.SetClipping('viewport');}else{this.SetClipping('canvas');}}
JsGraph.prototype.SetViewportTrans=function(){var trans=this.VpTrans;trans.Xmin=this.VpXmin;trans.Ymin=this.VpYmin;trans.Width=this.VpWidth;trans.Height=this.VpHeight;trans.OffsetX=this.VpXmin+0.5;trans.OffsetY=this.VpYmin+0.5;trans.ScaleX=1;trans.ScaleY=1;}
JsGraph.prototype.SetWindow=function(aXmin,aYmin,aXmax,aYmax){aXmin=xDefNum(aXmin,0);aYmin=xDefNum(aYmin,0);aXmax=xDefNum(aXmax,0);aYmax=xDefNum(aYmax,0);if(aXmin==aXmax)aXmax=this.VpInnerWidth;if(aYmin==aYmax)aYmax=this.VpInnerHeight;this.WinXmin=aXmin;this.WinXmax=aXmax;this.WinYmin=aYmin;this.WinYmax=aYmax;this.WinWidth=aXmax-aXmin;this.WinHeight=aYmax-aYmin;var trans=this.WinTrans;trans.Xmin=this.WinXmin;trans.Ymin=this.WinYmin;trans.Width=this.WinWidth;trans.Height=this.WinHeight;var sx=this.VpInnerWidth/this.WinWidth;trans.ScaleX=sx;trans.OffsetX=(-this.WinXmin*sx)+this.VpXmin+0.5;var sy=-(this.VpInnerHeight/this.WinHeight);trans.ScaleY=sy;trans.OffsetY=this.VpInnerHeight-this.WinYmin*sy+this.VpYmin+0.5;}
JsGraph.prototype.SetWindowWH=function(aXnull,aYnull,aWidth,aHeight){aXnull=xDefNum(aXnull,0);aYnull=xDefNum(aYnull,0);aWidth=xDefNum(aWidth,0);aHeight=xDefNum(aHeight,0);if(aWidth==0){var aspectRatio=this.VpInnerWidth/this.VpInnerHeight;aWidth=aHeight*aspectRatio;}else if(aHeight==0){var aspectRatio=this.VpInnerWidth/this.VpInnerHeight;if(aspectRatio!=0)aHeight=aWidth/aspectRatio;}
this.SetWindow(aXnull,aYnull,aXnull+aWidth,aYnull+aHeight);}
JsGraph.prototype.MapWindow=function(aXcenter,aYcenter,aWidth,aHeight,aAlign){aXcenter=xDefNum(aXcenter,0);aYcenter=xDefNum(aYcenter,0);aWidth=xDefNum(aWidth,0);aHeight=xDefNum(aHeight,0);aAlign=xDefNum(aAlign,0);var vpAscpectRatio=this.VpInnerWidth/this.VpInnerHeight;if(aWidth==0){aWidth=aHeight*vpAscpectRatio;}else if(aHeight==0){if(vpAscpectRatio!=0)aHeight=aWidth/vpAscpectRatio;}else{var winAscpectRatio=aWidth/aHeight;if(vpAspectRatio>=winAspectRatio){var winWidth=aHeight*vpAscpectRatio;var padding=(winWidth-aWidth)/2;aXcenter-=aAlign*padding;aWidth=winWidth;}else{var winHeight=aWidth/vpAscpectRatio;var padding=(winHeight-aHeight)/2;aYcenter-=aAlign*padding;aHeight=winHeight;}}
var xmin=aXcenter-aWidth/2;var ymin=aYcenter-aHeight/2;var xmax=xmin+aWidth;var ymax=ymin+aHeight;this.SetWindow(xmin,ymin,xmax,ymax);}
JsGraph.prototype.SetClipRect=function(aX,aY,aWidth,aHeight,aTrans){aX=xDefNum(aX,0);aTrans=xDefStr(aTrans,'');var oldTrans=this.Trans;if(aTrans!=''){this.SelectTrans(aTrans);}
var otr=this.ObjTrans;var enableObjTrans=(this.Trans=='window');var oldEnable=otr.Enable(enableObjTrans);this.OpenPath();this.RectWH(aX,aY,aWidth,aHeight);this.Clip();if(this.Trans=='viewport'){this.GraphClipInnerXmin=this.VpXmin-this.GraphClipMargin;this.GraphClipInnerXmax=this.VpWidth+this.GraphClipMargin;this.GraphClipInnerYmin=this.VpYmin-this.GraphClipMargin;this.GraphClipInnerYmax=this.VpHeight+this.GraphClipMargin;}else{this.ResetInnerClipRange();}
otr.Enable(oldEnable);if(aTrans!=''){this.SelectTrans(oldTrans);}}
JsGraph.prototype.SetClipping=function(aClipRange){aClipRange=xDefStr(aClipRange,'canvas');if(aClipRange=='window'){this.SetClipRect(this.WinXmin,this.WinYmin,this.WinWidth,this.WinHeight,'window');}else if(aClipRange=='viewport'){this.SetClipRect(this.VpXmin,this.VpYmin,this.VpWidth,this.VpHeight,'canvas');}else{this.SetClipRect(0,0,this.CanvasWidth,this.CanvasHeight,'canvas');}}
JsGraph.prototype.SetGraphClipping=function(clipping,clipRange,extendFactor){this.GraphClipEnabled=xDefBool(clipping,true);if(xStr(clipRange)&&clipRange!='')this.SetClipping(clipRange);if(xNum(extendFactor))this.GraphClipExtend=extendFactor;this.UpdateGraphClipOuterRange();}
JsGraph.prototype.SetAutoScalePix=function(bAutoScale){bAutoScale=xDefBool(bAutoScale,true);var old=this.AutoScalePix;this.AutoScalePix=bAutoScale;return old;}
JsGraph.prototype.SetLimitScalePix=function(bLimtiScalePix){bLimtiScalePix=xDefBool(bLimtiScalePix,true);var old=this.LimtiScalePix;this.LimtiScalePix=bLimtiScalePix;return old;}
JsGraph.prototype.SetScalePixInt=function(bScalePixInt){bScalePixInt=xDefBool(bScalePixInt,false);var old=this.ScalePixInt;this.ScalePixInt=bScalePixInt;return old;}
JsGraph.prototype.SetScaleRef=function(aScaleRef,bLimitScalePix,bAutoScalePix,bScalePixInt){if(xObj(aScaleRef)){this.SetScaleRef(aScaleRef.ScaleRef,aScaleRef.LimitScalePix,aScaleRef.AutoScalePix,aScaleRef.ScalePixInt);return;}
if(xNum(aScaleRef)){this.ScaleRef=aScaleRef;this.SavedDefaultAttrs.ScaleRef=aScaleRef;}
if(xBool(bLimitScalePix)){this.LimitScalePix=bLimitScalePix;this.SavedDefaultAttrs.LimitScalePix=bLimitScalePix;}
if(xBool(bAutoScalePix)){this.AutoScalePix=bAutoScalePix;this.SavedDefaultAttrs.AutoScalePix=bAutoScalePix;}
if(xBool(bScalePixInt)){this.ScalePixInt=bScalePixInt;this.SavedDefaultAttrs.ScalePixInt=bScalePixInt;}}
JsGraph.prototype.GetPixScaling=function(){var r=this.CanvasWidth/this.ScaleRef;if(this.LimitScalePix&&r>1)r=1;return r;}
JsGraph.prototype.ScalePix=function(aSize,bInt){var m=aSize<0?-1:1;var r=m*aSize*this.GetPixScaling();if(bInt){r=Math.round(r);if(r<1)r=1;}
return m*r;}
JsGraph.prototype.ScalePixI=function(aSize){return this.ScalePix(aSize,true);}
JsGraph.prototype.ScalePixMax=function(aSize,aMaxSize,bInt){var m=aSize<0?-1:1;var r=m*aSize*this.GetPixScaling();if(r>aMaxSize)r=aMaxSize;if(bInt){r=Math.round(r);if(r<1)r=1;}
return m*r;}
JsGraph.prototype.ScalePixMaxI=function(aSize,aMaxSize){return this.ScalePixMax(aSize,aMaxSize,true);}
JsGraph.prototype.ScalePixMin=function(aSize,aMinSize,bInt){var m=aSize<0?-1:1;var r=m*aSize*this.GetPixScaling();if(r<aMinSize)r=aMinSize;if(bInt){r=Math.round(r);if(r<1)r=1;}
return m*r;}
JsGraph.prototype.ScalePixMinI=function(aSize,aMinSize){return this.ScalePixMin(aSize,aMinSize,true);}
JsGraph.prototype.ScalePixMinMax=function(aSize,aMinSize,aMaxSize,bInt){var m=aSize<0?-1:1;var r=m*aSize*this.GetPixScaling();if(r<aMinSize)r=aMinSize;if(r>aMaxSize)r=aMaxSize;if(bInt){r=Math.round(r);if(r<1)r=1;}
return m*r;}
JsGraph.prototype.ScalePixMinMaxI=function(aSize,aMinSize,aMaxSize){return this.ScalePixMinMax(aSize,aMinSize,aMaxSize,true);}
JsGraph.prototype.MinSize=function(aSize,aMinSize){return(aSize<aMinSize)?aMinSize:aSize;}
JsGraph.prototype.MaxSize=function(aSize,aMaxSize){return(aSize>aMaxSize)?aMaxSize:aSize;}
JsGraph.prototype.MinMaxSize=function(aSize,aMinSize,aMaxSize){var r=aSize;if(r<aMinSize)r=aMinSize;if(r>aMaxSize)r=aMaxSize;return r;}
JsGraph.prototype.Limit01=function(x){return(x<0)?0:((x>1)?1:x);}
JsGraph.prototype.ScaleToTic=function(aValue,aTic){var v=(Math.round(Math.abs(aValue)/aTic+0.3)+0.5)*aTic
return(aValue<0)?-v:v;}
JsGraph.prototype.ScaleWinX=function(){return Math.abs(this.WinTrans.ScaleX);}
JsGraph.prototype.ScaleWinY=function(){return Math.abs(this.WinTrans.ScaleY);}
JsGraph.prototype.TransWinVpX=function(x){var cx=this.WinTrans.TransX(x);return this.VpTrans.InvTransX(cx);}
JsGraph.prototype.TransWinVpY=function(y){var cy=this.WinTrans.TransY(y);return this.VpTrans.InvTransY(cy);}
JsGraph.prototype.TransWinCnvsX=function(x){return this.WinTrans.TransX(x);}
JsGraph.prototype.TransWinCnvsY=function(y){return this.WinTrans.TransY(y);}
JsGraph.prototype.TransVpCnvsX=function(x){return this.VpTrans.TransX(x);}
JsGraph.prototype.TransVpCnvsY=function(y){return this.VpTrans.TransY(y);}
JsGraph.prototype.TransVpWinX=function(x){var cx=this.VpTrans.TransX(x);return this.WinTrans.InvTransX(cx);}
JsGraph.prototype.TransVpWinY=function(y){var cy=this.VpTrans.TransY(y);return this.WinTrans.InvTransY(cy);}
JsGraph.prototype.TransCnvsWinX=function(x){return this.WinTrans.InvTransX(x);}
JsGraph.prototype.TransCnvsWinY=function(y){return this.WinTrans.InvTransY(y);}
JsGraph.prototype.TransCnvsVpX=function(x){return this.VpTrans.InvTransX(x);}
JsGraph.prototype.TransCnvsVpY=function(y){return this.VpTrans.InvTransY(y);}
JsGraph.prototype.GetAttrs=function(){return new JsgAttrs(this);}
JsGraph.prototype.SetAttrs=function(aAttrs){if(!xObj(aAttrs))return;if(aAttrs.Reset)this.ResetAttrs();this.SetScaleRef(aAttrs);if(xDef(aAttrs.CurvePrecision))this.CurvePrecision=aAttrs.CurvePrecision;if(xDef(aAttrs.AngleMeasure))this.SetAngleMeasure(aAttrs.AngleMeasure);if(xDef(aAttrs.ObjTrans))this.ObjTrans.CopyFrom(aAttrs.ObjTrans);if(xDef(aAttrs.Trans))this.SelectTrans(aAttrs.Trans);if(xDef(aAttrs.Alpha))this.SetAlpha(aAttrs.Alpha);if(xDef(aAttrs.LineJoin))this.SetLineJoin(aAttrs.LineJoin);if(xDef(aAttrs.LineCap))this.SetLineCap(aAttrs.LineCap);if(xDef(aAttrs.Color))this.SetColor(aAttrs.Color);if(xObj(aAttrs.BgGradient)){this.SetBgColor(aAttrs.BgGradient);}else if(xDef(aAttrs.BgColor)){this.SetBgColor(aAttrs.BgColor);}
if(xDef(aAttrs.LineWidth))this.SetLineWidth(aAttrs.LineWidth);if(xDef(aAttrs.MarkerSymbol))this.SetMarkerSymbol(aAttrs.MarkerSymbol);if(xDef(aAttrs.MarkerSize))this.SetMarkerSize(aAttrs.MarkerSize);if(xDef(aAttrs.TextRendering))this.SetTextRendering(aAttrs.TextRendering);if(xDef(aAttrs.TextClass))this.SetTextClass(aAttrs.TextClass);if(xDef(aAttrs.TextFont))this.SetTextFont(aAttrs.TextFont);if(xDef(aAttrs.TextSize))this.SetTextSize(aAttrs.TextSize);if(xDef(aAttrs.TextRotation))this.SetTextRotation(aAttrs.TextRotation);if(xDef(aAttrs.TextColor))this.SetTextColor(aAttrs.TextColor);if(xDef(aAttrs.FontStyle))this.SetFontStyle(aAttrs.FontStyle);if(xDef(aAttrs.FontWeight))this.SetFontWeight(aAttrs.FontWeight);if(xDef(aAttrs.TextHAlign))this.SetTextHAlign(aAttrs.TextHAlign);if(xDef(aAttrs.TextVAlign))this.SetTextVAlign(aAttrs.TextVAlign);if(xDef(aAttrs.TextHPad))this.SetTextPadding(aAttrs.TextHPad,this.TextVPad);if(xDef(aAttrs.TextVPad))this.SetTextPadding(this.TextHPad,aAttrs.TextVPad);if(xDef(aAttrs.LineHeight))this.SetLineHeight(aAttrs.LineHeight);}
JsGraph.prototype.SaveAttrs=function(){this.SavedAttrs=this.GetAttrs();}
JsGraph.prototype.RestoreAttrs=function(){if(!this.SavedAttrs)return;this.SetAttrs(this.SavedAttrs);}
JsGraph.prototype.SaveDefaultAttrs=function(){this.SavedDefaultAttrs=this.GetAttrs();}
JsGraph.prototype.ResetAttrs=function(){this.SetAttrs(this.SavedDefaultAttrs);}
JsGraph.prototype.BoxWHOverlapping=function(aBox1,aBox2){if(!aBox1||!aBox2)return false;var xmin1=aBox1.x;var xmax1=aBox1.x+aBox1.w;if(xmin1>xmax1){var tmp=xmin1;xmin1=xmax1;xmax1=tmp;}
var xmin2=aBox2.x;var xmax2=aBox2.x+aBox2.w;if(xmin2>xmax2){var tmp=xmin2;xmin2=xmax2;xmax2=tmp;}
if(xmax1<xmin2||xmax2<xmin1)return false;var ymin1=aBox1.y;var ymax1=aBox1.y+aBox1.h;if(ymin1>ymax1){var tmp=ymin1;ymin1=ymax1;ymax1=tmp;}
var ymin2=aBox2.y;var ymax2=aBox2.y+aBox2.h;if(ymin2>ymax2){var tmp=ymin2;ymin2=ymax2;ymax2=tmp;}
if(ymax1<ymin2||ymax2<ymin1)return false;return true;}
JsGraph.prototype.MapToRange=function(val,range){var absVal=Math.abs(val);var n=Math.floor(absVal/range);var newVal=absVal-n*range;if(val<0){newVal=range-newVal;if(newVal>=range)newVal-=range;}else{if(newVal<0)newVal+=range;}
return newVal;}
JsGraph.prototype.NormalizeAngles=function(angles){var Pi2=Math.PI*2;if(angles.delta>=0){var angleDiff=angles.end-angles.start;if(angleDiff>0){if(angleDiff>Pi2)angleDiff=Pi2;angles.start=this.MapToRange(angles.start,Pi2);angles.end=angles.start+angleDiff;if(angles.end>Pi2){angles.start-=Pi2;angles.end-=Pi2;}}else{angles.start=this.MapToRange(angles.start,Pi2);angles.end=this.MapToRange(angles.end,Pi2);if(angles.start>angles.end)angles.start-=Pi2;}}else{var angleDiff=angles.end-angles.start;if(angleDiff<0){if(angleDiff<-Pi2)angleDiff=-Pi2;angles.start=this.MapToRange(angles.start,Pi2);angles.end=angles.start+angleDiff;}else{angles.start=this.MapToRange(angles.start,Pi2);angles.end=this.MapToRange(angles.end,Pi2);if(angles.end>angles.start)angles.end-=Pi2;}}}
JsGraph.prototype.NormalizeAngle=function(angle){return this.MapToRange(angle,2*Math.PI);}
JsGraph.prototype.CompDeltaAngle=function(radius,precision){var da=2*Math.acos((radius-precision)/radius);da=(Math.PI/2)/(Math.floor(Math.PI/2/da)+1);if(da>Math.PI/4)da=Math.PI/4;if(this.MaxCurveSegments>0&&da<Math.PI/this.MaxCurveSegments)da=Math.PI/this.MaxCurveSegments;return da;}
JsGraph.prototype.MakeUnityArcPolygon=function(aAngles){var poly=this.WorkPoly.Reset();var sin=Math.sin;var cos=Math.cos;if(aAngles.delta>0){var delta=aAngles.delta-this.MapToRange(aAngles.start,aAngles.delta);if(delta==0)delta=aAngles.delta;var currAng=aAngles.start;var lastAng=aAngles.end-aAngles.delta/1000;while(currAng<lastAng){poly.AddPoint(cos(currAng),sin(currAng));currAng+=delta;delta=aAngles.delta;}
poly.AddPoint(cos(aAngles.end),sin(aAngles.end));}else if(aAngles.delta<0){var delta=-this.MapToRange(aAngles.start,-aAngles.delta);if(delta==0)delta=aAngles.delta;var currAng=aAngles.start;var lastAng=aAngles.end+aAngles.delta/1000;while(currAng>lastAng){poly.AddPoint(cos(currAng),sin(currAng));currAng+=delta;delta=aAngles.delta;}
poly.AddPoint(cos(aAngles.end),sin(aAngles.end));}
return poly;}
JsGraph.prototype.SetAlpha=function(a){this.Alpha=this.MinMaxSize(xDefNum(a,1),0,1);this.Context2D.globalAlpha=this.Alpha;}
JsGraph.prototype.SetLineJoin=function(j){this.LineJoin=j;this.Context2D.lineJoin=j;}
JsGraph.prototype.SetLineCap=function(c){this.LineCap=c;this.Context2D.lineCap=c;}
JsGraph.prototype.SetLineAttr=function(color,width){if(xAny(color))this.SetColor(color);if(xAny(width))this.SetLineWidth(width);}
JsGraph.prototype.SetAreaAttr=function(bgColor,borderColor,borderWidth){if(xAny(bgColor))this.SetBgColor(bgColor);if(xAny(borderColor))this.SetColor(borderColor);if(xAny(borderWidth))this.SetLineWidth(borderWidth);}
JsGraph.prototype.SetMarkerAttr=function(aSymbolName,size,borderColor,bgColor,borderWidth){if(xAny(aSymbolName))this.SetMarkerSymbol(aSymbolName);if(xAny(size))this.SetMarkerSize(size);this.SetAreaAttr(bgColor,borderColor,borderWidth);}
JsGraph.prototype.SetTextAttr=function(aFont,aSize,aColor,aWeight,aStyle,aHAlign,aVAlign,aHPad,aVPad,aRot){if(xAny(aFont))this.SetTextFont(aFont);if(xAny(aSize))this.SetTextSize(aSize);if(xAny(aRot))this.SetTextRotation(aRot);if(xAny(aColor))this.SetTextColor(aColor);if(xAny(aWeight))this.SetFontWeight(aWeight);if(xAny(aStyle))this.SetFontStyle(aStyle);if(xAny(aHAlign))this.SetTextHAlign(aHAlign);if(xAny(aVAlign))this.SetTextVAlign(aVAlign);if(xAny(aHPad))this.SetTextPadding(aHPad,aVPad);}
JsGraph.prototype.ClearTextAttr=function(){this.SetTextAttr('',0,'','','','','',0,0);this.SetLineHeight(-1);}
JsGraph.prototype.SetColor=function(color){color=xDefAny(color,this.SavedDefaultAttrs.Color);if(JsgColor.Ok(color))color=JsgColor.ToString(color);this.Color=color;this.Context2D.strokeStyle=this.Color;}
JsGraph.prototype.SetBgColor=function(color){color=xDefAny(color,this.SavedDefaultAttrs.BgColor);if(JsgColor.Ok(color))color=JsgColor.ToString(color);if(xStr(color)){this.BgColor=color;this.BgGradient=null;this.Context2D.fillStyle=this.BgColor;}else if(JsgGradient.Ok(color)){this.BgGradient=color;this.Context2D.fillStyle=color.CanvasGradient;}}
JsGraph.prototype.CreateLinearGradient=function(aGradientDef){aGradientDef.X1=xDefNum(aGradientDef.X1,0);aGradientDef.Y1=xDefNum(aGradientDef.Y1,0);aGradientDef.X2=xDefNum(aGradientDef.X2,aGradientDef.X1);aGradientDef.Y2=xDefNum(aGradientDef.Y2,aGradientDef.Y1);aGradientDef.Stops=xArray(aGradientDef.Stops)?aGradientDef.Stops:[];var ctr=this.CurrTrans;ctr.ObjTransXY2(this.GetObjTrans(),aGradientDef.X1,aGradientDef.Y1,aGradientDef.X2,aGradientDef.Y2);var grad=this.Context2D.createLinearGradient(ctr.x1,ctr.y1,ctr.x2,ctr.y2);var stops=aGradientDef.Stops;var last=stops.length-1;for(var i=0;i<=last;i++){var color=xDefAny(stops[i].Color,'gray');if(JsgColor.Ok(color))color=JsgColor.ToString(color);grad.addColorStop(xDefNum(stops[i].Pos,i/last),color);}
return new JsgGradient('linear',grad,aGradientDef);}
JsGraph.prototype.SetLinearGradientGeom=function(aLinearGradient,aGeom){var gradDef=aLinearGradient.GradientDef;gradDef.X1=xDefNum(aGeom.X1,gradDef.X1);gradDef.Y1=xDefNum(aGeom.Y1,gradDef.Y1);gradDef.X2=xDefNum(aGeom.X2,gradDef.X2);gradDef.Y2=xDefNum(aGeom.Y2,gradDef.Y2);var ctr=this.CurrTrans;ctr.ObjTransXY2(this.GetObjTrans(),gradDef.X1,gradDef.Y1,gradDef.X2,gradDef.Y2);var grad=this.Context2D.createLinearGradient(ctr.x1,ctr.y1,ctr.x2,ctr.y2);var stops=gradDef.Stops;var last=stops.length-1;for(var i=0;i<=last;i++){var color=xDefAny(stops[i].Color,'gray');if(JsgColor.Ok(color))color=JsgColor.ToString(color);grad.addColorStop(xDefNum(stops[i].Pos,i/last),color);}
aLinearGradient.CanvasGradient=grad;if(aLinearGradient==this.BgGradient){this.Context2D.fillStyle=this.BgGradient.CanvasGradient;}}
JsGraph.prototype.CreateRadialGradient=function(aGradientDef){aGradientDef.X1=xDefNum(aGradientDef.X1,0);aGradientDef.Y1=xDefNum(aGradientDef.Y1,0);aGradientDef.R1=xDefNum(aGradientDef.R1,0);aGradientDef.X2=xDefNum(aGradientDef.X2,aGradientDef.X1);aGradientDef.Y2=xDefNum(aGradientDef.Y2,aGradientDef.Y1);aGradientDef.R2=xDefNum(aGradientDef.R2,aGradientDef.R1+100);var ctr=this.CurrTrans;var otrScaling=this.ObjTrans.MaxScaling();ctr.ObjTransXY2(this.GetObjTrans(),aGradientDef.X1,aGradientDef.Y1,aGradientDef.X2,aGradientDef.Y2);var cnvsR1=ctr.ScaleX*otrScaling*aGradientDef.R1;var cnvsR2=ctr.ScaleX*otrScaling*aGradientDef.R2;var grad=this.Context2D.createRadialGradient(ctr.x1,ctr.y1,cnvsR1,ctr.x2,ctr.y2,cnvsR2);var stops=xDefArray(aGradientDef.Stops,[]);var last=stops.length-1;for(var i=0;i<=last;i++){var color=xDefAny(stops[i].Color,'gray');if(JsgColor.Ok(color))color=JsgColor.ToString(color);grad.addColorStop(xDefNum(stops[i].Pos,i/last),color);}
return new JsgGradient('radial',grad,aGradientDef);}
JsGraph.prototype.SetRadialGradientGeom=function(aRadialGradient,aGeom){var gradDef=aRadialGradient.GradientDef;gradDef.X1=xDefNum(aGeom.X1,gradDef.X1);gradDef.Y1=xDefNum(aGeom.Y1,gradDef.Y1);gradDef.R1=xDefNum(aGeom.R1,gradDef.R1);gradDef.X2=xDefNum(aGeom.X2,gradDef.X2);gradDef.Y2=xDefNum(aGeom.Y2,gradDef.Y2);gradDef.R2=xDefNum(aGeom.R2,gradDef.R2);var ctr=this.CurrTrans;var otrScaling=this.ObjTrans.MaxScaling();ctr.ObjTransXY2(this.GetObjTrans(),gradDef.X1,gradDef.Y1,gradDef.X2,gradDef.Y2);var cnvsR1=ctr.ScaleX*otrScaling*gradDef.R1;var cnvsR2=ctr.ScaleX*otrScaling*gradDef.R2;var grad=this.Context2D.createRadialGradient(ctr.x1,ctr.y1,cnvsR1,ctr.x2,ctr.y2,cnvsR2);var stops=gradDef.Stops;var last=stops.length-1;for(var i=0;i<=last;i++){var color=xDefAny(stops[i].Color,'gray');if(JsgColor.Ok(color))color=JsgColor.ToString(color);grad.addColorStop(xDefNum(stops[i].Pos,i/last),color);}
aRadialGradient.CanvasGradient=grad;if(aRadialGradient==this.BgGradient){this.Context2D.fillStyle=this.BgGradient.CanvasGradient;}}
JsGraph.prototype.SetLineWidth=function(width){width=xDefNum(width,this.SavedDefaultAttrs.LineWidth);if(width<0)width=0;this.LineWidth=width;if(this.AutoScalePix&&width>0)width=this.ScalePixMin(width,this.MinLineWidth,this.ScalePixInt);if(width==0)width=1/this.DevicePixelRatio;this.Context2D.lineWidth=width;}
JsGraph.prototype.SetTextClass=function(aClassName,aClearAttrs){aClassName=xDefStr(aClassName,'');aClearAttrs=xDefBool(aClearAttrs,false);if(aClearAttrs)this.ClearTextAttr();this.TextClass=aClassName;this.HtmlTextHandler.TextClass=aClassName;}
JsGraph.prototype.SetTextRendering=function(aRenderMethod){var oldRendering=this.TextRendering;if(!(this.Context2D.strokeText&&this.Context2D.fillText))aRenderMethod='html';if(aRenderMethod=='html'){this.TextRendering='html';this.TextCanvasRendering=false;}else{this.TextRendering='canvas';this.TextCanvasRendering=true;}
return oldRendering;}
JsGraph.prototype.SetTextFont=function(aFont){this.TextFont=xDefStr(aFont,this.SavedDefaultAttrs.TextFont);this.HtmlTextHandler.TextStyles.fontFamily=this.TextFont;this.CTextCurrFontVers++;}
JsGraph.prototype.SetTextSize=function(aSize){aSize=xDefNum(aSize,this.SavedDefaultAttrs.TextSize);if(aSize<0)aSize=0;this.TextSize=aSize;if(aSize>0){if(this.AutoScalePix)aSize=this.ScalePixMin(aSize,this.MinTextSize,this.ScalePixInt);this.HtmlTextHandler.TextStyles.fontSize=aSize+'px';this.CanvasFontSize=aSize;}else{this.HtmlTextHandler.TextStyles.fontSize='';this.CanvasFontSize=15;}
this.CTextCurrFontVers++;}
JsGraph.prototype.SetTextRotation=function(aRot){aRot=xDefNum(aRot,this.SavedDefaultAttrs.TextRotation);this.TextRotation=aRot;}
JsGraph.prototype.SetTextColor=function(color){color=xDefAny(color,this.SavedDefaultAttrs.TextColor);if(JsgColor.Ok(color))color=JsgColor.ToString(color);this.TextColor=color;this.HtmlTextHandler.TextStyles.color=this.TextColor;}
JsGraph.prototype.SetLineHeight=function(aHeight){aHeight=xDefNum(aHeight,this.SavedDefaultAttrs.LineHeight);if(aHeight<0)aHeight=-1;this.LineHeight=aHeight;if(aHeight>0){if(this.AutoScalePix)aHeight=this.ScalePix(aHeight,this.ScalePixInt);this.HtmlTextHandler.TextStyles.lineHeight=aHeight+'px';this.CanvasLineHeight=aHeight;}else if(aHeight==0){this.HtmlTextHandler.TextStyles.lineHeight='100%';this.CanvasLineHeight=0;}else{this.HtmlTextHandler.TextStyles.lineHeight='';this.CanvasLineHeight=0;}
this.CTextCurrFontVers++;}
JsGraph.prototype.SetFontStyle=function(aStyle,aWeight){aStyle=xDefStr(aStyle,this.SavedDefaultAttrs.FontStyle);this.FontStyle=aStyle;this.HtmlTextHandler.TextStyles.fontStyle=aStyle;if(xStr(aWeight))this.SetFontWeight(aWeight);this.CTextCurrFontVers++;}
JsGraph.prototype.SetFontWeight=function(aWeight,aStyle){aWeight=xDefStr(aWeight,this.SavedDefaultAttrs.FontWeight);this.FontWeight=aWeight;this.HtmlTextHandler.TextStyles.fontWeight=aWeight;if(xStr(aStyle))this.SetFontStyle(aStyle);this.CTextCurrFontVers++;}
JsGraph.prototype.SetTextAlign=function(aHAlign,aVAlign){if(xStr(aHAlign))this.SetTextHAlign(aHAlign);if(xStr(aVAlign))this.SetTextVAlign(aVAlign);}
JsGraph.prototype.SetTextHAlign=function(aAlign){aAlign=xDefStr(aAlign,this.SavedDefaultAttrs.TextHAlign);this.TextHAlign=aAlign;this.HtmlTextHandler.TextStyles.textAlign=aAlign;if(aAlign=='justify')aAlign='center';this.HtmlTextHandler.TextHAlign=aAlign;}
JsGraph.prototype.SetTextVAlign=function(aAlign){aAlign=xDefStr(aAlign,this.SavedDefaultAttrs.TextVAlign);this.TextVAlign=aAlign;this.HtmlTextHandler.TextVAlign=aAlign;}
JsGraph.prototype.SetTextPadding=function(aHPad,aVPad){aHPad=xDefNum(aHPad,0);aVPad=xDefNum(aVPad,aHPad);this.TextHPad=aHPad;this.TextVPad=aVPad;if(this.AutoScalePix){aHPad=this.ScalePix(aHPad,this.ScalePixInt);aVPad=this.ScalePix(aVPad,this.ScalePixInt);}
this.CanvasTextHPad=aHPad;this.HtmlTextHandler.TextHPad=aHPad;this.CanvasTextVPad=aVPad;this.HtmlTextHandler.TextVPad=aVPad;}
JsGraph.prototype.SetMarkerSymbol=function(aSymbolName){aSymbolName=xDefStr(aSymbolName,this.SavedDefaultAttrs.MarkerSymbol);if(!xDef(this.Markers[aSymbolName]))return;this.MarkerSymbol=aSymbolName;}
JsGraph.prototype.SetMarkerSize=function(aSize){aSize=xDefNum(aSize,this.SavedDefaultAttrs.MarkerSize);if(aSize<0)aSize=0;this.MarkerSize=aSize;if(this.AutoScalePix)aSize=this.ScalePixMin(aSize,this.MinMarkerSize,this.ScalePixInt);this.DriverMarkerSize=aSize;}
JsGraph.prototype.OpenPath=function(penUp){this.ClearPath();this.IsPathOpen=true;if(xDef(penUp))this.PenDown=!penUp;}
JsGraph.prototype.ClearPath=function(){this.CurrPathSize=0;this.CommonPathElePoolSize=0;this.ArcPathElePoolSize=0;this.BezierPathElePoolSize=0;this.IsPathOpen=false;}
JsGraph.prototype.Path=function(mode,clear){mode=xDefNum(mode,1);clear=xDefBool(clear,true);if(mode&2){if(this.DriverDrawPath(false,true)){this.Context2D.fill();}}
if(mode&1){if(this.DriverDrawPath((mode&4)>0,false)){this.Context2D.stroke();}}
if(clear)this.ClearPath();}
JsGraph.prototype.Clip=function(clear){clear=xDefBool(clear,true);var oldClipEnabled=this.GraphClipEnabled;this.GraphClipEnabled=false;if(this.DriverDrawPath(false,false)){this.Context2D.restore();this.Context2D.save();this.Context2D.clip();}
if(clear)this.ClearPath();this.GraphClipEnabled=oldClipEnabled;if(!this.IsResettingAll)this.SetDriverAttrs();this.ResetInnerClipRange();}
JsGraph.prototype.NewCommonPathEle=function(t,x,y){var ele,pool=this.CommonPathElePool;if(this.CommonPathElePoolSize<pool.length){ele=pool[this.CommonPathElePoolSize++];ele.t=t;ele.x=x;ele.y=y;}else{ele={t:t,x:x,y:y};pool[this.CommonPathElePoolSize++]=ele;}
return ele;}
JsGraph.prototype.NewArcPathEle=function(x,y,r,sa,ea,cc){var ele,pool=this.ArcPathElePool;if(this.ArcPathElePoolSize<pool.length){ele=pool[this.ArcPathElePoolSize++];ele.t=3;ele.x=x;ele.y=y;ele.r=r;ele.sa=sa;ele.ea=ea;ele.cc=cc;}else{ele={t:3,x:x,y:y,r:r,sa:sa,ea:ea,cc:cc};pool[this.ArcPathElePoolSize++]=ele;}
return ele;}
JsGraph.prototype.NewBezierPathEle=function(cx1,cy1,cx2,cy2,ex,ey){var ele,pool=this.BezierPathElePool;if(this.BezierPathElePoolSize<pool.length){ele=pool[this.BezierPathElePoolSize++];ele.t=4;ele.cx1=cx1;ele.cy1=cy1;ele.cx2=cx2;ele.cy2=cy2;ele.ex=ex;ele.ey=ey;}else{ele={t:4,cx1:cx1,cy1:cy1,cx2:cx2,cy2:cy2,ex:ex,ey:ey};pool[this.BezierPathElePoolSize++]=ele;}
return ele;}
JsGraph.prototype.ClosePath=function(){this.CurrPath[this.CurrPathSize++]=this.NewCommonPathEle(0,0,0);}
JsGraph.prototype.PathMoveTo=function(x,y){this.CurrPath[this.CurrPathSize++]=this.NewCommonPathEle(2,x,y);}
JsGraph.prototype.PathLineTo=function(x,y){this.CurrPath[this.CurrPathSize++]=this.NewCommonPathEle(1,x,y);}
JsGraph.prototype.PathAppendArc=function(x,y,r,sa,ea,cc,cont,close){var arcStartX=x+r*Math.cos(sa);var arcStartY=y+r*Math.sin(sa);if(!cont){this.PathMoveTo(arcStartX,arcStartY);}
this.CurrPath[this.CurrPathSize++]=this.NewArcPathEle(x,y,r,sa,ea,cc);if(close){this.PathLineTo(arcStartX,arcStartY);}}
JsGraph.prototype.PathAppendPolygon=function(xArray,yArray,cont,close,size){var ctr=this.CurrTrans;var otr=this.GetObjTrans();ctr.ObjTransXY(otr,xArray[0],yArray[0]);if(cont){this.PathLineTo(ctr.x,ctr.y);}else{this.PathMoveTo(ctr.x,ctr.y);}
size=xDefNum(size,xArray.length);for(var i=1;i<size;i++){ctr.ObjTransXY(otr,xArray[i],yArray[i]);this.PathLineTo(ctr.x,ctr.y);}
if(close){if(xArray[0]!=xArray[xArray.length-1]||yArray[0]!=yArray[yArray.length-1]){ctr.ObjTransXY(otr,xArray[0],yArray[0]);this.PathLineTo(ctr.x,ctr.y);}}}
JsGraph.prototype.PathAppendBezierTo=function(cx1,cy1,cx2,cy2,ex,ey){this.CurrPath[this.CurrPathSize++]=this.NewBezierPathEle(cx1,cy1,cx2,cy2,ex,ey);}
JsGraph.prototype.DriverPathPoly=new JsgPolygon(false,'JsGraph.DriverPathPoly');JsGraph.prototype.DriverPathClipPoly=new JsgPolygon(false,'JsGraph.DrverPathClipPoly');JsGraph.prototype.DriverPathClipPolyList=new JsgPolygonList(false,'JsGraph.DriverPathClipPolyList');JsGraph.prototype.DriverDrawPath=function(close,areaMode){var plen=this.CurrPathSize;if(!this.GraphClipEnabled){return this.DriverDrawPathPart(0,plen,true,close);}
if(areaMode){var quadrant=this.GetPathClipQuadrant(0,plen);if(quadrant==0){return this.DriverDrawPathPart(0,plen,true,close);}else if(quadrant==1){return false;}
var poly=this.DriverGetPathPoly(0,0,false);var polyClipped=this.ClipPolygonArea(poly,this.GraphClipInnerXmin,this.GraphClipInnerXmax,this.GraphClipInnerYmin,this.GraphClipInnerYmax,this.DriverPathClipPoly);return this.DriverDrawPathPoly(polyClipped,true,false);}else{var last;var from=0;var newPath=true;while((last=this.DriverNextPathEnd(from+1))>0){if(last-from>1){var closeLast=(last==plen&&close);var quadrant=this.GetPathClipQuadrant(from,last);if(quadrant==0){if(this.DriverDrawPathPart(from,last,newPath,closeLast)){newPath=false;}}else if(quadrant==2){var poly=this.DriverGetPathPoly(from,last,closeLast);var polyListClipped=this.ClipPolygon(poly,this.GraphClipInnerXmin,this.GraphClipInnerXmax,this.GraphClipInnerYmin,this.GraphClipInnerYmax,this.Context2D.lineWidth/2,this.DriverPathClipPolyList);if(polyListClipped.Size>0){for(var i=0;i<polyListClipped.Size;i++){var polyClipped=polyListClipped.PolyList[i];if(this.DriverDrawPathPoly(polyClipped,newPath,false)){newPath=false;}}}}}
from=last;}
return!newPath;}}
JsGraph.prototype.DriverGetPathPoly=function(from,to,closeLast){var poly=this.DriverPathPoly.Reset();var p=this.CurrPath;var plen=this.CurrPathSize;var closeArea=false;if(to==0){from=0;to=plen;closeArea=true;}
var lastMoveIx=from;for(var i=from;i<to;i++){var c=p[i];var t=c.t;if(t==1){poly.AddPoint(c.x,c.y);}else if(t==2){if(i>from){if(p[i-1].t==2){poly.RemoveLastPoint();}else{var cl=p[lastMoveIx];poly.AddPoint(cl.x,cl.y);}}
poly.AddPoint(c.x,c.y);lastMoveIx=i;}else if(t==0){var c=p[lastMoveIx];poly.AddPoint(c.x,c.y);}else if(t==3){var startAng=this.RadToAngle(c.sa);var endAng=this.RadToAngle(c.ea)
var rad=c.cc?-c.r:c.r;var ell=this.MakeEllipseArcPolygon(c.x,c.y,rad,c.r,0,startAng,endAng);poly.AddPoly(ell);}else if(t==4){var cprev=p[i-1];var bezier=this.MakeBezierPolygon(cprev.x,cprev.y,c.cx1,c.cy1,c.cx2,c.cy2,c.ex,c.ey,this.NumBezierSegments);poly.AddPoly(bezier);}}
if(closeArea||closeLast){var px=p[lastMoveIx].x;var py=p[lastMoveIx].y;var last=poly.Size-1;if(px!=poly.X[last]||py!=poly.Y[last]){poly.AddPoint(px,py);}}
if(closeArea){var px=p[0].x;var py=p[0].y;var last=poly.Size-1;if(px!=poly.X[last]||py!=poly.Y[last]){poly.AddPoint(px,py);}}
return poly;}
JsGraph.prototype.DriverDrawPathPart=function(from,to,newPath,close){var p=this.CurrPath;var ctx=this.Context2D;if(newPath)ctx.beginPath();for(var i=from;i<to;i++){var c=p[i];var t=c.t;if(t==1){ctx.lineTo(c.x,c.y);}else if(t==2){ctx.moveTo(c.x,c.y);}else if(t==0){ctx.closePath();}else if(t==3){ctx.arc(c.x,c.y,c.r,c.sa,c.ea,c.cc);}else if(t==4){ctx.bezierCurveTo(c.cx1,c.cy1,c.cx2,c.cy2,c.ex,c.ey);}}
if(close)ctx.closePath();return to>from;}
JsGraph.prototype.DriverDrawPathPoly=function(poly,newPath,close){var size=poly.Size;if(size<2)return false;var ctx=this.Context2D;var xs=poly.X;var ys=poly.Y;if(newPath)ctx.beginPath();ctx.moveTo(xs[0],ys[0]);for(var i=1;i<size;i++){ctx.lineTo(xs[i],ys[i]);}
if(close)ctx.closePath();return true;}
JsGraph.prototype.DriverNextPathEnd=function(from){var plen=this.CurrPathSize;if(from>=plen)return-1;var p=this.CurrPath;for(var i=from;i<plen;i++){var c=p[i];var t=c.t;if(t==2){return i;}}
return plen;}
JsGraph.prototype.GetPathClipQuadrant=function(from,to){function minmax(x,y){if(x<xmin)xmin=x;if(x>xmax)xmax=x;if(y<ymin)ymin=y;if(y>ymax)ymax=y;}
if(this.DriverIsPathInsideRect(from,to,this.GraphClipInnerXmin,this.GraphClipInnerXmax,this.GraphClipInnerYmin,this.GraphClipInnerYmax)){return 0;}
var xmin=this.GraphClipOuterXmax+1000;var xmax=this.GraphClipOuterXmin-1000;var ymin=this.GraphClipOuterYmax+1000;var ymax=this.GraphClipOuterYmin-1000;var p=this.CurrPath;for(var i=from;i<to;i++){var c=p[i];var t=c.t;if(t==1||t==2){minmax(c.x,c.y);}else if(t==3){minmax(c.x-c.r,c.y-c.r);minmax(c.x+c.r,c.y+c.r);}else if(t==4){minmax(c.cx1,c.cy1);minmax(c.cx2,c.cy2);minmax(c.ex,c.ey);}}
return this.GetRectClipQuadrant(xmin,xmax,ymin,ymax);}
JsGraph.prototype.DriverIsPathInsideRect=function(from,to,xmin,xmax,ymin,ymax){var p=this.CurrPath;for(var i=from;i<to;i++){var c=p[i];var t=c.t;if(t==1||t==2){if(c.x<xmin||c.x>xmax||c.y<ymin||c.y>ymax)return false;}else if(t==3){var x=c.x-c.r;var y=c.y-c.r;if(x<xmin||x>xmax||y<ymin||y>ymax)return false;var x=c.x+c.r;var y=c.y+c.r;if(x<xmin||x>xmax||y<ymin||y>ymax)return false;}else if(t==4){if(c.cx1<xmin||c.cx1>xmax||c.cy1<ymin||c.cy1>ymax)return false;if(c.cx2<xmin||c.cx2>xmax||c.cy2<ymin||c.cy2>ymax)return false;if(c.ex<xmin||c.ex>xmax||c.ey<ymin||c.ey>ymax)return false;}}
return true;}
JsGraph.prototype.PenUp=function(){this.PenDown=false;}
JsGraph.prototype.MoveTo=function(x,y){if(JsgVect2.Ok(x))return this.MoveTo(x[0],x[1]);this.LastX=x;this.LastY=y;if(this.IsPathOpen){var ctr=this.CurrTrans;ctr.ObjTransXY(this.GetObjTrans(),x,y);this.PathMoveTo(ctr.x,ctr.y);}
this.PenDown=true;return this;}
JsGraph.prototype.LineTo=function(x,y){if(JsgVect2.Ok(x))return this.LineTo(x[0],x[1]);var ctr=this.CurrTrans;if(this.IsPathOpen){ctr.ObjTransXY(this.GetObjTrans(),x,y);if(this.PenDown){this.PathLineTo(ctr.x,ctr.y);}else{this.PathMoveTo(ctr.x,ctr.y);}}else{if(this.PenDown){this.WorkLineXArray[0]=this.LastX;this.WorkLineXArray[1]=x;this.WorkLineYArray[0]=this.LastY;this.WorkLineYArray[1]=y;this.DriverDrawPoly(this.WorkLineXArray,this.WorkLineYArray,2,false,false);}}
this.PenDown=true;this.LastX=x;this.LastY=y;return this;}
JsGraph.prototype.WorkLineXArray=[0,0];JsGraph.prototype.WorkLineYArray=[0,0];JsGraph.prototype.Line=function(x1,y1,x2,y2,append){if(JsgVect2.Ok(x1))return this.Line(x1[0],x1[1],y1[0],y1[1],x2);append=xDefBool(append,false);if(this.IsPathOpen){var ctr=this.CurrTrans;ctr.ObjTransXY2(this.GetObjTrans(),x1,y1,x2,y2);if(append){this.PathLineTo(ctr.x1,ctr.y1);}else{this.PathMoveTo(ctr.x1,ctr.y1);}
this.PathLineTo(ctr.x2,ctr.y2);}else{this.WorkLineXArray[0]=x1;this.WorkLineXArray[1]=x2;this.WorkLineYArray[0]=y1;this.WorkLineYArray[1]=y2;this.DriverDrawPoly(this.WorkLineXArray,this.WorkLineYArray,2,false,false);}
this.PenDown=true;this.LastX=x2;this.LastY=y2;return this;}
JsGraph.prototype.Arrow=function(x1,y1,x2,y2,variant,mode,sym1,sym2){if(JsgVect2.Ok(x1))return this.Arrow(x1[0],x1[1],y1[0],y1[1],x2,y2);variant=xDefNum(variant,1);mode=xDefNum(mode,1+2);var ctr=this.CurrTrans;ctr.ObjTransXY2(this.GetObjTrans(),x1,y1,x2,y2);if(this.IsPathOpen&&(mode&8)){this.PathLineTo(ctr.x1,ctr.y1);}
if(x1==x2&&y1==y2){if(this.IsPathOpen){this.PathMoveTo(ctr.x2,ctr.y2);}
this.PenDown=true;this.LastX=x2;this.LastY=y2;return this;}
var otr=this.ObjTrans;var cnvsX1=ctr.x1,cnvsY1=ctr.y1,cnvsX2=ctr.x2,cnvsY2=ctr.y2;otr.TransXY2(x1,y1,x2,y2);var x1orig=otr.x1,y1orig=otr.y1,x2orig=otr.x2,y2orig=otr.y2;var x1corr=otr.x1,y1corr=otr.y1,x2corr=otr.x2,y2corr=otr.y2;var oldTransState=otr.Enable(false);if((variant&8)&&(variant&1)){var v=JsgVect2.New(cnvsX2-cnvsX1,cnvsY2-cnvsY1);var vd=JsgVect2.Scale(JsgVect2.Norm(v),-this.Context2D.lineWidth/2);var vs=JsgVect2.Add(v,vd);if(JsgVect2.ScalarProd(vs,v)<=0){variant|=4;}
x2corr=ctr.InvTransX(vs[0]+cnvsX1);y2corr=ctr.InvTransY(vs[1]+cnvsY1);}
if((variant&8)&&(variant&2)){var v=JsgVect2.New(cnvsX1-cnvsX2,cnvsY1-cnvsY2);var vd=JsgVect2.Scale(JsgVect2.Norm(v),-this.Context2D.lineWidth/2);var vs=JsgVect2.Add(v,vd);if(JsgVect2.ScalarProd(vs,v)<=0){variant|=4;}
var x1corr=ctr.InvTransX(vs[0]+cnvsX2);var y1corr=ctr.InvTransY(vs[1]+cnvsY2);}
if(!(variant&4)){var drawit=true;if(variant&8){var v1=JsgVect2.New(x2orig-x1orig,y2orig-y1orig);var v2=JsgVect2.New(x2corr-x1corr,y2corr-y1corr);drawit=(JsgVect2.ScalarProd(v1,v2)>0);}
if(drawit){this.Line(x1corr,y1corr,x2corr,y2corr);}}
if(xStr(sym1))this.SetMarkerSymbol(sym1);if(variant&2){var mat=JsgMat2.RotatingToXY(cnvsX1-cnvsX2,cnvsY1-cnvsY2);this.Marker(x1corr,y1corr,mode&3,mat);}
if(xStr(sym2))this.SetMarkerSymbol(sym2);if(variant&1){var mat=JsgMat2.RotatingToXY(cnvsX2-cnvsX1,cnvsY2-cnvsY1);this.Marker(x2corr,y2corr,mode&3,mat);}
otr.Enable(oldTransState);if(this.IsPathOpen){this.PathMoveTo(cnvsX2,cnvsY2);}
this.PenDown=true;this.LastX=x2;this.LastY=y2;return this;}
JsGraph.prototype.PolygonArrow=function(xArray,yArray,variant,lineMode,arrowMode,size,sym1,sym2){if(JsgPolygon.Ok(xArray))return this.PolygonArrow(xArray.X,xArray.Y,yArray,variant,lineMode,xArray.Size);variant=xDefNum(variant,1);lineMode=xDefNum(lineMode,1);arrowMode=xDefNum(arrowMode,1+2);size=xDefNum(size,xArray.length);if(size<1)return this;if(size==1)return this.Line(xArray[0],yArray[0],xArray[0],yArray[0],((lineMode&8)>0));if(size==2)return this.Arrow(xArray[0],yArray[0],xArray[1],yArray[1],variant,arrowMode);var last=size-1;if(this.IsPathOpen&&(lineMode&8)){var ctr=this.CurrTrans;ctr.ObjTransXY(this.GetObjTrans(),xArray[0],yArray[0]);this.PathLineTo(ctr.x,ctr.y);}
if(!(variant&4)){if(lineMode&4){this.Polygon(xArray,yArray,lineMode&~8,size);}else{var skip=((variant&1)&&(variant&2)&&(size==3));if(!skip){if(this.IsPathOpen){this.Polygon(xArray,yArray,lineMode&3,size);}else{var x1=xArray[0];var y1=yArray[0];var x2=xArray[last];var y2=yArray[last];if(variant&2){xArray[0]=xArray[1];yArray[0]=yArray[1];}
if(variant&1){xArray[last]=xArray[last-1]
yArray[last]=yArray[last-1]}
this.Polygon(xArray,yArray,lineMode&3,size);xArray[0]=x1;yArray[0]=y1;xArray[last]=x2;yArray[last]=y2;}}}}
var hideSeg=this.IsPathOpen?4:0;if(variant&2){var x1=xArray[0],y1=yArray[0];var x2=xArray[1],y2=yArray[1];this.Arrow(x1,y1,x2,y2,(variant&8)+hideSeg+2,arrowMode&(1+2),sym1);}
if(variant&1){var x1=xArray[last-1],y1=yArray[last-1];var x2=xArray[last],y2=yArray[last];this.Arrow(x1,y1,x2,y2,(variant&8)+hideSeg+1,arrowMode&(1+2),sym2);}
var i=(lineMode&4)?0:last;this.PenDown=true;this.LastX=xArray[i];this.LastY=yArray[i];if(this.IsPathOpen){var ctr=this.CurrTrans;ctr.ObjTransXY(this.GetObjTrans(),this.LastX,this.LastY);this.PathMoveTo(ctr.x,ctr.y);}
return this;}
JsGraph.prototype.RectWH=function(x,y,w,h,mode,roll){if(JsgRect.Ok(x))return this.Rect(x.x,x.y,x.x+x.w,x.y+x.h,y,w);return this.Rect(x,y,x+w,y+h,mode,roll);}
JsGraph.prototype.Rect=function(x1,y1,x2,y2,mode,roll){if(!xDef(x1)){var oldTransState=this.ObjTrans.Enable(false);this.Rect(this.GetFrame(),1)
this.ObjTrans.Endable(oldTransState);return this;}
if(xObj(x1)){if(JsgRect.Ok(x1))return this.Rect(x1.x,x1.y,x1.x+x1.w,x1.y+x1.h,y1,x2);return this.Rect(x1.xmin,x1.ymin,x1.xmax,x1.ymax,y1,x2);}
if(JsgVect2.Ok(x1))return this.Rect(x1[0],x1[1],y1[0],y1[1],x2,y2);this.DriverDrawRect(x1,y1,x2,y2,mode,roll);return this;}
JsGraph.prototype.DriverDrawRect=function(x1,y1,x2,y2,mode,roll){mode=xDefNum(mode,1);roll=xDefNum(roll,0);var ctr=this.CurrTrans;var otr=this.ObjTrans;var inv=!!(mode&4);if(this.IsPathOpen){var poly=this.MakeRectPolygon(x1,y1,x2,y2,inv,roll);this.Polygon(poly,mode&11);return;}
if(otr.Enabled&&!otr.IsMoveOnly){this.RectAsPolygon(x1,y1,x2,y2,mode,inv,roll);return;}
ctr.ObjTransXY2(this.GetObjTrans(),x1,y1,x2,y2);if(ctr.x1>ctr.x2){var tmp=ctr.x1;ctr.x1=ctr.x2;ctr.x2=tmp;}
if(ctr.y1>ctr.y2){var tmp=ctr.y1;ctr.y1=ctr.y2;ctr.y2=tmp;}
var ctx=this.Context2D;var quadrant=0;if(this.GraphClipEnabled){quadrant=this.GetRectClipQuadrant(ctr.x1,ctr.x2,ctr.y1,ctr.y2);}
if(quadrant==0){if(mode&2){ctx.fillRect(ctr.x1,ctr.y1,ctr.x2-ctr.x1,ctr.y2-ctr.y1);}
if(mode&1){var oldJoin=ctx.lineJoin;var oldCap=ctx.lineCap;if(oldJoin=='round'){ctx.lineCap='round';}else{ctx.lineJoin='miter';ctx.lineCap='square';}
ctx.strokeRect(ctr.x1,ctr.y1,ctr.x2-ctr.x1,ctr.y2-ctr.y1);ctx.lineJoin=oldJoin;ctx.lineCap=oldCap;}}else if(quadrant==2){this.RectAsPolygon(x1,y1,x2,y2,mode,inv,roll);}}
JsGraph.prototype.RectAsPolygon=function(x1,y1,x2,y2,mode,inv,roll){var poly=this.MakeRectPolygon(x1,y1,x2,y2,inv,roll);var oldJoin=this.LineJoin;var oldCap=this.LineCap;if(oldJoin=='round'){this.SetLineCap('round');}else{this.SetLineJoin('miter');this.SetLineCap('square');}
this.Polygon(poly,mode&11);this.SetLineJoin(oldJoin);this.SetLineCap(oldCap);}
JsGraph.prototype.MakeRectPolygon=function(x1,y1,x2,y2,inverse,roll){if(JsgVect2.Ok(x1))return this.MakeRectPolygon(x1[0],x1[1],y1[0],y1[1],x2,y2);if(xObj(x1)){if(JsgRect.Ok(x1))return this.MakeRectPolygon(x1.x,x1.y,x1.x+x1.w,x1.y+x1.h,y1,x2);return this.MakeRectPolygon(x1.xmin,x1.ymin,x1.xmax,x1.ymax,y1,x2);}
inverse=xDefBool(inverse,false);roll=xDefNum(roll,0);if(x1>x2){var tmp=x1;x1=x2;x2=tmp;}
if(y1>y2){var tmp=y1;y1=y2;y2=tmp;}
var poly=this.WorkPoly.Reset();poly.AddPoint(x1,y1);poly.AddPoint(x2,y1);poly.AddPoint(x2,y2);poly.AddPoint(x1,y2);if(roll!==0)poly.Roll(roll);poly.AddPoint(poly.X[0],poly.Y[0]);if(inverse)poly.Invert();return poly;}
JsGraph.prototype.DegToRad=function(a){return a/180*Math.PI;}
JsGraph.prototype.RadToDeg=function(a){return a/Math.PI*180;}
JsGraph.prototype.AngleToRad=function(a){return this.AngleMeasure=='deg'?this.DegToRad(a):a;}
JsGraph.prototype.RadToAngle=function(a){return this.AngleMeasure=='deg'?this.RadToDeg(a):a;}
JsGraph.prototype.AngleOfVector=function(x,y){if(JsgVect2.Ok(x))return this.AngleOfVector(x[0],x[1]);var r=Math.sqrt(x*x+y*y);var ang=0;if(r>0)ang=Math.acos(x/r);if(y<0)ang=2*Math.PI-ang;if(this.AngleMeasure=='deg')ang=this.RadToDeg(ang);return ang;}
JsGraph.prototype.MakeArcFromPoints=function(x1,y1,x2,y2,r,big){var arc={x:x1,y:y1,r:r,start:0,end:0};var absr=Math.abs(r);var mx=(x2-x1)/2;var my=(y2-y1)/2;var ml=Math.sqrt(mx*mx+my*my);if(ml==0)return arc;var hl=0;if(absr>ml)hl=Math.sqrt(absr*absr-ml*ml);var hx=-hl*my/ml;var hy=hl*mx/ml;if((r<0)^big){hx=-hx;hy=-hy;}
arc.x=x1+mx+hx;arc.y=y1+my+hy;arc.start=this.AngleOfVector(x1-arc.x,y1-arc.y);arc.end=this.AngleOfVector(x2-arc.x,y2-arc.y);return arc;}
JsGraph.prototype.MakeEllipseArcPolygon=function(x,y,rx,ry,rot,start,end,rPixel){if(JsgVect2.Ok(x))return this.MakeEllipseArcPolygon(x[0],x[1],y,rx,ry,rot,start,end);ry=xDefNum(ry,Math.abs(rx));rot=xDefNum(rot,0);start=xDefNum(start,0);end=xDefNum(end,start+this.RadToAngle(2*Math.PI));var abs=Math.abs,max=Math.max;var ctr=this.CurrTrans;var otr=this.ObjTrans;var absRx=abs(rx);var absRy=abs(ry);if(!xDef(rPixel)){var maxR=max(absRx,absRy);var s=otr.MaxScaling();var cnvsRx=abs(s*ctr.ScaleX*maxR);var cnvsRy=abs(s*ctr.ScaleY*maxR);rPixel=max(cnvsRx,cnvsRy);}
rot=this.AngleToRad(rot);start=this.AngleToRad(start);end=this.AngleToRad(end);var delta=this.CompDeltaAngle(rPixel,this.CurvePrecision/this.DevicePixelRatio);var angles={delta:delta,start:start,end:end};if(rx<0)angles.delta*=-1;this.NormalizeAngles(angles);rot=this.NormalizeAngle(rot);var poly=this.MakeUnityArcPolygon(angles);var mat=JsgMat2.Transformation(absRx,absRy,rot,x,y);JsgMat2.TransPolyXY(mat,poly.X,poly.Y,poly.Size);return poly;}
JsGraph.prototype.Circle=function(x,y,r,mode,startAngle){if(JsgVect2.Ok(x))return this.Circle(x[0],x[1],y,r,mode);startAngle=xDefNum(startAngle,0);var start=startAngle;var end=startAngle+this.RadToAngle(2*Math.PI);if(r<0){start=end;end=startAngle;}
this.Arc(x,y,r,start,end,mode);return this;}
JsGraph.prototype.Arc=function(x,y,r,start,end,mode){if(JsgVect2.Ok(x))return this.Arc(x[0],x[1],y,r,start,end);var ctr=this.CurrTrans;var cnvsRX=Math.abs(ctr.ScaleX*r);var cnvsRY=Math.abs(ctr.ScaleY*r);var cnvsRDiff=Math.abs(cnvsRX-cnvsRY);if(this.DisableNativeArc||!this.ObjTrans.IsMoveOnly||cnvsRDiff>this.CurvePrecision/this.DevicePixelRatio){this.EllipseArcAsPolygon(x,y,r,Math.abs(r),0,start,end,mode);}else{this.DriverDrawArc(x,y,r,start,end,mode);}
return this;}
JsGraph.prototype.ArcTo=function(x,y,r,big,mode){if(JsgVect2.Ok(x))return this.ArcTo(x[0],x[1],y,r,big);this.ArcPt(this.LastX,this.LastY,x,y,r,big,mode|8);return this;}
JsGraph.prototype.ArcPt=function(x1,y1,x2,y2,r,big,mode){if(JsgVect2.Ok(x1))return this.ArcPt(x1[0],x1[1],y1[0],y1[1],x2,y2,r);big=xDefBool(big,false);mode=xDefNum(mode,1);var arc=this.MakeArcFromPoints(x1,y1,x2,y2,r,big);this.Arc(arc.x,arc.y,arc.r,arc.start,arc.end,mode);this.PenDown=true;this.LastX=x2;this.LastY=y2;return this;}
JsGraph.prototype.DriverDrawArc=function(x,y,r,start,end,mode){start=xDefNum(start,0);end=xDefNum(end,start+this.RadToAngle(2*Math.PI));mode=xDefNum(mode,1);var cnvsStart=this.AngleToRad(start);var cnvsEnd=this.AngleToRad(end);var ctx=this.Context2D;var ctr=this.CurrTrans;ctr.ObjTransXY(this.GetObjTrans(),x,y);var cnvsRX=Math.abs(ctr.ScaleX*r);var angles={delta:r,start:cnvsStart,end:cnvsEnd};if(ctr.ScaleX*ctr.ScaleY<0){angles.delta*=-1;angles.start*=-1;angles.end*=-1;}
this.NormalizeAngles(angles);var inverse=(angles.delta<0);if(this.IsPathOpen){this.PathAppendArc(ctr.x,ctr.y,cnvsRX,angles.start,angles.end,inverse,((mode&8)>0),((mode&4)>0));}else{var quadrant=0;if(this.GraphClipEnabled){quadrant=this.GetCircleClipQuadrant(ctr.x,ctr.y,cnvsRX);}
if(quadrant==0){if(mode&2){ctx.beginPath();ctx.arc(ctr.x,ctr.y,cnvsRX,angles.start,angles.end,inverse);ctx.fill();}
if(mode&1){ctx.beginPath();ctx.arc(ctr.x,ctr.y,cnvsRX,angles.start,angles.end,inverse);if(mode&4)ctx.closePath();ctx.stroke();}}else if(quadrant==2){this.EllipseArcAsPolygon(x,y,r,Math.abs(r),0,start,end,mode);}}
var rAbs=Math.abs(r);this.LastX=x+rAbs*Math.cos(end);this.LastY=y+rAbs*Math.sin(end);}
JsGraph.prototype.Ellipse=function(x,y,rx,ry,rot,mode,startAngle){if(JsgVect2.Ok(x))return this.Ellipse(x[0],x[1],y,rx,ry,rot,mode);startAngle=xDefNum(startAngle,0);var start=startAngle;var end=startAngle+this.RadToAngle(2*Math.PI);if(rx<0){start=end;end=startAngle;}
this.EllipseArc(x,y,rx,ry,rot,start,end,mode);return this;}
JsGraph.prototype.EllipseArc=function(x,y,rx,ry,rot,start,end,mode){if(JsgVect2.Ok(x))return this.EllipseArc(x[0],x[1],y,rx,ry,rot,start,end);var ctr=this.CurrTrans;var abs=Math.abs;var precision=this.CurvePrecision/this.DevicePixelRatio;var isCircular=!this.DisableNativeArc&&this.ObjTrans.IsMoveOnly;if(isCircular){var cnvsRxx=abs(ctr.ScaleX*rx);var cnvsRxy=abs(ctr.ScaleY*rx);if(abs(cnvsRxx-cnvsRxy)>precision)isCircular=false;if(isCircular){var cnvsRyx=abs(ctr.ScaleX*ry);var cnvsRyy=abs(ctr.ScaleY*ry);if(abs(cnvsRyx-cnvsRyy)>precision)isCircular=false;if(isCircular){if(abs(cnvsRxx-cnvsRyx)>precision)isCircular=false;}}}
if(isCircular){rot=xDefNum(rot,0);start=xDefNum(start,0);end=xDefNum(end,start+this.RadToAngle(2*Math.PI));this.DriverDrawArc(x,y,rx,start+rot,end+rot,mode);}else{this.EllipseArcAsPolygon(x,y,rx,ry,rot,start,end,mode);}
return this;}
JsGraph.prototype.IsClosedPolygon=function(xArray,yArray,size){if(JsgPolygon.Ok(xArray))return this.IsClosedPolygon(xArray.X,xArray.Y,xArray.Size);size=xDefNum(size,xArray.length);var closed=false;var last=size-1;if(last>=2){var refLen=0.5/this.DevicePixelRatio;if(JsgVect2.Length2(xArray[0]-xArray[last],yArray[0]-yArray[last])<=(refLen*refLen))closed=true;}
return closed;}
JsGraph.prototype.EllipseArcAsPolygon=function(x,y,rx,ry,rot,start,end,mode){mode=xDefNum(mode,1);var ell=this.MakeEllipseArcPolygon(x,y,rx,ry,rot,start,end);var closed=this.IsClosedPolygon(ell.X,ell.Y,ell.Size);if(closed){var ctx=this.Context2D
var oldJoin=ctx.lineJoin;var oldCap=ctx.lineCap;ctx.lineJoin='round';ctx.lineCap='round';this.Polygon(ell,mode);ctx.lineJoin=oldJoin;ctx.lineCap=oldCap;}else{this.Polygon(ell,mode);}}
JsGraph.prototype.DriverWorkPoly=new JsgPolygon(false,'JsGraph.DriverWorkPoly');JsGraph.prototype.DriverWorkClipPoly=new JsgPolygon(false,'JsGraph.DriverWorkClipPoly');JsGraph.prototype.DriverWorkClipPolyList=new JsgPolygonList(false,'JsGraph.DriverWorkClipPolyList');JsGraph.prototype.DriverDrawPoly=function(xArray,yArray,size,fillMode,close,poly){var ctr=this.CurrTrans;var otr=this.GetObjTrans();var ctx=this.Context2D;if(!xDef(poly)){poly=this.DriverWorkPoly.Reset();poly.Quadrant=-1;for(var i=0;i<size;i++){ctr.ObjTransXY(otr,xArray[i],yArray[i]);poly.AddPoint(ctr.x,ctr.y);}}
if(this.GraphClipEnabled){var quadrant=poly.Quadrant;if(quadrant==-1){quadrant=this.GetPolygonClipQuadrant(poly.X,poly.Y,poly.Size);poly.Quadrant=quadrant;}
if(fillMode){var polyClipped=null;if(quadrant==0){polyClipped=poly;}else if(quadrant==2){var didClosePoly=this.ClosePolygon(poly);polyClipped=this.ClipPolygonArea(poly,this.GraphClipInnerXmin,this.GraphClipInnerXmax,this.GraphClipInnerYmin,this.GraphClipInnerYmax,this.DriverWorkClipPoly);if(didClosePoly)poly.RemoveLastPoint();}
if(polyClipped){if(this.DriverDrawPathPoly(polyClipped,true,false)){ctx.fill();}}}else{if(quadrant==0){if(this.DriverDrawPathPoly(poly,true,close)){ctx.stroke();}}else if(quadrant==2){var didClosePoly=false;if(close)didClosePoly=this.ClosePolygon(poly);var polyListClipped=this.ClipPolygon(poly,this.GraphClipInnerXmin,this.GraphClipInnerXmax,this.GraphClipInnerYmin,this.GraphClipInnerYmax,ctx.lineWidth/2,this.DriverWorkClipPolyList);if(polyListClipped.Size>0){var newPath=true;for(var i=0;i<polyListClipped.Size;i++){var polyClipped=polyListClipped.PolyList[i];if(this.DriverDrawPathPoly(polyClipped,newPath,false)){newPath=false;}}
if(!newPath)ctx.stroke();}
if(didClosePoly)poly.RemoveLastPoint();}}}else{if(this.DriverDrawPathPoly(poly,true,close)){if(fillMode){ctx.fill();}else{ctx.stroke();}}}
return poly;}
JsGraph.prototype.DriverDrawBezierCurve=function(sx,sy,cx1,cy1,cx2,cy2,ex,ey,mode,nSegments){mode=xDefNum(mode,1);var ctx=this.Context2D;var ctr=this.CurrTrans;var otr=this.GetObjTrans();ctr.ObjTransXY(otr,sx,sy);var cnvsSx=ctr.x,cnvsSy=ctr.y;ctr.ObjTransXY(otr,cx1,cy1);var cnvsCx1=ctr.x,cnvsCy1=ctr.y;ctr.ObjTransXY(otr,cx2,cy2);var cnvsCx2=ctr.x,cnvsCy2=ctr.y;ctr.ObjTransXY(otr,ex,ey);var cnvsEx=ctr.x,cnvsEy=ctr.y;if(this.IsPathOpen){if(mode&8){this.PathLineTo(cnvsSx,cnvsSy);}else{this.PathMoveTo(cnvsSx,cnvsSy);}
this.PathAppendBezierTo(cnvsCx1,cnvsCy1,cnvsCx2,cnvsCy2,cnvsEx,cnvsEy);if(mode&4){this.PathLineTo(cnvsSx,cnvsSy);}}else{if(mode&8){if(this.LastX!=sx||this.LastY!=sy){this.Line(this.LastX,this.LastY,sx,sy);}}
var quadrant=0;if(this.GraphClipEnabled){quadrant=this.GetBezierClipQuadrant(cnvsSx,cnvsSy,cnvsCx1,cnvsCy1,cnvsCx2,cnvsCy2,cnvsEx,cnvsEy);}
if(quadrant==0){if(mode&2){ctx.beginPath();ctx.moveTo(cnvsSx,cnvsSy);ctx.bezierCurveTo(cnvsCx1,cnvsCy1,cnvsCx2,cnvsCy2,cnvsEx,cnvsEy);ctx.fill();}
if(mode&1){ctx.beginPath();ctx.moveTo(cnvsSx,cnvsSy);ctx.bezierCurveTo(cnvsCx1,cnvsCy1,cnvsCx2,cnvsCy2,cnvsEx,cnvsEy);if(mode&4)ctx.closePath();ctx.stroke();}}else if(quadrant==2){this.BezierCurveAsPolygon(sx,sy,cx1,cy1,cx2,cy2,ex,ey,mode,nSegments);}}
this.PenDown=true;if(mode&4){this.LastX=sx;this.LastY=sy;}else{this.LastX=ex;this.LastY=ey;}}
JsGraph.prototype.NewPoly=function(){this.Poly.Reset();return this;}
JsGraph.prototype.CopyPoly=function(to,reuseArrays){reuseArrays=xDefBool(reuseArrays,false);return this.Poly.Copy(to,!reuseArrays);}
JsGraph.prototype.AddPointToPoly=function(x,y){this.Poly.AddPoint(x,y);return this;}
JsGraph.prototype.AddVectToPoly=function(vec){this.Poly.AddPoint(vec[0],vec[1]);return this;}
JsGraph.prototype.DrawPoly=function(mode){mode=xDefNum(mode,1);if(mode&16)this.Poly.Invert();this.Polygon(this.Poly,mode);}
JsGraph.prototype.DrawPolyArrow=function(variant,lineMode,arrowMode){this.PolygonArrow(this.Poly,variant,lineMode,arrowMode);}
JsGraph.prototype.DrawPolyMarker=function(mode,mat){this.Marker(this.Poly,mode,mat);}
JsGraph.prototype.Polygon=function(xArray,yArray,mode,size){if(JsgPolygon.Ok(xArray))return this.Polygon(xArray.X,xArray.Y,yArray,xArray.Size);mode=xDefNum(mode,1);size=xDefNum(size,xArray.length);if(size<1)return this;if(this.IsPathOpen){this.PathAppendPolygon(xArray,yArray,((mode&8)>0),((mode&4)>0),size);}else{var poly;if(mode&2){poly=this.DriverDrawPoly(xArray,yArray,size,true,false);}
if(mode&1){this.DriverDrawPoly(xArray,yArray,size,false,(mode&4)>0,poly);}}
var i=(mode&4)?0:xArray.length-1;this.PenDown=true;this.LastX=xArray[i];this.LastY=yArray[i];return this;}
JsGraph.prototype.PolygonList=function(polyList,mode){if(!JsgPolygonList.Ok(polyList))return g.Polygon(polyList,mode);for(var i=0;i<polyList.Size;i++){this.Polygon(polyList.PolyList[i],mode);}
return this;}
JsGraph.prototype.ClosePolygon=function(poly){var last=poly.Size-1;if(last<1)return false;if(poly.X[0]!=poly.X[last]||poly.Y[0]!=poly.Y[last]){poly.AddPoint(poly.X[0],poly.Y[0]);return true;}
return false;}
JsGraph.prototype.WorkPolyClipped=new JsgPolygon(false,'JsGraph.WorkPolyClipped');JsGraph.prototype.ClipPolygonArea=function(poly,xmin,xmax,ymin,ymax,polyClipped){polyClipped=polyClipped||new JsgPolygon();var polyClipped2=this.WorkPolyClipped;this.ClipPolygonAtLine(poly,xmin,false,false,polyClipped2);this.ClipPolygonAtLine(polyClipped2,ymin,false,true,polyClipped);this.ClipPolygonAtLine(polyClipped,xmax,true,false,polyClipped2);this.ClipPolygonAtLine(polyClipped2,ymax,true,true,polyClipped);return polyClipped;}
JsGraph.prototype.WorkPolyListClipped=new JsgPolygonList(false,'JsGraph.WorkPolyListClipped');JsGraph.prototype.ClipPolygon=function(poly,xmin,xmax,ymin,ymax,extend,polyListClipped){extend=xDefNum(extend,0);if(extend!=0){xmin-=extend;xmax+=extend;ymin-=extend;ymax+=extend;}
polyListClipped=polyListClipped||new JsgPolygonList();var polyListClipped2=this.WorkPolyListClipped;polyListClipped2.Reset();this.ClipPolygonAtLine(poly,xmin,false,false,polyListClipped2);polyListClipped.Reset();for(var i=0;i<polyListClipped2.Size;i++){this.ClipPolygonAtLine(polyListClipped2.PolyList[i],ymin,false,true,polyListClipped);}
polyListClipped2.Reset();for(var i=0;i<polyListClipped.Size;i++){this.ClipPolygonAtLine(polyListClipped.PolyList[i],xmax,true,false,polyListClipped2);}
polyListClipped.Reset();for(var i=0;i<polyListClipped2.Size;i++){this.ClipPolygonAtLine(polyListClipped2.PolyList[i],ymax,true,true,polyListClipped);}
return polyListClipped;}
JsGraph.prototype.ClipPolygonAtLine=function(poly,clipCoord,clipAtMax,clipHorizontal,polyClipped){function AddPointToPolyClipped(x,y){if(clipHorizontal){polyClipped.AddPoint(y,x);}else{polyClipped.AddPoint(x,y);}}
function IsInside(x){return clipAtMax?x<=clipCoord:x>=clipCoord;}
var isBorderClipMode=JsgPolygonList.Ok(polyClipped);if(!isBorderClipMode)polyClipped.Reset();if(poly.Size==0)return;var isP1Inside,isP2Inside,polyX,polyY;if(clipHorizontal){polyX=poly.Y;polyY=poly.X;}else{polyX=poly.X;polyY=poly.Y;}
isP1Inside=IsInside(polyX[0]);if(poly.Size==1){if(isP1Inside){if(isBorderClipMode)polyClipped.NewPoly();polyClipped.AddPoint(poly.X[0],poly.Y[0]);}
return;}
var polyClosed=false;if(!isBorderClipMode){polyClosed=this.ClosePolygon(poly);}
var isLastP2Added=false;var nlast=poly.Size-2;for(var i=0;i<=nlast;i++){var i2=i+1;isP2Inside=IsInside(polyX[i2]);if(isP1Inside&&isP2Inside){if(!isLastP2Added){if(isBorderClipMode)polyClipped.NewPoly();AddPointToPolyClipped(polyX[i],polyY[i]);}
AddPointToPolyClipped(polyX[i2],polyY[i2]);isLastP2Added=true;}else if(isP1Inside!=isP2Inside){var intersectCoord=this.ClipIntersectionCoord(polyX[i],polyY[i],polyX[i2],polyY[i2],clipCoord);if(isP1Inside){if(!isLastP2Added){if(isBorderClipMode)polyClipped.NewPoly();AddPointToPolyClipped(polyX[i],polyY[i]);}
AddPointToPolyClipped(clipCoord,intersectCoord);isLastP2Added=false;}else{if(isBorderClipMode)polyClipped.NewPoly();AddPointToPolyClipped(clipCoord,intersectCoord);AddPointToPolyClipped(polyX[i2],polyY[i2]);isLastP2Added=true;}}
isP1Inside=isP2Inside;}
if(polyClosed)poly.RemoveLastPoint();}
JsGraph.prototype.GetRectQuadrant=function(rxmin,rxmax,rymin,rymax,xmin,xmax,ymin,ymax){if(rxmin>=xmin&&rxmax<=xmax&&rymin>=ymin&&rymax<=ymax)return 0;if(rxmax<xmin||rxmin>xmax||rymax<ymin||rymin>ymax)return 1;return 2;}
JsGraph.prototype.GetRectClipQuadrant=function(rxmin,rxmax,rymin,rymax){if(rxmin>=this.GraphClipInnerXmin&&rxmax<=this.GraphClipInnerXmax&&rymin>=this.GraphClipInnerYmin&&rymax<=this.GraphClipInnerYmax)return 0;if(rxmax<this.GraphClipInnerXmin||rxmin>this.GraphClipInnerXmax||rymax<this.GraphClipInnerYmin||rymin>this.GraphClipInnerYmax)return 1;if(rxmin>=this.GraphClipOuterXmin&&rxmax<=this.GraphClipOuterXmax&&rymin>=this.GraphClipOuterYmin&&rymax<=this.GraphClipOuterYmax)return 0;return 2;}
JsGraph.prototype.GetPolygonClipQuadrant=function(xArray,yArray,size){if(this.IsPolygonArrayInsideRect(xArray,yArray,size,this.GraphClipInnerXmin,this.GraphClipInnerXmax,this.GraphClipInnerYmin,this.GraphClipInnerYmax)){return 0;}
var xmin=xArray[0];var xmax=xmin;var ymin=yArray[0];var ymax=ymin;for(var i=1;i<size;i++){var x=xArray[i];var y=yArray[i];if(x<xmin)xmin=x;if(x>xmax)xmax=x;if(y<ymin)ymin=y;if(y>ymax)ymax=y;}
return this.GetRectClipQuadrant(xmin,xmax,ymin,ymax);}
JsGraph.prototype.GetCircleClipQuadrant=function(x,y,r){return this.GetRectClipQuadrant(x-r,x+r,y-r,y+r);}
JsGraph.prototype.GetBezierClipQuadrant=function(px1,py1,cx1,cy1,cx2,cy2,px2,py2){var rxmin=Math.min(px1,cx1,cx2,px2);var rxmax=Math.max(px1,cx1,cx2,px2);var rymin=Math.min(py1,cy1,cy2,py2);var rymax=Math.max(py1,cy1,cy2,py2);return this.GetRectClipQuadrant(rxmin,rxmax,rymin,rymax);}
JsGraph.prototype.IsPointInsideRect=function(x,y,xmin,xmax,ymin,ymax){return(x>=xmin&&x<=xmax&&y>=ymin&&y<=ymax);}
JsGraph.prototype.IsPolygonInsideRect=function(xArray,yArray,size,xmin,xmax,ymin,ymax){if(JsgPolygon.Ok(xArray)){return this.IsPolygonArrayInsideRect(xArray.X,xArray.Y,xArray.Size,yArray,size,xmin,xmax);}else{return this.IsPolygonArrayInsideRect(xArray,yArray,size,xmin,xmax,ymin,ymax);}}
JsGraph.prototype.IsPolygonArrayInsideRect=function(xArray,yArray,size,xmin,xmax,ymin,ymax){for(var i=0;i<size;i++){if(xArray[i]<xmin||xArray[i]>xmax||yArray[i]<ymin||yArray[i]>ymax)return false;}
return true;}
JsGraph.prototype.ClipIntersectionCoord=function(x1,y1,x2,y2,clipx){return(y2-y1)*(clipx-x1)/(x2-x1)+y1;}
JsGraph.prototype.BezierCurveTo=function(cx1,cy1,cx2,cy2,ex,ey,mode){if(JsgVect2.Ok(cx1))return this.BezierCurve(this.LastX,this.LastY,cx1[0],cx1[1],cy1[0],cy1[1],cx2[0],cx2[1],cy2);if(JsgPolygon.Ok(cx1))return this.BezierCurve(this.LastX,this.LastY,sx.X[0],sx.Y[0],sx.X[1],sx.Y[1],sx.X[2],sx.Y[2],sy);mode=xDefNum(mode,1)|8;this.BezierCurve(this.LastX,this.LastY,cx1,cy1,cx2,cy2,ex,ey,mode);return this;}
JsGraph.prototype.BezierCurve=function(sx,sy,cx1,cy1,cx2,cy2,ex,ey,mode,nSegments){if(JsgVect2.Ok(sx)){return this.BezierCurve(sx[0],sx[1],sy[0],sy[1],cx1[0],cx1[1],cy1[0],cy1[1],cx2,cx1);}
if(JsgPolygon.Ok(sx)){var i=xDefNum(cx1,0);return this.BezierCurve(sx.X[i],sx.Y[i],sx.X[i+1],sx.Y[i+1],sx.X[i+2],sx.Y[i+2],sx.X[i+3],sx.Y[i+3],sy,cy1);}
if(this.DisableNativeBezier||xNum(nSegments)){this.BezierCurveAsPolygon(sx,sy,cx1,cy1,cx2,cy2,ex,ey,mode,nSegments);}else{this.DriverDrawBezierCurve(sx,sy,cx1,cy1,cx2,cy2,ex,ey,mode,nSegments);}
return this;}
JsGraph.prototype.MakeBezierPolygon=function(sx,sy,cx1,cy1,cx2,cy2,ex,ey,nSegments,add,polyRet){if(JsgVect2.Ok(sx)){return this.MakeBezierPolygon(sx[0],sx[1],sy[0],sy[1],cx1[0],cx1[1],cy1[0],cy1[1],cx2,cy2,ex);}
if(JsgPolygon.Ok(sx)){polyRet=polyRet||this.WorkPoly2;var startIx=xDefNum(sy,0);if(sx.Size<startIx+4){add=xDefBool(add,false);if(!add)polyRet.Reset();return polyRet;}
var i=xDefNum(sy,0);return this.MakeBezierPolygon(sx.X[i+0],sx.Y[i+0],sx.X[i+1],sx.Y[i+1],sx.X[i+2],sx.Y[i+2],sx.X[i+3],sx.Y[i+3],cx1,cy1,cx2);}
nSegments=xDefNum(nSegments,this.NumBezierSegments);add=xDefBool(add,false);var polyRet=polyRet||this.WorkPoly2;if(!add)polyRet.Reset();var dt=1/nSegments;var tlast=1+dt/2;for(var t=0;t<tlast;t+=dt){var t2=t*t;var t3=t*t2;var mt=1-t;var mt2=mt*mt;var mt3=mt*mt2;var x=sx*mt3+cx1*3*mt2*t+cx2*3*mt*t2+ex*t3;var y=sy*mt3+cy1*3*mt2*t+cy2*3*mt*t2+ey*t3;polyRet.AddPoint(x,y);}
return polyRet;}
JsGraph.prototype.MakeSplineCurve=function(xArray,yArray,tension,mode,size,nSegments,polyRet){if(JsgPolygon.Ok(xArray)){return this.MakeSplineCurve(xArray.X,xArray.Y,yArray,tension,xArray.Size,mode);}
var bezierPoly=this.SplineCurve(xArray,yArray,tension,mode,size);polyRet=polyRet||this.WorkPoly2;polyRet.Reset();first=0;last=poly.Size-1;if(!(mode&4)&&(mode&64)){if((mode&16)&&(last-first>3))first+=3;if((mode&32)&&(last-first>3))last-=3;}
for(var i=first;i<last;i+=3){this.MakeBezierPolygon(bezierPoly,i,nSegments,true,polyRet);}
return polyRet;}
JsGraph.prototype.BezierCurveAsPolygon=function(sx,sy,cx1,cy1,cx2,cy2,ex,ey,mode,nSegments){nSegments=xDefNum(nSegments,this.NumBezierSegments);var poly=this.MakeBezierPolygon(sx,sy,cx1,cy1,cx2,cy2,ex,ey,nSegments);this.Polygon(poly,mode);}
JsGraph.prototype.ComputeBezierControlPoints=function(poly,tension,last){function LengthFor(side1,side2){return Math.sqrt(side1*side1+side2*side2);}
var fa,fb;var px=poly.X;var py=poly.Y;for(var i=1;i<=last;i++){var pivot=3*i;var left=pivot-3;var right=pivot+3;var ca=pivot-1;var cb=pivot+1;var d01=LengthFor(px[pivot]-px[left],py[pivot]-py[left]);var d12=LengthFor(px[right]-px[pivot],py[right]-py[pivot]);var d=d01+d12;if(d>0){fa=tension*d01/d;fb=tension*d12/d;}else{fa=0;fb=0;}
var w=px[right]-px[left];var h=py[right]-py[left];px[ca]=px[pivot]-fa*w;py[ca]=py[pivot]-fa*h;px[cb]=px[pivot]+fb*w;py[cb]=py[pivot]+fb*h;}}
JsGraph.prototype.SplineCurve=function(xArray,yArray,tension,mode,size){if(JsgPolygon.Ok(xArray)){return this.SplineCurve(xArray.X,xArray.Y,yArray,tension,xArray.Size);}
tension=xDefNum(tension,0.5);size=xDefNum(size,xArray.length);if(size<2)return this;if(size==2){return this.Line(xArray[0],yArray[0],xArray[1],yArray[1],(mode&8)>0);}
var poly=this.WorkPoly.Reset();var first=0;var last=size-1;var nPoints=size;var firstIsControlPoint=(!(mode&4)&&(mode&16)&&!(mode&64)&&(nPoints>=3));if(firstIsControlPoint){first++;nPoints--;}
var lastIsControlPoint=(!(mode&4)&&(mode&32)&&!(mode&64)&&(nPoints>=3));if(lastIsControlPoint){last--;nPoints--;}
poly.AddPoint(xArray[first],yArray[first]);for(var i=first+1;i<=last;i++){poly.AddPoint(0,0);poly.AddPoint(0,0);poly.AddPoint(xArray[i],yArray[i]);}
var finalPolySize=poly.Size;if(mode&4){poly.AddPoint(0,0);poly.AddPoint(0,0);poly.AddPoint(xArray[0],yArray[0]);poly.AddPoint(0,0);poly.AddPoint(0,0);poly.AddPoint(xArray[1],yArray[1]);finalPolySize=poly.Size-3;}else{poly.X[1]=xArray[0];poly.Y[1]=yArray[0];var last=poly.Size-2;poly.X[last]=xArray[size-1];poly.Y[last]=yArray[size-1];}
var last=(mode&4)?size:size-2;if(firstIsControlPoint)last--;if(lastIsControlPoint)last--;this.ComputeBezierControlPoints(poly,tension,last);if(mode&4){var i=poly.Size-3;poly.X[1]=poly.X[i];poly.Y[1]=poly.Y[i];poly.Size=finalPolySize;}
if(!(mode&3))return this.WorkPoly;var oldIsPathOpen=this.IsPathOpen;if(!oldIsPathOpen){this.OpenPath();}
first=0;last=poly.Size-1;if(!(mode&4)&&(mode&64)){if((mode&16)&&(last-first>3))first+=3;if((mode&32)&&(last-first>3))last-=3;}
var closedBorder=((mode&5)==5);mode=mode&11;for(var i=first;i<last;i+=3){this.BezierCurve(poly,mode,i);mode|=8;}
if(!oldIsPathOpen){if(closedBorder){var ctx=this.Context2D
var oldCap=ctx.lineCap;ctx.lineCap='round';this.Path(mode&3);ctx.lineCap=oldCap;}else{this.Path(mode&3);}}
return this.WorkPoly;}
JsGraph.prototype.GetTextSize=function(txt,w){var box=this.WorkRect;box.SetPos(0,0);if(this.TextCanvasRendering){this.GetCanvasTextSize(txt,box);}else{w=xDefNum(w,0);this.HtmlTextHandler.GetTextSize(txt,w,box);}
box.w/=Math.abs(this.CurrTrans.ScaleX);box.h/=Math.abs(this.CurrTrans.ScaleY);return box;}
JsGraph.prototype.GetTextBox=function(txt,x,y,w){if(!xDef(x))return this.GetTextBox(txt,0,0);if(JsgVect2.Ok(x))return this.GetTextBox(txt,x[0],x[1],y);var box=this.WorkRect;w=xDefNum(w,0);var ctr=this.CurrTrans;var cnvsX=ctr.TransX(x);var cnvsY=ctr.TransY(y);if(this.TextCanvasRendering){this.GetCanvasTextBox(txt,cnvsX,cnvsY,box);}else{this.HtmlTextHandler.GetTextBox(txt,cnvsX,cnvsY,w,box);}
var cx=ctr.InvTransX(box.x+(box.w/2));var cy=ctr.InvTransY(box.y+(box.h/2));box.w=box.w/Math.abs(ctr.ScaleX);box.h=box.h/Math.abs(ctr.ScaleY);box.x=cx-box.w/2;box.y=cy-box.h/2;return box;}
JsGraph.prototype.Text=function(txt,x,y,WidthOrMode){if(JsgVect2.Ok(x))return this.Text(txt,x[0],x[1],y);WidthOrMode=xDefNum(WidthOrMode,0);var ctr=this.CurrTrans;ctr.ObjTransXY(this.GetObjTrans(),x,y);if(this.GraphClipEnabled&&!this.IsPointInsideRect(ctr.x,ctr.y,this.GraphClipOuterXmin,this.GraphClipOuterXmax,this.GraphClipOuterYmin,this.GraphClipOuterYmax)){return this;}
if(this.TextCanvasRendering){this.DrawCanvasText(txt,ctr.x,ctr.y,WidthOrMode);}else{this.HtmlTextHandler.DrawText(txt,ctr.x,ctr.y,WidthOrMode);}
return this;}
JsGraph.prototype.TextBox=function(txt,x,y,mode,roll,width){if(JsgVect2.Ok(x))return this.TextBox(txt,x[0],x[1],y,mode,roll);if(this.TextCanvasRendering){var objTrans=this.SaveTrans(true);this.TransMove(-x,-y);this.TransScale(this.CurrTrans.ScaleX,this.CurrTrans.ScaleY);this.TransRotate(this.TextRotation);this.TransScale(1/this.CurrTrans.ScaleX,1/this.CurrTrans.ScaleY);this.TransMove(x,y);this.AddTrans(objTrans);this.Rect(this.GetTextBox(txt,x,y),mode,roll);this.RestoreTrans();}else{this.Rect(this.GetTextBox(txt,x,y,width),mode,roll);}
return this;}
JsGraph.prototype.DrawCanvasText=function(txt,x,y,mode){this.SetCanvasFont();var ctr=this.CurrTrans;var otr=this.ObjTrans;var ctx=this.Context2D;var oldFillStyle=ctx.fillStyle;if(mode==0){mode=2;ctx.fillStyle=this.TextColor;}
if(!otr.IsUnitTrans||this.TextRotation!=0){ctx.setTransform(1,0,0,1,0,0);ctx.scale(this.ContextScale,this.ContextScale);ctx.translate(x,y);ctx.scale(ctr.ScaleX,ctr.ScaleY);ctx.transform(otr.a00,otr.a10,otr.a01,otr.a11,0,0);ctx.scale(1/ctr.ScaleX,1/ctr.ScaleY);ctx.rotate(this.AngleToRad(this.TextRotation));x=y=0;}
var box=this.WorkRect;this.GetCanvasTextSize(txt,box);box.w+=2*this.CanvasTextHPad;box.h+=2*this.CanvasTextVPad;if(this.TextHAlign=='left')x+=box.w/2;if(this.TextHAlign=='right')x-=box.w/2;if(this.TextVAlign=='top')y+=box.h/2;if(this.TextVAlign=='bottom')y-=box.h/2;if(mode&2){ctx.fillText(txt,x,y);}
if(mode&1){ctx.strokeText(txt,x,y);}
if(!otr.IsUnitTrans||this.TextRotation!=0){ctx.setTransform(1,0,0,1,0,0);ctx.scale(this.ContextScale,this.ContextScale);}
ctx.fillStyle=oldFillStyle;}
JsGraph.prototype.GetCanvasTextSize=function(txt,box){this.SetCanvasFont();var data=this.Context2D.measureText(txt);box.SetSize(data.width,this.CanvasFontSize);}
JsGraph.prototype.GetCanvasTextBox=function(txt,x,y,box){this.GetCanvasTextSize(txt,box);box.SetPos(x,y);box.w+=2*this.CanvasTextHPad;box.h+=2*this.CanvasTextVPad;var hAlign=this.TextHAlign;if(hAlign=='justify')hAlign='center';var vAlign=this.TextVAlign;if(hAlign=='center')box.x-=box.w/2;if(hAlign=='right')box.x-=box.w;if(vAlign=='middle')box.y-=box.h/2;if(vAlign=='bottom')box.y-=box.h;}
JsGraph.prototype.SetCanvasFont=function(){if(!this.TextCanvasRendering||this.CTextCurrFontVers==this.CTextLastFontVers)return;this.CTextLastFontVers=this.CTextCurrFontVers;var ctx=this.Context2D;var attr='';if(this.FontStyle=='italic')attr+='italic ';if(this.FontWeight=='bold')attr+='bold ';attr+=this.CanvasFontSize+'px ';if(this.CanvasLineHeight>0)attr+='/ '+this.CanvasLineHeight+'px ';if(this.CanvasLineHeight==0)attr+='/ 100% ';attr+=this.TextFont;ctx.font=attr;ctx.textBaseline='middle';ctx.textAlign='center';}
JsGraph.prototype.StartXright=function(x,dx,winBorderLeft){if(x<winBorderLeft){x=Math.floor(winBorderLeft/dx)*dx;if(x<winBorderLeft)x+=dx;}
return x;}
JsGraph.prototype.StartXleft=function(x,dx,winBorderRight){if(x>winBorderRight){x=-Math.floor(-winBorderRight/dx)*dx;if(x>winBorderRight)x-=dx;}
return x;}
JsGraph.prototype.StartYup=function(y,dy,winBorderBottom){if(y<winBorderBottom){y=Math.floor(winBorderBottom/dy)*dy;if(y<winBorderBottom)y+=dy;}
return y;}
JsGraph.prototype.StartYdown=function(y,dy,winBorderTop){if(y>winBorderTop){y=-Math.floor(-winBorderTop/dy)*dy;if(y>winBorderTop)y-=dy;}
return y;}
JsGraph.prototype.Frame=function(mode){mode=xDefNum(mode,1);var oldTrans=this.SelectTrans('viewport');var oldObjTransEnable=this.ObjTrans.Enable(false);var oldLineJoin=this.LineJoin;var lwh=this.Context2D.lineWidth/2-0.5;this.SetLineJoin('miter');this.Rect(lwh,lwh,this.VpInnerWidth-lwh,this.VpInnerHeight-lwh,mode);this.SetLineJoin(oldLineJoin);this.ObjTrans.Enable(oldObjTransEnable);this.SelectTrans(oldTrans);}
JsGraph.prototype.GetFrame=function(){var rect=this.GetFrameRect();return{xmin:rect.x,ymin:rect.y,xmax:rect.x+rect.w,ymax:rect.y+rect.h};}
JsGraph.prototype.GetFrameRect=function(){var rect=this.GetTransRect();if(this.Trans=='viewport'){rect.w=this.VpInnerWidth;rect.h=this.VpInnerHeight;}
return rect;}
JsGraph.prototype.GetTransRect=function(aTrans){if(!xStr(aTrans)||!this.TransByName[aTrans])aTrans=this.Trans;var trans=this.TransByName[aTrans];return new JsgRect(trans.Xmin,trans.Ymin,trans.Width,trans.Height);}
JsGraph.prototype.GetCanvasRect=function(){return new JsgRect(0,0,this.CanvasWidth,this.CanvasHeight);}
JsGraph.prototype.GetViewportRect=function(){var xmin=Math.floor(this.VpXmin);var ymin=Math.floor(this.VpYmin);var xmax=Math.floor(this.VpXmin+this.VpWidth+0.9999);var ymax=Math.floor(this.VpYmin+this.VpHeight+0.9999);return new JsgRect(xmin,ymin,xmax-xmin,ymax-ymin);}
JsGraph.prototype.GetViewportDeviceRect=function(box){var xmin=Math.floor(this.VpXmin*this.DevicePixelRatio);var ymin=Math.floor(this.VpYmin*this.DevicePixelRatio);var xmax=Math.floor((this.VpXmin+this.VpWidth)*this.DevicePixelRatio+0.9999);var ymax=Math.floor((this.VpYmin+this.VpHeight)*this.DevicePixelRatio+0.9999);return new JsgRect(xmin,ymin,xmax-xmin,ymax-ymin);}
JsGraph.prototype.Grid=function(xTic,yTic,skipZero,skipLimit){this.GridX(xTic,skipZero,skipLimit);this.GridY(yTic,skipZero,skipLimit);}
JsGraph.prototype.GridX=function(dx,skipZero,skipLimit){dx=xDefNum(dx,1);if(dx<=0)return;skipZero=xDefBool(skipZero,true);skipLimit=xDefBool(skipLimit,false);var ctr=this.CurrTrans;var box=this.GetFrame();var ctx=this.Context2D;var deviceLineSpacing=(Math.abs(ctr.ScaleX*dx)-ctx.lineWidth)*this.DevicePixelRatio;if(deviceLineSpacing<1)return;var cnvsYmin=ctr.TransY(box.ymin);var cnvsYmax=ctr.TransY(box.ymax);if(box.xmin>box.xmax){var tmp=box.xmin;box.xmin=box.xmax;box.xmax=tmp;}
var epsX=1.0/Math.abs(ctr.ScaleX);ctx.beginPath();if(box.xmax>=0){var x=this.StartXright(((skipZero)?dx:0),dx,box.xmin);var xEnd=box.xmax+epsX;if(skipLimit)xEnd-=dx;while(x<=xEnd){var cnvsX=ctr.TransX(x);ctx.moveTo(cnvsX,cnvsYmin);ctx.lineTo(cnvsX,cnvsYmax);x+=dx;}}
if(box.xmin<=0){var x=this.StartXleft(-dx,dx,box.xmax);var xEnd=box.xmin-epsX;if(skipLimit)xEnd+=dx;while(x>=xEnd){var cnvsX=ctr.TransX(x);ctx.moveTo(cnvsX,cnvsYmin);ctx.lineTo(cnvsX,cnvsYmax);x-=dx;}}
var oldCap=ctx.lineCap;ctx.lineCap='butt';ctx.stroke();ctx.lineCap=oldCap;}
JsGraph.prototype.GridY=function(dy,skipZero,skipLimit){dy=xDefNum(dy,1);if(dy<=0)return;skipZero=xDefBool(skipZero,true);skipLimit=xDefBool(skipLimit,false);var ctr=this.CurrTrans;var box=this.GetFrame();var ctx=this.Context2D;var deviceLineSpacing=(Math.abs(ctr.ScaleY*dy)-ctx.lineWidth)*this.DevicePixelRatio;if(deviceLineSpacing<1)return;var cnvsXmin=ctr.TransX(box.xmin);var cnvsXmax=ctr.TransX(box.xmax);if(box.ymin>box.ymax){var tmp=box.ymin;box.ymin=box.ymax;box.ymax=tmp;}
var epsY=1.0/Math.abs(ctr.ScaleY);ctx.beginPath();if(box.ymax>=0){var y=this.StartYup(((skipZero)?dy:0),dy,box.ymin);var yEnd=box.ymax+epsY;if(skipLimit)yEnd-=dy;while(y<=yEnd){var cnvsY=ctr.TransY(y);ctx.moveTo(cnvsXmin,cnvsY);ctx.lineTo(cnvsXmax,cnvsY);y+=dy;}}
if(box.ymin<=0){var y=this.StartYdown(-dy,dy,box.ymax);var yEnd=box.ymin-epsY;if(skipLimit)yEnd+=dy;while(y>=yEnd){var cnvsY=ctr.TransY(y);ctx.moveTo(cnvsXmin,cnvsY);ctx.lineTo(cnvsXmax,cnvsY);y-=dy;}}
var oldCap=ctx.lineCap;ctx.lineCap='butt';ctx.stroke();ctx.lineCap=oldCap;}
JsGraph.prototype.Axes=function(xPos,yPos,ArrowSymbol,ArrowSize){this.AxesX(yPos,ArrowSymbol,ArrowSize);this.AxesY(xPos,ArrowSymbol,ArrowSize);}
JsGraph.prototype.AxesX=function(yPos,ArrowSymbol,ArrowSize){yPos=xDefNum(yPos,0);ArrowSymbol=xDefStr(ArrowSymbol,'');ArrowSize=xDefNum(ArrowSize,8);var box=this.GetFrame();var xMin=box.xmin;var xMax=box.xmax;if(xMin>xMax){var tmp=xMin;xMin=xMax;xMax=tmp;}
var yMin=box.ymin;var yMax=box.ymax;if(yMin>yMax){var tmp=yMin;yMin=yMax;yMax=tmp;}
var ctx=this.Context2D;var oldCap=ctx.lineCap;var oldObjTransEnable=this.ObjTrans.Enable(false);ctx.lineCap='butt';if(yPos>=yMin&&yPos<=yMax){if(ArrowSymbol!=''){this.SetMarkerSymbol(ArrowSymbol);this.SetMarkerSize(ArrowSize);this.Arrow(xMin,yPos,xMax,yPos,9);}else{this.Line(xMin,yPos,xMax,yPos);}}
ctx.lineCap=oldCap;this.ObjTrans.Enable(oldObjTransEnable);}
JsGraph.prototype.AxesY=function(xPos,ArrowSymbol,ArrowSize){xPos=xDefNum(xPos,0);ArrowSymbol=xDefStr(ArrowSymbol,'');ArrowSize=xDefNum(ArrowSize,8);var box=this.GetFrame();var xMin=box.xmin;var xMax=box.xmax;if(xMin>xMax){var tmp=xMin;xMin=xMax;xMax=tmp;}
var yMin=box.ymin;var yMax=box.ymax;if(yMin>yMax){var tmp=yMin;yMin=yMax;yMax=tmp;}
var ctx=this.Context2D;var oldCap=ctx.lineCap;var oldObjTransEnable=this.ObjTrans.Enable(false);ctx.lineCap='butt';if(xPos>=xMin&&xPos<=xMax){if(ArrowSymbol!=''){this.SetMarkerSymbol(ArrowSymbol);this.SetMarkerSize(ArrowSize);this.Arrow(xPos,yMin,xPos,yMax,9);}else{this.Line(xPos,yMin,xPos,yMax);}}
ctx.lineCap=oldCap;this.ObjTrans.Enable(oldObjTransEnable);}
JsGraph.prototype.TicsX=function(yPos,dx,ticUp,ticDown,skipZero,skipLimit){yPos=xDefNum(yPos,0);dx=xDefNum(dx,1);if(dx<=0)return;ticUp=xDefNum(ticUp,3);ticDown=xDefNum(ticDown,ticUp);skipZero=xDefBool(skipZero,true);skipLimit=xDefBool(skipLimit,false);if(this.AutoScalePix){ticUp=this.ScalePix(ticUp,this.ScalePixInt);ticDown=this.ScalePix(ticDown,this.ScalePixInt);}
var ctr=this.CurrTrans;var box=this.GetFrame();var cnvsY=ctr.TransY(yPos);var ctx=this.Context2D;var deviceLineSpacing=(Math.abs(ctr.ScaleX*dx)-ctx.lineWidth)*this.DevicePixelRatio;if(deviceLineSpacing<1)return;if(box.xmin>box.xmax){var tmp=box.xmin;box.xmin=box.xmax;box.xmax=tmp;}
var epsX=1.0/Math.abs(ctr.ScaleX);ctx.beginPath();if(box.xmax>=0){var x=this.StartXright(((skipZero)?dx:0),dx,box.xmin);var xEnd=box.xmax+epsX;if(skipLimit)xEnd-=dx;while(x<=xEnd){var cnvsX=ctr.TransX(x);ctx.moveTo(cnvsX,cnvsY-ticUp);ctx.lineTo(cnvsX,cnvsY+ticDown);x+=dx;}}
if(box.xmin<=0){var x=this.StartXleft(-dx,dx,box.xmax);var xEnd=box.xmin-epsX;if(skipLimit)xEnd+=dx;while(x>=xEnd){var cnvsX=ctr.TransX(x);ctx.moveTo(cnvsX,cnvsY-ticUp);ctx.lineTo(cnvsX,cnvsY+ticDown);x-=dx;}}
var oldCap=ctx.lineCap;ctx.lineCap='butt';ctx.stroke();ctx.lineCap=oldCap;}
JsGraph.prototype.TicsY=function(xPos,dy,ticRight,ticLeft,skipZero,skipLimit){xPos=xDefNum(xPos,0);dy=xDefNum(dy,1);if(dy<=0)return;ticRight=xDefNum(ticRight,3);ticLeft=xDefNum(ticLeft,ticRight);skipZero=xDefBool(skipZero,true);skipLimit=xDefBool(skipLimit,false);if(this.AutoScalePix){ticRight=this.ScalePix(ticRight,this.ScalePixInt);ticLeft=this.ScalePix(ticLeft,this.ScalePixInt);}
var ctr=this.CurrTrans;var box=this.GetFrame();var cnvsX=ctr.TransX(xPos);var ctx=this.Context2D;var deviceLineSpacing=(Math.abs(ctr.ScaleY*dy)-ctx.lineWidth)*this.DevicePixelRatio;if(deviceLineSpacing<1)return;if(box.ymin>box.ymax){var tmp=box.ymin;box.ymin=box.ymax;box.ymax=tmp;}
var epsY=1.0/Math.abs(ctr.ScaleY);ctx.beginPath();if(box.ymax>=0){var y=this.StartYup(((skipZero)?dy:0),dy,box.ymin);var yEnd=box.ymax+epsY;if(skipLimit)yEnd-=dy;while(y<=yEnd){var cnvsY=ctr.TransY(y);ctx.moveTo(cnvsX-ticLeft,cnvsY);ctx.lineTo(cnvsX+ticRight,cnvsY);y+=dy;}}
if(box.ymin<=0){var y=this.StartYdown(-dy,dy,box.ymax);var yEnd=box.ymin-epsY;if(skipLimit)yEnd+=dy;while(y>=yEnd){var cnvsY=ctr.TransY(y);ctx.moveTo(cnvsX-ticLeft,cnvsY);ctx.lineTo(cnvsX+ticRight,cnvsY);y-=dy;}}
var oldCap=ctx.lineCap;ctx.lineCap='butt';ctx.stroke();ctx.lineCap=oldCap;}
JsGraph.prototype.MakeLabel=function(value,scale,digits,unit){var v=(value*scale).toFixed(digits);if(!xStr(unit)||unit=='')return v;if(unit.indexOf('(#)')<0)return v+unit;return unit.replace(/\(#\)/,v);}
JsGraph.prototype.TicLabelsX=function(yPos,dx,yOff,scale,digits,skipZero,skipLimit,aUnit){yPos=xDefNum(yPos,0);dx=xDefNum(dx,1);if(dx<=0)return;yOff=xDefNum(yOff,-4);scale=xDefNum(scale,1);digits=xDefNum(digits,0);skipZero=xDefBool(skipZero,true);skipLimit=xDefBool(skipLimit,true);aUnit=xDefStr(aUnit,'');if(this.AutoScalePix)yOff=this.ScalePix(yOff,this.ScalePixInt);var ctr=this.CurrTrans;var frame=this.GetFrame();var oldAlign=this.TextVAlign;var oldHPad=this.TextHPad;var oldVPad=this.TextVPad;this.SetTextVAlign(((yOff<0)?'top':'bottom'));this.SetTextPadding(0);if(frame.xmin>frame.xmax){var tmp=frame.xmin;frame.xmin=frame.xmax;frame.xmax=tmp;}
var epsX=1.0/Math.abs(ctr.ScaleX);var box=this.GetTextSize(this.MakeLabel(frame.xmin,scale,digits,aUnit)+'m');var maxw=box.w;box=this.GetTextSize(this.MakeLabel(frame.xmax,scale,digits,aUnit)+'m');if(box.w>maxw)maxw=box.w;var ddx=(Math.floor(maxw/dx)+1)*dx;var oldObjTransEnable=this.ObjTrans.Enable(false);var y=ctr.InvTransY(ctr.TransY(yPos)-yOff);if(frame.xmax>=0){var x=this.StartXright(((skipZero)?ddx:0),ddx,frame.xmin);var xEnd=frame.xmax+epsX;if(skipLimit)xEnd-=ddx;while(x<=xEnd){this.Text(this.MakeLabel(x,scale,digits,aUnit),x,y);x+=ddx;}}
if(frame.xmin<=0){var x=this.StartXleft(-ddx,ddx,frame.xmax);var xEnd=frame.xmin-epsX;if(skipLimit)xEnd+=ddx;while(x>=xEnd){this.Text(this.MakeLabel(x,scale,digits,aUnit),x,y);x-=ddx;}}
this.SetTextVAlign(oldAlign);this.SetTextPadding(oldHPad,oldVPad);this.ObjTrans.Enable(oldObjTransEnable);}
JsGraph.prototype.TicLabelsY=function(xPos,dy,xOff,scale,digits,skipZero,skipLimit,aUnit){xPos=xDefNum(xPos,0);dy=xDefNum(dy,1);if(dy<=0)return;xOff=xDefNum(xOff,-4);scale=xDefNum(scale,1);digits=xDefNum(digits,0);skipZero=xDefBool(skipZero,true);skipLimit=xDefBool(skipLimit,true);aUnit=xDefStr(aUnit,'');if(this.AutoScalePix)xOff=this.ScalePix(xOff,this.ScalePixInt);var ctr=this.CurrTrans;var frame=this.GetFrame();var oldAlign=this.TextHAlign;var oldHPad=this.TextHPad;var oldVPad=this.TextVPad;this.SetTextHAlign(((xOff<0)?'right':'left'));this.SetTextPadding(0);if(frame.ymin>frame.ymax){var tmp=frame.ymin;frame.ymin=frame.ymax;frame.ymax=tmp;}
var epsY=1.0/Math.abs(ctr.ScaleY);var box=this.GetTextSize(this.MakeLabel(frame.ymax,scale,digits,aUnit));var maxh=box.h;var ddy=(Math.floor(maxh/dy)+1)*dy;var oldObjTransEnable=this.ObjTrans.Enable(false);var x=ctr.InvTransX(ctr.TransX(xPos)+xOff);if(frame.ymax>=0){var y=this.StartYup(((skipZero)?ddy:0),ddy,frame.ymin);var yEnd=frame.ymax+epsY;if(skipLimit)yEnd-=ddy;while(y<=yEnd){this.Text(this.MakeLabel(y,scale,digits,aUnit),x,y);y+=ddy;}}
if(frame.ymin<=0){var y=this.StartYdown(-ddy,ddy,frame.ymax);var yEnd=frame.ymin-epsY;if(skipLimit)yEnd+=ddy;while(y>=yEnd){this.Text(this.MakeLabel(y,scale,digits,aUnit),x,y);y-=ddy;}}
this.SetTextHAlign(oldAlign);this.SetTextPadding(oldHPad,oldVPad);this.ObjTrans.Enable(oldObjTransEnable);}
JsGraph.prototype.MakeMarkers=function(){this.MarkerName=['ArrowLeft','ArrowRight','ArrowDown','ArrowUp','Circle','Square','Diamond','Triangle','Triangle2','Star4','Star5','Star6','Plus','Cross','Star','Arrow1','Arrow2'];this.Markers={ArrowLeft:[{type:'Polygon',x:[0,1,1],y:[0,0.5,-0.5]}],ArrowRight:[{type:'Polygon',x:[0,-1,-1],y:[0,-0.5,0.5]}],ArrowDown:[{type:'Polygon',x:[0,0.5,-0.5],y:[0,-1,-1]}],ArrowUp:[{type:'Polygon',x:[0,-0.5,0.5],y:[0,1,1]}],Circle:[{type:'Circle',x:0,y:0,r:-0.5}],Square:[{type:'Polygon',x:[-0.5,0.5,0.5,-0.5],y:[0.5,0.5,-0.5,-0.5]}],Diamond:[{type:'Polygon',x:[0,0.5,0,-0.5],y:[0.5,0,-0.5,0]}],Triangle:[{type:'Polygon',x:[-0.5,0.5,0],y:[0.289,0.289,-0.577]}],Triangle2:[{type:'Polygon',x:[0,0.5,-0.5],y:[0.577,-0.289,-0.289]}],Star4:[{type:'Polygon',x:[0.5,0.125,0,-0.125,-0.5,-0.125,0,0.125],y:[0,-0.125,-0.5,-0.125,0,0.125,0.5,0.125]}],Star5:[{type:'Polygon',x:[0,-0.112,-0.433,-0.182,-0.294,0,0.294,0.182,0.475,0.112],y:[-0.5,-0.155,-0.155,0.059,0.405,0.155,0.405,0.059,-0.155,-0.155]}],Star6:[{type:'Polygon',x:[0,-0.145,-0.433,-0.25,-0.433,-0.145,0,0.145,0.433,0.25,0.433,0.145],y:[-0.5,-0.25,-0.25,0,0.25,0.25,0.5,0.25,0.25,0,-0.25,-0.25]}],Plus:[{type:'Line',x1:-0.5,y1:0,x2:0.5,y2:0},{type:'Line',x1:0,y1:-0.5,x2:0,y2:0.5}],Cross:[{type:'Line',x1:-0.5,y1:0.5,x2:0.5,y2:-0.5},{type:'Line',x1:-0.5,y1:-0.5,x2:0.5,y2:0.5}],Star:[{type:'Line',x1:-0.5,y1:0,x2:0.5,y2:0},{type:'Line',x1:-0.25,y1:-0.433,x2:0.25,y2:0.433},{type:'Line',x1:-0.25,y1:0.433,x2:0.25,y2:-0.433}],Arrow1:[{type:'Polygon',x:[0,-1.5,-1.5],y:[0,-0.375,0.375]}],Arrow2:[{type:'Polygon',x:[0,-1.5,-1.25,-1.5],y:[0,-0.375,0,0.375]}]};}
JsGraph.prototype.ScaleAndMovePoly=function(poly,scale,moveX,moveY){var len=poly.Size;for(var i=0;i<len;i++){poly.X[i]=poly.X[i]*scale+moveX;poly.Y[i]=poly.Y[i]*scale+moveY;}}
JsGraph.prototype.ScaleAndMoveCoord=function(coord,scale,move){return coord*scale+move;}
JsGraph.prototype.Marker=function(x,y,mode,mat,size){if(JsgPolygon.Ok(x))return this.Marker(x.X,x.Y,y,mode,x.Size);if(xArray(x)&&xArray(y)){size=xDefNum(size,x.length);for(var i=0;i<size;i++){this.Marker(x[i],y[i],mode,mat);}
return this;}
if(JsgVect2.Ok(x))return this.Marker(x[0],x[1],y,mode);mode=xDefNum(mode,3);var ctr=this.CurrTrans;var otr=this.ObjTrans;ctr.ObjTransXY(this.GetObjTrans(),x,y);var oldTrans=this.SelectTrans('canvas');var oldObjTransEnable=otr.Enable(false);var symbol=this.Markers[this.MarkerSymbol];var ix=0;var deltaIx=1;var inverse=false;if(mode&4){ix=symbol.length-1;deltaIx=-1;inverse=true;}
var drawMode=mode&3;for(var i=0;i<symbol.length;i++){var element=symbol[ix];if(element.type=='Polygon'){var poly=this.WorkPoly.Reset();var len=element.x.length;for(var j=0;j<len;j++)poly.AddPoint(element.x[j],element.y[j]);if(JsgMat2.Ok(mat)){JsgMat2.TransPolyXY(mat,poly.X,poly.Y,poly.Size);}
this.ScaleAndMovePoly(poly,this.DriverMarkerSize,ctr.x,ctr.y);if(inverse)poly.Invert();this.Polygon(poly,drawMode+4);}
else if(element.type=='Line'){var poly=this.WorkPoly.Reset();poly.AddPoint(element.x1,element.y1);poly.AddPoint(element.x2,element.y2);if(JsgMat2.Ok(mat)){JsgMat2.TransPolyXY(mat,poly.X,poly.Y,poly.Size);}
this.ScaleAndMovePoly(poly,this.DriverMarkerSize,ctr.x,ctr.y);this.Line(poly.X[0],poly.Y[0],poly.X[1],poly.Y[1]);}
else if(element.type=='Circle'){var cx=this.ScaleAndMoveCoord(element.x,this.DriverMarkerSize,ctr.x);var cy=this.ScaleAndMoveCoord(element.y,this.DriverMarkerSize,ctr.y);var cr=element.r*this.DriverMarkerSize;if(inverse)cr*=-1;this.Circle(cx,cy,cr,drawMode);}
ix+=deltaIx;}
otr.Enable(oldObjTransEnable);this.SelectTrans(oldTrans);return this;}
function JsgHtmlTextHandler(clippingDiv,canvas,context2d){this.ClippingDiv=clippingDiv;this.Canvas=canvas;this.Context2D=context2d;this.TextHAlign='left';this.TextVAlign='top';this.TextHPad=0;this.TextVPad=0;this.WorkRect=new JsgRect(0,0,0,0);this.Text=[];this.Cache=[];this.CachePtr=0;this.TextClass='';this.TextStyles=this.NewTextStyles();}
JsgHtmlTextHandler.AppliedTextStyles='color fontFamily fontSize fontStyle fontWeight lineHeight textAlign'.split(' ');JsgHtmlTextHandler.prototype.NewTextStyles=function(from){var styles={};var styleNames=JsgHtmlTextHandler.AppliedTextStyles;for(var i=0;i<styleNames.length;i++){styles[styleNames[i]]='';}
if(xObj(from))this.CopyTextStyles(from,styles);return styles;}
JsgHtmlTextHandler.prototype.CopyTextStyles=function(src,dest){var styleNames=JsgHtmlTextHandler.AppliedTextStyles;for(var i=0;i<styleNames.length;i++){var name=styleNames[i];if(src[name]!='')dest[name]=src[name];}}
JsgHtmlTextHandler.prototype.SameTextStyles=function(styles1,styles2){var styleNames=JsgHtmlTextHandler.AppliedTextStyles;for(var i=0;i<styleNames.length;i++){var name=styleNames[i];if(styles1[name]!=styles2[name])return false;}
return true;}
JsgHtmlTextHandler.prototype.Clear=function(){for(var i=0;i<this.Text.length;i++){this.ClippingDiv.removeChild(this.Text[i]);}
this.Text=[];this.ResetCache();}
JsgHtmlTextHandler.prototype.ClearCache=function(){this.Cache=[];this.CachePtr=0;}
JsgHtmlTextHandler.prototype.ResetCache=function(){this.CachePtr=0;}
JsgHtmlTextHandler.prototype.FindTextSizeInCache=function(s,textClass,styles,aw,box){if(this.CachePtr>=this.Cache.length)return false;aw=xDefNum(aw,-1);var c=this.Cache[this.CachePtr];if(c.Text==s&&c.TextClass==textClass&&this.SameTextStyles(c.Styles,styles)&&c.ArgWidth==aw){this.CachePtr++;box.SetSize(c.Width,c.Height);return true;}
this.ClearCache();return false;}
JsgHtmlTextHandler.prototype.AddToCache=function(s,textClass,styles,aw,width,height){var stylesCopy=this.NewTextStyles(styles);aw=xDefNum(aw,-1);this.Cache.push({Text:s,TextClass:textClass,Styles:stylesCopy,ArgWidth:aw,Width:width,Height:height});this.CachePtr++;}
JsgHtmlTextHandler.prototype.CreateTextNode=function(s,w){var txt=document.createElement('div');this.CopyTextStyles(this.TextStyles,txt.style)
if(this.TextClass==''){txt.style.margin='0';txt.style.padding='0';}else{txt.className=this.TextClass;}
txt.style.position='absolute';txt.style.boxSizing='border-box';if(w>0)txt.style.width=w+'px';txt.innerHTML=s;return txt;}
JsgHtmlTextHandler.prototype.GetTextSize=function(s,w,box){if(this.FindTextSizeInCache(s,this.TextClass,this.TextStyles,w,box))return;var txtNode=this.CreateTextNode(s,w);txtNode.style.visibility='hidden';this.ClippingDiv.appendChild(txtNode);box.SetSize(txtNode.offsetWidth,txtNode.offsetHeight);this.ClippingDiv.removeChild(txtNode);this.AddToCache(s,this.TextClass,this.TextStyles,w,box.w,box.h);}
JsgHtmlTextHandler.prototype.GetTextBox=function(s,x,y,w,box){return this.HandleText(0,s,x,y,w,box);}
JsgHtmlTextHandler.prototype.DrawText=function(s,x,y,w){this.HandleText(1,s,x,y,w,this.WorkRect);}
JsgHtmlTextHandler.prototype.HandleText=function(mode,s,x,y,w,box){this.GetTextSize(s,w,box);box.w+=2*this.TextHPad;box.h+=2*this.TextVPad;var top=y;var left=x;var padleft=this.TextHPad;var padright=this.TextHPad;if(this.TextHAlign=='center')left-=box.w/2;if(this.TextHAlign=='right')left-=box.w;if(this.TextVAlign=='middle')top-=box.h/2;if(this.TextVAlign=='bottom')top-=box.h;if(w==0){var cw=this.ClippingDiv.offsetWidth;var right=left+box.w;var newleft=left;var newright=right;var borderCrossed=false;if(left<0&&right>0){padleft=this.TextHPad+left;if(padleft<0)padleft=0;newleft=0;borderCrossed=true;}
if(left<cw&&right>cw){padright-=right-cw;if(padright<0)padright=0;newright=cw;borderCrossed=true;}
if(borderCrossed&&newright>0&&newleft<cw){w=newright-newleft-padleft-padright;if(w<0)w=0;}
if(w>0){var top=y;var left=newleft;this.GetTextSize(s,w,box);box.w+=padleft+padright;box.h+=2*this.TextVPad;if(this.TextVAlign=='middle')top-=box.h/2;if(this.TextVAlign=='bottom')top-=box.h;}}
box.SetPos(left,top);if(mode==1){var txtNode=this.CreateTextNode(s,w);txtNode.style.left=left+padleft+'px';txtNode.style.top=top+this.TextVPad+'px';this.ClippingDiv.appendChild(txtNode);this.Text.push(txtNode);}}
function JsgPolyListIter(polys){polys=xDefObjOrNull(polys,null);this.Reset(polys);}
JsgPolyListIter.prototype.Reset=function(polys){this.CurrPolyIx=-1;this.CurrPointIx=-1;if(JsgPolygonList.Ok(polys)){this.Poly=null;this.PolyList=polys;}else if(JsgPolygon.Ok(polys)){this.Poly=polys;this.PolyList=null;}
if(this.PolyList&&this.PolyList.Size>0){this.CurrPolyIx=0;this.Poly=polys.PolyList[0];}
return this;}
JsgPolyListIter.prototype.GetNextPoint=function(p){var poly=this.Poly;if(!poly)return false;this.CurrPointIx++;if(this.PolyList){if(this.CurrPointIx>=poly.Size){this.CurrPolyIx++;if(this.CurrPolyIx>=this.PolyList.Size)return false;this.Poly=this.PolyList.PolyList[this.CurrPolyIx];this.CurrPointIx=-1;return this.GetNextPoint(p);}}else{if(this.CurrPointIx>=poly.Size)return false;}
var i=this.CurrPointIx;JsgVect3.Set(p,poly.X[i],poly.Y[i],poly.Z[i]);return true;}
JsgPolyListIter.prototype.Back=function(){this.CurrPointIx--;}
var JsgVect3={New:function(x,y,z){return[x,y,z];},Null:function(){return[0,0,0];},Ok:function(vec){return xArray(vec)&&(vec.length==3);},Reset:function(vec){vec[0]=0;vec[1]=0;vec[2]=0;return vec;},Set:function(vec,x,y,z){vec[0]=x;vec[1]=y;vec[2]=z;return vec;},Copy:function(src){return[src[0],src[1],src[2]];},CopyTo:function(src,dest){dest[0]=src[0];dest[1]=src[1];dest[2]=src[2];return dest;},FromAngle:function(aHAng,aVAng,aDist){aVAng*=Math.PI/180;aHAng*=Math.PI/180;var z=aDist*Math.sin(aVAng);var a=aDist*Math.cos(aVAng);var x=a*Math.cos(aHAng);var y=a*Math.sin(aHAng);return[x,y,z];},Scale:function(v,s){return[v[0]*s,v[1]*s,v[2]*s];},ScaleTo:function(v,s){v[0]*=s;v[1]*=s;v[2]*=s;return v;},Length2:function(v){return v[0]*v[0]+v[1]*v[1]+v[2]*v[2];},Length:function(v){return Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]);},Norm:function(v){var s=this.Length(v);if(s==0.0){return[v[0],v[1],v[2]];}else{return[v[0]/s,v[1]/s,v[2]/s];}},NormTo:function(v){var s=this.Length(v);if(s!=0.0)this.ScaleTo(v,1/s);return v;},Add:function(a,b){return[a[0]+b[0],a[1]+b[1],a[2]+b[2]];},AddTo:function(a,b){a[0]+=b[0];a[1]+=b[1];a[2]+=b[2];return a;},Sub:function(a,b){return[a[0]-b[0],a[1]-b[1],a[2]-b[2]];},SubFrom:function(a,b){a[0]-=b[0];a[1]-=b[1];a[2]-=b[2];return a;},ScalarProd:function(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];},Mult:function(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];},MultTo:function(v,a,b){v[0]=a[1]*b[2]-a[2]*b[1];v[1]=a[2]*b[0]-a[0]*b[2];v[2]=a[0]*b[1]-a[1]*b[0];return v;},};var JsgVect3List={Ok:function(obj){if(!xArray(obj))return false;if(obj.length==0)return true;return JsgVect3.Ok(obj[0]);},ToPoly2D:function(vl,poly){poly=poly||new JsgPolygon();poly.Reset();var len=vl.length;for(var i=0;i<len;i++){var v=vl[i];poly.AddPoint(v[0],v[1]);}
return poly;},};var JsgVect3Grid={Ok:function(obj){if(!xArray(obj))return false;if(obj.length==0)return true;return JsgVect3List.Ok(obj[0]);},};var JsgMat3={Zero:function(){return[[0,0,0,0],[0,0,0,0],[0,0,0,0]];},Unit:function(){return[[1,0,0,0],[0,1,0,0],[0,0,1,0]];},FromVect:function(v1,v2,v3){return[[v1[0],v1[1],v1[2],0],[v2[0],v2[1],v2[2],0],[v3[0],v3[1],v3[2],0]];},Moving:function(x,y,z,m){var r=[[1,0,0,x],[0,1,0,y],[0,0,1,z]];if(m)r=this.Mult(r,m);return r;},Scaling:function(sx,sy,sz,m){var r=[[sx,0,0,0],[0,sy,0,0],[0,0,sz,0]];if(m)r=this.Mult(r,m);return r;},RotatingX:function(aAngle,m){var c=Math.cos(aAngle),s=Math.sin(aAngle);var r=[[1,0,0,0],[0,c,-s,0],[0,s,c,0]];if(m)r=this.Mult(r,m);return r;},RotatingY:function(aAngle,m){var c=Math.cos(aAngle),s=Math.sin(aAngle);var r=[[c,0,s,0],[0,1,0,0],[-s,0,c,0]];if(m)r=this.Mult(r,m);return r;},RotatingZ:function(aAngle,m){var c=Math.cos(aAngle),s=Math.sin(aAngle);var r=[[c,-s,0,0],[s,c,0,0],[0,0,1,0]];if(m)r=this.Mult(r,m);return r;},Copy:function(m){return[[m[0][0],m[0][1],m[0][2],m[0][3]],[m[1][0],m[1][1],m[1][2],m[1][3]],[m[2][0],m[2][1],m[2][2],m[2][3]]];},CopyTo:function(src,dest){for(var row=0;row<3;row++){for(var col=0;col<4;col++){dest[row][col]=src[row][col];}}
return dest;},Mult:function(a,b){return this.MultTo(a,b,this.Zero());},MultTo:function(a,b,to){for(var i=0;i<3;i++){for(var j=0;j<3;j++){to[i][j]=a[i][0]*b[0][j]+a[i][1]*b[1][j]+a[i][2]*b[2][j];}
to[i][3]=a[i][0]*b[0][3]+a[i][1]*b[1][3]+a[i][2]*b[2][3]+a[i][3];}
return to;},Trans:function(m,v){return this.TransTo(m,v,JsgVect3.Null());},TransTo:function(m,v,to){to=to||v;return this.TransXYZTo(m,v[0],v[1],v[2],to)},TransXYZTo:function(m,x,y,z,to){to[0]=m[0][0]*x+m[0][1]*y+m[0][2]*z+m[0][3];to[1]=m[1][0]*x+m[1][1]*y+m[1][2]*z+m[1][3];to[2]=m[2][0]*x+m[2][1]*y+m[2][2]*z+m[2][3];return to;},TransList:function(m,vl){var rl=[],len=vl.length;for(var i=0;i<len;i++){rl.push(this.Trans(m,vl[i]));}
return rl;},TransGrid:function(m,vg){var rg=[],len=vg.length;for(var i=0;i<len;i++){rg.push(this.TransList(m,vg[i]));}
return rg;},};function JsgCamera(){this.WorkPoint=JsgVect3.Null();this.WorkPoint2=JsgVect3.Null();this.ResultPoly=new JsgPolygon(true,'JsgCamera.ResultPoly');this.Reset();}
JsgCamera.prototype.Reset=function(){this.Zoom=1;this.SceneSize=2;this.ScreenSize=1;this.ObjectZExtend=0;this.CamViewCenter=JsgVect3.Null();this.CamPos=JsgVect3.New(100,0,0);this.CamUp=JsgVect3.New(0,0,1);this.Update();}
JsgCamera.prototype.Update=function(){var vVect=JsgVect3.Sub(this.CamViewCenter,this.CamPos);this.ViewCenterDist=JsgVect3.Length(vVect);if(this.ViewCenterDist==0){this.CamPos=JsgVect3.Add(this.CamViewCenter,[1,0,0]);this.ViewCenterDist=1;vVect=[-1,0,0];}
this.ViewDir=JsgVect3.Norm(vVect);var xVect=JsgVect3.Scale(this.ViewDir,-1);var zVect=JsgVect3.Norm(this.CamUp);if(JsgVect3.Length2(zVect)==0){zVect=[0,0,1];}
var yVect=JsgVect3.Norm(JsgVect3.Mult(zVect,xVect));if(JsgVect3.Length2(yVect)==0){this.CamUp=JsgMat3.Trans(JsgMat3.FromVect([0,0,1],[0,0,0],[1,1,0]),this.CamUp);this.Update();return;}
zVect=JsgVect3.Norm(JsgVect3.Mult(xVect,yVect));this.CamTrans=JsgMat3.FromVect(xVect,yVect,zVect);this.ScreenDist=1;if(this.SceneSize!=0){this.ScreenDist=(this.ScreenSize/this.SceneSize)*(this.ViewCenterDist-this.ObjectZExtend);}}
JsgCamera.prototype.Set=function(aParams){if(!xObj(aParams))return;if(xNum(aParams.SceneSize))this.SceneSize=aParams.SceneSize;if(xNum(aParams.ScreenSize))this.ScreenSize=aParams.ScreenSize;if(xNum(aParams.ObjectZExtend))this.ObjectZExtend=aParams.ObjectZExtend;if(xNum(aParams.Zoom))this.Zoom=aParams.Zoom;if(JsgVect3.Ok(aParams.CamViewCenter))this.CamViewCenter=aParams.CamViewCenter;if(JsgVect3.Ok(aParams.CamUp))this.CamUp=aParams.CamUp;if(JsgVect3.Ok(aParams.CamPos))this.CamPos=aParams.CamPos;this.SetAngle(aParams.CamHAng,aParams.CamVAng,aParams.CamDist);this.Update();}
JsgCamera.prototype.SetAngle=function(aHAng,aVAng,aDist){if(xNum(aHAng)||xNum(aVAng)){var hAng=xDefNum(aHAng,0);var vAng=xDefNum(aVAng,0);var vVect=JsgVect3.Sub(this.CamViewCenter,this.CamPos);var dist=JsgVect3.Length(vVect);if(xNum(aDist))dist=aDist;this.CamPos=JsgVect3.Add(this.CamViewCenter,JsgVect3.FromAngle(hAng,vAng,dist));}}
JsgCamera.prototype.Save=function(aParams){var par=xDefObj(aParams,{});par.SceneSize=this.SceneSize;par.ScreenSize=this.ScreenSize;par.ObjectZExtend=this.ObjectZExtend;par.CamViewCenter=this.CamViewCenter;par.CamUp=this.CamUp;par.CamPos=this.CamPos;par.Zoom=this.Zoom;return par;}
JsgCamera.prototype.SetScale=function(aSceneSize,aScreenSize,aObjectZExtend,aZoom){if(xNum(aSceneSize))this.SceneSize=aSceneSize;if(xNum(aScreenSize))this.ScreenSize=aScreenSize;if(xNum(aObjectZExtend))this.ObjectZExtend=aObjectZExtend;if(xNum(aZoom))this.Zoom=aZoom;this.Update();}
JsgCamera.prototype.SetPos=function(aPos,aViewCenter,aUp){if(JsgVect3.Ok(aPos))this.CamPos=aPos;if(JsgVect3.Ok(aViewCenter))this.CamViewCenter=aViewCenter;if(JsgVect3.Ok(aUp))this.CamUp=aUp;this.Update();}
JsgCamera.prototype.SetView=function(aViewCenter,aHAng,aVAng,aDist,aUp){if(JsgVect3.Ok(aViewCenter))this.CamViewCenter=aViewCenter;if(JsgVect3.Ok(aUp))this.CamUp=aUp;this.SetAngle(aHAng,aVAng,aDist);this.Update();}
JsgCamera.prototype.SetZoom=function(aZoom){this.Zoom=xDefNum(aZoom,1);}
JsgCamera.prototype.TransPoly=function(poly,transPolys){transPolys=transPolys||this.ResultPoly.Reset();var p=this.WorkPoint;var xs=poly.X;var ys=poly.Y;var zs=poly.Z;var f=this.ScreenDist;var zoom=this.Zoom;var size=poly.Size;for(var i=0;i<size;i++){JsgVect3.Set(p,xs[i],ys[i],zs[i]);JsgVect3.SubFrom(p,this.CamPos);JsgMat3.TransTo(this.CamTrans,p);var x=p[1];var y=p[2];var z=-p[0];if(z!=0){x*=f/z*zoom;y*=f/z*zoom;}
transPolys.AddPoint(x,y,z);}
return transPolys;}
JsgCamera.prototype.Trans=function(v){return this.TransTo(v[0],v[1],v[2],JsgVect3.Copy(v));}
JsgCamera.prototype.TransTo=function(x,y,z,v){v=v||this.WorkPoint;JsgVect3.Set(v,x,y,z);JsgMat3.TransTo(this.CamTrans,JsgVect3.SubFrom(v,this.CamPos));var f=this.ScreenDist;var x=v[1],y=v[2],z=-v[0];if(z!=0){x*=f/z*this.Zoom;y*=f/z*this.Zoom;}
v[0]=x;v[1]=y;v[2]=z;return v;}
JsgCamera.prototype.TransList=function(vl){var rl=[],len=vl.length;for(var i=0;i<len;i++)rl.push(this.Trans(vl[i]));return rl;}
JsgCamera.prototype.TransGrid=function(vg){var rg=[],len=vg.length;for(var i=0;i<len;i++)rg.push(this.TransList(vg[i]));return rg;}
JsgCamera.prototype.TransToPoly2D=function(vl,poly){return JsgVect3List.ToPoly2D(this.TransList(vl),poly);}
function JsgPlane(pos,xdir,ydir,normalize){this.WorkPoint=JsgVect3.Null();this.WorkPoint2=JsgVect3.Null();this.WorkPoint3=JsgVect3.Null();this.ExitPoint=JsgVect3.Null();this.EnterPoint=JsgVect3.Null();this.FirstEnterPoint=JsgVect3.Null();this.Result=JsgVect3.Null();this.ResultPoly=new JsgPolygon(true,'JsgPlane.ResultPoly');this.PolyIterator=new JsgPolyListIter();this.Set(pos,xdir,ydir,normalize);}
JsgPlane.Ok=function(obj){return xDef(obj)&&xDef(obj.Pos);}
JsgPlane.prototype.Set=function(pos,xdir,ydir,normalize){this.Pos=pos;this.XDir=xdir;this.YDir=ydir;this.Normal=JsgVect3.Null();if(normalize){this.Normalize();}else{this.CompNormal();}}
JsgPlane.prototype.Normalize=function(){var XdirNorm=JsgVect3.NormTo(this.XDir);var ZDir=JsgVect3.MultTo(this.WorkPoint,XdirNorm,this.YDir);JsgVect3.NormTo(JsgVect3.MultTo(this.YDir,ZDir,XdirNorm));this.CompNormal();return this;}
JsgPlane.prototype.CompNormal=function(){JsgVect3.MultTo(this.Normal,this.XDir,this.YDir);}
JsgPlane.prototype.Copy=function(normalize){return new JsgPlane(this.Pos,this.XDir,this.YDir,normalize);}
JsgPlane.prototype.PointOnPlane=function(x,y,v){if(JsgVect2.Ok(x)){return this.Point(x[0],x[1],y);}
v=v||this.Result;JsgVect3.CopyTo(this.Pos,v);JsgVect3.AddTo(v,JsgVect3.ScaleTo(JsgVect3.CopyTo(this.XDir,this.WorkPoint),x));JsgVect3.AddTo(v,JsgVect3.ScaleTo(JsgVect3.CopyTo(this.YDir,this.WorkPoint),y));return v;}
JsgPlane.prototype.PolygonOnPlane=function(xArray,yArray,size,planePoly){if(JsgPolygon.Ok(xArray)){return this.PolygonOnPlane(xArray.X,xArray.Y,xArray.Size,yArray);}
planePoly=planePoly||this.ResultPoly;planePoly.Reset();size=xDefNum(size,xArray.length);for(var i=0;i<size;i++){var p=this.PointOnPlane(xArray[i],yArray[i]);planePoly.AddPoint3D(p);}
return planePoly;}
JsgPlane.prototype.Polygon=function(xpoly,ypoly,size){if(JsgPolygon.Ok(xpoly)){return this.Polygon(xpoly.X,xpoly.Y,xpoly.Size);}
size=xDefNum(size,xpoly.length);var vl=[];for(var i=0;i<size;i++){vl.push(JsgVect3.Copy(this.Point(xpoly[i],ypoly[i])));}
return vl;}
JsgPlane.prototype.IntersectLine=function(p1,p2){var r=JsgVect3.SubFrom(JsgVect3.CopyTo(p2,this.Result),p1);var r3=JsgVect3.ScalarProd(r,this.Normal);if(r3==0){var tmp=p1;p1=p2;p2=tmp;r=JsgVect3.SubFrom(JsgVect3.CopyTo(p2,this.Result),p1);r3=JsgVect3.ScalarProd(r,this.Normal);if(r3==0){return null;}}
var pos_p1=JsgVect3.SubFrom(JsgVect3.CopyTo(p1,this.WorkPoint),this.Pos);var P3=JsgVect3.ScalarProd(pos_p1,this.Normal);var a=-P3/r3;return JsgVect3.AddTo(JsgVect3.ScaleTo(r,a),p1);}
JsgPlane.prototype.IsPoint3DOnTop=function(p){var pos_p=JsgVect3.SubFrom(JsgVect3.CopyTo(p,this.WorkPoint),this.Pos);return JsgVect3.ScalarProd(pos_p,this.Normal)>=0;}
JsgPlane.prototype.IsPointOnTop=function(x,y,z){JsgVect3.Set(this.WorkPoint,x,y,z);var pos_p=JsgVect3.SubFrom(this.WorkPoint,this.Pos);return JsgVect3.ScalarProd(pos_p,this.Normal)>=0;}
JsgPlane.prototype.ClipPoly=function(polys,clippedPolyList,interpolFunc,interpolData){clippedPolyList.Reset();if(JsgPolygonList.Ok(polys)){var size=polys.Size;for(var i=0;i<size;i++){this.Clip(polys.PolyList[i],clippedPolyList,false,interpolFunc,interpolData);}}else{this.Clip(polys,clippedPolyList,false,interpolFunc,interpolData);}}
JsgPlane.prototype.ClipArea=function(polys,clippedPolyList,interpolFunc,interpolData){clippedPolyList.Reset();clippedPolyList.NewPoly();if(JsgPolygonList.Ok(polys)&&polys.Size>1){var mainPoly=polys.PolyList[0];var lastMainPoint=mainPoly.Size-1;var x=mainPoly.X[lastMainPoint];var y=mainPoly.Y[lastMainPoint];var z=mainPoly.Z[lastMainPoint];var n=polys.Size;for(var i=1;i<n;i++){polys.PolyList[i].AddPoint(x,y,z);}}
var didClose=polys.Close()
this.Clip(polys,clippedPolyList,true,interpolFunc,interpolData);if(didClose)polys.RemoveLastPoint();if(JsgPolygonList.Ok(polys)&&polys.Size>1){var n=polys.Size;for(var i=1;i<n;i++){polys.PolyList[i].RemoveLastPoint();}}}
JsgPlane.prototype.Clip=function(polys,clippedPolyList,isArea,interpolFunc,interpolData){function addSegmentToClipPoly(){if(!isLastP2Added){if(!isArea){clippedPolyList.NewPoly();}
clippedPolyList.AddPoint3D(p1);}
clippedPolyList.AddPoint3D(p2);isLastP2Added=true;}
if(polys.Size==0)return;var isP1Inside,isP2Inside;var validEnter=false;var validExit=false;var validFirstEnter=false;var p1=this.WorkPoint2;var p2=this.WorkPoint3;var polyIter=this.PolyIterator.Reset(polys);if(!polyIter.GetNextPoint(p1))return;isP1Inside=this.IsPoint3DOnTop(p1);if(!polyIter.GetNextPoint(p2)){if(isP1Inside){if(!isArea){clippedPolyList.NewPoly();}
clippedPolyList.AddPoint3D(p1);}
return;}
polyIter.Back();var isLastP2Added=false;while(polyIter.GetNextPoint(p2)){isP2Inside=this.IsPoint3DOnTop(p2);if(isP1Inside&&isP2Inside){addSegmentToClipPoly();}else if(isP1Inside!=isP2Inside){var s=this.IntersectLine(p1,p2);if(!s){isP2Inside=isP1Inside;if(isP1Inside){addSegmentToClipPoly()}}else if(isP1Inside){if(!isLastP2Added){if(!isArea){if(!interpolFunc){clippedPolyList.NewPoly();}else if(clippedPolyList.Size==0){clippedPolyList.NewPoly();}}
clippedPolyList.AddPoint3D(p1);}
clippedPolyList.AddPoint3D(s);isLastP2Added=false;if(interpolFunc){JsgVect3.CopyTo(s,this.ExitPoint);validExit=true;}}else{if(!isArea){if(!interpolFunc){clippedPolyList.NewPoly();}else if(clippedPolyList.Size==0){clippedPolyList.NewPoly();}}
if(interpolFunc){JsgVect3.CopyTo(s,this.EnterPoint);if(validExit){interpolFunc(this,clippedPolyList,interpolData);}else{JsgVect3.CopyTo(s,this.FirstEnterPoint);validFirstEnter=true;}
validEnter=false;validExit=false;}
clippedPolyList.AddPoint3D(s);clippedPolyList.AddPoint3D(p2);isLastP2Added=true;}}
isP1Inside=isP2Inside;JsgVect3.CopyTo(p2,p1);}
if(interpolFunc&&validFirstEnter&&validExit){JsgVect3.CopyTo(this.FirstEnterPoint,this.EnterPoint);interpolFunc(this,clippedPolyList,interpolData);clippedPolyList.AddPoint3D(this.FirstEnterPoint);}}
function NewGraphX3D(aParams){return new JsGraphX3D(aParams);}
function JsGraphX3D(aParams){aParams=xDefObj(aParams,{});this.parentClass.constructor.call(this,aParams);this.ClientResetFunc=function(g){g.Reset3D();}
this.WorkPoly2D=new JsgPolygon(false,'JsGraphX3D.WorkPoly2D (local)');this.WorkPoint3D=JsgVect3.Null();this.WorkPoint3D2=JsgVect3.Null();this.WorkPoly3D=new JsgPolygon(true,'JsGraphX3D.WorkPoly3D');this.WorkPoly3D2=new JsgPolygon(true,'JsGraphX3D.WorkPoly3D2');this.XfmPolys3D=new JsgPolygonList(true,'JsGraphX3D.XfmPolys3D');this.CamPolys3D=new JsgPolygonList(true,'JsGraphX3D.CamPolys3D');this.ClipPolys3D1=new JsgPolygonList(true,'JsGraphX3D.ClipPolys3D1');this.ClipPolys3D2=new JsgPolygonList(true,'JsGraphX3D.ClipPolys3D2');this.Trans3D=null;this.Trans3DStack=[];this.Plane=new JsgPlane([0,0,0],[0,1,0],[0,0,1]);this.Camera=new JsgCamera();this.PathPolys3D=new JsgPolygonList(true,'JsGraphX3D.PathPolys3D (local)');this.IsPath3DOpen=false;this.ApplyTransToPath3D=false;this.LastPos3D=JsgVect3.Null();this.LastPosOnPlane=JsgVect2.Null()
this.Poly3D=new JsgPolygon(true,'JsGraphX3D.Poly3D');this.ApplyTransToPoly3D=false;this.CameraClipPlaneDist=0;this.ClipPlaneList=[null];this.Reset3D();this.SetAll(aParams);this.SetWindowToCameraScreen();}
JsGraphX3D.inheritsFrom(JsGraph);JsGraphX3D.prototype.Reset3D=function(reset2D,clear){reset2D=xDefBool(reset2D,true);clear=xDefBool(clear,true);if(reset2D){this.Reset(false);}
this.CameraClipPlaneDist=0;this.Plane.Set([0,0,0],[0,1,0],[0,0,1]);this.ClipPlaneList=[null];this.ClipPlaneListSize=1;this.PathPolys3D.Reset();this.Trans3D=null;this.Trans3DStack=[];this.IsPath3DOpen=false;this.ResetCamera();if(clear){this.Clear();}}
JsGraphX3D.prototype.SaveAll=function(aParams){var par=xDefObj(aParams,{});this.SaveClipPlanes(par);this.SaveCamera(par);this.SavePlane(par);return par;}
JsGraphX3D.prototype.SetAll=function(aParams){if(xFuncOrNull(aParams.DrawFunc)){this.SetDrawFunc(aParams.DrawFunc);}
this.SetClipPlanes(aParams);this.SetCamera(aParams);this.SetPlane(aParams);}
JsGraphX3D.prototype.SetWindowToCameraScreen=function(){var ratio=this.VpWidth/this.VpHeight;var screenSize=this.Camera.ScreenSize;var w,h;if(ratio>0){w=screenSize*ratio;h=screenSize;}else{w=screenSize;h=screenSize/ratio;}
this.SetWindowWH(-w/2,-h/2,w,h);}
JsGraphX3D.prototype.ResetCamera=function(){this.Camera.Reset();this.UpdateCameraClipPlane();}
JsGraphX3D.prototype.SetCamera=function(aParams){this.Camera.Set(aParams);this.UpdateCameraClipPlane();}
JsGraphX3D.prototype.SaveCamera=function(aParams){return this.Camera.Save(aParams);}
JsGraphX3D.prototype.SetCameraScale=function(aSceneSize,aScreenSize,aObjectZExtend,aZoom){this.Camera.SetScale(aSceneSize,aScreenSize,aObjectZExtend,aZoom);}
JsGraphX3D.prototype.SetCameraPos=function(aPos,aViewCenter,aUp){this.Camera.SetPos(aPos,aViewCenter,aUp);this.UpdateCameraClipPlane();}
JsGraphX3D.prototype.SetCameraView=function(aViewCenter,aHAng,aVAng,aDist,aUp){this.Camera.SetView(aViewCenter,aHAng,aVAng,aDist,aUp);this.UpdateCameraClipPlane();}
JsGraphX3D.prototype.SetCameraZoom=function(aZoom){this.Camera.SetZoom(aZoom);}
JsGraphX3D.prototype.UpdateCameraClipPlane=function(){if(this.CameraClipPlaneDist<=0&&this.ClipPlaneList[0]!=null){this.ClipPlaneList[0]=null;}
if(this.CameraClipPlaneDist>0){var cam=this.Camera;var n=JsgVect3.Norm(JsgVect3.Sub(cam.CamViewCenter,cam.CamPos));var pos=JsgVect3.Add(cam.CamPos,JsgVect3.Scale(n,this.CameraClipPlaneDist));var xdir=JsgVect3.Mult(cam.CamUp,n);var ydir=JsgVect3.Mult(n,xdir);var plane=new JsgPlane(pos,xdir,ydir,true);this.ClipPlaneList[0]=plane;}}
JsGraphX3D.prototype.SetCameraClipping=function(clipPlaneDist){this.CameraClipPlaneDist=clipPlaneDist;this.UpdateCameraClipPlane();}
JsGraphX3D.prototype.DeleteClipPlanes=function(){this.ClipPlaneListSize=1;}
JsGraphX3D.prototype.AddClipPlane=function(planeOrPos,xdir,ydir){if(JsgPlane.Ok(planeOrPos)){planeOrPos.Normalize();this.ClipPlaneList[this.ClipPlaneListSize]=planeOrPos;this.ClipPlaneListSize++;}else{this.ClipPlaneList[this.ClipPlaneListSize]=new JsgPlane(planeOrPos,xdir,ydir,true);this.ClipPlaneListSize++;}}
JsGraphX3D.prototype.SaveClipPlanes=function(aParams){if(this.CameraClipPlaneDist>0){aParmas.CameraClipPlaneDist=this.CameraClipPlaneDist;}
var n=this.ClipPlaneListSize;if(n>1){var l=[];for(var i=1;i<n;i++){l.push(this.ClipPlaneList[i].Copy());}
aParams.ClipPlaneList=l;}}
JsGraphX3D.prototype.SetClipPlanes=function(aParams){this.DeleteClipPlanes();if(xDefArray(aParams.ClipPlaneList)){var lst=aParams.ClipPlaneList;var n=lst.length;for(var i=0;i<n;i++){var plane=lst[i];if(JsgPlane.Ok(plane)){this.AddClipPlane(plane);}}}
if(xDefNum(aParams.CameraClipPlaneDist)){this.SetCameraClipping(aParams.CameraClipPlaneDist);}}
JsGraphX3D.prototype.PolygonFromFunc=function(aParams,poly){aParams.Graph3D=xDefObj(aParams.Graph3D,this);var min=xDefNum(aParams.Min,-1);var max=xDefNum(aParams.Max,1);var delta=0.1;if(xNum(aParams.Steps)){delta=(max-min)/aParams.Steps;}else if(xNum(aParams.Delta)){delta=Math.abs(aParams.Delta);if(max<min){delta=-delta;}}
var limit=max+0.1*delta;poly=poly||new JsgPolygon(true);var point=this.WorkPoint3D;for(var x=min;(delta>0)?(x<=limit):(x>=limit);x+=delta){poly.AddPoint3D(aParams.Func(x,aParams,point));}
return poly;}
JsGraphX3D.prototype.VectListFromFunc=function(aParams){aParams.Graph3D=xDefObj(aParams.Graph3D,this);var min=xDefNum(aParams.Min,-1);var max=xDefNum(aParams.Max,1);var delta=0.1;if(xNum(aParams.Steps)){delta=(max-min)/aParams.Steps;}else if(xNum(aParams.Delta)){delta=Math.abs(aParams.Delta);if(max<min){delta=-delta;}}
var limit=max+0.1*delta;var vectList=[];for(var x=min;(delta>0)?(x<=limit):(x>=limit);x+=delta){vectList.push(aParams.Func(x,aParams));}
return vectList;}
JsGraphX3D.prototype.VectGridFrom3DFunc=function(aParams){aParams.Graph3D=xDefObj(aParams.Graph3D,this);var min=xDefNum(aParams.Min,-1);var max=xDefNum(aParams.Max,1);var min2=xDefNum(aParams.Min2,min);var max2=xDefNum(aParams.Max2,max);var delta=0.1;if(xNum(aParams.Steps)){delta=(max-min)/aParams.Steps;}else if(xNum(aParams.Delta)){delta=Math.abs(aParams.Delta);if(max<min){delta=-delta;}}
var delta2=delta;if(xNum(aParams.Steps2)){delta2=(max2-min2)/aParams.Steps2;}else if(xNum(aParams.Delta2)){delta2=Math.abs(aParams.Delta2);if(max2<min2){delta2=-delta2;}}
var limit=max+0.1*delta;var limit2=max2+0.1*delta2;var grid=[];for(var b=min2;(delta2>0)?(b<=limit2):(b>=limit2);b+=delta2){var line=[];for(var a=min;(delta>0)?(a<=limit):(a>=limit);a+=delta){line.push(aParams.Func(a,b,aParams));}
grid.push(line);}
return grid;}
JsGraphX3D.prototype.ResetTrans3D=function(clearStack){this.Trans3D=null;if(clearStack){this.Trans3DStack=[];}
return this;}
JsGraphX3D.prototype.SaveTrans3D=function(reset){var transCopy=null;if(this.Trans3D)transCopy=JsgMat3.Copy(this.Trans3D);this.Trans3DStack.push(transCopy);if(reset)this.Trans3D=null;return transCopy;}
JsGraphX3D.prototype.RestoreTrans3D=function(){if(this.Trans3DStack.length>0)this.Trans3D=this.Trans3DStack.pop();}
JsGraphX3D.prototype.SetTrans3D=function(mat,useMat){if(mat){if(useMat){this.Trans3D=mat;}else{this.Trans3D=JsgMat3.Copy(mat);}}else{this.Trans3D=null;}}
JsGraphX3D.prototype.TransMove3D=function(x,y,z){if(JsgVect3.Ok(x))return this.TransMove3D(x[0],x[1],x[2]);this.Trans3D=JsgMat3.Moving(x,y,z,this.Trans3D);return this;}
JsGraphX3D.prototype.TransScale3D=function(sx,sy,sz){if(JsgVect3.Ok(sx))return this.TransScale3D(sx[0],sx[1],sx[2]);this.Trans3D=JsgMat3.Scaling(sx,sy,sz,this.Trans3D);return this;}
JsGraphX3D.prototype.TransRotateX3D=function(ang){this.Trans3D=JsgMat3.RotatingX(this.AngleToRad(ang),this.Trans3D);return this;}
JsGraphX3D.prototype.TransRotateY3D=function(ang){this.Trans3D=JsgMat3.RotatingY(this.AngleToRad(ang),this.Trans3D);return this;}
JsGraphX3D.prototype.TransRotateZ3D=function(ang){this.Trans3D=JsgMat3.RotatingZ(this.AngleToRad(ang),this.Trans3D);return this;}
JsGraphX3D.prototype.TransRotateVect3D=function(v,ang){var n=JsgVect3.Norm([v[0],v[1],0]);var lambda=Math.acos(JsgVect3.ScalarProd(n,[1,0,0]));if(v[1]<0)lambda*=-1;var vl=JsgVect3.Length(v);var phi=0;if(vl!=0)phi=Math.acos(v[2]/vl);ang=this.AngleToRad(ang);var am=this.SetAngleMeasure('rad');this.TransRotateZ3D(-lambda);this.TransRotateY3D(-phi);this.TransRotateZ3D(ang);this.TransRotateY3D(phi);this.TransRotateZ3D(lambda);this.SetAngleMeasure(am);}
JsGraphX3D.prototype.AddTrans3D=function(mat){if(this.Trans3D){this.Trans3D=JsgMat3.Mult(this.Trans3D,mat);}else{this.Trans3D=JsgMat3.Copy(mat);}
return this;}
JsGraphX3D.prototype.NewPoly3D=function(applyTrans){this.ApplyTransToPoly3D=xDefBool(applyTrans,false);this.Poly3D.Reset();return this;}
JsGraphX3D.prototype.CopyPoly3D=function(to,reuseArrays){reuseArrays=xDefBool(reuseArrays,false);return this.Poly3D.Copy(to,!reuseArrays);}
JsGraphX3D.prototype.AddPointToPoly3D=function(x,y,z){if(JsgVect3.Ok(x)){if(this.ApplyTransToPoly3D){this.Poly3D.AddPoint3D(this.TransPoint3D(x[0],x[1],x[2]));}else{this.Poly3D.AddPoint3D(x);}}else{if(this.ApplyTransToPoly3D){this.Poly3D.AddPoint3D(this.TransPoint3D(x,y,z));}else{this.Poly3D.AddPoint(x,y,z);}}
return this;}
JsGraphX3D.prototype.DrawPoly3D=function(mode,roundedEdges){mode=xDefNum(mode,1);if(mode&16)this.Poly3D.Invert();this.Polygon3D(this.Poly3D,mode,roundedEdges);}
JsGraphX3D.prototype.MoveTo3D=function(x,y,z){if(JsgVect3.Ok(x))return this.MoveTo3D(x[0],x[1],x[2]);JsgVect3.Set(this.LastPos3D,x,y,z);return this;}
JsGraphX3D.prototype.LineTo3D=function(x,y,z){if(JsgVect3.Ok(x)){return this.LineTo3D(x[0],x[1],x[2]);}
this.WorkPoly3D.Reset();this.WorkPoly3D.AddPoint3D(this.LastPos3D);this.WorkPoly3D.AddPoint(x,y,z);this.TransClipPolygon3D(this.WorkPoly3D,1);this.WorkPoly3D.GetLastPoint3D(this.LastPos3D);return this;}
JsGraphX3D.prototype.Line3D=function(x1,y1,z1,x2,y2,z2,append){if(JsgVect3.Ok(x1)){return this.Line3D(x1[0],x1[1],x1[2],y1[0],y1[1],y1[2],z1);}
var mode=1;if(append)mode+=8;this.WorkPoly3D.Reset();this.WorkPoly3D.AddPoint(x1,y1,z1);this.WorkPoly3D.AddPoint(x2,y2,z2);this.TransClipPolygon3D(this.WorkPoly3D,mode);this.WorkPoly3D.GetLastPoint3D(this.LastPos3D);return this;}
JsGraphX3D.prototype.VectList3D=function(vectList,mode,roundedEdges){this.VectListToPoly3D(vectList);this.DrawPoly3D(mode,roundedEdges);}
JsGraphX3D.prototype.Polygon3D=function(poly,mode,roundedEdges){mode=xDefNum(mode,1);var didClose=false;if((mode&4)>0){didClose=poly.Close();}
roundedEdges=xDefBool(roundedEdges,false);if(roundedEdges&&!this.IsPath3DOpen){var oldJoin=this.LineJoin;var oldCap=this.LineCap;this.SetLineJoin('round');this.SetLineCap('round');this.TransClipPolygon3D(poly,mode&~4);this.SetLineJoin(oldJoin);this.SetLineCap(oldCap);}else{this.TransClipPolygon3D(poly,mode&~4);}
poly.GetLastPoint3D(this.LastPos3D);if(didClose){poly.RemoveLastPoint();}}
JsGraphX3D.prototype.PolygonList3D=function(polys,mode,roundedEdges){for(var i=0;i<polys.Size;i++){this.Polygon3D(polys.PolyList[i],mode,roundedEdges);}}
JsGraphX3D.prototype.VectListToPoly3D=function(vectList,newPoly){newPoly=xDefBool(newPoly,true);if(newPoly){this.NewPoly3D();}
var size=vectList.length;for(var i=0;i<size;i++){var v=vectList[i];this.AddPointToPoly3D(v[0],v[1],v[2]);}}
JsGraphX3D.prototype.Arrow3D=function(x1,y1,z1,x2,y2,z2,variant,mode,sym1,sym2){if(JsgVect3.Ok(x1)){return this.Arrow3D(x1[0],x1[1],x1[2],y1[0],y1[1],y1[2],z1,x2,y2,z2);}
var poly=this.WorkPoly3D.Reset();poly.AddPoint(x1,y1,z1);poly.AddPoint(x2,y2,z2);poly.GetLastPoint3D(this.LastPos3D);variant=xDefNum(variant,1);if(variant&1){if(!this.TransClipPoint3D(poly.X[1],poly.Y[1],poly.Z[1]))variant&=~1;}
if(variant&2){if(!this.TransClipPoint3D(poly.X[0],poly.Y[0],poly.Z[0]))variant&=~2;}
var transPoly=this.TransClipPolygon3D(poly,1,false,true);if(transPoly.IsEmpty())return this;if(JsgPolygonList.Ok(transPoly))transPoly=transPoly.GetFirstPoly();if((variant&3)>0){this.Arrow(transPoly.X[0],transPoly.Y[0],transPoly.X[1],transPoly.Y[1],variant,mode,sym1,sym2);}else{this.Line(transPoly.X[0],transPoly.Y[0],transPoly.X[1],transPoly.Y[1]);}
JsgVect3.Set(this.LastPos3D,x2,y2,z2);return this;}
JsGraphX3D.prototype.PolygonArrow3D=function(poly,variant,lineMode,arrowMode,sym1,sym2){if(poly.Size<2)return this;if((variant&4)==0){this.Polygon3D(poly,lineMode);}
var last=poly.Size-1;if(variant&1){if(!this.TransClipPoint3D(poly.X[last],poly.Y[last],poly.Z[last]))variant&=~1;}
if(variant&2){if(!this.TransClipPoint3D(poly.X[0],poly.Y[0],poly.Z[0]))variant&=~2;}
variant|=4;if((variant&2)>0){this.Arrow3D(poly.X[0],poly.Y[0],poly.Z[0],poly.X[1],poly.Y[1],poly.Z[1],variant&~1,arrowMode,sym1);}
if((variant&1)>0){var prev=last-1;this.Arrow3D(poly.X[prev],poly.Y[prev],poly.Z[prev],poly.X[last],poly.Y[last],poly.Z[last],variant&~2,arrowMode,sym2);}
poly.GetLastPoint3D(this.LastPos3D);return this;}
JsGraphX3D.prototype.Text3D=function(aText,p,widthOrMode){var p=this.TransClipPoint3D(p[0],p[1],p[2]);if(p){this.Text(aText,p,widthOrMode);}
return this;}
JsGraphX3D.prototype.GetTextBox3D=function(aText,p,width){var p=this.TransClipPoint3D(p[0],p[1],p[2]);if(!p)return null;return this.GetTextBox(aText,p,width);}
JsGraphX3D.prototype.DrawPolyMarker3D=function(mode,mat){this.Marker3D(this.Poly3D,mode,mat);}
JsGraphX3D.prototype.Marker3D=function(x,y,z,mode,mat){if(JsgPolygon.Ok(x)){var polyClipped=this.TransClipPointPoly3D(x);this.Marker(polyClipped,y,z);return this;}
if(JsgVect3.Ok(x))return this.Marker3D(x[0],x[1],x[2],y,z);var p=this.TransClipPoint3D(x,y,z);if(p){this.Marker(p,mode,mat);}
return this;}
JsGraphX3D.prototype.OpenPath3D=function(applyTrans){this.ApplyTransToPath3D=xDefBool(applyTrans,false);this.PathPolys3D.Reset();this.IsPath3DOpen=true;}
JsGraphX3D.prototype.ClearPath3D=function(){this.PathPolys3D.Reset();this.IsPath3DOpen=false;}
JsGraphX3D.prototype.Path3D=function(mode,clear){mode=xDefNum(mode,1);clear=xDefBool(clear,true);var didClose=false;if((mode&4)>0){didClose=this.PathPolys3D.Close();}
this.TransClipPolygon3D(this.PathPolys3D,mode&~4,true,true);if(clear){this.ClearPath3D();}else{if(didClose){this.PathPolys3D.RemoveLastPoint();}}}
JsGraphX3D.prototype.TransClipPolygon3D=function(polys,mode,draw,bypassPath){bypassPath=xDefBool(bypassPath,false);draw=xDefBool(draw,true);if(this.IsPath3DOpen&&!bypassPath){var appendMode=((mode&8)>0)?2:1;if(this.ApplyTransToPath3D){this.PathPolys3D.AddPoly(this.TransPolys3D(polys),appendMode);}else{this.PathPolys3D.AddPoly(polys,appendMode);}
return this.PathPolys3D;}
var transformedPolys=this.TransPolys3D(polys);var polysRet=transformedPolys;if((mode&2)>0){var clippedPolys=this.ClipPolygon3D(transformedPolys,true);var cameraPolys=this.CameraTrans3D(clippedPolys);if(draw){this.DrawPolygonList3D(cameraPolys,mode&~1);}
polysRet=cameraPolys;}
if((mode&1)>0){var clippedPolys=this.ClipPolygon3D(transformedPolys,false);var cameraPolys=this.CameraTrans3D(clippedPolys);if(draw){this.DrawPolygonList3D(cameraPolys,mode&~(2+4));}
polysRet=cameraPolys;}
return polysRet;}
JsGraphX3D.prototype.TransClipPointPoly3D=function(poly,polyRet){polyRet=polyRet||this.WorkPoly3D;polyRet.Reset();var xs=poly.X;var ys=poly.Y;var zs=poly.Z;var len=poly.Size;for(var i=0;i<len;i++){var p=this.TransClipPoint3D(xs[i],ys[i],z[i]);if(p){polyRet.AddPoint3D(p);}}}
JsGraphX3D.prototype.TransPolys3D=function(polys,reset){if(!this.Trans3D)return polys;reset=xDefBool(reset,true);var polysRet=this.XfmPolys3D;if(reset){polysRet.Reset();}
if(JsgPolygonList.Ok(polys)){for(var i=0;i<polys.Size;i++){this.TransPolys3D(polys.PolyList[i],false);}}else{polysRet.NewPoly();var polyTrans=polysRet.GetLastPoly();var mat=this.Trans3D;var xs=polys.X,ys=polys.Y,zs=polys.Z,p=this.WorkPoint3D;var n=polys.Size;for(var i=0;i<n;i++){JsgMat3.TransXYZTo(mat,xs[i],ys[i],zs[i],p);polyTrans.AddPoint3D(p);}}
return polysRet;}
JsGraphX3D.prototype.TransClipPoint3D=function(x,y,z){if(JsgVect3.Ok(x))return this.TransClipPoint3D(x[0],x[1],x[2]);var p=this.TransPoint3D(x,y,z);if(!this.IsPointInsideClipRange3D(p[0],p[1],p[2]))return null;return this.Camera.TransTo(p[0],p[1],p[2]);}
JsGraphX3D.prototype.VTransPoint3D=function(x,y,z){var p;if(xNum(x)){p=this.TransPoint3D(x,y,z);}else{p=this.TransPoint3D(x[0],x[1],x[2]);}
return this.Camera.TransTo(p[0],p[1],p[2]);}
JsGraphX3D.prototype.TransPoint3D=function(x,y,z){if(JsgVect3.Ok(x))return this.TransPoint3D(x[0],x[1],x[2]);var p=JsgVect3.Set(this.WorkPoint3D,x,y,z);if(this.Trans3D){JsgMat3.TransTo(this.Trans3D,p);}
return p;}
JsGraphX3D.prototype.DrawPolygonList3D=function(polys,mode){if(JsgPolygonList.Ok(polys)){var n=polys.Size;for(var i=0;i<n;i++){this.Polygon(polys.PolyList[i],mode);}}else{this.Polygon(polys,mode);}}
JsGraphX3D.prototype.CameraTrans3D=function(polys){var transPolys=this.CamPolys3D.Reset();if(JsgPolygonList.Ok(polys)){var n=polys.Size;for(var i=0;i<n;i++){transPolys.NewPoly();this.Camera.TransPoly(polys.PolyList[i],transPolys);}}else{transPolys.NewPoly();this.Camera.TransPoly(polys,transPolys);}
return transPolys;}
JsGraphX3D.prototype.ClipPolygon3D=function(polys,isArea){var n=this.ClipPlaneListSize;if(n==1&&this.ClipPlaneList[0]==null){if(!isArea||JsgPolygon.Ok(polys)){return polys;}else{return this.MergeAreaPolys(polys,this.ClipPolys3D1);}}
var nextClipPolys=this.ClipPolys3D2;var currClipPolys=this.ClipPolys3D1;for(var i=0;i<n;i++){var clipPlane=this.ClipPlaneList[i];if(clipPlane){var clippedPolys=currClipPolys.Reset();if(isArea){clipPlane.ClipArea(polys,clippedPolys);}else{clipPlane.ClipPoly(polys,clippedPolys);}
polys=clippedPolys;var tmp=currClipPolys;currClipPolys=nextClipPolys;nextClipPolys=tmp;}}
return polys;}
JsGraphX3D.prototype.MergeAreaPolys=function(polys,mergedPolys){if(polys.Size==0)return polys;if(polys.Size==1)return polys.PolyList[0];mergedPolys.Reset();mergedPolys.NewPoly();for(var i=0;i<polys.Size;i++){var poly=polys.PolyList[i];var hasClosed=poly.Close();mergedPolys.AddPoly(poly,2);if(i>0){mergedPolys.Close();}
if(hasClosed){poly.RemoveLastPoint();}}
return mergedPolys;}
JsGraphX3D.prototype.IsPointInsideClipRange3D=function(x,y,z){var isVect=JsgVect3.Ok(x);var n=this.ClipPlaneListSize;if(n==1&&this.ClipPlaneList[0]==null)return true;for(var i=0;i<n;i++){var clipPlane=this.ClipPlaneList[i];if(clipPlane){if(isVect){if(!clipPlane.IsPoint3DOnTop(x))return false;}else{if(!clipPlane.IsPointOnTop(x,y,z))return false;}}}
return true;}
JsGraphX3D.prototype.SavePlane=function(aParams){var par=xDefObj(aParams,{});par.Plane=this.Plane;return par;}
JsGraphX3D.prototype.SetPlane=function(PosOrObj,xDir,yDir,normalize){if(xObj(PosOrObj)){if(JsgPlane.Ok(PosOrObj)){this.Plane=PosOrObj;}else if(xDef(PosOrObj.Plane)){this.Plane=PosOrObj.Plane;}}else{this.Plane.Set(PosOrObj,xDir,yDir,normalize);}}
JsGraphX3D.prototype.PolygonToPlane=function(xpoly,ypoly,size,planePoly){return this.Plane.PolygonOnPlane(xpoly,ypoly,size,planePoly);}
JsGraphX3D.prototype.GetPointOnPlane=function(x,y,v){v=v||this.WorkPoint3D;return this.Plane.PointOnPlane(x,y,v);}
JsGraphX3D.prototype.GetTransPointOnPlane=function(x,y,v){return this.GetTransPoint3D(this.Plane.PointOnPlane(x,y),v);}
JsGraphX3D.prototype.GetTransPoint3D=function(x,y,z,v){if(JsgVect3.Ok(x)){return this.GetTransPoint3D(x[0],x[1],x[2],y);}
v=v||this.WorkPoint3D;if(this.Trans3D){JsgMat3.TransXYZTo(this.Trans3D,x,y,z,v);}else{JsgVect3.Set(v,x,y,z);}
return v;}
JsGraphX3D.prototype.AddPointToPoly3DOnPlane=function(x,y){this.Poly3D.AddPoint3D(this.Plane.PointOnPlane(x,y));}
JsGraphX3D.prototype.MoveToOnPlane=function(x,y){if(JsgVect2.Ok(x)){return this.MoveToOnPlane(x[0],x[1]);}
JsgVect2.Set(this.LastPosOnPlane,x,y);return this;}
JsGraphX3D.prototype.LineToOnPlane=function(x,y){if(JsgVect2.Ok(x)){return this.LineToOnPlane(x[0],x[1]);}
this.LineOnPlane(this.LastPosOnPlane[0],this.LastPosOnPlane[1],x,y);return this;}
JsGraphX3D.prototype.LineOnPlane=function(x1,y1,x2,y2,append){if(JsgVect2.Ok(x1)){return this.LineOnPlane(x1[0],x1[1],y1[0],y1[1],x2);}
this.Plane.PointOnPlane(x1,y1,this.WorkPoint3D);this.Plane.PointOnPlane(x2,y2,this.WorkPoint3D2);this.Line3D(this.WorkPoint3D,this.WorkPoint3D2,append);JsgVect2.Set(this.LastPosOnPlane,x2,y2);return this;}
JsGraphX3D.prototype.PolygonOnPlane=function(xpoly,ypoly,mode,size,roundedEdges){if(JsgPolygon.Ok(xpoly)){return this.PolygonOnPlane(xpoly.X,xpoly.Y,ypoly,xpoly.Size,mode);}
size=xDefNum(size,xpoly.length);var poly=this.Plane.PolygonOnPlane(xpoly,ypoly,size);this.Polygon3D(poly,mode,roundedEdges);JsgVect2.Set(this.LastPosOnPlane,xpoly[size-1],ypoly[size-1]);return this;}
JsGraphX3D.prototype.BezierCurveOnPlane=function(sx,sy,cx1,cy1,cx2,cy2,ex,ey,mode,nSegments){if(JsgPolygon.Ok(sx)){var i=xDefNum(cx1,0);return this.BezierCurveOnPlane(sx.X[i+0],sx.Y[i+0],sx.X[i+1],sx.Y[i+1],sx.X[i+2],sx.Y[i+2],sx.X[i+3],sx.Y[i+3],sy,cx1);}
if(JsgVect2.Ok(sx)){return this.BezierCurveOnPlane(sx[0],sx[1],sy[0],sy[1],cx1[0],cx1[1],cy1[0],cy1[1],cx2,cy2);}
var poly2D=this.MakeBezierPolygon(sx,sy,cx1,cy1,cx2,cy2,ex,ey,nSegments);this.PolygonOnPlane(poly2D,mode);return this;}
JsGraphX3D.prototype.BezierCurveToOnPlane=function(cx1,cy1,cx2,cy2,ex,ey,mode,nSegments){if(JsgPolygon.Ok(cx1)){var i=xDefNum(cx2,0);return this.BezierCurveToOnPlane(cx1.X[i+0],cx1.Y[i+0],cx1.X[i+1],cx1.Y[i+1],cx1.X[i+2],cx1.Y[i+2],cy1,cx2);}
if(JsgVect2.Ok(cx1)){return this.BezierCurveToOnPlane(cx1[0],cx1[1],cy1[0],cy1[1],cx2[0],cx2[1],cy2,ex);}
this.BezierCurveOnPlane(this.LastPosOnPlane[0],this.LastPosOnPlane[1],cx1,cy1,cx2,cy2,ex,ey,mode,nSegments);return this;}
JsGraphX3D.prototype.SplineCurveOnPlane=function(xpoly,ypoly,tension,mode,size,nSegments){if(JsgPolygon.Ok(xpoly)){return this.SplineCurveOnPlane(xpoly.X,xpoly.Y,ypoly,tension,xpoly.Size,mode);}
var poly2D=this.MakeSplineCurve(xpoly,ypoly,tension,mode,size,nSegments);var roundedEdges=(mode&4)>0;this.PolygonOnPlane(poly2D,mode,roundedEdges);return this;}
JsGraphX3D.prototype.ArrowOnPlane=function(x1,y1,x2,y2,variant,mode,sym1,sym2){if(JsgVect2.Ok(x1)){return this.ArrowOnPlane(x1[0],x1[1],y1[0],y1[1],x2,y2,variant,mode);}
this.Plane.PointOnPlane(x1,y1,this.WorkPoint3D);this.Plane.PointOnPlane(x2,y2,this.WorkPoint3D2);this.Arrow3D(this.WorkPoint3D,this.WorkPoint3D2,variant,mode,sym1,sym2);JsgVect2.Set(this.LastPosOnPlane,x2,y2);return this;}
JsGraphX3D.prototype.PolygonArrowOnPlane=function(xpoly,ypoly,variant,lineMode,arrowMode,size,sym1,sym2){if(JsgPolygon.Ok(xpoly)){return this.PolygonArrowOnPlane(xpoly.X,xpoly.Y,ypoly,variant,lineMode,xpoly.Size,arrowMode,size);}
var poly=this.Plane.PolygonOnPlane(xpoly,ypoly,size);this.PolygonArrow3D(poly,variant,lineMode,arrowMode,sym1,sym2);size=size||xpoly.length;JsgVect2.Set(this.LastPosOnPlane,xpoly[size-1],ypoly[size-1]);return this;}
JsGraphX3D.prototype.RectOnPlane=function(x1,y1,x2,y2,mode,roll){if(JsgVect2.Ok(x1)){return this.RectOnPlane(x1[0],x1[1],y1[0],y1[1],x2,y2);}
mode=xDefNum(mode,1);var poly;if(xObj(x1)){mode=xDefNum(y1,1);roll=xDefNum(x2,0);var clockWise=!!(mode&4);poly=this.MakeRectPolygon(x1,clockWise,roll);}else{var clockWise=!!(mode&4);poly=this.MakeRectPolygon(x1,y1,x2,y2,clockWise,roll);}
this.PolygonOnPlane(poly,mode,true);return this;}
JsGraphX3D.prototype.RectWHOnPlane=function(x,y,w,h,mode,roll){if(JsgRect.Ok(x)){this.RectOnPlane(x.x,x.y,x.x+x.w,x.y+x.h,y,w);}else{this.RectOnPlane(x,y,x+w,y+h,mode,roll);}}
JsGraphX3D.prototype.CompViewportRadius=function(x,y,rx,ry){function len(xs,ys,i,j){var vx=xs[i]-xs[j];var vy=ys[i]-ys[j];return vx*vx+vy*vy;}
var abs=Math.abs,max=Math.max;var absRx=abs(rx);var absRy=abs(ry);var maxR=max(absRx,absRy);var plane=this.Plane;var poly=this.WorkPoly3D2.Reset();poly.AddPoint3D(this.VTransPoint3D(plane.PointOnPlane(x-maxR,y-maxR)));poly.AddPoint3D(this.VTransPoint3D(plane.PointOnPlane(x+maxR,y-maxR)));poly.AddPoint3D(this.VTransPoint3D(plane.PointOnPlane(x+maxR,y+maxR)));poly.AddPoint3D(this.VTransPoint3D(plane.PointOnPlane(x-maxR,y+maxR)));var xs=poly.X,ys=poly.Y;var l1=len(xs,ys,1,0);var l2=len(xs,ys,2,3);var ll1=(l1+l2)/2;var l1=len(xs,ys,3,0);var l2=len(xs,ys,2,1);var ll2=(l1+l2)/2;var maxRVT=Math.sqrt(max(ll1,ll2))/2;var cnvsRx=abs(this.CurrTrans.ScaleX)*maxRVT;var cnvsRy=abs(this.CurrTrans.ScaleY)*maxRVT;var rPixel=max(cnvsRx,cnvsRy);return rPixel;}
JsGraphX3D.prototype.CircleOnPlane=function(x,y,r,mode,startAngle){if(JsgVect2.Ok(x)){return this.CircleOnPlane(x[0],x[1],y,r,mode);}
this.EllipseOnPlane(x,y,r,Math.abs(r),0,mode,startAngle);return this;}
JsGraphX3D.prototype.ArcOnPlane=function(x,y,r,start,end,mode){if(JsgVect2.Ok(x)){return this.ArcOnPlane(x[0],x[1],y,r,start,end);}
this.EllipseArcOnPlane(x,y,r,Math.abs(r),0,start,end,mode);return this;}
JsGraphX3D.prototype.ArcToOnPlane=function(x,y,r,big,mode){if(JsgVect2.Ok(x)){return this.ArcToOnPlane(x,x,y,r,big);}
this.ArcPtOnPlane(this.LastX,this.LastY,x,y,r,big,mode|8);return this;}
JsGraphX3D.prototype.ArcPtOnPlane=function(x1,y1,x2,y2,r,big,mode){if(JsgVect2.Ok(x1)){return this.ArcPtOnPlane(x1[0],x1[1],y1[0],y1[1],x2,y2,r);}
big=xDefBool(big,false);mode=xDefNum(mode,1);var arc=this.MakeArcFromPoints(x1,y1,x2,y2,r,big);this.ArcOnPlane(arc.x,arc.y,arc.r,arc.start,arc.end,mode);return this;}
JsGraphX3D.prototype.EllipseOnPlane=function(x,y,rx,ry,rot,mode,startAngle){if(JsgVect2.Ok(x)){return this.EllipseOnPlane(x[0],x[1],y,rx,ry,rot,mode);}
startAngle=xDefNum(startAngle,0);var start=startAngle;var end=startAngle+this.RadToAngle(2*Math.PI);if(rx<0){start=end;end=startAngle;}
this.EllipseArcOnPlane(x,y,rx,ry,rot,start,end,mode);return this;}
JsGraphX3D.prototype.EllipseArcOnPlane=function(x,y,rx,ry,rot,start,end,mode){if(JsgVect2.Ok(x)){return this.EllipseArcOnPlane(x[0],x[1],y,rx,ry,rot,start,end);}
ry=xDefNum(ry,Math.abs(rx));rot=xDefNum(rot,0);start=xDefNum(start,0);end=xDefNum(end,start+this.RadToAngle(2*Math.PI));mode=xDefNum(mode,1);var rPixel=this.CompViewportRadius(x,y,rx,ry);var ell=this.MakeEllipseArcPolygon(x,y,rx,ry,rot,start,end,rPixel);var roundedEdges=((mode&1)&&this.IsClosedPolygon(ell.X,ell.Y,ell.Size));this.PolygonOnPlane(ell,mode,roundedEdges);return this;}
JsGraphX3D.prototype.TextOnPlane=function(txt,x,y,WidthOrMode){if(JsgVect2.Ok(x)){return this.TextOnPlane(txt,x[0],x[1],y);}
return this.Text3D(txt,this.Plane.PointOnPlane(x,y),WidthOrMode);}
JsGraphX3D.prototype.GetTextBoxOnPlane=function(aText,x,y,width){if(JsgVect2.Ok(x)){return this.GetTextBoxOnPlane(aText,x[0],x[1],y);}
var pos=this.Plane.PointOnPlane(x,y);var posVT=this.Camera.Trans(pos);return this.GetTextBox(aText,posVT[0],posVT[1],width);}
JsGraphX3D.prototype.MarkerOnPlane=function(x,y,mode,mat,size){if(JsgPolygon.Ok(x)){return this.MarkerOnPlane(x.X,x.Y,y,mode,x.Size);}
if(xArray(x)&&xArray(y)){return this.Marker3D(this.Plane.PolygonOnPlane(x,y,size),mode,mat);}
if(JsgVect2.Ok(x))return this.MarkerOnPlane(x[0],x[1],y,mode);return this.Marker3D(this.Plane.PointOnPlane(x,y),mode,mat);}
JsGraphX3D.prototype.CreateLinearGradient3D=function(aGradientDef){var p1VT,p2VT;var gradDef={Stops:aGradientDef.Stops};if(aGradientDef.Plane){var plane=aGradientDef.Plane;p1VT=this.Camera.Trans(plane.Point(aGradientDef.X1,aGradientDef.Y1));p2VT=this.Camera.Trans(plane.Point(aGradientDef.X2,aGradientDef.Y2));}else{p1VT=this.Camera.Trans(aGradientDef.P1);p2VT=this.Camera.Trans(aGradientDef.P2);}
gradDef.X1=p1VT[0];gradDef.Y1=p1VT[1];gradDef.X2=p2VT[0];gradDef.Y2=p2VT[1];var grad=this.CreateLinearGradient(gradDef);grad.Def3D=aGradientDef;return grad}
JsGraphX3D.prototype.SetLinearGradientGeom3D=function(aLinearGradient3D,aGeom){var p1VT,p2VT;var grad=aLinearGradient3D.Def3D;if(grad.Plane){var plane=grad.Plane;grad.X1=xDefNum(aGeom.X1,grad.X1);grad.Y1=xDefNum(aGeom.Y1,grad.Y1);grad.X2=xDefNum(aGeom.X2,grad.X2);grad.Y2=xDefNum(aGeom.Y2,grad.Y2);p1VT=this.Camera.Trans(plane.Point(grad.X1,grad.Y1));p2VT=this.Camera.Trans(plane.Point(grad.X2,grad.Y2));}else{grad.P1=xDefArray(aGeom.P1,grad.P1);grad.P2=xDefArray(aGeom.P2,grad.P2);p1VT=this.Camera.Trans(grad.P1);p2VT=this.Camera.Trans(grad.P2);}
this.SetLinearGradientGeom(aLinearGradient3D,{X1:p1VT[0],Y1:p1VT[1],X1:p2VT[0],Y1:p2VT[1]});}