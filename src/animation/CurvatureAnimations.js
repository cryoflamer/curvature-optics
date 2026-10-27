


/* Animations */

var CurrentAnimation = null;

function StartAnimation( animation ) {
  if (CurrentAnimation && CurrentAnimation != animation) StopAnimation();
  CurrentAnimation = animation;
  CurrentAnimation.Start();
}

function StopAnimation() {
  if (!CurrentAnimation) return;
  CurrentAnimation.Stop();
  CurrentAnimation = null;
}

function OnAnimationEnd() {
  CurveApp.DemoText = '';
  CurveApp.Description = '';
  CurrentAnimation = null;
  UpdateAll( false );
}

// helper functions

var AnimationSpeed = 1;  // > 0

var AnimRestartAction = 'stop';
var AnimTxt = 500 / AnimationSpeed;
var AnimT1 = 1000 / AnimationSpeed;
var AnimT2 = 2000 / AnimationSpeed;
var AnimT3 = 3000 / AnimationSpeed;
var AnimT4 = 4000 / AnimationSpeed;
var AnimT5 = 5000 / AnimationSpeed;
var AnimT6 = 6000 / AnimationSpeed;

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

// Curve Animation

function ResetModel() {
  var m = CurveApp;
  InitAnyAnimation( '', 100 );
  ShowMoreInfos();
  m.showGrid = 1; // on
  m.showEyeLevel = true;
  UpdateAll( true );
}

function ShowMoreInfos( infos ) {
  if (infos) {
    xInnerHTML( 'MoreAnimationInfos', infos );
  } else {
    xInnerHTML( 'MoreAnimationInfos', 'Click a Button to Start an Animation. Click again to stop it.' );
  }
}

function InitAnyAnimation( demoText, height ) {
  var m = CurveApp;
  ShowMoreInfos();
  m.DemoText = demoText;
  m.showModel = 1; // globe
  m.showEyeLevel = false;
  m.showGrid = 0; // off
  m.showData = false;
  m.showTangent = false;
  m.viewcenterHorizon = 0; // globe
  m.Height = height;
  m.FocalLengthField = 33.9;
  m.Nick = 0;
  m.Roll = 0;
  m.Pan  = 0;
  m.refractionSync = 1;
  m.refractionCoeff = 0;

  m.ObjType[0] = 3;
  m.NObjects[0] = 0;
  m.ObjDist[0] = 0;
  m.ObjDeltaDist[0] = 100;
  m.ObjSidePos[0] = 0;
  m.ObjSideType[0] = 0; // lin
  m.ObjSideVar[0] = 0;
  m.ObjSize[0] = 10;
  m.ObjSizeType[0] = 0; // lin
  m.ObjSizeVar[0] = 0;

  m.ObjType[1] = 3;
  m.NObjects[1] = 0;
  m.ObjDist[1] = 0;
  m.ObjDeltaDist[1] = 100;
  m.ObjSidePos[1] = 0;
  m.ObjSideType[1] = 0; // lin
  m.ObjSideVar[1] = 0;
  m.ObjSize[1] = 10;
  m.ObjSizeType[1] = 0; // lin
  m.ObjSizeVar[1] = 0;
}

function InitCurveAnimation( anim ) {
  var m = CurveApp;
  InitAnyAnimation( 'Where is the Curve?', 2 );
  ShowMoreInfos( 'Simulation of the Globe Curvature and Comparison with Flat Earth. <a target="_blank" href="https://www.metabunk.org/stand-up-to-detect-the-curve-of-the-earth.t8364/">Stand Up to Detect the Curve of the Earth</a> [metabunk]' );
  m.showModel = 1; // globe
  m.showGrid = 1; // on
  m.showData = true;
  UpdateAll( false );
}

