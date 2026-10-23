// ModelAnimation.js

function AnimatorTask( params, parent ) {
  // ValueType: 'number', 'int', 'bool', 'string'
  // Sweep: 'linear', 'cosine', 'arccos', 'smooth'
  this.Parent = parent;
  this.Root = parent.GetRoot();
  this.Id = -1;

  this.Data = xDefAny( params.Data, null );
  this.ModelRef = xDefAny( params.ModelRef, null );
  this.ValueRef = xDefStr( params.ValueRef, 'value' );
  this.Unit = null;
  if (xStr(params.Unit)) this.Unit = params.Unit;
  this.StartValue = 0;
  this.StartValueFromModel = false;
  this.EndValue = 0;
  if (xDef( params.StartValue )) {
    this.StartValue = this.EndValue = params.StartValue;
  } else {
    this.StartValueFromModel = true;
  }
  if (xDef( params.EndValue )) this.EndValue = params.EndValue;
  this.EndValueFunc = null;
  if (xFunc( params.EndValueFunc )) this.EndValueFunc = params.EndValueFunc;
  this.StopValue = null;
  if (xDef( params.StopValue )) this.StopValue = params.StopValue;

  // detect value type from EndValue
  this.ValueType = 'number';
  if (xNum(this.EndValue)) {
    this.ValueType = 'number';
  } else if (xStr(this.EndValue)) {
    this.ValueType = 'string';
  } else if (xBool(this.EndValue)) {
    this.ValueType = 'bool';
  }
  if (xDefStr(params.ValueType)) this.ValueType = params.ValueType;

  this.FormatValue = xDefFunc( params.FormatValue, null );
  this.SetValueFunc = xDefFuncOrNull( params.SetValueFunc, this.Root.SetValueFunc );
  this.GetValueFunc = xDefFuncOrNull( params.GetValueFunc, this.Root.GetValueFunc );

  this.Delay = xDefNum( params.Delay, 0 );
  this.TimeSpan = xDefNum( params.TimeSpan, 0 );
  this.Speed = xDefNum( params.Speed, 0 );
  this.Sweep = xDefStr( params.Sweep, 'linear' );
  this.SweepFunc = xDefFunc( params.SweepFunc, null );
  if (!this.SweepFunc) {
    if (this.Sweep == 'cosine') {
      this.SweepFunc = function(x) {
        return 0.5 - 0.5 * Math.cos( x * Math.PI );
      };
    } else if (this.Sweep == 'arccos') {
      this.SweepFunc = function(x) {
        return Math.acos( 1 - 2*x ) / Math.PI;
      };
    } else if (this.Sweep == 'smooth') {
      this.SweepFunc = function(x) {
        var xx = 2 * x - 1;
        return 0.5 + (13/24) * (xx - (Math.pow( xx, 13 ) / 13));
      }
    }
  }
  this.OnTaskStart = xDefFunc( params.OnTaskStart, null );
  this.OnTaskEnd = xDefFunc( params.OnTaskEnd, null );
  this.OnStop = xDefFunc( params.OnStop, null );
  this.Condition = xDefFunc( params.Condition, null );

  this.ValueRefId = -1;
  this.Value = 0;
  this.DelayTimerId = -1;
  this.FrameId = -1;
  this.StartTime = 0;
}

AnimatorTask.prototype.Init = function() {
  this.ValueRefId = this.Root.ReqValueRef( this.ModelRef, this.ValueRef, this.Unit );
}

AnimatorTask.prototype.IsSkipToEnd = function() {
  return this.Root.SkipToEnd;
}

AnimatorTask.prototype.Free = function() {
  this.Root = null;
  this.Parent = null;
}

AnimatorTask.prototype.GetRoot = function() {
  return this.Root;
}

AnimatorTask.prototype.Start = function() {
  if (this.OnTaskStart) this.OnTaskStart(this);
  if (this.Condition && !this.Condition(this)) {
    this.DoStop( false );
    return;
  }
  if (this.Delay > 0 && !this.IsSkipToEnd()) {
    this.SetStartAndEndValue();
    if (this.Speed != 0) {
      this.TimeSpan = Math.abs( (this.EndValue-this.StartValue) / this.Speed * 1000 );
    }
    if (this.CheckEnd( -1, false )) return;
    var me = this;
    this.DelayTimerId = this.Root.ReqTimer(
      function(){
        me.DoStart();
      },
      this.Delay
    );
  } else {
    this.DoStart();
  }
}

AnimatorTask.prototype.SetStartAndEndValue = function() {
  if (this.StartValueFromModel) {
    this.Value = this.StartValue = this.GetValue();
  } else {
    this.Value = this.StartValue;
  }
  if (this.EndValueFunc) this.EndValue = this.EndValueFunc( this );
}

