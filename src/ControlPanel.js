// ControlPanel.js (C) Walter Bislin; walter.bislins.ch; Juli 2013 bis Juni 2014
//
// description and download:
//  http://walter.bislins.ch/doku/ControlPanel
//
// dependecies:
//  x.js
//  NumFormatter.js
//
// History:
//  2016-10-03: Fixed: Changing Units via UnitsRef causes UpdateLayout() calls to update size of sliders
//  2016-09-01: New: AddBeforeInitHandler()
//  2016-08-20: First complete redesigned Version based on TabForm module
// ############# - add a # for each new version

// Global Object to manage all ControlPanels

var ControlPanels = {
  Counter: 0,
  PanelList: [],
  PanelInitList: [],
  BeforeInitHandlers: new xCallbackChain(),

  AddBeforeInitHandler: function( func ) {
    // func()
    this.BeforeInitHandlers.Add( func );
  },

  NewPanel: function( aParams ) {
    return new ControlPanel( aParams );
  },

  NewSliderPanel: function( aParams ) {
    // aParams = {
    //   ValuePos = string; default = 'left'; 'left' or 'right'
    //   see NewPanel for other parameters
    // }
    // sets ControlPanel.NCols = 2 if not defined else 2 * aParams.NCols
    // sets PanelFormat to ControlPanel.PanelFormat + 'Slider Left' or 'Slider Right'
    // sets ControlPanel.ValuePos = aParams.ValuePos
    //
    var panel = this.NewPanel( aParams );
    panel.NCols = xNum(aParams.NCols) ? aParams.NCols * 2 : 2;
    panel.ValuePos = xDefStr( aParams.ValuePos, 'left' );
    if (panel.PanelFormat != '') panel.PanelFormat += ' ';
    if (panel.ValuePos == 'left') {
      panel.PanelFormat += 'Slider Right';
    } else {
      panel.PanelFormat += 'Slider Left';
    }
    return panel;
  },

  ResetButton: function( ) {
    return this.SimpleButton( 'Reset', 'Reset()', 'Black', 'Small', false, false );
  },

  ResetButtonR: function( ) {
    return this.SimpleButton( 'Reset', 'Reset()', 'Black', 'Small', true, false );
  },

  SmallButtonR: function( text, code, color ) {
    return this.SimpleButton( text, code, color, 'Small', true, false );
  },

  SmallButton: function( text, code, color ) {
    return this.SimpleButton( text, code, color, 'Small', false, false );
  },

  SimpleButton: function( text, code, color, size, right, margin ) {
    var params = { };
    params.Text = xDefStr( text, 'Reset' );
    params.Code = xDefStr( code, 'Reset()' );
    params.Color = xDefStr( color, 'Black' );
    if (xStr(size)) params.Size = size;
    if (xBool(right)) params.Right = right;
    if (xBool(margin)) params.Margin = margin;
    return this.Button( params );
  },

  Button: function( params ) {
    // usage: panel.AddHeader( { Text: ControlPanels.Button( { Text: 'Action', Code: 'DoAction(params)', ... } ), ... } );
    // params =
    //  Text: string; button caption
    //  Code: string; javascript code to execute
    //  Color: string; optional; default = 'Black'; Valid = 'Black', 'Blue', 'Green', 'Red'
    //  Size: string; optional; default = '' (Normal); Valid = 'Small', 'Big', '' = Normal
    //  Right: boolean; optional; default = false; left or right position of button on parent element
    //  Margin: boolean; optional; default = true; top/bottom margin to separate stacked buttons
    //  Class: string; optional; default = ''; additional classes for a-element

    var text = xDefStr( params.Text, 'Text' );
    var code = xDefStr( params.Code, 'alert("no action defined")' );
    var color = xDefStr( params.Color, 'Black' );
    var size = xDefStr( params.Size, '' );
    var right = xDefBool( params.Right, false );
    var margin = xDefBool( params.Margin, true );
    var cls = xDefStr( params.Class, '' );

    var aStyle = '';
    var aClass = '';
    var spanClass = 'lbtn';
    var spanStyle = '';
    if (right)       aStyle     = ' style="float:right;"';
    if (cls != '')   aClass     = ' class="' + cls + '"';
    if (color != '') spanClass += ' lbtn' + color;
    if (size != '')  spanClass += ' lbtn' + size;
    if (!margin)     spanStyle += ' style="margin-bottom:0 !important;margin-top:0 !important;"';
    if (spanClass != '' ) spanClass = ' class="' + spanClass + '"';

    return '<a href="javascript:' + code + '"' + aClass + aStyle + '><span' + spanClass + spanStyle + '>' + text + '</span></a>';
  },

  Update: function( panelRefs ) {
    this.ForEachPanel( function CB_UpdatePanel(p){ p.Update(); }, panelRefs );
  },

  UpdateLayout: function( panelRefs ) {
    this.ForEachPanel( function CB_UpdatePanelLayout(p){ p.UpdateLayout(); }, panelRefs );
  },

  Invalidate: function( panelRefs, updateGui ) {
    this.ForEachPanel( function CB_InvalidatePanel(p){ p.Invalidate(updateGui); }, panelRefs );
  },

  Reset: function( panelRefs, callOnModelChaned ) {
    this.ForEachPanel( function CB_ResetPanel(p){ p.Reset(callOnModelChaned); }, panelRefs );
  },

  ConnectDom: function( panelRefs ) {
    // reconnect panels to Dom objects after they are changed e.g. by xInnerHtml()
    this.ForEachPanel( function CB_InitPanel(p){ p.Init(); }, panelRefs );
  },

  Init: function( panelRefs, forceGetDefault ) {
    // call this function if panels AutoInit=false or to reinitialize some panels.
    // Because Init is usually called automatically, it suffices to call
    // ConnectDom() to reconnect panels to dynamically changed panel-html
    this.ForEachPanel( function CB_InitPanel(p){ p.Init(forceGetDefault); }, panelRefs );
  },

  IsDisplayed: function( panelName ) {
    var panel = this.Get( panelName );
    return panel ? panel.IsDisplayed() : false;
  },

  IsEnabled: function( panelName, fieldName ) {
    var panel = this.Get( panelName );
    return panel ? panel.IsEnabled( fieldName ) : true;
  },

  SetEnabled: function( panelRef, fieldName, enabled ) {
    fieldName = xDefStr( fieldName, '' );
    enabled = xDefBool( enabled, true );
    this.ForEachPanel( function CB_SetPanelEnabled(p) { p.SetEnabled(fieldName,enabled); }, panelRef );
  },

  DeletePanels: function( panelRef, deleteDom ) {
    // Note: deleting a panel cuts all refs between panel and fields for garbage collection
    if (!xArray(panelRef)) panelRef = this.PanelList.slice();
    this.ForEachPanel( function CB_DeletePanel(p){ p.Delete(deleteDom); }, panelRef );
  },

  RemovePanel: function( panel ) {
    // private function
    // panel: ControlPanel
    // panel is removed from this.PanelList and this.PanelInitList
    xArrRemove( this.PanelInitList, function CB_Compare_Panel(p){ return p == panel; } );
    xArrRemove( this.PanelList, function CB_Compare_Panel(p){ return p == panel; } );
  },

  AddPanel: function( panel, autoInit ) {
    // private function
    // returns true if panel is inserted in this.PanelInitList
    // when onload is already executed, then autoInit is ignored and panel must be initialiszed elsewhere
    autoInit = xDefBool( autoInit, true );
    this.PanelList.push( panel );
    if (xOnLoadFinished || !autoInit) return false;
    // insert panel into this.PanelInitList for later Init() in xOnLoad()
    this.PanelInitList.push( panel );
    if (this.PanelInitList.length == 1) {
      // install an onpageload handler that calls Init() for all panels in this.PanelInitList
      xOnLoad(
        function CB_OnLoad_InitPanels() {
          ControlPanels.BeforeInitHandlers.Call();
          ControlPanels.ForEachPanel( function CB_InitPanel(p){ p.Init(); }, null, ControlPanels.PanelInitList );
          ControlPanels.PanelInitList = [];
        }
      );
    }
    return true;
  },

  Get: function( name, panelList ) {
    // default panelList is this.PanelList
    panelList = xDefArray( panelList, this.PanelList );
    var panel = xArrFind( panelList, function CB_Compare_Name(p){ return p.Name == name; } );
    return panel ? panel : null;
  },

  GetIx: function( name, panelList ) {
    // default panelList is this.PanelList
    panelList = xDefArray( panelList, this.PanelList );
    return xArrFindIndex( panelList, function CB_Compare_Name(p){ return p.Name == name; } );
  },

  GetField: function( panelName, fieldName ) {
    var panel = this.Get( panelName );
    return panel ? panel.GetField( fieldName ) : null;
  },

  ForEachPanel: function( func, panelRefs, panelList ) {
    // func( ControlPanel )
    // panelRefs: undefined or null or string or array of strings or array of ControlPanels or ControlPanel
    // if undefined or null, all panels in panelList are passed to func
    // if string, panel with name panelRefs is passed to func
    // if array of strings, all panels with names in list panelRefs are passed to func
    // if array of ControlPanels, all those panels passed to func
    // if ControlPanel, panel is passed to func
    // default panelList is this.PanelList
    panelList = xDefArray( panelList, this.PanelList );
    if (!xAny(panelRefs)) {
      // panelRefs is undefined or null -> handle all panels
      xArrForEach( panelList, func );
    } else if (xArray(panelRefs)) {
      // panelRefs is array of (string or ControlPanel) -> handle panels in panelRefs
      xArrForEach( panelRefs, function CB_Call_Func( panel ) {
          if (xStr(panel)) panel = this.Get( panel, panelList );
          if (panel) func( panel );
        },
        this
      );
    } else {
      // panelRefs is string or ControlPanel
      if (xStr(panelRefs)) panelRefs = this.Get( panelRefs, panelList );
      if (panelRefs) func( panelRefs );
    }
  },

};

