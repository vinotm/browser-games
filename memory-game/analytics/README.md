# Memory analytics

Optional cumulative run summaries. Public clones and ordinary builds default to
analytics disabled. No persistent tester ID, card layout or individual flip
history is collected. Collection failures must not interrupt the game.

## Schema 1

Each run records:

- Random run ID, revision, game version, `shapes-colors-sizes-v1` rules version,
  source fingerprint and development/preview/production environment.
- Coarse device category, input type and viewport band; no raw user agent or
  exact screen dimensions.
- Rows, columns, total pairs, blocked-cell count, shape/color/size counts and
  number of distinct matching identities. No shuffled positions or blocked index.
- UTC start/update/end timestamps, elapsed milliseconds and foreground milliseconds.
  Elapsed time includes thinking, confirmations and hidden-tab time, matching the
  game timer; foreground time excludes hidden periods.
- Outcome: `in_progress`, `completed`, or `restarted` after confirmed New game.
  Navigation/unload preserves an in-progress snapshot; it is not reliable evidence
  of deliberate abandonment or a live player.
- Cumulative moves (two-card attempts), matched pairs, accepted card reveals,
  mismatched attempts, distinct revealed positions (count only), and mismatches
  closed early by revealing another face-down card. Ignored clicks are not counted.

Completed-run `moves / pairs_total` measures attempts per pair; 1 is the minimum.
Compare this alongside variant counts and board dimensions. Partial-run efficiency
is affected by progress and should not be compared directly with completion scores.

## Delivery

Save a snapshot at Start, every 15 seconds, completion, confirmed restart, visibility
changes and pagehide. Snapshot updates replace the same run archive. Uploads batch
up to 20 records and 60 KB. The local retry queue is limited to 100 snapshots / 200 KB;
malformed entries are skipped, failures back off, and only acknowledged revisions
are removed. A random ID identifies a run, not a person. Browser storage denial,
offline play, missed unload delivery and queue eviction can leave incomplete data.

## Apps Script receiver

`apps-script/Code.gs` writes one `memory_run_<run_id>.json.gz` archive per run to a
private destination folder. The archive contains the latest validated run, receipt
UTC timestamp and canonical SHA-256. Unknown fields are stripped. There is no report
read endpoint or browser credential; public GET returns health metadata only.

Hardening follows the existing receivers: strict schema and cumulative-counter
checks, immutable setup fields and terminal reports, revision idempotency, script
lock, token bucket (30-request burst, 0.5 requests/second), 60 KB request bound,
maximum 20 runs/batch, 5,000 writes / 20 MB daily and 1,000,000 writes / 1 GB lifetime.
Budgets count writes including replacements and reserve capacity before writes;
deleting files does not reset them. Missing/corrupt budgets fail closed. These are
application limits, not protections against exhausting Google's request quotas.
Client reports are untrusted; consistency checks cannot authenticate genuine play.

Run `verifySetup` once in the editor to authorize Drive, verify the advanced Drive
service and initialize budgets against an empty destination. Rerunning is idempotent.
Editor-only `inspectAnalyticsBudget` displays budgets; script property
`INGEST_ENABLED=false` stops ingestion. `DESTINATION_FOLDER_ID` overrides deployment
configuration. Keep folders and project private; never publish a report read API.

## Configuration

`analytics-config.json` contains an empty endpoint in public source. The build reads
`MEMORY_ANALYTICS_ENDPOINT` and optional `MEMORY_ENVIRONMENT`, emits only public
configuration and includes a source fingerprint. Preview uses the ignored per-game
private override. Credentials, folder IDs, deployment state and OAuth helpers stay
outside the public site. The source receiver is contributor-facing but excluded
from `dist`. Enable the local endpoint only after verifying setup; production
activation is a separate deployment action.
