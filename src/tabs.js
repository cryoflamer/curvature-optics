// Tabs.js (c) 2016-06-09
//
// Tab controled div visibility, made easy:
//
// <ul id="myTab" class="TabSelectors Top">
// <li class="NoTab">Label:</li>
// <li>tab0</li>
// <li>tab1</li>
// <li class="TabDefault">tab2</li>
// <li id="myButton" class="TabButton">tab2</li>
// </ul>
//
// <div id="myTabBoxes" class="TabBoxes">
//   <div>
//     box 0
//   </div>
//   <div>
//     box 1
//   </div>
//   <div>
//     box 2
//   </div>
// </div>
//
// <p>
//   <a href="javascript:Tabs.Select('myTab',0)">Reset</a>
// </p>
//
// A box may be displayed on selection of multible tabs by defining a list of tab indexes:
//
//   <div data-tabix="0,2">
//     this box is displayed if eather tab0 or tab2 are selected
//   </div>
//
// A text in the tabs line my be excludet from tab control by assigning class "NoTab", e.g. for Labels.
// A tab like button without the function of selecting boxes my be defined by assigning the class "TabButton".
// You have to install onclick Handler yourself for this kind of tab.
// A box may be excludet from tab control and always be displayed by assigning class "NoTabBox".
// Note: deeper nested divs are not treated as tab controled boxes but rather as ordinary div's.
//
// Multiple tabs/boxes sets may be used on the same page. Each set shares a common name pattern.
// If the tabs have the id="tabs1" then the corresponding boxes must have the id="tabs1Boxes".
//
// There exists a global object Tabs, which controls all behavior. It searches all html for tab classes automatically
// and does all the work. Use Tabs.Select( 'name', ix ); to select a tab per script.
//
// Data Structure: (all members are read only!)
//
// Tabs = {
//   BoxTabList: Array of BoxTab
//   IsInit: boolean
// }
// BoxTab = {
//   Name: String
//   TabContainer: TabContainer
//   BoxContainer: BoxContainer
//   ButtonDataList: Array of ButtonData
//   CurrentTab: Integer
//   DefaultTab: Integer
//   NEnabled: Integer
//   SelectHandlers: xCallbackChain
// }
// TabContainer = {
//   DomObj: DomObject
//   TabDataList: Array of TabData
// }
// BoxContainer = {
//   DomObj: DomObject
//   BoxDataList: Array of BoxData
// }
// TabData = {
//   BoxTab: BoxTab
//   DomObj: DomObject
//   Index: Integer
//   IsSelected: Boolean
//   IsEnabled: Boolean
// }
// BoxData = {
//   BoxTab: BoxTab
//   DomObj: DomObject
//   Indexes: Number or Array of Number
//   IsVisible: Boolean
//   VisiChangeHandlers: xCallbackChain
// }
// ButtonData = {
//   BoxTab: BoxTab
//   DomObj: DomObject
//   Id: String (optional)
//   Index: Integer
//   IsEnabled: Boolean
//   ClickHandlers: array of { Func: func(event); Handler: myHandler }; private
// }

