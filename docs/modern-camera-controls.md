# Modern Scene and Compare camera controls

The compact camera reference appears below the Scene viewport and beneath the Compare A/B viewports. The native **Full guide** disclosure expands without JavaScript, and stays available with the settings sidebar closed. It is deliberately absent from Animation Studio playback, which does not implement interactive camera navigation.

## Mouse

- Left drag: rotate view (Pan and Nick). Dragging the image right looks left; dragging down looks up.
- Shift + left drag: translate camera laterally and vertically in the calibrated viewport frame.
- Alt + wheel: move the camera along the surface in its current heading direction, not vertically or along the pitched optical axis.
- Shift + wheel: adjust focal length and therefore FOV. Unmodified wheel keeps normal page scrolling.
- Combined Shift + Alt, Ctrl, and Meta wheel gestures do not activate camera movement.

## Keyboard

- W/S: forward/back; A/D: left/right, in the horizontal observer frame.
- Q/E: lower/raise height; arrow left/right: Pan; arrow up/down: Nick.
- Shift multiplies navigation speed and turn rate by 5; Ctrl multiplies them by 0.2.
- Keyboard motion works with focus on a camera Canvas or on the document body. Text fields, selects, links, buttons and other editing controls do not trigger movement. Camera Navigation settings in the sidebar configure speed, turn rate and wheel step.

Compare A/B shares the camera observer and orientation while rendering two independent physical models. The controls are static explanatory UI and introduce no new event handling, scene-state fields, or changes in the ray solver. Legacy remains separate.