AnimatorTask.prototype.DoStart = function() {
  if (this.DelayTimerId >= 0) {
    this.Root.CancelTimer( this.DelayTimerId );
    this.DelayTimerId = -1;
  }
  this.SetStartAndEndValue();
  if (this.Speed != 0) {
    this.TimeSpan = Math.abs( (this.EndValue-this.StartValue) / this.Speed * 1000 );
  }
  if (this.CheckEnd( -1, true )) return;
  this.StartTime = xTimeMS();
  var me = this;
  this.FrameId = this.Root.ReqAnimationFrame(
    function(){
      me.Next();
    }
  );
}

AnimatorTask.prototype.Stop = function() {
  if (this.StopValue) {
    this.EndValue = this.StopValue;
    this.DoStop( true, true );
  } else {
    this.DoStop( false, true );
  }
  if (this.OnStop) this.OnStop(task);
}

AnimatorTask.prototype.DoStop = function( setToEnd, skipCallback ) {
  skipCallback = xDefBool( skipCallback, false );
  this.StartTime = 0;
  if (this.DelayTimerId >= 0) {
    this.Root.CancelTimer( this.DelayTimerId );
    this.DelayTimerId = -1;
  }
  if (this.FrameId >= 0) {
    this.Root.CancelFrame( this.FrameId );
    this.FrameId = -1;
  }
  if (setToEnd) {
    this.Value = this.EndValue;
    this.SetValue( this.EndValue );
  }
  if (this.OnTaskEnd) this.OnTaskEnd(this);
  if (!skipCallback) this.Parent.HandleEndOfTask(this.Id);
}

AnimatorTask.prototype.Next = function() {
  this.FrameId = -1;
  var sweepPos = 1;
  if (this.ValueType == 'number' || this.ValueType == 'int') {
    var time = xTimeMS() - this.StartTime;
    if (this.TimeSpan != 0 && !this.IsSkipToEnd()) {
      sweepPos = time / this.TimeSpan;
      if (sweepPos > 1) sweepPos = 1;
      var sweepValue = sweepPos;
      if (this.SweepFunc) {
        sweepValue = this.SweepFunc( sweepPos );
      }
      this.Value = sweepValue * (this.EndValue - this.StartValue) + this.StartValue;
    } else {
      this.Value = this.EndValue;
    }
    if (this.ValueType == 'int') {
      var offset = this.EndValue > this.StartValue ? -0.4999 : 0.4999;
      this.Value = Math.round(this.Value + offset);
    }
  } else if (this.ValueType == 'bool') {
    this.Value = this.EndValue;
  } else if (this.ValueType == 'string') {
    this.Value = this.EndValue;
  }
  if (this.CheckEnd( sweepPos, true )) return;
  this.SetValue( this.Value );
  var me = this;
  this.FrameId = this.Root.ReqAnimationFrame(
    function(){
      me.Next();
    }
  );
}

AnimatorTask.prototype.GetModel = function( ) {
  return this.Root.GetModel( this.ValueRefId );
}

AnimatorTask.prototype.SetValue = function( value ) {
  if (this.FormatValue) value = this.FormatValue( value, this );
  if (this.SetValueFunc) {
    this.SetValueFunc( value, this.GetModel(), this );
    this.Root.ValueChanged();
  } else {
    this.Root.SetValue( this.ValueRefId, value );
  }
}

AnimatorTask.prototype.GetValue = function() {
  if (this.GetValueFunc) {
    return this.GetValueFunc( this.GetModel(), this );
  } else {
    return this.Root.GetValue( this.ValueRefId );
  }
}

AnimatorTask.prototype.CheckEnd = function( sweepPos, checkTimes ) {
  var isEnd;
  if (this.ValueType == 'number' || this.ValueType == 'int') {
    if (sweepPos >= 0) {
      isEnd = sweepPos >= 1;
    } else {
      if (checkTimes && this.TimeSpan == 0 && this.Speed == 0) {
        isEnd = true;
      } else if (xNum(this.StartValue) && xNum(this.Value)) {
        isEnd = this.EndValue >= this.StartValue ? this.Value >= this.EndValue : this.Value <= this.EndValue;
      } else {
        isEnd = false;
      }
    }
  } else if (this.ValueType == 'bool') {
    if (checkTimes && this.TimeSpan == 0 && this.Speed == 0) {
      isEnd = true;
    } else {
      isEnd = (xBool(this.Value) && this.Value == this.EndValue);
    }
  } else if (this.ValueType == 'string') {
    if (checkTimes && this.TimeSpan == 0 && this.Speed == 0) {
      isEnd = true;
    } else {
      isEnd = (xStr(this.Value) && this.Value == this.EndValue);
    }
  }
  if (isEnd) this.DoStop( true );
  return isEnd;
}

// -----------------------------