function ControlPanel( aParams ) {
  // aParams = {
  //   Name:          string; default = 'ControlPanel'+ControlPanels.Counter HTML ID for ControlPanel
  //   ModelRef:      string; default = ''; Name of a global variable providing the model values that are modified by ControlPanel Fields.
  //   NCols:         integer(>0); default = 1; Number of coloms a 2 cells
  //   OnModelChange: function( Field: CField, Value: number or string ); default null;
  //                  is called after a model value is changed by user entering a value into a field ect.
  //   AutoInit:      bool; default = true; call Init() elsewhere when page is already loaded
  //   Attr:          string; default = ''; ControlPanel attributes
  //   PanelFormat:   string; default = ''; Additional classes, e.g. Slider, OneCol, MathLabels, LabelLeft, InputMaxWidth...
  //   PanelClass:    string; default = 'ControlPanel'
  //   LabelClass:    string; default = 'Label'; can be overriden by fields
  //   ValueClass:    string; default = 'Value'; can be overriden by fields
  //   FieldClass:    string; default = 'Field'
  //   HiliChanges:   bool; default = false; true -> changed fields are highlighted
  //   DimmDefault:   bool; default = false; true -> Default values are shown dimmed on ReadOnly fields
  //   Format:        string; default = 'fix'; Default format for Textfields
  //   FormatTab:     bool; default = true; true: 1000 -> 1 000, 0.0001 -> 0.000 1
  //   Digits:        integer(>=0); default = 2; Default Digits for Textfields
  //   ReadOnly:      bool; default = false; Default ReadOnly for Textfields
  //   HelpImage:     string; default = 'q.gif'; path relativ to ControlPanel.prototype.ScriptPath. Use '' to hide HelpIamge
  // }
  // if only one model value has changed, Field and Value are set to the corresponding field and value.
  // if all model values have changed, Field is null and Value is undefined!
  //
  ControlPanels.Counter++;
  aParams = xDefObj( aParams, {} );

  this.Name = xDefStr( aParams.Name, 'ControlPanel' + ControlPanels.Counter );
  this.DomObj = null;
  this.ModelRef = xDefStr( aParams.ModelRef, '' );
  this.NCols = xDefNum( aParams.NCols, 1 );
  this.Attr = xDefStr( aParams.Attr, '' );
  this.Headers = [];
  this.HeaderAttrs = [];
  this.Fields = [];
  this.HiliChanges = xDefBool( aParams.HiliChanges, false );
  this.DimmDefault = xDefBool( aParams.DimmDefault, false );
  this.Format = xDefStr( aParams.Format, 'fix' );
  this.FormatTab = xDefBool( aParams.FormatTab, true );
  this.Digits = xDefNum( aParams.Digits, 2 );
  this.ReadOnly = xDefBool( aParams.ReadOnly, false );
  this.Enabled = xDefBool( aParams.Enabled, true );
  this.EnabledRef = this.MakeRef( aParams.EnabledRef, '' );
  this.PanelFormat = xDefStr( aParams.PanelFormat, '' );
  this.PanelClass = xDefStr( aParams.PanelClass, 'ControlPanel' );
  this.LabelClass = xDefStr( aParams.LabelClass, 'Label' );
  this.ValueClass = xDefStr( aParams.ValueClass, 'Value' );
  this.FieldClass = xDefStr( aParams.FieldClass, 'Field' );
  this.HelpImage = xDefStr( aParams.HelpImage, 'q.gif' );
  this.OnModelChange = xDefFunc( aParams.OnModelChange, null );
  this.ModelChangeActive = false;
  this.FieldCounter = 0;
  this.FieldUpdateLayoutFuncCounter = 0;
  this.LayoutHasChanged = false;
  this.IsInit = false;
  this.VisiChangeHandler = null;
  this.LayoutChangeHandler = null;

  ControlPanels.AddPanel( this, aParams.AutoInit );
}

ControlPanel.prototype.SetLayoutHasChanged = function() {
  this.LayoutHasChanged = true;
}

ControlPanel.prototype.Delete = function( deleteDom ) {
  // frees all fields ans removes panel from ControlPanels.PanelList and .PanelInitList
  // deleteDom: boolean; true -> delete dom elements also

  // remove envent handlers
  if (this.VisiChangeHandler) {
    Tabs.RemoveVisiChangeHandler( this.DomObj, this.VisiChangeHandler );
    this.VisiChangeHandler = null;
  }
  if (this.LayoutChangeHandler) {
    xRemoveEventLayoutChange( this.LayoutChangeHandler );
    this.LayoutChangeHandler = null;
  }

  // cut backlink to enable garbage collection for panel
  this.ForEachField( function CB_FreeField(field){ field.Free(); } );
  // cut all refs to fields, so this panel is no longer working
  this.Fields = [];

  // delete dom elements
  deleteDom = xDefBool( deleteDom, false );
  if (deleteDom) {
    var domObj = this.GetDomObj();
    if (domObj) xRemoveChild( xParent( domObj ), domObj );
  }
  this.DomObj = null;

  ControlPanels.RemovePanel( this );
  this.IsInit = false;
}

ControlPanel.prototype.ScriptPath = (function() {
  var scripts = document.getElementsByTagName('script'), script = scripts[scripts.length - 1];
  var path = '';
  if (script.getAttribute.length !== undefined) {
    path = script.getAttribute('src');
  } else {
    path = script.getAttribute('src', 2);
  }
  if (path) {
    path = path.substr(0,path.lastIndexOf('/')+1);
  }
  return path;
}());

ControlPanel.prototype.GetHtmlID = function() {
  return this.Name;
}

ControlPanel.prototype.GetDomObj = function() {
  return this.DomObj ? this.DomObj : xGet( this.GetHtmlID() );
}

ControlPanel.prototype.MakeFieldName = function( aFieldName ) {
  this.FieldCounter++;
  return xDefStr( aFieldName, 'Field' + this.FieldCounter );
}

ControlPanel.prototype.MakeFieldHtmlID = function( aFieldName ) {
  return this.Name + '-' + aFieldName;
}

ControlPanel.prototype.MakeRef = function( aValueRef, aName ) {
  // returns RefObject = { RefStr: 'model.prop', ModelRef: Object (window), PropRef: 'prop' }
  var ref = xDefStr( aValueRef, aName );
  if (ref === '') return null;
  var refObj = { ValueRef: ref };
  if (ref.indexOf('.') == -1 && this.ModelRef) {
    ref = this.ModelRef + '.' + ref;
  }
  var refx = ref.replace( /\[([^\]]+)\]/g, '.$1' );
  var modelRef = window;
  var refParts = refx.split('.');
  var last = refParts.length-1;
  for (var i = 0; i < last; i++) {
    modelRef = modelRef[refParts[i]];
  }
  refObj.RefStr = ref;
  refObj.ModelRef = modelRef;
  refObj.PropRef = refParts[last];
  return refObj;
}

ControlPanel.prototype.GetField = function( aFieldOrItemName ) {
  var field = xArrFind( this.Fields, function CB_HasFieldName(f){ return f.HasName(aFieldOrItemName); } );
  return field ? field : null;
}

ControlPanel.prototype.ForEachField = function( func ) {
  xArrForEach( this.Fields, func, this );
}

ControlPanel.prototype.IsEnabled = function( aFieldOrItemName ) {
  var field = this.GetField( aFieldOrItemName );
  return field ? field.IsEnabled( aFieldOrItemName ) : false;
}

ControlPanel.prototype.SetEnabled = function( aFieldOrItemName, enabled ) {
  enabled = xDefBool( enabled, true );
  if (!xDef(aFieldOrItemName) || aFieldOrItemName == null) aFieldOrItemName = '';
  // assert typeof(aFieldName) is string
  if (aFieldOrItemName == '') {
    this.ForEachField( function CB_SetFieldEnabled(field){ field.SetEnabled( aFieldOrItemName, enabled ); } );
  } else {
    var field = this.GetField( aFieldOrItemName );
    if (field) field.SetEnabled( aFieldOrItemName, enabled );
  }
}

ControlPanel.prototype.CallOnModelChange = function( aField, aValue ) {
  // if only one model value has changed, aField and aValue are set to the corresponding field.
  // if all model values have changed, aField is null and aValue is undefined!
  if (this.ModelChangeActive) return;
  this.ModelChangeActive = true;
  if (this.OnModelChange) {
    try {
      //console.log( 'ControlPanel.CallOnModelChange' );
      this.OnModelChange( aField, aValue );
    } catch(err) { }
  }
  this.ModelChangeActive = false;
}

ControlPanel.prototype.AddHeader = function ( aParams ) {
  // aParams = {
  //   Text: string; default = '&nbsp;'
  //   ColSpan: integer(>0); default = 1
  //   Attr: string; default = ''
  // }
  aParams = xDefObj( aParams, {} );
  var txt = xDefStr( aParams.Text, '&nbsp;' );
  var colspan = xDefNum( aParams.ColSpan, 1 );
  var attr = xDefStr( aParams.Attr, '' );
  if (colspan > 1) {
    if (attr) attr += ' ';
    attr += 'colspan="' + colspan +'"';
  }
  this.HeaderAttrs.push( attr );
  this.Headers.push( txt );
  return this;
}

ControlPanel.prototype.AddField = function( aField ) {
  if (!xObj(aField)) return this;
  this.Fields.push(aField);
  if (xFunc(aField.UpdateLayout)) this.FieldUpdateLayoutFuncCounter++;
  return this;
}

ControlPanel.prototype.GetFieldHtml = function( aField, aColIx ) {

  function StartTag( aClass, aColSpan, aAttr, aColIx ) {
    var css = '';
    var colsp = '';
    var attr = '';
    if (aColSpan > 1) colsp = ' colspan="' + aColSpan + '"';
    if (aClass) css = aClass;
    css = ' class="' + css + ' Col' + aColIx + '"';
    if (aAttr) attr = ' ' + aAttr;
    var tag = '<td' + colsp + css + attr + '>';
    return tag;
  };

  function EndTag( ) {
    return '</td>';
  };

  function LabelHtml( aLabel, aDescription ) {
    if (aLabel == '') return '';
    if (aDescription == '') return '<div class="FieldText">' + aLabel + '</div>';
    return '<div class="FieldText" title="' + aDescription + '">' + aLabel + '</div>';
  }

  function AppendixHtml( aDescription, aLink, aHelpImage ) {
    if (this.HelpImage == '') return '';
    if (aLink) {
      if (aDescription) {
        return ' ' + '<a href="' + aLink + '" target="_blank" title="&rArr; ' + aDescription + '"><img class="HelpImg" src="' + ControlPanel.prototype.ScriptPath + aHelpImage + '" alt=""></a>';
      } else {
        return ' ' + '<a href="' + aLink + '" target="_blank" title="&rArr; Infos"><img class="HelpImg" src="' + ControlPanel.prototype.ScriptPath + aHelpImage + '" alt=""></a>';
      }
    } else {
      if (aDescription) {
        return ' ' + '<span><img class="HelpImg" src="' + ControlPanel.prototype.ScriptPath + aHelpImage + '" title="' + aDescription + '" alt=""></span>';
      } else {
        return '';
      }
    }
  }

  var colspan = aField.ColSpan;
  var descr = aField.Description;
  var link = aField.Link;
  var attr = aField.Attr;

  var s = '';
  if ((colspan % 2) == 1) {
    s += StartTag(aField.LabelClass,1,'',aColIx) + LabelHtml(aField.Label,descr) + EndTag();
    s += StartTag(aField.ValueClass,colspan,attr,aColIx+1) + aField.GetHtml() + AppendixHtml(descr,link,this.HelpImage) + EndTag();
  } else {
    s += StartTag(aField.ValueClass,colspan,attr,aColIx) + aField.GetHtml() + AppendixHtml(descr,link,this.HelpImage) + EndTag();
  }
  return s;
}

