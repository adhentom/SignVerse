# Floating Interpreter

The floating interpreter is mounted independently from the optional results sidebar. While
SignVerse is enabled, sidebar open/minimize/restore actions never unmount the renderer or reset its
queue.

Position changes only through pointer drag or keyboard arrow controls. Size changes only through
the browser's native CSS resize handle. A `ResizeObserver` records the border-box width and height;
it does not derive dimensions from content. Width, height, x, and y are persisted in
`chrome.storage.local` and restored after refresh. Viewport changes constrain position only and do
not alter the saved dimensions.

The visible renderer exposes the current sign and synchronized Malayalam caption. Operational
renderer state is announced to assistive technology rather than shown as debugging UI.
