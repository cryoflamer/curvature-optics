

var AnimationSpeed = 1;  // > 0

/* Demos Manager */

var Demos = {
  DemoList: [],
  CurrDemo: null,
  LastDemo: null,
  SusDemo: null,
  SusState: 0,
  CurrModAnim: null,
  CurrAnimStep: 0,

  Init: function() {
    // init custom demos
    try {
      InitCustomDemo();
    } catch(e) {}
    // installed demo button click handlers
    var nDemos = this.DemoList.length;
    for (var i = 0; i < nDemos; i++) {
      this.AddButtonClickHandler( i );
    }
  },

  AddButtonClickHandler: function( id ) {
    // id as DemoList index or demo name
    if (xStr(id)) id = this.Find(id);
    var demoName = this.DemoList[id].Name;
    Tabs.AddButtonClickHandler( 'CurveDemosTabs', demoName + 'Button',
      function( buttonData, event ) {
        if (Demos.IsCurrDemoName(demoName) && Demos.IsPlaying()) {
          Demos.Next( false, !Demos.IsTargetIsEndPos() );
        } else {
          Demos.Play( demoName, true );
        }
      }
    );
  },

  SetButtonText: function( text, button ) {
    button = xDefStr( button, 'Custom' );
    var buttonName = button + 'Button';
    xRemoveClass( buttonName, 'TabHide' );
    xInnerHTML( buttonName, text );
  },

  Reset: function() {
    this.Stop();
    this.LastDemo = this.CurrDemo;
    if (this.CurrDemo) {
      this.SusDemo = this.CurrDemo;
      this.SusState = this.CurrDemo.Anim.CurrState;
    }
    this.CurrDemo = null;
    this.UpdateDemoPanels();
  },

  Find: function( name ) {
    var nDemos = this.DemoList.length;
    for (var i = 0; i < nDemos; i++) {
      if (this.DemoList[i].Name == name) return i;
    }
    return -1;
  },

  UpdateDemoPanels: function() {
    if (this.LastDemo) {
      xRemoveClass( this.LastDemo.Name + 'Button', 'TabActive' );
      this.LastDemo = null;
    }
    if (this.CurrDemo) {
      xAddClass( 'BackButton', 'TabEnabled' );
      xAddClass( 'PlayButton', 'TabEnabled' );
      xAddClass( 'ForwButton', 'TabEnabled' );
      xAddClass( 'CountButton', 'TabEnabled' );
      if (this.IsPlaying()) {
        xInnerHTML( 'PlayButton', 'Stop' );
        xAddClass( 'PlayButton', 'TabActive' );
      } else {
        xInnerHTML( 'PlayButton', 'Play' );
        xRemoveClass( 'PlayButton', 'TabActive' );
      }
      var pos = this.GetCurrPos() + 1;
      if (this.IsEndPos()) {
        pos = 'end';
      } else {
        pos = pos.toFixed(0);
      }
      xInnerHTML( 'CountButton', pos );
      xAddClass( this.CurrDemo.Name + 'Button', 'TabActive' );
    } else {
      if (this.SusDemo) {
        xInnerHTML( 'PlayButton', 'Resume' );
        xAddClass( 'PlayButton', 'TabEnabled' );
        xAddClass( 'PlayButton', 'TabActive' );
        xInnerHTML( 'CountButton', (this.SusState+1).toFixed(0) );
      } else {
        xInnerHTML( 'PlayButton', 'Play' );
        xInnerHTML( 'CountButton', 'x' );
        xRemoveClass( 'PlayButton', 'TabEnabled' );
      }
      xRemoveClass( 'CountButton', 'TabEnabled' );
      xRemoveClass( 'BackButton', 'TabEnabled' );
      xRemoveClass( 'ForwButton', 'TabEnabled' );
    }
  },

  New: function( name, moreInfos ) {
    // returns ModelAnimation
    moreInfos = xDefStr( moreInfos, '' );
    var anim = NewModelAnimation( {
      ModelRef: CurveApp,
      OnModelChange: function(){ UpdateAll(false); },
      PauseTime: 0,
      OnAfterStateChange: function( anim, state ) { Demos.UpdateDemoPanels(); },
      OnStopPlaying: function( anim, state ){ Demos.UpdateDemoPanels(); }
    } );
    var demo = {
      Name: name,
      Anim: anim,
      More: moreInfos,
    };
    var i = this.Find( name );
    if (i >= 0) {
      this.DemoList[i] = demo;
    } else {
      this.DemoList.push( demo );
    }
    this.CurrModAnim = anim;
    this.CurrAnimStep = 0;
    return anim;
  },

  AddState: function( jsonState ) {
    var anim = this.CurrModAnim;
    if (!anim) return;
    anim.OnSetState( this.CurrAnimStep,
      function() {
        // prevent setting state for inactive demos
        if (Demos.CurrDemo && Demos.CurrDemo.Anim == anim) {
          JsonToAppState( jsonState );
        }
      }
    );
    this.CurrAnimStep++;
  },

  AddAnimation: function( animDef ) {
    var anim = this.CurrModAnim;
    if (!anim) reurn;
    anim.AnimationToState( this.CurrAnimStep, animDef );
  },

  IsActive: function() {
    return this.CurrDemo != null;
  },

  IsCurrDemoName: function( name ) {
    if (!this.CurrDemo) return false;
    return this.CurrDemo.Name == name;
  },

  IsPlaying: function() {
    if (!this.CurrDemo) return false;
    return this.CurrDemo.Anim.IsPlaying;
  },

  IsTransient: function() {
    if (!this.CurrDemo) return false;
    var anim = this.CurrDemo.Anim;
    return anim.CurrState != anim.TargetState;
  },

  GetCurrPos: function() {
    if (!this.CurrDemo) return 0;
    return this.CurrDemo.Anim.CurrState;
  },

  GetNStates: function() {
    if (!this.CurrDemo) return 0;
    return this.CurrDemo.Anim.NStates;
  },

  GetLastPos: function() {
    if (!this.CurrDemo) return 0;
    return this.CurrDemo.Anim.NStates-1;
  },

  IsStartPos: function() {
    return this.GetCurrPos() == 0;
  },

  IsEndPos: function() {
    if (!this.CurrDemo) return false;
    var anim = this.CurrDemo.Anim;
    return anim.CurrState == anim.NStates-1;
  },

  IsTargetIsEndPos: function() {
    if (!this.CurrDemo) return false;
    var anim = this.CurrDemo.Anim;
    return anim.TargetState == anim.NStates-1;
  },

  Stop: function() {
    if (!this.CurrDemo) return;
    this.CurrDemo.Anim.Stop();
    this.UpdateDemoPanels();
  },

  SetPos: function( pos, play ) {
    if (!this.CurrDemo) return;
    this.Stop();
    var anim = this.CurrDemo.Anim;
    if (pos > anim.NStates-1) pos = anim.NStates-1;
    if (pos < 0) pos = 0;
    anim.SetState( pos );
    if (play) this.Play();
  },

  Next: function( wrap, play ) {
    if (this.IsEndPos()) {
      if (wrap) {
        this.SetPos( 0, play );
      } else {
        this.SetPos( this.GetCurrPos() );
      }
    } else {
      this.SetPos( this.GetCurrPos()+1, play );
    }
  },

  Prev: function( wrap, play ) {
    if (this.IsTransient()) {
      this.SetPos( this.GetCurrPos(), play );
    } else {
      if (this.IsStartPos()) {
        if (wrap) {
          this.SetPos( this.GetNStates()-1, play );
        } else {
          this.SetPos( 0, play );
        }
      } else {
        this.SetPos( this.GetCurrPos()-1, play );
      }
    }
  },

  Step: function( wrap, back, play ) {
    if (back) {
      this.Prev( wrap, play );
    } else {
      this.Next( wrap, play );
    }
  },

  IsNewName: function( name ) {
    return this.CurrDemo && this.CurrDemo.Name != name;
  },

  RequestName: function( name ) {
    if (!xStr(name)) {
      if (!this.CurrDemo) return '';
      name = this.CurrDemo.Name;
    }
    return name;
  },

  Play: function( name, reset ) {
    // name: string; name of a new demo or null for current demo
    name = this.RequestName( name );
    if (name == '') return;
    if (this.IsCurrDemoName(name)) {
      if (this.IsPlaying()) return;
    } else {
      this.Stop();
    }

    // assert: !this.IsPlaying() -> start new demo or restart curr demo
    if (!this.IsCurrDemoName(name)) {
      this.SetNewDemo( name );
    }
    if (reset) this.CurrDemo.Anim.Reset();
    this.CurrDemo.Anim.Play();
    this.UpdateDemoPanels();
  },

  SetDemo: function( name, play, pos ) {
    // name: string; name of a new demo or null for current demo
    pos = xDefNum( pos, 0 );
    this.Stop();
    if (this.IsCurrDemoName(name)) {
      this.SetPos( pos, play );
      return;
    }

    // assert: !this.IsPlaying() -> start new demo
    this.SetNewDemo( name );
    this.SetPos( pos, play );
  },

  SetSusDemo: function( play ) {
    if (!this.SusDemo) return;
    this.SetDemo( this.SusDemo.Name, play, this.SusState );
  },

  SetNewDemo: function( name ) {
    // private function
    var i = this.Find( name );
    if (i < 0) return;
    this.LastDemo = this.CurrDemo;
    this.CurrDemo = this.DemoList[i];
    ShowMoreInfos( this.CurrDemo.More );
  },

  PlayStop: function( cont ) {
    if (!this.CurrDemo) return;
    if (this.IsPlaying()) {
      this.Stop();
      return;
    }
    // not playing
    if (this.IsTransient() && !cont) {
      this.Prev();
    }
    this.Play();
  },
};

xOnLoad(
  function(){
    Demos.Init();
    Tabs.AddButtonClickHandler( 'CurveDemosTabs', 'ResetButton',
      function( buttonData ) {
        ResetApp();
      }
    );
  }
);
xOnDomReady(
  function() {
    var boxTabName = 'CurveSettingsTabs';
    Tabs.AddButtonClickHandler( boxTabName, 'BackButton',
      function( buttonData ) {
        Demos.Prev();
      }
    );
    Tabs.AddButtonClickHandler( boxTabName, 'ForwButton',
      function( buttonData ) {
        Demos.Next( true );
      }
    );
    Tabs.AddButtonClickHandler( boxTabName, 'PlayButton',
      function( buttonData ) {
        if (Demos.IsActive()) {
          if (Demos.IsPlaying()) {
            Demos.Stop();
          } else {
            Demos.Play();
          }
        } else {
          Demos.SetSusDemo();
        }
      }
    );
    Tabs.AddButtonClickHandler( boxTabName, 'CountButton',
      function( buttonData ) {
        if (Demos.IsEndPos()) {
          Demos.SetPos( 0 );
        } else {
          Demos.SetPos( Demos.GetLastPos() );
        }
      }
    );
  }
);


function ResetApp() {
  Demos.Reset();
  JsonToAppState(
    'CurveApp = { "DemoText": "", "Description": "", "Height": 100, "FocalLengthField": 33.9, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 45, "showModel": 1, "showGrid": 1, "showData": false, "showTangent": false, "showEyeLevel": true, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 3, 3 ], "NObjects": [ 0, 0 ], "ObjDist": [ 500, 600 ], "ObjDeltaDist": [ 300, 300 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 0, 0 ], "ObjSideVar": [ 0, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 65, 100 ], "ObjSizeVar": [ 0, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1001.2944, "temperatureC": 14.35, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }' );
  ShowMoreInfos();
  UpdateAll( true );
  Demos.UpdateDemoPanels();
}

function ShowMoreInfos( infos ) {
  if (infos) {
    xInnerHTML( 'MoreAnimationInfos', infos );
  } else {
    xInnerHTML( 'MoreAnimationInfos', 'Click a Button to Start a Demo. Click again to skip one step. Click the Animation to start/stop. See also Controls below.' );
  }
}

// helper functions

