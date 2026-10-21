# SOS analytics

Optional anonymous match reports. Public source builds default to disabled collection;
SOS remains playable offline or when storage and uploads fail. No persistent visitor
identifier is created. Custom player names remain in local preferences and are never
included in reports.

## Report format

Schema 2 stores one cumulative run record with:

- Random run ID and increasing revision; game/rules version, source build fingerprint,
  environment (`development`, `preview`, `production`, or `unknown`), and coarse device
  category/input/viewport bands.
- Separate rows and columns (3–20 each), computer or local multiplayer mode, computer difficulty (null for local
  games), and randomized starting player (`0` is P1, `1` is P2 or SOS Bot).
- Explicit UTC start/update/end timestamps, elapsed milliseconds and foreground time.
- Outcome: `in_progress`, `completed`, or an explicitly confirmed `restarted` match.
- Compact moves: `[cell_index, letter_code, elapsed_ms]`. Cells use row-major indices (`row * columns + column`);
  `0` means S and `1` means O. The elapsed value is measured from match start, including
  hidden-tab time. Reconstruct approximate UTC event timestamps by adding it to
  `started_at`; wall-clock adjustments can cause differences from update timestamps.
- Aggregated computer work: applied decisions, computation milliseconds, visited search
  nodes, decisions hitting an allocated search budget, and random easy-mode decisions.
  Artificial presentation delays and moves discarded after a restart are excluded.

The initial board is empty. Player ownership, points, strikes, winner, scoring-move
counts and multi-line moves can be reconstructed by replaying `rectangular-v2`:
score one point per new SOS line, retain the turn after scoring, and allow no more than
two consecutive placements of the same letter by each individual player. Scores and
strikes are not duplicated as events. Streak length/point summaries are not collected.

Names, free text, emails, accounts, location, referrers, URLs, raw user agents, exact
screen dimensions, picker interactions and pointer movements are excluded. Random run
IDs deduplicate uploads; they do not identify a tester across matches.

Schema 1 square-board reports remain accepted: they use a single `size` (4, 6, 8,
10) and `per-player-limit-v1`. Older queued reports can share a batch with new reports;
existing archives retain their original schema, and a run cannot change schemas or
dimensions between revisions. Schema 2 has at most 400 moves per report.

## Delivery and retention

Persist snapshots at Start and after every placement. Upload at Start, every 60 seconds,
visibility/pagehide/online events, and completion or confirmed restart. Unfinished reports
remain `in_progress`; closing a tab is not proof of deliberate abandonment. A terminated
browser can lose changes if its storage is unavailable. Foreground time excludes hidden
tab periods; it does not prove a person was actively thinking or interacting.

Per-run localStorage keys prevent tabs from replacing one another's queue. Keep at most
100 reports / 200,000 UTF-8 JSON bytes, dropping the oldest at capacity. Requests contain
at most 20 reports and 60,000 UTF-8 bytes. Failures retain queued reports and retry with
bounded backoff. Acknowledgements remove only the revision actually sent. Offline
reports are retried when a configured game page is open and connectivity returns.

## Receiver and safeguards

The standalone Apps Script receiver executes as its owner and accepts anonymous POSTs.
GET exposes only public health metadata. It writes one private
`sos_run_<run_id>.json.gz` archive per match, replacing it with higher revisions via the
advanced Drive v3 service. Exact retries and older revisions are acknowledged; conflicting
revisions, changed setup, rewritten move prefixes and mutations after completion/restart
are rejected. Drive can retain underlying revisions beyond the visible file.

Validation allowlists all fields and bounded enums, durations and counters. Replaying
moves checks empty cells, legal letters, extra turns, completion and computer decision
counts. Unknown caller fields are discarded. These are consistency checks, not player
authentication or an anti-cheat system.

A script lock, token bucket (burst 30, refill 0.5/second), emergency `INGEST_ENABLED=false`
property and fail-closed write ledger bound storage work. Defaults: 1 GB / 1,000,000
cumulative writes and 20 MB / 5,000 daily writes, with Asia/Jakarta day boundaries.
Every create/replacement reserves its full compressed bytes and one write before Drive
is called. Uncertain failures retain reservations; deletion does not refill budgets.
Anonymous requests can still consume Apps Script execution quotas even when rejected.

## Setup

1. Create a private, empty destination folder and a standalone Apps Script project.
2. Upload `apps-script/Code.gs` and the supplied `appsscript.json` manifest. Add a private
   `Config.gs` containing `const DEPLOYED_FOLDER_ID = 'YOUR_FOLDER_ID';`, or set the
   `DESTINATION_FOLDER_ID` script property. Never commit private folder/deployment state.
3. Enable the advanced Drive v3 service and its Google Cloud API if required. In the
   editor, run **verifySetup** and grant permissions. It verifies Drive and initializes
   the write ledger once; rerunning preserves spent capacity. Never delete the ledger
   to reset limits. A first initialization requires an empty destination folder.
4. Create a versioned web app deployment, executing as yourself with access for Anyone.
   Verify public health, a real browser upload, compressed Drive readback, exact retry
   and higher-revision replacement before relying on collection.
5. For the restricted preview server, put only the public endpoint in ignored
   `sos-game/private/analytics-config.json`: `{"analyticsEndpoint":"https://…/exec"}`.
   For production, set `SOS_ANALYTICS_ENDPOINT`. `SOS_ENVIRONMENT` can override automatic
   environment detection. The export generates an independent SOS source fingerprint.

Keep endpoint configuration empty until owner verification is complete. The underlined
Data privacy link beneath Start opens a short statement inside the board, reflects
whether analytics are configured, and returns to the unchanged setup.
