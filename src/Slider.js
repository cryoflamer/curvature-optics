/**
 * Dragdealer  (Dgd) JS v0.9.5
 * http://skidding.github.io/dragdealer/
 *
 * Copyright (c) 2010, Ovidiu Chereches
 * MIT License
 * http://legal.ovidiu.ch/licenses/MIT
 *
 * Dependencies:
 * x.js
 *
 * 2014-11-24 wabis: LayoutChange events integrated via x-modules xAddEventLayoutChange() (see x.js)
 * 2015-10-12 wabis: New Formats, Context Menu disabled
 * 2016-01-08 wabis: Fixed: disabling Context Menu error on IE8 (addEventListener not implemented)
 * 2016-08-14 wabis: use of addEventListener/removeEventListener;
 *                   new: free() to release event listeners and delete slider DOM
 *                   new: option autoUpdateLayout=false to suppress handling of layout/resize changes here
 */

/* Cursor */

var DgdCursor = {
  x: 0, y: 0,

  init: function() {
    var mouseHandler = function CB_OnMouse(e) {
      //console.log( 'DgdCursor.on'+type+'move' );
      DgdCursor.refresh(e);
    }
    document.addEventListener( 'mousemove', mouseHandler, false );
    document.addEventListener( 'touchmove', mouseHandler, false );
  },

  refresh: function(e) {
    if (e.type == 'mousemove') {
      this.set(e);
    }
    else if (e.touches) {
      this.set(e.touches[0]);
    }
  },

  set: function(e) {
    if(e.pageX || e.pageY) {
      this.x = e.pageX;
      this.y = e.pageY;
    } else if(e.clientX || e.clientY) {
      this.x = e.clientX + document.body.scrollLeft + document.documentElement.scrollLeft;
      this.y = e.clientY + document.body.scrollTop + document.documentElement.scrollTop;
    }
  }
};

DgdCursor.init();

/* Position */

var DgdPosition = {
  get: function(obj) {
    var curleft = 0;
    var curtop = 0;
    if(obj.offsetParent) {
      do {
        curleft += obj.offsetLeft;
        curtop += obj.offsetTop;
      } while((obj = obj.offsetParent));
    }
    return [curleft, curtop];
  }
};

/* Dragdealer Slider */

function DgdSliderHtml( aID, aCaption, aHandleColor, aSliderColor ) {
  aCaption = xDefStr( aCaption, '&hArr;' );
  aHandleColor = xDefStr( aHandleColor, '' );
  aSliderColor = xDefStr( aSliderColor, '' );
  var s = '';
  var style = '';
  if (aSliderColor != '') style = ' style="background-color: ' + aSliderColor + ';"';
  s += '<div id="' + aID + '" class="Slider"' + style + '>';
  style = '';
  if (aHandleColor != '') style = ' style="background-color: ' + aHandleColor + ';"';
  s += '<div id="' + aID + '-Handle" class="Handle"' + style + '>' + aCaption + '</div></div>';
  return s;
}

var DgdSlider = function(wrapper, options) {
  if (!(wrapper = xElement( wrapper ))) return;
  var handle = xGetByTag( 'div', wrapper )[0];
  if(!xHasClass(handle,'Handle')) return;
  this.init(wrapper, handle, options || {});
  this.addListeners();
  this.setup(false);
  this.IsLife = true;
};