ControlPanel.prototype.GetHtml = function() {
  var html = '';
  var attr = this.Attr;
  var css = this.PanelClass + ' NCols' + this.NCols;
  if (this.PanelFormat) css += ' ' + this.PanelFormat;
  css = ' class="' + css + '"';
  if (attr) attr = ' ' + attr;
  html += '<table id="' + this.Name + '"' + css + attr + '>';
  if (this.Headers.length > 0) {
    html += '<tr class="HdRow">';
    for (var i = 0; i < this.Headers.length; i++) {
      css = ' class="HdCol' + (i+1) + '"';
      attr = this.HeaderAttrs[i];
      if (attr) attr = ' ' + attr;
      html += '<th' + css + attr + '>' + this.Headers[i] + '</th>';
    }
    html += '</tr>';
  }
  var thisCols = 2 * this.NCols;
  var coli = 1;
  var rowi = 1;
  var col = 0;
  html += '<tr class="Row1">';
  for (var i = 0; i < this.Fields.length; i++) {
    var field = this.Fields[i];
    var s = this.GetFieldHtml( field, coli );
    html += s;
    var nCols = 1;
    var colspan = xDefNum( field.ColSpan, 1 );
    if ((colspan % 2) == 1) {
      nCols = 1 + colspan;
      coli++;
    } else {
      nCols = colspan;
    }
    col += nCols;
    coli++;
    if (((col % thisCols) == 0) && (i < (this.Fields.length-1))) {
      rowi++;
      coli = 1;
      html += '</tr><tr class="Row' + rowi + '">';
    }
  }
  // fill row
  var remCols = thisCols - (col % thisCols);
  if (remCols == thisCols) remCols = 0;
  var cs = '';
  if (remCols > 1) {
    cs = ' colspan="' + remCols + '"';
    html += '<td' + cs + ' class="Col' + coli + '">&nbsp;</td>';
  }
  html += '</tr></table>';
  return html;
}

ControlPanel.prototype.Render = function() {
  document.writeln( this.GetHtml() );
  return this;
}

ControlPanel.prototype.Init = function( forceGetDefault ) {
  // this function ca be used to reconnect panel to dom also
  //console.log( 'ControlPanel.Init' );

  var me = this;
  this.DomObj = xGet( this.GetHtmlID() );
  this.ForEachField( function CB_InitField(field){ field.Init( forceGetDefault ); } );

  // if Tabs module exists, install UpdateLayout function for this ControlPanel
  if (xDef(window.Tabs) && this.FieldUpdateLayoutFuncCounter > 0) {
    if (this.DomObj) {
      this.VisiChangeHandler = function( boxData ) {
        me.UpdateLayout( boxData.IsVisible ? 1 : 0 );
      }
      Tabs.AddVisiChangeHandler( this.DomObj, this.VisiChangeHandler );
    }
  }

  if (!this.IsInit) {
    // add global layout changed handler
    this.LayoutChangeHandler = function() {
      me.UpdateLayout();
    }
    xAddEventLayoutChange( this.LayoutChangeHandler );
  }

  this.IsInit = true;
  this.Update();
}

ControlPanel.prototype.Invalidate = function( bUpdateGui ) {
  //console.log( 'ControlPanel.Invalidate' );
  this.ForEachField( function CB_InvalidateField(field){ field.Invalidate(); } );
  if (bUpdateGui) this.Update();
}

ControlPanel.prototype.Reset = function( bCallOnModelChange, bUpdateGui ) {
  var prevState = this.ModelChangeActive;
  this.ModelChangeActive = true;
  this.ForEachField( function CB_ResetField(field){ field.Reset(false); } );
  this.ModelChangeActive = prevState;
  if (bCallOnModelChange) this.CallOnModelChange( null );
  if (bUpdateGui) this.Update();
}

ControlPanel.prototype.Update = function() {
  if (!this.IsInit) return;
  var oldFormatTab = NumFormatter.TableLike;
  NumFormatter.TableLike = this.FormatTab;
  this.ForEachField( function CB_UpdateField(field){ field.Update(); } );
  NumFormatter.TableLike = oldFormatTab;
  if (this.LayoutHasChanged) {
    this.UpdateLayout();
    this.LayoutHasChanged = false;
  }
}

ControlPanel.prototype.UpdateLayout = function( visiState ) {
  // visiState: -1 = unknown, 0 = invisible, 1 = visible
  if (!this.IsInit) return;
  visiState = xDefNum( visiState, -1 );
  if (visiState == -1) visiState = xIsDisplayed( this.DomObj ) ? 1 : 0;
  this.ForEachField( function CB_UpdateFieldLayout(field){ field.UpdateLayout(visiState); } );
}

ControlPanel.prototype.IsDisplayed = function() {
  return xIsDisplayed( this.Name );
}

ControlPanel.prototype.ParseWikiLink = function( aLink ) {
  // aLink = '[[PageName#Header~Par=ParValue]]'
  // returns 'index.asp?page=PageName&par=ParValue#Header'
  // if aLink ist no wiki link, aLink is returned
  if (aLink.indexOf('[[') != 0) return aLink;
  // handle wiki link
  var pageName = aLink.substr(2,aLink.length-2);
  if (pageName.lastIndexOf(']]') != pageName.length-2) return aLink;
  pageName = pageName.substring( 0, pageName.length-2 );
  var pars = '';
  var subHeader = '';
  var p = pageName.indexOf('~');
  if (p > 0) {
    pars = escape(pageName.substring( p + 1 ));
    pars = pars.replace( /%3D/g, '=' );
    pars = pars.replace( /%7E/g, '~' );
    pars = pars.replace( /%20/g, '+' );
    pars = pars.replace( /%5C%5C/g, '\\' );
    pars = pars.replace( /%5C=/g, '%3D' );
    pars = pars.replace( /%5C~/g, '%7E' );
    pars = pars.replace( /\\/g, '%5C' );
    pars = pars.replace( /~/g, '&' );
    pars = '&' + pars;
    pageName = pageName.substring( 0, p );
  }
  p = pageName.indexOf('#');
  if (p >= 0) {
    subHeader = escape(pageName.substring( p + 1 ));
    subHeader = subHeader.replace( /%2E/g, '.' );
    subHeader = subHeader.replace( /%2D/g, '-' );
    subHeader = subHeader.replace( /%20/g, '_' );
    subHeader = subHeader.replace( /%/g, '.' );
    subHeader = subHeader.replace( /\+/g, '_' );
    subHeader = '#H_' + subHeader;
    pageName = pageName.substring( 0, p );
  }
  pageName = pageName.replace( / /g, '+' );
  return ASP_PAGE + '?page=' + escape(pageName) + pars + subHeader;
}

// Some Field Constructors --------------------------------------------------------

ControlPanel.prototype.AddEmptyField = function( aParams ) {
  var param = { Label: '-', Html: '&nbsp;' };
  if (xObj(aParams)) {
    if (xStr(aParams.Name))   param.Name = aParams.Name;
    if (xNum(aParams.ColPan)) param.ColSpan = aParams.ColSpan;
    if (xStr(aParams.Attr))   param.Attr = aParams.Attr;
  }
  return this.AddField( new CpHtmlField( this, param ) );
}

ControlPanel.prototype.AddTextField = function( aParams ) {
  return this.AddField( new CpTextField( this, aParams ) );
}

ControlPanel.prototype.AddHtmlField = function( aParams ) {
  return this.AddField( new CpHtmlField( this, aParams ) );
}

// CpField --------------------------------------------------------------

function CpField( aParentPanel, aParams ) {
  // Base class for all ControlPanel Fields.
  // aParentPanel: ControlPanel
  // aParams = {
  //   Name:         string; default = 'Field'+ControlPanel.FieldCounter; HTML ID of field
  //   ValueRef:     string; default = ControlPanel.ModelRef+Name;
  //   ReadOnly:     boolean; default = false
  //   Enabled:      boolean; default = ControlPanel.Enabled
  //   EnabledRef:   string; default = ControlPanel.EnabledRef
  //   Label:        string; default = Name; string may contain html tags such as <sub>, <sup>, &alpa;
  //   Description:  string; default = ''; text is shown if hovering over label or help symbol
  //   Link:         string; default = ''; Wiki Link to a Help Page for this field
  //   ColSpan:      integer(>0); default = 1;
  //   LabelClass:   string; default = ControlPanel.LabelClass;
  //   ValueClass:   string; default = ControlPanel.ValueClass;
  //   Attr:         string; default = ''; any additional html attributes for this text field, e.g. 'style="color:blue;"'
  // }
  //
  // aField must implement:
  //
  // Interface:
  // - GetType() -> gets a string to indicate the type of the CpField (e.g. 'CpTextField')
  // - GetHtml() -> gets HTML code for aField's representation
  // - Init() -> get model value and store it as a default for Reset()
  // - Invalidate() -> invalidates display of data to force new evaluation of model on next Update()
  // - Reset(bCallOnModelChange) -> store default in model and occasionally update gui
  // - Update() -> reads model value and updates the representation accordingly
  // - HasName(name) -> checks wether field.Name is name or CheckboxField has item with name
  // - SetGuiEnabled(enabled) -> set the visiblie representation of enabled state
  // - SetEnabled(itemName,enabled) -> set enabled state and calls SetGuiEnabled()
  //
  // If the object changes the model, it must call aPanel.CallOnModelChange( aField, aValue )
  //
  aParams = xDefObj( aParams, {} );
  this.Panel = aParentPanel;

  this.Name = aParentPanel.MakeFieldName( aParams.Name );
  this.DomObj = null;
  this.Default = '';
  this.ValidDefault = false;

  this.HtmlID = aParentPanel.MakeFieldHtmlID( this.Name );
  this.ValueRef = aParentPanel.MakeRef( aParams.ValueRef, this.Name );
  this.ReadOnly = xDefBool( aParams.ReadOnly, false );
  this.Enabled = xDefBool( aParams.Enabled, aParentPanel.Enabled );
  this.EnabledRef = aParentPanel.EnabledRef;
  if (xStr(aParams.EnabledRef)) this.EnabledRef = aParentPanel.MakeRef(aParams.EnabledRef,'');
  this.Label = xDefStr( aParams.Label, this.Name );
  if (this.Label == '-') this.Label = '&nbsp;';
  this.Description = xDefStr( aParams.Description, '' );
  this.Link = xDefStr( aParams.Link, '' );
  if (this.Link) this.Link = aParentPanel.ParseWikiLink( this.Link );
  this.ColSpan = xDefNum( aParams.ColSpan, 1 );
  this.LabelClass = xDefStr( aParams.LabelClass, aParentPanel.LabelClass );
  this.ValueClass = xDefStr( aParams.ValueClass, aParentPanel.ValueClass );
  this.Attr = xDefStr( aParams.Attr, '' );
}