function Animator( params, parent ) {
  // Mode: 'serial', 'parallel'
  // RestartAction:  'stop', 'continue', 'restart', 'toEnd'
  params = xDefObj( params, {} );
  parent = xDefObj( parent, null );
  this.Parent = parent;
  this.Root = parent ? parent.GetRoot() : null;
  this.Id = -1;

  this.Mode = xDefStr( params.Mode, 'serial' );
  this.ModelRef = xDefAny( params.ModelRef, null );
  this.Delay = xDefNum( params.Delay, 0 );
  this.OnModelChange = xDefFunc( params.OnModelChange, null );
  this.RestartAction = xDefStr( params.RestartAction, 'stop' );
  this.AutoInit = xDefBool( params.AutoInit, true );

  this.OnTaskStart = xDefFunc( params.OnTaskStart, null );
  this.OnTaskEnd = xDefFunc( params.OnTaskEnd, null );
  this.OnStop = xDefFunc( params.OnStop, null );
  this.Condition = xDefFunc( params.Condition, null );
  this.SetValueFunc = xDefFunc( params.SetValueFunc, null );
  this.GetValueFunc = xDefFunc( params.GetValueFunc, null );

  this.Repeat = xDefNum( params.Repeat, 0 );
  this.LoopIterator = xDefAny( params.LoopIterator, null );
  this.OnLoopInit = xDefFunc( params.OnLoopInit, null );
  this.OnLoopBegin = xDefFunc( params.OnLoopBegin, null );
  this.OnLoopEnd = xDefFunc( params.OnLoopEnd, null );

  this.TaskList = [];
  this.TaskIsActiveList = [];
  this.NumTasks = 0;
  this.CurrTask = 0;
  this.TimerList = [];
  this.TimerCallbackList = [];
  this.FinishedCount = 0;
  this.ModelRefObj = null;
  this.ModelRefList = [];
  this.ValueRefList = [];
  this.UnitList = [];
  this.NumChangedValues = 0;
  this.FrameCallbackList = [];
  this.AnimationFrame = null;
  this.RestartTimerId = null;
  this.DelayTimerId = -1;
  this.IsInitialized = false;
  this.StartIsActive = false;
  this.IsRunning = false;
  this.IsEnding = false;
  this.SkipToEnd = false;
  if (this.AutoInit && this.IsRoot()) {
    var me = this;
    xOnDomReady(
      function(){
        me.Init();
      }
    );
  }
  if (params.AutoStart && this.IsRoot()) {
    var me = this;
    xOnLoad(
      function() {
        me.Start();
      }
    );
  }
}

Animator.prototype.AddTask = function( task ) {
  task.Id = this.NumTasks;
  this.NumTasks++;
  this.TaskList.push( task );
  this.TaskIsActiveList.push( false );
  if (this.IsInitialized && this.AutoInit && this.IsRoot()) {
    // have to initializing new task, if this is already initialized
    task.Init();
  }
  return this;
}

Animator.prototype.Init = function() {
  if (this.IsInitialized) return
  if (this.IsRoot()) {
    this.ModelRefObj = this.GetObjRef( window, this.ModelRef );
  }
  for (var i = 0; i < this.NumTasks; i++) {
    this.TaskIsActiveList[i] = false;
    this.TaskList[i].Init();
  }
  this.IsInitialized = true;
}

Animator.prototype.Free = function() {
  if (this.IsInitialized) {
    for (var i = 0; i < this.NumTasks; i++) {
      this.TaskList[i].Free();
    }
    this.Root = null;
    this.Parent = null;
    this.IsInitialized = false;
  }
}

Animator.prototype.GetRoot = function() {
  if (!this.Parent) return this;
  return this.Parent.GetRoot();
}

Animator.prototype.IsRoot = function() {
  return !this.Parent;
}

Animator.prototype.IsSkipToEnd = function() {
  return this.Root ? this.Root.SkipToEnd : this.SkipToEnd;
}

Animator.prototype.FindValueRef = function( modelRef, valueRef, unit ) {
  if (!xDef(unit)) unit = null;
  var numRefs = this.ModelRefList.length;
  for (var id = 0; id < numRefs; id++) {
    if (this.ModelRefList[id] == modelRef && this.ValueRefList[id] == valueRef && this.UnitList[id] == unit) return id;
  }
  return -1;
}

Animator.prototype.GetObjRef = function( base, ref ) {
  // base: Object = Root-ModelRefObj or window
  // ref: null or Object or String =
  // null -> return base
  // Object -> return ref
  // String = 'DOM.any...' -> return DOM Element
  // String = '.any...' -> return base.any...
  // String = 'any...' -> return window.any...
  var objRef = base;
  if (xStr(ref)) {
    ref = ref.replace( /\[([^\]]+)\]/g, '.$1' );
    var refList = ref.split('.');
    var start = 0;
    if (refList[0] == 'DOM') {
      objRef = xGet(refList[1]);
      start += 2;
    } else if (refList[0] == '') {
      start++;
    }
    for (var i = start; i < refList.length; i++) {
      objRef = objRef[refList[i]];
    }
  } else if (xObj(ref)) {
    objRef = ref;
  }
  return objRef;
}