var CurveAnimation = NewAnimation( {
  ModelRef: CurveApp,
  OnModelChange: function CB_OnModelChange_CurveAnimation(){
    UpdateAll(false);
  },
  OnLoopInit: InitCurveAnimation,
  OnTaskEnd: OnAnimationEnd,
  RestartAction: AnimRestartAction,
  Mode: 'serial',
  TaskList: [
    Ttxt( 'This is the View of the Globe at Observer Height = 2 m, FoV = 65 deg' ),
    Tpan( AnimT2 ),
    Ttxt( 'Looks pretty flat, no Curvature visible. Lets go higher.' ),
    Tval( 'Height', 500, AnimT3, AnimT3 ),
    Ttxt( 'Height = 500 m. Still looking flat. Horizon at 80 km.', AnimT1 ),
    Tpan( AnimT3 ),
    Ttxt( 'Lets compaire with Flat Earth view.' ),
    Tval( 'showModel', 3, 0, AnimT2 ),
    Tval( 'showEyeLevel', true ),
    Ttxt( 'Looking flat too. But the Globe Horizon is NOT at Eye-Level!', AnimT2 ),
    Tpan( AnimT3 ),
    Ttxt( 'Lets climb to an Altitude of an Airplane at 12 km.', AnimT1 ),
    Tval( 'Height', 12000, AnimT5, AnimT2 ),
    Ttxt( 'The Globe Horizon is at 390 km now and has dropped to 3.5 degrees.', AnimT1 ),
    Tval( 'showModel', 1, 0, AnimT5 ),
    Ttxt( 'And we see a slightly bent Horizon!', AnimT3 ),
    Tval( 'showTangent', true, 0, AnimT3 ),
    Tpan( AnimT2 ),
    Ttxt( 'Lets Zoom in to f = 100 mm.', AnimT1 ),
    Tval( 'FocalLengthField', 100, AnimT3, AnimT3 ),
    Ttxt( 'Now the Horizon looks flat again. So the Field of View (Zooming) matters.', AnimT1 ),
    Tpan( AnimT2 ),
    Ttxt( 'Note that the Curvature is mainly down, not horizontally!', AnimT2 ),
    Ttxt( 'Lets climb to an Altitude of an amateur Rocket of 100 km.', AnimT6 ),
    Tval( 'Height', 100000, AnimT5, AnimT3 ),
    Ttxt( 'The Horizon has dropped to 10 degrees but still looks not much curved.', AnimT1 ),
    Tpan( AnimT2 ),
    Ttxt( 'Perhaps if we Zoom out again to 65 deg Field of View:', AnimT1 ),
    Tval( 'FocalLengthField', 33.9, AnimT3, AnimT3 ),
    Ttxt( 'Yes, clearly curved horizontally now.', AnimT1 ),
    Tpan( AnimT2 ),
    Ttxt( 'Lets compaire with Flat Earth again:', AnimT1 ),
    Tval( 'showModel', 3, 0, AnimT3 ),
    Ttxt( 'Even the Flat Earth Ice Wall Horizon dropped slightly', AnimT3 ),
    Ttxt( 'Lets climb to ISS Altitude of 400 km:', AnimT5 ),
    {
      Delay: AnimT3,
      Mode: 'parallel',
      TaskList: [
        Tval( 'Height', 400000, AnimT5 ),
        Tval( 'Nick', 20, AnimT5 ),
      ],
    },
    Ttxt( 'We should see the Ice Wall at 20015 km on Flat Earth! Globe Horizon at 2200 km.', AnimT2 ),
    Ttxt( 'Zooming (500 mm) makes the Horizon flat again, even at this Altitude!', AnimT6 ),
    Tval( 'showModel', 1, 0, AnimT5 ),
    Tval( 'Nick', 0, AnimT3 ),
    Tval( 'FocalLengthField', 500, AnimT3 ),
    Tval( 'showEyeLevel', false ),
    Tpan( 0, 15 ),
    Tval( 'FocalLengthField', 33.9, AnimT3, AnimT1 ),
    Ttxt( 'Going to Geostationary Orbit of 35786 km...', AnimT1 ),
    Tval( 'showTangent', false ),
    Tval( 'Height', 35786000, AnimT5+AnimT5, AnimT2 ),
    Ttxt( 'and back to 500 m', AnimT3 ),
    Tval( 'Height', 400000, AnimT5, AnimT2 ),
    Tval( 'Height', 12000, AnimT5 ),
    Tval( 'Height', 500, AnimT5 ),
  ],
} );

// Causeway

