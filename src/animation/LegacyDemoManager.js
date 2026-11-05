/* Instance-scoped Legacy demonstration manager. The authored demos are still
 * registered by CurvatureDemos.js, but the manager itself does not read the
 * global Demos, CurveApp, Tabs, or DOM. Every dependency is supplied by a port.
 * This keeps the historical animation/state definitions unchanged and allows
 * independent managers to coexist in a single JavaScript realm. */
(function(root){
  'use strict';
  var required=['isString','defaultString','defaultNumber','addButtonClickHandler',
    'addClass','removeClass','setHTML','createAnimation','getModel',
    'updateAll','applyState','showInfo','initCustom'];
  function create(ports){
    if(!ports||required.some(function(name){return typeof ports[name]!=='function';}))
      throw new TypeError('Legacy Demos manager requires explicit model, UI, and animation ports');
    var manager = {
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
          ports.initCustom();
        } catch(e) {}
        // installed demo button click handlers
        var nDemos = this.DemoList.length;
        for (var i = 0; i < nDemos; i++) {
          this.AddButtonClickHandler( i );
        }
      },

      AddButtonClickHandler: function( id ) {
        // id as DemoList index or demo name
        if (ports.isString(id)) id = this.Find(id);
        var demoName = this.DemoList[id].Name;
        ports.addButtonClickHandler( 'CurveDemosTabs', demoName + 'Button',
          function( buttonData, event ) {
            if (manager.IsCurrDemoName(demoName) && manager.IsPlaying()) {
              manager.Next( false, !manager.IsTargetIsEndPos() );
            } else {
              manager.Play( demoName, true );
            }
          }
        );
      },

      SetButtonText: function( text, button ) {
        button = ports.defaultString( button, 'Custom' );
        var buttonName = button + 'Button';
        ports.removeClass( buttonName, 'TabHide' );
        ports.setHTML( buttonName, text );
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
          ports.removeClass( this.LastDemo.Name + 'Button', 'TabActive' );
          this.LastDemo = null;
        }
        if (this.CurrDemo) {
          ports.addClass( 'BackButton', 'TabEnabled' );
          ports.addClass( 'PlayButton', 'TabEnabled' );
          ports.addClass( 'ForwButton', 'TabEnabled' );
          ports.addClass( 'CountButton', 'TabEnabled' );
          if (this.IsPlaying()) {
            ports.setHTML( 'PlayButton', 'Stop' );
            ports.addClass( 'PlayButton', 'TabActive' );
          } else {
            ports.setHTML( 'PlayButton', 'Play' );
            ports.removeClass( 'PlayButton', 'TabActive' );
          }
          var pos = this.GetCurrPos() + 1;
          if (this.IsEndPos()) {
            pos = 'end';
          } else {
            pos = pos.toFixed(0);
          }
          ports.setHTML( 'CountButton', pos );
          ports.addClass( this.CurrDemo.Name + 'Button', 'TabActive' );
        } else {
          if (this.SusDemo) {
            ports.setHTML( 'PlayButton', 'Resume' );
            ports.addClass( 'PlayButton', 'TabEnabled' );
            ports.addClass( 'PlayButton', 'TabActive' );
            ports.setHTML( 'CountButton', (this.SusState+1).toFixed(0) );
          } else {
            ports.setHTML( 'PlayButton', 'Play' );
            ports.setHTML( 'CountButton', 'x' );
            ports.removeClass( 'PlayButton', 'TabEnabled' );
          }
          ports.removeClass( 'CountButton', 'TabEnabled' );
          ports.removeClass( 'BackButton', 'TabEnabled' );
          ports.removeClass( 'ForwButton', 'TabEnabled' );
        }
      },

      New: function( name, moreInfos ) {
        // returns ModelAnimation
        moreInfos = ports.defaultString( moreInfos, '' );
        var anim = ports.createAnimation( {
          ModelRef: ports.getModel(),
          OnModelChange: function(){ ports.updateAll(false); },
          PauseTime: 0,
          OnAfterStateChange: function( anim, state ) { manager.UpdateDemoPanels(); },
          OnStopPlaying: function( anim, state ){ manager.UpdateDemoPanels(); }
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
            if (manager.CurrDemo && manager.CurrDemo.Anim == anim) {
              ports.applyState( jsonState );
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
        if (!ports.isString(name)) {
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
        pos = ports.defaultNumber( pos, 0 );
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
        ports.showInfo( this.CurrDemo.More );
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
    return manager;
  }
  root.CurvatureLegacyDemoManager={create:create};
}(typeof window==='undefined'?globalThis:window));
