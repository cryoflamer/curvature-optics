
    ['TowerOverlayDisplay', 'TowerComparisonMode'].forEach(function(id) {
      document.getElementById(id).addEventListener('change', function() {
        if (document.getElementById('TowerComparisonMode').value !== 'original')
          document.getElementById('TowerOverlayEnabled').checked = true;
        graph.Redraw();
      });
    });