function InitCausewayAnimation( anim ) {
  var m = CurveApp;
  InitAnyAnimation( 'Lake Pontchartrain Causeway', 100 );
  ShowMoreInfos( '<a target="_blank" href="https://www.youtube.com/watch?v=xulJeRwF9UM&t=3s">Video showing the Curvature of the Causeway</a> on <a target="_blank" href="https://www.youtube.com/channel/UCDXr2cbK7WlfeYEtJxC9i3w/videos">Soundlys Channel</a>' );
  m.showModel = 1; // globe
  m.ObjType[0] = 6; // bridge
  m.NObjects[0] = 41;
  m.ObjDeltaDist[0] = 967.5;
  m.ObjSidePos[0] = 45;
  m.ObjSideType[0] = 1; // 2-col
  m.ObjSideVar[0] = 30;
  m.ObjSize[0] = 5;
  UpdateAll( false );
}

var CausewayAnimation = NewAnimation( {
  ModelRef: CurveApp,
  OnModelChange: function CB_OnModelChange_CausewayAnimation(){
    UpdateAll(false);
  },
  OnLoopInit: InitCausewayAnimation,
  OnTaskEnd: OnAnimationEnd,
  RestartAction: AnimRestartAction,
  Mode: 'serial',
  TaskList: [
    Ttxt( 'To prove that the Earth is flat...' ),
    Ttxt( 'they often use pictures like this of the 38.7 km long Causeway Bridge.', AnimT3 ),
    Ttxt( 'From this Perspective, not the slightest Curvature of the Earth is visible.', AnimT5 ),
    Tpan( AnimT4, 20 ),
    Ttxt( 'Lets compaire this Globe Simulation with the Flat Earth Simulation:', AnimT1 ),
    Tval( 'Description', '', 0, AnimT5 ),
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
    Ttxt( 'Lets compaire side by side and look for Differences:', AnimT5 ),
    Tval( 'showModel', 3, 0, AnimT3 ),
    Tval( 'showGrid', 1 ),
    Tval( 'viewcenterHorizon', 2 ),
    Tval( 'showEyeLevel', true ),
    Ttxt( 'Aha! The Globe Horizon is not at Eye-Level.', AnimT4 ),
    Ttxt( 'But can this be noticed with the naked Eye? Certainly not!', AnimT4 ),
    Ttxt( 'Lets zoom in to f = 300 mm and take a closer look:', AnimT4 ),
    Tval( 'FocalLengthField', 300, AnimT3, AnimT4 ),
    Ttxt( 'The Bridge Segments are all 970 m long, but look much shorter now.', AnimT3 ),
    Ttxt( 'This is a well known Effect of Perspective: Zoom compresses Distances.', AnimT6 ),
    Ttxt( 'And we see a slight Down-Bending at the end of the Bridge on the Globe.', AnimT6 ),
    Tval( 'FocalLengthField', 2000, AnimT3, AnimT3 ),
    Ttxt( 'The Bridge Segments go over the Horizon on the Globe!', AnimT1 ),
    Ttxt( 'We can enhance this Effect by lowering the Point of View to 2.5 m:', AnimT4 ),
    Tval( 'Height', 2.5, AnimT5, AnimT4 ),
    Tval( 'Description', '' ),
    Tval( 'ObjSidePos[0]', 25, AnimT5 ),
    Ttxt( 'ZaVa (Zoom and View along) shows the Curvature of the Earth!' ),
    Tval( 'Description', '', 0, AnimT4+AnimT4 ),
  ],
} );

// TransLine Animation

function InitTransLineAnimation( anim ) {
  var m = CurveApp;
  InitAnyAnimation( 'Lake Pontchartrain Transmission Line', 100 );
  ShowMoreInfos( '<a target="_blank" href="https://www.metabunk.org/soundly-proving-the-curvature-of-the-earth-at-lake-pontchartrain.t8939/">Soundly Proving the Curvature of the Earth at Lake Pontchartrain</a> [metabunk], <a target="_blank" href="https://www.youtube.com/channel/UCDXr2cbK7WlfeYEtJxC9i3w/videos">Soundlys Channel</a>' );
  m.FocalLengthField = 100;
  m.Pan  = -10;
  m.ObjType[0] = 3; // Transmission Tower
  m.NObjects[0] = 85;
  m.ObjDist[0] = 50;
  m.ObjDeltaDist[0] = 297.55;
  m.ObjSidePos[0] = -500;
  m.ObjSize[0] = 23;
  m.ObjType[1] = 3; // Transmission Tower
  m.NObjects[1] = 2;
  m.ObjDist[1] = 25550;
  m.ObjDeltaDist[1] = 373;
  m.ObjSidePos[1] = -509.6;
  m.ObjSize[1] = 64;
  m.refractionCoeff = 0.17052;
  UpdateAll( false );
}

