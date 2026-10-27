function DrawModel( g ) {

  var diagnosticOptions = arguments[1];
  var m = CurveApp;
  if (window.CurvatureRenderedVertexAudit) CurvatureRenderedVertexAudit.reset();
  g.MaxCurveSegments = 256;
  g.SetAngleMeasure( 'rad' );
  g.SetViewport( 0, 1, -0.5, -2 );
  g.SetGraphClipping( true, '', 0 );
  g.SetCameraClipping( 0.001 );
  g.SetWindowToCameraScreen();

  g.SetCamera( {
    SceneSize: m.camSceneSize,
    CamPos: m.camPos,
    CamUp: m.camUp,
    CamViewCenter: m.camViewCenter,
  } );
  g.SetCameraZoom( 1 );

  // Opt-in controlled reference: retain the actual legacy camera, transforms,
  // tower graphics and globe occlusion while omitting auxiliary grids/labels.
  // Objects 1 draws Type 1, even for ObjType 3; only Objects 2 is Type 2.
  if (diagnosticOptions && diagnosticOptions.towerOnlyIndex !== undefined) {
    if (diagnosticOptions.towerOnlyIndex !== 1 || (m.showModel !== 1 && m.showModel !== 2))
      throw new RangeError('Controlled tower-only render requires Objects 2 and one Earth mode');
    if (m.showModel === 1) {
      DrawObjectsBehindHorizon( 1, g );
      DrawObjectsBeforeHorizon( 1, g, true );
    } else {
      DrawObjectsBeforeHorizon( 1, g, false );
    }
    return;
  }

  var specialLineWidth = 1.5;

  // draw eye level
  var rotz = JsgMat3.RotatingZ( -m.PanRad );
  if ( m.showEyeLevel ) {
    g.SetLineAttr( m.EyeLvlCol, 1 );
    g.SetAlpha( 1 );
    g.Line3D( JsgMat3.Trans( rotz, [ -2*m.sceneWidth, m.rDisk, 0 ] ), JsgMat3.Trans( rotz, [ 2*m.sceneWidth, m.rDisk, 0 ] ) );
    g.SetTextAttr( 'Arial', 12, m.EyeLvlCol, 'normal', 'normal', 'center', 'bottom', 6 );
    g.SetTextRotation( toRad(-m.Roll) );
    g.Text3D( 'Eye-Level', JsgMat3.Trans( rotz, [ 0, m.rDisk, 0 ] ) );
    g.SetTextRotation( 0 );
  }

  // Flat Earth

  var objIx = 0;
  if (m.NObjects[0] == 0) objIx = 1;
  if (m.NObjects[0] > 0 && m.NObjects[1] > 0 && m.ObjDist[0] > m.ObjDist[1]) objIx = 1;

  if ( m.showModel & 2 ) {

    // set clipping if both models are shown to restrict graphic to one half of the screen
    if (m.showModel & 1) {
      var xpos = 0;
      if (m.ObjSidePos[objIx] < 0) xpos = g.CanvasWidth / 2;
      g.SetClipRect( xpos, 0, g.CanvasWidth/2, g.CanvasHeight, 'canvas' );
    }

    // draw flat earth horizon and equator
    g.SetAlpha( 1 );
    g.SetPlane( [ 0, 0, -m.Height ], [ 1, 0, 0 ], [ 0, 1, 0 ] );
    g.SetLineAttr( m.FEEqCol, 1 );
    g.CircleOnPlane( 0, 0, m.rFEarth, 1 );
    g.SetLineWidth( 2 );
    g.CircleOnPlane( 0, 0, 2*m.rFEarth, 1 );

    var aMax = 2 * Math.PI;
    var alpha = 0.6 - 0.5 * (Math.log10( m.Height ) / 9);
    g.SetAlpha( alpha );
    g.SetLineAttr( m.FEGridCol, 1 );

    if (m.showGrid > 0) {

      // circle lines
      var crDelta = m.rFEarth / 12;
      var crMax = 2 * m.rFEarth - crDelta / 2;
      g.SetPlane( [ 0, 0, -m.Height ], [ 1, 0, 0 ], [ 0, 1, 0 ] );
      for ( var cr = crDelta; cr < crMax; cr += crDelta ) {
        g.ArcOnPlane( 0, 0, cr, 0, aMax, 1 );
      }
      if (m.Height < 700000) {
        crMax = crDelta;
        crDelta /= 10;
        crMax -= crDelta / 2;
        for ( var cr = crDelta; cr < crMax; cr += crDelta ) {
          g.ArcOnPlane( 0, 0, cr, 0, aMax, 1 );
        }
      }
      if (m.Height < 30000) {
        crMax = crDelta;
        crDelta /= 10;
        crMax -= crDelta / 2;
        for ( var cr = crDelta; cr < crMax; cr += crDelta ) {
          g.ArcOnPlane( 0, 0, cr, 0, aMax, 1 );
        }
      }
      if (m.Height < 3000) {
        crMax = crDelta;
        crDelta /= 10;
        crMax -= crDelta / 2;
        for ( var cr = crDelta; cr < crMax; cr += crDelta ) {
          g.ArcOnPlane( 0, 0, cr, 0, aMax, 1 );
        }
      }
      if (m.Height < 300) {
        crMax = crDelta;
        crDelta /= 10;
        crMax -= crDelta / 2;
        for ( var cr = crDelta; cr < crMax; cr += crDelta ) {
          g.ArcOnPlane( 0, 0, cr, 0, aMax, 1 );
        }
      }

      // ray lines
      g.SetAlpha( alpha );
      g.SetLineAttr( m.FEGridCol, 1 );
      var caDelta = Math.PI / 12;
      var caMax = 2 * Math.PI;
      caMax -= caDelta / 2;
      var r = 2 * m.rFEarth;
      for ( var ca = 0; ca < caMax; ca += caDelta ) {
        var c = Math.cos( ca );
        var s = Math.sin( ca );
        g.LineOnPlane( r * c, r * s, 0, 0 );
      }
    }

    var drawObjIx = 1;
    if (m.ObjDist[0] > m.ObjDist[1]) drawObjIx = 0;
    m.LastPosValid[0] = false;
    m.LastPosValid[1] = false;
    DrawObjectsBeforeHorizon( drawObjIx, g, false );
    drawObjIx = (drawObjIx + 1) % 2;
    DrawObjectsBeforeHorizon( drawObjIx, g, false );

    // reset clipping
    if (m.showModel & 1) {
      g.SetClipping( 'canvas' );
    }

  } // end nLines > 0

  // Globe Earth

  if ( m.showModel & 1 ) {

    // set clipping if both models are shown to restrict graphic to one half of the screen
    if (m.showModel & 2) {
      var xpos = g.CanvasWidth / 2;
      if (m.ObjSidePos[objIx] < 0) xpos = 0;
      g.SetClipRect( xpos, 0, g.CanvasWidth/2, g.CanvasHeight, 'canvas' );
    }

    var drawObjIx = 1;
    if (m.ObjDist[0] > m.ObjDist[1]) drawObjIx = 0;
    m.LastPosValid[0] = false;
    m.LastPosValid[1] = false;
    DrawObjectsBehindHorizon( drawObjIx, g );
    drawObjIx = (drawObjIx + 1) % 2;
    DrawObjectsBehindHorizon( drawObjIx, g );

    var alpha = 0.6 - 0.5 * (Math.log10( m.Height ) / 9);
    g.SetAlpha( alpha );
    g.SetLineAttr( m.GlobeGridCol, 1 );

    // show globe grid
    if ( m.showGrid & 1 ) {

      // latitude lines
      var latMax = m.aDip;
      var latStart = -( Math.floor( latMax / m.aDelta ) * m.aDelta );
      for ( var lat = latStart; lat < latMax; lat += m.aDelta ) {
        var dLatPlaneDisk = m.hDisk / Math.cos( lat );
        var longMax = Math.acos( dLatPlaneDisk / m.geometryRadius );
        var longStart = -( Math.floor( longMax / m.aDelta ) * m.aDelta );
        g.NewPoly3D();
        for ( var long = longStart; long < longMax; long += m.aDelta ) {
          g.AddPointToPoly3D( PointOnEarth( lat, long ) );
        }
        g.AddPointToPoly3D( PointOnEarth( lat, longMax ) );
        g.DrawPoly3D( 1 );
      }

      // longitude lines
      var longMax = m.aDip;
      var longStart = -( Math.floor( longMax / m.aDelta ) * m.aDelta );
      for ( var long = longStart; long < longMax; long += m.aDelta ) {
        var rLong = m.geometryRadius * Math.cos( long );
        var latMax = Math.acos( m.hDisk / rLong );
        var latStart = -( Math.floor( latMax / m.aDelta ) * m.aDelta );
        g.NewPoly3D();
        g.AddPointToPoly3D( PointOnEarth( -latMax, long ) );
        for ( var lat = latStart; lat < latMax; lat += m.aDelta ) {
          g.AddPointToPoly3D( PointOnEarth( lat, long ) );
        }
        g.AddPointToPoly3D( PointOnEarth( latMax, long ) );
        g.DrawPoly3D( 1 );
      }

    } // end show globe grid

    g.SetLineAttr( m.GlobeFGridCol, 1 );

    // show flat grid
    if ( m.showGrid & 2 ) {

      // latitude lines on flat model
      var latMax = m.aDip;
      var latStart = -( Math.floor( latMax / m.aDelta ) * m.aDelta );
      for ( var lat = latStart; lat < latMax; lat += m.aDelta ) {
        var dLatPlaneDisk = m.hDisk / Math.cos( lat );
        var longMax = Math.acos( dLatPlaneDisk / m.geometryRadius );
        var longStart = -( Math.floor( longMax / m.aDelta ) * m.aDelta );
        g.NewPoly3D();
        for ( var long = longStart; long < longMax; long += m.aDelta ) {
          g.AddPointToPoly3D( PointOnPlane( lat, long ) );
        }
        g.AddPointToPoly3D( PointOnPlane( lat, longMax ) );
        g.DrawPoly3D( 1 );
      }

      // longitude lines on flat model
      var longMax = m.aDip;
      var longStart = -( Math.floor( longMax / m.aDelta ) * m.aDelta );
      for ( var long = longStart; long < longMax; long += m.aDelta ) {
        var rLong = m.geometryRadius * Math.cos( long );
        var latMax = Math.acos( m.hDisk / rLong );
        var latStart = -( Math.floor( latMax / m.aDelta ) * m.aDelta );
        g.NewPoly3D();
        g.AddPointToPoly3D( PointOnPlane( -latMax, long ) );
        for ( var lat = latStart; lat < latMax; lat += m.aDelta ) {
          g.AddPointToPoly3D( PointOnPlane( lat, long ) );
        }
        g.AddPointToPoly3D( PointOnPlane( latMax, long ) );
        g.DrawPoly3D( 1 );
      }

    } // end flat grid

    if ( m.showGrid & 2 ) {

      // horizon on flat model
      g.SetPlane( [ 0, 0, -m.Height ], [ 1, 0, 0 ], [ 0, 1, 0 ] );
      g.SetAlpha( 1 );
      g.SetLineAttr( m.GlobeFGridCol, specialLineWidth );
      g.CircleOnPlane( 0, 0, m.rDisk, 1 );

    }

    // Globe Horizon
    g.SetAlpha( 1 );
    g.SetLineAttr( m.GlobeGridCol, specialLineWidth );
    g.SetPlane( [ 0, 0, -m.zDisk ], [ 1, 0, 0 ], [ 0, 1, 0 ] );
    g.CircleOnPlane( 0, 0, m.rDisk, 1 );

    // show tangent line to globe horizon
    if ( m.showTangent || m.showData ) {
      g.SetLineAttr( m.TangentCol, 1 );
      g.Line3D( JsgMat3.Trans( rotz, [ -2*m.sceneWidth, m.rDisk, -m.zDisk ] ), JsgMat3.Trans( rotz, [ 2*m.sceneWidth, m.rDisk, -m.zDisk ] ) );
    }

    // draw all objects in the foreground
    var drawObjIx = 1;
    if (m.ObjDist[0] > m.ObjDist[1]) drawObjIx = 0;
    DrawObjectsBeforeHorizon( drawObjIx, g, true );
    drawObjIx = (drawObjIx + 1) % 2;
    DrawObjectsBeforeHorizon( drawObjIx, g, true );

    // reset clipping
    if (m.showModel & 2) {
      g.SetClipping( 'canvas' );
    }

  } // end model globe

  // label split screen
  if (m.showModel == 3) {
    var oldTrans = g.SelectTrans( 'viewport' );
    // label left
    var txt = 'Flat Earth';
    if (m.ObjSidePos[objIx] < 0) {
      txt = 'Globe';
    }
    g.SetTextAttr( 'Arial', 16, 'black', 'bold', 'normal', 'left', 'top', 10 );
    g.SetAreaAttr( 'yellow', 'white', 1 );
    g.TextBox( txt, 0, 0, 3 );
    g.Text( txt, 0, 0 );
    // label right
    var txt = 'Globe';
    if (m.ObjSidePos[objIx] < 0) {
      txt = 'Flat Earth';
    }
    g.SetTextAttr( 'Arial', 16, 'black', 'bold', 'normal', 'right', 'top', 10 );
    g.SetAreaAttr( 'yellow', 'white', 1 );
    g.TextBox( txt, g.VpInnerWidth, 0, 3 );
    g.Text( txt, g.VpInnerWidth, 0 );
    g.SelectTrans( oldTrans );
  }

  // Vacuum calibration (read-only; results in browser console).
  if (window.CurvatureProjectionCalibration) CurvatureProjectionCalibration.onDraw(g, m, SetTrans);

  // Experimental optical markers are an independent diagnostic overlay.
  if (window.CurvatureTowerOverlay) CurvatureTowerOverlay.draw(g, m);

  // Independent analytic vacuum reconstruction of captured tower #21 vertices.
  if (window.CurvatureInverseOpticsBridge) CurvatureInverseOpticsBridge.draw(g, m);

  // Audit the actual canvas marker strokes after rendering.
  if (window.CurvatureRenderedVertexAudit) CurvatureRenderedVertexAudit.onDraw(g, m);

  // draw frame
  if (m.FrameCol != '') {
    g.SetAlpha( 1 );
    g.SetLineAttr( m.FrameCol, 2 );
    var xDir = JsgVect3.Mult( g.Camera.ViewDir, g.Camera.CamUp );
    var yDir = JsgVect3.Mult( g.Camera.ViewDir, xDir );
    g.SetPlane( g.Camera.CamViewCenter, xDir, yDir, true );
    g.RectOnPlane( -m.sceneWidth/2, -m.sceneHeight/2, m.sceneWidth/2, m.sceneHeight/2, 1 );
  }

  var numFormat = {
    Mode: 'std',
    Precision: 3,
    UsePrefix: false,
    Units: '',
  };

  // draw data
  if (m.showData && m.showModel & 1) {
    var posHorizon, align, offset;
    if (m.showModel == 3 && m.ObjSidePos[objIx] < 0) {
      posHorizon = JsgMat3.Trans( rotz, [ -0.44 * m.sceneWidth, m.rDisk, -m.zDisk ] );
      align = 'left';
      offset = -g.ScalePix(40);
    } else {
      posHorizon = JsgMat3.Trans( rotz, [ 0.44 * m.sceneWidth, m.rDisk, -m.zDisk ] );
      align = 'right';
      offset = g.ScalePix(40);
    }
    var posHorizonWin = g.VTransPoint3D( posHorizon );
    var posHorizonVp = g.TransXY( posHorizonWin[0], posHorizonWin[1] );
    var posHorizonX = posHorizonVp.x;
    var posHorizonY = posHorizonVp.y - g.ScalePix(2);
    var posTextX = posHorizonX + offset;
    var posTextY = posHorizonY - g.ScalePix(45);
    var tm = g.ScalePix(5); // text margin
    if (posTextX < tm) posTextX = tm;
    if (posTextX > g.VpInnerWidth-tm) posTextX = g.VpInnerWidth-tm;

    g.SetTextAttr( 'Arial', 12, 'black', 'normal', 'normal', align, 'bottom', 4 );
    g.SetMarkerAttr( 'Arrow1', 6, 'black', 'black', 1 );
    var oldTrans = g.SelectTrans( 'viewport' );

    g.Arrow( posHorizonX, posTextY, posHorizonX, posHorizonY, 9 );
    g.SetBgColor( 'white' );

    var lineHeight = g.ScalePix(17);
    var txt = 'Dip Angle alpha = ' + NumFormatter.NumToString( toDeg( m.aDip ), numFormat ) + ' deg';
    var ty = posTextY;
    g.TextBox( txt, posTextX, ty, 2 );
    g.Text( txt, posTextX, ty );

    var txt = 'Dip from Surface b = ' + NumFormatter.NumToString( m.hDip, numFormat ) + ' m';
    ty -= lineHeight;
    g.TextBox( txt, posTextX, ty, 2 );
    g.Text( txt, posTextX, ty );

    var txt = 'Dip from Eye-Level p = ' + NumFormatter.NumToString( m.zDisk, numFormat ) + ' m';
    ty -= lineHeight;
    g.TextBox( txt, posTextX, ty, 2 );
    g.Text( txt, posTextX, ty );

    var txt = 'Distance on Surface s = ' + NumFormatter.NumToString( m.dHorizon, numFormat ) + ' m';
    ty -= lineHeight;
    g.TextBox( txt, posTextX, ty, 2 );
    g.Text( txt, posTextX, ty );

    var ty = g.VpInnerHeight - 2.25 * lineHeight;

    if (m.NObjects[objIx] > 0) {
      g.SetTextAttr( 'Arial', 12, 'black', 'normal', 'normal', 'center', 'bottom', 4 );
      g.SetBgColor( 'white' );
      if (Math.abs(m.refractionCoeff) >= 0.001) ty -= 5.5 * lineHeight;
      var tx = g.VpInnerWidth / 2;
      if (m.showModel == 3) {
        if (m.ObjSidePos[objIx] < 0) {
          tx *= 0.5;
        } else {
          tx *= 1.5;
        }
      }
      var eq = ' = ';
      if (Math.abs(m.ObjSizeVar[objIx]) > 0.01) eq = ' <= ';
      var txt = 'Nearest Object Size ' + eq + NumFormatter.NumToString( m.ObjSize[objIx], numFormat ) + ' m';
      g.TextBox( txt, tx, ty, 2 );
      g.Text( txt, tx, ty );
      ty += lineHeight;

      var txt = 'Object Distance = ' + NumFormatter.NumToString( m.ObjDist[objIx], numFormat ) + ' m';
      g.TextBox( txt, tx, ty, 2 );
      g.Text( txt, tx, ty );
      ty += lineHeight;

      var txt = 'Object Angular Size ' + eq + NumFormatter.NumToString( m.ObjAngSize, numFormat ) + ' deg';
      g.TextBox( txt, tx, ty, 2 );
      g.Text( txt, tx, ty );
      ty += lineHeight;

      if (Math.abs(m.refractionCoeff) > 0.001) {
        // show refraction data
        ty += 0.5 * lineHeight;
        g.SetTextColor( 'darkred' );
        var txt = 'Refraction Angle = ' + NumFormatter.NumToString( m.ObjRefrAng, numFormat ) + ' deg';
        g.TextBox( txt, tx, ty, 2 );
        g.Text( txt, tx, ty );
        ty += lineHeight;

        var txt = 'Object Lift Absolute = ' + NumFormatter.NumToString( m.ObjLiftAbs, numFormat ) + ' m';
        g.TextBox( txt, tx, ty, 2 );
        g.Text( txt, tx, ty );
        ty += lineHeight;

        var txt = 'Object Lift Relativ to Horizon = ' + NumFormatter.NumToString( m.ObjLiftRel, numFormat ) + ' m';
        g.TextBox( txt, tx, ty, 2 );
        g.Text( txt, tx, ty );
        ty += lineHeight;

      }
    }

    g.SelectTrans( oldTrans );
  }

  // show refraction data
  if ((m.showModel & 1) && Math.abs(m.refractionCoeff) > 0.001) {
    function refractionClass( k ) {
      var r_class = '';
      if (k >= 0.78) {
        r_class = 'extreme';
      } else if (k >= 0.58) {
        r_class = 'severe';
      } else if (k >= 0.38) {
        r_class = 'strong';
      } else if (k >= 0.18) {
        r_class = 'medium';
      } else if (k >= 0.12) {
        r_class = 'standard';
      } else if (k > 0.0001) {
        r_class = 'weak';
      } else if (k < 0) {
        r_class = 'negative';
      }
      if (r_class != '') r_class = '(' + r_class + ')';
      return r_class;
    }
    function tempGradClass( dt ) {
      var t_class = '';
      if (dt < -0.01) {
        t_class = 'instable Layer';
      } else {
        t_class = 'stable Layer';
      }
      if (dt > 0) {
        t_class += '; Inversion';
      }
      if (t_class != '') t_class = '(' + t_class + ')';
      return t_class;
    }
    var tx = g.VpInnerWidth / 2;
    if (m.showModel == 3) {
      if (m.ObjSidePos[objIx] < 0) {
        tx *= 0.5;
      } else {
        tx *= 1.5;
      }
    }
    var oldTrans = g.SelectTrans( 'viewport' );
    g.SetTextAttr( 'Arial', 12, 'darkred', 'normal', 'normal', 'center', 'bottom', 4 );
    g.SetBgColor( 'yellow' );

    var oldFormatMode = numFormat.Mode;
    var oldPrecision = numFormat.Precision;
    numFormat.Mode = 'fix0';

    var txt = 'Refraction k = ' + NumFormatter.NumToString( m.refractionCoeff, numFormat );
    if (m.refractionSync == 2) {
      txt += ' (Standard Atmosphere)';
    } else {
      txt += ' ' + refractionClass( m.refractionCoeff );
    }
    g.TextBox( txt, tx, g.VpInnerHeight - g.ScalePix(21), 2 );
    g.Text( txt, tx, g.VpInnerHeight - g.ScalePix(21) );

    if (m.Height < 84852) {
      numFormat.Precision = 5;
      var txt = '';
      if (m.tempGradient < 1) {
        txt = 'Temp. Gradient dT/dh = ' + NumFormatter.NumToString( m.tempGradient, numFormat ) + '°C/m ';
      }
      txt += tempGradClass( m.tempGradient );
      g.TextBox( txt, tx, g.VpInnerHeight - g.ScalePix(5), 2 );
      g.Text( txt, tx, g.VpInnerHeight - g.ScalePix(5) );
    }

    numFormat.Mode = oldFormatMode;
    numFormat.Precision = oldPrecision;
    g.SelectTrans( oldTrans );
  }

  // draw demo text and description
  if (m.DemoText != '') {
    var oldTrans = g.SelectTrans( 'viewport' );

    g.SetTextAttr( 'Arial', 20, 'black', 'normal', 'normal', 'center', 'top', 10 );
    g.Text( m.DemoText, g.VpInnerWidth/2, 0 );

    if (m.Description != '') {
      g.SetTextAttr( 'Arial', 16, 'black', 'normal', 'normal', 'center', 'top', 10 );
      g.Text( m.Description, g.VpInnerWidth/2, g.ScalePix(30) );
    }

    g.SelectTrans( oldTrans );
  }

}

