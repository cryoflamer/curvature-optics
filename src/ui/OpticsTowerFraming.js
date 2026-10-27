
    // Frame the *captured physical vertices*, rather than guessing a focal length.
    // No ray-tracing calculations or tower geometry are modified here.
    function FrameOpticsTestTower21(index) {
      index=index||21;
      var audit = window.CurvatureRenderedVertexAudit;
      var capture = audit && audit.getCapturedGroups().primary[index];
      if (!capture || !capture.points || !capture.points.length)
        throw Error('Tower #21 vertices were not captured');
      var points = capture.points.map(function (p) { return p.world; });
      var bounds = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
      points.forEach(function (p) {
        for (var k = 0; k < 3; k++) {
          bounds[k] = Math.min(bounds[k], p[k]);
          bounds[k+3] = Math.max(bounds[k+3], p[k]);
        }
      });
      var target = [0,1,2].map(function (k) { return (bounds[k]+bounds[k+3])/2; });
      var horizontal = Math.hypot(target[0], target[1]);
      if (!(horizontal > 0)) throw Error('Invalid tower #21 position');
      // Update() defines camera elevation as -aDip + Nick (horizon-centered).
      CurveApp.Pan = Math.atan2(target[0], target[1]) * 180 / Math.PI;
      CurveApp.Nick = CurveApp.aDip * 180 / Math.PI +
        Math.atan2(target[2], horizontal) * 180 / Math.PI;
      UpdateAll(false);
      var g = graph, canvas = g.Context2D && g.Context2D.canvas;
      if (!canvas) throw Error('Scene canvas is unavailable');
      // The actual camera transform includes the app's device-ratio scaling.
      // Measure in that same coordinate system, then adjust the focal length.
      function screenBox() {
        var minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
        points.forEach(function (p) {
          var q=g.Camera.Trans(p);
          var x=g.WinTrans.TransX(q[0]), y=g.WinTrans.TransY(q[1]);
          if (!isFinite(x) || !isFinite(y)) return;
          minX=Math.min(minX,x); maxX=Math.max(maxX,x);
          minY=Math.min(minY,y); maxY=Math.max(maxY,y);
        });
        return {width:maxX-minX,height:maxY-minY};
      }
      var viewportHeight = canvas.height / (g.ContextScale || 1);
      if (!(viewportHeight > 0)) throw Error('Invalid viewport size');
      // Iterate because the camera's perspective scale is not exactly linear
      // in focal length, especially when the tower has appreciable depth.
      for (var iteration=0; iteration<3; iteration++) {
        var size=screenBox();
        if (!(size.height > 0)) throw Error('Tower #21 cannot be projected');
        var ratio=0.65*viewportHeight/size.height;
        if (Math.abs(ratio-1)<0.02) break;
        CurveApp.FocalLengthField=Math.max(50,Math.min(12000,
          CurveApp.FocalLengthField*Math.max(0.25,Math.min(4,ratio))));
        UpdateAll(false);
      }
      return 'Tower #' + index + ' framed (' + Math.round(100*screenBox().height/viewportHeight) + '% height)';
    }