var TransLineAnimation = NewAnimation( {
  ModelRef: CurveApp,
  OnModelChange: function CB_OnModelChange_TransLineAnimation(){
    UpdateAll(false);
  },
  OnLoopInit: InitTransLineAnimation,
  OnTaskEnd: OnAnimationEnd,
  RestartAction: AnimRestartAction,
  Mode: 'serial',
  TaskList: [
    Tval( 'refractionSync', 2, 0, 1 ),
    Ttxt( 'This Transmission Line crosses Lake Pontchartrain in 25.9 km.' ),
    {
      Mode: 'parallel',
      TaskList: [
        Tval( 'ObjSidePos[0]', 500, 2*AnimT5, 0 ),
        Tval( 'ObjSidePos[1]',  490.4, 2*AnimT5, 0 ),
        Tval( 'Pan', 10, 2*AnimT5, 0 ),
      ],
    },
    Ttxt( 'There are 85 identical Towers 300 m apart.' ),
    {
      Delay: 0,
      Mode: 'parallel',
      TaskList: [
        Tval( 'FocalLengthField', 1000, AnimT5, 0 ),
        Tval( 'Pan', 1.68, AnimT5, 0 ),
        Tval( 'Height', 55, AnimT5, 0 ),
      ],
    },
    Ttxt( 'The last few Towers curve down behind the Horizon.' ),
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
    Ttxt( 'Zooming shows the Curvature clearly:' ),
    Tval( 'FocalLengthField', 2000, AnimT5, AnimT1 ),
    Tval( 'showGrid', 1, 0, AnimT1 ),
    Ttxt( 'Lets compaire with Flat Earth.', AnimT1 ),
    Tval( 'showModel', 3, 0, AnimT3 ),
    Ttxt( 'Removing Standard Refraction increases the Curvature even more.', AnimT5 ),
    Tval( 'showModel', 1, 0, AnimT3 ),
    Tval( 'refractionCoeff', 0, AnimT5 ),
    Ttxt( 'Here is the Curvature!', AnimT1 ),
    Tval( 'showModel', 1, 0, AnimT5 ),
    {
      Delay: AnimT2,
      Mode: 'parallel',
      TaskList: [
        Tval( 'FocalLengthField', 3500, 2*AnimT5, 0 ),
        Tval( 'ObjSidePos[0]', 32, 2*AnimT5, 0 ),
        Tval( 'ObjSidePos[1]', 22.4, 2*AnimT5, 0 ),
        Tval( 'Pan', 0.2, 2*AnimT5, 0 ),
        Tval( 'Nick', 1.53, 2*AnimT5, 0 ),
      ],
    },
  ],
} );

// Grace Animation

function InitGraceAnimation( anim ) {
  var m = CurveApp;
  InitAnyAnimation( 'Anacapa Island and Oil Platform Grace', 72 );
  ShowMoreInfos( '<a target="_blank" href="http://walter.bislins.ch/bloge/index.asp?page=Image%3AOil%2DPlattform%2DGrace%2Dbmlsb69%2Ejpg">Image of Platform Grace</a>; <a target="_blank" href="https://www.youtube.com/watch?v=XI5qKJm5eNQ">Original-Video</a> [bmlsb69]; <a target="_blank" href="https://www.youtube.com/watch?v=7W6h1oUVGPI">Oil Platforms and Islands | Observation and Analysis</a> [Jon McIntyre]' );

  m.showModel = 2; // flat earth
  m.showGrid = 1; // on
  m.viewcenterHorizon = 2; // between
  m.FocalLengthField = 2000;
  m.ObjType[0] = 6; // Bridge
  m.NObjects[0] = 2;
  m.ObjDist[0] = 25000;
  m.ObjDeltaDist[0] = 20;
  m.ObjSidePos[0] = 0;
  m.ObjSideVar[0] = 12;
  m.ObjSize[0] = 37.2;

  m.ObjType[1] = 5; // Mountain
  m.NObjects[1] = 2;
  m.ObjDist[1] = 25000;
  m.ObjDeltaDist[1] = 0.001;
  m.ObjSidePos[1] = 14.6;
  m.ObjSideVar[1] = -331;
  m.ObjSize[1] = 75;
  m.ObjSizeVar[1] = 0.0375;
  m.ObjSizeType[1] = 0; // Lin
  m.ObjSideType[1] = 0; // Lin

  m.refractionCoeff = 0.27266;
  UpdateAll( false );
}

