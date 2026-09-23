# Browser integration

The browser APIs a first-person game depends on, and the ways each one bites. All of
this lives in `platform/` and `input/` — `game/` never sees it (CLAUDE.md §2).

## Pointer lock

Mouse look uses the Pointer Lock API. Do not track cursor coordinates: a cursor stops at
the screen edge, and a locked pointer does not.

```
click canvas ──▶ requestPointerLock() ──▶ pointerlockchange
                                              │
      mousemove: read movementX / movementY ◀─┘      (deltas, not coordinates)
                                              │
                          ESC / lost focus ──▶ pointerlockchange → auto-pause
```

What actually causes bugs:

- **A user gesture is required.** `requestPointerLock()` outside a click or key handler
  is rejected. There is always a "click to play" step; design it in rather than
  discovering it.
- **Re-locking after ESC is rate-limited.** Browsers impose a delay (~1 s in Chrome) and
  reject requests inside it. Do not auto-relock in a retry loop — you get an unrecoverable
  state. Show "click to resume" and wait for the gesture.
- **`movementX/Y` are raw deltas in unspecified units.** They vary with OS mouse
  acceleration and DPI. Apply a sensitivity multiplier from settings; never assume pixels.
- **Deltas can spike.** A single event after a stall can carry a huge value and snap the
  camera. Clamp per-event delta, the same reasoning as the frame-time clamp in `core/loop.ts`.
- **Accumulate, consume once per frame.** Several `mousemove` events fire per frame.
  Sum them into the input snapshot and apply once, or look speed becomes frame-rate dependent.
- **Losing lock must pause.** Alt-tab, ESC, and focus loss all drop it. `pointerlockchange`
  is the single signal that transitions the mode machine to `Paused` — not a keyboard
  handler, which will not fire when the window is not focused.
- **`pointerlockerror` exists** and fires when the document is not focused or the element
  is detached. Handle it; do not assume the request succeeded.

## Audio autoplay

Browsers start the `AudioContext` in `suspended` state. It resumes only inside a user
gesture — the same click that grabs pointer lock.

- Resume the context on that gesture and check `state === 'running'` afterwards.
- A horror game with silent audio is broken, not degraded: if the context does not
  resume, say so rather than playing silently.
- The context also suspends when a tab is backgrounded. Re-check on `visibilitychange`.

## Tab visibility and focus

`visibilitychange` → hidden means `requestAnimationFrame` stops firing. On return, the
elapsed gap is seconds long; `core/loop.ts` clamps it (`MAX_FRAME_TIME`) so the player
does not teleport or tunnel through geometry.

Pause on hide. A stalker that kept hunting while the tab was in the background is the
kind of unfairness `docs/horror-design-principles.md` rules out.

## Fullscreen

Separate API from pointer lock, separate permission, separate failure mode. Request both
from the same gesture but track them independently — the player can exit one without the
other, and code that assumes they move together will desync.

## WebGL context loss

`webglcontextlost` is real and happens (driver reset, GPU pressure, tab backgrounded too
long). Call `preventDefault()` on the event or restoration never fires, then rebuild GPU
resources on `webglcontextrestored`. The asset manager's ref counts make this survivable;
ad-hoc loader calls do not. This is the practical reason for the disposal discipline in
CLAUDE.md §4.

## Input device notes

- Use `event.code` (physical key), not `event.key` (layout-dependent). `KeyW` is the same
  physical key on AZERTY; `'w'` is not.
- Track held keys in a `Set`, and clear it on `blur` — otherwise alt-tabbing mid-sprint
  leaves the key stuck down forever.
- `contextmenu` must be prevented on the canvas or right-click (aim, lean, flashlight)
  opens a menu.
