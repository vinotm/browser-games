# Difficulty and puzzle preparation

Start or confirm a new game, select Easy, Medium, or Hard on the board, then press
Play. Play appears only after a selection; each new setup starts unselected.
Restarts caused by changing game settings use the same difficulty-selection screen.
Difficulty is a setup choice, not a badge during play. The actual served rating is
recorded in optional analytics; a fallback does not display a notice.

## Logical rating

`js/difficulty.js` uses human-style deductions in a fixed order, restarting with
singles after each step. Candidate eliminations remain in effect. It never guesses.

| Level | Supported techniques |
| --- | --- |
| Easy | Naked singles, hidden singles |
| Medium | Easy techniques, pointing/claiming locked candidates, naked and hidden pairs |
| Hard | Medium techniques, naked and hidden triples, row/column X-Wing |

`gradePuzzle(board)` accepts 81 integers with zero for empty cells. It leaves the
input unchanged and returns `status`, `difficulty`, `hardestTechnique`, technique
counts, remaining empty cells, and rating version `logic-v1`. Status is `solved`,
`unclassified`, or `invalid`; malformed input throws. Unclassified does not mean
Expert or non-unique. Optional `maxLevel` restricts techniques and `includeSteps`
returns deductions and the final working board.

The rating reflects the highest technique used on this solver's path, not a
universal Sudoku standard or proof of the shortest human solution. Technique
order can affect the label.

## Fresh generation

`js/difficulty-generator.js` constructs complete grids with randomized MRV
backtracking. After each tentative clue removal it tries the requested technique
set. A removal that prevents that solver from finishing is restored. Promising
intermediate boards can be revisited before starting another fresh grid.

A direct success must match the requested rating and contain at most 36 clues by
default. The independent solution counter must confirm exactly one solution.
Clue count varies with the search and does not define difficulty. There is no
stored seed puzzle, puzzle bank, server, or persistent puzzle cache in this path.

`createDifficultyPuzzle(level, options)` returns a success with puzzle, grade and
statistics, or an explicit exhausted result without a fallback. Default library
limits are 10 seconds, 100 removal passes and 6,000 grading checks. The game uses
a shorter foreground budget described below. Bounds are cooperative: a running
operation may finish slightly beyond a limit.

`createDifficultySearch` exposes the same search as an iterator, yielding between
clue-removal checks. Workers advance it in short slices so foreground requests
can interrupt background work. `onCandidate` receives independent lower-level
snapshots at the clue limit, including their grade, generation time and source
ID. A source identifies one complete grid within a search. `shouldStop` enables
cooperative cancellation; `return()` discards suspended work.

## Serving and background queues

`generator-worker.js` owns a `puzzle-service.js` instance. The game uses a single
persistent worker through `puzzle-client.js`:

- Return an available requested-level puzzle immediately.
- Otherwise search for up to two seconds. Retain useful lower-level candidates.
- If the requested level is still unavailable, choose the highest available lower
  level, then its longest-generated candidate. Verify uniqueness before serving.
- If no candidate is available, offer an in-board retry rather than an invalid grid.
- Start preparing five puzzles per level in memory as soon as the page initializes,
  before Start, difficulty selection, or Play. Continue replenishing after serving. Prioritize the highest
  underfilled level and retain lower-level candidates from the same search.

Each level retains at most five distinct complete grids, sorted by generation
time. Later masks from the same grid replace its earlier candidate. Serving a
grid evicts related masks from the other levels, preventing repeats of the same
solution at another difficulty. Generation time is a retention tiebreaker, not a
human difficulty score.

Background work yields roughly every 12 ms and pauses while the tab is hidden.
It resumes when visible and stops when all queues are full. Refreshing discards
all prepared puzzles. Queues need not be full before playing; Hard can remain
underfilled and may require fallback.

Every new game uses the loading animation inside the board, preserving toolbar
and pad positions, including cached puzzles. It stays visible for a random
500–1000 ms or until the puzzle is ready, whichever takes longer, then fades out.
Decorative loading and
fade durations are excluded from puzzle serve analytics. There is no visible
current-difficulty or fallback label during play.

## Timing definitions

`generationMs` measures elapsed search time since the candidate's complete grid
began, including clue-removal attempts and cooperative yields, excluding ready
queue residence. Observed candidates receive an independent uniqueness check
before they are served.

A memory hit has `serveMs: 0`, even though worker messaging takes a small amount
of real time. A search or fallback records request-to-result latency, including
worker startup and verification, but excluding loading-animation minimums and
fades. See [analytics](analytics/README.md) for archived field names and compatibility.
