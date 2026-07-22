# Avatar UI Showcase

## Interpreter stage

The floating interpreter now shows a professional full-body vector signer while idle. During a sign,
it shows the reviewed avatar clip when one exists or the validated media asset otherwise. The current
sign and synchronized Malayalam caption remain below the stage.

## Interaction

- Drag using the labelled header or move it with arrow keys.
- Resize only with the browser-native resize handle.
- Position and border-box size persist through `chrome.storage.local`.
- Space toggles playback; Left/Right seek; Home restarts.

## Responsive and accessible presentation

The vector viewBox scales cleanly on standard and high-DPI screens. The stage has a specific accessible
name and announces renderer state. High-contrast mode removes decorative gradients. Reduced-motion mode
disables breathing, blinking, cross-fades, and transform transitions while retaining a clear static pose.

## Visual intent

Neutral clothing, natural proportions, a calm expression, restrained color, and a transparent SVG
canvas keep attention on the hands and face. The small waiting label no longer obscures the interpreter.
