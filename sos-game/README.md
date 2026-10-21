# SOS

Version: `beta-2`.

A finite-board SOS game with a computer opponent or two players sharing one device.
The default board is 6 × 6; 4 × 4, 8 × 8, and 10 × 10 are also available.
The last applied game mode, board size, and computer difficulty are remembered in
the browser after starting a game. Invalid or unavailable storage uses defaults;
an unfinished board is not saved.

## Rules

- Select an empty square, then choose S or O in the inline picker. Both players
  can use either letter. The picker grows from the selected square and shrinks
  back when dismissed. Selecting another empty square moves it immediately;
  selecting the same square again, selecting a filled square, pressing Escape, or clicking outside the board
  dismisses it. Theme and other action buttons do not dismiss the selection.
- Each newly completed SOS earns one point, horizontally, vertically, or diagonally.
- A move can complete multiple lines. Existing letters can be reused in other lines;
  each complete line scores only once, for the player who completes it.
- Scoring grants another turn. Otherwise, play passes to the opponent.
- Each player can place the same letter at most twice consecutively on their own
  moves, including extra turns. The opponent's moves do not change that streak.
  After a player's SS, their next letter must be O; after their OO, it must be S.
  Switching letters starts that player's new streak. Two small letter cells below
  each player's name and score show their streak. S is green and O is amber on the board, in these
  cells, and in the compact letter picker; strike colors identify the scorer.
  Streaks fill from the scores outward: right to left for P1, left to right for P2.
  The current player's unavailable letter is disabled in the picker and its
  keyboard shortcut.
- The game ends when the board is full. The higher score wins; equal scores draw.
- The starting player is chosen randomly for each game.
- Tab and Enter select a square; S and O keys choose a letter while the picker is open.

Scored lines, names, and scores use blue for P1 and purple for P2 or the computer,
separate from the letter colors. Placed letters enlarge smoothly into position.
The most recent placement keeps a letter-tinted fill and thin inset edge until the next move,
including during computer thinking. Reduced motion skips the letter animation.
The active player's full score group has a slowly pulsing, translucent background
in their player color, and their name is bold. The other player's name and score
are dimmed. Reduced motion keeps the active background steady. A score increase
briefly punches the score number larger before it settles. Scores span the name
and streak rows, with no separator between players. The scoreboard stays hidden
before play while reserving its layout space.
Turn and scoring announcements remain available to screen readers without
visible status text below the board.
New strikes draw across their three cells without replaying existing lines. The
final scoring animation finishes before the result covers the board. Dropdown
panels animate open and closed, dimming only the board behind the open options;
reduced-motion preferences skip these animations.

New game in the board's attached footer returns to the game settings. This footer
appears only during an active game, leaving setup and results with one main action.
An unfinished game asks for
confirmation first; Keep playing, Escape, the close icon, or an outside click
preserves it. The computer waits while this confirmation is open.
The square board also accounts for viewport height so the green New game button
fits in short phone and desktop windows.

Name fields appear directly below Game mode in setup (native 20-character input limit, accepting Unicode letters and symbols).
P2's field appears only for local multiplayer, directly below P1's field.
Blank names default to P1 and P2; the computer keeps its own label. Names are saved
with the last applied settings in this browser when a game starts.

## Computer opponent

Choose Easy, Medium, or Hard before starting against the computer. The selected
difficulty appears under the title during computer matches, in the same uppercase
style as Sudoku. Local multiplayer has no difficulty label.

Easy mixes
random legal placements with one-ply scoring; Medium searches two plies; Hard
searches four plies with a larger node budget. These are tactical search settings,
not a guarantee of perfect play.

A worker runs depth-limited minimax with alpha-beta pruning, ordered by immediate
scoring opportunities. Evaluation combines score difference with the next player's
best immediate score. Extra turns preserve the current player throughout the search.
Every search branch and Easy's random moves obey the shared letter limit.
Equal choices are randomized. A fixed work budget is divided among legal first
moves; this is a bounded tactical opponent, not an unbeatable solver. When workers
are unavailable, the selected search runs on the main thread.
Computer responses wait at least 450–650 ms, or 700 ms following a scoring move,
so placements and strikes remain readable; longer computation can extend the wait.

Rules and search are independent of the DOM. The shared page shell supplies theme
controls, navigation, and active-game leave protection. No analytics are collected.
There are no network dependencies during play after the assets load.

Name fields use native maxlength="20" and block ordinary extra typing without
warnings. This limit counts UTF-16 units, so emoji and combined characters may
consume multiple units; normalization preserves complete Unicode graphemes.
A small counter below each field appears from 12 characters onward while that
field is focused. Focus dims the setup board behind the name field, matching
dropdowns, instead of adding a colored focus outline; clicking the dimmed area
or pressing Escape ends editing. Feedback occupies the existing gap below the input without
adding a settings row or shifting the Start game button. Mobile IME
preedit may temporarily exceed 20: the counter follows the actual field length,
turns red, and shows “Name will be trimmed” to its left. On composition commit or
blur, normalization restores the limit and clears the warning immediately.
Autocorrection and automatic capitalization are disabled as keyboard hints.
Long scoreboard names use tighter spacing and a modest font reduction (down to
14px), then ellipsis when necessary. The full name remains available to assistive
technology and in the name tooltip.