Animator.prototype.ReqValueRef = function( modelRef, valueRef, unit ) {
  var objRef = this.GetObjRef( this.ModelRefObj, modelRef );
  // handle sub properties and array indexes in valueRef
  valueRef = valueRef.replace( /\[([^\]]+)\]/g, '.$1' );
  var refParts = valueRef.split('.');
  var last = refParts.length-1;
  for (var i = 0; i < last; i++) {
    objRef = objRef[refParts[i]];
  }
  valueRef = refParts[last];
  // save refs
  var id = this.FindValueRef( objRef, valueRef, unit );
  if (id >= 0) return id;
  id = this.ModelRefList.length;
  this.ModelRefList.push( objRef );
  this.ValueRefList.push( valueRef );
  this.UnitList.push( unit );
  return id;
}

Animator.prototype.GetModel = function( valueRefId ) {
  if (xNum(valueRefId)) {
    return this.ModelRefList[valueRefId];
  } else {
    if (!this.IsInitialized) this.Init();
    return this.ModelRefObj;
  }
}

Animator.prototype.GetValue = function( valueRefId ) {
  var modelRef = this.GetModel( valueRefId );
  var value = modelRef[this.ValueRefList[valueRefId]];
  if (xStr(value) && value != '' && this.UnitList[valueRefId]) {
    value = parseFloat(value);
  }
  return value;
}

Animator.prototype.SetValue = function( valueRefId, value ) {
  var oldValue = this.GetValue( valueRefId );
  if (oldValue != value) {
    if (this.UnitList[valueRefId]) value += this.UnitList[valueRefId];
    var modelRef = this.GetModel( valueRefId );
    modelRef[this.ValueRefList[valueRefId]] = value;
    this.NumChangedValues++;
  }
}

Animator.prototype.ValueChanged = function( ) {
  if (this.IsRoot()) {
    this.NumChangedValues++;
  } else {
    this.Root.ValueChanged();
  }
}

Animator.prototype.Start = function() {

  if (this.IsRoot()) {
    if (!this.IsInitialized) this.Init();

    // if Start is called recursivly then queue restart and return
    if (this.StartIsActive) {
      if (!this.RestartTimerId) {
        var me = this;
        this.RestartTimerId = requestAnimationFrame(
          function(){
            me.Start();
          }
        );
      }
      return;
    }
    this.RestartTimerId = null;
  }

  if (this.IsRoot() && this.IsRunning) {
    if (this.RestartAction == 'restart') {
      this.Stop();
    } else if (this.RestartAction == 'stop') {
      this.Stop();
      return;
    } else if (this.RestartAction == 'toEnd') {
      this.GenerateAllTimerAndFrameEventsNow();
      this.SkipToEnd = false;
      this.Stop();
      return;
    } else {
      // RestartAction == 'continue'
      return;
    }
  }

  if (this.IsRoot()) this.StartIsActive = true;
  this.IsRunning = true;

  if (this.OnTaskStart) this.OnTaskStart(this);

  if (this.Condition && !this.Condition(this)) {
    this.DoStop();
    if (this.IsRoot()) this.StartIsActive = false;
    return;
  }

  this.LoopInit();

  if (this.LoopBegin()) {
    this.PrepareStart();
  } else {
    this.DoStop();
  }
  if (this.IsRoot()) this.StartIsActive = false;

}

Animator.prototype.FastAnimateToEnd = function() {
  this.GenerateAllTimerAndFrameEventsNow();
  this.SkipToEnd = false;
}

Animator.prototype.PrepareStart = function() {
  if (this.Delay > 0 && !this.IsSkipToEnd()) {

    var me = this;
    this.DelayTimerId = this.GetRoot().ReqTimer(
      function(){
        me.DoStart();
      },
      this.Delay
    );

  } else {

    this.DoStart();

  }
}

Animator.prototype.DoStart = function() {

  this.IsEnding = false;
  if (this.Mode == 'parallel') {

    this.FinishedCount = 0;
    for (var i = 0; i < this.NumTasks; i++) {
      this.TaskIsActiveList[i] = true;
      this.TaskList[i].Start();
    }

  } else {

    this.CurrTask = 0;
    if (this.CurrTask < this.NumTasks) {
      this.TaskIsActiveList[this.CurrTask] = true;
      this.TaskList[this.CurrTask].Start();
    }

  }

  if (this.IsSkipToEnd()) {
    this.GenerateAllTimerAndFrameEventsNow();
    this.SkipToEnd = false;
  }

  if (this.IsRoot()) this.UpdateModel();
}

Animator.prototype.GenerateAllTimerAndFrameEventsNow = function() {
  if (!this.IsRoot()) return;
  this.SkipToEnd = true;
  this.GenerateAllTimerEventsNow();
  // error?
  //if (!this.AnimationFrame) {
  if (this.AnimationFrame) {
    this.OnFrame();
  }
}