var AnimRestartAction = 'stop';
var AnimTxt = 500 / AnimationSpeed;
var AnimT1 = 1000 / AnimationSpeed;
var AnimT2 = 2000 / AnimationSpeed;
var AnimT3 = 3000 / AnimationSpeed;
var AnimT4 = 4000 / AnimationSpeed;
var AnimT5 = 5000 / AnimationSpeed;
var AnimT6 = 6000 / AnimationSpeed;
var AnimT7 = 7000 / AnimationSpeed;
var AnimT8 = 8000 / AnimationSpeed;
var AnimT9 = 9000 / AnimationSpeed;
var AnimT10 = 10000 / AnimationSpeed;

function Tpse( time ) {
  time = xDefNum( time, AnimT2 );
  return {
    Mode: 'serial',
    TaskList: [ { ValueRef: 'pause', EndValue: 0 }, { ValueRef: 'pause', EndValue: time, TimeSpan: time } ],
  };
}

function Ttxt( txt, delay ) {
  var obj1 = { ValueRef: 'Description', EndValue: '' };
  if (delay) obj1.Delay = delay;
  var obj2 = { Delay: AnimTxt, ValueRef: 'Description', EndValue: txt };
  return {
    Mode: 'serial',
    TaskList: [ obj1, obj2 ],
  };
}

function Tval( name, val, time, delay, sweep ) {
  var obj = { ValueRef: name, EndValue: val, Sweep: 'cosine' };
  if (time) obj.TimeSpan = time;
  if (delay) obj.Delay = delay;
  if (sweep) obj.Sweep = sweep;
  return obj;
}

function Tpan( delay, angle ) {
  angle = angle || 45;
  delay = delay || 0;
  return {
    Mode: 'serial',
    TaskList: [
      {
        Delay: delay,
        ValueRef: 'Pan',
        EndValue: -angle,
        TimeSpan: AnimT2,
        Sweep: 'cosine',
      },
      {
        ValueRef: 'Pan',
        EndValue: angle,
        TimeSpan: AnimT4,
        Sweep: 'cosine',
      },
      {
        ValueRef: 'Pan',
        EndValue: 0,
        TimeSpan: AnimT2,
        Sweep: 'cosine',
      },
    ],
  };
}

// Curve Demo

Demos.New( 'Curve',
  'Simulation of the Globe Curvature and Comparison with Flat Earth. <a target="_blank" href="https://www.metabunk.org/stand-up-to-detect-the-curve-of-the-earth.t8364/">Stand Up to Detect the Curve of the Earth</a> [metabunk]'
);