CpField.prototype.Free = function() {
  // override this for some field types to remove event handler etc.
  this.Panel = null;
  this.DomObj = null;
}

CpField.prototype.GetValueRef = function( ) {
  // returns original ValueRef string from internal ValueRef object
  return this.ValueRef.ValueRef;
}

CpField.prototype.HasName = function( aName ) {
  return this.Name == aName;
}

CpField.prototype.GetHtmlID = function( itemRef ) {
  // override this for Checkbox and Radiobutton
  return this.HtmlID;
}

CpField.prototype.GetDomObj = function( itemRef ) {
  // override this for Checkbox and Radiobutton
  return this.DomObj ? this.DomObj : xGet( this.HtmlID );
}

CpField.prototype.ValueFromModel = function( aValueRef ) {
  // aValueRef: { RefStr: 'model.prop', ModelRef: Object (window), PropRef: 'prop' }
  return (aValueRef.RefStr) ? aValueRef.ModelRef[aValueRef.PropRef] : 0;
};

CpField.prototype.ValueToModel = function( aValue, aValueRef, bUpdateGui, bCallOnModelChange ) {
  bUpdateGui = xDefBool( bUpdateGui, false );
  bCallOnModelChange = xDefBool( bCallOnModelChange, false );
  var oldModelValue = this.ValueFromModel( aValueRef );
  var doChangeModel = oldModelValue != aValue;
  if (doChangeModel) {
    aValueRef.ModelRef[aValueRef.PropRef] = aValue;
  }
  if (bCallOnModelChange && this.Panel.OnModelChange === null) bUpdateGui = true;
  if (bUpdateGui) this.Update();
  if (doChangeModel && bCallOnModelChange) this.Panel.CallOnModelChange( this, aValue );
}

CpField.prototype.IsEnabled = function( ) {
  // get field enabled property as a default action
  // overwrite this function in the subclasses
  return this.Enabled;
}

CpField.prototype.SetEnabled = function( ignoredItemName, enabled ) {
  // default action for some fields
  // overwrite this function in the subclasses as neccesary
  if (!this.EnabledRef) this.SetGuiEnabled( xDefBool( enabled, true ) );
}

CpField.prototype.SetGuiEnabled = function( enabled ) {
  this.Enabled = enabled;
}

CpField.prototype.UpdateLayout = function( visiState ) {
  // to override by some field types
}

// CpHtmlField -------------------------------------------------------------

function CpHtmlField( aPanel, aParams ) {
  // aParams = {
  //   Name:     string; default = 'Field'+ControlPanel.FieldCounter; HTML ID of field
  //             Default for Label and ValueRef
  //   Label:    string; default = Name
  //   Html:     string; default = ''; Value of Html field. If not '', ValueRef is ignored
  //   ValueRef: string; default = Name; Reference to a global javascript variable or
  //             object member -> Ref = aPanel.ModelRef+'.'+ValueRef
  //             If ValueRef contains a '.' -> Ref = ValueRef
  //   ColSpan:  integer(>0); default = 1;
  // }
  aParams = xDefObj( aParams, {} );
  this.parentClass.constructor.call( this, aPanel, aParams );

  this.Html = xDefStr( aParams.Html, '' );
  this.LastHtml = '';
  this.ValidLast = false;
}

CpHtmlField.inheritsFrom( CpField );

CpHtmlField.prototype.GetHtml = function( ) {
  return '<div id="' + this.HtmlID + '" class="HtmlField">' + xDefStr( this.Html, '&nbsp;' ) + '</div>';
}

CpHtmlField.prototype.GetType = function( ) { return 'HtmlField'; }

CpHtmlField.prototype.Init = function( forceGetDefault ) {
  this.DomObj = xGet( this.HtmlID );
}

CpHtmlField.prototype.Invalidate = function( ) {
  this.ValidLast = false;
}

CpHtmlField.prototype.Update = function( ) {
  if (!this.DomObj) return;
  var txt = this.Html;
  if (txt === '' && this.ValueRef.RefStr !== '') txt = this.ValueFromModel( this.ValueRef );
  if (txt === '') txt = '&nbsp;';
  if (this.ValidLast && this.LastHtml === txt) return;
  xInnerHTML( this.DomObj, txt );
  this.LastHtml = txt;
  this.ValidLast = true;
}

CpHtmlField.prototype.Reset = function( ) { }

// CpTextField -------------------------------------------------------------

function CpTextField( aPanel, aParams ) {
  // aPanel: ControlPanel; backlink
  // aParams = {
  //   Name:        string; default = 'Field'+ControlPanel.FieldCounter; default for ValueRef and Label.
  //                Html ID and name of text input field are aPanel.Name+'-'+Name
  //                Html ID of unit-span: aPanel.Name+'-'+Name+'-Unit'
  //   ValueRef:    string; default = aPanel.ModelRef+Name;
  //                Reference to a global javascript variable or object member -> Ref = aPanel.ModelRef+'.'+ValueRef
  //                If ValueRef contains a '.' -> Ref = ValueRef
  //                If ValueRef is '', then this field has no input element
  //   ConvToModelFunc: function(val:String):any; default = null; convert an input to a model value
  //   ConvFromModelFunc: function(val:any):string; default = null; convert a model value to textfield value
  //   ReadOnly:    bool; default = aPanel.ReadOnly(false);
  //   Enabled:     bool; default = true
  //   EnabledRef:  String; default = ''; if defined, Enabled State is fetched from this reference
  //   HiliChanges: bool; default = aPanel.HiliChanges(false);
  //   DimmDefault: bool; default = aPanel.DimmDefault(false); true -> Default values are shown dimmed on ReadOnly fields
  //   Label:       string; default = Name; use '-' if no label should be shown
  //   Description: string; default = ''; show as a help text when hovering over the label or Help symbol
  //   Link:        string; default = ''; Wiki Link to a help page
  //   Mult:        number or [ SetModel(x:Number), GetModel(x:Number) ]; default = 1;
  //                Input value is multiplied with Mult or converted with SetModel(x) before it is stored in ValueRef.
  //                ValueRef is divided by Mult or converted with GetModel(x) before it is displayed in input element.
  //                If Mult = 0 then input element is not evaluated and may contain a string.
  //   MultRef:     string; default = ''; if defined, multiplier is fetched from this reference.
  //   Units:       string; default = ''; String behind input element that can contain the units of the value.
  //   UnitsRef:    string; default = ''; if defined, Units are feched from this reference (format see ValueRef).
  //   Digits:      number(>=0); default = aPanel.Digits(2); precision of the displayed number depending on Format.
  //   DigitsRef:   string; default = ''; if defined, number of gigits is fetched from this reference (format see ValueRef)
  //   Format:      string; default = aPanel.Format('fix');
  //                Display Format of displayed value: 'fix', 'fix0', 'std', 'weak', 'weak0', 'prec', 'eng', 'sci', 'unit'
  //   FormatRef:   string; default = ''; if defined, format is fetched from this reference (format see ValueRef)
  //   Enabled:     boolean; default = true
  //   EnabledRef:  string; default = ''
  //   ColSpan:     integer(>0); default = 1; Number of cells that the input field has to span over
  //   Attr:        string; default = ''; Additionional Html Attributes for the Value-Cell, e.g. 'style="background-color:red;"'
  // }
  //
  aParams = xDefObj( aParams, {} );
  this.parentClass.constructor.call( this, aPanel, aParams );

  this.ConvToModelFunc = xDefFunc( aParams.ConvToModelFunc, null );
  this.ConvFromModelFunc = xDefFunc( aParams.ConvFromModelFunc, null );
  this.ReadOnly = xDefBool( aParams.ReadOnly, aPanel.ReadOnly );
  this.HiliChanges = xDefBool( aParams.HiliChanges, aPanel.HiliChanges );
  this.DimmDefault = xDefBool( aParams.DimmDefault, aPanel.DimmDefault );
  this.Mult = 1;
  var m = aParams.Mult;
  if (xNum(m) || (xArray(m) && m.length >= 2 && xFunc(m[0]) && xFunc(m[1])) ) this.Mult = m;
  this.MultRef = aPanel.MakeRef( aParams.MultRef, '' );
  this.Units = xDefStr( aParams.Units, '' );
  this.UnitsRef = aPanel.MakeRef( aParams.UnitsRef, '' );
  this.Digits = xDefNum( aParams.Digits, aPanel.Digits );
  this.DigitsRef = aPanel.MakeRef( aParams.DigitsRef, '' );
  this.Format = xDefStr( aParams.Format, aPanel.Format );
  this.FormatRef = aPanel.MakeRef( aParams.FormatRef, '' );

  var me = this; // closure
  this.OnChangeFunc  = function(e){me.HandleChange(e);};
  this.OnKeyDownFunc = function(e){me.HandleKeyDown(e);};
  this.OnFocusFunc   = function(e){me.HandleFocus(e);};

  this.LastValue = 0;
  this.LastMult = 1;
  this.LastUnits = '';
  this.LastFormat = '';
  this.LastDigits = 0;
  this.LastHiliCss = '';
  this.ValidLast = false;
}

CpTextField.inheritsFrom( CpField );

