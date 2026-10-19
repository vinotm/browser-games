# Sudoku analytics

Optional anonymous cumulative summaries, independent of Snake's event receiver. Game
logic works offline and without analytics configuration. No player account or persistent
visitor identifier is created.

Each attempt receives a random run ID. A summary contains the initial puzzle as an
81-character row-major string (`0` means no clue), clue count, generator/game versions,
source build fingerprint, environment, coarse device category, conflict-check setting,
Manual mode flag,
UTC timestamps, elapsed/foreground time, current and peak filled editable cells, outcome,
and feature counters. Counters cover entries, erases, note edits, pencil toggles,
undo/redo, checkpoint saves/restores, and conflicting entries when checking is enabled.
Filled cells measure progress, not answer correctness. Pencil notes and all player-entered
values are excluded; there is no move history, solution, raw user agent, location, hostname,
referrer, or identity shared between attempts.

Snapshots are saved at Start, every 60 seconds, on visibility/pagehide/online events,
and when the run finishes. Outcomes are `completed`, `solver_revealed`, `restarted`,
`settings_changed`, or `in_progress`. An old `in_progress` report is unfinished; it is
not proof that a player abandoned the game at its last snapshot. Foreground time excludes
hidden-tab time; the displayed game timer continues while hidden and during confirmations.
Browser termination can lose activity since the last snapshot.

Pending reports use per-run localStorage keys, preventing tabs from overwriting one
shared queue. At most 100 reports / approximately 200 KB are retained; oldest reports
are dropped at the limit. Denied storage, offline use and network failures do not block
play. Explicit acknowledgements remove only the revision actually sent. Failed uploads
retry with bounded backoff; page-exit requests use keepalive and retain unacknowledged data.

## Receiver

`apps-script/Code.gs` is deployed as its owner, with anonymous POST access. Its only GET
response is public health metadata. A server-selected private Drive folder receives one
`sudoku_run_<run_id>.json.gz` file per attempt. Higher revisions replace its content through
the advanced Drive v3 service. Exact retries and older revisions are acknowledged without
rewriting; conflicting revisions and mutations of a completed report are rejected. Batches
can contain up to 20 summaries and are limited to 60,000 UTF-8 bytes. Partial batch retries
are safe. Drive may temporarily retain file revisions; one visible file does not imply
there are no underlying revisions.

Validation allowlists fields and enums, strips unknown metadata, and bounds counters,
progress, durations and timestamps. Gameplay claims are client reports, not verified
competitive scores. A script lock, token bucket, emergency `INGEST_ENABLED=false` property,
and fail-closed write budget bound resource usage. Budgets reserve before every create or
replacement: 1 GB / 1,000,000 cumulative writes, and 20 MB / 5,000 daily writes with
Asia/Jakarta day boundaries. Bytes are conservatively charged in full on replacement;
uncertain failures and deletion do not replenish allowances. Anonymous requests still
consume Google execution quotas even when rejected.

## Setup

Create a standalone script project in a private folder, enable the advanced Drive v3
service using the supplied manifest, and upload `Code.gs` plus a private `Config.gs`:

```js
const DEPLOYED_FOLDER_ID = 'YOUR_PRIVATE_EMPTY_FOLDER_ID';
```

Create a versioned web app deployment as yourself, accessible to Anyone. In the editor,
select **verifySetup** and click **Run**, then grant access. This verifies Drive and
initializes its budget once; rerunning does not reset it. The first initialization
requires an empty destination folder. Do not delete its budget property to reset usage.

For the restricted preview server, put the public endpoint in the ignored
`sudoku-game/private/analytics-config.json` as `{"analyticsEndpoint":"https://…/exec"}`.
For production builds, set `SUDOKU_ANALYTICS_ENDPOINT` in the hosting environment.
`SUDOKU_ENVIRONMENT` optionally overrides `production`, `preview`, or `development`.
Public clones default to disabled collection. Private folder IDs and OAuth credentials
are never included in the site export.

After authorization, verify a real browser upload, compressed Drive readback, an exact
retry, and a higher-revision replacement before relying on collection. The privacy link
below Start explains collection within the board.

Manual mode is a per-page choice that resets to off after refresh. It suppresses undo/redo,
checkpoints, conflict checking and matching-number highlights, while retaining pencil notes
and the solver. A confirmed change during play starts a new attempt with outcome
`settings_changed` for the previous run. The conflict-check preference remains unchanged.
Reports predating the mode field are interpreted as standard mode.