function DrawObjectsBehindHorizon( objIx, g ) {
  var m = CurveApp;

  // init some loop variables used in DrawObjectsBeforeHorizon too
  if (m.NObjects[objIx] == 0) return;
  m.aObjDelta[objIx] = m.ObjDeltaDist[objIx] / m.geometryRadius;
  m.aObjFirst[objIx] = m.ObjDist[objIx] / m.geometryRadius;
  m.aObjLast[objIx] = (m.NObjects[objIx]-1) * m.aObjDelta[objIx] + m.aObjFirst[objIx];
  m.MaxNObjectsToDraw[objIx] = m.NObjects[objIx];
  m.NObjectsDrawn[objIx] = 0;
  if (m.aObjLast[objIx] > Math.PI) {
    m.MaxNObjectsToDraw[objIx] = Math.floor( Math.PI / m.aObjDelta[objIx] );
    m.aObjLast[objIx] = (m.MaxNObjectsToDraw[objIx]-1) * m.aObjDelta[objIx] + m.aObjFirst[objIx];
    m.NObjectsDrawn[objIx] = m.NObjects[objIx] - m.MaxNObjectsToDraw[objIx];
  }
  m.aObjCurr[objIx] = m.aObjLast[objIx];

  // if only objects before horizon exist skip this function
  var aSide = m.ObjSidePos[objIx] / m.geometryRadius;
  var sideOnDisk = (m.geometryRadius - m.hDip) * Math.tan( aSide );
  var aClip = 0;
  if (m.rDisk > Math.abs(sideOnDisk)) {
    // not all objects are behind the horizon, so find the first object that is behind
    var distOnDisk = Math.sqrt( m.rDisk * m.rDisk - sideOnDisk * sideOnDisk );
    aClip = Math.asin( distOnDisk / m.geometryRadius );
  }
  if (m.aObjCurr[objIx] <= aClip) return;
  m.isHiddenObj[objIx] = true;

  // draw all objects behind horizon only and clip than at horizon
  g.SetAlpha(1);
  g.SetAreaAttr( '#ffa', '#666', 1 );
  g.SaveTrans3D();
  var aLimit = m.aObjFirst[objIx] - m.aObjDelta[objIx]/2;
  while (m.aObjCurr[objIx] > aClip && m.aObjCurr[objIx] > aLimit ) {
    DrawShapeVariants( objIx, g, m, true );
    m.NObjectsDrawn[objIx]++;
    m.aObjCurr[objIx] -= m.aObjDelta[objIx];
  }
  g.RestoreTrans3D();

  // clip at horizon
  if (m.NObjectsDrawn[objIx] > 0) {
    g.SetPlane( [0,0,-m.zDisk], [1,0,0], [0,1,0] );
    g.SetBgColor( 'white' );
    g.CircleOnPlane( 0, 0, m.rDisk, 2 );
  }
}