CpTextField.prototype.Free = function() {
  if (!this.ReadOnly) this.RemoveEventHandlers();
  this.parentClass.Free.call( this );
}

CpTextField.prototype.GetType = function( ) { return 'TextField'; }

CpTextField.prototype.GetHtml = function( ) {

  function InputTag( aName, aClass, aValue, bReadOnly ) {
    var css = ''
    if (bReadOnly) css = 'ReadOnly';
    if (aClass) {
      if (css) css += ' ';
      css += aClass;
    }
    if (css) css = ' class="' + css + '"';
    var readonly = '';
    if (bReadOnly) readonly = ' readonly="readonly"';
    var name = '';
    if (aName) name = ' name="' + aName + '" id="' + aName + '"';
    return '<input type="text"' + name + css + readonly + ' value="' + aValue + '">';
  };

  function UnitHtml( aName, aUnits, aUnitsRef ) {
    if (aUnits || aUnitsRef) {
      return '<div class="FieldText" id="' + aName + '-Unit">' + aUnits + '</div>';
    } else {
      return '';
    }
  }

  var input = '';
  if (this.ValueRef) input = InputTag( this.HtmlID, this.Panel.FieldClass, '', this.ReadOnly );
  input += UnitHtml( this.HtmlID, this.Units, this.UnitsRef );
  return input;
}

CpTextField.prototype.AddEventHandlers = function() {
  xAddEvent( this.DomObj, 'change',  this.OnChangeFunc );
  xAddEvent( this.DomObj, 'keydown', this.OnKeyDownFunc );
  xAddEvent( this.DomObj, 'focus',   this.OnFocusFunc );
  xAddEvent( this.DomObj, 'click',   this.OnFocusFunc );
}

CpTextField.prototype.RemoveEventHandlers = function() {
  xRemoveEvent( this.DomObj, 'change',  this.OnChangeFunc );
  xRemoveEvent( this.DomObj, 'keydown', this.OnKeyDownFunc );
  xRemoveEvent( this.DomObj, 'focus',   this.OnFocusFunc );
  xRemoveEvent( this.DomObj, 'click',   this.OnFocusFunc );
}

CpTextField.prototype.GetEnabledFromModel = function() {
  return (this.EnabledRef) ? this.ValueFromModel( this.EnabledRef ) : this.Enabled;
}

CpTextField.prototype.SetGuiEnabled = function( enabled, force ) {
  // sets visible representation of text field for enabled
  force = xDefBool( force, false );
  if (enabled) {
    if (this.Enabled && !force) return;
    if (this.DomObj && !this.ReadOnly) this.DomObj.disabled = false;
    this.Enabled = true;
  } else {
    if (!this.Enabled && !force) return;
    if (this.DomObj && !this.ReadOnly) this.DomObj.disabled = true;
    this.Enabled = false;
  }
}

CpTextField.prototype.SetFieldNum = function( aNum ) {

  if (this.Format) {
    // format = { Mode = str, Precision = +int, Units = str }
    var format = { Mode: this.Format, Precision: this.Digits };

    // numParts = { MantSign: +/-1, Mant: +int, ExpSign: +/-1, Exp: +int, Exp3: int, PrefixIx: int, Mode: str, Precision: +int };
    var numParts = NumFormatter.SplitNum( aNum, format );

    var numStr = NumFormatter.NumPartsToString( numParts );
    this.DomObj.value = numStr;

    if (this.Units || this.Format === 'unit' || this.UnitsRef) {
      var prefix = NumFormatter.GetPrefixFromNumParts( numParts );
      xInnerHTML( this.HtmlID + '-Unit', prefix + this.Units );
    }
  } else {
    // nativ JavaScript Format
    this.DomObj.value = aNum.toString();
    if (this.Units || this.UnitsRef) xInnerHTML( this.HtmlID + '-Unit', this.Units );
  }

}

CpTextField.prototype.Init = function( forceGetDefault ) {
  forceGetDefault = xDefBool( forceGetDefault, false );
  this.DomObj = xGet( this.HtmlID );
  if (!this.DomObj || !this.ValueRef) return;
  if (!this.ReadOnly) this.AddEventHandlers();
  if (!this.ValidDefault || forceGetDefault) {
    this.Default = this.ValueFromModel( this.ValueRef );
    this.ValidDefault = true;
  }
  this.ValidLast = false;
  var enable = this.GetEnabledFromModel();
  this.SetGuiEnabled( enable, true );
}

CpTextField.prototype.Invalidate = function( ) {
  this.ValidLast = false;
}

CpTextField.prototype.Reset = function( bCallOnModelChange ) {
  // Resets model to Default Value
  if (this.ReadOnly) return;
  this.ValidLast = false;
  this.ValueToModel( this.Default, this.ValueRef, false, bCallOnModelChange );
}

CpTextField.prototype.Store = function() {
  // stores field value in storage ValueRef
  if (!this.DomObj) return;
  var v;
  if (!this.ConvToModelFunc) {
    if (xNum(this.Mult)) {
      if (this.Mult != 0) {
        v = this.Mult * NumFormatter.StringToNum( this.DomObj.value );
      } else {
        v = this.DomObj.value;
      }
    } else {
      // Mult = [ SetModel(x), GetModel(x) ]
      var ConvertInputToModelFunc = this.Mult[0];
      v = ConvertInputToModelFunc( NumFormatter.StringToNum( this.DomObj.value ) );
    }
  } else {
    v = this.ConvToModelFunc( this.DomObj.value );
  }
  this.ValueToModel( v, this.ValueRef, true, true );
}

CpTextField.prototype.GetRefsFromModel = function() {
  if (this.MultRef)    this.Mult    = this.ValueFromModel( this.MultRef    );
  if (this.FormatRef)  this.Format  = this.ValueFromModel( this.FormatRef  );
  if (this.DigitsRef)  this.Digits  = this.ValueFromModel( this.DigitsRef  );
  if (this.UnitsRef)   this.Units   = this.ValueFromModel( this.UnitsRef   );
}

CpTextField.prototype.CheckGuiUpdate = function( aValue, aHiliCss ) {
  this.GetRefsFromModel();
  if (this.ValidLast) {
    var updateNeedet = (
      this.LastValue   != aValue      ||
      this.LastMult    != this.Mult   ||
      this.LastUnits   != this.Units  ||
      this.LastFormat  != this.Format ||
      this.LastDigits  != this.Digits ||
      this.LastHiliCss != aHiliCss
    );
    if (!updateNeedet) {
      return false;
    }
  }
  if (this.LastUnits != this.Units) {
    this.Panel.SetLayoutHasChanged();
  }
  this.LastValue   = aValue;
  this.LastMult    = this.Mult;
  this.LastUnits   = this.Units;
  this.LastFormat  = this.Format;
  this.LastDigits  = this.Digits;
  this.LastHiliCss = aHiliCss;
  this.ValidLast   = true;
  return true;
}

CpTextField.prototype.Update = function() {
  // recalls storage into input field
  if (!this.DomObj) return;
  var v = this.ValueFromModel( this.ValueRef );
  var hiliCss = '';
  if (this.ReadOnly) {
    if (!this.ValidLast && this.DimmDefault) hiliCss = 'Dimmed';
  } else {
    if (v != this.Default && this.HiliChanges) hiliCss = 'Changed';
  }
  if (!this.ConvFromModelFunc) {
    if (this.CheckGuiUpdate( v, hiliCss )) {
      if (xNum(this.Mult)) {
        if (this.Mult != 0) {
          this.SetFieldNum( v / this.Mult );
        } else {
          this.DomObj.value = v;
        }
      } else {
        // Mult = [ SetModel(x), GetModel(x) ]
        var ConvertModelToInputFunc = this.Mult[1];
        this.SetFieldNum( ConvertModelToInputFunc(v) );
      }
      if (hiliCss !== 'Dimmed' ) xRemoveClass( this.DomObj, 'Dimmed' );
      if (hiliCss !== 'Changed' ) xRemoveClass( this.DomObj, 'Changed' );
      if (hiliCss !== '' ) xAddClass( this.DomObj, hiliCss );
    }
  } else {
    this.DomObj.value = this.ConvFromModelFunc( v );
  }
  var enable = this.GetEnabledFromModel();
  this.SetGuiEnabled( enable );
}

CpTextField.prototype.HandleChange = function(aEvent) {
  if (!this.Enabled) {
    aEvent.PreventDefault();
    return;
  }
  this.Store();
}

CpTextField.prototype.HandleKeyDown = function(aEvent) {
  if (!this.Enabled) {
    aEvent.PreventDefault();
    return true;
  }
  var key = String.fromCharCode(aEvent.keyCode)
  if (aEvent.keyCode == 13) {
    // RETURN
    if (!this.DomObj) return true;
    var v = this.DomObj.value;
    var m = this.Mult;
    var isNumericMult = (xNum(m) && m !== 0) || xArray(m);
    if (isNumericMult && v.replace( /\s+/g, '' ) === '') {
      this.Reset( true );
    } else if (v === ' ') {
      this.Reset( true );
    } else {
      this.Store();
      return false;
    }
  } else if (aEvent.keyCode == 27) {
    // ESC -> load default into field
    this.Reset( true );
  } else if ((key == 'Y') && aEvent.ctrlKey && !aEvent.altKey && !aEvent.shiftKey ) {
    // CTRL Y -> erease field
    if (!this.DomObj) return true;
    this.DomObj.value = '';
    return false;
  }
  return true;
}

CpTextField.prototype.HandleFocus = function(aEvent) {
  if (!this.Enabled) {
    aEvent.PreventDefault();
    return;
  }
  this.DomObj.select();
}

// ControlPanelSelection ------------------------------------------------------------------------