Animator.prototype.Stop = function() {
  // stop queued Start calls
  if (this.RestartTimerId) {
    cancelAnimationFrame( this.RestartTimerId );
    this.RestartTimerId = null;
  }
  // cancel delay timer
  if (this.DelayTimerId >= 0) {
    this.GetRoot().CancelTimer( this.DelayTimerId );
    this.DelayTimerId = -1;
  }
  // cancel animation frame events
  if (this.AnimationFrame) {
    cancelAnimationFrame( this.AnimationFrame );
    this.AnimationFrame = null;
  }
  this.FrameCallbackList = [];
  // stop all subtasks
  for (var i = 0; i < this.NumTasks; i++) {
    if (this.TaskIsActiveList[i]) {
      this.TaskList[i].Stop();
      this.TaskIsActiveList[i] = false;
    }
  }
  if (this.IsRoot()) {
    this.CancelAllTimers();
  }
  this.IsEnding = false;
  this.NumChangedValues = 0;
  if (this.IsRoot()) this.SkipToEnd = false;
  if (!this.IsRunning) return;

  this.DoStop( true );
  if (this.OnStop) this.OnStop(this);
  if (this.IsRoot() && this.OnModelChange) this.OnModelChange( this.ModelRefObj, this );
}

Animator.prototype.DoStop = function( skipCallback ) {
  skipCallback = xDefBool( skipCallback, false );
  this.SkipToEnd = false;
  this.IsRunning = false;
  if (this.OnTaskEnd) this.OnTaskEnd(this);
  if (this.Parent && !skipCallback) this.Parent.HandleEndOfTask(this.Id);
}

Animator.prototype.HandleEndOfTask = function( taskId ) {
  this.TaskIsActiveList[taskId] = false;
  this.Next();
}

Animator.prototype.Next = function() {
  var isEnd;
  if (this.Mode == 'parallel') {
    this.FinishedCount++;
    isEnd = this.FinishedCount == this.NumTasks;
  } else {
    this.CurrTask++;
    isEnd = (this.CurrTask >= this.NumTasks);
    if (!isEnd) {
      this.TaskIsActiveList[this.CurrTask] = true;
      this.TaskList[this.CurrTask].Start();
    }
  }
  if (isEnd) {
    if (!this.LoopEnd() && this.LoopBegin()) {
      // restart this animation
      this.PrepareStart();
      isEnd = false;
    }
  }
  if (isEnd) {
    if (this.IsRoot()) {
      this.IsEnding = true;
      this.IsRunning = false;
    } else {
      this.DoStop();
    }
  }
}

Animator.prototype.LoopInit = function() {
  if (this.Repeat != 0) {
    this.LoopIterator = 0;
  } else {
    if (this.OnLoopInit) this.OnLoopInit( this );
  }
}

Animator.prototype.LoopBegin = function() {
  if (this.Repeat < 0) {
    return true;
  } else if (this.Repeat > 0) {
    return this.LoopIterator < this.Repeat;
  } else if (this.OnLoopBegin) {
    return xDefBool( this.OnLoopBegin( this ), true );
  }
  return true;
}

Animator.prototype.LoopEnd = function() {
  if (this.IsSkipToEnd()) return true;
  if (this.Repeat != 0) {
    this.LoopIterator++;
    return false;
  } else if (this.OnLoopEnd) {
    return xDefBool( this.OnLoopEnd( this ), false );
  }
  return true;
}

Animator.prototype.ReqAnimationFrame = function( callbackFunc ) {
  var id = this.FrameCallbackList.length;
  var isFirstCallback = (id == 0);
  this.FrameCallbackList.push( callbackFunc );
  if (isFirstCallback && !this.IsSkipToEnd()) {
    var me = this;
    this.AnimationFrame = requestAnimationFrame(
      function(){
        me.OnFrame();
      }
    );
  }
  return id;
}

Animator.prototype.ReqTimer = function( callbackFunc, delay ) {
  var me = this;
  var id = this.TimerList.length;
  var timer = setTimeout(
    function(){
      me.OnTimer(id);
    },
    delay
  );
  this.TimerList.push( timer );
  this.TimerCallbackList.push( callbackFunc );
  return id;
}

Animator.prototype.CancelTimer = function( timerId ) {
  if (timerId >= this.TimerList.length || timerId < 0) return;
  var timer = this.TimerList[timerId];
  if (timer) {
    clearTimeout( timer );
    this.TimerList[timerId] = null;
    this.TimerCallbackList[timerId] = null;
  }
}

Animator.prototype.OnTimer = function( timerId ) {
  var callbackFunc = this.TimerCallbackList[timerId];
  this.TimerList[timerId] = null;
  this.TimerCallbackList[timerId] = null;
  if (callbackFunc) callbackFunc();
  this.UpdateModel()
}

Animator.prototype.CancelAllTimers = function() {
  var timerList = this.TimerList;
  var numTimers = timerList.length;
  if (numTimers == 0) return;
  for (var i = 0; i < numTimers; i++) {
    var timer = timerList[i];
    if (timer) clearTimeout( timer );
  }
  this.TimerList = [];
  this.TimerCallbackList = [];
}

