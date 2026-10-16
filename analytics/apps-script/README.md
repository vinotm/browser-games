# Optional gameplay analytics receiver

This Google Apps Script web app accepts JSON event batches and writes immutable,
gzip-compressed archives to a private Google Drive folder. It does not provide a
public endpoint for reading archived data. The games can run with analytics disabled.

## Setup

1. Create a private Drive folder for reports.
2. Create an Apps Script project and add [Code.gs](Code.gs) and [Setup.gs](Setup.gs).
3. Enable the manifest editor and use [appsscript.json](appsscript.json).
4. In project settings, add script property `DESTINATION_FOLDER_ID` containing the
   destination folder's ID. Keep this setting out of browser code and version control.
5. Set script property `INGEST_ENABLED` to `false`. For a **new, empty folder** only,
   run `initializeNewAnalyticsBudget` in the editor. This refuses existing ledgers
   and nonempty destinations. Never delete a ledger to reset spent capacity.
6. Run `verifySetup` in the editor and authorize Drive access as the folder owner.
7. Deploy a web app that executes as the owner and allows anonymous submissions.
8. Set `INGEST_ENABLED` to `true`. Set `SNAKE_ANALYTICS_ENDPOINT` to the deployment's `/exec` URL when building the site.

The endpoint URL is public. Folder permissions remain private. An anonymous endpoint
can receive fabricated data or spam; it is not an anti-cheat system. Apps Script
execution quotas and Drive storage limits apply. Set script property `INGEST_ENABLED`
to `false` to suspend ingestion.

## Receiver safeguards

The receiver limits valid attempts globally to a burst of 60, replenishing one token
per second. Duplicate attempts also consume tokens. Archive creation is limited to
5,000 files / 50 MB per Asia/Jakarta calendar day and a cumulative 1,000,000 files /
1 GB (decimal bytes). Change `HARDENING` deliberately for a different budget.

A script-lock-protected Script Properties ledger reserves compressed bytes and file
counts before Drive writes. Uncertain write failures retain reservations. Missing,
corrupt or mismatched ledgers block ingestion; deleting files does not restore
allowance. Manual uploads and unrelated Drive files are outside this accounting.
Run `inspectAnalyticsBudget` in the editor to inspect the ledger privately.

For an existing receiver, preserve its initialized ledger when updating source or
published versions. Migrating an older receiver without a ledger requires a separate,
audited migration: stop POST processing, wait beyond the maximum execution runtime,
verify two identical folder inventories, and seed counters conservatively from those
inventories. The fresh-folder initializer intentionally cannot perform this migration.
Do not publish the old receiver again: it bypasses the new budget controls.

Only supported event types and report fields are accepted; unknown report fields are
discarded and supported values are validated. Older archive digests remain recognized
for retries. When adding gameplay telemetry, update these allowlists and tests too.

Rejections include `rate_limited`, `daily_limit`, `storage_limit`, and
`budget_unavailable`. The client retains rejected batches and uses its existing bounded
retry queue. These controls do not authenticate players, provide per-IP throttling, or
prevent incoming requests from consuming Apps Script execution quotas.

## Event format

See [schema 2](example-batch-v2.json) for the current format and
[schema 1](example-batch.json) for legacy compatibility.

Each batch includes `schema_version`, `game`, `game_version`, `batch_id`, `sent_at`,
and a `runs` array. Each run has a stable random `run_id`, start/end timestamps,
status (`partial`, `completed`, or `abandoned`), summary, events, and optional coarse
device categories. Names, account identifiers, credentials, and precise location do
not belong in reports.

Schema 2 events contain:

| Field | Meaning |
|---|---|
| `seq` | Increasing sequence within the run, continuing across chunks |
| `type` | Event name in lowercase snake_case |
| `elapsed_ms` | Milliseconds since run start, including pauses |
| `active_ms` | Active-play milliseconds, excluding pauses |
| `object_id` | Optional stable identifier linking an object's lifecycle |
| `details` | Optional event-specific fields |

Reconstruct an event's UTC timestamp with
`new Date(Date.parse(run.started_at) + event.elapsed_ms).toISOString()`.
Keep active time separate: adding it to run start would omit pauses. Run and receipt
timestamps use explicit UTC offsets. Schema 1 retains full per-event `occurred_at`
timestamps and remains accepted for pending uploads from older clients.