ControlPanel.prototype.CheckboxOrRadiobuttonHtml = function( aType, aName, aClass, bReadOnly, aItems, aNCols ) {
  // aName must be defined for aType = 'radio' and is ignored for aType = 'checkbox'
  // aItems = [ {
  //   Name: string or undefined if aType = 'radio'
  //   Value: string; default = Name; Html Value for input element
  //   Text: string; default = ''; Text behind input element
  //   }, {...}
  // ]
  var s = '';
  var n = aItems.length - 1;
  var nCols = aNCols;
  if (nCols <= 0) nCols = n + 1;
  if (nCols <= 0) nCols = 1;
  var nRows = Math.floor( n / nCols ) + 1;
  var colw = Math.floor( 100 / nCols );
  s += '<table class="FieldGrid">';
  var isCheckbox = (aType == 'checkbox');
  var i = 0;
  for (var row = 1; row <= nRows; row++) {
    s += '<tr>';
    for (var col = 1; col <= nCols; col++) {
      var css = 'FieldCell';
      var attrs = '';
      if (row <= 1) attrs += ' style="width:' + colw + '%;"';
      if ((i <= n) && (aItems[i].Text != '-')) {
        if (isCheckbox) {
          var name = this.MakeFieldHtmlID( aItems[i].Name );
          var id = name;
          bReadOnly = aItems[i].ReadOnly;
        } else {
          var name = this.MakeFieldHtmlID( aName );
          var id = name;
          if (n > 0) id += '-' + i;
        }
        if (bReadOnly) css += ' ReadOnly';
        attrs += ' class="' + css + '" id="' + id + '-Field"';
        s += '<td' + attrs + '>';
        attrs = ' type="' + aType + '" id="' + id + '" name="' + name + '" class="' + aClass + '" value="' + aItems[i].Value + '"';
        if (bReadOnly) attrs += ' disabled="disabled"';
        s += '<div class="FieldText">' + '<input' + attrs + '>';
        s += '<span class="FieldCaption">' + aItems[i].Text + '&nbsp;</span></div>';
      } else {
        s += '<td>&nbsp;';
      }
      s += '</td>';
      i++;
    }
    s += '</tr>';
  }
  s += '</table>';
  return s;
}

ControlPanel.prototype.GetFieldCell = function( aInputElement ) {
  var domEle = aInputElement;
  while (domEle) {
    domEle = xParent( domEle );
    if (xHasClass( domEle, 'FieldCell' )) return domEle;
  }
  return null;
}

// Checkboxes ---------------------------------------------------------------------------------------

ControlPanel.prototype.AddCheckboxField = function( aParams ) {
  // aParams = {
  //   Name:        string; default = 'Field'+ControlPanel.FieldCounter; default for Label and Items[i].Name
  //   Items:       Array of {
  //     Name:      string; default = CheckboxField.Name+'-'+i; Html name and id of this checkbox item,
  //                default for ValueRef and Value of this item
  //     ValueRef:  string; default = aPanel.ModelRef+Items[i].Name;
  //                Reference to a global javascript variable or object member -> Ref = aPanel.ModelRef+'.'+ValueRef
  //                If ValueRef contains a '.' -> Ref = ValueRef
  //     Value:     string; default = Name; Value for input element value attribute (optional)
  //     Text:      string; default = Name; Text behind Checkbox element. Use '-' if no Text should be displayed.
  //     ReadOnly:  bool; default = Checkbox.ReadOnly (false)
  //     Enabled:   bool; default = true
  //     EnabledRef:String; default = Checkbox.EnabledRef; if defined Enabled State is fetched from this reference
  //   }
  //   Label:       string; default = Name; use '-' if no label should be shown
  //   NCols:       integer(>0); default = Items.length; Number of columns to place items in.
  //   Description: string; default = ''; show as a help text when hovering over the label or Help symbol
  //   Link:        string; default = ''; Wiki Link to a help page
  //   ReadOnly:    bool; default = ControlPanel.ReadOnly; read only state for all checkboxes in this field
  //   EnabledRef:  String; default = ''; default EnabledRef for all checkboxes in this field
  //   ColSpan:     integer(>0); default = 1; Number of cells that the checkboxes has to span over
  //   Attr:        string; default = ''; Additionional Html Attributes for the Value-Cell, e.g. 'style="background-color:red;"'
  // }
  //
  return this.AddField( new CpCheckboxField( this, aParams ) );
}

function CpCheckboxField( aPanel, aParams ) {
  // aPanel: ControlPanel; backlink
  aParams = xDefObj( aParams, {} );
  this.parentClass.constructor.call( this, aPanel, aParams );

  this.Items = [];
  if (xArray(aParams.Items)) {
    var itemsDef = aParams.Items;
    var nItemsDef = itemsDef.length;
    for (var i = 0; i < nItemsDef; i++) {
      var itemDef = itemsDef[i];
      if (itemDef) {
        var item = {};
        item.Name = xDefStr( itemDef.Name, this.Name + '-' + i );
        item.HtmlID = aPanel.MakeFieldHtmlID( item.Name );
        item.ValueRef = aPanel.MakeRef( itemDef.ValueRef, item.Name );
        item.Value = xDefStr( itemDef.Value, item.Name );
        item.Text = xDefStr( itemDef.Text, item.Name );
        if (item.Text == '-') item.Text = '';
        item.ReadOnly = xDefBool( itemDef.ReadOnly, this.ReadOnly );
        item.Enabled = xDefBool( itemDef.Enabled, this.Enabled );
        item.EnabledRef = this.EnabledRef;
        if (xStr(itemDef.EnabledRef)) item.EnabledRef = aPanel.MakeRef( itemDef.EnabledRef, '' );
        item.Default = false;
        item.ValidDefault = false;
        item.DomObj = null;
        item.LastValue = '';
        item.ValidLast = false;
        item.CheckboxChangeHandler = null;
        item.CellClickHandler = null;
        this.Items.push( item );
      }
    }
  }
  this.NCols = xDefNum( aParams.NCols, this.Items.length );
}

CpCheckboxField.inheritsFrom( CpField );

CpCheckboxField.prototype.GetType = function( ) { return 'CheckboxField'; }

CpCheckboxField.prototype.Free = function() {
  xArrForEach( this.Items, function CB_RemoveHandlers_ReleaseDomObj(item){
    // remove event handlers !!!
    var cbDomObj = item.DomObj;
    if (!item.ReadOnly && cbDomObj && item.CheckboxChangeHandler) {
      xRemoveEvent( cbDomObj, 'change', item.CheckboxChangeHandler );
      xRemoveEvent( cbDomObj, 'click', item.CheckboxChangeHandler );
      var clickArea = this.Panel.GetFieldCell( cbDomObj );
      if (clickArea) {
        xRemoveEvent( clickArea, 'click', item.CellClickHandler );
      }
    }
    // release DOM link
    item.DomObj = null;
  }, this );
  this.parentClass.Free.call( this );
}

CpCheckboxField.prototype.ForEachItem = function( func ) {
  // func( item, i )
  xArrForEach( this.Items, func, this );
}

CpCheckboxField.prototype.GetItem = function( aName ) {
  var item = xArrFind( this.Items, function CB_Compare_Name(item){ return item.Name == aName; } );
  return item ? item : null;
}

CpCheckboxField.prototype.HasName = function( aName ) {
  return (this.Name == aName || this.GetItem(aName) != null);
}

CpCheckboxField.prototype.GetValueRef = function( aItemName ) {
  var valueRef = this.ValueRef;
  if (xStr(aItemName)) {
    var item = this.GetItem( aItemName );
    if (!tem) valueRef = item.ValueRef;
  }
  return valueRef ? valueRef.ValueRef : '';
}

CpCheckboxField.prototype.GetHtmlID = function( itemName ) {
  if (!xStr(itemName)) return this.HtmlID;
  var item = this.GetItem( itemName );
  return item ? item.HtmlID : '';
}

CpCheckboxField.prototype.GetDomObj = function( itemName ) {
  if (!xStr(itemName)) return null;
  var item = this.GetItem( itemName );
  return item ? item.DomObj : null;
}

CpCheckboxField.prototype.GetEnabledFromModel = function( item ) {
  // item as ItemIndex or ItemName or Item Object
  if (xStr(item)) {
    item = this.GetItem( item );
    if (!item) return null;
  } else if (xNum(item)) {
    item = this.Items[item];
  }
  // assert item is Item Object
  if (item.EnabledRef) return this.ValueFromModel( item.EnabledRef  );
  return item.Enabled;
}

CpCheckboxField.prototype.IsEnabled = function( itemName ) {
  // if itemName is '' or null or undefined then Enabled from first item is returned
  // this handles checkboxes correct, where EnabledRef is set by the checkbox only and inherited to all items
  if (!xDef(itemName) || itemName == null) itemName = '';
  // assert typeof(itemName) is string
  var item = (itemName == '') ? this.Items[0] : this.GetItem( itemName );
  return item ? item.Enabled : true;
}

CpCheckboxField.prototype.SetEnabled = function( itemRef, enabled ) {
  // if itemRef is '' or null or undefined then SetEnabled for each item is called
  // for each item ignore this function, if enabled is controled by EnabledRef
  enabled = xDefBool( enabled, true );
  if (!xDef(itemRef) || itemRef == null) itemRef = '';
  // assert typeof(itemRef) is string or item object
  if (xStr(itemRef) && itemRef == '') {
    xArrForEach( this.Items, function CB_SetEnabled(item) {
        if (!item.EnabledRef) this.SetItemGuiEnabled( item, enabled );
      },
      this
    );
  } else {
    // assert itemName is string or item object
    var item = xStr(itemName) ? this.GetItem( itemName ) : itemName;
    if (item && !item.EnabledRef) this.SetItemGuiEnabled( item, enabled );
  }
}

CpCheckboxField.prototype.SetItemGuiEnabled = function( item, enabled, force ) {
  // item as item object
  var force = xDefBool( force, false );
  var fieldCellId = item.HtmlID + '-Field';
  if (enabled) {
    if (item.Enabled && !force) return;
    xRemoveClass( fieldCellId, 'Disabled' );
    item.Enabled = true;
  } else {
    if (!item.Enabled && !force) return;
    xAddClass( fieldCellId, 'Disabled' );
    item.Enabled = false;
  }
}

CpCheckboxField.prototype.OnChange = function( aEvent, aCheckboxIx ) {
  aEvent.StopPropagation();
  var item = this.Items[aCheckboxIx];
  if (!item.Enabled) {
    aEvent.PreventDefault();
    return;
  }
  if (!item.DomObj) return;
  var v = item.DomObj.checked;
  this.ValueToModel( v, item.ValueRef, false, true );
}

CpCheckboxField.prototype.OnTextClick = function( aEvent, aCheckboxIx ) {
  var item = this.Items[aCheckboxIx];
  if (!item.Enabled) return;
  var domObj = item.DomObj;
  if (domObj) domObj.checked = !domObj.checked;
  this.OnChange( aEvent, aCheckboxIx );
}

CpCheckboxField.prototype.GetHtml = function() {
  return this.Panel.CheckboxOrRadiobuttonHtml( 'checkbox', '', 'CheckBox', this.ReadOnly, this.Items, this.NCols );
}