function DrawObjectsBeforeHorizon( objIx, g, bOnGlobe ) {
  var m = CurveApp;
  if (m.NObjects[objIx] == 0) return;

  // Init parameters for flat earth here, because DrawObjectsBehindHorizon is not caller in that case
  if (!bOnGlobe) {
    m.aObjDelta[objIx] = m.ObjDeltaDist[objIx] / m.geometryRadius;
    m.aObjFirst[objIx] = m.ObjDist[objIx] / m.geometryRadius;
    m.aObjLast[objIx] = (m.NObjects[objIx]-1) * m.aObjDelta[objIx] + m.aObjFirst[objIx];
    m.MaxNObjectsToDraw[objIx] = m.NObjects[objIx];
    m.aObjCurr[objIx] = m.aObjLast[objIx];
    m.NObjectsDrawn[objIx] = 0;
  }

  var aLimit = m.aObjFirst[objIx] - m.aObjDelta[objIx]/2;
  if (m.aObjCurr[objIx] < aLimit) return;
  m.isHiddenObj[objIx] = false;

  g.SetAlpha(1);
  g.SetAreaAttr( 'yellow', 'black', 1 );
  g.SaveTrans3D();
  while (m.aObjCurr[objIx] >= aLimit) {
    DrawShapeVariants( objIx, g, m, bOnGlobe );
    m.aObjCurr[objIx] -= m.aObjDelta[objIx];
    m.NObjectsDrawn[objIx]++;
  }
  g.RestoreTrans3D();
}

function SetTrans( objIx, g, m, lng, lat, size, alt, bOnGlobe ) {
  var d = 0;
  var s = 0;
  var xs = bOnGlobe ? m.ObjSize[objIx] : -m.ObjSize[objIx];
  g.ResetTrans3D();
  g.TransScale3D( xs, m.ObjSize[objIx], m.ObjSize[objIx] );
  g.TransMove3D( 0, 0, m.geometryRadius+alt );
  if (bOnGlobe) {
    g.TransRotateY3D( lat );
    g.TransRotateX3D( -lng );
  } else {
    d = lng * m.geometryRadius;
    s = -lat * m.geometryRadius;
  }
  g.TransMove3D( s, d, -(m.geometryRadius+m.Height) );
}

function DrawShapeVariants( objIx, g, m, bOnGlobe ) {

  // size: 0 -> lin, 1 -> alt, 2 -> rand, 3 -> cos, 4 -> sin

  var size = 1;
  var sizeType = m.ObjSizeType[objIx];
  if (sizeType == 0) {
    // lin
    if (m.MaxNObjectsToDraw[objIx] > 1) {
      size = 1 + m.ObjSizeVar[objIx] * (2 / (m.MaxNObjectsToDraw[objIx] - 1) * (m.MaxNObjectsToDraw[objIx]-1 - m.NObjectsDrawn[objIx]) - 1);
    }

  } else if (sizeType == 1) {
    // alt
    size = 1 + m.ObjSizeVar[objIx] * Math.cos( Math.PI * m.NObjectsDrawn[objIx] );

  } else if (sizeType == 2) {
    // rand
    size = 1 + m.ObjSizeVar[objIx] * ( (64894678.9798467 * Math.sqrt(m.NObjectsDrawn[objIx])) % 2 - 1 );

  } else if (sizeType == 3) {
    // cos
    if (m.MaxNObjectsToDraw[objIx] > 1) {
      size = 1 - m.ObjSizeVar[objIx] * Math.cos( 2 * Math.PI * m.NObjectsDrawn[objIx]/(m.MaxNObjectsToDraw[objIx]-1) );
    } else {
      size = 1 + m.ObjSizeVar[objIx];
    }

  } else if (sizeType == 4) {
    // sin
    if (m.MaxNObjectsToDraw[objIx] > 1) {
      size = 1 - m.ObjSizeVar[objIx] * Math.sin( 2 * Math.PI * m.NObjectsDrawn[objIx]/(m.MaxNObjectsToDraw[objIx]-1) );
    } else {
      size = 1;
    }
  }

  // make size varying from 0..1
  size = (size + 1 - Math.abs(m.ObjSizeVar[objIx])) / 2;
  if (size < 0) size *= -1;

  var sizeHor = 1;
  var objType = m.ObjType[objIx];
  if (objType == 0 || objType == 1 || objType == 3) {
    // Bedford, M-Rod, T-Tower: scale width proportionaly
    sizeHor = size;

  } else if (objType == 2) {
    // ship: scale width inverse proportional to size within some limits
    sizeHor = (1 - 0.75) * size + 0.75;
    size = (1 - 0.5) * size + 0.5;

  } else if (objType == 4) {
    // city: scale only height

  } else if (objType == 6) {
    // bridge: scale only height

  } else if (objType == 7) {
    // tensas bayou: no scale
    size = 1;
    sizeHor = 1;

  } else if (objType == 8) {
    // Causew-S: no scale
    size = 1;
    sizeHor = 1;

  } else if (objType == 9) {
    // Causew-N: no scale, horizontally mirrored
    size = 1;
    sizeHor = -1;
  }

  var sideVar = m.ObjSideVar[objIx] / m.geometryRadius / 2;
  var side = m.ObjSidePos[objIx] / m.geometryRadius;
  var sideType = m.ObjSideType[objIx];
  if (sideType == 0) {
    // lin
    if (m.MaxNObjectsToDraw[objIx] > 1) {
      sideVar *= (2 / (m.MaxNObjectsToDraw[objIx] - 1) * (m.MaxNObjectsToDraw[objIx]-1 - m.NObjectsDrawn[objIx]) - 1);
    }

    SetTrans( objIx, g, m, m.aObjCurr[objIx], side+sideVar, m.ObjSize[objIx], 0, bOnGlobe );
    g.SetPlane( [0,0,0], [sizeHor,0,0], [0,0,size] );
    DrawShape( objIx, g, m );

  } else if (sideType == 1) {
    // 2col
    var pos1 = side - sideVar;
    var pos2 = side + sideVar;
    if (Math.abs(pos1) < Math.abs(pos2)) {
      // invert drawing sequence
      var tmp = pos1;
      pos1 = pos2;
      pos2 = tmp;
    }
    // assert: pos1 is farther to the side than pos2 -> |pos1| >= |pos2|
    m.Col = 1;
    g.SetPlane( [0,0,0], [sizeHor,0,0], [0,0,size] );
    SetTrans( objIx, g, m, m.aObjCurr[objIx], pos1, m.ObjSize[objIx], 0, bOnGlobe );
    DrawShape( objIx, g, m );
    m.Col = 2;
    SetTrans( objIx, g, m, m.aObjCurr[objIx], pos2, m.ObjSize[objIx], 0, bOnGlobe );
    g.SetPlane( [0,0,0], [sizeHor,0,0], [0,0,size] );
    DrawShape( objIx, g, m );

  } else if (sideType == 2) {
    // rand
    sideVar *= (186573.6498496 * Math.sqrt(m.NObjectsDrawn[objIx]) % 2) - 1;
    g.SetPlane( [0,0,0], [sizeHor,0,0], [0,0,size] );
    SetTrans( objIx, g, m, m.aObjCurr[objIx], side+sideVar, m.ObjSize[objIx], 0, bOnGlobe );
    DrawShape( objIx, g, m );

  } else if (sideType == 3) {
    // cos
    if (m.MaxNObjectsToDraw[objIx] > 1) {
      sideVar *= Math.cos( 2 * Math.PI * m.NObjectsDrawn[objIx]/(m.MaxNObjectsToDraw[objIx]-1) );
    }
    g.SetPlane( [side,0,0], [sizeHor,0,0], [0,0,size] );
    SetTrans( objIx, g, m, m.aObjCurr[objIx], side+sideVar, m.ObjSize[objIx], 0, bOnGlobe );
    DrawShape( objIx, g, m );

  } else if (sideType == 4) {
    // sin
    if (m.MaxNObjectsToDraw[objIx] > 1) {
      sideVar *= Math.sin( 2 * Math.PI * m.NObjectsDrawn[objIx]/(m.MaxNObjectsToDraw[objIx]-1) );
    } else {
      sideVar = 0;
    }
    g.SetPlane( [side,0,0], [sizeHor,0,0], [0,0,size] );
    SetTrans( objIx, g, m, m.aObjCurr[objIx], side+sideVar, m.ObjSize[objIx], 0, bOnGlobe );
    DrawShape( objIx, g, m );

  }
}

