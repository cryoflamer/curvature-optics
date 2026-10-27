


xOnLoad( function() {
  CurveApp.StateDisplay = xGet( 'SaveRestorePanel' );
  if (!CurveApp.StateDisplay) return;
  xAddEvent( CurveApp.StateDisplay, 'keydown', OnStateDisplayKeyDown );
} );

function ClearAppStatePanel() {
  if (CurveApp.StateDisplay) {
    CurveApp.StateDisplay.value = '';
    CurveApp.StateDisplay.focus();
  }
}

function GetAppState() {
  if (!CurveApp.StateDisplay) return;

  var tc = new xTextControl( CurveApp.StateDisplay );
  tc.SetText( DataX.ToJson( 'CurveApp', CurveApp, CurveAppMetaData ) );

  tc.SetCaretPos( 0 );
  CurveApp.StateDisplay.focus();
}

function GetAppStateUrl() {
  if (!CurveApp.StateDisplay) return;
  var oldCompact = CurveAppMetaData.Compact;
  CurveAppMetaData.Compact = true;

  var dataStr = DataX.ToStream( CurveApp, CurveAppMetaData );
  var url = ThisPageUrl + '&state=' + encodeURIComponent( dataStr );
  var tc = new xTextControl( CurveApp.StateDisplay );
  tc.SetText( url );
  tc.SetCaretPos( 0 );

  CurveAppMetaData.Compact = oldCompact;
  CurveApp.StateDisplay.focus();
}

function SetAppState() {
  ResetApp();
  var tc = new xTextControl( CurveApp.StateDisplay );
  var cursorPos = tc.SelStart;
  var stateStr = tc.Text;
  if (stateStr == '') return;

  if (stateStr.indexOf( 'CurveApp = ' ) >= 0) {
    if (!JsonToAppState( stateStr )) return;
  } else if (stateStr.indexOf( 'http://' ) >= 0) {
    if (!UrlToAppState( stateStr )) return;
  }

  if (cursorPos >= stateStr.length-1) cursorPos = 0;
  tc.SetCaretPos( cursorPos );
  CurveApp.StateDisplay.focus();
  UpdateAll( false );
}

function OnStateDisplayKeyDown( evnt ) {
  if (evnt.keyCode == 13 && CurveApp.StateDisplay) {
    evnt.PreventDefault();
    SetAppState();
    return false;  // event handled
  }
  return true;
}

function CompactJson( ) {
  var tc = new xTextControl( CurveApp.StateDisplay );
  var cursorPos = tc.SelStart;
  var stateStr = tc.Text;
  if (stateStr == '') return;

  tc.SetText( stateStr.replace(/[\n ]+/g, ' ') );

  tc.SetCaretPos( 0 );
  CurveApp.StateDisplay.focus();
}

function JsonToAppState( modelStateStr ) {
  var key1 = 'CurveApp = ';
  var p = modelStateStr.indexOf( key1 );
  if (p == -1) {
    alert( 'Invalid Data Format' );
    return false;
  }
  var json = modelStateStr.substring( key1.length );

  if (!DataX.FromJson( CurveApp, CurveAppMetaData, json )) return false;
  CurveApp.AllStatesChanged = true;
  return true;
}

function UrlToAppState( url ) {
  DataX.ParseUrl( url );
  var dataStr = DataX.GetUrlStr( 'state' );
  if (dataStr == '') return false;
  DataX.FromStream( CurveApp, CurveAppMetaData, dataStr );
  return true;
}

function HandleUrlCommands() {
  var dataStr = DataX.GetUrlStr( 'tab' );
  if (dataStr != '') {
    if (dataStr == 'View') {
      Tabs.Select( 'CurveSettingsTabs', 0 );
    } else if (dataStr == 'Obj1') {
      Tabs.Select( 'CurveSettingsTabs', 1 );
    } else if (dataStr == 'Obj2') {
      Tabs.Select( 'CurveSettingsTabs', 2 );
    } else if (dataStr == 'Refr') {
      Tabs.Select( 'CurveSettingsTabs', 3 );
    } else if (dataStr == 'Unit') {
      Tabs.Select( 'CurveSettingsTabs', 4 );
    } else if (dataStr == 'SaveRest') {
      Tabs.Select( 'CurveSettingsTabs', 5 );
    }
  }

  var dataStr = DataX.GetUrlStr( 'demo' );
  if (dataStr != '') {
    location.hash = "#App";
    var play = false;
    var pos = DataX.GetUrlInt( 'pos', 0 );
    if (pos == 0) {
      pos = DataX.GetUrlInt( 'play', 0 );
      play = pos > 0;
    }
    if (pos > 0) {
      pos--;
      setTimeout(
        function() {
          Demos.SetDemo( dataStr, play, pos );
        }, 1000
      );
    } else {
      setTimeout(
        function() {
          Demos.Play( dataStr, true );
        }, 1000
      );
    }
    return;
  }

  var dataStr = DataX.GetUrlStr( 'state' );
  if (dataStr != '') {
    location.hash = "#App";
    setTimeout(
      function() {
        DataX.FromStream( CurveApp, CurveAppMetaData, dataStr );
        UpdateAll(false);
      }, 1000
    );
    return;
  }
}


// The state links sit above this synchronous script in the parsed document.
// Keep their public function names for external callers while avoiding
// javascript: URLs and inline event attributes in the HTML entrypoint.
(function () {
  var actions = {
    GetAppState: GetAppState,
    GetAppStateUrl: GetAppStateUrl,
    SetAppState: SetAppState,
    CompactJson: CompactJson,
    ClearAppStatePanel: ClearAppStatePanel
  };
  var links = document.querySelectorAll('[data-state-action]');
  for (var i = 0; i < links.length; i++) {
    links[i].addEventListener('click', function (event) {
      event.preventDefault();
      var action = actions[this.getAttribute('data-state-action')];
      if (action) action();
    });
  }
}());
