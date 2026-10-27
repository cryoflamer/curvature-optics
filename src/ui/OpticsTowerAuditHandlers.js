
    document.getElementById('AuditOpticsTower21').addEventListener('click', function () {
      var out = document.getElementById('AuditOpticsTower21Result');
      try {
        var audit = window.CurvatureRenderedVertexAudit;
        var capture = audit && audit.getCapturedGroups().primary[21];
        var bridge = window.CurvatureInverseOpticsBridge;
        if (!capture || !bridge || typeof CurveApp === 'undefined')
          throw Error('Run Optics Test #21 first');
        var report = bridge.auditVertices21(graph, CurveApp, capture,
          window.CurvatureTowerDiagnostics);
        if (!report) throw Error('No vertices or ray solver');
        function num(v, n) { return Number.isFinite(v) ? v.toFixed(n) : '--'; }
        out.textContent = report.rows.map(function (r) {
          return r.level + ': h=' + num(r.height,2) + ' m, d=' + num(r.distance,2) +
            ' m; vacuum=' + num(r.vacuumDeg,6) + 'deg, ray=' +
            (r.status === 'visible' ? num(r.opticalDeg,6)+'deg' : r.status) +
            '; delta ray=' + num(r.deltaArcsec,3) + 'arcsec; delta screen=(' +
            (r.deltaPx ? num(r.deltaPx[0],3)+', '+num(r.deltaPx[1],3) : '--') +
            ') px; angle reconstruction error=' + num(r.reconstructionArcsec,6) + 'arcsec';
        }).join('\n');
        console.table(report.rows);
        var cameraAudit = bridge.auditCameraOrigin(graph, CurveApp);
        out.textContent += '\n\nCAMERA / PHYSICAL OBSERVER: ' +
          (cameraAudit && cameraAudit.passed ? 'PASS' : 'FAIL') +
          '; camera origin distance=' + num(cameraAudit && cameraAudit.originDistance,9) + ' m' +
          '; model origin distance=' + num(cameraAudit && cameraAudit.modelDistance,9) + ' m' +
          '; range invariance=' + num(cameraAudit && cameraAudit.maxRangeShift,6) + ' px' +
          '; directions=' + (cameraAudit ? cameraAudit.directionsChecked : 0);

        var rendered = bridge.auditAtmosphere21(graph, CurveApp,
          window.CurvatureTowerDiagnostics);
        if (rendered) {
          out.textContent += '\n\nORANGE OVERLAY (cached samples): ' +
            (rendered.passed ? 'PASS' : 'FAIL') +
            '; samples=' + rendered.count + '; visible=' + rendered.visible +
            '; hidden=' + rendered.hidden + '; visibility mismatches=' + rendered.mismatches +
            '; invalid projections=' + rendered.invalidProjections +
            '; max angle error=' + num(rendered.maxAngleArcsec,6) + ' arcsec' +
            '; max pixel error=' + num(rendered.maxPixelError,6) + ' px' +
            '; max horizontal screen shift=' + num(rendered.maxHorizontalPixelShift,3) + ' px' +
            '; independent camera error=' + num(rendered.maxIndependentPixelError,6) + ' px' +
            '; 3D direction error=' + num(rendered.maxDirectionErrorArcsec,6) + ' arcsec' +
            '; azimuth error=' + num(rendered.maxAzimuthErrorArcsec,6) + ' arcsec' +
            '; invalid directions=' + rendered.invalidDirections +
            '; ray range sensitivity=' + num(rendered.maxRangeDependentPixelShift,3) + ' px' +
            (rendered.cameraNotAtObserver ?
              ' [WARNING: graphics camera is not at the physical observer; image depends on ray range]' : '');
          var shape = bridge.auditShape21(graph, CurveApp,
            window.CurvatureRenderedVertexAudit);
          if (shape) {
            out.textContent += '\nSHAPE #21 (orange vs purple): matched=' + shape.points +
              '; mean shift=(' + num(shape.meanDx,3) + ', ' + num(shape.meanDy,3) + ') px' +
              '; non-rigid RMS=' + num(shape.rmsNonRigidPx,3) + ' px' +
              '; max residual=' + num(shape.maxNonRigidPx,3) + ' px' +
              '; vertical shift range=' + num(shape.verticalShiftRangePx,3) + ' px' +
              '; original edges=' + shape.edges +
              '; max edge length change=' + num(shape.maxLengthChangePercent,3) + '%' +
              '; max edge tilt change=' + num(shape.maxTiltChangeDeg,3) + ' deg';
            console.table(shape.edgeRows);
          }
          console.table(rendered.rows);
        } else {
          out.textContent += '\n\nORANGE OVERLAY: calculate atmosphere #21 first (or refresh after model changes)';
        }
      } catch (err) { out.textContent = 'Audit failed: ' + err.message; console.error(err); }
    });