Animator.prototype.GenerateAllTimerEventsNow = function() {
  if (this.TimerList.length == 0) return;
  do {
    var timerList = this.TimerList;
    var timerCallbackList = this.TimerCallbackList;
    this.TimerList = [];
    this.TimerCallbackList = [];
    var numTimers = timerList.length
    for (var i = 0; i < numTimers; i++) {
      var timer = timerList[i];
      if (timer) clearTimeout( timer );
    }
    for (var i = 0; i < numTimers; i++) {
      var callbackFunc = timerCallbackList[i];
      if (callbackFunc) callbackFunc();
    }
  } while( this.TimerList.length > 0);
}

Animator.prototype.CancelFrame = function( frameId ) {
  if (frameId >= this.FrameCallbackList.length || frameId < 0) return;
  this.FrameCallbackList[frameId] = null;
}

Animator.prototype.OnFrame = function() {
  this.AnimationFrame = null;
  do {
    // Note: we have to store the FrameCallbackList locally in callbackList, because
    // calls to callbackFunc() adds generally new entries into FrameCallbackList while
    // the old callbackList is still in process.
    var callbackList = this.FrameCallbackList;
    this.FrameCallbackList = [];
    var numFrames = callbackList.length;
    for (var i = 0; i < numFrames; i++) {
      var callbackFunc = callbackList[i];
      if (callbackFunc) callbackFunc();
    }

    // Note: a call to callbackFunc() generally adds entries to the FrameCallbackList
    // which will be processed by the next animation frame. But if
    // IsSkipToEnd() is true, no animation frame is setup and we will process
    // all entries in a loop, until all tasks have endet.
  } while (this.IsSkipToEnd() && this.FrameCallbackList.length > 0);

  this.UpdateModel();
}

Animator.prototype.UpdateModel = function() {
  if (this.OnModelChange && this.NumChangedValues > 0) this.OnModelChange( this.ModelRefObj, this );
  this.NumChangedValues = 0;
  if (this.IsEnding) {
    this.DoStop();
  }
  this.IsEnding = false;
}

function NewAnimation( params, parent ) {
  // params = <AnimatorDef>
  // parent = Animator or null or undefined
  // AnimatorDef = { <AnimatorParams>, TaskList: [ <TaskDef>, ... ] }
  // TaskDef = { <TaskParams> } | { <AnimatorDef> } | [ <TaskDef>, ... ]
  //
  function LinearizeTaskDefList( taskList ) {
    var linearTaskList = [];
    var nTask = taskList.length;
    var nAnimators = 0;
    for (var i = 0; i < nTask && nAnimators == 0; i++) if (xArray(taskList[i])) nAnimators++;
    if (nAnimators == 0) return taskList;
    for (var i = 0; i < nTask; i++) {
      var taskOrArray = taskList[i];
      if (xArray(taskOrArray)) {
        var alen = taskOrArray.length;
        for (var j = 0; j < alen; j++) linearTaskList.push( taskOrArray[j] );
      } else {
        linearTaskList.push( taskOrArray );
      }
    }
    return LinearizeTaskDefList( linearTaskList );
  };

  parent = xDefObj( parent, null );
  var animator = new Animator( params, parent );
  var taskDefList = LinearizeTaskDefList( params.TaskList );
  var nTaskDefs = taskDefList.length;
  for (var i = 0; i < nTaskDefs; i++) {
    var task;
    var taskDef = taskDefList[i];
    if (xArray(taskDef.TaskList)) {
      // recursion
      task = NewAnimation( taskDef, animator );
    } else {
      task = new AnimatorTask( taskDef, animator );
    }
    animator.AddTask( task );
  }
  return animator;
}


// ----------------------------------------------------

function ModelAnimation( params, isParentClass ) {
  isParentClass = xDefBool( isParentClass, false );
  params = xDefObj( params, {} );
  this.CurrState = xDefNum( params.CurrState, 0 );
  this.TargetState = this.CurrState;
  this.NStates = xDefNum( params.NStates, 0 );
  this.ModelRef = xDefAny( params.ModelRef, null );
  this.OnModelChange = xDefFunc( params.OnModelChange, null );
  this.OnAfterStateChange = xDefFuncOrNull( params.OnAfterStateChange, null );
  this.OnStopPlaying = xDefFuncOrNull( params.OnStopPlaying, null );
  this.PauseTime = xDefNum( params.PauseTime, 1000 );
  this.Repeat = xDefNum( params.Repeat, 0 );
  this.AutoPlay = xDefBool( params.AutoPlay, false );
  this.AutoInit = xDefBool( params.AutoInit, true );
  this.SetStateFuncList = [];
  this.ToStateAnimationList = [];
  this.ResizeStateLists( this.NStates - 1 );
  this.IsRunning = false;
  this.IsPlaying = false;
  this.CurrAnimation = null;
  this.AnimationOnTaskEnd = null;
  this.PauseTimer = null;
  if (!isParentClass && this.AutoInit) {
    var me = this;
    xOnLoad(
      function(){
        me.Init();
      }
    );
  }
}

