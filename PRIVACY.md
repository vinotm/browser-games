# Gameplay analytics and privacy

The games run in the browser. Analytics are optional and disabled by default in
public source builds. A deployment can enable small, anonymous gameplay reports to
help improve game balance, controls, and puzzle preparation. Its in-game Data privacy
view states whether reporting is enabled and explains that game's collection.

Reports can include random run IDs, timestamps, broad device categories, game/build
versions, scores or puzzle progress, outcomes, and feature usage. Snake records game
events; Sudoku records cumulative summaries, the initial puzzle, and generation
metadata. SOS records compact match moves and summarized computer search work. The clients do not collect names, email addresses, accounts, persistent
visitor IDs, location, raw user agents, or exact screen dimensions. Sudoku does not
send entered answers, pencil notes, or a move history.

Memory optionally records cumulative board, timing and progress summaries. It does
not report shuffled layouts, individual flips or the positions of revealed cards.

Reports are stored privately by the configured receiver. Pending reports may be saved
in browser storage and retried when connected; bounded queues can drop older reports.
Gameplay continues when collection is disabled, storage is unavailable, or uploads
fail. The hosting and receiver providers can process network request metadata as part
of delivering their services; the game report schema does not include that metadata.

Preferences, scores, and unplayed puzzle caches may also use browser storage. The
puzzle cache is separate from analytics and is used to reduce waiting time.

- [Snake report format and receiver](snake-game/analytics/README.md)
- [Sudoku report format and receiver](sudoku-game/analytics/README.md)
- [SOS report format and receiver](sos-game/analytics/README.md)
- [Memory report format and receiver](memory-game/analytics/README.md)

Anyone deploying an analytics-enabled copy should review its actual collection,
receiver access, retention policy, and disclosures. The MIT source license permits
reuse; this document describes product behavior and deployment guidance rather than
adding conditions to that license.