CpCheckboxField.prototype.Init = function( forceGetDefault ) {
  function GetChangeCallback( self, i ) {
    return function CB_OnChange(e) { self.OnChange( e, i ); };
  }
  function GetTextClickCallback( self, i ) {
    return function CB_OnTextClick(e) { self.OnTextClick( e, i ); };
  }
  forceGetDefault = xDefBool( forceGetDefault, false );
  var nItems = this.Items.length;
  for (var i = 0; i < nItems; i++) {
    var item = this.Items[i];
    var cbDomObj = xGet( item.HtmlID );
    if (!item.ReadOnly) {
      item.CheckboxChangeHandler = GetChangeCallback( this, i );
      xAddEvent( cbDomObj, 'change', item.CheckboxChangeHandler );
      xAddEvent( cbDomObj, 'click', item.CheckboxChangeHandler );
      var clickArea = this.Panel.GetFieldCell( cbDomObj );
      if (clickArea) {
        item.CellClickHandler = GetTextClickCallback(this,i);
        xAddEvent( clickArea, 'click', item.CellClickHandler );
      }
    }
    item.DomObj = cbDomObj;
    if (!item.ValidDefault || forceGetDefault) {
      item.Default = this.ValueFromModel( item.ValueRef );
      item.ValidDefault = true;
    }
    item.ValidLast = false;
    var enable = this.GetEnabledFromModel( item );
    this.SetItemGuiEnabled( item, enable, true );
  }
}

CpCheckboxField.prototype.Invalidate = function( ) {
  this.ForEachItem( function CB_InvalidateItem(item,i) { item.ValidLast = false; } );
}

CpCheckboxField.prototype.Reset = function( bCallModelChangeCB ) {
  this.ForEachItem( function CB_ResetItem(item,i) {
      if (item.ReadOnly) return;
      item.ValidLast = false;
      this.ValueToModel( item.Default, item.ValueRef, false, bCallModelChangeCB );
    }
  );
}

CpCheckboxField.prototype.Update = function() {
  var nItems = this.Items.length;
  for (var i = 0; i < nItems; i++) {
    var item = this.Items[i];
    var v = this.ValueFromModel( item.ValueRef );
    if (!(item.ValidLast && v == item.LastValue)) {
      if (item.DomObj) item.DomObj.checked = v;
      item.LastValue = v;
      item.ValidLast = true;
    }
    var enable = this.GetEnabledFromModel( item );
    this.SetItemGuiEnabled( item, enable );
  }
}

// Radio Buttons --------------------------------------------------------------------------------

ControlPanel.prototype.AddRadiobuttonField = function( aParams ) {
  // aParams = {
  //   Name:        string; default = 'Field'+ControlPanel.FieldCounter; default for ValueRef, Label and Items[i].Name
  //                Default Html name for all radiobuttons is aPanel.Name+'-'+RadioField.Name
  //                Default Html id's of radiobuttons are aPanel.Name+'-'+RadioField.Name+'-'+i
  //                Default Items[i].Name is RadioField.Name+'-'+i
  //   ValueRef:    string; default = aPanel.ModelRef+Name;
  //                Reference to a global javascript variable or object member -> Ref = aPanel.ModelRef+'.'+ValueRef
  //                If ValueRef contains a '.' -> Ref = ValueRef
  //   ValueType:   'str', 'int', 'num'; default = 'str'; stored values are converted to this type
  //   Items:       Array of {
  //     Name:      string; default = RadioField.Name+'-'+i; default for Value of this item
  //     Value:     string; default = Name; Value for input element value attribute
  //     Text:      string; default = Name; Text behind Radio Button
  //   }
  //   Label:       string; default = Name; use '-' if no label should be shown
  //   ReadOnly:    bool; default = false
  //   Enabled:     bool; default = true
  //   EnabledRef:  String; default = ''; if defined Enabled State is fetched from this reference
  //   NCols:       integer(>0); default = Items.length; Number of columns to place items in.
  //   Description: string; default = ''; show as a help text when hovering over the label or Help symbol
  //   Link:        string; default = ''; Wiki Link to a help page
  //   ColSpan:     integer(>0); default = 1; Number of cells that the checkboxes has to span over
  //   Attr:        string; default = ''; Additionional Html Attributes for the Value-Cell, e.g. 'style="background-color:red;"'
  // }
  //
  return this.AddField( new CpRadiobuttonField( this, aParams ) );
}

function CpRadiobuttonField( aPanel, aParams ) {
  // aPanel: ControlPanel
  aParams = xDefObj( aParams, {} );
  this.parentClass.constructor.call( this, aPanel, aParams );

  this.ValueType = xDefStr( aParams.ValueType, 'str' );
  this.Items = [];
  if (xArray(aParams.Items)) {
    var itemsDef = aParams.Items;
    var nItemsDef = itemsDef.length;
    for (var i = 0; i < nItemsDef; i++) {
      var itemDef = itemsDef[i];
      if (itemDef) {
        var item = {};
        item.Name = xDefStr( itemDef.Name, this.Name + '-' + i );
        item.HtmlID = this.HtmlID + '-' + i;
        if (xDef(itemDef.Value)) {
          item.Value = this.ToValueStr( itemDef.Value, this.ValueType );
        } else {
          item.Value = item.Name;
        }
        item.Text = xDefStr( itemDef.Text, item.Name );
        item.DomObj = null;
        item.RadionbuttonChangeHandler = null;
        this.Items.push( item );
      }
    }
  }
  this.NCols = xDefNum( aParams.NCols, this.Items.length );
  this.LastValue = '';
  this.ValidLast = false;
}

CpRadiobuttonField.inheritsFrom( CpField );

CpRadiobuttonField.prototype.GetType = function( ) { return 'RadiobuttonField'; }

CpRadiobuttonField.prototype.Free = function() {
  xArrForEach( this.Items, function CB_RemoveEventHandlers_ReleaseDomObj(item,i) {
    // remove event handlers
    var rbDomObj = item.DomObj;
    if (!this.ReadOnly && rbDomObj && item.RadiobuttonChangeHandler) {
      xRemoveEvent( rbDomObj, 'change', item.RadiobuttonChangeHandler );
      xRemoveEvent( rbDomObj, 'click', item.RadiobuttonChangeHandler );
      var clickArea = this.Panel.GetFieldCell( rbDomObj );
      if (clickArea) {
        xRemoveEvent( clickArea, 'click', item.RadiobuttonChangeHandler );
      }
    }
    // release DOM link
    item.DomObj = null;
  }, this );
  this.parentClass.Free.call( this );
}

CpRadiobuttonField.prototype.ForEachItem = function( func ) {
  xArrForEach( this.Items, func, this );
}

CpRadiobuttonField.prototype.GetItem = function( aName ) {
  var item = xArrFind( this.Items, function CB_Compare_Name(item){ return item.Name == aName; } );
  return item ? item : null;
}

CpRadiobuttonField.prototype.ParseDataType = function( aValue, aDataType ) {
  var v = aValue;
  if (aDataType == 'int') {
    v = parseInt( v, 10 );
    if (isNaN(v)) v = 0;
  } else if (aDataType == 'num') {
    v = parseFloat( v );
    if (isNaN(v)) v = 0.0;
  } else if (aDataType == 'bool') {
    v = (aValue != '' && aValue != '0' && aValue != 'false');
  }
  return v;
}

CpRadiobuttonField.prototype.ToValueStr = function( aValue, aDataType ) {
  var v = aValue;
  if (xStr(v)) {
    if (aDataType == 'int') {
      v = this.ParseDataType( aValue, aDataType ).toString();
    } else if (aDataType == 'num') {
      v = parseFloat( aValue );
      v = (IsNaN(v)) ? '0.0' : aValue;
    } else if (aDataType == 'bool') {
      v = (aValue != '' && aValue != '0' && aValue != 'false');
      v = (v) ? 'true' : 'false';
    }
  } else {
    if (aDataType == 'int') {
      v = xNum(aValue) ? v.toFixed(0) : '0';
    } else if (aDataType == 'num') {
      v = xNum(aValue) ? v.toString() : '0.0';
    } else if (aDataType == 'bool') {
      v = aValue ? 'true' : 'false';
    } else {
      v = aValue.toString();
    }
  }
  return v;
}

CpRadiobuttonField.prototype.GetEnabledFromModel = function() {
  if (this.EnabledRef) return this.ValueFromModel( this.EnabledRef );
  return this.Enabled;
}

CpRadiobuttonField.prototype.SetGuiEnabled = function( enabled, force ) {
  // sets visible representation for enabled
  var force = xDefBool( force, false );
  var fieldCellId = this.HtmlID;
  if (enabled) {
    if (this.Enabled && !force) return;
    this.ForEachItem( function CB_SetItemEnabled(item,i) {
        xRemoveClass( fieldCellId + '-' + i + '-Field', 'Disabled' );
      }
    );
    this.Enabled = true;
  } else {
    if (!this.Enabled && !force) return;
    this.ForEachItem( function CB_SetItemDisabled(item,i) {
        xAddClass( fieldCellId + '-' + i + '-Field', 'Disabled' );
      }
    );
    this.Enabled = false;
  }
}

CpRadiobuttonField.prototype.OnChange = function( aEvent, aRadioIx ) {
  aEvent.StopPropagation();
  if (!this.Enabled) {
    aEvent.PreventDefault();
    // undo selection
    this.ValidLast = false;
    this.Update();
    return;
  }
  var item = this.Items[aRadioIx];
  var v = this.ParseDataType( item.Value, this.ValueType );
  this.ValueToModel( v, this.ValueRef, false, true );
}

CpRadiobuttonField.prototype.GetHtml = function() {
  return this.Panel.CheckboxOrRadiobuttonHtml( 'radio', this.Name, 'Radio', this.ReadOnly, this.Items, this.NCols );
}

CpRadiobuttonField.prototype.GetHtmlID = function( itemIx ) {
  if (!xNum(itemIx)) return this.HtmlID;
  if (itemIx < 0 || itemIx >= this.Items.length) return '';
  return this.Items[itemIx].HtmlID;
}

CpRadiobuttonField.prototype.GetDomObj = function( itemIx ) {
  if (!xNum(itemIx)) return null;
  if (itemIx < 0 || itemIx >= this.Items.length) return null;
  return this.Items[itemIx].DomObj;
}