function DrawShape( objIx, g, m ) {
  // Hide the actual renderer primitives, not just LineOnPlane. Install the
  // suppression before the audit wrapper so the audit can still capture every
  // PolygonOnPlane vertex while its underlying draw operation is a no-op.
  var showLegacyControl = document.getElementById('ShowLegacyTransmissionTowers');
  var showLegacy = m.diagnosticAlwaysShowLegacyTowers === true ||
    !showLegacyControl || showLegacyControl.checked;
  // The visibility checkbox is authoritative, regardless of comparison mode.
  var suppressOriginalTower = m.ObjType[objIx] === 3 && !showLegacy;
  var originalTowerLine = g.LineOnPlane;
  var originalTowerPolygon = g.PolygonOnPlane;
  if (suppressOriginalTower) {
    g.LineOnPlane = function () {};
    g.PolygonOnPlane = function () {};
  }
  var endVertexAudit = window.CurvatureRenderedVertexAudit &&
    CurvatureRenderedVertexAudit.beginTower(g, m, objIx);

  function setBgColor( normalColor, hiddenColor ) {
    if (m.isHiddenObj[objIx]) {
      g.SetBgColor( hiddenColor );
    } else {
      g.SetBgColor( normalColor );
    }
  }

  // ObjType: 0 = Bedford, 1 = M-Rod, 2 = ship, 3 = T-Tower, 4 = city, 5 = mountain, 6 = bridge, 7 = tensas bayou, 8 = Causew-S, 9 = Causew-N
  var objType = m.ObjType[objIx];

  if (objType == 0) {
    // Bedford
    if (m.NObjectsDrawn[objIx] == 0) {

      // draw bridge with bar
      setBgColor( '#aaa', '#ccc' );
      g.OpenPath3D();
      g.ArcOnPlane( 0, 0, -0.8, Math.PI, 0 );
      g.PolygonOnPlane( [ 0.8, 1.2, 1.2, -1.2, -1.2, -0.8 ], [ 0, 0, 1.1, 1.1, 0., 0 ] );
      g.Path3D( 3 );
      setBgColor( 'white', 'white' );
      g.RectOnPlane( -0.3, 0.85, 0.3, 1.15, 3 );
      setBgColor( 'black', '#444' );
      g.RectOnPlane( -0.3, 0.95, 0.3, 1.05, 3 );

    } else if (m.NObjects[objIx] > 2 && m.NObjectsDrawn[objIx] == m.NObjects[objIx]-1) {

      // draw scope
      g.SetAlpha( 0.3 );
      setBgColor( 'black', 'black' );
      g.RectOnPlane( -0.01, 0, 0.01, 0.955, 3 );
      g.OpenPath3D();
      g.CircleOnPlane( 0, 1, 0.05 );
      g.CircleOnPlane( 0, 1, -0.04 );
      g.Path3D( 3 );
      g.SetAlpha( 1 );
      g.SetColor( 'orange' );
      g.LineOnPlane( -0.04, 1, 0.04, 1 );
      g.LineOnPlane( -0.02, 1-0.02, -0.005, 1-0.005 );
      g.LineOnPlane(  0.02, 1-0.02,  0.005, 1-0.005 );
      g.LineOnPlane( -0.02, 1+0.02, -0.005, 1+0.005 );
      g.LineOnPlane(  0.02, 1+0.02,  0.005, 1+0.005 );

    } else {

      // draw rods
      setBgColor( 'yellow', '#ff4' );
      g.RectOnPlane( -0.025, 0, 0.025, 1, 3 );
      setBgColor( 'red', '#f44' );
      g.CircleOnPlane( 0, 1, 0.06, 3 );
      //g.CircleOnPlane( 0, 0.698, 0.06, 3 );

    }

  } else if (objType == 1) {
    // M-Rod
    setBgColor( 'yellow', '#ff4' );
    g.RectOnPlane( -0.1, 0, 0.1, 1, 2 );
    setBgColor( 'red', '#f66' );
    g.RectOnPlane( -0.1, 0.5, 0, 1, 2 );
    for (var i = 0.1; i < 1; i += 0.2 ) {
      g.RectOnPlane( 0, i, 0.1, i+0.1, 2 );
    }
    g.RectOnPlane( -0.1, 0, 0.1, 1, 1 );

  } else if (objType == 2) {
    // ship
    setBgColor( '#654130', '#937162' );
    g.PolygonOnPlane( [-0.15, 0.15, 0.2, -0.2, -0.15], [0, 0, 0.15, 0.15, 0], 3 );
    g.LineOnPlane( 0, 0, 0, 1.05 );
    setBgColor( '#7b899a', '#a9b6c6' );
    g.PolygonOnPlane( [-0.2, -0.1, 0.1, 0.2, 0.3, -0.3, -0.2], [0.15, 0.2, 0.2, 0.15, 0.4, 0.4, 0.15], 3 );
    setBgColor( '#b5bdc3', '#d4d9dd' );
    g.PolygonOnPlane( [-0.3, -0.1, 0.1, 0.3, 0.25, -0.25, -0.3], [0.4, 0.45, 0.45, 0.4, 0.6, 0.6, 0.4], 3 );
    setBgColor( '#dfe0df', '#eff0ef' );
    g.PolygonOnPlane( [-0.25, -0.1, 0.1, 0.25, 0.2, -0.2, -0.25], [0.6, 0.65, 0.65, 0.6, 0.8, 0.8, 0.6], 3 );
    g.PolygonOnPlane( [-0.2, -0.05, 0.05, 0.2, 0.1, -0.1, -0.2], [0.8, 0.85, 0.85, 0.8, 1, 1, 0.8], 3 );

  } else if (objType == 3) {
    // T-Tower
    if (objIx == 0) {
      // Tower Type 1
      g.PolygonOnPlane( [ 0.09, -0.12, -0.06, 0.14, 0.12, 0.12, 0.16, 0.16, 0.14, 0.06, -0.06, -0.14, -0.12, -0.12, -0.16, -0.16, -0.14, 0.06, 0.12, -0.09 ], [0.31, 0.14, 0.48, 0.82, 0.89, 0.93, 1, 0.89, 0.82, 0.48, 0.48, 0.82, 0.89, 0.93, 1, 0.89, 0.82, 0.48, 0.14, 0.31 ], 1 );
      g.PolygonOnPlane( [ 0.06, -0.09, 0.09, -0.06 ], [ 0.48, 0.31, 0.31, 0.48 ], 1 );
      g.PolygonOnPlane( [ -0.28, 0.28, 0.16, -0.16, -0.28 ], [ 0.89, 0.89, 0.93, 0.93, 0.89 ], 1 );
      setBgColor( '#a38d60', '#dcc493' );
      g.PolygonOnPlane( [ -0.145, -0.095, -0.095, 0.095, 0.095, 0.145, 0.145, -0.145, -0.145 ], [ 0, 0, 0.105, 0.105, 0, 0, 0.137, 0.137, 0 ], 3 );
    } else {
      // Tower Type 2
      g.PolygonOnPlane( [ -0.12, -0.02, -0.02, 0.02, 0.02, 0.12 ], [ 0.08, 0.76, 1, 1, 0.76, 0.08 ], 1 );
      g.PolygonOnPlane( [ -0.02, -0.08, 0.08, 0.02 ], [ 1, 0.98, 0.98, 1 ], 1 );
      g.PolygonOnPlane( [ -0.02, -0.07, 0.07, 0.02, -0.02 ], [ 0.94, 0.92, 0.92, 0.94, 0.94 ], 1 );
      g.PolygonOnPlane( [ -0.02, -0.07, 0.07, 0.02, -0.02 ], [ 0.86, 0.84, 0.84, 0.86, 0.86 ], 1 );
      g.PolygonOnPlane( [ -0.02, -0.07, 0.07, 0.02, -0.02 ], [ 0.78, 0.76, 0.76, 0.78, 0.78 ], 1 );
      g.PolygonOnPlane( [ -0.12, 0.0906, -0.0685, 0.0494, -0.02 ], [ 0.08, 0.28, 0.43, 0.56, 0.76 ], 1 );
      g.PolygonOnPlane( [ 0.12, -0.0906, 0.0685, -0.0494, 0.02 ], [ 0.08, 0.28, 0.43, 0.56, 0.76 ], 1 );
      g.LineOnPlane( -0.0906, 0.28, 0.0906, 0.28 );
      g.LineOnPlane( -0.0685, 0.43, 0.0685, 0.43 );
      g.LineOnPlane( -0.0494, 0.56, 0.0494, 0.56 );
      setBgColor( '#a38d60', '#dcc493' );
      g.PolygonOnPlane( [ -0.14, -0.1, -0.1, 0.1, 0.1, 0.14, 0.14, -0.14, -0.14 ], [ 0, 0, 0.06, 0.06, 0, 0, 0.08, 0.08, 0 ], 3 );
    }

  } else if (objType == 4) {
    // city
    var mi = m.NObjectsDrawn[objIx] % 3;
    var mr = m.NObjectsDrawn[objIx] % 6;
    if (mr <= 2) {
      // mirror x axes
      g.Plane.XDir[0] *= -1;
    }
    if (mi == 0) {
      setBgColor( '#eca992', '#ecc3b4' );
      g.RectOnPlane( -1.5, 0, -1.2, 0.4, 3 );
      setBgColor( '#ffeacc', '#fff4e5' );
      g.RectOnPlane( -1.45, 0.4, -1.25, 0.7, 3 );
      g.RectOnPlane( -1.4, 0.7, -1.3, 0.75, 3 );
      g.LineOnPlane( -1.5, 0.3, -1.2, 0.3 );
      g.LineOnPlane( -1.45, 0.6, -1.25, 0.6 );

      setBgColor( '#586a78', '#7d868d' );
      g.RectOnPlane( -0.7, 0, -0.4, 0.5, 3 );
      g.RectOnPlane( -0.65, 0.5, -0.45, 0.8, 3 );
      g.RectOnPlane( -0.6, 0, -0.5, 1, 3 );
      g.LineOnPlane( -0.56, 1, -0.56, 1.2 );
      g.LineOnPlane( -0.53, 1, -0.53, 1.1 );

      setBgColor( '#f4caa9', '#f4e3d5' );
      g.PolygonOnPlane( [ -0.05, -0.05, 0, 0, 0.1, 0.2, 0.2, 0.25, 0.25, -0.05 ], [ 0, 0.45, 0.5, 0.6, 0.75, 0.6, 0.5, 0.45, 0, 0 ], 3 );
      g.LineOnPlane( 0, 0, 0, 0.5 );
      g.LineOnPlane( 0.2, 0, 0.2, 0.5 );

      setBgColor( '#ec7266', '#f3b0a9' );
      g.RectOnPlane( 0.4, 0, 0.6, 0.9, 3 );

      setBgColor( '#586a78', '#7d868d' );
      g.PolygonOnPlane( [ 1.1, 1.2, 1.35, 1.45, 1.1 ], [ 0, 0.8, 0.8, 0, 0 ], 3 );
      g.LineOnPlane( 1.4, 0, 1.3, 0.8 );
      g.LineOnPlane( 1.25, 0.8, 1.25, 1 );
      g.LineOnPlane( 1.3, 0.8, 1.3, 1 );

    } else if (mi == 1) {
      setBgColor( '#fbd9c6', '#fbebe2' );
      g.RectOnPlane( -1.7, 0, -1.5, 0.5, 3 );
      setBgColor( '#fbebe2', '#fbf5f1' );
      g.PolygonOnPlane( [ -1.68, -1.68, -1.6, -1.52, -1.52, -1.68 ], [ 0.5, 0.6, 0.7, 0.6, 0.5, 0.5 ], 3 );
      g.LineOnPlane( -1.68, 0.6, -1.52, 0.6 );

      setBgColor( '#6d6870', '#9a939e' );
      g.RectOnPlane( -1.1, 0, -0.9, 0.55, 3 );
      setBgColor( '#dfbb97', '#dfcfbf' );
      g.RectOnPlane( -1, 0, -0.8, 0.45, 3 );
      g.RectOnPlane( -1.05, 0.55, -0.95, 0.6, 3 );

      setBgColor( '#b7997c', '#cdbdad' );
      g.RectOnPlane( -0.3, 0, 0.2, 0.4, 3 );
      setBgColor( '#ffeac6', '#fff5e5' );
      g.RectOnPlane( -0.25, 0.3, 0.15, 0.35, 3 );

      setBgColor( '#f3dca7', '#f3e5c5' );
      g.RectOnPlane( 0.6, 0, 1, 0.4, 3 );
      setBgColor( '#c19f89', '#e2bfa9' );
      g.PolygonOnPlane( [ 0.7, 0.7, 0.8, 0.9, 0.9, 0.7 ], [ 0, 0.5, 0.7, 0.5, 0, 0 ], 3 );

      setBgColor( '#4b5866', '#7b8591' );
      g.RectOnPlane( 1.6, 0, 1.9, 0.6, 3 );
      setBgColor( '#012a46', '#3b5465' );
      g.RectOnPlane( 1.7, 0, 1.8, 0.65, 3 );

    } else {
      setBgColor( '#eacfae', '#eaddce' );
      g.RectOnPlane( -2, 0, -1.8, 0.4, 3 );
      setBgColor( '#525462', '#8a8c98' );
      g.RectOnPlane( -1.8, 0, -1.7, 0.4, 3 );

      setBgColor( '#b59776', '#dac2a8' );
      g.RectOnPlane( -1.4, 0, -1, 0.3, 3 );
      setBgColor( '#9c504d', '#c18d8b' );
      g.RectOnPlane( -1.35, 0.3, -1.05, 0.35, 3 );

      setBgColor( '#46352d', '#827067' );
      g.RectOnPlane( -0.7, 0, -0.5, 0.3, 3 );
      setBgColor( '#e5c9a5', '#efe2d1' );
      g.PolygonOnPlane( [ -0.7, -0.6, -0.5 ], [ 0.2, 0.3, 0.2 ], 1 );

      setBgColor( '#f5d9b4', '#f5e9d9' );
      g.RectOnPlane( -0.3, 0, 0.1, 0.2, 3 );

      setBgColor( '#39596b', '#738c9a' );
      g.PolygonOnPlane( [ 0.3, 0.4, 0.5, 0.4, 0.3 ], [ 0.4, 0.6, 0.4, 0.2, 0.4 ], 3 );
      setBgColor( '#878b8e', '#a9aeb1' );
      g.PolygonOnPlane( [ 0.3, 0.3, 0.4, 0.5, 0.5, 0.3 ], [ 0, 0.4, 0.2, 0.4, 0, 0 ], 3 );
      g.LineOnPlane( 0.4, 0, 0.4, 0.2 );

      setBgColor( '#f5d9b4', '#f5e9d9' );
      g.RectOnPlane( 0.6, 0, 0.8, 0.2, 3 );

      setBgColor( '#dccace', '#f0dde1' );
      g.RectOnPlane( 0.9, 0, 1.2, 0.5, 3 );
      setBgColor( '#d3b79e', '#e3d7cc' );
      g.RectOnPlane( 1, 0, 1.15, 0.6, 3 );

      setBgColor( '#a17268', '#c7a8a2' );
      g.PolygonOnPlane( [ 1.4, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2, 2, 1.4 ], [ 0, 0.15, 0.2, 0.15, 0.2, 0.15, 0.2, 0.15, 0, 0 ], 3 );
      g.LineOnPlane( 1.6, 0, 1.6, 0.15 );
      g.LineOnPlane( 1.8, 0, 1.8, 0.15 );

    }

  } else if (objType == 5) {
    // mountain
    var mi = m.NObjectsDrawn[objIx] % 3;
    var mr = m.NObjectsDrawn[objIx] % 6;
    mi = (mi + objIx) % 3;
    if (mr > 2) {
      // mirror x axes
      g.Plane.XDir[0] *= -1;
    }
    if (mi == 0) {
      setBgColor( '#dbe2ed', '#e9f0fc' );
      g.PolygonOnPlane( [ -1.3, -0.8, -0.6, -0.3, -0.1, 0.1, 0.2, 0.4, 0.5, 0.6, 1.3, -1.3 ], [ 0, 0.6, 0.6, 1, 0.9, 0.7, 0.7, 0.9, 0.8, 0.85, 0, 0 ], 3 );
      g.PolygonOnPlane( [ -0.3, 0, 0.3, 0.5, 0.8 ], [ 0.1, 0.2, 0.5, 0.5, 0.4 ], 1 );
      g.PolygonOnPlane( [ -0.6, -0.3, 0.1 ], [ 0.6, 0.4, 0.3 ], 1 );
      g.PolygonOnPlane( [ -0.2, -0.1, 0.1 ], [ 0.5, 0.6, 0.7 ], 1 );
      g.PolygonOnPlane( [ 0.1, 0.2, 0.4, 0.5 ], [ 0.5, 0.6, 0.7, 0.8 ], 1 );

    } else if (mi == 1) {
      setBgColor( '#92aace', '#c4d2e8' );
      g.PolygonOnPlane( [ -1.3, -0.8, -0.7, -0.2, 0.1, 0.2, 0.5, 0.6, 0.7, 1.3, -1.3 ], [ 0, 0.5, 0.5, 1, 0.8, 0.7, 0.7, 0.6, 0.6, 0, 0 ], 3 );
      g.PolygonOnPlane( [ -0.7, -0.6, -0.3 ], [ 0.5, 0.5, 0.2 ], 1 );
      g.LineOnPlane( 0.2, 0.7, 0.7, 0.2 );
      g.LineOnPlane( 0.6, 0.6, 1.1, 0.1 );

    } else {
      setBgColor( '#abacb1', '#c8c9cf' );
      g.PolygonOnPlane( [ -1.3, -0.7, -0.6, -0.3, -0.3, -0.2, -0.1, 0.1, 0.3, 0.5, 0.6, 0.8, 1, 1.1, 1.3, -1.3 ],  [ 0, 0.6, 0.6, 0.8, 0.9, 1, 1, 0.8, 0.5, 0.4, 0.5, 0.5, 0.4, 0.2, 0, 0 ], 3 );
      g.PolygonOnPlane( [ -1, -0.6, -0.4, -0.2, 0 ], [ 0.1, 0.4, 0.5, 0.5, 0.3 ], 1 );
      g.PolygonOnPlane( [ -0.6, -0.5, -0.4 ], [ 0.6, 0.6, 0.5 ], 1 );
      g.PolygonOnPlane( [ -0.2, -0.1, 0 ], [ 1, 0.8, 0.4 ], 1 );
      g.PolygonOnPlane( [ 0, 0.3, 0.6, 0.8, 0.9 ], [ 0.1, 0.2, 0.5, 0.4, 0.3 ], 1 );
    }

  } else if (objType == 6) {
    // bridge

    // draw road except on SideVarType = rand
    var p1 = JsgVect3.Null();
    var p2 = JsgVect3.Null();
    g.GetTransPointOnPlane( -1, 1, p1 );
    g.GetTransPointOnPlane(  1, 1, p2 );
    if (m.NObjectsDrawn[objIx] > 0 && m.ObjSideType[objIx] != 2) {
      g.SaveTrans3D( true );
      g.NewPoly3D();
      if (m.Col == 1) {
        g.AddPointToPoly3D( m.LastRoadP11 );
        g.AddPointToPoly3D( m.LastRoadP12 );
      } else {
        g.AddPointToPoly3D( m.LastRoadP21 );
        g.AddPointToPoly3D( m.LastRoadP22 );
      }
      g.AddPointToPoly3D( p2 );
      g.AddPointToPoly3D( p1 );
      setBgColor( '#cdcac3', '#e8e4dc' );
      g.DrawPoly3D( 7 );
      g.RestoreTrans3D();
    }
    if (m.Col == 1) {
      m.LastRoadP11 = JsgVect3.Copy( p1 );
      m.LastRoadP12 = JsgVect3.Copy( p2 );
    } else {
      m.LastRoadP21 = JsgVect3.Copy( p1 );
      m.LastRoadP22 = JsgVect3.Copy( p2 );
    }

    // draw pilows
    setBgColor( '#adadab', '#d2d2cf' );
    g.RectOnPlane( -0.8, 0, -0.55, 0.55, 3 );
    g.RectOnPlane( 0.55, 0, 0.8, 0.55, 3 );
    setBgColor( '#8c8678', '#b9b19e' );
    g.RectOnPlane( -1, 0.55, 1, 0.7, 3 );
    setBgColor( '#565a56', '#858b85' );
    g.PolygonOnPlane( [ -1, -1, -0.95, -0.95, 0.95, 0.95, 1, 1, -1 ], [ 1, 0.9, 0.9, 0.7, 0.7, 0.9, 0.9, 1, 1, 1 ], 3 );

  } else if (objType == 7) {
    // tensas bayou

    var p1 = JsgVect3.Null();
    var p2 = JsgVect3.Null();
    var nDraw = m.NObjectsDrawn[objIx];
    var roadH = 9.5;
    var roadP = 25.1;
    var roadW = 6.1;

    // draw ground
    if (nDraw <= 8) {
      var groundH = 4.2 * (m.ObjSizeVar[objIx] + 1);
      if (nDraw == 8) groundH = 0;
      g.GetTransPointOnPlane( -100, groundH, p1 );
      g.GetTransPointOnPlane(  100, groundH, p2 );
      if (m.LastPosValid[objIx]) {
        g.SaveTrans3D( true );
        g.NewPoly3D();
        g.AddPointToPoly3D( m.LastGroundP1 );
        g.AddPointToPoly3D( m.LastGroundP2 );
        g.AddPointToPoly3D( p2 );
        g.AddPointToPoly3D( p1 );
        if (nDraw == 8) {
          setBgColor( '#687e28', '#6d8527' );
          g.SetColor( '#687e28' );
        } else {
          setBgColor( '#49884b', '#5e9b60' );
          g.SetColor( '#49884b' );
        }
        g.DrawPoly3D( 7 );
        g.SetColor( 'black' );
        g.RestoreTrans3D();
      }
      m.LastGroundP1 = JsgVect3.Copy( p1 );
      m.LastGroundP2 = JsgVect3.Copy( p2 );
    }

    // draw roads
    var roadS = 1;
    if (m.ObjSidePos[objIx] < 0) roadS = -1;
    if (nDraw < 2) {
      roadH = 25.5;
      roadP = 5.1;
      roadW = 5;
    } else if (nDraw < 4) {
      roadH = nDraw == 2 ? 23.3 : 17.3;
      roadP = 5.1;
      roadW = 5;
    } else if (nDraw < 6) {
      if (nDraw == 4) roadH = 11.4;
      roadP = nDraw == 4 ? 11.7 : 18.4;
      roadW = nDraw == 4 ? 5.4 : 5.8;
    }
    roadH *= (m.ObjSizeVar[objIx] + 1);

    g.GetTransPointOnPlane( roadS*roadP-(roadW-0.4), roadH, p1 );
    g.GetTransPointOnPlane( roadS*roadP+(roadW-0.4), roadH, p2 );
    g.SetColor( '#838795' );
    if (m.LastPosValid[objIx]) {
      g.SaveTrans3D( true );
      g.NewPoly3D();
      g.AddPointToPoly3D( m.LastRoadP11 );
      g.AddPointToPoly3D( m.LastRoadP12 );
      g.AddPointToPoly3D( p2 );
      g.AddPointToPoly3D( p1 );
      setBgColor( '#999ba2', '#adb1bc' );
      g.DrawPoly3D( 7 );
      g.RestoreTrans3D();
    }
    m.LastRoadP11 = JsgVect3.Copy( p1 );
    m.LastRoadP12 = JsgVect3.Copy( p2 );

    roadS *= -1;
    g.GetTransPointOnPlane( roadS*roadP-(roadW-0.4), roadH, p1 );
    g.GetTransPointOnPlane( roadS*roadP+(roadW-0.4), roadH, p2 );
    if (m.LastPosValid[objIx]) {
      g.SaveTrans3D( true );
      g.NewPoly3D();
      g.AddPointToPoly3D( m.LastRoadP21 );
      g.AddPointToPoly3D( m.LastRoadP22 );
      g.AddPointToPoly3D( p2 );
      g.AddPointToPoly3D( p1 );
      setBgColor( '#999ba2', '#adb1bc' );
      g.DrawPoly3D( 7 );
      g.RestoreTrans3D();
    }
    g.SetColor( 'black' );
    m.LastRoadP21 = JsgVect3.Copy( p1 );
    m.LastRoadP22 = JsgVect3.Copy( p2 );
    m.LastPosValid[objIx] = true;

    // draw pilows
    setBgColor( '#adadab', '#d2d2cf' );
    g.RectOnPlane( -roadP-(roadW-1.3), 0, -roadP-(roadW-2.7), roadH-2.4, 3 );
    g.RectOnPlane( -roadP+(roadW-2.7), 0, -roadP+(roadW-1.3), roadH-2.4, 3 );
    g.RectOnPlane( +roadP-(roadW-1.3), 0, +roadP-(roadW-2.7), roadH-2.4, 3 );
    g.RectOnPlane( +roadP+(roadW-2.7), 0, +roadP+(roadW-1.3), roadH-2.4, 3 );
    setBgColor( '#8c8678', '#b9b19e' );
    g.RectOnPlane( -roadP-roadW, roadH-2.4, -roadP+roadW, roadH-1.2, 3 );
    g.RectOnPlane( +roadP-roadW, roadH-2.4, +roadP+roadW, roadH-1.2, 3 );
    setBgColor( '#565a56', '#858b85' );
    g.PolygonOnPlane(
      [ -roadP-roadW, -roadP-roadW, -roadP-(roadW-1.3), -roadP-(roadW-1.3), -roadP+(roadW-1.3), -roadP+(roadW-1.3), -roadP+roadW, -roadP+roadW, -roadP+(roadW-0.4), -roadP+(roadW-0.4), -roadP-(roadW-0.4), -roadP-(roadW-0.4), -roadP-roadW ],
      [  roadH+0.8,  roadH-0.2,  roadH-0.2,  roadH-1.2,  roadH-1.2,  roadH-0.2,  roadH-0.2,  roadH+0.8,  roadH+0.8,  roadH+0.0,  roadH+0.0,  roadH+0.8,  roadH+0.8 ], 3 );
    g.PolygonOnPlane(
      [ +roadP-roadW, +roadP-roadW, +roadP-(roadW-1.3), +roadP-(roadW-1.3), +roadP+(roadW-1.3), +roadP+(roadW-1.3), +roadP+roadW, +roadP+roadW, +roadP+(roadW-0.4), +roadP+(roadW-0.4), +roadP-(roadW-0.4), +roadP-(roadW-0.4), +roadP-roadW ],
      [  roadH+0.8,  roadH-0.2,  roadH-0.2,  roadH-1.2,  roadH-1.2,  roadH-0.2,  roadH-0.2,  roadH+0.8,  roadH+0.8,  roadH+0.0,  roadH+0.0,  roadH+0.8,  roadH+0.8 ], 3 );

    if (nDraw == 47) {
      // draw bridge
      setBgColor( '#565a56', '#858b85' );
      g.PolygonOnPlane(
        [ -roadP+roadW, -roadP+roadW, -roadP+20.1, roadP-20.1, roadP-roadW, roadP-roadW, roadP-20.1, -roadP+20.1, -roadP+roadW ],
        [  roadH+0.8,  roadH-0.2,  roadH-0.0,  roadH-0.0,  roadH-0.2, roadH+0.8, roadH+1.0,   roadH+1.0,   roadH+0.8 ], 3 );

      setBgColor( '#adadab', '#d2d2cf' );
      g.PolygonOnPlane(
        [ -roadP+roadW, -roadP+roadW, -roadP+20.1, roadP-20.1, roadP-roadW, roadP-roadW, roadP-20.1, -roadP+20.1, -roadP+roadW ],
        [  roadH-0.2,  roadH-1.0,  roadH-0.8,  roadH-0.8,  roadH-1.0, roadH-0.2, roadH-0.0,   roadH-0.0,   roadH-0.2 ], 3 );

      setBgColor( '#8c8678', '#b9b19e' );
      g.RectOnPlane( -roadP+(roadW+0.1), roadH-1.8, -roadP+(roadW+1.3), roadH-1.0, 3 );
      g.RectOnPlane( +roadP-(roadW+0.1), roadH-1.8, +roadP-(roadW+1.3), roadH-1.0, 3 );
      g.RectOnPlane( -roadP+18.5, roadH-1.6, -roadP+19.7, roadH-0.8, 3 );
      g.RectOnPlane( +roadP-18.5, roadH-1.6, +roadP-19.7, roadH-0.8, 3 );

      setBgColor( '#565a56', '#858b85' );
      g.PolygonOnPlane(
        [ -roadP+(roadW+0.1), -roadP+(roadW-0.5), -roadP+(roadW+0.1), -roadP+(roadW+0.7), -roadP+(roadW+0.1) ],
        [          roadH-1.8,                0.0,                0.0,          roadH-1.8,          roadH-1.8 ], 3 );
      g.PolygonOnPlane(
        [ +roadP-(roadW+0.1), +roadP-(roadW-0.5), +roadP-(roadW+0.1), +roadP-(roadW+0.7), +roadP-(roadW+0.1) ],
        [          roadH-1.8,                0.0,                0.0,          roadH-1.8,          roadH-1.8 ], 3 );
      g.PolygonOnPlane(
        [ -roadP+(roadW+0.7), -roadP+(roadW+1.3), -roadP+(roadW+1.9), -roadP+(roadW+1.3), -roadP+(roadW+0.7) ],
        [          roadH-1.8,                0.0,                0.0,          roadH-1.8,          roadH-1.8 ], 3 );
      g.PolygonOnPlane(
        [ +roadP-(roadW+0.7), +roadP-(roadW+1.3), +roadP-(roadW+1.9), +roadP-(roadW+1.3), +roadP-(roadW+0.7) ],
        [          roadH-1.8,                0.0,                0.0,          roadH-1.8,          roadH-1.8 ], 3 );

      g.PolygonOnPlane(
        [ -roadP+18.5, -roadP+17.9, -roadP+18.5, -roadP+19.1, -roadP+18.5 ],
        [  roadH-1.6,          0.0,         0.0,  roadH- 1.6,  roadH- 1.6 ], 3 );
      g.PolygonOnPlane(
        [ +roadP-18.5, +roadP-17.9, +roadP-18.5, +roadP-19.1, +roadP-18.5 ],
        [  roadH-1.6,          0.0,         0.0,  roadH- 1.6,  roadH- 1.6 ], 3 );
      g.PolygonOnPlane(
        [ -roadP+19.1, -roadP+19.7, -roadP+20.3, -roadP+19.7, -roadP+19.1 ],
        [  roadH-1.6,          0.0,         0.0,  roadH- 1.6,  roadH -1.6 ], 3 );
      g.PolygonOnPlane(
        [ +roadP-19.1, +roadP-19.7, +roadP-20.3, +roadP-19.7, +roadP-19.1 ],
        [  roadH-1.6,          0.0,         0.0,  roadH- 1.6,  roadH -1.6 ], 3 );
    }

  } else if (objType == 8 || objType == 9) {
    // Soundly demo: Causew-S and Causew-N

    var p1 = JsgVect3.Null();
    var p2 = JsgVect3.Null();
    var nDraw = m.NObjectsDrawn[objIx];
    if (objType == 9) {
      // draw backward
      nDraw = m.NObjects[objIx] - 1 - nDraw;
    }
    var roadH = 5 * (m.ObjSizeVar[objIx] + 1);
    var roadP = 17;
    var roadW = 5;
    var roadN = 0; // narrowing of east road

    // draw roads
    var roadS = 1;
    if (m.ObjSidePos[objIx] < 0) roadS = -1;

    // compute ship passages
    if (nDraw == 106 || nDraw == 107 || nDraw == 64 || nDraw == 63 || nDraw == 21 || nDraw == 20) {
      roadH += 2.5;
    }
    if (nDraw == 86 || nDraw == 87 || nDraw == 41 || nDraw == 42) {
      roadH += 12;
    }

    // compute narrowing of roads
    if (nDraw >= 121) {
      roadN = 18 * (nDraw - 121) / 7
    }
    if (nDraw <= 7) {
      roadN = 18 * (7-nDraw) / 7;
    }
    var underH = roadH - 3;
    var underL = 24.1;
    var underR = 26.8;
/*
    function DrawUnderPassageRamp( lastP ) {
      if (!m.LastPosValid[objIx]) return;
      var rp1 = JsgVect3.Null();
      var rp2 = JsgVect3.Null();
      g.GetTransPointOnPlane( -roadP-underL, underH, rp1 );
      g.GetTransPointOnPlane( -roadP-(underL-5), underH, rp2 );
      g.SaveTrans3D( true );
      g.NewPoly3D();
      g.AddPointToPoly3D( lastP );
      g.AddPointToPoly3D( JsgVect3.Add( lastP, [5,0,0] ) );
      g.AddPointToPoly3D( rp2 );
      g.AddPointToPoly3D( rp1 );
      setBgColor( '#999ba2', '#adb1bc' );
      g.DrawPoly3D( 7 );
      g.RestoreTrans3D();
    }
*/
    function DrawTower( base, center, height, basew, topw, nbars ) {
      g.SetAlpha( 0.3 );
      setBgColor( '#888888', '#aaaaaa' );
      g.PolygonOnPlane(
        [ center-basew/2, center+basew/2, center+topw/2, center-topw/2, center-basew/2 ],
        [ base, base, base+height, base+height, base ], 3 );
      g.NewPoly();
      var dh = height / nbars;
      var hlimit = height + dh/2;
      var slope = (topw-basew) / 2 / height;
      var s = 1;
      for (var hoff = 0; hoff < hlimit; hoff += dh) {
        g.AddPointToPoly( center+s*(hoff*slope+basew/2), hoff+base );
        s *= -1;
      }
      g.PolygonOnPlane( g.Poly, 1 );
      g.NewPoly();
      var s = -1;
      for (var hoff = 0; hoff < hlimit; hoff += dh) {
        g.AddPointToPoly( center+s*(hoff*slope+basew/2), hoff+base );
        s *= -1;
      }
      g.PolygonOnPlane( g.Poly, 1 );
      g.SetAlpha( 1 );
    }

    g.SetColor( '#838795' );
    var roadCorrLeftH = 4;
    var w = roadN;
    if (roadS < 0) w = 0;
    // under passage correction
    if (nDraw == 79 && roadS < 0) {
      //DrawUnderPassageRamp( m.LastRoadP11 );
      roadH += roadCorrLeftH;
    }
    g.GetTransPointOnPlane( roadS*roadP-w-(roadW-0.4), roadH, p1 );
    g.GetTransPointOnPlane( roadS*roadP-w+(roadW-0.4), roadH, p2 );
    if (m.LastPosValid[objIx]) {
      g.SaveTrans3D( true );
      g.NewPoly3D();
      g.AddPointToPoly3D( m.LastRoadP11 );
      g.AddPointToPoly3D( m.LastRoadP12 );
      g.AddPointToPoly3D( p2 );
      g.AddPointToPoly3D( p1 );
      setBgColor( '#999ba2', '#adb1bc' );
      g.DrawPoly3D( 7 );
      g.RestoreTrans3D();
    }
    m.LastRoadP11 = JsgVect3.Copy( p1 );
    m.LastRoadP12 = JsgVect3.Copy( p2 );
    // undo under passage correction
    if (nDraw == 79 && roadS < 0) roadH -= roadCorrLeftH;

    roadS *= -1;
    // under passage correction
    if (nDraw == 79 && roadS < 0) {
      //DrawUnderPassageRamp( m.LastRoadP21 );
      roadH += roadCorrLeftH;
    }
    w = roadN;
    if (roadS < 0) w = 0;
    g.GetTransPointOnPlane( roadS*roadP-w-(roadW-0.4), roadH, p1 );
    g.GetTransPointOnPlane( roadS*roadP-w+(roadW-0.4), roadH, p2 );
    if (m.LastPosValid[objIx]) {
      g.SaveTrans3D( true );
      g.NewPoly3D();
      g.AddPointToPoly3D( m.LastRoadP21 );
      g.AddPointToPoly3D( m.LastRoadP22 );
      g.AddPointToPoly3D( p2 );
      g.AddPointToPoly3D( p1 );
      setBgColor( '#999ba2', '#adb1bc' );
      g.DrawPoly3D( 7 );
      g.RestoreTrans3D();
    }
    // undo under passage correction
    if (nDraw == 79 && roadS < 0) roadH -= roadCorrLeftH;
    g.SetColor( 'black' );
    m.LastRoadP21 = JsgVect3.Copy( p1 );
    m.LastRoadP22 = JsgVect3.Copy( p2 );
    m.LastPosValid[objIx] = true;

    // draw under passage
    if (nDraw == 79) {

      // pillows
      setBgColor( '#adadab', '#d2d2cf' );
      g.RectOnPlane( -roadP-(underL-1.3), 0, -roadP-(underL-2.7), underH, 3 );
      g.RectOnPlane( -roadP-(underL-7.3), 0, -roadP-(underL-8.7), underH, 3 );
      g.RectOnPlane( -roadP+(underR-1.3), 0, -roadP+(underR-2.7), underH, 3 );
      g.RectOnPlane( -roadP+(underR-7.3), 0, -roadP+(underR-8.7), underH, 3 );

      /*
      // box left
      setBgColor( '#8c8678', '#b9b19e' );
      g.RectOnPlane( -roadP-underL, underH-2.4, -roadP+underR, underH-1.2, 3 );
      */

      // hut
      setBgColor( '#565a56', '#858b85' );
      g.PolygonOnPlane(
        [ -roadP-underL, -roadP-underL, -roadP-(underL-1.3), -roadP-(underL-1.3), -roadP+(underR-1.3), -roadP+(underR-1.3), -roadP+underR, -roadP+underR, -roadP+(underR-0.4), -roadP+(underR-0.4), -roadP-(underL-0.4), -roadP-(underL-0.4), -roadP-underL ],
        [  underH+0.8,  underH-0.2,  underH-0.2,  underH-1.2,  underH-1.2,  underH-0.2,  underH-0.2,  underH+0.8,  underH+0.8,  underH+0.0,  underH+0.0,  underH+0.8,  underH+0.8 ], 3 );

      // base
      setBgColor( '#888888', '#aaaaaa' );
      g.SetAlpha(0.5);
      g.RectOnPlane( -roadP-roadW-13.5, underH, -roadP-roadW, underH+4, 3 );
      g.RectOnPlane( -roadP+roadW, underH, -roadP+roadW+18.6, underH+4, 3 );

      // towers
      var towerOffset = 5.5;
      var c = -roadP - roadW - towerOffset;
      var th = 21.4;
      var bh = underH + 3.2; // 8;
      DrawTower( bh, c, th, 3.8, 3.8, 5 );
      g.RectOnPlane( c-2.4, underH+4, c+2.4, underH+8, 3 );

      var c = -roadP + roadW + towerOffset;
      var th = 14.3;
      DrawTower( bh, c, th, 3.8, 3.8, 5 );
      g.RectOnPlane( c-2.4, underH+4, c+2.4, underH+8, 3 );

      // boxes
      setBgColor( '#8c8678', '#b9b19e' );
      var c = -roadP - roadW - towerOffset;
      g.RectOnPlane( c-1.8, underH+4, c+1.8, underH+7.6, 3 );
      /*
      var c = -roadP - roadW - 3.6;
      g.PolygonOnPlane( [ c-3.2, c-3.2, c, c, c-1.6, c-3.2 ], [ underH+6.7, underH+4, underH+4, underH+6.7, underH+6.9, underH+6.7 ], 3 );
      */
      var c = -roadP + roadW + towerOffset;
      g.RectOnPlane( c-1.8, underH+4, c+1.8, underH+7.6, 3 );
      setBgColor( '#cccccc', '#dddddd' );
      /*
      var c = -roadP + roadW +4.3;
      g.PolygonOnPlane( [ c, c, c+5.3, c+5.3, c+2.65, c ], [ underH+7.2, underH+4, underH+4, underH+7.2, underH+7.5, underH+7.2 ], 3 );
      */

    }

    // draw hump stuff
    if (nDraw == 41) {

      // control buildings
      setBgColor( '#8c8678', '#b9b19e' );
      var x = roadP - roadW;
      var z = roadH;
      g.PolygonOnPlane(
        [ x-2.26, x-2.26, x, x, x-2.51, x-2.51, x-2.01, x-7.28, x-6.78, x-6.78, x-2.26 ],
        [ z-5.52,      0, 0, z,      z, z+2.51, z+5.52, z+5.52, z+2.51, z-4.27, z-5.52 ], 3 );
      setBgColor( '#adadab', '#d2d2cf' );
      g.RectOnPlane( x-8.79, z+2, x-2.25, z+2.5, 3 );
      g.RectOnPlane( x-8.28, z, x-7.28, z+2, 3 );
      // radar
      g.RectOnPlane( x-5.27, z+5.52, x-4.77, z+9.29, 3 );
      g.RectOnPlane( x-6.90, z+8.54, x-3.12, z+9.04, 3 );
      // window
      setBgColor( '#444444', '#666666' );
      g.PolygonOnPlane(
        [ x-6.53, x-2.76, x-2.51, x-6.78, x-6.53 ],
        [ z+3.51, z+3.51, z+4.77, z+4.77, z+3.51 ], 3 );
      // building west
      var x = -roadP - roadW;
      setBgColor( '#8c8678', '#b9b19e' );
      g.PolygonOnPlane(
        [ x-2.26, x-2.26, x, x, x-2.51, x-2.51, x-6.78, x-6.78, x-2.26 ],
        [ z-5.52,      0, 0, z,      z, z+7.03, z+7.03, z-4.27, z-5.52 ], 3 );
      DrawTower( z, x-3.94, 7.53, 6.28, 6.28, 2 );

      // bridge
      setBgColor( '#adadab', '#d2d2cf' );
      g.RectOnPlane( -roadP+roadW, roadH-1.13, roadP-roadW, roadH, 3 );

      // left pillow
      setBgColor( '#8c8678', '#b9b19e' );
      var x = -roadP + roadW;
      g.RectOnPlane( x, 0, x+1.76, z, 3 );

      // tower oeast
      var towerOffset = 1.9;
      var c = +roadP + roadW + towerOffset;
      var th = 10;
      DrawTower( roadH, c, th, 3.8, 3.8, 3 );
      g.RectOnPlane( roadP + roadW, roadH-4, roadP + roadW + 4, roadH, 3 );

      // needle tower
      var towerOffset = 1.25;
      var c = +roadP - roadW - towerOffset;
      var th = 14;
      DrawTower( roadH, c, th, 1.5, 0, 6 );

    }

    // draw ship gide
    if (nDraw == 41 || nDraw == 42 || nDraw == 86 || nDraw == 87) {
      setBgColor( '#8c8678', '#b9b19e' );
      g.SetAlpha( 0.7 );
      g.RectOnPlane( -roadP-roadW-35, 0, +roadP+roadW+35, 3.4, 3 );
      g.SetAlpha( 1 );
      g.RectOnPlane( -roadP-roadW-41.7, 0, -roadP-roadW-35, 2.7, 3 );
      g.RectOnPlane( +roadP+roadW+35, 0, +roadP+roadW+41.7, 2.7, 3 );
    }

    // draw pilows
    w = roadN;
    var hCorrLeft = 0;
    if (nDraw == 79) hCorrLeft = roadCorrLeftH;  // under passage bridge correction
    var roadHC = roadH + hCorrLeft;
    setBgColor( '#adadab', '#d2d2cf' );
    g.RectOnPlane( -roadP-(roadW-1.3), 0, -roadP-(roadW-2.7), roadHC-2.4, 3 );
    g.RectOnPlane( -roadP+(roadW-2.7), 0, -roadP+(roadW-1.3), roadHC-2.4, 3 );
    g.RectOnPlane( +roadP-w-(roadW-1.3), 0, +roadP-w-(roadW-2.7), roadH-2.4, 3 );
    g.RectOnPlane( +roadP-w+(roadW-2.7), 0, +roadP-w+(roadW-1.3), roadH-2.4, 3 );
    setBgColor( '#8c8678', '#b9b19e' );
    g.RectOnPlane( -roadP-roadW, roadHC-2.4, -roadP+roadW, roadHC-1.2, 3 );
    g.RectOnPlane( +roadP-w-roadW, roadH-2.4, +roadP-w+roadW, roadH-1.2, 3 );
    setBgColor( '#565a56', '#858b85' );
    g.PolygonOnPlane(
      [ -roadP-roadW, -roadP-roadW, -roadP-(roadW-1.3), -roadP-(roadW-1.3), -roadP+(roadW-1.3), -roadP+(roadW-1.3), -roadP+roadW, -roadP+roadW, -roadP+(roadW-0.4), -roadP+(roadW-0.4), -roadP-(roadW-0.4), -roadP-(roadW-0.4), -roadP-roadW ],
      [  roadHC+0.8,  roadHC-0.2,  roadHC-0.2,  roadHC-1.2,  roadHC-1.2,  roadHC-0.2,  roadHC-0.2,  roadHC+0.8,  roadHC+0.8,  roadHC+0.0,  roadHC+0.0,  roadHC+0.8,  roadHC+0.8 ], 3 );
    g.PolygonOnPlane(
      [ +roadP-w-roadW, +roadP-w-roadW, +roadP-w-(roadW-1.3), +roadP-w-(roadW-1.3), +roadP-w+(roadW-1.3), +roadP-w+(roadW-1.3), +roadP-w+roadW, +roadP-w+roadW, +roadP-w+(roadW-0.4), +roadP-w+(roadW-0.4), +roadP-w-(roadW-0.4), +roadP-w-(roadW-0.4), +roadP-w-roadW ],
      [  roadH+0.8,  roadH-0.2,  roadH-0.2,  roadH-1.2,  roadH-1.2,  roadH-0.2,  roadH-0.2,  roadH+0.8,  roadH+0.8,  roadH+0.0,  roadH+0.0,  roadH+0.8,  roadH+0.8 ], 3 );

    // draw big transmission towers
    if (nDraw == 84) {
      var c = +roadP - roadW - 6.7;
      DrawTower( roadH, c, 32, 7.7, 4.8, 5 );

      setBgColor( '#8c8678', '#b9b19e' );
      g.RectOnPlane( -roadP+roadW+2.2, roadH, -roadP+roadW+6.8, roadH+3.8, 3 );
    }

    // double towers from north view
    if (nDraw == 39 && objType == 9) {
      // DrawTower( base, center, height, basew, topw, nbars );
      DrawTower( roadH, -6.25, 9.5, 1.79, 1.79, 5 );
      DrawTower( roadH,  6.25, 9.5, 1.79, 1.79, 5 );
    }

    // draw bridges
    if (nDraw == 18 || nDraw == 39 || nDraw == 44 || nDraw == 61 || nDraw == 84 || nDraw == 89 || nDraw == 110) {
      setBgColor( '#565a56', '#858b85' );
      g.RectOnPlane( -roadP+roadW, roadH-0.2, roadP-roadW, roadH+0.8, 3 );

      setBgColor( '#adadab', '#d2d2cf' );
      g.RectOnPlane( -roadP+roadW, roadH-1.4, roadP-roadW, roadH-0.2, 3 );

      g.RectOnPlane( -roadP+(roadW+0.1), roadH-2.8, -roadP+(roadW+1.0), roadH-1.4, 3 );
      g.RectOnPlane( +roadP-(roadW+0.1), roadH-2.8, +roadP-(roadW+1.0), roadH-1.4, 3 );

      setBgColor( '#8c8678', '#b9b19e' );
      g.RectOnPlane( -roadP+(roadW+0.2), 0, -roadP+(roadW+0.9), roadH-2.8, 3 );
      g.RectOnPlane( +roadP-(roadW+0.2), 0, +roadP-(roadW+0.9), roadH-2.8, 3 );

      // signs
      if (objType == 8) {
        if (nDraw != 89 && nDraw != 44) {
          setBgColor( '#cccccc', '#dddddd' );
          g.RectOnPlane( -roadP+(roadW+1.0+7.5), roadH+1.8, -roadP+(roadW+1.0), roadH+1.8+2.2, 3 );
        }
        if (nDraw != 84 && nDraw != 39) {
          setBgColor( '#444444', '#666666' );
          g.RectOnPlane( +roadP-(roadW+1.0+7.5), roadH+1.8, +roadP-(roadW+1.0), roadH+1.8+2.2, 3 );
        }
        setBgColor( '#666666', '#888888' );
        if (nDraw != 89 && nDraw != 44) {
          g.LineOnPlane( -roadP+(roadW+1.0+7.5), roadH+0.9, -roadP+(roadW+1.0+7.5), roadH+1.8 );
          g.LineOnPlane( -roadP+(roadW+1.0+5  ), roadH+0.9, -roadP+(roadW+1.0+5  ), roadH+1.8 );
          g.LineOnPlane( -roadP+(roadW+1.0+2.5), roadH+0.9, -roadP+(roadW+1.0+2.5), roadH+1.8 );
          g.LineOnPlane( -roadP+(roadW+1.0    ), roadH+0.9, -roadP+(roadW+1.0    ), roadH+1.8 );
        }
        if (nDraw != 84 && nDraw != 39) {
          g.LineOnPlane( +roadP-(roadW+1.0+7.5), roadH+0.9, +roadP-(roadW+1.0+7.5), roadH+1.8 );
          g.LineOnPlane( +roadP-(roadW+1.0+5  ), roadH+0.9, +roadP-(roadW+1.0+5  ), roadH+1.8 );
          g.LineOnPlane( +roadP-(roadW+1.0+2.5), roadH+0.9, +roadP-(roadW+1.0+2.5), roadH+1.8 );
          g.LineOnPlane( +roadP-(roadW+1.0    ), roadH+0.9, +roadP-(roadW+1.0    ), roadH+1.8 );
        }
      } else {
        if (nDraw != 89 && nDraw != 44) {
          setBgColor( '#444444', '#666666' );
          g.RectOnPlane( -roadP+(roadW+1.0+7.5), roadH+1.8, -roadP+(roadW+1.0), roadH+1.8+2.2, 3 );
        }
        if (nDraw != 84 && nDraw != 39) {
          setBgColor( '#cccccc', '#dddddd' );
          g.RectOnPlane( +roadP-(roadW+1.0+7.5), roadH+1.8, +roadP-(roadW+1.0), roadH+1.8+2.2, 3 );
        }
        setBgColor( '#666666', '#888888' );
        if (nDraw != 89 && nDraw != 44) {
          g.LineOnPlane( -roadP+(roadW+1.0+7.5), roadH+0.9, -roadP+(roadW+1.0+7.5), roadH+1.8 );
          g.LineOnPlane( -roadP+(roadW+1.0+5  ), roadH+0.9, -roadP+(roadW+1.0+5  ), roadH+1.8 );
          g.LineOnPlane( -roadP+(roadW+1.0+2.5), roadH+0.9, -roadP+(roadW+1.0+2.5), roadH+1.8 );
          g.LineOnPlane( -roadP+(roadW+1.0    ), roadH+0.9, -roadP+(roadW+1.0    ), roadH+1.8 );
        }
        if (nDraw != 84 && nDraw != 39) {
          g.LineOnPlane( +roadP-(roadW+1.0+7.5), roadH+0.9, +roadP-(roadW+1.0+7.5), roadH+1.8 );
          g.LineOnPlane( +roadP-(roadW+1.0+5  ), roadH+0.9, +roadP-(roadW+1.0+5  ), roadH+1.8 );
          g.LineOnPlane( +roadP-(roadW+1.0+2.5), roadH+0.9, +roadP-(roadW+1.0+2.5), roadH+1.8 );
          g.LineOnPlane( +roadP-(roadW+1.0    ), roadH+0.9, +roadP-(roadW+1.0    ), roadH+1.8 );
        }
      }

      // lights
      setBgColor( '#aaaaaa', '#bbbbbb' );
      g.RectOnPlane( -roadP-roadW-0.14, roadH, -roadP-roadW+0.14, roadH+18.0, 2 );
      g.RectOnPlane( -roadP-roadW+0.14, roadH+17.3, -roadP-roadW+1.14, roadH+17.7, 2 );
      g.SetAreaAttr( '#eeeeee', '#aaaaaa', 1 );
      g.RectOnPlane( -roadP-roadW+0.63, roadH+16.8, -roadP-roadW+1.13, roadH+17.3, 3 );

      setBgColor( '#aaaaaa', '#bbbbbb' );
      g.RectOnPlane( -0.07, roadH, 0.07, roadH+9.5, 2 );
      g.SetAreaAttr( '#eeeeee', '#aaaaaa', 1 );
      g.RectOnPlane( -0.35, roadH+9.05, 0.35, roadH+9.4, 3 );
      g.SetColor( 'black' );
    }

    // double towers from south view
    if (nDraw == 39 && objType == 8) {
      // DrawTower( base, center, height, basew, topw, nbars );
      DrawTower( roadH, -6.25, 9.5, 1.79, 1.79, 5 );
      DrawTower( roadH,  6.25, 9.5, 1.79, 1.79, 5 );
    }

    // draw huts
    function isHatPos( n ) {
      var hatPos = [ 6, 12, 18, 25, 32, 39, 44, 49, 55, 61, 67, 73, 84, 89, 96, 103, 110, 116, 122 ];
      for (var i = 0; i < hatPos.length; i++) {
        if (n == hatPos[i]) return true;
      }
      return false;
    }
    if (isHatPos( nDraw )) {
      setBgColor( '#888888', '#aaaaaa' );
      g.RectOnPlane( -roadP-roadW-13.5, roadH-0.5, -roadP-roadW, roadH, 3 );
      setBgColor( '#8c8678', '#b9b19e' );
      g.RectOnPlane( -roadP-roadW-12.9, roadH-1, -roadP-roadW-9.1, roadH-0.5, 3 );

      setBgColor( '#cccccc', '#dddddd' );
      var c = -roadP - roadW - 9.1 - 1.9;
      var b = roadH;
      g.PolygonOnPlane( [ c-2, c-2, c+2, c+2, c, c-2 ], [ b+2.7, b, b, b+2.7, b+3, b+2.7 ], 3 );

      g.RectOnPlane( c-1.5, 0, c-0.7, b-1, 3 );
      g.RectOnPlane( c+0.7, 0, c+1.5, b-1, 3 );

    }
  }
  // Undo wrappers in reverse order: audit -> primitive suppression.
  if (endVertexAudit) endVertexAudit();
  if (suppressOriginalTower) {
    g.LineOnPlane = originalTowerLine;
    g.PolygonOnPlane = originalTowerPolygon;
  }
}

function PointOnEarth( lat, long ) {
  var x = CurveApp.geometryRadius * Math.sin( long );
  var rr = CurveApp.geometryRadius * Math.cos( long );
  var y = rr * Math.sin( lat );
  var z = rr * Math.cos( lat );
  return [ x, y, z - (CurveApp.geometryRadius + CurveApp.Height) ];
}

function PointOnPlane( lat, long ) {
  var x = CurveApp.geometryRadius * Math.sin( long );
  var rr = CurveApp.geometryRadius * Math.cos( long );
  var y = rr * Math.sin( lat );
  return [ x, y, -CurveApp.Height ];
}