function NewModelAnimation( params ) {
  return new ModelAnimation( params );
}

ModelAnimation.prototype.Init = function( ) {
  this.ModelAnimationInit();
}

ModelAnimation.prototype.ModelAnimationInit = function( ) {
  // private function
  this.SetStateNoStop( this.CurrState, false, false );
  if (this.AutoPlay) {
    this.IsPlaying = true;
    this.PlayNext( 0 );
  }
}

ModelAnimation.prototype.ResizeStateLists = function( state ) {
  for (var i = this.NStates; i <= state; i++) {
    this.SetStateFuncList[i] = null;
    this.ToStateAnimationList[i] = null;
  }
  this.NStates = this.SetStateFuncList.length;
}

ModelAnimation.prototype.UpdateModel = function() {
  this.ModelAnimationUpdateModel();
}

ModelAnimation.prototype.ModelAnimationUpdateModel = function() {
  // private function
  if (this.OnModelChange) this.OnModelChange( this );
}

ModelAnimation.prototype.Reset = function() {
  this.SetState(0);
}

ModelAnimation.prototype.ResetToState = function( targetState ) {
  // set internal state to targetState without Stop(), SetState() or execution of any animation
  if (targetState < 0) tragetState = 0;
  if (targetState >= this.NStates) targetState = this.NStates - 1;
  this.CurrState = this.TargetState = targetState;
  if (this.OnAfterStateChange) this.OnAfterStateChange( this, targetState );
}

ModelAnimation.prototype.SetState = function( targetState ) {
  this.Stop();
  this.SetStateNoStop( targetState );
}

ModelAnimation.prototype.SetStateNoStop = function( targetState, skipAnimation, playNext ) {
  // Note: if no setStepFunc is installed for targetState and skipAnimation = false and
  // an animtion to targetState is defined, then the animation is
  // executed in fast forward mode to set the model state
  // private function

  skipAnimation = xDefBool( skipAnimation, false );
  playNext = xDefBool( playNext, true );

  if (targetState < 0) targetState = 0;
  if (targetState >= this.NStates) targetState = this.NStates - 1;
  this.TargetState = targetState;

  var setStateFunc = this.SetStateFuncList[targetState];
  var animation = this.ToStateAnimationList[targetState];

  if (setStateFunc || skipAnimation || !animation) {

    if (setStateFunc) {
      setStateFunc( this, targetState );
    }
    this.CurrState = targetState;
    if (this.OnAfterStateChange) {
      this.OnAfterStateChange( this, targetState );
    }
    this.UpdateModel();

  } else {

    // if (!setStateFunc && !skipAnimation && animation) use animtion in fast forward mode
    this.ToStateNoStop( targetState );
    animation.FastAnimateToEnd();
    // OnAnimationEnd is called and there SetStateNoStop with skipAnimtion = true
  }

  if (playNext && this.IsPlaying) {
    this.PlayNext( this.PauseTime );
  }
}

ModelAnimation.prototype.SetNextState = function( wrap ) {
  wrap = xDefBool( wrap, false );
  var targetState = this.CurrState + 1;
  if (targetState >= this.NStates) targetState = wrap ? 0 : this.NStates-1;
  this.SetState( targetState );
}

ModelAnimation.prototype.SetPrevState = function( wrap ) {
  wrap = xDefBool( wrap, false );
  var targetState = this.CurrState - 1;
  if (targetState < 0) targetState = wrap ? this.NStates-1 : 0;
  this.SetState( targetState );
}

ModelAnimation.prototype.ToState = function( targetState ) {
  this.Stop();
  this.ToStateNoStop( targetState );
}

ModelAnimation.prototype.ToStateNoStop = function( targetState ) {
  // private function
  var animation, prevState;
  if (targetState >= this.NStates) targetState = this.NStates - 1;
  if (targetState < 0) targetState = 0;
  animation = this.ToStateAnimationList[targetState];
  if (animation) {
    this.TargetState = targetState;
    var me = this;
    this.AnimationOnTaskEnd = animation.OnTaskEnd;
    animation.OnTaskEnd = function() { me.OnAnimationEnd(); };
    this.CurrAnimation = animation;
    this.IsRunning = true;
    animation.Start();
  } else {
    this.SetStateNoStop( targetState, true, true );
  }
}

ModelAnimation.prototype.Next = function( wrap ) {
  wrap = xDefBool( wrap, false );
  if (this.CurrState != this.TargetState) {
    if (this.IsRunning) {
      this.SetState( this.TargetState );
    } else {
      // animation has stopt, restart animation
      this.ToState( this.TargetState );
    }
  } else {
    var targetState = this.CurrState + 1;
    if (targetState < this.NStates || wrap) {
      // animate to target state if not at last state or wrapping is enabled
      if (targetState >= this.NStates) targetState = 0;
      this.ToState( targetState );
    } else {
      // else reset to current state
      this.SetState( this.CurrState );
    }
  }
}