var GraceAnimation = NewAnimation( {
  ModelRef: CurveApp,
  OnModelChange: function CB_OnModelChange_GraceAnimation(){
    UpdateAll(false);
  },
  OnLoopInit: InitGraceAnimation,
  OnTaskEnd: OnAnimationEnd,
  RestartAction: AnimRestartAction,
  Mode: 'serial',
  TaskList: [
    Ttxt( 'This is a Scheme of the Stituation:' ),
    Ttxt( 'Left: Observer at QAD Inc. Parking Lot, height = 72 m', AnimT5 ),
    Ttxt( 'Center: Oil Platform Grace, Distance = 28 km, Height = 37.2 m', AnimT5 ),
    Ttxt( 'Right: Anacapa Island, Distance = 50.1 km, Height = 75 m', AnimT5 ),
    Ttxt( 'If we look to the Island, the Platform must appear way below Eye-Level.', AnimT5 ),
    Ttxt( 'Lets build the Scene with the real Proportions', AnimT5 ),
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
    Ttxt( 'But this is not what we see in Reality!.', AnimT3 ),
    Ttxt( 'In reality the Scene looks like this (click Link above):', AnimT3 ),
    Tval( 'showModel', 1 ),
    Tval( 'viewcenterHorizon', 0 ),
    Ttxt( 'Medium Refraction has to be applied to align the Tops.', AnimT5 ),
    Ttxt( 'Lets see wether Refraction is the Reaoson why the Platform is Lifted so much.', AnimT5 ),
    Tval( 'refractionCoeff', 0, AnimT5, AnimT5 ),
    Ttxt( 'No, without Refraction the Platform appears even higher!', AnimT1 ),
    Ttxt( 'Lets see how Standard Refraction looks like:', AnimT5 ),
    Tval( 'refractionCoeff', 0.16974, AnimT5, AnimT1 ),
    Tval( 'refractionSync', 2, 0, 1 ),
    Ttxt( 'Reality tells the earth is a Globe.', AnimT5 ),
    Tval( 'showModel', 3 ),
    Tval( 'showEyeLevel', true ),
    Tval( 'viewcenterHorizon', 2 ),
    Ttxt( '', AnimT5 ),
  ],
} );

// Bedford Animation

function InitBedfordAnimation( anim ) {
  var m = CurveApp;
  InitAnyAnimation( 'Bedford Level Experiment', 7 );
  ShowMoreInfos( '<a target="_blank" href="https://en.wikipedia.org/wiki/Bedford_Level_experiment">Bedford Level Experiment</a> [Wikipedia]; <a target="_blank" href="https://www.metabunk.org/where-and-how-could-the-wallace-experiment-easily-be-repeated.t7920/">Where and How could the Wallace Experiment Easily Be Repeated?</a> [metabunk]' );
  m.showModel = 3; // globe + FE
  m.viewcenterHorizon = 3; // eye level
  m.FocalLengthField = 800;
  m.ObjType[0] = 0; // Bedford
  m.NObjects[0] = 3;
  m.ObjDist[0] = -8600;
  m.ObjDeltaDist[0] = 4830;
  m.ObjSideVar[0] = 18;
  m.ObjSize[0] = 4.04;
  UpdateAll( false );
}