Demos.AddState(
  'CurveApp = { "DemoText": "Where is the Curve?", "Description": "This is the View of the Globe at Observer Height = 2 m, FoV = 65 deg", "Height": 2, "FocalLengthField": 33.9, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 45, "showModel": 1, "showGrid": 1, "showData": true, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 3, 3 ], "NObjects": [ 0, 0 ], "ObjDist": [ 0, 0 ], "ObjDeltaDist": [ 100, 100 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 0, 0 ], "ObjSideVar": [ 0, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 10, 10 ], "ObjSizeVar": [ 0, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Tpan( AnimT2 ),
      Ttxt( 'Looks pretty flat, no Curvature visible. Lets go higher.' ),
      Tval( 'Height', 500, AnimT3, AnimT3 ),
      Ttxt( 'Height = 500 m. Still looking flat. Horizon at 80 km.', AnimT1 ),
      Tpan( AnimT3 ),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Where is the Curve?", "Description": "Height = 500 m. Still looking flat. Horizon at 80 km.", "Height": 500, "FocalLengthField": 33.9, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 45, "showModel": 1, "showGrid": 1, "showData": true, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 3, 3 ], "NObjects": [ 0, 0 ], "ObjDist": [ 0, 0 ], "ObjDeltaDist": [ 100, 100 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 0, 0 ], "ObjSideVar": [ 0, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 10, 10 ], "ObjSizeVar": [ 0, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( 'Lets compare with Flat Earth view.' ),
      Tval( 'showModel', 3, 0, AnimT2 ),
      Tval( 'showEyeLevel', true ),
      Ttxt( 'Looking flat too. But the Globe Horizon is NOT at Eye-Level!', AnimT2 ),
      Tpan( AnimT3 ),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Where is the Curve?", "Description": "Looking flat too. But the Globe Horizon is NOT at Eye-Level!", "Height": 500, "FocalLengthField": 33.9, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 45, "showModel": 3, "showGrid": 1, "showData": true, "showTangent": false, "showEyeLevel": true, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 3, 3 ], "NObjects": [ 0, 0 ], "ObjDist": [ 0, 0 ], "ObjDeltaDist": [ 100, 100 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 0, 0 ], "ObjSideVar": [ 0, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 10, 10 ], "ObjSizeVar": [ 0, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( 'Lets climb to an Altitude of an Airplane at 12 km.', AnimT1 ),
      Tval( 'Height', 12000, AnimT5, AnimT2 ),
      Ttxt( 'The Globe Horizon is at 390 km now and has dropped to 3.5 degrees.', AnimT1 ),
      Tval( 'showModel', 1, 0, AnimT5 ),
      Ttxt( '12 km and we see a slightly bent Horizon!', AnimT3 ),
      Tval( 'showTangent', true, 0, AnimT3 ),
      Tpan( AnimT2 ),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Where is the Curve?", "Description": "12 km and we see a slightly bent Horizon!", "Height": 12000, "FocalLengthField": 33.9, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 45, "showModel": 1, "showGrid": 1, "showData": true, "showTangent": true, "showEyeLevel": true, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 3, 3 ], "NObjects": [ 0, 0 ], "ObjDist": [ 0, 0 ], "ObjDeltaDist": [ 100, 100 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 0, 0 ], "ObjSideVar": [ 0, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 10, 10 ], "ObjSizeVar": [ 0, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( 'Lets Zoom in to f = 100 mm.', AnimT1 ),
      Tval( 'FocalLengthField', 100, AnimT3, AnimT3 ),
      Ttxt( 'Now the Horizon looks flat again. So the Field of View (Zooming) matters.', AnimT1 ),
      Tpan( AnimT2 ),
      Ttxt( '12 km: Note that the Curvature is mainly down, not horizontally!', AnimT2 ),
      Tpse(),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Where is the Curve?", "Description": "12 km: Note that the Curvature is mainly down, not horizontally!", "Height": 12000, "FocalLengthField": 100, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 45, "showModel": 1, "showGrid": 1, "showData": true, "showTangent": true, "showEyeLevel": true, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 3, 3 ], "NObjects": [ 0, 0 ], "ObjDist": [ 0, 0 ], "ObjDeltaDist": [ 100, 100 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 0, 0 ], "ObjSideVar": [ 0, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 10, 10 ], "ObjSizeVar": [ 0, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( 'Lets climb to an Altitude of an amateur Rocket of 100 km.', AnimT1 ),
      Tval( 'Height', 100000, AnimT5, AnimT3 ),
      Ttxt( '100 km: The Horizon has dropped to 10 degrees but still looks not much curved.', AnimT1 ),
      Tpan( AnimT2 ),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Where is the Curve?", "Description": "100 km: The Horizon has dropped to 10 degrees but still looks not much curved.", "Height": 100000, "FocalLengthField": 100, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 45, "showModel": 1, "showGrid": 1, "showData": true, "showTangent": true, "showEyeLevel": true, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 3, 3 ], "NObjects": [ 0, 0 ], "ObjDist": [ 0, 0 ], "ObjDeltaDist": [ 100, 100 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 0, 0 ], "ObjSideVar": [ 0, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 10, 10 ], "ObjSizeVar": [ 0, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( 'Perhaps if we Zoom out again to 65 deg Field of View:', AnimT1 ),
      Tval( 'FocalLengthField', 33.9, AnimT3, AnimT3 ),
      Ttxt( 'Zoom-Out: Yes, clearly curved horizontally now.', AnimT1 ),
      Tpan( AnimT2 ),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Where is the Curve?", "Description": "Zoom-Out: Yes, clearly curved horizontally now.", "Height": 100000, "FocalLengthField": 33.9, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 45, "showModel": 1, "showGrid": 1, "showData": true, "showTangent": true, "showEyeLevel": true, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 3, 3 ], "NObjects": [ 0, 0 ], "ObjDist": [ 0, 0 ], "ObjDeltaDist": [ 100, 100 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 0, 0 ], "ObjSideVar": [ 0, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 10, 10 ], "ObjSizeVar": [ 0, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( 'Lets compare with Flat Earth again:', AnimT1 ),
      Tval( 'showModel', 3, 0, AnimT3 ),
      Ttxt( '100 km: Even the Flat Earth Ice Wall Horizon dropped slightly', AnimT3 ),
      Tpse( AnimT3 ),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Where is the Curve?", "Description": "100 km: Even the Flat Earth Ice Wall Horizon dropped slightly", "Height": 100000, "FocalLengthField": 33.9, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 45, "showModel": 3, "showGrid": 1, "showData": true, "showTangent": true, "showEyeLevel": true, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 3, 3 ], "NObjects": [ 0, 0 ], "ObjDist": [ 0, 0 ], "ObjDeltaDist": [ 100, 100 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 0, 0 ], "ObjSideVar": [ 0, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 10, 10 ], "ObjSizeVar": [ 0, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( 'Lets climb to ISS Altitude of 400 km:', AnimT1 ),
      {
        Delay: AnimT3,
        Mode: 'parallel',
        TaskList: [
          Tval( 'Height', 400000, AnimT5 ),
          Tval( 'Nick', 8.89, AnimT5 ),
        ],
      },
      Ttxt( '400 km: We should see the Ice Wall at 20015 km on Flat Earth! Globe Horizon at 2200 km.', AnimT2 ),
      Tpse(),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Where is the Curve?", "Description": "400 km: We should see the Ice Wall at 20015 km on Flat Earth! Globe Horizon at 2200 km.", "Height": 400000, "FocalLengthField": 33.9, "Roll": 0, "Nick": 8.89, "Pan": 0, "nLines": 45, "showModel": 3, "showGrid": 1, "showData": true, "showTangent": true, "showEyeLevel": true, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 3, 3 ], "NObjects": [ 0, 0 ], "ObjDist": [ 0, 0 ], "ObjDeltaDist": [ 100, 100 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 0, 0 ], "ObjSideVar": [ 0, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 10, 10 ], "ObjSizeVar": [ 0, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( 'Zooming (500 mm) makes the Horizon flat again, even at this Altitude!', AnimT1 ),
      Tval( 'showModel', 1, 0, AnimT3 ),
      Tval( 'Nick', 0, AnimT3 ),
      Tval( 'FocalLengthField', 500, AnimT3 ),
      Tval( 'showEyeLevel', false ),
      Tpan( 0, 15 ),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Where is the Curve?", "Description": "Zooming (500 mm) makes the Horizon flat again, even at this Altitude!", "Height": 400000, "FocalLengthField": 500, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 45, "showModel": 1, "showGrid": 1, "showData": true, "showTangent": true, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 3, 3 ], "NObjects": [ 0, 0 ], "ObjDist": [ 0, 0 ], "ObjDeltaDist": [ 100, 100 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 0, 0 ], "ObjSideVar": [ 0, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 10, 10 ], "ObjSizeVar": [ 0, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( 'Going to Geostationary Orbit of 35786 km...', AnimT1 ),
      Tval( 'FocalLengthField', 33.9, AnimT3, AnimT1 ),
      Tval( 'showTangent', false ),
      Tval( 'Height', 35786000, AnimT10, AnimT2 ),
      Tpse(),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Where is the Curve?", "Description": "Going to Geostationary Orbit of 35786 km...", "Height": 35786000, "FocalLengthField": 33.9, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 45, "showModel": 1, "showGrid": 1, "showData": true, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 3, 3 ], "NObjects": [ 0, 0 ], "ObjDist": [ 0, 0 ], "ObjDeltaDist": [ 100, 100 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 0, 0 ], "ObjSideVar": [ 0, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 10, 10 ], "ObjSizeVar": [ 0, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( 'and back to 400 km', AnimT1 ),
      Tval( 'Height', 400000, AnimT5, AnimT1 ),
      Ttxt( 'and back to 12 km' ),
      Tval( 'Height', 12000, AnimT5 ),
      Ttxt( 'and back to 500 m' ),
      Tval( 'Height', 500, AnimT5 ),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Where is the Curve?", "Description": "and back to 500 m", "Height": 500, "FocalLengthField": 33.9, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 45, "showModel": 1, "showGrid": 1, "showData": true, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 3, 3 ], "NObjects": [ 0, 0 ], "ObjDist": [ 0, 0 ], "ObjDeltaDist": [ 100, 100 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 0, 0 ], "ObjSideVar": [ 0, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 10, 10 ], "ObjSizeVar": [ 0, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

// Causeway Demo

Demos.New( 'Causeway',
  '<a target="_blank" href="https://www.youtube.com/watch?v=xulJeRwF9UM&t=3s">Video showing the Curvature of the Causeway</a> on <a target="_blank" href="https://www.youtube.com/channel/UCDXr2cbK7WlfeYEtJxC9i3w/videos">Soundlys Channel</a>'
);

Demos.AddState(
  'CurveApp = { "DemoText": "Lake Pontchartrain Causeway", "Description": "To prove that the Earth is flat...", "Height": 100, "FocalLengthField": 33.9, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 45, "showModel": 1, "showGrid": 0, "showData": false, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 6, 3 ], "NObjects": [ 41, 0 ], "ObjDist": [ 0, 0 ], "ObjDeltaDist": [ 967.5, 100 ], "ObjSideType": [ 1, 0 ], "ObjSidePos": [ 45, 0 ], "ObjSideVar": [ 30, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 5, 10 ], "ObjSizeVar": [ 0, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( 'they often use pictures like this of the 38.7 km long Causeway Bridge.', AnimT3 ),
      Ttxt( 'From this Perspective, not the slightest Curvature of the Earth is visible.', AnimT5 ),
      Tpan( AnimT4, 20 ),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Lake Pontchartrain Causeway", "Description": "From this Perspective, not the slightest Curvature of the Earth is visible.", "Height": 100, "FocalLengthField": 33.9, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 45, "showModel": 1, "showGrid": 0, "showData": false, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 6, 3 ], "NObjects": [ 41, 0 ], "ObjDist": [ 0, 0 ], "ObjDeltaDist": [ 967.5, 100 ], "ObjSideType": [ 1, 0 ], "ObjSidePos": [ 45, 0 ], "ObjSideVar": [ 30, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 5, 10 ], "ObjSizeVar": [ 0, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( 'Lets compare this Globe Simulation with the Flat Earth Simulation:', AnimT1 ),
      Tval( 'Description', '', 0, AnimT3 ),
      {
        Repeat: 2,
        TaskList: [
          Tval( 'Description', 'Flat Earth', 0, AnimT2 ),
          Tval( 'showModel', 2 ),
          Tval( 'viewcenterHorizon', 1 ),
          Tval( 'Description', 'Globe Earth', 0, AnimT2 ),
          Tval( 'showModel', 1 ),
          Tval( 'viewcenterHorizon', 0 ),
        ],
      },
      Tval( 'Description', 'Flat Earth', 0, AnimT2 ),
      Tval( 'showModel', 2 ),
      Tval( 'viewcenterHorizon', 1 ),
      Ttxt( 'Looks exactly the same! So where is the Curve hiding?', AnimT2 ),
      Ttxt( 'Lets compare side by side and look for Differences:', AnimT5 ),
      Tval( 'showModel', 3, 0, AnimT3 ),
      Tval( 'showGrid', 1 ),
      Tval( 'viewcenterHorizon', 2 ),
      Tval( 'showEyeLevel', true ),
      Ttxt( 'Aha! The Globe Horizon is not at Eye-Level.', AnimT4 ),
      Tpse(),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Lake Pontchartrain Causeway", "Description": "Aha! The Globe Horizon is not at Eye-Level.", "Height": 100, "FocalLengthField": 33.9, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 45, "showModel": 3, "showGrid": 1, "showData": false, "showTangent": false, "showEyeLevel": true, "deviceRatio": 1.5, "viewcenterHorizon": 2, "ObjType": [ 6, 3 ], "NObjects": [ 41, 0 ], "ObjDist": [ 0, 0 ], "ObjDeltaDist": [ 967.5, 100 ], "ObjSideType": [ 1, 0 ], "ObjSidePos": [ 45, 0 ], "ObjSideVar": [ 30, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 5, 10 ], "ObjSizeVar": [ 0, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( 'But can this be noticed with the naked Eye? Certainly not!', AnimT1 ),
      Ttxt( 'Lets zoom in to f = 300 mm and take a closer look:', AnimT4 ),
      Tval( 'FocalLengthField', 300, AnimT3, AnimT4 ),
      Ttxt( 'The Bridge Segments are all 970 m long, but look much shorter now.', AnimT3 ),
      Ttxt( 'This is a well known Effect of Perspective: Zoom compresses Distances.', AnimT6 ),
      Ttxt( 'And we see a slight Down-Bending at the end of the Bridge on the Globe.', AnimT6 ),
      Tpse(),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Lake Pontchartrain Causeway", "Description": "And we see a slight Down-Bending at the end of the Bridge on the Globe.", "Height": 100, "FocalLengthField": 300, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 45, "showModel": 3, "showGrid": 1, "showData": false, "showTangent": false, "showEyeLevel": true, "deviceRatio": 1.5, "viewcenterHorizon": 2, "ObjType": [ 6, 3 ], "NObjects": [ 41, 0 ], "ObjDist": [ 0, 0 ], "ObjDeltaDist": [ 967.5, 100 ], "ObjSideType": [ 1, 0 ], "ObjSidePos": [ 45, 0 ], "ObjSideVar": [ 30, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 5, 10 ], "ObjSizeVar": [ 0, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( 'The Bridge Segments go over the Horizon on the Globe!', AnimT1 ),
      Tval( 'FocalLengthField', 2000, AnimT3, AnimT3 ),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Lake Pontchartrain Causeway", "Description": "The Bridge Segments go over the Horizon on the Globe!", "Height": 100, "FocalLengthField": 2000, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 45, "showModel": 3, "showGrid": 1, "showData": false, "showTangent": false, "showEyeLevel": true, "deviceRatio": 1.5, "viewcenterHorizon": 2, "ObjType": [ 6, 3 ], "NObjects": [ 41, 0 ], "ObjDist": [ 0, 0 ], "ObjDeltaDist": [ 967.5, 100 ], "ObjSideType": [ 1, 0 ], "ObjSidePos": [ 45, 0 ], "ObjSideVar": [ 30, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 5, 10 ], "ObjSizeVar": [ 0, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( 'We can enhance this Effect by lowering the Point of View to 2.5 m:', AnimT1 ),
      Tval( 'Height', 2.5, AnimT5, AnimT4 ),
      Tval( 'Description', '' ),
      Tval( 'ObjSidePos[0]', 25, AnimT5 ),
      Ttxt( 'Zoom and View along the Bridge shows the Curvature of the Earth!' ),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Lake Pontchartrain Causeway", "Description": "Zoom and View along the Bridge shows the Curvature of the Earth!", "Height": 2.5, "FocalLengthField": 2000, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 45, "showModel": 3, "showGrid": 1, "showData": false, "showTangent": false, "showEyeLevel": true, "deviceRatio": 1.5, "viewcenterHorizon": 2, "ObjType": [ 6, 3 ], "NObjects": [ 41, 0 ], "ObjDist": [ 0, 0 ], "ObjDeltaDist": [ 967.5, 100 ], "ObjSideType": [ 1, 0 ], "ObjSidePos": [ 25, 0 ], "ObjSideVar": [ 30, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 5, 10 ], "ObjSizeVar": [ 0, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);


// TransLine Demo

Demos.New( 'TransLine',
  '<a target="_blank" href="https://www.metabunk.org/soundly-proving-the-curvature-of-the-earth-at-lake-pontchartrain.t8939/">Soundly Proving the Curvature of the Earth at Lake Pontchartrain</a> [metabunk], <a target="_blank" href="https://www.youtube.com/channel/UCDXr2cbK7WlfeYEtJxC9i3w/videos">Soundlys Channel</a>'
);

Demos.AddState(
  'CurveApp = { "DemoText": "Lake Pontchartrain Transmission Line", "Description": "This Transmission Line crosses Lake Pontchartrain in 25.9 km.", "Height": 100, "FocalLengthField": 100, "Roll": 0, "Nick": 0, "Pan": -10, "nLines": 45, "showModel": 1, "showGrid": 0, "showData": false, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 3, 3 ], "NObjects": [ 85, 2 ], "ObjDist": [ 50, 25550 ], "ObjDeltaDist": [ 297.55, 373 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ -500, -509.6 ], "ObjSideVar": [ 0, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 23, 64 ], "ObjSizeVar": [ 0, 0 ], "refractionSync": 2, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Delay: AnimT1,
    Mode: 'parallel',
    TaskList: [
      Tval( 'ObjSidePos[0]', 500, AnimT10, 0 ),
      Tval( 'ObjSidePos[1]',  490.4, AnimT10, 0 ),
      Tval( 'Pan', 10, AnimT10, 0 ),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Lake Pontchartrain Transmission Line", "Description": "This Transmission Line crosses Lake Pontchartrain in 25.9 km.", "Height": 100, "FocalLengthField": 100, "Roll": 0, "Nick": 0, "Pan": 10, "nLines": 45, "showModel": 1, "showGrid": 0, "showData": false, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 3, 3 ], "NObjects": [ 85, 2 ], "ObjDist": [ 50, 25550 ], "ObjDeltaDist": [ 297.55, 373 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 500, 490.4 ], "ObjSideVar": [ 0, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 23, 64 ], "ObjSizeVar": [ 0, 0 ], "refractionSync": 2, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( 'There are 85 identical Towers 300 m apart.', AnimT1 ),
      {
        Delay: 0,
        Mode: 'parallel',
        TaskList: [
          Tval( 'FocalLengthField', 1000, AnimT5, 0 ),
          Tval( 'Pan', 1.68, AnimT5, 0 ),
          Tval( 'Height', 55, AnimT5, 0 ),
        ],
      },
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Lake Pontchartrain Transmission Line", "Description": "There are 85 identical Towers 300 m apart.", "Height": 55, "FocalLengthField": 1000, "Roll": 0, "Nick": 0, "Pan": 1.68, "nLines": 45, "showModel": 1, "showGrid": 0, "showData": false, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 3, 3 ], "NObjects": [ 85, 2 ], "ObjDist": [ 50, 25550 ], "ObjDeltaDist": [ 297.55, 373 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 500, 490.4 ], "ObjSideVar": [ 0, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 23, 64 ], "ObjSizeVar": [ 0, 0 ], "refractionSync": 2, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( 'The last few Towers curve down behind the Horizon.', AnimT1 ),
      {
        Delay: 0,
        Mode: 'parallel',
        TaskList: [
          Tval( 'ObjSidePos[0]', 35, AnimT5, 0 ),
          Tval( 'ObjSidePos[1]', 25.4, AnimT5, 0 ),
          Tval( 'Pan', 0, AnimT5, 0 ),
          Tval( 'Height', 15, AnimT5, 0 ),
        ],
      },
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Lake Pontchartrain Transmission Line", "Description": "The last few Towers curve down behind the Horizon.", "Height": 15, "FocalLengthField": 1000, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 45, "showModel": 1, "showGrid": 0, "showData": false, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 3, 3 ], "NObjects": [ 85, 2 ], "ObjDist": [ 50, 25550 ], "ObjDeltaDist": [ 297.55, 373 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 35, 25.4 ], "ObjSideVar": [ 0, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 23, 64 ], "ObjSizeVar": [ 0, 0 ], "refractionSync": 2, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( 'Zooming shows the Curvature clearly:', AnimT1 ),
      Tval( 'FocalLengthField', 2000, AnimT5, AnimT1 ),
      Tval( 'showGrid', 1, 0, AnimT1 ),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Lake Pontchartrain Transmission Line", "Description": "Zooming shows the Curvature clearly:", "Height": 15, "FocalLengthField": 2000, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 45, "showModel": 1, "showGrid": 1, "showData": false, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 3, 3 ], "NObjects": [ 85, 2 ], "ObjDist": [ 50, 25550 ], "ObjDeltaDist": [ 297.55, 373 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 35, 25.4 ], "ObjSideVar": [ 0, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 23, 64 ], "ObjSizeVar": [ 0, 0 ], "refractionSync": 2, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( 'Lets compare with Flat Earth.', AnimT1 ),
      Tval( 'showModel', 3, 0, AnimT1 ),
      Tpse( AnimT3 ),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Lake Pontchartrain Transmission Line", "Description": "Lets compare with Flat Earth.", "Height": 15, "FocalLengthField": 2000, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 45, "showModel": 3, "showGrid": 1, "showData": false, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 3, 3 ], "NObjects": [ 85, 2 ], "ObjDist": [ 50, 25550 ], "ObjDeltaDist": [ 297.55, 373 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 35, 25.4 ], "ObjSideVar": [ 0, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 23, 64 ], "ObjSizeVar": [ 0, 0 ], "refractionSync": 2, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( 'Removing Standard Refraction increases the Curvature even more.', AnimT1 ),
      Tval( 'showModel', 1, 0, AnimT3 ),
      Tval( 'refractionCoeff', 0, AnimT5, AnimT1 ),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Lake Pontchartrain Transmission Line", "Description": "Removing Standard Refraction increases the Curvature even more.", "Height": 15, "FocalLengthField": 2000, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 45, "showModel": 1, "showGrid": 1, "showData": false, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 3, 3 ], "NObjects": [ 85, 2 ], "ObjDist": [ 50, 25550 ], "ObjDeltaDist": [ 297.55, 373 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 35, 25.4 ], "ObjSideVar": [ 0, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 23, 64 ], "ObjSizeVar": [ 0, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( 'Here is the Curvature!', AnimT1 ),
      {
        Delay: AnimT2,
        Mode: 'parallel',
        TaskList: [
          Tval( 'FocalLengthField', 3500, AnimT10, 0 ),
          Tval( 'ObjSidePos[0]', 32, AnimT10, 0 ),
          Tval( 'ObjSidePos[1]', 22.4, AnimT10, 0 ),
          Tval( 'Pan', 0.2, AnimT10, 0 ),
          Tval( 'Nick', 0.052, AnimT10, 0 ),
        ],
      },
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Lake Pontchartrain Transmission Line", "Description": "Here is the Curvature!", "Height": 15, "FocalLengthField": 3500, "Roll": 0, "Nick": 0.052, "Pan": 0.2, "nLines": 45, "showModel": 1, "showGrid": 1, "showData": false, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 3, 3 ], "NObjects": [ 85, 2 ], "ObjDist": [ 50, 25550 ], "ObjDeltaDist": [ 297.55, 373 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 32, 22.4 ], "ObjSideVar": [ 0, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 23, 64 ], "ObjSizeVar": [ 0, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

// Grace Demo

Demos.New( 'Grace',
  '<a target="_blank" href="http://walter.bislins.ch/bloge/index.asp?page=Image%3AOil%2DPlattform%2DGrace%2Dbmlsb69%2Ejpg">Image of Platform Grace</a>; <a target="_blank" href="https://www.youtube.com/watch?v=XI5qKJm5eNQ">Original-Video</a> [bmlsb69]; <a target="_blank" href="https://www.youtube.com/watch?v=7W6h1oUVGPI">Oil Platforms and Islands | Observation and Analysis</a> [Jon McIntyre]'
);

Demos.AddState(
  'CurveApp = { "DemoText": "Anacapa Island and Oil Platform Grace", "Description": "This is a Scheme of the Stituation:", "Height": 72, "FocalLengthField": 2000, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 45, "showModel": 2, "showGrid": 1, "showData": false, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 2, "ObjType": [ 6, 5 ], "NObjects": [ 2, 2 ], "ObjDist": [ 25000, 25000 ], "ObjDeltaDist": [ 20, 0 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 0, 14.6 ], "ObjSideVar": [ 12, -331 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 37.2, 75 ], "ObjSizeVar": [ 0, 0.0375 ], "refractionCoeff": 0.27266, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( 'Left: Observer at QAD Inc. Parking Lot, height = 72 m', AnimT1 ),
      Tpse( AnimT3 ),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Anacapa Island and Oil Platform Grace", "Description": "Left: Observer at QAD Inc. Parking Lot, height = 72 m", "Height": 72, "FocalLengthField": 2000, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 45, "showModel": 2, "showGrid": 1, "showData": false, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 2, "ObjType": [ 6, 5 ], "NObjects": [ 2, 2 ], "ObjDist": [ 25000, 25000 ], "ObjDeltaDist": [ 20, 0 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 0, 14.6 ], "ObjSideVar": [ 12, -331 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 37.2, 75 ], "ObjSizeVar": [ 0, 0.0375 ], "refractionCoeff": 0.27266, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( 'Center: Oil Platform Grace, Distance = 28 km, Height = 37.2 m', AnimT1 ),
      Tpse( AnimT4 ),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Anacapa Island and Oil Platform Grace", "Description": "Center: Oil Platform Grace, Distance = 28 km, Height = 37.2 m", "Height": 72, "FocalLengthField": 2000, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 45, "showModel": 2, "showGrid": 1, "showData": false, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 2, "ObjType": [ 6, 5 ], "NObjects": [ 2, 2 ], "ObjDist": [ 25000, 25000 ], "ObjDeltaDist": [ 20, 0 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 0, 14.6 ], "ObjSideVar": [ 12, -331 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 37.2, 75 ], "ObjSizeVar": [ 0, 0.0375 ], "refractionCoeff": 0.27266, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( 'Right: Anacapa Island, Distance = 50.1 km, Height = 75 m', AnimT1 ),
      Tpse( AnimT4 ),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Anacapa Island and Oil Platform Grace", "Description": "Right: Anacapa Island, Distance = 50.1 km, Height = 75 m", "Height": 72, "FocalLengthField": 2000, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 45, "showModel": 2, "showGrid": 1, "showData": false, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 2, "ObjType": [ 6, 5 ], "NObjects": [ 2, 2 ], "ObjDist": [ 25000, 25000 ], "ObjDeltaDist": [ 20, 0 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 0, 14.6 ], "ObjSideVar": [ 12, -331 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 37.2, 75 ], "ObjSizeVar": [ 0, 0.0375 ], "refractionCoeff": 0.27266, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( 'The top horizontal line corresponds to the line of sight.', AnimT1 ),
      Ttxt( 'If we look to the Island, the Platform must appear way below Eye-Level.', AnimT4 ),
      Tpse( AnimT3 ),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Anacapa Island and Oil Platform Grace", "Description": "If we look to the Island, the Platform must appear way below Eye-Level.", "Height": 72, "FocalLengthField": 2000, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 45, "showModel": 2, "showGrid": 1, "showData": false, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 2, "ObjType": [ 6, 5 ], "NObjects": [ 2, 2 ], "ObjDist": [ 25000, 25000 ], "ObjDeltaDist": [ 20, 0 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 0, 14.6 ], "ObjSideVar": [ 12, -331 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 37.2, 75 ], "ObjSizeVar": [ 0, 0.0375 ], "refractionCoeff": 0.27266, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( 'Lets build the Scene with the real Proportions', AnimT1 ),
      {
        Delay: AnimT1,
        Mode: 'parallel',
        TaskList: [
          Tval( 'ObjDist[1]', 0, AnimT5 ),
          Tval( 'ObjSidePos[0]', 55.4, AnimT5 ),
          Tval( 'ObjDeltaDist[1]', 50100, AnimT5 ),
          Tval( 'ObjDist[0]', 15000, AnimT5 ),
          Tval( 'FocalLengthField', 1000, AnimT5 ),
        ],
      },
      Tval( 'NObjects[1]', 11 ),
      Tval( 'ObjDist[1]', 50100 ),
      Tval( 'ObjDeltaDist[1]', 22.7 ),
      Tval( 'ObjSizeType[1]', 3 ),
      Tval( 'ObjSideVar[1]', -523 ),
      Tval( 'ObjSizeVar[1]', 0.234 ),
      {
        Mode: 'parallel',
        TaskList: [
          Tval( 'ObjDist[0]', 28000, AnimT5 ),
          Tval( 'ObjSidePos[0]', 97.5, AnimT5 ),
          Tval( 'ObjSidePos[1]', 34.7, AnimT5 ),
        ],
      },
      Tval( 'FocalLengthField', 2000, AnimT5 ),
      Ttxt( 'This is the Scene how it should look like on the Flat Earth', AnimT1 ),
      Tpse( AnimT3 ),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Anacapa Island and Oil Platform Grace", "Description": "This is the Scene how it should look like on the Flat Earth", "Height": 72, "FocalLengthField": 2000, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 45, "showModel": 2, "showGrid": 1, "showData": false, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 2, "ObjType": [ 6, 5 ], "NObjects": [ 2, 11 ], "ObjDist": [ 28000, 50100 ], "ObjDeltaDist": [ 20, 22.7 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 97.5, 34.7 ], "ObjSideVar": [ 12, -523 ], "ObjSizeType": [ 0, 3 ], "ObjSize": [ 37.2, 75 ], "ObjSizeVar": [ 0, 0.234 ], "refractionCoeff": 0.27266, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( 'But this is not what we see in Reality!.', AnimT1 ),
      Tval( 'showModel', 1, 0, AnimT3 ),
      Tval( 'viewcenterHorizon', 0 ),
      Ttxt( 'In reality the Scene looks like this (click Link above):', AnimT1 ),
      Tpse( AnimT3 ),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Anacapa Island and Oil Platform Grace", "Description": "In reality the Scene looks like this (click Link above):", "Height": 72, "FocalLengthField": 2000, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 45, "showModel": 1, "showGrid": 1, "showData": false, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 6, 5 ], "NObjects": [ 2, 11 ], "ObjDist": [ 28000, 50100 ], "ObjDeltaDist": [ 20, 22.7 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 97.5, 34.7 ], "ObjSideVar": [ 12, -523 ], "ObjSizeType": [ 0, 3 ], "ObjSize": [ 37.2, 75 ], "ObjSizeVar": [ 0, 0.234 ], "refractionCoeff": 0.27266, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( 'Medium Refraction has to be applied to align the Tops.', AnimT1 ),
      Ttxt( 'Lets see wether Refraction is the Reaoson why the Platform is Lifted so much.', AnimT4 ),
      Tval( 'refractionCoeff', 0, AnimT5, AnimT5 ),
      Ttxt( 'No, without Refraction the Platform appears even higher!', AnimT1 ),
      Tpse( AnimT3 ),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Anacapa Island and Oil Platform Grace", "Description": "In reality the Scene looks like this (click Link above):", "Height": 72, "FocalLengthField": 2000, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 45, "showModel": 1, "showGrid": 1, "showData": false, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 6, 5 ], "NObjects": [ 2, 11 ], "ObjDist": [ 28000, 50100 ], "ObjDeltaDist": [ 20, 22.7 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 97.5, 34.7 ], "ObjSideVar": [ 12, -523 ], "ObjSizeType": [ 0, 3 ], "ObjSize": [ 37.2, 75 ], "ObjSizeVar": [ 0, 0.234 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( 'Lets see how Standard Refraction looks like:', AnimT1 ),
      Tval( 'refractionCoeff', 0.16974, AnimT5, AnimT1 ),
      Tval( 'refractionSync', 2, 0, 1 ),
      Ttxt( 'Reality tells the earth is a Globe.', AnimT2 ),
      Tval( 'showModel', 3 ),
      Tval( 'showEyeLevel', true ),
      Tval( 'viewcenterHorizon', 2 ),
      Tpse( AnimT3 ),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Anacapa Island and Oil Platform Grace", "Description": "Reality tells the earth is a Globe.", "Height": 72, "FocalLengthField": 2000, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 45, "showModel": 3, "showGrid": 1, "showData": false, "showTangent": false, "showEyeLevel": true, "deviceRatio": 1.5, "viewcenterHorizon": 2, "ObjType": [ 6, 5 ], "NObjects": [ 2, 11 ], "ObjDist": [ 28000, 50100 ], "ObjDeltaDist": [ 20, 22.7 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 97.5, 34.7 ], "ObjSideVar": [ 12, -523 ], "ObjSizeType": [ 0, 3 ], "ObjSize": [ 37.2, 75 ], "ObjSizeVar": [ 0, 0.234 ], "refractionCoeff": 0.16974, "tempGradient": -0.0343, "refractionSync": 2, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

// Bedford Demo

Demos.New( 'Bedford',
  '<a target="_blank" href="https://en.wikipedia.org/wiki/Bedford_Level_experiment">Bedford Level Experiment</a> [Wikipedia]; <a target="_blank" href="https://www.metabunk.org/where-and-how-could-the-wallace-experiment-easily-be-repeated.t7920/">Where and How could the Wallace Experiment Easily Be Repeated?</a> [metabunk]'
);

Demos.AddState(
  'CurveApp = { "DemoText": "Bedford Level Experiment", "Description": "", "Height": 7, "FocalLengthField": 800, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 45, "showModel": 3, "showGrid": 0, "showData": false, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 3, "ObjType": [ 0, 3 ], "NObjects": [ 3, 0 ], "ObjDist": [ -8600, 0 ], "ObjDeltaDist": [ 4830, 100 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 0, 0 ], "ObjSideVar": [ 18, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 4.04, 10 ], "ObjSizeVar": [ 0, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      {
        Mode: 'parallel',
        TaskList: [
          Tval( 'Description', 'Bridge with Marker' ),
          Tval( 'Description', 'Middle Marker', 0, AnimT2 ),
          Tval( 'Description', 'and Telescope', 0, AnimT4 ),
          Tval( 'Description', 'are at the same height (4 m) and 4830 m apart', 0, AnimT6 ),
          Tval( 'Height', 5, AnimT6 ),
          Tval( 'ObjDist[0]', 370, AnimT6 ),
          Tval( 'ObjSidePos[0]', 11, AnimT6 ),
          Tval( 'Height', 4.04, AnimT2, AnimT7 ),
          Tval( 'ObjSidePos[0]', 9.23, AnimT2, AnimT7 ),
          Tval( 'ObjDist[0]', 124, AnimT2, AnimT7 ),
        ],
      },
      Tval( 'FocalLengthField', 5000, AnimT2, AnimT1 ),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Bedford Level Experiment", "Description": "are at the same height (4 m) and 4830 m apart", "Height": 4.04, "FocalLengthField": 5000, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 45, "showModel": 3, "showGrid": 0, "showData": false, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 3, "ObjType": [ 0, 3 ], "NObjects": [ 3, 0 ], "ObjDist": [ 124, 0 ], "ObjDeltaDist": [ 4830, 100 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 9.23, 0 ], "ObjSideVar": [ 18, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 4.04, 10 ], "ObjSizeVar": [ 0, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( 'On the Globe, the middle Marker appears ABOVE the Bridge Marker', AnimT1 ),
      Tval( 'Height', 4.135, AnimT1, AnimT3 ),
      Tpse( AnimT3 ),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Bedford Level Experiment", "Description": "On the Globe, the middle Marker appears ABOVE the Bridge Marker", "Height": 4.135, "FocalLengthField": 5000, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 45, "showModel": 3, "showGrid": 0, "showData": false, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 3, "ObjType": [ 0, 3 ], "NObjects": [ 3, 0 ], "ObjDist": [ 124, 0 ], "ObjDeltaDist": [ 4830, 100 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 9.23, 0 ], "ObjSideVar": [ 18, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 4.04, 10 ], "ObjSizeVar": [ 0, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( 'but both Markers appear below Eye-Level', AnimT1 ),
      Tval( 'showEyeLevel', true, 0, AnimT2 ),
      Tval( 'Height', 4.04, AnimT1, AnimT1 ),
      Tpse( AnimT2 ),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Bedford Level Experiment", "Description": "but both Markers appear below Eye-Level", "Height": 4.04, "FocalLengthField": 5000, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 45, "showModel": 3, "showGrid": 0, "showData": false, "showTangent": false, "showEyeLevel": true, "deviceRatio": 1.5, "viewcenterHorizon": 3, "ObjType": [ 0, 3 ], "NObjects": [ 3, 0 ], "ObjDist": [ 124, 0 ], "ObjDeltaDist": [ 4830, 100 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 9.23, 0 ], "ObjSideVar": [ 18, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 4.04, 10 ], "ObjSizeVar": [ 0, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( 'Refraction makes the scene appear more flat', AnimT1 ),
      Tval( 'refractionCoeff', 0.714286, AnimT2, AnimT2 ),
      Ttxt( 'Note: the bridge appears no longer behind the horizon', AnimT3 ),
      Tpse(),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Bedford Level Experiment", "Description": "Note: the bridge appears no longer behind the horizon", "Height": 4.04, "FocalLengthField": 5000, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 45, "showModel": 3, "showGrid": 0, "showData": false, "showTangent": false, "showEyeLevel": true, "deviceRatio": 1.5, "viewcenterHorizon": 3, "ObjType": [ 0, 3 ], "NObjects": [ 3, 0 ], "ObjDist": [ 124, 0 ], "ObjDeltaDist": [ 4830, 100 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 9.23, 0 ], "ObjSideVar": [ 18, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 4.04, 10 ], "ObjSizeVar": [ 0, 0 ], "refractionCoeff": 0.714286, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( 'Whithout Refraction the bridge is partially hidden behind the horizon', AnimT1 ),
      Tval( 'showGrid', 1, 0, AnimT2 ),
      Tval( 'refractionCoeff', 0, AnimT2, AnimT1 ),
      Tpse(),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Bedford Level Experiment", "Description": "Whithout Refraction the bridge is partially hidden behind the horizon", "Height": 4.04, "FocalLengthField": 5000, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 45, "showModel": 3, "showGrid": 1, "showData": false, "showTangent": false, "showEyeLevel": true, "deviceRatio": 1.5, "viewcenterHorizon": 3, "ObjType": [ 0, 3 ], "NObjects": [ 3, 0 ], "ObjDist": [ 124, 0 ], "ObjDeltaDist": [ 4830, 100 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 9.23, 0 ], "ObjSideVar": [ 18, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 4.04, 10 ], "ObjSizeVar": [ 0, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( 'With more Markers (every 200 m)...', AnimT1 ),
      {
        Delay: AnimT3,
        Mode: 'parallel',
        TaskList: [
          Tval( 'ObjSidePos[0]', 5.63, AnimT1 ),
          Tval( 'ObjSideVar[0]', 1.25, AnimT1 ),
        ],
      },
      Tval( 'NObjects[0]', 49, 0, AnimT1 ),
      Tval( 'ObjDeltaDist[0]', 201.25 ),
      Ttxt( 'The Curvature of the Globe Earth is clearly visible', AnimT3 ),
      Tval( 'ObjSideVar[0]', 7.66, AnimT4, AnimT3 ),
      Tval( 'ObjSideVar[0]', 1.25, AnimT4, AnimT2 ),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Bedford Level Experiment", "Description": "The Curvature of the Globe Earth is clearly visible", "Height": 4.04, "FocalLengthField": 5000, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 45, "showModel": 3, "showGrid": 1, "showData": false, "showTangent": false, "showEyeLevel": true, "deviceRatio": 1.5, "viewcenterHorizon": 3, "ObjType": [ 0, 3 ], "NObjects": [ 49, 0 ], "ObjDist": [ 124, 0 ], "ObjDeltaDist": [ 201.25, 100 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 5.63, 0 ], "ObjSideVar": [ 1.25, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 4.04, 10 ], "ObjSizeVar": [ 0, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

// Tensas Demo

Demos.New( 'Tensas',
  '<a target="_blank" href="https://www.youtube.com/watch?v=1pglPcuarbg">Little Tensas Bayou</a> [YouTube]; <a target="_blank" href="https://www.youtube.com/channel/UCDXr2cbK7WlfeYEtJxC9i3w">Soundlys Channel</a>'
);

Demos.AddState(
  'CurveApp = { "DemoText": "Little Tensas Bayou", "Description": "This Animation shows 12.9 km of the Bridge", "Height": 18300, "FocalLengthField": 33.9, "Roll": 0, "Nick": -66.2, "Pan": 0, "nLines": 60, "showModel": 1, "showGrid": 1, "showData": false, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 7, 3 ], "NObjects": [ 87, 0 ], "ObjDist": [ 0, 0 ], "ObjDeltaDist": [ 150, 100 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 0, 0 ], "ObjSideVar": [ 0, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 1, 10 ], "ObjSizeVar": [ 0, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Delay: AnimT1,
    Mode: 'parallel',
    TaskList: [
      Tval( 'Height', 2000, AnimT5 ),
      Tval( 'FocalLengthField', 75, AnimT5 ),
      Tval( 'Nick', -14.4, AnimT5 ),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Little Tensas Bayou", "Description": "This Animation shows 12.9 km of the Bridge", "Height": 2000, "FocalLengthField": 75, "Roll": 0, "Nick": -14.4, "Pan": 0, "nLines": 60, "showModel": 1, "showGrid": 1, "showData": false, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 7, 3 ], "NObjects": [ 87, 0 ], "ObjDist": [ 0, 0 ], "ObjDeltaDist": [ 150, 100 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 0, 0 ], "ObjSideVar": [ 0, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 1, 10 ], "ObjSizeVar": [ 0, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'parallel',
    Delay: 1,
    TaskList: [
      Tval( 'Height', 10.8, AnimT7 ),
      Tval( 'FocalLengthField', 150, AnimT5, AnimT2 ),
      Tval( 'Nick', 0, AnimT6, AnimT1 ),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Little Tensas Bayou", "Description": "This Animation shows 12.9 km of the Bridge", "Height": 10.8, "FocalLengthField": 150, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 60, "showModel": 1, "showGrid": 1, "showData": false, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 7, 3 ], "NObjects": [ 87, 0 ], "ObjDist": [ 0, 0 ], "ObjDeltaDist": [ 150, 100 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 0, 0 ], "ObjSideVar": [ 0, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 1, 10 ], "ObjSizeVar": [ 0, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( 'Bridge Segments in this Animation are 150 m long', AnimT1 ),
      {
        Mode: 'parallel',
        TaskList: [
          Tval( 'FocalLengthField', 3000, AnimT5 ),
          Tval( 'ObjSidePos[0]', -2, AnimT3, AnimT2 ),
        ],
      },
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Little Tensas Bayou", "Description": "Bridge Segments in this Animation are 150 m long", "Height": 10.8, "FocalLengthField": 3000, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 60, "showModel": 1, "showGrid": 1, "showData": false, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 7, 3 ], "NObjects": [ 87, 0 ], "ObjDist": [ 0, 0 ], "ObjDeltaDist": [ 150, 100 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ -2, 0 ], "ObjSideVar": [ 0, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 1, 10 ], "ObjSizeVar": [ 0, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( 'Adding Standard Refraction', AnimT1 ),
      Tval( 'refractionCoeff', 0.16974, AnimT2, AnimT1 ),
      Tval( 'refractionSync', 2, 0, 1 ),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Little Tensas Bayou", "Description": "Adding Standard Refraction", "Height": 10.8, "FocalLengthField": 3000, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 60, "showModel": 1, "showGrid": 1, "showData": false, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 7, 3 ], "NObjects": [ 87, 0 ], "ObjDist": [ 0, 0 ], "ObjDeltaDist": [ 150, 100 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ -2, 0 ], "ObjSideVar": [ 0, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 1, 10 ], "ObjSizeVar": [ 0, 0 ], "refractionCoeff": 0.16974, "tempGradient": -0.0343, "refractionSync": 2, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( 'Changing Observer Height', AnimT2 ),
      Tval( 'Height', 1.5, AnimT3, AnimT1 ),
      Tval( 'Height', 10.8, AnimT3, AnimT3 ),
      Ttxt( 'Note: lighter Parts lie behind the Horizon Line' ),
      Tval( 'Height', 1.5, AnimT3, AnimT3 ),
      Tval( 'Height', 10.8, AnimT3, AnimT3 ),
      Ttxt( 'Compare to Video linked above' ),
      Tval( 'Height', 1.5, AnimT3 ),
      Tval( 'Height', 10.8, AnimT3, AnimT1 ),
      Tval( 'Height', 1.5, AnimT3, AnimT1 ),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Little Tensas Bayou", "Description": "Compare to Video linked above", "Height": 1.5, "FocalLengthField": 3000, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 60, "showModel": 1, "showGrid": 1, "showData": false, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 7, 3 ], "NObjects": [ 87, 0 ], "ObjDist": [ 0, 0 ], "ObjDeltaDist": [ 150, 100 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ -2, 0 ], "ObjSideVar": [ 0, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 1, 10 ], "ObjSizeVar": [ 0, 0 ], "refractionCoeff": 0.16974, "tempGradient": -0.0343, "refractionSync": 2, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

// Soundly Demo

Demos.New( 'Soundly',
  '<a target="_blank" href="http://walter.bislins.ch/blog/index.asp?page=Bild%3ASoundlyCausewayView1%2Ejpg">Scene 1</a>, <a target="_blank" href="http://walter.bislins.ch/blog/index.asp?page=Bild%3ASoundlyCausewayView2%2Ejpg">Scene 2</a>, <a target="_blank" href="http://walter.bislins.ch/blog/index.asp?page=Bild%3ASoundlyCausewayView3%2Ejpg">Scene 3</a>, <a target="_blank" href="http://walter.bislins.ch/blog/index.asp?page=Bild%3ASoundlyCausewayView4%2Ejpg">Scene 4</a>, <a target="_blank" href="https://www.youtube.com/channel/UCDXr2cbK7WlfeYEtJxC9i3w">Soundlys Channel</a>'
);

Demos.AddState(
  'CurveApp = { "DemoText": "Lake Ponchartrain Causeway, Soundly\'s Observations", "Description": "This Animation simulates the 38 km long Causeway Bridge on the Globe Model.", "Height": 200, "FocalLengthField": 38, "Roll": 0, "Nick": -0.85, "Pan": 65, "nLines": 45, "showModel": 1, "showGrid": 0, "showData": false, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 8, 3 ], "NObjects": [ 128, 0 ], "ObjDist": [ 0, 0 ], "ObjDeltaDist": [ 300, 100 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 2850, 0 ], "ObjSideVar": [ 0, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 1, 10 ], "ObjSizeVar": [ 0, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Delay: AnimT1,
    Mode: 'parallel',
    TaskList: [
      Tval( 'Pan', 8, AnimT7 ),
      Tval( 'FocalLengthField', 100, AnimT5, AnimT2 ),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Lake Ponchartrain Causeway, Soundly\'s Observations", "Description": "This Animation simulates the 38 km long Causeway Bridge on the Globe Model.", "Height": 200, "FocalLengthField": 100, "Roll": 0, "Nick": -0.85, "Pan": 8, "nLines": 45, "showModel": 1, "showGrid": 0, "showData": false, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 8, 3 ], "NObjects": [ 128, 0 ], "ObjDist": [ 0, 0 ], "ObjDeltaDist": [ 300, 100 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 2850, 0 ], "ObjSideVar": [ 0, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 1, 10 ], "ObjSizeVar": [ 0, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( 'The Bridge Model consists of 127 Segments of 300 m Length each.', AnimT1 ),
      {
        Mode: 'parallel',
        TaskList: [
          Tval( 'Height', 900, AnimT5 ),
          Tval( 'FocalLengthField', 650, AnimT5, AnimT2 ),
          Tval( 'Pan', 5.2, AnimT5 ),
        ],
      },
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Lake Ponchartrain Causeway, Soundly\'s Observations", "Description": "The Bridge Model consists of 127 Segments of 300 m Length each.", "Height": 900, "FocalLengthField": 650, "Roll": 0, "Nick": -0.85, "Pan": 5.2, "nLines": 45, "showModel": 1, "showGrid": 0, "showData": false, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 8, 3 ], "NObjects": [ 128, 0 ], "ObjDist": [ 0, 0 ], "ObjDeltaDist": [ 300, 100 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 2850, 0 ], "ObjSideVar": [ 0, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 1, 10 ], "ObjSizeVar": [ 0, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Delay: AnimT1,
    Mode: 'serial',
    TaskList: [
      {
        Mode: 'parallel',
        TaskList: [
          Tval( 'ObjDist[0]', 22500, AnimT10 ),
          Tval( 'Pan', 5.8, AnimT10 ),
          Tval( 'Nick', -0.85, AnimT10 ),
        ],
      },
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Lake Ponchartrain Causeway, Soundly\'s Observations", "Description": "The Bridge Model consists of 127 Segments of 300 m Length each.", "Height": 900, "FocalLengthField": 650, "Roll": 0, "Nick": -0.85, "Pan": 5.8, "nLines": 45, "showModel": 1, "showGrid": 0, "showData": false, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 8, 3 ], "NObjects": [ 128, 0 ], "ObjDist": [ 22500, 0 ], "ObjDeltaDist": [ 300, 100 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 2850, 0 ], "ObjSideVar": [ 0, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 1, 10 ], "ObjSizeVar": [ 0, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Delay: AnimT1,
    Mode: 'serial',
    TaskList: [
      {
        Mode: 'parallel',
        TaskList: [
          Tval( 'Height', 100, AnimT5 ),
          Tval( 'Nick', 0, AnimT5 ),
          Tval( 'ObjDist[0]', 0, AnimT5 ),
          Tval( 'ObjSidePos[0]', 1000, AnimT5 ),
          Tval( 'Pan', 3, AnimT5 ),
        ],
      },
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Lake Ponchartrain Causeway, Soundly\'s Observations", "Description": "The Bridge Model consists of 127 Segments of 300 m Length each.", "Height": 100, "FocalLengthField": 650, "Roll": 0, "Nick": 0, "Pan": 3, "nLines": 45, "showModel": 1, "showGrid": 0, "showData": false, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 8, 3 ], "NObjects": [ 128, 0 ], "ObjDist": [ 0, 0 ], "ObjDeltaDist": [ 300, 100 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 1000, 0 ], "ObjSideVar": [ 0, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 1, 10 ], "ObjSizeVar": [ 0, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( 'From a low Observer Altitude (3 m)...', AnimT1 ),
      Tval( 'Height', 3, AnimT3, AnimT1 ),
      Ttxt( 'big Parts of the Bridge are hidden behind the Horizon.', AnimT1 ),
      Tpse( AnimT1 ),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Lake Ponchartrain Causeway, Soundly\'s Observations", "Description": "big Parts of the Bridge are hidden behind the Horizon.", "Height": 3, "FocalLengthField": 650, "Roll": 0, "Nick": 0, "Pan": 3, "nLines": 45, "showModel": 1, "showGrid": 0, "showData": false, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 8, 3 ], "NObjects": [ 128, 0 ], "ObjDist": [ 0, 0 ], "ObjDeltaDist": [ 300, 100 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 1000, 0 ], "ObjSideVar": [ 0, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 1, 10 ], "ObjSizeVar": [ 0, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Tval( 'Height', 100, AnimT3, AnimT1 ),
      Ttxt( '' ),
      {
        Mode: 'parallel',
        TaskList: [
          Tval( 'FocalLengthField', 2000, AnimT5, AnimT1 ),
          Tval( 'Pan', 2, AnimT5 ),
        ],
      },
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Lake Ponchartrain Causeway, Soundly\'s Observations", "Description": "", "Height": 100, "FocalLengthField": 2000, "Roll": 0, "Nick": 0, "Pan": 2, "nLines": 45, "showModel": 1, "showGrid": 0, "showData": false, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 8, 3 ], "NObjects": [ 128, 0 ], "ObjDist": [ 0, 0 ], "ObjDeltaDist": [ 300, 100 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 1000, 0 ], "ObjSideVar": [ 0, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 1, 10 ], "ObjSizeVar": [ 0, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      {
        Mode: 'parallel',
        TaskList: [
          Tval( 'ObjSidePos[0]', 300, AnimT5 ),
          Tval( 'Height', 50, AnimT5, AnimT4 ),
          Tval( 'Pan', 0.8, AnimT5 ),
        ],
      },
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Lake Ponchartrain Causeway, Soundly\'s Observations", "Description": "", "Height": 50, "FocalLengthField": 2000, "Roll": 0, "Nick": 0, "Pan": 0.8, "nLines": 45, "showModel": 1, "showGrid": 0, "showData": false, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 8, 3 ], "NObjects": [ 128, 0 ], "ObjDist": [ 0, 0 ], "ObjDeltaDist": [ 300, 100 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 300, 0 ], "ObjSideVar": [ 0, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 1, 10 ], "ObjSizeVar": [ 0, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( 'and again..', AnimT1 ),
      Tval( 'Height', 3, AnimT3 ),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Lake Ponchartrain Causeway, Soundly\'s Observations", "Description": "and again..", "Height": 3, "FocalLengthField": 2000, "Roll": 0, "Nick": 0, "Pan": 0.8, "nLines": 45, "showModel": 1, "showGrid": 0, "showData": false, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 8, 3 ], "NObjects": [ 128, 0 ], "ObjDist": [ 0, 0 ], "ObjDeltaDist": [ 300, 100 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 300, 0 ], "ObjSideVar": [ 0, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 1, 10 ], "ObjSizeVar": [ 0, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Tval( 'Height', 50, AnimT3, AnimT1 ),
      Ttxt( 'The Model predicts that we should see Curvature in Images of the Bridge.', AnimT1 ),
      {
        Mode: 'parallel',
        Delay: AnimT1,
        TaskList: [
          Tval( 'ObjSidePos[0]', 100, AnimT5 ),
          Tval( 'Height', 8, AnimT5 ),
          Tval( 'Pan', 0.5, AnimT5 ),
        ],
      },
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Lake Ponchartrain Causeway, Soundly\'s Observations", "Description": "The Model predicts that we should see Curvature in Images of the Bridge.", "Height": 8, "FocalLengthField": 2000, "Roll": 0, "Nick": 0, "Pan": 0.5, "nLines": 45, "showModel": 1, "showGrid": 0, "showData": false, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 8, 3 ], "NObjects": [ 128, 0 ], "ObjDist": [ 0, 0 ], "ObjDeltaDist": [ 300, 100 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 100, 0 ], "ObjSideVar": [ 0, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 1, 10 ], "ObjSizeVar": [ 0, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Delay: AnimT1,
    Mode: 'serial',
    TaskList: [
      {
        Mode: 'parallel',
        TaskList: [
          Tval( 'FocalLengthField', 500, AnimT5 ),
          Tval( 'Height', 100, AnimT5 ),
        ],
      },
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Lake Ponchartrain Causeway, Soundly\'s Observations", "Description": "The Model predicts that we should see Curvature in Images of the Bridge.", "Height": 100, "FocalLengthField": 500, "Roll": 0, "Nick": 0, "Pan": 0.5, "nLines": 45, "showModel": 1, "showGrid": 0, "showData": false, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 8, 3 ], "NObjects": [ 128, 0 ], "ObjDist": [ 0, 0 ], "ObjDeltaDist": [ 300, 100 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 100, 0 ], "ObjSideVar": [ 0, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 1, 10 ], "ObjSizeVar": [ 0, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Delay: AnimT1,
    Mode: 'serial',
    TaskList: [
      {
        Mode: 'parallel',
        TaskList: [
          Tval( 'Height', 10.8, AnimT5 ),
          Tval( 'ObjDist[0]', 496, AnimT5 ),
          Tval( 'ObjSidePos[0]', 55.5, AnimT5 ),
          Tval( 'Pan', 0.45, AnimT5 ),
          Tval( 'Nick', -0.03, AnimT5 ),
        ],
      },
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Lake Ponchartrain Causeway, Soundly\'s Observations", "Description": "The Model predicts that we should see Curvature in Images of the Bridge.", "Height": 10.8, "FocalLengthField": 500, "Roll": 0, "Nick": -0.03, "Pan": 0.45, "nLines": 45, "showModel": 1, "showGrid": 0, "showData": false, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 8, 3 ], "NObjects": [ 128, 0 ], "ObjDist": [ 496, 0 ], "ObjDeltaDist": [ 300, 100 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 55.5, 0 ], "ObjSideVar": [ 0, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 1, 10 ], "ObjSizeVar": [ 0, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Delay: AnimT1,
    Mode: 'serial',
    TaskList: [
      Tval( 'FocalLengthField', 2200, AnimT5 ),
      Ttxt( 'To see Soundly\'s corresponding Image, click on Scene 1' ),
      Tval( 'Height', 4.1, AnimT3, AnimT1 ),
      Tval( 'Height', 10.8, AnimT3, AnimT1 ),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Lake Ponchartrain Causeway, Soundly\'s Observations", "Description": "To see Soundly\'s corresponding Image, click on Scene 1", "Height": 10.8, "FocalLengthField": 2200, "Roll": 0, "Nick": -0.03, "Pan": 0.45, "nLines": 45, "showModel": 1, "showGrid": 0, "showData": false, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 8, 3 ], "NObjects": [ 128, 0 ], "ObjDist": [ 496, 0 ], "ObjDeltaDist": [ 300, 100 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 55.5, 0 ], "ObjSideVar": [ 0, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 1, 10 ], "ObjSizeVar": [ 0, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Delay: AnimT1,
    Mode: 'serial',
    TaskList: [
      Ttxt( '' ),
      {
        Mode: 'parallel',
        Delay: 0,
        TaskList: [
          Tval( 'FocalLengthField', 3000, AnimT5 ),
          Tval( 'Height', 5.5, AnimT5 ),
          Tval( 'ObjDist[0]', 0, AnimT5 ),
          Tval( 'ObjSidePos[0]', 48.4, AnimT5 ),
          Tval( 'Pan', 0.31, AnimT5 ),
          Tval( 'Nick', 0, AnimT5 ),
        ],
      },
      Ttxt( 'Click on Scene 2 for this Image' ),
      Tpse( AnimT3 ),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Lake Ponchartrain Causeway, Soundly\'s Observations", "Description": "Click on Scene 2 for this Image", "Height": 5.5, "FocalLengthField": 3000, "Roll": 0, "Nick": 0, "Pan": 0.31, "nLines": 45, "showModel": 1, "showGrid": 0, "showData": false, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 8, 3 ], "NObjects": [ 128, 0 ], "ObjDist": [ 0, 0 ], "ObjDeltaDist": [ 300, 100 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 48.4, 0 ], "ObjSideVar": [ 0, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 1, 10 ], "ObjSizeVar": [ 0, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( '' ),
      {
        Mode: 'parallel',
        TaskList: [
          Tval( 'FocalLengthField', 500, AnimT5 ),
          Tval( 'Height', 100, AnimT5 ),
          Tval( 'ObjSidePos[0]', 26, AnimT5 ),
          Tval( 'Pan', 0, AnimT5 ),
        ],
      },
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Lake Ponchartrain Causeway, Soundly\'s Observations", "Description": "", "Height": 100, "FocalLengthField": 500, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 45, "showModel": 1, "showGrid": 0, "showData": false, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 8, 3 ], "NObjects": [ 128, 0 ], "ObjDist": [ 0, 0 ], "ObjDeltaDist": [ 300, 100 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 26, 0 ], "ObjSideVar": [ 0, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 1, 10 ], "ObjSizeVar": [ 0, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Delay: AnimT1,
    Mode: 'serial',
    TaskList: [
      {
        Mode: 'parallel',
        TaskList: [
          Tval( 'FocalLengthField', 2180, AnimT5, AnimT3 ),
          Tval( 'Height', 2.71, AnimT5 ),
          Tval( 'ObjSidePos[0]', 4.3, AnimT5 ),
          Tval( 'Nick', 0.021, AnimT5 ),
          Tval( 'Pan', -0.07, AnimT5 ),
        ],
      },
      Ttxt( 'Click on Scene 3 for this Image' ),
      Tval( 'Height', 10.8, AnimT3, AnimT1 ),
      Tval( 'Height', 2.71, AnimT3, AnimT1 ),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Lake Ponchartrain Causeway, Soundly\'s Observations", "Description": "Click on Scene 3 for this Image", "Height": 2.71, "FocalLengthField": 2180, "Roll": 0, "Nick": 0.021, "Pan": -0.07, "nLines": 45, "showModel": 1, "showGrid": 0, "showData": false, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 8, 3 ], "NObjects": [ 128, 0 ], "ObjDist": [ 0, 0 ], "ObjDeltaDist": [ 300, 100 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 4.3, 0 ], "ObjSideVar": [ 0, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 1, 10 ], "ObjSizeVar": [ 0, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( '' ),
      {
        Mode: 'parallel',
        Delay: AnimT1,
        TaskList: [
          Tval( 'FocalLengthField', 1000, AnimT5 ),
          Tval( 'Height', 100, AnimT5 ),
          Tval( 'ObjSidePos[0]', -17, AnimT5 ),
          Tval( 'Pan', -0.14, AnimT5 ),
          Tval( 'Nick', 0, AnimT5 ),
        ],
      },
      {
        Mode: 'parallel',
        Delay: 0,
        TaskList: [
          Tval( 'FocalLengthField', 1970, AnimT5, AnimT3 ),
          Tval( 'Height', 3.5, AnimT5 ),
          Tval( 'ObjSidePos[0]', -43, AnimT5 ),
          Tval( 'Nick', 0.053, AnimT5 ),
          Tval( 'Pan', -0.37, AnimT5 ),
        ],
      },
      Ttxt( 'Click on Scene 4 for this Image' ),
      Tval( 'Height', 10.8, AnimT3, AnimT1 ),
      Tval( 'Height', 3.5, AnimT3, AnimT1 ),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Lake Ponchartrain Causeway, Soundly\'s Observations", "Description": "Click on Scene 4 for this Image", "Height": 3.5, "FocalLengthField": 1970, "Roll": 0, "Nick": 0.053, "Pan": -0.37, "nLines": 45, "showModel": 1, "showGrid": 0, "showData": false, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 8, 3 ], "NObjects": [ 128, 0 ], "ObjDist": [ 0, 0 ], "ObjDeltaDist": [ 300, 100 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ -43, 0 ], "ObjSideVar": [ 0, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 1, 10 ], "ObjSizeVar": [ 0, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( 'Soundly\'s Images show Curvature exactly as predicted by this Model.', AnimT1 ),
      {
        Mode: 'parallel',
        TaskList: [
          Tval( 'FocalLengthField', 1500, AnimT5 ),
          Tval( 'Height', 50, AnimT5 ),
          Tval( 'ObjSidePos[0]', 6, AnimT5 ),
          Tval( 'Pan', 0, AnimT5 ),
          Tval( 'Nick', 0, AnimT5 ),
        ],
      },
      {
        Mode: 'parallel',
        TaskList: [
          Tval( 'FocalLengthField', 2200, AnimT5, AnimT4 ),
          Tval( 'Height', 10.8, AnimT5 ),
          Tval( 'ObjDist[0]', 496, AnimT5 ),
          Tval( 'ObjSidePos[0]', 55.5, AnimT5 ),
          Tval( 'Pan', 0.45, AnimT5 ),
          Tval( 'Nick', -0.03, AnimT5 ),
        ],
      },
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Lake Ponchartrain Causeway, Soundly\'s Observations", "Description": "Soundly\'s Images show Curvature exactly as predicted by this Model.", "Height": 10.8, "FocalLengthField": 2200, "Roll": 0, "Nick": -0.03, "Pan": 0.45, "nLines": 45, "showModel": 1, "showGrid": 0, "showData": false, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 8, 3 ], "NObjects": [ 128, 0 ], "ObjDist": [ 496, 0 ], "ObjDeltaDist": [ 300, 100 ], "ObjSideType": [ 0, 0 ], "ObjSidePos": [ 55.5, 0 ], "ObjSideVar": [ 0, 0 ], "ObjSizeType": [ 0, 0 ], "ObjSize": [ 1, 10 ], "ObjSizeVar": [ 0, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);


// Chicago Demo

Demos.New( 'Chicago',
  '<a target="_blank" href="https://joshuanowicki.smugmug.com/Looking-toward-Chicago-from-Mi/i-3dCDGJX">Image: Looking toward Chicago from Michigan</a> [Eric Young]; <a target="_blank" href="https://www.metabunk.org/standard-atmospheric-refraction-empirical-evidence-and-derivation.t8703/">Standard Atmospheric Refraction</a> [metabunk]'
);

Demos.AddState(
  'CurveApp = { "DemoText": "Chicago Skyline", "Description": "Observer Altitude = 2 m, City Distance = 3.4 km, Tallest Building = 442 m", "Height": 2, "FocalLengthField": 34, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 45, "showModel": 3, "showGrid": 1, "showData": false, "showTangent": false, "showEyeLevel": true, "deviceRatio": 1.5, "viewcenterHorizon": 2, "ObjType": [ 4, 3 ], "NObjects": [ 6, 0 ], "ObjDist": [ 3400, 0 ], "ObjDeltaDist": [ 200, 100 ], "ObjSideType": [ 2, 0 ], "ObjSidePos": [ 1040, 0 ], "ObjSideVar": [ -30.5, 0 ], "ObjSizeType": [ 3, 0 ], "ObjSize": [ 442, 10 ], "ObjSizeVar": [ 0.381, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( 'Lets cross Lake Michigan to Grand Mere State Park', AnimT3 ),
      Tval( 'showEyeLevel', false ),
      Tval( 'ObjDist[0]', 91100, AnimT5, AnimT3 ),
      Ttxt( 'Distance = 91.1 km', AnimT1 ),
      Ttxt( 'On the Globe, Chicago disappeared behind the Curvature of the Earth', AnimT3 ),
      Tpse( AnimT3 ),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Chicago Skyline", "Description": "On the Globe, Chicago disappeared behind the Curvature of the Earth", "Height": 2, "FocalLengthField": 34, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 45, "showModel": 3, "showGrid": 1, "showData": false, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 2, "ObjType": [ 4, 3 ], "NObjects": [ 6, 0 ], "ObjDist": [ 91100, 0 ], "ObjDeltaDist": [ 200, 100 ], "ObjSideType": [ 2, 0 ], "ObjSidePos": [ 1040, 0 ], "ObjSideVar": [ -30.5, 0 ], "ObjSizeType": [ 3, 0 ], "ObjSize": [ 442, 10 ], "ObjSizeVar": [ 0.381, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( 'Zooming in (f = 800 mm) does not bring the Skyline back into view', AnimT1 ),
      Tval( 'FocalLengthField', 800, AnimT5, AnimT1 ),
      Tval( 'showEyeLevel', true ),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Chicago Skyline", "Description": "Zooming in (f = 800 mm) does not bring the Skyline back into view", "Height": 2, "FocalLengthField": 800, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 45, "showModel": 3, "showGrid": 1, "showData": false, "showTangent": false, "showEyeLevel": true, "deviceRatio": 1.5, "viewcenterHorizon": 2, "ObjType": [ 4, 3 ], "NObjects": [ 6, 0 ], "ObjDist": [ 91100, 0 ], "ObjDeltaDist": [ 200, 100 ], "ObjSideType": [ 2, 0 ], "ObjSidePos": [ 1040, 0 ], "ObjSideVar": [ -30.5, 0 ], "ObjSizeType": [ 3, 0 ], "ObjSize": [ 442, 10 ], "ObjSizeVar": [ 0.381, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( 'Lets climb a nearby Hill of Height = 200 m', AnimT1 ),
      Tval( 'Height', 200, AnimT5, AnimT3 ),
      Ttxt( 'Now 313 m of the Skyline comes into view, 129 m are still hidden', AnimT1 ),
      Ttxt( 'H = 200 m: Note that the whole Skyline is BELOW Eye-Level', AnimT5 ),
      Tpse( AnimT3 ),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Chicago Skyline", "Description": "H = 200 m: Note that the whole Skyline is BELOW Eye-Level", "Height": 200, "FocalLengthField": 800, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 45, "showModel": 3, "showGrid": 1, "showData": false, "showTangent": false, "showEyeLevel": true, "deviceRatio": 1.5, "viewcenterHorizon": 2, "ObjType": [ 4, 3 ], "NObjects": [ 6, 0 ], "ObjDist": [ 91100, 0 ], "ObjDeltaDist": [ 200, 100 ], "ObjSideType": [ 2, 0 ], "ObjSidePos": [ 1040, 0 ], "ObjSideVar": [ -30.5, 0 ], "ObjSizeType": [ 3, 0 ], "ObjSize": [ 442, 10 ], "ObjSizeVar": [ 0.381, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( 'Lets go down to the Beach (2 m) again', AnimT1 ),
      Tval( 'Height', 2, AnimT5, AnimT3 ),
      Ttxt( 'Now lets apply severe Refraction of 3.5 R (Looming)', AnimT1 ),
      Tval( 'refractionCoeff', 0.714286, AnimT3, AnimT3 ),
      Ttxt( 'H = 2 m: Now 280 m of the Skyline comes into view again, 162 m are hidden', AnimT1 ),
      Tpse( AnimT3 ),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Chicago Skyline", "Description": "H = 2 m: Now 280 m of the Skyline comes into view again, 162 m are hidden", "Height": 2, "FocalLengthField": 800, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 45, "showModel": 3, "showGrid": 1, "showData": false, "showTangent": false, "showEyeLevel": true, "deviceRatio": 1.5, "viewcenterHorizon": 2, "ObjType": [ 4, 3 ], "NObjects": [ 6, 0 ], "ObjDist": [ 91100, 0 ], "ObjDeltaDist": [ 200, 100 ], "ObjSideType": [ 2, 0 ], "ObjSidePos": [ 1040, 0 ], "ObjSideVar": [ -30.5, 0 ], "ObjSizeType": [ 3, 0 ], "ObjSize": [ 442, 10 ], "ObjSizeVar": [ 0.381, 0 ], "refractionCoeff": 0.714286, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( 'Lets remove Refraction and climb to 660 m', AnimT5 ),
      Tval( 'refractionCoeff', 0, AnimT3, AnimT3 ),
      Tval( 'Height', 660, AnimT5, AnimT2 ),
      Ttxt( 'At an Altitude of 660 m the whole City is now visible.', AnimT1 ),
      Ttxt( 'On the Flat Earth the Skyline never disapeared!', AnimT3 ),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Chicago Skyline", "Description": "On the Flat Earth the Skyline never disapeared!", "Height": 660, "FocalLengthField": 800, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 45, "showModel": 3, "showGrid": 1, "showData": false, "showTangent": false, "showEyeLevel": true, "deviceRatio": 1.5, "viewcenterHorizon": 2, "ObjType": [ 4, 3 ], "NObjects": [ 6, 0 ], "ObjDist": [ 91100, 0 ], "ObjDeltaDist": [ 200, 100 ], "ObjSideType": [ 2, 0 ], "ObjSidePos": [ 1040, 0 ], "ObjSideVar": [ -30.5, 0 ], "ObjSizeType": [ 3, 0 ], "ObjSize": [ 442, 10 ], "ObjSizeVar": [ 0.381, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);


// Canigou Animation

Demos.New( 'Canigou',
  '<a target="_blank" href="https://www.metabunk.org/explained-observations-of-canigou-curvature-of-the-earth-atmospheric-refraction.t8688/">Observations of Canigou, Curvature of the Earth & Atmospheric Refraction</a> [metabunk]'
);

Demos.AddState(
  'CurveApp = { "DemoText": "Canigou Mountain", "Description": "This represents the Canigou Mountain in France; Height = 2790 m", "Height": 244, "FocalLengthField": 34, "Roll": 0, "Nick": 7.36, "Pan": 0, "nLines": 45, "showModel": 1, "showGrid": 1, "showData": false, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 5, 3 ], "NObjects": [ 40, 0 ], "ObjDist": [ 7230, 0 ], "ObjDeltaDist": [ 60, 100 ], "ObjSideType": [ 2, 0 ], "ObjSidePos": [ 0, 0 ], "ObjSideVar": [ -5620, 0 ], "ObjSizeType": [ 3, 0 ], "ObjSize": [ 2790, 10 ], "ObjSizeVar": [ 0.125, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( 'Lets fly to Allauch near Marseille: Distance = 257 km:', AnimT3 ),
      Tval( 'showData', true ),
      {
        Delay: AnimT2,
        Mode: 'parallel',
        TaskList: [
          Tval( 'ObjDist[0]', 257000, AnimT5 ),
          Tval( 'Height', 1000, AnimT5 ),
          Tval( 'Nick', 0, AnimT5 ),
        ],
      },
      Ttxt( 'We are currently at an Altiude of 1000 m and can only see the top half of the Mountain.', AnimT1 ),
      Tpse( AnimT3 ),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Canigou Mountain", "Description": "We are currently at an Altiude of 1000 m and can only see the top half of the Mountain.", "Height": 1000, "FocalLengthField": 34, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 45, "showModel": 1, "showGrid": 1, "showData": true, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 5, 3 ], "NObjects": [ 40, 0 ], "ObjDist": [ 257000, 0 ], "ObjDeltaDist": [ 60, 100 ], "ObjSideType": [ 2, 0 ], "ObjSidePos": [ 0, 0 ], "ObjSideVar": [ -5620, 0 ], "ObjSizeType": [ 3, 0 ], "ObjSize": [ 2790, 10 ], "ObjSizeVar": [ 0.125, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( 'Lets zoom in to f = 1000 mm to take a closer look:', AnimT1 ),
      Tval( 'showData', false, AnimT3 ),
      Tval( 'FocalLengthField', 1000, AnimT5 ),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Canigou Mountain", "Description": "Lets zoom in to f = 1000 mm to take a closer look:", "Height": 1000, "FocalLengthField": 1000, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 45, "showModel": 1, "showGrid": 1, "showData": false, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 5, 3 ], "NObjects": [ 40, 0 ], "ObjDist": [ 257000, 0 ], "ObjDeltaDist": [ 60, 100 ], "ObjSideType": [ 2, 0 ], "ObjSidePos": [ 0, 0 ], "ObjSideVar": [ -5620, 0 ], "ObjSizeType": [ 3, 0 ], "ObjSize": [ 2790, 10 ], "ObjSizeVar": [ 0.125, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( 'Lets go down to a Hill in Allauch at 244 m Altitude:', AnimT1 ),
      Ttxt( 'According to some Curvature Calculators we should NOT be able to see the Mountain:', AnimT3 ),
      Tval( 'Height', 244, AnimT5, AnimT3 ),
      Ttxt( 'H = 244 m: Yes indeed, the whole Mountain is now hidden behind the Curvature of the Earth!', AnimT1 ),
      Tpse( AnimT3 ),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Canigou Mountain", "Description": "H = 244 m: Yes indeed, the whole Mountain is now hidden behind the Curvature of the Earth!", "Height": 244, "FocalLengthField": 1000, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 45, "showModel": 1, "showGrid": 1, "showData": false, "showTangent": false, "showEyeLevel": false, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 5, 3 ], "NObjects": [ 40, 0 ], "ObjDist": [ 257000, 0 ], "ObjDeltaDist": [ 60, 100 ], "ObjSideType": [ 2, 0 ], "ObjSidePos": [ 0, 0 ], "ObjSideVar": [ -5620, 0 ], "ObjSizeType": [ 3, 0 ], "ObjSize": [ 2790, 10 ], "ObjSizeVar": [ 0.125, 0 ], "refractionCoeff": 0, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( 'But according to some Pictures (see Link above) we should be able to see Part of it !?', AnimT1 ),
      Ttxt( 'Maybe Refraction plays a role. Lets add Standard Refraction:', AnimT3 ),
      Tval( 'showEyeLevel', true, 0, AnimT3 ),
      Tval( 'showData', true ),
      Tval( 'refractionCoeff', 0.16761, AnimT5 ),
      Ttxt( 'Standard Refraction raises the Mountain relative to the Horizon about 670 m!', AnimT2 ),
      Tpse( AnimT3 ),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Canigou Mountain", "Description": "Standard Refraction raises the Mountain relative to the Horizon about 670 m!", "Height": 244, "FocalLengthField": 1000, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 45, "showModel": 1, "showGrid": 1, "showData": true, "showTangent": false, "showEyeLevel": true, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 5, 3 ], "NObjects": [ 40, 0 ], "ObjDist": [ 257000, 0 ], "ObjDeltaDist": [ 60, 100 ], "ObjSideType": [ 2, 0 ], "ObjSidePos": [ 0, 0 ], "ObjSideVar": [ -5620, 0 ], "ObjSizeType": [ 3, 0 ], "ObjSize": [ 2790, 10 ], "ObjSizeVar": [ 0.125, 0 ], "refractionCoeff": 0.16761, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( 'How can that be?', AnimT1 ),
      Ttxt( 'The Refraction Angle is 0.194 degrees.', AnimT2 ),
      Ttxt( 'The Angular Size of the Mountain at this Distance is only 0.623 degrees.', AnimT4 ),
      Ttxt( 'So the Mountain is raised 0.194 / 0.623 = 31.1% of its Height: that is 867 m!', AnimT4 ),
      Tpse( AnimT3 ),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Canigou Mountain", "Description": "So the Mountain is raised 0.194 / 0.623 = 31.1% of its Height: that is 867 m!", "Height": 244, "FocalLengthField": 1000, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 45, "showModel": 1, "showGrid": 1, "showData": true, "showTangent": false, "showEyeLevel": true, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 5, 3 ], "NObjects": [ 40, 0 ], "ObjDist": [ 257000, 0 ], "ObjDeltaDist": [ 60, 100 ], "ObjSideType": [ 2, 0 ], "ObjSidePos": [ 0, 0 ], "ObjSideVar": [ -5620, 0 ], "ObjSizeType": [ 3, 0 ], "ObjSize": [ 2790, 10 ], "ObjSizeVar": [ 0.125, 0 ], "refractionCoeff": 0.16761, "tempGradient": -0.0343, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( 'But the Horizon raises too, so the raise relative to the Horizon is reduced to 670 m.', AnimT1 ),
      Ttxt( 'The Temperature Gradient is now Standard dT/dh = -0.65°C/100m.', AnimT4 ),
      Ttxt( 'Lets see what a stable Inversion with a Gradient dT/dh = +1°C/100m can achieve:', AnimT4 ),
      Tval( 'refractionCoeff', 0.267083, AnimT5 ),
      Ttxt( 'On the real Globe there is no Problem to see Mount Canigou!', AnimT1 ),
      Tpse( AnimT3 ),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Canigou Mountain", "Description": "On the real Globe there is no Problem to see Mount Canigou!", "Height": 244, "FocalLengthField": 1000, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 45, "showModel": 1, "showGrid": 1, "showData": true, "showTangent": false, "showEyeLevel": true, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 5, 3 ], "NObjects": [ 40, 0 ], "ObjDist": [ 257000, 0 ], "ObjDeltaDist": [ 60, 100 ], "ObjSideType": [ 2, 0 ], "ObjSidePos": [ 0, 0 ], "ObjSideVar": [ -5620, 0 ], "ObjSizeType": [ 3, 0 ], "ObjSize": [ 2790, 10 ], "ObjSizeVar": [ 0.125, 0 ], "refractionCoeff": 0.267083, "tempGradient": 0.01, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);

Demos.AddAnimation(
  {
    Mode: 'serial',
    TaskList: [
      Ttxt( 'Lets compare how the Scene would look like on the Flat Earth:', AnimT1 ),
      {
        Delay: AnimT3,
        Mode: 'parallel',
        TaskList: [
          Tval( 'FocalLengthField', 350, AnimT5 ),
          Tval( 'ObjSidePos[0]', 6490, AnimT5 ),
        ],
      },
      Tval( 'showModel', 3 ),
      Ttxt( 'On Flat Eath the whole Mountain should be visible, but is not in Reality!', AnimT1 ),
    ],
  }
);

Demos.AddState(
  'CurveApp = { "DemoText": "Canigou Mountain", "Description": "On Flat Eath the whole Mountain should be visible, but is not in Reality!", "Height": 244, "FocalLengthField": 350, "Roll": 0, "Nick": 0, "Pan": 0, "nLines": 45, "showModel": 3, "showGrid": 1, "showData": true, "showTangent": false, "showEyeLevel": true, "deviceRatio": 1.5, "viewcenterHorizon": 0, "ObjType": [ 5, 3 ], "NObjects": [ 40, 0 ], "ObjDist": [ 257000, 0 ], "ObjDeltaDist": [ 60, 100 ], "ObjSideType": [ 2, 0 ], "ObjSidePos": [ 6490, 0 ], "ObjSideVar": [ -5620, 0 ], "ObjSizeType": [ 3, 0 ], "ObjSize": [ 2790, 10 ], "ObjSizeVar": [ 0.125, 0 ], "refractionCoeff": 0.267083, "tempGradient": 0.01, "refractionSync": 1, "pressure": 1013.0098, "temperatureC": 14.987, "refractionFactMin": 0.5, "refractionFactMax": 10000, "rEarth": 6371000, "rFEarth": 10007543 }'
);