ModelAnimation.prototype.Prev = function( wrap ) {
  wrap = xDefBool( wrap, false );
  if (this.CurrState != this.TargetState) {
    if (this.IsRunning) {
      this.SetState( this.TargetState );
    } else {
      // animation has stopt, restart animation
      this.ToState( this.TargetState );
    }
  } else {
    var targetState = this.CurrState - 1;
    if (targetState >= 0 || wrap) {
      // animate to target state if not at first state or wrapping is enabled
      if (targetState < 0) targetState = this.NStates - 1;
      this.ToState( targetState );
    } else {
      // else reset to current state
      this.SetState( this.CurrState );
    }
  }
}

ModelAnimation.prototype.Stop = function() {
  if (this.PauseTimer) {
    clearTimeout( this.PauseTimer );
    this.PauseTimer = null;
  }
  this.IsPlaying = false;
  this.Repeat = 0;
  if (!this.IsRunning) return;
  var me = this;
  this.CurrAnimation.OnTaskEnd = function(){
    me.OnAnimationStop();
  };
  this.CurrAnimation.Stop(); // calls OnTastEnd = OnAnimationStop
}


ModelAnimation.prototype.StopSkip = function() {
  this.SetState( this.TargetState );
}

ModelAnimation.prototype.StopUndo = function() {
  this.SetState( this.CurrState );
}

ModelAnimation.prototype.Play = function( repeat, pauseTime ) {
  if (this.IsPlaying) {
    this.Stop();
    return;
  }
  this.Repeat = xDefNum( repeat, 0 );
  this.PauseTime = xDefNum( pauseTime, this.PauseTime );
  this.IsPlaying = true;
  this.PlayNext( 0, true );
}

ModelAnimation.prototype.PlayNext = function( pauseTime, restart ) {
  // private function
  // require( !this.IsRunning );
  if (!this.IsPlaying) return;
  pauseTime = xDefNum( pauseTime, this.PauseTime );
  restart = xDefBool( restart, false );
  var isLastState = (this.CurrState == this.NStates - 1);
  var replay = true;
  if (isLastState && !restart) {
    if (this.Repeat > 0) this.Repeat--;
    replay = this.Repeat != 0;
  }
  if (!replay) {
    // end of states and no repeating -> stop playing
    this.IsPlaying = false;
    if (this.OnStopPlaying) this.OnStopPlaying( this );
    return;
  }
  // start animation to next state after PauseTime
  var me = this;
  this.PauseTimer = setTimeout(
    function(){
      me.OnEndOfPause();
    },
    pauseTime
  );
}

ModelAnimation.prototype.OnEndOfPause = function() {
  // private function, timer event handler
  if (this.PauseTimer) {
    clearTimeout( this.PauseTimer );
    this.PauseTimer = null;
  }
  var targetState = this.CurrState + 1;
  if (targetState >= this.NStates) targetState = 0;
  this.ToStateNoStop( targetState );
}

ModelAnimation.prototype.OnAnimationEnd = function() {
  // private function
  this.HandleAnimationEnd();
  this.SetStateNoStop( this.TargetState, true, true );
}

ModelAnimation.prototype.OnAnimationStop = function() {
  // private function
  this.HandleAnimationEnd();
  if (this.OnAfterStateChange) this.OnAfterStateChange( this, this.CurrState );
  this.UpdateModel();
}

ModelAnimation.prototype.HandleAnimationEnd = function() {
  // private function
  if (!this.IsRunning) return;
  var animation = this.CurrAnimation;
  this.CurrAnimation = null;
  var originalOnTaskEnd = this.AnimationOnTaskEnd;
  animation.OnTaskEnd = originalOnTaskEnd;
  this.AnimationOnTaskEnd = null;
  this.IsRunning = false;
  if (originalOnTaskEnd) originalOnTaskEnd( animation );
}

ModelAnimation.prototype.OnSetState = function( id, func ) {
  this.ResizeStateLists( id );
  this.SetStateFuncList[id] = func;
}

ModelAnimation.prototype.AnimationToState = function( id, params ) {
  if (!xAny(params.ModelRef) && xAny(this.ModelRef)) {
    params.ModelRef = this.ModelRef;
  }
  if (!xFunc(params.OnModelChange) && xFunc(this.OnModelChange)) {
    params.OnModelChange = this.OnModelChange;
  }
  return this.ModelAnimationToState( id, params );
}

ModelAnimation.prototype.ModelAnimationToState = function( id, params ) {
  // private function
  var animation = NewAnimation( params );
  this.ResizeStateLists( id );
  this.ToStateAnimationList[id] = animation;
  return animation;
}
