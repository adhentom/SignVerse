# Accessibility Review

| Check | Status | Notes |
|---|---|---|
| Keyboard sidebar close/restore | PASS | Escape and labelled FAB; focus transfer retained. |
| Keyboard interpreter movement | PASS | Drag handle supports arrow keys and persists geometry. |
| Playback keyboard controls | PASS | Space, arrows, and Home are documented and tested. |
| Screen-reader names | PASS | Sidebar, interpreter, controls, progress, and live status are labelled. |
| Reduced motion | PASS | Media query disables animation and renderer motion. |
| High contrast | PASS | Contrast media query strengthens borders and caption state. |
| Malayalam language metadata | PASS | Caption text uses `lang="ml"`. |
| Independent caption scrolling | PASS | Floating Malayalam region has a bounded scroll area. |
| Focus trapping | NOT APPLICABLE | Sidebar is non-modal and must not trap page focus. |
| Native ISL semantic accuracy | NOT VERIFIED | Requires native ISL reviewers and approved assets. |

The floating interpreter no longer has a close action, preventing accidental loss of the primary accessibility output when the optional sidebar is minimized.
