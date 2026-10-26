# Sudoku

Fill a 9×9 grid so that every row, column, and 3×3 box contains the digits 1–9 once.
Starting clues cannot be edited. Select a cell, then use the number pad or keyboard
to enter a digit; Backspace or Delete clears an editable cell.

Choose Start, select Novice, Easy, Medium, or Hard, then press Play. Every served
puzzle is generated in the browser and verified to have exactly one solution.
The label above the timer shows the requested level. A bounded search can deliver
a lower-rated puzzle; the label remains the requested level.

## Playing tools

- Pencil mode (`P`) toggles small notes in empty editable cells.
- Undo (`Ctrl/Cmd+Z`) and redo (`Ctrl/Cmd+Y` or `Ctrl/Cmd+Shift+Z`) navigate edits.
- Save (`S`) creates a checkpoint; later saves ask before overwriting it.
- Load (`L`) asks before restoring the checkpoint. The timer keeps running.
- The Menu contains New puzzle, Solve puzzle, conflict checking, and Manual mode.
- Solve puzzle asks for confirmation, then reveals the solution with an animation.

Conflict checking highlights duplicate digits in rows, columns, and boxes; it does
not compare entries with the solution. Re-entering the same conflicting digit clears
it when checking is enabled. Number-pad dots count digit occurrences up to nine.
Completed, conflict-free digits are muted on the pad. Selecting a filled cell or
entering a digit highlights matching full-size digits, excluding pencil notes.

Manual mode disables undo/redo, checkpoints, conflict checking, matching-number
highlights, and number-pad progress dots. Pencil notes and the solver remain
available. Changing modes during play requires confirmation and starts a new puzzle.
Manual mode resets after refresh; the conflict-check preference is saved locally.

The timer continues during confirmations and while the tab is hidden. A completed
puzzle shows a board celebration and elapsed time. Checkpoints and the active game
are held in memory; the persistent puzzle cache contains unplayed puzzles, not saved
progress.

## Puzzle preparation and storage

Fresh puzzles are prepared in a background worker and cached across sessions when
IndexedDB is available. Storage failures fall back to memory. On supported browsers,
a screen wake lock extends thinking time until five minutes after the last interaction;
the device's normal timeout then applies.

- [Difficulty and generation](DIFFICULTY.md): grading techniques, uniqueness checks,
  search limits, caching, loading, and wake-lock behavior.
- [Analytics](analytics/README.md): optional run summaries and receiver setup.

Serve the repository root and open `sudoku-game/`. See the
[collection README](../README.md) for local preview, testing, and publishing.

## Collection navigation

The current version is `beta-5.2`. The shared page shell supplies theme controls and
Back to Homepage. Leaving an unfinished puzzle asks for confirmation; the timer
continues during the in-page dialog. Ready and completed puzzles do not prompt.

Refresh opens directly to the start scene while puzzle caching warms in the
background. Starting any puzzle uses the in-board loading view, including cache hits.

## Game guide and privacy

The question-mark icon opens a visual, multi-page guide inside the board. Home,
guide, and theme controls come from the shared page shell. Guide content lives in
`js/tutorial.js`; layout, navigation, and dismissal use `shared/js/tutorial.js`.
Each page uses a game example and a short caption. Clicking the title returns to
the game’s start page, asking first if a run is unfinished.
Data privacy is available before starting, with collection-specific details and
an underlined return link. Disabled analytics are stated explicitly.

The timer continues while the guide is open. Its pages cover the grid rules,
fixed clues and pencil notes.
