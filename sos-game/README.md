# SOS

Version: `beta-1`.

A finite-board SOS game with a computer opponent or two players sharing one device.
The default board is 6 × 6; 4 × 4, 8 × 8, and 10 × 10 are also available.

## Rules

- Select an empty square, then choose S or O in the inline picker. Both players
  can use either letter. Escape or clicking outside cancels placement.
- Each newly completed SOS earns one point, horizontally, vertically, or diagonally.
- A move can complete multiple lines. Existing letters can be reused in other lines;
  each complete line scores only once, for the player who completes it.
- Scoring grants another turn. Otherwise, play passes to the opponent.
- The game ends when the board is full. The higher score wins; equal scores draw.
- The starting player is chosen randomly for each game.
- Tab and Enter select a square; S and O keys choose a letter while the picker is open.

Scored lines retain the scorer’s color. The most recent placement has a subtle fill.

## Computer opponent

Choose Easy, Medium, or Hard before starting against the computer. Easy mixes
random legal placements with one-ply scoring; Medium searches two plies; Hard
searches four plies with a larger node budget. These are tactical search settings,
not a guarantee of perfect play.

A worker runs depth-limited minimax with alpha-beta pruning, ordered by immediate
scoring opportunities. Evaluation combines score difference with the next player's
best immediate score. Extra turns preserve the current player throughout the search.
Equal choices are randomized. A fixed work budget is divided among legal first
moves; this is a bounded tactical opponent, not an unbeatable solver. When workers
are unavailable, the selected search runs on the main thread.

Rules and search are independent of the DOM. The shared page shell supplies theme
controls, navigation, and active-game leave protection. No analytics are collected.
There are no network dependencies during play after the assets load.
