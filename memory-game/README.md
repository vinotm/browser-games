# Memory

Version: `beta-1.1`.

An offline, single-player matching game with selectable boards and up to twelve shapes.
Use the collection's development server and open `/memory-game/`. The game uses
shared theme initialization, navigation, elapsed-time formatting, restart dialogs,
and active-game leave protection. It is also linked from the collection homepage.

## Rules

- Choose 4×4, 6×6, 8×8, 10×10, or Custom (3–20 rows and columns). The start screen places the board-size label beside its dropdown. The custom picker supports dragging and numeric input. Start creates a shuffled deck.
- Reveal two cards per move. Selecting the same card twice does not count.
- Matching pairs briefly brighten with a small shape pulse, then stay visible
  in a muted state. Reduced-motion mode omits these effects. Mismatches turn face-down after 750 ms. Revealing another face-down card
  closes the mismatch immediately and starts the next attempt.
- Find all pairs to finish. The board briefly blinks, then shows
  “Game Completed!”, time, and moves. Click anywhere or press Escape/Enter/Space
  to dismiss and review the cards; New game returns to board selection.
- The timer begins at Start and stops on completion. It continues during restart
  confirmations and when the tab is hidden.
- Restarting an unfinished game requires confirmation. Leaving uses the shared
  protection, including the browser's native warning for refresh or tab closure.
- Cards use native buttons: Tab to choose a position and Enter/Space to reveal it.

## Where the layout lives

`js/engine.js` creates the deck in a function closure. A Fisher–Yates
shuffle rearranges paired identifiers and, for odd boards, one blocked cell. The array exists
only for this run in the JavaScript heap. It is not attached to `window`, saved to
local storage, included in HTML attributes, or sent to a server.

The engine's `view()` supplies `null` for every face-down identity. The renderer
creates shape SVGs only for exposed or matched cards. Shapes use explicit centered SVG placement and visible-art view boxes. Standard
art fills about 86% of its card; small/large variants use 46%/90%. Both faces occupy the same
fixed card rectangle and flip in 3D, without resizing. Concealing mismatches
restores generic accessible labels immediately and removes their SVGs halfway
through the closing flip, when the front is out of view. Reduced-motion mode
switches faces immediately. Position numbers are public;
they do not encode the randomized layout. Before Start, no shuffled deck exists.

This prevents reading all answers from the rendered board. It is not a security
boundary: a debugger can inspect the closure, and modified JavaScript can intercept
the shuffle or reveals. Downloaded source includes the available shapes and game
rules. A fully offline game cannot conceal its state from the browser's owner.

`js/engine.js` owns rules, `js/shapes.js` owns shape artwork, and `js/game.js` connects
state to the page. Rendering does not receive unrevealed identities. A new game
replaces the engine; old state becomes eligible for garbage collection.

## Privacy

Optional anonymous run summaries are disabled in public source builds. Enabled
installations disclose board settings, timing, moves, progress and coarse device
information before Start. Card layouts and individual flips are never reported.
See [analytics](analytics/README.md) for the schema, queue and receiver limits.
The shared theme preference and enabled report retry queue use browser storage.
Hosting services can process ordinary asset-request metadata.

## Larger boards

- Odd cell counts shade one random, unplayable position.
- Up to 36 cells: up to twelve shapes. Repeated shapes can match any identical card.
- Above 36 cells: four colors distinguish otherwise identical shapes.
- Above 192 cells: clearly small and large shapes add another matching requirement.
- The shape vocabulary adapts to the pair count; every full identity has an even
  number of cards. A match requires the same shape, color and size.
- Boards up to ten rows and columns fit at the default scale. Larger boards
  scroll inside the playing area with shared position bars. The shared magnifier,
  slider, pinch and Ctrl/Cmd-wheel zoom work like SOS; tapping a card restores
  playing scale before revealing it. Dragging pans without revealing cards.
- `js/menu.js` owns board selection and the custom picker, separate from rules.
