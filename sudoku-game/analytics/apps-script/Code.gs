/* Anonymous Sudoku summaries. No gameplay read endpoint or browser credentials. */
const HARDENING = Object.freeze({ version: 'sudoku-summary-v1',
  bytes: 1000000000, files: 1000000, burst: 30, perSecond: 0.5,
  dailyFiles: 5000, dailyBytes: 20000000, lockMs: 1000 });
const BUDGET_KEY = 'ANALYTICS_BUDGET_V1';
const MAX_BODY = 60000;
const MAX_DURATION = 365 * 24 * 60 * 60 * 1000;
const COUNTERS = ['entries', 'erases', 'note_edits', 'pencil_toggles', 'undos', 'redos',
  'checkpoint_saves', 'checkpoint_restores', 'conflict_entries'];
function doGet() {
  return jsonResponse_({ ok: true, service: 'sudoku-analytics', schema_version: 1, storage: 'json.gz' });
}
function doPost(e) {
  let lock;
  try {
    const properties = PropertiesService.getScriptProperties();
    require_(properties.getProperty('INGEST_ENABLED') !== 'false', 'disabled');
    const folderId = receiverFolderId_(); require_(folderId, 'not_configured');
    const raw = e && e.postData && e.postData.contents;
    require_(typeof raw === 'string' && raw.length > 0, 'empty_body');
    require_(raw.length <= MAX_BODY && Utilities.newBlob(raw).getBytes().length <= MAX_BODY, 'batch_too_large');
    let input; try { input = JSON.parse(raw); } catch (_) { reject_('invalid_json'); }
    const batch = validateBatch_(input);
    lock = LockService.getScriptLock(); require_(lock.tryLock(HARDENING.lockMs), 'busy');
    require_(properties.getProperty('INGEST_ENABLED') !== 'false', 'disabled');
    const state = budgetState_(properties, folderId), now = Date.now();
    state.tokens = Math.min(HARDENING.burst, state.tokens + Math.max(0, now - state.token_at) / 1000 * HARDENING.perSecond);
    require_(state.tokens >= 1, 'rate_limited'); state.tokens--; state.token_at = Math.max(now, state.token_at);
    properties.setProperty(BUDGET_KEY, JSON.stringify(state));
    const folder = DriveApp.getFolderById(folderId);
    for (const run of batch.runs) {
      const name = 'sudoku_run_' + run.run_id + '.json.gz';
      const matches = folder.getFilesByName(name);
      const file = matches.hasNext() ? matches.next() : null;
      const digest = digest_(run);
      if (file) {
        require_(file.getSize() <= MAX_BODY, 'invalid_existing_archive');
        const stored = JSON.parse(Utilities.ungzip(file.getBlob()).getDataAsString('UTF-8'));
        const previous = stored.run;
        require_(previous && previous.run_id === run.run_id, 'invalid_existing_archive');
        for (const field of ['started_at', 'initial_clues', 'game_version', 'generator_version', 'build_id', 'environment', 'check_conflicts']) {
          require_(previous[field] === run[field], 'run_id_conflict');
        }
        require_((previous.manual_mode ?? false) === (run.manual_mode ?? false), 'run_id_conflict');
        for (const field of ['requested_difficulty', 'given_difficulty', 'puzzle_generation_ms', 'puzzle_serve_ms', 'difficulty_version']) {
          require_(previous[field] === run[field], 'run_id_conflict');
        }
        if (previous.revision > run.revision) continue;
        if (previous.revision === run.revision) {
          require_(stored.payload_sha256 === digest, 'revision_conflict'); continue;
        }
        require_(previous.outcome === 'in_progress', 'run_already_finished');
        require_(Date.parse(run.updated_at) >= Date.parse(previous.updated_at), 'invalid_revision');
        for (const field of ['elapsed_ms', 'wall_elapsed_ms', 'foreground_ms', 'peak_filled']) require_(run[field] >= previous[field], 'invalid_revision');
        for (const field of COUNTERS) require_(run.counters[field] >= previous.counters[field], 'invalid_revision');
      }
      const archive = { schema_version: 1, game: 'sudoku', received_at: new Date(now).toISOString(),
        payload_sha256: digest, run };
      const blob = Utilities.gzip(Utilities.newBlob(JSON.stringify(archive), 'application/json'), name);
      const size = blob.getBytes().length;
      require_(size <= MAX_BODY, 'archive_too_large');
      const day = Utilities.formatDate(new Date(now), 'Asia/Jakarta', 'yyyy-MM-dd');
      if (day > state.day) { state.day = day; state.day_files = 0; state.day_bytes = 0; }
      // Conservative cumulative WRITE budgets (including replacements), not current folder size.
      // Reserve first and retain the reservation on uncertain failures. Deletion never refills it.
      require_(state.files + 1 <= HARDENING.files && state.bytes + size <= HARDENING.bytes, 'storage_limit');
      require_(state.day_files + 1 <= HARDENING.dailyFiles && state.day_bytes + size <= HARDENING.dailyBytes, 'daily_limit');
      state.files++; state.bytes += size; state.day_files++; state.day_bytes += size;
      properties.setProperty(BUDGET_KEY, JSON.stringify(state));
      if (file) Drive.Files.update({}, file.getId(), blob, { fields: 'id' });
      else folder.createFile(blob);
    }
    return jsonResponse_({ ok: true, batch_id: batch.batch_id });
  } catch (error) {
    return jsonResponse_({ ok: false, error: error && error.ingestCode || 'storage_error' });
  } finally { if (lock && lock.hasLock()) lock.releaseLock(); }
}