DgdSlider.prototype = {
  sliderList: [],
  animationFrameId: null,

  init: function(wrapper, handle, options)   {
    DgdSlider.prototype.sliderList.push( this );
    this.isSetup = false;
    this.wrapper = wrapper;
    this.handle = handle;
    this.options = options;

    this.disabled = this.getOption('disabled', false);
    this.horizontal = this.getOption('horizontal', true);
    this.vertical = this.getOption('vertical', false);
    this.slide = this.getOption('slide', true);
    this.steps = this.getOption('steps', 0);
    this.snap = this.getOption('snap', false);
    this.loose = this.getOption('loose', false);
    this.speed = this.getOption('speed', 10) / 100;
    this.xPrecision = this.getOption('xPrecision', 0);
    this.yPrecision = this.getOption('yPrecision', 0);
    this.autoUpdateLayout = this.getOption('autoUpdateLayout', true);

    this.callback = options.callback || null;
    this.animationCallback = options.animationCallback || null;

    this.bounds = {
      left: options.left || 0, right: -(options.right || 0),
      top: options.top || 0, bottom: -(options.bottom || 0),
      x0: 0, x1: 0, xRange: 0,
      y0: 0, y1: 0, yRange: 0
    };
    this.value = {
      prev: [-1, -1],
      current: [options.x || 0, options.y || 0],
      target: [options.x || 0, options.y || 0]
    };
    this.offset = {
      wrapper: [0, 0],
      mouse: [0, 0],
      prev: [-999999, -999999],
      current: [0, 0],
      target: [0, 0]
    };
    this.change = [0, 0];

    this.activity = false;
    this.dragging = false;
    this.tapping = false;

    // event handler --------------------------------------
    var self = this;
    this.selectstartHandler = function CB_OnSelectStart() {
      //console.log( 'DgdSlider.wrapper.onselectstart' );
      return false;
    };
    this.mousedownHandler = function CB_OnMouseDown(e) {
      //console.log( 'DgdSlider.handle.onmousedown' );
      self.handleDownHandler(e);
    };
    this.contextmenuHandler = function CB_OnContextmenu(e){
      //e.stopPropagation();
      e.preventDefault();
      //e.cancelBubble = true;
      return false;
    };
    this.wrapperMousedownHandler = function CB_OnMouseDown(e) {
      //console.log( 'DgdSlider.wrapper.onmousedown' );
      self.wrapperDownHandler(e);
    };
    this.mouseupHandler = function CB_OnMouseUp(e) {
      //console.log( 'DgdSlider.document.onmouseup' );
      self.documentUpHandler(e);
    };
    this.touchendHandler = function CB_OnTouchEnd(e) {
      //console.log( 'DgdSlider.document.ontouchend' );
      self.documentUpHandler(e);
    };
    this.windowResizeHandler = function CB_OnWindowResize() {
      //console.log( 'DgdSlider.window.onresize' );
      self.documentResizeHandler();
    };
    this.mousemoveHandler = function CB_OnMouseMove() {
      //console.log( 'DgdSlider.wrapper.onmousemove' );
      self.activity = true;
    }
    this.clickHandler = function CB_OnClick() {
      //console.log( 'DgdSlider.wrapper.onclick' );
      return !self.activity;
    }
    this.IsLife = false;
  },

  free: function( deleteDom ) {
    deleteDom = xDefBool( deleteDom, false );
    // remove this.slider from sliderList
    xArrRemove(
      DgdSlider.prototype.sliderList,
      function CB_Compare_Slider(slider){
        return slider == this;
      },
      this
    );
    // if last slider is removed, cancel animation
    if (DgdSlider.prototype.sliderList.length == 0) {
      cancelAnimationFrame( DgdSlider.prototype.animationFrameId );
      DgdSlider.prototype.animationFrameId = null;
    }
    this.removeListeners();
    if (deleteDom) {
      var domObj = this.wrapper;
      if (domObj) xRemoveChild( xParent( domObj ), domObj );
    }
    this.IsLife = false;
  },

  updateLayout: function() {
    this.documentResizeHandler();
  },

  getOption: function(name, defaultValue) {
    return xDefAnyOrNull( this.options[name], defaultValue );
  },

  setup: function(reset) {
    if (!reset && (this.isSetup || !xIsDisplayed(this.wrapper))) return false;
    this.setWrapperOffset();
    this.setBoundsPadding();
    this.setBounds();
    this.isSetup = true;
    return true;
  },

  setWrapperOffset: function() {
    this.offset.wrapper = DgdPosition.get(this.wrapper);
  },

  setBoundsPadding: function() {
    if(!this.bounds.left && !this.bounds.right) {
      this.bounds.left = DgdPosition.get(this.handle)[0] - this.offset.wrapper[0];
      this.bounds.right = -this.bounds.left;
    }
    if(!this.bounds.top && !this.bounds.bottom) {
      this.bounds.top = DgdPosition.get(this.handle)[1] - this.offset.wrapper[1];
      this.bounds.bottom = -this.bounds.top;
    }
  },

  setBounds: function() {
    this.bounds.x0 = this.bounds.left;
    this.bounds.x1 = this.wrapper.offsetWidth + this.bounds.right;
    this.bounds.xRange = (this.bounds.x1 - this.bounds.x0) - this.handle.offsetWidth;

    this.bounds.y0 = this.bounds.top;
    this.bounds.y1 = this.wrapper.offsetHeight + this.bounds.bottom;
    this.bounds.yRange = (this.bounds.y1 - this.bounds.y0) - this.handle.offsetHeight;

    this.bounds.xStep = 1 / (this.xPrecision || Math.max(this.wrapper.offsetWidth, this.handle.offsetWidth));
    this.bounds.yStep = 1 / (this.yPrecision || Math.max(this.wrapper.offsetHeight, this.handle.offsetHeight));
  },

  addListeners: function() {
    this.wrapper.addEventListener( 'selectstart', this.selectstartHandler );
    this.wrapper.addEventListener( 'mousedown',   this.wrapperMousedownHandler );
    this.handle.addEventListener(  'mousedown',   this.mousedownHandler );
    document.addEventListener(     'mouseup',     this.mouseupHandler );
    this.wrapper.addEventListener( 'touchstart',  this.wrapperMousedownHandler );
    this.handle.addEventListener(  'touchstart',  this.mousedownHandler );
    document.addEventListener(     'touchend',    this.touchendHandler );
    this.wrapper.addEventListener( 'mousemove',   this.mousemoveHandler );
    this.wrapper.addEventListener( 'click',       this.clickHandler );

    this.handle.addEventListener(  'contextmenu', this.contextmenuHandler );
    this.wrapper.addEventListener( 'contextmenu', this.contextmenuHandler );
    if (this.autoUpdateLayout) {
      window.addEventListener(     'resize',      this.windowResizeHandler );
      xAddEventLayoutChange( this.windowResizeHandler );
    }
    // start animation frames if first slider is created
    if (DgdSlider.prototype.sliderList.length == 1) {
      this.startAnimation();
    }
  },

  removeListeners: function() {
    this.wrapper.removeEventListener( 'selectstart', this.selectstartHandler );
    this.wrapper.removeEventListener( 'mousedown',   this.wrapperMousedownHandler );
    this.handle.removeEventListener(  'mousedown',   this.mousedownHandler );
    document.removeEventListener(     'mouseup',     this.mouseupHandler );
    this.wrapper.removeEventListener( 'touchstart',  this.wrapperMousedownHandler );
    this.handle.removeEventListener(  'touchstart',  this.mousedownHandler );
    document.removeEventListener(     'touchend',    this.touchendHandler );
    this.wrapper.removeEventListener( 'mousemove',   this.mousemoveHandler );
    this.wrapper.removeEventListener( 'click',       this.clickHandler );

    this.handle.removeEventListener(  'contextmenu', this.contextmenuHandler );
    this.wrapper.removeEventListener( 'contextmenu', this.contextmenuHandler );
    if (this.autoUpdateLayout) {
      window.removeEventListener(     'resize',      this.windowResizeHandler );
      xRemoveEventLayoutChange( this.windowResizeHandler );
    }
  },

  handleDownHandler: function(e) {
    this.activity = false;
    DgdCursor.refresh(e);

    this.preventDefaults(e, true);
    this.startDrag();
    this.cancelEvent(e);
  },

  wrapperDownHandler: function(e) {
    DgdCursor.refresh(e);
    this.preventDefaults(e, true);
    this.startTap();
  },

  documentUpHandler: function(e) {
    this.stopDrag();
    this.stopTap();
    //this.cancelEvent(e);
  },

  documentResizeHandler: function() {
    if (!this.setup(true)) return;
    this.update();
  },

  enable: function() {
    this.disabled = false;
    xRemoveClass( this.handle, 'Disabled' );
  },

  disable: function() {
    this.disabled = true;
    xAddClass( this.handle, 'Disabled' );
  },

  readonly: function() {
    this.disabled = true;
  },

  setStep: function(x, y, snap) {
    this.setValue(
      this.steps && x > 1 ? (x - 1) / (this.steps - 1) : 0,
      this.steps && y > 1 ? (y - 1) / (this.steps - 1) : 0,
      snap
    );
  },

  setValue: function(x, y, snap) {
    this.setTargetValue([x, y || 0]);
    if(snap) {
      this.groupCopy(this.value.current, this.value.target);
      this.update(); // wabis
    }
  },

  startTap: function(target) {
    if(this.disabled) {
      return;
    }
    this.tapping = true;

    if(target === undefined) {
      target = [
        DgdCursor.x - this.offset.wrapper[0] - (this.handle.offsetWidth / 2),
        DgdCursor.y - this.offset.wrapper[1] - (this.handle.offsetHeight / 2)
      ];
    }
    this.setTargetOffset(target);
  },

  stopTap: function() {
    if(this.disabled || !this.tapping) {
      return;
    }
    this.tapping = false;

    this.setTargetValue(this.value.current);
    this.result();
  },

  startDrag: function() {
    if(this.disabled) {
      return;
    }
    this.offset.mouse = [
      DgdCursor.x - DgdPosition.get(this.handle)[0],
      DgdCursor.y - DgdPosition.get(this.handle)[1]
    ];

    this.dragging = true;
  },

  stopDrag: function() {
    if(this.disabled || !this.dragging) {
      return;
    }
    this.dragging = false;

    var target = this.groupClone(this.value.current);
    if(this.slide) {
      var ratioChange = this.change;
      target[0] += ratioChange[0] * 4;
      target[1] += ratioChange[1] * 4;
    }
    this.setTargetValue(target);
    this.result();
  },

  feedback: function() {
    var value = this.value.current;
    if(this.snap && this.steps > 1) {
      value = this.getClosestSteps(value);
    }
    if(!this.groupCompare(value, this.value.prev)) {
      if(xFunc(this.animationCallback)) {
        //console.log( 'DgdSlider.animationCallback' );
        this.animationCallback(value[0], value[1]);
      }
      this.groupCopy(this.value.prev, value);
    }
  },

  result: function() {
    if(xFunc(this.callback)) {
      //console.log( 'DgdSlider.callback' );
      this.callback(this.value.target[0], this.value.target[1]);
    }
  },

  startAnimation: function() {
    DgdSlider.prototype.animationFrameId = requestAnimationFrame( DgdSlider.prototype.onAnimationFrame );
    this.animate(false, true);
  },

  onAnimationFrame: function( time ) {
    if (DgdSlider.prototype.sliderList.length > 0) {
      DgdSlider.prototype.animationFrameId = requestAnimationFrame( DgdSlider.prototype.onAnimationFrame );
      DgdSlider.prototype.animateAll();
    } else {
      DgdSlider.prototype.animationFrameId = null;
    }
  },

  animateAll: function() {
    var sl = DgdSlider.prototype.sliderList;
    var last = sl.length;
    for (var i = 0; i < last; i++) {
      if (sl[i].IsLife) sl[i].animate();
    }
  },

  animate: function(direct, first) {
    //console.log( 'DgdSlider.animate' );
    if(direct && !this.dragging) {
      return;
    }
    if(this.dragging) {
      var prevTarget = this.groupClone(this.value.target);

      var offset = [
        DgdCursor.x - this.offset.wrapper[0] - this.offset.mouse[0],
        DgdCursor.y - this.offset.wrapper[1] - this.offset.mouse[1]
      ];
      this.setTargetOffset(offset, this.loose);

      this.change = [
        this.value.target[0] - prevTarget[0],
        this.value.target[1] - prevTarget[1]
      ];
    }
    if(this.dragging || first) {
      this.groupCopy(this.value.current, this.value.target);
    }
    if(this.dragging || this.glide() || first) {
      this.update();
      this.feedback();
    }
  },

  glide: function() {
    var diff = [
      this.value.target[0] - this.value.current[0],
      this.value.target[1] - this.value.current[1]
    ];
    if(!diff[0] && !diff[1]) {
      return false;
    }
    if(Math.abs(diff[0]) > this.bounds.xStep || Math.abs(diff[1]) > this.bounds.yStep) {
      this.value.current[0] += diff[0] * this.speed;
      this.value.current[1] += diff[1] * this.speed;
    } else {
      this.groupCopy(this.value.current, this.value.target);
    }
    return true;
  },

  update: function() {
    if(!this.snap) {
      this.offset.current = this.getOffsetsByRatios(this.value.current);
    } else {
      this.offset.current = this.getOffsetsByRatios(
        this.getClosestSteps(this.value.current)
      );
    }
    this.show();
  },

  show: function() {
    //console.log( 'DgdSlider.show' );
    if(!this.groupCompare(this.offset.current, this.offset.prev)) {
      if(this.horizontal) {
        this.handle.style.left = String(this.offset.current[0]) + 'px';
      }
      if(this.vertical) {
        this.handle.style.top = String(this.offset.current[1]) + 'px';
      }
      this.groupCopy(this.offset.prev, this.offset.current);
    }
  },

  setTargetValue: function(value, loose) {
    var target = loose ? this.getLooseValue(value) : this.getProperValue(value);

    this.groupCopy(this.value.target, target);
    this.offset.target = this.getOffsetsByRatios(target);
  },

  setTargetOffset: function(offset, loose) {
    var value = this.getRatiosByOffsets(offset);
    var target = loose ? this.getLooseValue(value) : this.getProperValue(value);

    this.groupCopy(this.value.target, target);
    this.offset.target = this.getOffsetsByRatios(target);
  },

  getLooseValue: function(value) {
    var proper = this.getProperValue(value);
    return [
      proper[0] + ((value[0] - proper[0]) / 4),
      proper[1] + ((value[1] - proper[1]) / 4)
    ];
  },

  getProperValue: function(value) {
    var proper = this.groupClone(value);

    proper[0] = Math.max(proper[0], 0);
    proper[1] = Math.max(proper[1], 0);
    proper[0] = Math.min(proper[0], 1);
    proper[1] = Math.min(proper[1], 1);

    if((!this.dragging && !this.tapping) || this.snap) {
      if(this.steps > 1) {
        proper = this.getClosestSteps(proper);
      }
    }
    return proper;
  },

  getRatiosByOffsets: function(group) {
    return [
      this.getRatioByOffset(group[0], this.bounds.xRange, this.bounds.x0),
      this.getRatioByOffset(group[1], this.bounds.yRange, this.bounds.y0)
    ];
  },

  getRatioByOffset: function(offset, range, padding) {
    return range ? (offset - padding) / range : 0;
  },

  getOffsetsByRatios: function(group) {
    return [
      this.getOffsetByRatio(group[0], this.bounds.xRange, this.bounds.x0),
      this.getOffsetByRatio(group[1], this.bounds.yRange, this.bounds.y0)
    ];
  },

  getOffsetByRatio: function(ratio, range, padding) {
    return Math.round(ratio * range) + padding;
  },

  getClosestSteps: function(group) {
    return [
      this.getClosestStep(group[0]),
      this.getClosestStep(group[1])
    ];
  },

  getClosestStep: function(value) {
    if (this.steps <= 1) return value;
    var n = this.steps - 1;
    return Math.round( value * n ) / n;
  },

  groupCompare: function(a, b) {
    return a[0] == b[0] && a[1] == b[1];
  },

  groupCopy: function(a, b) {
    a[0] = b[0];
    a[1] = b[1];
  },

  groupClone: function(a) {
    return [a[0], a[1]];
  },

  preventDefaults: function(e, selection) {
    if(!e) {
      e = window.event;
    }
    if(e.preventDefault) {
      e.preventDefault();
    }
    e.returnValue = false;

    if(selection && document.selection) {
      document.selection.empty();
    }
  },

  cancelEvent: function(e) {
    if(!e) {
      e = window.event;
    }
    if(e.stopPropagation) {
      e.stopPropagation();
    }
    e.cancelBubble = true;
  }
};

