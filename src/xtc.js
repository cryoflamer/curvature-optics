//------------------------------------------------------------
// 13.04.2008 (C) Walter Bislin; http://walter.bislins.ch/doku/xtc
// 02.10.2009 added SetScrollTop, GetScrollTop
// 07.05.2014 fixed: GetCursorScrollTop() works now in all browsers correct
// 07.05.2014 added: GetLineHeight()
//
// xTextControl class that encapsulates text controls for browser independence:
// To ensure browser independence do not use properties of text controls directly!
// NL sould be a single '\n' character, not '\r\n', so positions of carets
// correspond to character positions in strings on all browsers.
//
// usage:
//
// var textControl = new xTextControl(document.myForm.myTextInput);
// alert( textControl.Text );
// alert( textControl.SelText ); etc.
//
// Note: all members are ment to be read only!
// Use functions to change the control!
// You must not directly change the control properties!
//
// Note:
// range.moveToElementText(ele) on IE throws an exception if ele is a text input field!?
// That means, that xTextControl only works with textarea on all modern browsers :-(

function xNormString( aStr ) {
  return aStr.replace(/\r\n/g,'\n');
}

function xTextControl( aTextControl ) {
  // aTextControl must be a textarea element
  this.TextControl = aTextControl;
  this.SelStart = 0;
  this.SelEnd = 0;
  this.SelText = '';
  this.Text = '';
  this.Enabled = this.GetDataFromControl();
  this.LineHeight = 0;
  var ft = '';
  for (var i = 0; i < 32; i++) { ft += 'x\nx\nx\nx\nx\nx\nx\nx\n'; }
  this.FillText = ft;
}

xTextControl.prototype.GetDataFromControl = function() {
  if (typeof(this.TextControl) == 'undefined') {return false;}
  this.Text = xNormString(this.TextControl.value);
  if (document.selection) { // IE
    this.TextControl.focus();
    // find start of originalRange with a binary search
    var originalRange = document.selection.createRange();
    var testRange = originalRange.duplicate();
    testRange.moveToElementText( this.TextControl );
    var len = this.Text.length;
    var pos = 0;
    var step = Math.floor( len / 2 ) + 1;
    while (step > 0) {
      while ((pos+step <= len) && testRange.inRange(originalRange)) {
        testRange.moveStart( 'character', step );
        pos += step;
      }
      if (!testRange.inRange(originalRange)) {
        testRange.moveStart( 'character', -step );
        pos -= step;
      }
      step = Math.floor( step / 2 );
    }
    this.SelStart = pos;
    // find end of originalRange with a binary search
    testRange.moveToElementText( this.TextControl );
    var pos = len;
    var step = Math.floor( len / 2 ) + 1;
    while (step > 0) {
      while ((pos-step >= 0) && testRange.inRange(originalRange)) {
        testRange.moveEnd( 'character', -step );
        pos -= step;
      }
      if (!testRange.inRange(originalRange)) {
        testRange.moveEnd( 'character', step );
        pos += step;
      }
      step = Math.floor( step / 2 );
    }
    this.SelEnd = pos;
    this.SelText = this.Text.substring( this.SelStart, this.SelEnd );
    return true;
  }
  else if (this.TextControl.setSelectionRange) { // Mozilla
    this.SelStart = this.TextControl.selectionStart;
    this.SelEnd = this.TextControl.selectionEnd;
    this.SelText = this.Text.substring( this.SelStart, this.SelEnd );
    return true;
  }
  return false;
};

xTextControl.prototype.GetScrollTop = function() {
  if (typeof(this.TextControl.scrollTop) == 'number') {
    return this.TextControl.scrollTop;
  }
  return 0;
}

xTextControl.prototype.SetScrollTop = function( aTop ) {
  if (typeof(this.TextControl.scrollTop) == 'number') {
    this.TextControl.scrollTop = aTop;
  }
}

xTextControl.prototype.GetLineHeight = function() {
  if (this.LineHeight == 0) {
    var dummy = this.GetCursorScrollTop();
  }
  return this.LineHeight;
}