var BedfordAnimation = NewAnimation( {
  ModelRef: CurveApp,
  OnModelChange: function CB_OnModelChange_BedfordAnimation(){
    UpdateAll(false);
  },
  OnLoopInit: InitBedfordAnimation,
  OnTaskEnd: OnAnimationEnd,
  RestartAction: AnimRestartAction,
  Mode: 'serial',
  TaskList: [
    {
      Delay: AnimT2,
      Mode: 'parallel',
      TaskList: [
        Tval( 'Description', 'Bridge with Marker' ),
        Tval( 'Description', 'Middle Marker', 0, AnimT2 ),
        Tval( 'Description', 'and Telescope', 0, AnimT4 ),
        Tval( 'Description', 'are at the same height (4 m) and 4830 m apart', 0, AnimT6 ),
        Tval( 'Height', 5, AnimT6 ),
        Tval( 'ObjDist[0]', 370, AnimT6 ),
        Tval( 'ObjSidePos[0]', 11, AnimT6 ),
        Tval( 'Height', 4.04, AnimT2, 2*AnimT5 ),
        Tval( 'ObjSidePos[0]', 9.23, AnimT2, 2*AnimT5 ),
        Tval( 'ObjDist[0]', 124, AnimT2, 2*AnimT5 ),
      ],
    },
    Tval( 'FocalLengthField', 5000, AnimT2, AnimT2 ),
    Ttxt( 'On the Globe, the middle Marker appears ABOVE the Bridge Marker', AnimT1 ),
    Tval( 'Height', 4.135, AnimT1, AnimT3 ),
    Ttxt( 'but both Markers appear below Eye-Level', AnimT5 ),
    Tval( 'showEyeLevel', true, 0, AnimT3 ),
    Tval( 'Height', 4.04, AnimT1, AnimT1 ),
    Ttxt( 'Refraction makes the scene appear more flat', AnimT5 ),
    Tval( 'refractionRadius', 6371000 * 7 / 2, AnimT1, AnimT3 ),
    Ttxt( 'Note: the bridge appears no longer behind the horizon', AnimT3 ),
    Ttxt( 'Whithout Refraction the bridge is partially hidden behind the horizon', AnimT5 ),
    Tval( 'showGrid', 1, 0, AnimT3 ),
    Tval( 'refractionRadius', 6371000, AnimT1, AnimT1 ),
    Ttxt( 'With more Markers (every 200 m)...', AnimT5 ),
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
} );

function InitTensasAnimation( anim ) {
  var m = CurveApp;
  InitAnyAnimation( 'Little Tensas Bayou', 18300 );
  ShowMoreInfos( '<a target="_blank" href="https://www.youtube.com/watch?v=1pglPcuarbg">Little Tensas Bayou</a> [YouTube]; <a target="_blank" href="https://www.youtube.com/channel/UCDXr2cbK7WlfeYEtJxC9i3w">Soundlys Channel</a>' );
  m.showModel = 1; // globe
  m.showGrid = 1; // on
  m.viewcenterHorizon = 0; // globe horizon
  m.FocalLengthField = 33.9;
  m.nLines = 60;
  m.ObjType[0] = 7; // Tensas Bayou
  m.NObjects[0] = 87;
  m.ObjDist[0] = 0;
  m.ObjDeltaDist[0] = 150;
  m.ObjSideVar[0] = 0;
  m.ObjSize[0] = 1;
  m.Pan = 0;
  m.Nick = -75;
  UpdateAll( false );
}

var TensasAnimation = NewAnimation( {
  ModelRef: CurveApp,
  OnModelChange: function CB_OnModelChange_TensasAnimation(){
    UpdateAll(false);
  },
  OnLoopInit: InitTensasAnimation,
  OnTaskEnd: OnAnimationEnd,
  RestartAction: AnimRestartAction,
  Mode: 'serial',
  TaskList: [
    Ttxt( 'This Animation shows 12.9 km of the Bridge' ),
    {
      Mode: 'parallel',
      Delay: AnimT2,
      TaskList: [
        Tval( 'Height', 2000, AnimT5 ),
        Tval( 'FocalLengthField', 75, AnimT5 ),
        Tval( 'Nick', -35, AnimT5 ),
      ],
    },
    {
      Mode: 'parallel',
      Delay: 0,
      TaskList: [
        Tval( 'Height', 10.8, AnimT5+AnimT2 ),
        Tval( 'FocalLengthField', 150, AnimT5, AnimT2 ),
        Tval( 'Nick', 0, AnimT5+AnimT1, AnimT1 ),
      ],
    },
    Ttxt( 'Bridge Segments in this Animation are 150 m long' ),
    {
      Mode: 'parallel',
      Delay: 0,
      TaskList: [
        Tval( 'FocalLengthField', 3000, AnimT5 ),
        Tval( 'ObjSidePos[0]', -2, AnimT3, AnimT2 ),
      ],
    },
    Ttxt( 'Adding Standard Refraction' ),
    Tval( 'refractionCoeff', 0.16974, AnimT2, AnimT1 ),
    Tval( 'refractionSync', 2, 0, 1 ),
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
} );

// City Animation

function InitCityAnimation( anim ) {
  var m = CurveApp;
  InitAnyAnimation( 'Chicago Skyline', 2 );
  ShowMoreInfos( '<a target="_blank" href="https://joshuanowicki.smugmug.com/Looking-toward-Chicago-from-Mi/i-3dCDGJX">Image: Looking toward Chicago from Michigan</a> [Eric Young]; <a target="_blank" href="https://www.metabunk.org/standard-atmospheric-refraction-empirical-evidence-and-derivation.t8703/">Standard Atmospheric Refraction</a> [metabunk]' );
  m.showModel = 3; // globe + FE
  m.showEyeLevel = true;
  m.showGrid = 1; // on
  m.viewcenterHorizon = 2; // between
  m.FocalLengthField = 34;
  m.ObjType[0] = 4; // city
  m.NObjects[0] = 6;
  m.ObjDist[0] = 3400;
  m.ObjDeltaDist[0] = 200;
  m.ObjSidePos[0] = 1040;
  m.ObjSideType[0] = 2; // rand
  m.ObjSideVar[0] = -30.5;
  m.ObjSize[0] = 442;
  m.ObjSizeType[0] = 3; // cos
  m.ObjSizeVar[0] = 0.381;
  UpdateAll( false );
}

var CityAnimation = NewAnimation( {
  ModelRef: CurveApp,
  OnModelChange: function CB_OnModelChange_CityAnimation(){
    UpdateAll(false);
  },
  OnLoopInit: InitCityAnimation,
  OnTaskEnd: OnAnimationEnd,
  RestartAction: AnimRestartAction,
  Mode: 'serial',
  TaskList: [
    Ttxt( 'Observer Altitude = 2 m, City Distance = 3.4 km, Tallest Building = 442 m' ),
    Ttxt( 'Lets cross Lake Michigan to Grand Mere State Park', AnimT5 ),
    Tval( 'showEyeLevel', false ),
    Tval( 'ObjDist[0]', 91100, AnimT5, AnimT3 ),
    Ttxt( 'Distance = 91.1 km', AnimT1 ),
    Ttxt( 'On the Globe, Chicago disappeared behind the Curvature of the Earth', AnimT3 ),
    Ttxt( 'Zooming in (f = 800 mm) does not bring the Skyline back into view', AnimT4 ),
    Tval( 'FocalLengthField', 800, AnimT5, AnimT3 ),
    Tval( 'showEyeLevel', true ),
    Ttxt( 'Lets climb a nearby Hill of Height = 200 m', AnimT1 ),
    Tval( 'Height', 200, AnimT5, AnimT3 ),
    Ttxt( 'Now 313 m of the Skyline comes into view, 129 m are still hidden', AnimT1 ),
    Ttxt( 'Note that the whole Skyline is BELOW Eye-Level', AnimT5 ),
    Ttxt( 'Lets go down to the Beach (2 m) again', AnimT5 ),
    Tval( 'Height', 2, AnimT5, AnimT3 ),
    Ttxt( 'Now lets apply severe Refraction of 3.5 R (Looming)', AnimT1 ),
    Tval( 'refractionRadius', 6371000 * 3.5, AnimT3, AnimT3 ),
    Ttxt( 'Now 280 m of the Skyline comes into view again, 162 m are hidden', AnimT1 ),
    Ttxt( 'Lets remove Refraction and climb to 660 m', AnimT5 ),
    Tval( 'refractionRadius', 6371000, AnimT3, AnimT3 ),
    Tval( 'Height', 660, AnimT5, AnimT2 ),
    Ttxt( 'At an Altitude of 660 m the whole City is now visible.', AnimT1 ),
    Ttxt( 'On the Flat Earth the Skyline never disapeared!', AnimT5 ),
    Tval( 'Description', '', 0, AnimT5 ),
  ],
} );

// Canigou Animation

function InitCanigouAnimation( anim ) {
  var m = CurveApp;
  InitAnyAnimation( 'Canigou Mountain', 244 );
  ShowMoreInfos( '<a target="_blank" href="https://www.metabunk.org/explained-observations-of-canigou-curvature-of-the-earth-atmospheric-refraction.t8688/">Observations of Canigou, Curvature of the Earth & Atmospheric Refraction</a> [metabunk]' );
  m.showGrid = 1; // on
  m.FocalLengthField = 34;
  m.Nick = 18.2;
  m.ObjType[0] = 5; // city
  m.NObjects[0] = 40;
  m.ObjDist[0] = 7230;
  m.ObjDeltaDist[0] = 60;
  m.ObjSideType[0] = 2; // rand
  m.ObjSideVar[0] = -5620;
  m.ObjSize[0] = 2790;
  m.ObjSizeType[0] = 3; // cos
  m.ObjSizeVar[0] = 0.125;
  UpdateAll( false );
}

var CanigouAnimation = NewAnimation( {
  ModelRef: CurveApp,
  OnModelChange: function CB_OnModelChange_CanigouAnimation(){
    UpdateAll(false);
  },
  OnLoopInit: InitCanigouAnimation,
  OnTaskEnd: OnAnimationEnd,
  RestartAction: AnimRestartAction,
  Mode: 'serial',
  TaskList: [
    Ttxt( 'This represents the Canigou Mountain in France; Height = 2790 m' ),
    Ttxt( 'Lets fly to Allauch near Marseille: Distance = 257 km:', AnimT5 ),
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
    Ttxt( 'Lets zoom in to f = 1000 mm to take a closer look:', AnimT5 ),
    Tval( 'showData', false, AnimT3 ),
    Tval( 'FocalLengthField', 1000, AnimT5 ),
    Ttxt( 'Lets go down to a Hill in Allauch at 244 m Altitude:', AnimT1 ),
    Ttxt( 'According to some Curvature Calculators we should NOT be able to see the Mountain:', AnimT3 ),
    Tval( 'Height', 244, AnimT5, AnimT3 ),
    Ttxt( 'Yes indeed, the whole Mountain is now hidden behind the Curvature of the Earth!', AnimT1 ),
    Ttxt( 'But according to some Pictures (see Link above) we should be able to see Part of it !?', AnimT5 ),
    Ttxt( 'Maybe Refraction plays a role. Lets add Standard Refraction:', AnimT5 ),
    Tval( 'showEyeLevel', true, 0, AnimT5 ),
    Tval( 'showData', true ),
    Tval( 'refractionCoeff', 0.16761, AnimT5 ),
    Tval( 'refractionSync', 2, 0, 1 ),
    Ttxt( 'Standard Refraction raises the Mountain relative to the Horizon about 670 m!', AnimT2 ),
    Ttxt( 'How can that be?', AnimT5 ),
    Ttxt( 'The Refraction Angle is 0.194 degrees.', AnimT2 ),
    Ttxt( 'The Angular Size of the Mountain at this Distance is only 0.623 degrees.', AnimT5 ),
    Ttxt( 'So the Mountain is raised 0.194 / 0.623 = 31.1% of its Height: that is 867 m!', AnimT5 ),
    Ttxt( 'But the Horizon raises too, so the raise relative to the Horizon is reduced to 670 m.', AnimT6 ),
    Ttxt( 'The Temperature Gradient is now Standard dT/dh = -0.65°C/100m.', AnimT6 ),
    Ttxt( 'Lets see what a stable Inversion with a Gradient dT/dh = +1°C/100m can achieve:', AnimT6 ),
    Tval( 'tempGradient', 0.01, AnimT5, AnimT5 ),
    Ttxt( 'On the real Globe there is no Problem to see Mount Canigou!', AnimT1 ),

    Ttxt( 'Lets compaire how the Scene would look like on the Flat Earth:', AnimT5 ),
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
    Ttxt( '', AnimT6 ),

  ],
} );
