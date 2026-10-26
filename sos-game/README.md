# SOS

Version: `beta-6.1`.

A finite-board SOS game against SOS Bot (“vs Bot”) or two players sharing one device.
The default board is 6 × 6; 8 × 8 and 10 × 10 are also available.
Custom boards accept 3–20 rows and columns independently, including rectangles.
Setup orders Game mode, Difficulty (computer only), Board size, P1 name and P2 name
(local multiplayer only). Choosing Custom opens a compact dialog; invalid or out-of-range
values show a warning and disable OK. Cancel keeps the previous size. An applied custom
size appears as Custom (rows × columns) and is remembered with other game preferences.
The custom-size dialog includes a grid preview. Drag its corner with a mouse or
touch, or edit Rows and Columns; both controls stay in sync. With the resize
handle focused, arrow keys adjust the dimensions. A fixed 20 × 20 grid shows the
selected area, anchored at its top-left corner.
Changes apply only after OK.
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
  An internal safeguard also ends play immediately when a player reaches or exceeds
  999 points; this threshold is not shown in the game UI.
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
panels open upward or downward to fit the board, scrolling only their own options
when necessary. They animate open and closed, dimming only the board behind the open options;
reduced-motion preferences skip these animations.

New game in the board's attached footer returns to the game settings. This footer
appears only during an active game, leaving setup and results with one main action.
An unfinished game asks for
confirmation first; Keep playing, Escape, the close icon, or an outside click
preserves it. The computer waits while this confirmation is open.
The square board viewport also accounts for viewport height so the green New game button
fits in short phone and desktop windows.

Name fields appear after Board size in setup (native 20-character input limit, accepting Unicode letters and symbols).
P2's field appears only for local multiplayer, directly below P1's field.
Blank names default to P1 and P2; the computer keeps its own label. Names are saved
with the last applied settings in this browser when a game starts.

## Computer opponent

Choose level 1–5 with the slider, from Easy to Hard. The selected level appears
under the title during bot matches. Local multiplayer has no difficulty label.
Existing Easy, Medium and Hard preferences map to levels 1, 3 and 5.

| Level | Target search depth | Node budget | Random legal move chance | Large-board time budget |
| --- | --- | --- | --- | --- |
| 1 | 1 | 500 | 45% | 50 ms |
| 2 | 2 | 1,500 | 20% | 80 ms |
| 3 | 2 | 3,000 | 0% | 110 ms |
| 4 | 3 | 8,000 | 0% | 160 ms |
| 5 | 4 | 18,000 | 0% | 220 ms |

Levels 1, 3 and 5 preserve the previous Easy, Medium and Hard algorithms.
Level 2 mixes occasional random placements with a smaller two-ply search;
level 4 adds a third ply and a larger budget. These are tactical search settings,
not a guarantee of perfect play or a strict ranking on every position.

A worker runs depth-limited minimax with alpha-beta pruning, ordered by immediate
scoring opportunities. Evaluation combines score difference with the next player's
best immediate score. Extra turns preserve the current player throughout the search.
Every search branch and levels 1–2's random moves obey the per-player letter limit.
Equal choices are randomized. A fixed work budget is divided among legal first
moves; this is a bounded tactical opponent, not an unbeatable solver. When workers
are unavailable, the selected search runs on the main thread.
On grids larger than 100 cells, a global tactical index checks all cells for immediate
scores and updates only lines within two cells of each new move. Cluster-ranked
shortlists include candidates from separate board regions. Iterative deepening retains
the last completed search depth, using the time and node budgets above. Level 5
can search up to four plies, but the completed
depth depends on position and device. These budgets bound search effort, not the
quality of every decision.

Boards exceeding ten rows or columns scroll inside the fixed viewport. Square cells
use a minimum size of viewport width / 10.5, leaving a partial next row/column as a
visual cue. Persistent custom scrollbars show each overflowing axis and allow position
adjustment. A distinct outline marks the actual grid boundary. Touch drags, mouse
drags, trackpad and wheel scrolling pan the board; dragging never selects a square.
Two-finger pinch gestures and a translucent magnifier's slider adjust board zoom.
On desktop, Ctrl/Cmd + scroll over the board zooms around the pointer; ordinary
scrolling still pans, and browser zoom remains available outside the board.
Selecting a square returns smoothly to the default playing size around that square
before opening the picker; reduced motion skips the transition. Smaller rectangles
fit and center without distortion. Setup, results and the New game footer remain
stationary. Offscreen computer placements pan smoothly into view; reduced motion
uses immediate scrolling. Full player names wrap into two lines, adjusting type size
when needed instead of replacing characters with an ellipsis.

Computer responses wait at least 450–650 ms, or 700 ms following a scoring move,
so placements and strikes remain readable; longer computation can extend the wait.

Rules and search are independent of the DOM. The shared page shell supplies theme
controls, navigation, and active-game leave protection. Analytics are optional as described below.
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
Long scoreboard names use tighter spacing and a modest font reduction, wrapping
into two rows without ellipsis. The full name remains available to assistive
technology and in the name tooltip.

## Analytics

Optional anonymous match reports and the private Apps Script receiver are described in
[analytics documentation](analytics/README.md). Collection is disabled until a deployment
configures its endpoint. Player names remain local and are excluded from reports.

The letter picker waits 250 ms after opening or moving to another cell before
accepting a letter. Pointer presses begun during this guard are ignored even when
released later, preventing accidental mobile placements.

## Game guide and privacy

The question-mark icon opens a visual, multi-page guide inside the board. Home,
guide, and theme controls come from the shared page shell. Guide content lives in
`js/tutorial.js`; layout, navigation, and dismissal use `shared/js/tutorial.js`.
Each page uses a game example and a short caption. Clicking the title returns to
the game’s start page, asking first if a run is unfinished.
Data privacy is available before starting, with collection-specific details and
an underlined return link. Disabled analytics are stated explicitly.

Bot placement waits while the guide is open. Its pages cover SOS scoring, extra
turns and each player’s two-letter limit.