xTextControl.prototype.GetCursorScrollTop = function() {
  // Implementation: Cut the text after cursor pos and read scrollHight.
  // This is the scrollTop of the cursor position. After that restore the TextControl0
  if (typeof(this.TextControl.scrollHeight) != 'number') { return 0; }
  // save current text and selection
  var startPos = this.SelStart;
  var endPos = this.SelEnd;
  var fullText = this.Text;
  // Implementation: Some browsers return window height instead of document height in scrollHeight.
  // To get the effective scroll height, I fill the docu with FillText, get the scrollHeight as an offset,
  // add the topText, get and the scroll height again. The difference of the scroll heights is the real scroll height.
  this.SetText( this.FillText );
  var topOffset = this.TextControl.scrollHeight;
  // cut text after cursor position
  var topText = this.FillText + fullText.substring( 0, startPos );
  this.SetText( topText );
  // read scrollHeight = scrollTop of cursor
  var top = this.TextControl.scrollHeight - topOffset;
  // get height of a single line
  this.SetText( topText + '\nx' );
  var lineHeight = this.TextControl.scrollHeight - top - topOffset;
  this.LineHeight = lineHeight;
  // restore TextControl
  this.SetText( fullText );
  this.SetSelectionRange( startPos, endPos, true );
  return top;
}

xTextControl.prototype.SetText = function( aText ) {
  // Requires normalized aText
  // Note: this invalidates the selection members.
  // Use GetDataFromControl to get updated or
  // use SetSelectionRange to set a new selection
  if (this.TextControl.setSelectionRange) { // Mozilla
    var scrollTop = this.TextControl.scrollTop;
    this.TextControl.value = aText;
    this.TextControl.scrollTop = scrollTop;
  } else {
    this.TextControl.value = aText;
  }
  this.Text = aText;
};

xTextControl.prototype.ChangeSelection = function( aSelStart, aSelEnd, aReplaceText, aUpdateControlSelection ) {
  // Note: the controls selection is only updated if
  // aUpdateControlSelection is true. You may update the controls selection via UpdateControlSelection() manually.
  var preText = this.Text.substring( 0, aSelStart );
  var pstText = this.Text.substring( aSelEnd );
  var newText = preText + aReplaceText + pstText;
  this.SetText( newText );
  this.SelStart = aSelStart;
  this.SelEnd = aSelStart + aReplaceText.length;
  this.SelText = aReplaceText;
  if (aUpdateControlSelection) {this.UpdateControlSelection();}
};

xTextControl.prototype.SetSelectionRange = function( aSelStart, aSelEnd, aUpdateControlSelection ) {
  // Note: the controls selection is only updated if
  // aUpdateControlSelection is true. You may update the controls selection via UpdateControlSelection() manually.
  this.SelStart = aSelStart;
  this.SelEnd = aSelEnd;
  this.SelText = this.Text.substring( aSelStart, aSelEnd );
  if (aUpdateControlSelection) {this.UpdateControlSelection();}
};

xTextControl.prototype.ChangeSelectionText = function( aReplaceText, aUpdateControlSelection ) {
  // Note: the controls selection is only updated if
  // aUpdateControlSelection is true. You may update the controls selection via UpdateControlSelection() manually.
  this.ChangeSelection( this.SelStart, this.SelEnd, aReplaceText, aUpdateControlSelection );
};

xTextControl.prototype.SetCaretPos = function( aPos ) {
  this.SetSelectionRange( aPos, aPos, true );
};

xTextControl.prototype.UpdateControlSelection = function() {
  // updates the text control selection to the current values.
  this.TextControl.focus();
  if (this.TextControl.setSelectionRange) { // MOZILLA
    this.TextControl.setSelectionRange( this.SelStart, this.SelEnd );
  }
  else if (this.TextControl.createTextRange) { // IE
    var range = this.TextControl.createTextRange();
    range.collapse( true );
    range.moveEnd( 'character', this.SelEnd );
    range.moveStart( 'character', this.SelStart );
    range.select();
  }
};