var Tabs = {

  BoxTabList: [],
  IsInit: false,
  // private
  BoxDataList: [],
  SelectHandlers: [],
  VisiChangeHandlers: [],
  ButtonClickHandlers: [],
  IsSelectHandlerActive: false,

  Init: function() {
    this.BoxTabList = [];

    // install own event handlers
    this.CollectTabsAndBoxes();
    xArrForEach(
      this.BoxTabList,
      function CB_InstallTabEventHandlers_BoxTab(boxTab) {
        this.InstallTabEventHandlers( boxTab );
      },
      this
    );

    // install client handlers
    xArrForEach(
      this.SelectHandlers,
      function CB_AddSelectHandler_BoxTab(handler) {
        this.AddSelectHandler( handler.BoxTab, handler.Func );
      },
      this
    );
    this.SelectHandlers = [];

    xArrForEach(
      this.VisiChangeHandlers,
      function CB_AddVisiChangeHandler_BoxDataDomObj(handler) {
        this.AddVisiChangeHandler( handler.BoxDataChildDomObj, handler.Func );
      },
      this
    );
    this.VisiChangeHandlers = [];

    xArrForEach(
      this.ButtonClickHandlers,
      function CB_AddButtonClickHandler_BoxTab(handler) {
        this.AddButtonClickHandler( handler.BoxTab, handler.Button, handler.Func );
      },
      this
    );
    this.ButtonClickHandlers = [];

    // select default tabs
    this.IsInit = true;
    xArrForEach(
      this.BoxTabList,
      function CB_SelectDefaultTabs_BoxTab(boxTab) {
        this.Select( boxTab );
      },
      this
    );
  },

  Select: function( boxTab, ix ) {

    function containesIndex( indexes, ix ) {
      if (xNum(indexes)) return (indexes == ix);
      // returns true if ix is in list indexes
      var ix = xArrFindIndex(
        indexes,
        function CB_Compare_Index(index) {
          return index == ix;
        }
      );
      return ix >= 0;
    }

    if (!(boxTab = this.FindBoxTab(boxTab))) return;
    ix = xDefNum( ix, boxTab.DefaultTab );

    // set state of tab ix to selected and reset states of all other tabs
    var tabDataList = boxTab.TabContainer.TabDataList;
    var nTabs = tabDataList.length;
    if (nTabs == 0 || ix < 0 || ix >= nTabs) return;
    for ( var i = 0; i < nTabs; i++ ) {
      var tab = tabDataList[i];
      if ( i == ix ) {
        xAddClass( tab.DomObj, 'TabSelected' );
        tab.IsSelected = true;
      } else {
        xRemoveClass( tab.DomObj, 'TabSelected' );
        tab.IsSelected = false;
      }
    }
    boxTab.CurrentTab = ix;

    // display all boxes where indexes contains ix and hide all other boxes
    var boxDataList = boxTab.BoxContainer.BoxDataList;
    var nBoxes = boxDataList.length;
    for ( var i = 0; i < nBoxes; i++ ) {
      var boxData = boxDataList[i];
      if ( containesIndex( boxData.Indexes, ix ) ) {
        xRemoveClass( boxData.DomObj, 'TabHide' );
        boxData.IsVisible = true;
      } else {
        xAddClass( boxData.DomObj, 'TabHide' );
        boxData.IsVisible = false;
      }
    }
    // prevent recursiv call of select handlers
    if (this.IsSelectHandlerActive) return;
    this.IsSelectHandlerActive = true;
    try {
      boxTab.SelectHandlers.Call( boxTab );
    } catch(e) { }
    this.IsSelectHandlerActive = false;

    // finally call visi change handlers for all tab boxes
    xArrForEach(
      boxTab.BoxContainer.BoxDataList,
      function CB_Call_VisiChangeHandler_BoxData(boxData) {
        try {
          boxData.VisiChangeHandlers.Call( boxData );
        } catch(e) { }
      }
    );

  },

  ForEachBoxTab: function( func ) {
    // calls func( BoxTab ) for each BoxTab
    xArrForEach( this.BoxTabList, func );
  },

  ForEachTab: function( boxTab, func ) {
    // calls func( BoxTab, ix ) for each tab on BoxTab
    // require type of boxTab is BoxTab
    xArrForEach(
      boxTab.TabContainer.TabDataList,
      function CB_Call_Func_TabData(tabData,i) {
        func( boxTab, i );
      }
    );
  },

  AddSelectHandler: function( boxTab, func ) {
    // func( BoxTab )
    if (!this.IsInit) {
      // handler gets installed later in init()
      this.SelectHandlers.push( { BoxTab: boxTab, Func: func } );
      return;
    }
    if (boxTab == null) {
      this.ForEachBoxTab(
        function CB_AddSelectHandler_BoxTab( boxTab ) {
          boxTab.SelectHandlers.Add( func );
        }
      );
      return;
    }
    if (!(boxTab = this.FindBoxTab(boxTab))) return;
    boxTab.SelectHandlers.Add( func );
  },

  RemoveSelectHandler: function( boxTab, func ) {
    if (!this.IsInit) {
      // remove handlers from this.SelectHandlers list
      xArrRemove(
        this.SelectHandlers,
        function CB_Compare_BoxTab_Func(handler) {
          return (handler.BoxTab == boxTab && handler.Func == func);
        }
      );
      return;
    }
    if (boxTab == null) {
      this.ForEachBoxTab(
        function CB_RemoveSelectHandler_BoxTab( boxTab ) {
          boxTab.SelectHandlers.Remove( func );
        }
      );
      return;
    }
    if (!(boxTab = this.FindBoxTab(boxTab))) return;
    boxTab.SelectHandlers.Remove( func );
  },

  AddVisiChangeHandler: function( boxDataChildDomObj, func ) {
    // func( BoxData )
    if (!this.IsInit) {
      // handler gets installed later in init()
      this.VisiChangeHandlers.push( { BoxDataChildDomObj: boxDataChildDomObj, Func: func } );
      return;
    }
    var boxData = this.FindBoxDataByChildDomObj( boxDataChildDomObj );
    if (boxData) boxData.VisiChangeHandlers.Add( func );
  },

  RemoveVisiChangeHandler: function( boxDataChildDomObj, func ) {
    // func( BoxData )
    if (!this.IsInit) {
      // remove handlers from this.VisiChangeHandlers list
      xArrRemove(
        this.VisiChangeHandlers,
        function CB_Compare_BoxDataDomObj_Func(handler) {
          return (handler.BoxDataChidDomObj == boxDataChildDomObj && handler.Func == func);
        }
      );
      return;
    }
    var boxData = this.FindBoxDataByChildDomObj( boxDataChildDomObj );
    if (boxData) boxData.VisiChangeHandlers.Remove( func );
  },

  FindBoxDataByChildDomObj: function( domObj ) {
    // returns BoxData where domObj is a child of that Box
    // find parent with class 'TabBoxes'
    while (domObj) {
      var lastDom = domObj;
      domObj = xParent( domObj );
      if (xHasClass( domObj, 'TabBoxes' )) {
        return this.FindBoxDataByDomObj( lastDom );
      }
    }
    return null;
  },

  FindBoxDataByDomObj: function( domObj ) {
    // requires domObj is a BoxData.DomObj; returns that BoxData
    var nBoxDatas = this.BoxDataList.length;
    for (var i = 0; i < nBoxDatas; i++) {
      var boxData = this.BoxDataList[i];
      if (boxData.DomObj == domObj) return boxData;
    }
    return null;
  },

  SelectNext: function( boxTab, wrap ) {
    // only selects enabled tab
    if (!(boxTab = this.FindBoxTab(boxTab))) return;
    var nextIx = this.GetNextEnabled( boxTab, wrap );
    if (nextIx != -1) this.Select( boxTab, nextIx );
  },

  SelectPrev: function( boxTab, wrap ) {
    // only selects enabled tab
    if (!(boxTab = this.FindBoxTab(boxTab))) return;
    var nextIx = this.GetPrevEnabled( boxTab, wrap );
    if (nextIx != -1) this.Select( boxTab, nextIx );
  },

  IsSelected: function( boxTab, ix ) {
    return this.GetCurrent(boxTab) == ix;
  },

  IsEnabled: function( boxTab, ix ) {
    var tabData = this.GetTabData( boxTab, ix );
    if (!tabData) return false;
    return tabData.IsEnabled;
  },

  SetEnabled: function( boxTab, ix, enabled, select ) {
    // if current selected tahbis disabled, select as follow:
    // select: undefined or 0 -> keep selection; -1 -> select default tab; 1 -> select next enabled
    // if ix = -1 or undefined set enabled all tabs
    if (!xDef(boxTab)) {
      this.ForEachBoxTab(
        function CB_SetEnabled_BoxTab(boxTab) {
          Tabs.SetEnabled(boxTab,-1,enabled);
        }
      );
      return;
    }
    if (!(boxTab = this.FindBoxTab(boxTab))) return;
    ix = xDefNum( ix, -1 );
    if (ix == -1) {
      this.ForEachTab(
        boxTab,
        function CB_SetEnabled_BoxTab(boxTab,ix) {
          Tabs.SetEnabled(boxTab,ix,enabled,0);
        }
      );
      return;
    }
    var tabData = this.GetTabData( boxTab, ix );
    if (!tabData) return;
    enabled = xDefBool( enabled, true );
    select = xDefNum( select, 0 );
    if (enabled) {
      if (tabData.IsEnabled) return;
      xAddClass( tabData.DomObj, 'TabEnabled' );
      tabData.IsEnabled = true;
      tabData.BoxTab.NEnabled++;
    } else {
      if (!tabData.IsEnabled) return;
      xRemoveClass( tabData.DomObj, 'TabEnabled' );
      tabData.IsEnabled = false;
      tabData.BoxTab.NEnabled--;
      if (ix == boxTab.CurrentTab && select >= 0) {
        if (select == 0) {
          this.Select( boxTab ); // default
        } else {
          this.SelectNext( boxTab, true );
        }
      }
    }
  },

  ToggleEnabled: function( boxTab, ix ) {
    if (!(boxTab = this.FindBoxTab(boxTab))) return false;
    var enabled = !this.IsEnabled(boxTab,ix);
    this.SetEnabled( boxTab, ix, enabled );
    return enabled;
  },

  GetNEnabled: function( boxTab ) {
    return (boxTab = this.FindBoxTab(boxTab)) ? boxTab.NEnabled : 0;
  },

  GetNextEnabled: function( boxTab, wrap ) {
    if (!(boxTab = this.FindBoxTab(boxTab)) || boxTab.NEnabled == 0) return -1;
    wrap = xDefBool( wrap, true );
    var currTab = boxTab.CurrentTab;
    var tabDataList = boxTab.TabContainer.TabDataList;
    if (boxTab.NEnabled == 1 && tabDataList[currTab].IsEnabled) return wrap ? currTab : -1;
    var nTabDatas = tabDataList.length;
    var ix = currTab + 1;
    while (ix < nTabDatas && !tabDataList[ix].IsEnabled) ix++;
    if (ix < nTabDatas) return ix;
    if (!wrap) return -1;
    // assert( boxTab.NEnabled > 0 )
    ix = 0;
    while (!tabDataList[ix].IsEnabled) ix++;
    return ix;
  },

  GetPrevEnabled: function( boxTab, wrap ) {
    if (!(boxTab = this.FindBoxTab(boxTab)) || boxTab.NEnabled == 0) return -1;
    wrap = xDefBool( wrap, true );
    var currTab = boxTab.CurrentTab;
    var tabDataList = boxTab.TabContainer.TabDataList;
    if (boxTab.NEnabled == 1 && tabDataList[currTab].IsEnabled) return wrap ? currTab : -1;
    var ix = currTab - 1;
    while (ix >= 0 && !tabDataList[ix].IsEnabled) ix--;
    if (ix >= 0) return ix;
    if (!wrap) return -1;
    // assert( boxTab.NEnabled > 0 )
    ix = tabDataList.length - 1;
    while (!tabDataList[ix].IsEnabled) ix--;
    return ix;
  },

  Reset: function( boxTab ) {
    // select default for boxTab. if boxTab is not defined then default tabs for all BoxTabs are slected
    if (!xDef(boxTab)) {
      this.ForEachBoxTab(
        function CB_SelectDefault_BoxTab(boxTab) {
          Tabs.Select(boxTab);
        }
      );
    } else {
      this.Select( boxTab );
    }
  },

  GetCurrent: function( boxTab ) {
    return (boxTab = this.FindBoxTab(boxTab)) ? boxTab.CurrentTab : 0;
  },

  GetDefault: function( boxTab ) {
    return (boxTab = this.FindBoxTab(boxTab)) ? boxTab.DefaultTab : 0;
  },

  GetTabDomObj: function( boxTab, ix ) {
    var tab = this.GetTabData( boxTab, ix );
    return tab ? tab.DomObj : null;
  },

  GetTabData: function( boxTab, ix ) {
    if (!(boxTab = this.FindBoxTab(boxTab))) return null;
    var tabDataList = boxTab.TabContainer.TabDataList;
    if (ix < 0 || ix >= tabDataList.length) return null;
    return tabDataList[ix];
  },

  GetBoxDomObj: function( boxTab, ix ) {
    var box = this.GetBoxData( boxTab, ix );
    return box ? box.DomObj : null;
  },

  GetBoxData: function( boxTab, ix ) {
    if (!(boxTab = this.FindBoxTab(boxTab))) return null;
    var boxDataList = boxTab.BoxContainer.BoxDataList;
    if (ix < 0 || ix >= boxDataList.length) return null;
    return boxDataList[ix];
  },

  GetNTabs: function( boxTab ) {
    return (boxTab = this.FindBoxTab(boxTab)) ? boxTab.TabContainer.TabDataList.length : 0;
  },

  SetText: function( boxTab, ix, text ) {
    var tabDom;
    if (!(tabDom = this.GetTabDomObj( boxTab, ix ))) return;
    xInnerHTML( tabDom, text );
  },

  GetText: function( boxTab, ix ) {
    var tabDom;
    if (!(tabDom = this.GetTabDomObj( boxTab, ix ))) return '';
    return xInnerHTML( tabDom );
  },

  GetNBoxes: function( boxTab ) {
    return (boxTab = this.FindBoxTab(boxTab)) ? boxTab.BoxContainer.BoxDataList.length : 0;
  },

  IsBoxVisible: function( boxTab, ix ) {
    var boxData = this.GetBoxData( boxTab, ix );
    return boxData ? boxData.IsVisible : false;
  },

  FindBoxTab: function( name ) {
    // if name is a already a boxData, then skip searching and return it
    if (!xStr(name)) return name;
    var boxTab = xArrFind(
      this.BoxTabList,
      function CB_Compare_Name(boxTab){
        return boxTab.Name == name;
      }
    );
    return boxTab ? boxTab : null;
  },

  FindButtonData: function( boxTab, button ) {
    // button: Index as Integer or Id as String
    if (!(boxTab = this.FindBoxTab(boxTab))) return null;
    var nButtons = boxTab.ButtonDataList.length;
    if (xNum(button)) {
      if (button < 0 || button >= nButtons) return null;
      return boxTab.ButtonDataList[button];
    }
    var buttonData = xArrFind(
      boxTab.ButtonDataList,
      function CB_Compare_Id(buttonData){
        return (buttonData.Id != '' && buttonData.Id == button);
      }
    );
    return buttonData ? buttonData : null;
  },

  IsButtonDataOk: function( buttonData ) {
    return (xObj(buttonData) && xDef(buttonData.BoxTab));
  },

  ForEachButton: function( boxTab, func ) {
    // calls func( ButtonData ) for each button of boxTab
    // require type of boxTab is BoxTab
    xArrForEach( boxTab.ButtonDataList, func );
  },

  AddButtonClickHandler: function( boxTab, button, func ) {
    // or AddButtonClickHandler( ButtonData, func )
    // button: Index as Integer or Id as String
    // if boxTab = null, func is installed for all buttons of all BoxTabs
    // if button = -1, func is installed for all buttons of boxTab
    // func( ButtonData, xEvent )

    if (!this.IsInit) {
      // handler gets installed later in init()
      this.ButtonClickHandlers.push( { BoxTab: boxTab, Button: button, Func: func } );
      return this;
    }

    if (boxTab == null) {
      // install handler on all BoxTabs and all buttons
      this.ForEachBoxTab(
        function CB_AddButtonClickHandler_BoxTab(boxTab) {
          Tabs.AddButtonClickHandler(boxTab,-1,func);
        }
      );
      return this;
    }

    if (this.IsButtonDataOk(boxTab)) {
      // AddButtonClickHandler( ButtonData, func ) -> -> f( buttonData.BoxTab, buttonData.Index, func )
      return this.AddButtonClickHandler( boxTab.BoxTab, boxTab.Index, button );
    }

    if (!(boxTab = this.FindBoxTab(boxTab))) {
      // boxTab is String(Name of BoxTab) and Name is not found
      return this;
    }

    if (xNum(button) && button == -1) {
      // install handler for all buttons of boxTab
      this.ForEachButton(
        boxTab,
        function CB_AddClickHandler_Button(buttonData) {
          Tabs.AddButtonClickHandler(buttonData,func);
        }
      );
      return this;
    }

    // return if no buttonData found
    var buttonData = this.FindButtonData( boxTab, button );
    if (!buttonData) return this;

    // install button click handler
    var handler = function CB_Call_ClickHandler_Button(evnt) {
      if (buttonData.IsEnabled) {
        try {
          func( buttonData, evnt );
        } catch(e) {}
      }
    }
    buttonData.ClickHandlers.push( { Func: func, Handler: handler } );
    xAddEvent( buttonData.DomObj, 'click', handler );
    return this;
  },

  RemoveButtonClickHandler: function( boxTab, button, func ) {
    // or RemoveButtonClickHandler( buttonData, func )
    // boxTab: BoxTab or String(BoxTabName) or null
    // buttonData: ButtonData
    // button: Integer
    // func: Function(ButtonData,xEvent)

    if (!this.IsInit) {
      // remove handler from this.ButtonClickHandlers list
      xArrRemove(
        this.ButtonClickHandlers,
        function CB_Compare_BoxTab_Button_Func(handler) {
          return (handler.BoxTab == boxTab && handler.Button == button && handler.Func == func);
        }
      );
      return this;
    }

    if (boxTab == null) {
      // remove func for all BoxTabs and all buttons
      this.ForEachBoxTab(
        function CB_RemoveButtonClickHandler_BoxTab(boxTab) {
          Tabs.RemoveButtonClickHandler(boxTab,-1,func);
        }
      );
      return this;
    }

    if (this.IsButtonDataOk(boxTab)) {
      // RemoveButtonClickHandler( buttonData, func ) -> f( buttonData.BoxTab, buttonData.Index, func )
      return this.RemoveButtonClickHandler( boxTab.BoxTab, boxTab.Index, button );
    }

    if (!(boxTab = this.FindBoxTab(boxTab))) {
      // boxTab is String(Name) and Name not found
      return this;
    }

    // assert typeOf(boxTab) == BoxTab
    if (xNum(button) && button == -1) {
      // remove func from all buttons of boxTab
      this.ForEachButton(
        boxTab,
        function CB_RemoveClickHandler_Button(buttonData) {
          Tabs.RemoveButtonClickHandler(buttonData,func);
        }
      );
      return this;
    }

    var buttonData = this.FindButtonData( boxTab, button );
    if (!buttonData) return this;
    // find func in buttonData.ClickHandlers and remove associated private handler
    xArrRemove(
      buttonData.ClickHandlers,
      function CB_RemoveClickHandler_ButtonDomObj(handler) {
        var hit = (handler.Func == func);
        if (hit) xRemoveEvent( buttonData.DomObj, 'click', handler.Handler );
        return hit;
      }
    );
    return this;
  },

  IsButtonEnabled: function( boxTab, button ) {
    // button: Index as Integer or Id as String
    var buttonData = this.FindButtonData( boxTab, button );
    return buttonData ? buttonData.IsEnabled : false;
  },

  SetButtonEnabled: function( boxTab, button, enabled ) {
    // or SetButtonEnabled( ButtonData, enabled )
    // button: Index as Integer or Id as String
    if (!xDef(boxTab) || boxTab == null) {
      this.ForEachBoxTab(
        function CB_SetEnabled_BoxTab(boxTab) {
          Tabs.SetButtonEnabled(boxTab,-1,enabled);
        }
      );
      return this;
    }
    if (this.IsButtonDataOk(boxTab)) return this.SetButtonEnabled( boxTab.BoxTab, boxTab.Index, button );
    if (!(boxTab = this.FindBoxTab(boxTab))) return this;
    if (xNum(button) && button == -1) {
      this.ForEachButton(
        boxTab,
        function CB_SetEnabled_Button(buttonData) {
          Tabs.SetButtonEnabled(buttonData,enabled);
        }
      );
      return this;
    }
    var buttonData = this.FindButtonData( boxTab, button );
    if (!buttonData) return this;
    enabled = xDefBool( enabled, true );
    if (enabled) {
      if (buttonData.IsEnabled) return this;
      xAddClass( buttonData.DomObj, 'TabEnabled' );
      buttonData.IsEnabled = true;
    } else {
      if (!buttonData.IsEnabled) return this;
      xRemoveClass( buttonData.DomObj, 'TabEnabled' );
      buttonData.IsEnabled = false;
    }
    return this;
  },

  ToggleButtonEnabled: function( boxTab, button ) {
    // or ToggleButtonEnabled( ButtonData )
    if (this.IsButtonDataOk(boxTab)) return this.ToggleButtonEnabled( boxTab.BoxTab, boxTab.Index );
    if (!(boxTab = this.FindBoxTab(boxTab))) return false;
    var enabled = !this.IsButtonEnabled(boxTab,button)
    this.SetButtonEnabled( boxTab, button, enabled );
    return enabled;
  },

  GetButtonDomObj: function( boxTab, button ) {
    // button: Index as Integer or Id as String
    var buttonData = this.FindButtonData( boxTab, button );
    return buttonData ? buttonData.DomObj : null;
  },

  GetButtonId: function( boxTab, button ) {
    // button: Index as Integer or Id as String
    var buttonData = this.FindButtonData( boxTab, button );
    return buttonData ? buttonData.Id : '';
  },

  GetButtonIndex: function( boxTab, buttonId ) {
    var buttonData = this.FindButtonData( boxTab, buttonId );
    return buttonData ? buttonData.Index : -1;
  },

  GetButtonText: function( boxTab, button ) {
    // or GetButtonText( ButtonData )
    // button: Index as Integer or Id as String
    if (this.IsButtonDataOk(boxTab)) return this.GetButtonText( boxTab.BoxTab, boxTab.Index );
    var buttonData = this.FindButtonData( boxTab, button );
    return buttonData ? xInnerHTML(buttonData.DomObj) : '';
  },

  SetButtonText: function( boxTab, button, text ) {
    // or SetButtonText( ButtonData, text )
    // button: Index as Integer or Id as String
    if (this.IsButtonDataOk(boxTab)) return this.SetButtonText( boxTab.BoxTab, boxTab.Index, button );
    var buttonData = this.FindButtonData( boxTab, button );
    if (buttonData) xInnerHTML( buttonData.DomObj, text );
    return this;
  },

  // Private Functions:

  InstallTabEventHandlers: function( boxTab ) {
    function newClickHandlerForTab( ix, boxTab, tabsObj ) {
      return function(e) {
        if (tabsObj.IsEnabled( boxTab, ix )) {
          tabsObj.Select( boxTab, ix );
        }
      };
    }
    // add click event handlers to tabs and enable them
    xArrForEach(
      boxTab.TabContainer.TabDataList,
      function CB_AddClickHandler_TabDomObj(tabData,i) {
        xAddEvent( tabData.DomObj, 'click', newClickHandlerForTab( i, boxTab, this ) );
        if (tabData.IsEnabled) {
          xAddClass( tabData.DomObj, 'TabEnabled' );
        }
      },
      this
    );
  },

  CollectTabsAndBoxes: function() {
    var tabContainerDomList = xGetByClass( 'TabSelectors' );
    var nTabContainerDoms = tabContainerDomList.length;
    for (var i = 0; i < nTabContainerDoms; i++) {
      var boxTab = this.CreateBoxTab( tabContainerDomList[i] );
      if (boxTab) this.BoxTabList.push( boxTab );
    }
  },

  CreateBoxTab: function( tabContainerDom ) {
    var name = tabContainerDom.id;
    if (!name || name == '') return null;
    var boxContainerDom = xGet( name + 'Boxes' );
    // BoxTab constructor
    var boxTab = {
      Name: name,
      CurrentTab: 0,
      DefaultTab: -1,
      NEnabled: 0,
      SelectHandlers: new xCallbackChain(),
      // TabContainer constructor
      TabContainer: {
        DomObj: tabContainerDom,
        TabDataList: []
      },
      // BoxContainer constructor
      BoxContainer: {
        DomObj: boxContainerDom,
        BoxDataList: []
      },
      ButtonDataList: []
    };
    this.InitBoxDataList( boxTab );
    this.InitTabDataList( boxTab );
    this.InitButtonDataList( boxTab );
    return boxTab;
  },

  InitButtonDataList: function( boxTab ) {
    var tabContainer = boxTab.TabContainer;
    var buttonDomList = this.CollectButtonDoms( tabContainer.DomObj );
    var nButtonDoms = buttonDomList.length;
    if (nButtonDoms == 0) return;
    for (var i = 0; i < nButtonDoms; i++) {
      var buttonDom = buttonDomList[i];
      var isEnabled = xHasClass( buttonDom, 'TabEnabled' );
      var id = xDefStr( buttonDom.id, '' );
      // ButtonData constructor
      var buttonData = {
        BoxTab: boxTab,
        DomObj: buttonDom,
        Id: id,
        Index: i,
        IsEnabled: isEnabled,
        ClickHandlers: []
      };
      boxTab.ButtonDataList.push( buttonData );
    }
  },

  InitTabDataList: function( boxTab ) {
    var tabContainer = boxTab.TabContainer;
    var tabDomList = this.CollectTabDoms( tabContainer.DomObj );
    var nTabDoms = tabDomList.length;
    if (nTabDoms == 0) return;
    for (var i = 0; i < nTabDoms; i++) {
      var tabDom = tabDomList[i];
      // check for default tab
      var isDefault = xHasClass( tabDom, 'TabDefault' );
      if (boxTab.DefaultTab == -1 && isDefault) boxTab.DefaultTab = i;
      // check for disabled tab
      var disabled = xHasClass( tabDom, 'TabDisabled' );
      xRemoveClass( tabDom, 'TabDisabled' );
      if (!disabled) boxTab.NEnabled++;
      // TabData constructor
      var tabData = {
        BoxTab: boxTab,
        DomObj: tabDom,
        Index: i,
        IsSelected: false,
        IsEnabled: !disabled
      };
      tabContainer.TabDataList.push( tabData );
    }
    if (boxTab.DefaultTab == -1) boxTab.DefaultTab = 0;
  },

  CollectTabDoms: function( tabContainerDom ) {
    // collects all <li> elements under tabContainerDom that don't have the class 'NoTab' or 'TabButton'
    var liDomList = xGetByTag( 'li', tabContainerDom );
    var tabDomList = [];
    var nLiDoms = liDomList.length;
    for ( var i = 0; i < nLiDoms; i++ ) {
      var liDom = liDomList[i];
      if (!xHasClass( liDom, 'NoTab' ) && !xHasClass( liDom, 'TabButton' )) tabDomList.push( liDom );
    }
    return tabDomList;
  },

  CollectButtonDoms: function( tabContainerDom ) {
    // collects all <li> elements under tabContainerDom that have the class 'TabButton'
    var liDomList = xGetByTag( 'li', tabContainerDom );
    var buttonDomList = [];
    var nLiDoms = liDomList.length;
    for ( var i = 0; i < nLiDoms; i++ ) {
      var liDom = liDomList[i];
      if (xHasClass( liDom, 'TabButton' )) buttonDomList.push( liDom );
    }
    return buttonDomList;
  },

  InitBoxDataList: function( boxTab ) {
    function getTabIndexes( indexStr ) {
      // '1, 2, 3' -> [ 1, 2, 3 ]
      var ixStrList = indexStr.split(',');
      var nIxStr = ixStrList.length;
      var indexList = [];
      for (var i = 0; i < nIxStr; i++) {
        indexList.push( parseInt( ixStrList[i] ) );
      }
      return indexList;
    }
    var boxContainer = boxTab.BoxContainer;
    if (!boxContainer.DomObj) return;
    var boxDomList = this.CollectBoxDoms( boxContainer.DomObj );
    var nBoxDoms = boxDomList.length;
    if (nBoxDoms == 0) return false;
    for (var i = 0; i < nBoxDoms; i++) {
      var boxDom = boxDomList[i];
      // check wether a index list is defined in data-tabix attribute of boxDom
      var tabixDataset = xDataset( boxDom, 'tabix' );
      var indexes = tabixDataset ? getTabIndexes(tabixDataset) : i;
      // BoxData constructor
      var boxData = {
        BoxTab: boxTab,
        DomObj: boxDom,
        Indexes: indexes,
        IsVisible: false,
        VisiChangeHandlers: new xCallbackChain()
      };
      boxContainer.BoxDataList.push( boxData );
      this.BoxDataList.push( boxData );
    }
  },

  CollectBoxDoms: function( boxContainerDom ) {
    // collects all direct child <div> elements under boxContainerDom that don't have the class 'NoTabBox'
    var divDomList = xGetByTag( 'div', boxContainerDom );
    var boxDomList = [];
    var nDivDoms = divDomList.length;
    for (var i = 0; i < nDivDoms; i++) {
      var divDom = divDomList[i];
      if ((xParent(divDom) == boxContainerDom) && !xHasClass(divDom,'NoTabBox')) boxDomList.push( divDom );
    }
    return boxDomList;
  },

};

xOnDomReady( function CB_Init_Tabs(){ Tabs.Init(); } );