function digest_(batch) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(batch),
    Utilities.Charset.UTF_8).map((b) => ((b + 256) % 256).toString(16).padStart(2, '0')).join('');
}

function budgetState_(properties, folderId) {
  let state;
  try { state = JSON.parse(properties.getProperty(BUDGET_KEY)); } catch (_) { reject_('budget_unavailable'); }
  require_(object_(state) && state.version === 1 && state.folder_id === folderId, 'budget_unavailable');
  for (const field of ['files', 'bytes', 'day_files', 'day_bytes', 'token_at']) {
    require_(Number.isSafeInteger(state[field]) && state[field] >= 0, 'budget_unavailable');
  }
  require_(Number.isFinite(state.tokens) && state.tokens >= 0 && state.tokens <= HARDENING.burst &&
    typeof state.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(state.day), 'budget_unavailable');
  return state;
}

// Editor-only administration. No public endpoint exposes counters or private folder metadata.
function inspectAnalyticsBudget() {
  console.log(JSON.stringify(budgetState_(PropertiesService.getScriptProperties(), receiverFolderId_())));
}

function receiverFolderId_() {
  return PropertiesService.getScriptProperties().getProperty('DESTINATION_FOLDER_ID') ||
    (typeof DEPLOYED_FOLDER_ID === 'string' ? DEPLOYED_FOLDER_ID : '');
}

// Run once in the Apps Script editor to authorize Drive and verify the folder.
function verifySetup() {
  const id = receiverFolderId_();
  require_(id, 'not_configured');
  const folder = DriveApp.getFolderById(id);
  const properties = PropertiesService.getScriptProperties();
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    if (!properties.getProperty(BUDGET_KEY)) {
      require_(!folder.getFiles().hasNext(), 'destination_must_be_empty');
      const now = Date.now();
      properties.setProperty(BUDGET_KEY, JSON.stringify({ version: 1, folder_id: id,
        files: 0, bytes: 0, day_files: 0, day_bytes: 0,
        day: Utilities.formatDate(new Date(now), 'Asia/Jakarta', 'yyyy-MM-dd'),
        tokens: HARDENING.burst, token_at: now }));
    }
    budgetState_(properties, id);
    // Verify the enabled advanced service as well as DriveApp authorization.
    Drive.Files.get(id, { fields: 'id,mimeType' });
    console.log('Sudoku analytics ready: ' + folder.getName());
  } finally { lock.releaseLock(); }
}


