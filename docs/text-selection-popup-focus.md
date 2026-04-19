# Text-selection popup — focus behavior

## The requirement

When a user drag-highlights text inside the PDF, the prompt popup that appears
should simultaneously:

1. **Keep the on-page text highlight alive** so the user can `⌘C` / `Ctrl+C` to
   copy it.
2. **Accept the user's keystrokes immediately** so they can start typing their
   question without having to click the input first.

Both conditions at once felt obvious to ask for, but they're in tension with
a browser-level constraint, which is worth documenting because the "obvious"
implementation (call `inputRef.current.focus()` when the popup appears) cannot
satisfy both.

## Why you can't just call `.focus()`

Every browser has **one selection context**. When an `<input>` or `<textarea>`
receives focus, its internal caret becomes the active selection; the
`Selection` object tied to the document is torn down because a new selection
just replaced it.

This means:

- **Chrome**: focusing the popup's input *clears* the page's text highlight.
  The user gets the cursor (good) but loses the selection (can't copy).
- **Safari**: the same focus attempt interacts with Safari's
  "focus-follows-selection" heuristic — if you call `Selection.addRange(...)`
  after focusing (trying to restore), Safari moves focus *back* to the
  document, because its rule is that the focus owner should match the
  selection context. So the user gets the selection (can copy) but loses
  the focus (can't type).

There is no browser API that lets both states coexist. This has been the case
since the DOM Selection API was standardized.

## The workaround: lazy focus + document-level key capture

**Strategy**: leave the input *unfocused* until the user actually types. While
it's unfocused, the document is the focus owner, which means the page's text
selection stays alive (copy works). Meanwhile, we attach a document-level
`keydown` listener that routes keystrokes into the prompt's state. The moment
the user types a printable character, we promote to real input focus — at
which point the user has committed to typing, so losing the now-redundant
page highlight is fine.

All of this happens in `src/components/pdf/SelectionPopup.tsx`, inside the
`useEffect` that fires when `pendingAnchor` is set.

### Event flow for a text selection

| Moment | Focus state | Page selection | What works |
| --- | --- | --- | --- |
| Popup appears after drag | Document | Highlighted | `⌘C` copies the highlight |
| User presses any letter | Input (now focused) | Cleared | Character appears in prompt; from here it's a regular input |
| User presses `Enter` without typing | Document | Still highlighted | No-op (empty question) |
| User presses `Escape` | Document | — | Popup dismisses |
| User presses `Backspace` in virtual mode | Document | Still highlighted | Deletes last char of question, selection preserved |
| User clicks the input manually | Input | Cleared | Normal input editing |

Region selections (box-drag) bypass all of this — there's no page text to
preserve, so we just call `inputRef.current.focus()` after a 50 ms settle
delay as before.

### Key pieces of the implementation

- **Refs mirror reactive state** (`questionRef`, `contextModeRef`,
  `onStartChatRef`). The document `keydown` listener is attached *once* per
  popup lifetime; without refs, closing over React state would freeze the
  handler on stale values. The refs are written on every render and read
  inside the handler.

- **The listener bails on editable targets.** If the user has clicked the
  input (or any other input, or a modal has opened), `document.activeElement`
  will be an `HTMLInputElement`/`HTMLTextAreaElement` or `isContentEditable`,
  and our handler returns early so the focused element receives the key
  naturally.

- **Modifier keys pass through.** If `e.metaKey || e.ctrlKey || e.altKey`,
  we return early. This is why `⌘C`, `⌘V`, `⌘A`, dev-tools shortcuts, etc.
  all still work. **This is load-bearing for the copy flow** — if we didn't
  bail on modifier keys, `⌘C` would be captured by our handler and the
  browser's default copy-from-selection would never fire.

- **Promotion happens on the first printable key** (`e.key.length === 1 &&
  !e.repeat`). We append the character to `question` state and synchronously
  call `inputRef.current.focus({ preventScroll: true })`. From this moment
  forward the native input handles every keystroke (including arrow keys,
  Backspace with caret navigation, paste, etc.) and `document.activeElement`
  is the input, so our listener's first guard bails on subsequent keys.

- **`Enter`, `Escape`, `Backspace` are handled manually in virtual mode** so
  the user can submit, dismiss, or delete without first having to type a
  character to promote focus. `Backspace` in virtual mode does *not* promote
  to real focus — the user stays in virtual mode with the selection alive.

## How to tell if it's broken in the future

The two failure modes to watch for:

1. **Regression to "autofocus on popup"** — if someone adds back an
   unconditional `inputRef.current.focus()` call in the effect, the Chrome
   case will break: the page selection will disappear the moment the popup
   appears, so `⌘C` won't copy the highlighted text.

2. **Regression to "no typing in virtual mode"** — if someone removes the
   `document.addEventListener('keydown', ...)` wiring, the Safari case will
   break: the input won't be focused on appearance, and since we aren't
   capturing keystrokes globally, typed characters will go nowhere. The user
   has to click the input to type anything.

### Manual smoke test (two browsers)

1. Open the app, load a PDF, make sure `Text` selection mode is active in
   the toolbar.
2. Drag to highlight a passage. The popup should appear and the highlight
   should remain visible. **Check: `⌘C` copies that highlight.**
3. Without clicking anything, type a few letters. They should appear in the
   prompt input, and the input should now show the blinking caret.
4. Press `Enter`. The chat starts.
5. Repeat, but this time after step 2 press `Escape` — the popup should
   dismiss and the selection should clear.

Both Chrome and Safari should behave identically. If Safari behaves
differently, check:

- That we're not calling `.focus()` on the input while `tool === 'text'`
  in the initial effect (promoting on first key is fine).
- That `Selection.addRange(...)` calls haven't been re-added to the effect
  — Safari's focus-follows-selection heuristic will move focus back off the
  input if you re-apply a page selection after focusing.

## Known limitations

- **IME composition** (Japanese, Chinese, Korean keyboard input) doesn't
  compose cleanly in virtual mode because IME events fire on the focused
  element. IME users will effectively need to click the input first, at
  which point they lose the selection. This is fixable by also listening
  for `compositionstart` / `compositionupdate` / `compositionend`, but it's
  not currently implemented.

- **Screen readers** will not announce that the input is "focused and ready
  for input" during virtual mode, because technically it isn't. A screen
  reader user can reach the input with `Tab`, but they won't automatically
  land there when the popup appears. If we need to prioritize this, the
  simplest path is to skip virtual mode entirely under
  `window.matchMedia('(prefers-reduced-motion: reduce)')` or a similar
  heuristic, and just focus the input — losing the copy-from-selection
  affordance for screen-reader users.

- **Keyboard users who tab** into the popup without typing first will focus
  the input normally (via the browser's tab order), which clears the
  selection. There's no workaround for this without implementing a full
  virtual input; we accept the trade-off.