Events cover run start/end, pause/resume, item spawn/collection/expiry/removal, effect
changes, and wall scheduling/warning/materialization/cancellation. Food events include
combo counts; `summary.max_combo` records the run maximum. There are no per-frame
movement events. Coordinates use two decimal places, timing details use integer
milliseconds, and empty fields are omitted in schema 2.

### Release, environment, and fatal collisions

`game_version` identifies the gameplay release. Every new run also records
`summary.build_id` (a public-source fingerprint, such as `sha256-1234567890abcdef`)
and `summary.environment` (`development`, `preview`, `production`, or `unknown`).
These persist across partial chunks, retries, and reload recovery. Filter by both
environment and build before comparing gameplay changes. Earlier runs without
these fields have an unknown origin; they cannot be reliably labelled retroactively.

Completed runs record `death_cause`. Fatal moves also include `collision_cell`,
the attempted grid coordinate. For wall deaths, `wall_id` links to the existing
`wall_warning` and `wall_solid` events, and `wall_source` is `milestone` or
`expired_food`. These fields appear in both the final summary and `run_ended`
details. A filled-board win has no collision cell. No movement stream is added.

The metadata uses existing schema 2 summary/detail objects, so the receiver needs
no schema migration. Older tabs keep their original version and metadata when
pending reports upload after a deployment. These labels describe the served build,
not the player's identity, and are not authenticated claims.

Device metadata uses only these categories:

- `category`: `desktop`, `mobile`, `tablet`, or `unknown`.
- `input`: `mouse`, `touch`, `mixed`, or `unknown`.
- `viewport`: `small`, `medium`, `large`, or `unknown`.

These are browser-derived estimates. Raw user agents and exact dimensions are not
stored. Client-reported scores and timestamps are not trusted measurements.

## Uploads and archives

The browser sends compact JSON using a `text/plain;charset=UTF-8` POST. A successful
response is `{ "ok": true, "batch_id": "...", "duplicate": false }`.
A retry can return `duplicate: true`. Check the JSON `ok` field: validation errors
also return JSON and do not necessarily use an HTTP error status. ContentService
redirects must be followed; verify response readability from the deployed origin.
An opaque `no-cors` response does not acknowledge persistence.

Limits per submission: 256 KiB UTF-8, 50 runs, and 2,000 events. The browser uploader
creates a partial chunk after 150 events or about 32 KB, and when a page is hidden
or closed. A run can span several files. Join chunks by `run_id`, order by `seq`,
and deduplicate events by `(run_id, seq)` during analysis.

Each accepted batch creates `snake_batch_<batch_id>.json.gz` containing compact JSON,
a server-generated UTC `received_at`, and a SHA-256 payload digest. A script lock,
deterministic filenames, and digest checks prevent duplicate uploads. Retry with the
same batch ID, sent time, and payload. Conflicting payloads return
`batch_id_conflict`. Legacy `.json` archives are also checked for duplicates; they
are not automatically rewritten. Renaming or deleting an archive removes its
filename-based duplicate marker.

Pending uploads are persisted locally and removed only after a matching JSON
acknowledgement. Retries use backoff, reconnection events, and game completion.
The local queue holds up to 50 batches / about 500 KB and drops its oldest queued
batches when full. Offline play, denied storage, and upload failures do not block play.
Disabling analytics leaves gameplay available and prevents new collection.

## Read a downloaded archive

```sh
gunzip -c snake_batch_EXAMPLE.json.gz | python3 -m json.tool
```

Or in Python:

```python
import gzip
import json

with gzip.open("snake_batch_EXAMPLE.json.gz", "rt", encoding="utf-8") as archive:
    batch = json.load(archive)
```

Gzip reduces stored bytes, not the number of files. It is compression, not encryption;
privacy comes from Drive permissions. The browser sends ordinary JSON, so gzip
storage does not require a browser compression library.

## Validation

Run `npm test` at the repository root for receiver validation, gzip round trips,
legacy compatibility, duplicate/conflicting retries, and offline delivery tests.
These tests use synthetic data and do not contact Google. A deployment also needs
an end-to-end submission from its own hosting origin and private Drive readback.

## References

- [Apps Script web apps](https://developers.google.com/apps-script/guides/web)
- [ContentService](https://developers.google.com/apps-script/guides/content)
- [Utilities: gzip and ungzip](https://developers.google.com/apps-script/reference/utilities/utilities)
- [Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas)