function object_(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function require_(condition, code) { if (!condition) reject_(code); }
function reject_(code) { const error = new Error(code); error.ingestCode = code; throw error; }
function jsonResponse_(data) { return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }
function id_(value) { return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value); }
function timestamp_(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
}
function integer_(value, max) { return Number.isSafeInteger(value) && value >= 0 && value <= max; }
function validateBatch_(input) {
  require_(object_(input) && input.schema_version === 1 && input.game === 'sudoku', 'invalid_schema');
  require_(id_(input.batch_id) && timestamp_(input.sent_at) && Date.parse(input.sent_at) <= Date.now() + 86400000, 'invalid_batch');
  require_(Array.isArray(input.runs) && input.runs.length > 0 && input.runs.length <= 20, 'invalid_runs');
  const ids = new Set();
  return { batch_id: input.batch_id, runs: input.runs.map(run => {
    require_(object_(run) && run.schema_version === 1 && run.game === 'sudoku' && id_(run.run_id) && !ids.has(run.run_id), 'invalid_run');
    ids.add(run.run_id);
    const result = { schema_version: 1, game: 'sudoku', run_id: run.run_id };
    require_(integer_(run.revision, 10000000) && run.revision > 0, 'invalid_revision'); result.revision = run.revision;
    for (const field of ['game_version', 'generator_version']) {
      require_(typeof run[field] === 'string' && /^[A-Za-z0-9][A-Za-z0-9._+-]{0,79}$/.test(run[field]), 'invalid_version'); result[field] = run[field];
    }
    require_(typeof run.initial_clues === 'string' && /^[0-9]{81}$/.test(run.initial_clues), 'invalid_puzzle');
    const count = [...run.initial_clues].filter(value => value !== '0').length;
    require_(count >= 17 && run.clue_count === count, 'invalid_clue_count');
    result.initial_clues = run.initial_clues; result.clue_count = count;
    require_(typeof run.check_conflicts === 'boolean', 'invalid_setting'); result.check_conflicts = run.check_conflicts;
    if (run.manual_mode !== undefined) {
      require_(typeof run.manual_mode === 'boolean' && (!run.manual_mode || !run.check_conflicts), 'invalid_mode');
      result.manual_mode = run.manual_mode;
    }
    const puzzleFields = ['requested_difficulty', 'given_difficulty', 'puzzle_generation_ms', 'puzzle_serve_ms', 'difficulty_version'];
    if (puzzleFields.some(field => run[field] !== undefined)) {
      const levels = ['novice', 'easy', 'medium', 'hard'];
      require_(levels.includes(run.requested_difficulty) && levels.includes(run.given_difficulty) &&
        levels.indexOf(run.given_difficulty) <= levels.indexOf(run.requested_difficulty), 'invalid_difficulty');
      require_(integer_(run.puzzle_generation_ms, 300000) && integer_(run.puzzle_serve_ms, 300000), 'invalid_puzzle_timing');
      require_(typeof run.difficulty_version === 'string' && /^[A-Za-z0-9][A-Za-z0-9._+-]{0,79}$/.test(run.difficulty_version), 'invalid_version');
      for (const field of puzzleFields) result[field] = run[field];
    }
    require_(['production', 'preview', 'development', 'unknown'].includes(run.environment), 'invalid_environment'); result.environment = run.environment;
    require_(run.build_id === 'unknown' || typeof run.build_id === 'string' && /^sha256-[a-f0-9]{16}$/.test(run.build_id), 'invalid_build'); result.build_id = run.build_id;
    require_(object_(run.device) && ['desktop', 'mobile', 'tablet', 'unknown'].includes(run.device.category) &&
      ['mouse', 'touch', 'mixed', 'unknown'].includes(run.device.input) && ['small', 'medium', 'large', 'unknown'].includes(run.device.viewport), 'invalid_device');
    result.device = { category: run.device.category, input: run.device.input, viewport: run.device.viewport };
    require_(timestamp_(run.started_at) && timestamp_(run.updated_at) && Date.parse(run.updated_at) >= Date.parse(run.started_at) && Date.parse(run.updated_at) <= Date.now() + 86400000, 'invalid_time');
    result.started_at = run.started_at; result.updated_at = run.updated_at;
    require_(['in_progress', 'completed', 'solver_revealed', 'restarted', 'settings_changed'].includes(run.outcome), 'invalid_outcome'); result.outcome = run.outcome;
    require_(run.outcome === 'in_progress' ? run.ended_at === null : run.ended_at === run.updated_at, 'invalid_ended_at'); result.ended_at = run.ended_at;
    for (const field of ['elapsed_ms', 'wall_elapsed_ms', 'foreground_ms']) {
      require_(integer_(run[field], MAX_DURATION), 'invalid_duration'); result[field] = run[field];
    }
    require_(run.foreground_ms <= run.wall_elapsed_ms + 1000 && run.elapsed_ms <= run.wall_elapsed_ms + 1000, 'invalid_duration');
    require_(integer_(run.filled, 81 - count) && integer_(run.peak_filled, 81 - count) && run.peak_filled >= run.filled, 'invalid_progress');
    require_(run.outcome !== 'completed' || run.filled === 81 - count, 'invalid_completion');
    result.filled = run.filled; result.peak_filled = run.peak_filled;
    require_(object_(run.counters), 'invalid_counters'); result.counters = {};
    for (const field of COUNTERS) { require_(integer_(run.counters[field], 10000000), 'invalid_counter'); result.counters[field] = run.counters[field]; }
    // Unknown caller fields are deliberately discarded, never archived.
    return result;
  }) };
}