CpRadiobuttonField.prototype.Init = function( forceGetDefault ) {
  function GetChangeHandler( self, i ) {
    return function CB_OnChange(e) { self.OnChange( e, i ); };
  }
  forceGetDefault = xDefBool( forceGetDefault, false );
  if (!this.ValidDefault || forceGetDefault) {
    this.Default = this.ValueFromModel( this.ValueRef );
    this.ValidDefault = true;
  }
  var nItems = this.Items.length;
  for (var i = 0; i < nItems; i++) {
    var item = this.Items[i];
    var rbDomObj = xGet( item.HtmlID );
    if (!this.ReadOnly) {
      item.RadiobuttonChangeHandler = GetChangeHandler(this,i);
      xAddEvent( rbDomObj, 'change', item.RadiobuttonChangeHandler );
      xAddEvent( rbDomObj, 'click', item.RadiobuttonChangeHandler );
      var clickArea = this.Panel.GetFieldCell( rbDomObj );
      if (clickArea) xAddEvent( clickArea, 'click', item.RadiobuttonChangeHandler );
    }
    item.DomObj = rbDomObj;
  }
  var enable = this.GetEnabledFromModel();
  this.SetGuiEnabled( enable, true );
  this.ValidLast = false;
}

CpRadiobuttonField.prototype.Invalidate = function( ) {
  this.ValidLast = false;
}

CpRadiobuttonField.prototype.Reset = function( bCallModelChangeCB ) {
  if (this.ReadOnly) return;
  this.ValidLast = false;
  this.ValueToModel( this.Default, this.ValueRef, false, bCallModelChangeCB );
}

CpRadiobuttonField.prototype.Update = function() {
  var v = this.ValueFromModel( this.ValueRef );
  if (!(this.ValidLast && v == this.LastValue)) {
    this.LastValue = v;
    this.ValidLast = true;
    var nItems = this.Items.length;
    for (var i = 0; i < nItems; i++) {
      var ov = this.ParseDataType( this.Items[i].Value, this.ValueType );
      if (v == ov) {
        var domObj = this.Items[i].DomObj;
        if (domObj) domObj.checked = true;
        break;
      }
    }
  }
  var enable = this.GetEnabledFromModel();
  this.SetGuiEnabled( enable );
}

// CpSliderField ----------------------------------------------------------

ControlPanel.prototype.AddValueSliderField = function( aParams ) {
  // Adds a SliderField and a TextField to a ControlPanel created with NewSliderPanel.
  // see AddTextField and AddSliderField for parameters
  //
  if (!xDef(aParams)) aParams = {};
  var valuePos = xDefStr( this.ValuePos, 'left' );
  aParams.IsValueSlider = true;
  if (valuePos == 'right') {
    this.AddSliderField( aParams );
    aParams.ColSpan = 2;
    var textField = new CpTextField( this, aParams );
    textField.ValueClass = 'Value SliderValue';
    this.AddField( textField );
  } else {
    var textField = new CpTextField( this, aParams );
    textField.ValueClass = 'Value SliderValue';
    this.AddField( textField );
    aParams.ColSpan = 2;
    this.AddSliderField( aParams );
  }
  return this;
}

ControlPanel.prototype.AddSliderField = function( aParams ) {
  // aParams = {
  //   Name:        string; default = 'Field<counter>'; default for ValueRef and Label.
  //                Html ID of slider element is ControlPanel.Name+'-'+Name+'-Slider'
  //                Html ID of slider handle: ControlPanel.Name+'-'+Name+'-Slider-Handle'
  //   ValueRef:    string; default = this.ModelRef+Name;
  //                Reference to a global javascript variable or object member -> Ref = this.ModelRef+'.'+ValueRef
  //                If ValueRef contains a '.' -> Ref = ValueRef
  //   SliderValueRef: same as ValueRef; overwrites ValueRef if defined
  //   Label:       string; default = Name; use '-' if no label should be shown
  //   Caption:     string; default = '&hArr;'; caption on slider handle
  //   Description: string; default = ''; text is shown if hovering over the label (not implemented)
  //   Link:        string; default = ''; Wiki Link to a Help Page for this field (not implemented)
  //   Min:         number; default = 0;
  //   Max:         number; default = 1;
  //   Steps:       integer(>=0); default = 0; if 0 then infinite number of steps between Min and Max
  //   Rounding:    string; default = 'none'; 'floor', 'round'
  //   ColSpan:     integer(>0); default = 1; Number of cells that the input field has to span over
  //   LabelClass:  string; default = ControlPanel.LabelClass;
  //   ValueClass:  string; default = 'Value Slider';
  //   Color:       string; default = ''; color of slider handle; default see css
  //   ReadOnly:    boolean; default = false
  //   Enabled:     boolean; default = true
  //   EnabledRef:  string; default = ''
  //   Attr:        string; default = ''; Additionional Html Attributes for the Slider-Cell, e.g. 'style="background-color:red;"'
  //   BorderWidth: number; default = 1; slider path length is corrected by -2 x BorderWidth
  // }
  //
  return this.AddField( new CpSliderField( this, aParams ) );
}

function CpSliderField( aPanel, aParams ) {
  aParams = xDefObj( aParams, {} );
  this.parentClass.constructor.call( this, aPanel, aParams );

  this.HtmlID += '-Slider'
  if (!xStr(aParams.ValueClass)) this.ValueClass = 'Value Slider';
  if (xStr(aParams.SliderValueRef)) {
    this.ValueRef = aPanel.MakeRef( aParams.SliderValueRef, this.Name );
  }
  if (aParams.IsValueSlider) {
    this.ReadOnly = xDefBool( aParams.SliderReadOnly, false );
  }
  this.Caption       = xDefStr( aParams.Caption, '&hArr;' );
  this.Min           = xDefNum( aParams.Min,   0 );
  this.Max           = xDefNum( aParams.Max,   1 );
  this.Steps         = xDefNum( aParams.Steps, 0 );
  this.Rounding      = xDefStr( aParams.Rounding, 'none' );
  this.BorderWidth   = xDefNum( aParams.BorderWidth, 1 );
  this.Color         = xDefStr( aParams.Color, '' );
  this.DgdSlider     = null;
  this.LastValue     = 0;
  this.LastSliderPos = -1; // undefined
}

CpSliderField.inheritsFrom( CpField );

CpSliderField.prototype.Free = function() {
  // remove event handlers of slider
  this.DgdSlider.free();
  this.DgdSlider = null;
  this.parentClass.Free.call( this );
}

CpSliderField.prototype.GetType = function( ) { return 'SliderField'; }

CpSliderField.prototype.GetEnabledFromModel = function() {
  if (this.EnabledRef) return this.ValueFromModel( this.EnabledRef );
  return this.Enabled;
}

CpSliderField.prototype.SetGuiEnabled = function( enabled, force ) {
  if (enabled) {
    if (this.Enabled && !force) return;
    if (this.DgdSlider && !this.ReadOnly) this.DgdSlider.enable();
    this.Enabled = true;
  } else {
    if (!this.Enabled && !force) return;
    if (this.DgdSlider && !this.ReadOnly) this.DgdSlider.disable();
    this.Enabled = false;
  }
}

CpSliderField.prototype.GetHtml = function() {
  return DgdSliderHtml( this.HtmlID, this.Caption, this.Color );
}

CpSliderField.prototype.Init = function( forceGetDefault ) {
  forceGetDefault = xDefBool( forceGetDefault, false );
  var self = this;
  var options = {};
  if (this.BorderWidth > 0) {
    options.right = 2 * this.BorderWidth;
  }
  if (this.Steps > 0) {
    options.steps = this.Steps + 1;
    options.snap = true;
  }
  options.animationCallback = function( x, y ) {
    self.OnSliderChange( x, y );
  }
  // Note: updating layout by this function is sufficient, so we could set options.autoUpdateLayout=false
  // but with auto update resize of sliders is much smoother, so we keep default of true
  //options.autoUpdateLayout = false;
  this.DgdSlider = new DgdSlider( this.HtmlID, options );
  this.DomObj = xGet( this.HtmlID );
  if (this.ReadOnly) {
    this.DgdSlider.readonly();
    xAddClass( this.DomObj, 'ReadOnly' );
    if (this.Caption == '&hArr;') {
      xInnerHTML( this.HtmlID + '-Handle', '|' );
    }
  }
  if (!this.ValidDefault || forceGetDefault) {
    this.Default = this.ValueFromModel( this.ValueRef );
    this.ValidDefault = true;
  }
  var enable = this.GetEnabledFromModel();
  this.SetGuiEnabled( enable, true );
}

CpSliderField.prototype.Invalidate = function( ) {
  this.LastSliderPos = -1;
}

CpSliderField.prototype.Reset = function( bCallModelChangeCB ) {
  if (this.ReadOnly) return;
  this.ValueToModel( this.Default, this.ValueRef, false, bCallModelChangeCB );
}

CpSliderField.prototype.OnSliderChange = function( x, y ) {
  //console.log( 'CpSliderField.OnSliderChange' );
  if (!this.DgdSlider || this.ReadOnly) return;
  var v = x * (this.Max - this.Min) + this.Min;
  if (this.Rounding == 'floor') {
    v = Math.floor( v );
  } else if (this.Rounding == 'round') {
    v = Math.round( v );
  }
  if (v < this.Min) v = this.Min;
  if (v > this.Max) v = this.Max;
  this.LastValue = v;
  this.LastSliderPos = x;
  this.ValueToModel( v, this.ValueRef, false, true );
}

CpSliderField.prototype.Update = function() {
  if (!this.DgdSlider) return;
  var v = this.ValueFromModel( this.ValueRef );
  if (this.LastSliderPos == -1 || this.LastValue != v) {
    var x = (v - this.Min) / (this.Max - this.Min);
    if (x < 0) x = 0;
    if (x > 1) x = 1;
    this.DgdSlider.setValue( x, 0, true );
    this.LastValue = v;
    this.LastSliderPos = x;
  }
  var enable = this.GetEnabledFromModel();
  this.SetGuiEnabled( enable );
}

CpSliderField.prototype.UpdateLayout = function( visiState ) {
  // visiState: -1 = unknown, 0 = invisible, 1 = visible
  if (!this.DgdSlider || visiState == 0) return;
  this.DgdSlider.updateLayout();
  if (this.LastSliderPos == -1) {
    this.Update();
  } else {
    this.DgdSlider.setValue( this.LastSliderPos, 0, true );
  }
}
