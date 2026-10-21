/* Anonymous SOS summaries. No gameplay read endpoint or browser credentials. */
const HARDENING = Object.freeze({ version: 'sos-summary-v1',
  bytes: 1000000000, files: 1000000, burst: 30, perSecond: 0.5,
  dailyFiles: 5000, dailyBytes: 20000000, lockMs: 1000 });
const BUDGET_KEY = 'ANALYTICS_BUDGET_V1';
const MAX_BODY = 60000;
const MAX_DURATION = 365 * 24 * 60 * 60 * 1000;
function doGet() {
  return jsonResponse_({ ok: true, service: 'sos-analytics', schema_version: 1, storage: 'json.gz' });
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
      const name = 'sos_run_' + run.run_id + '.json.gz';
      const matches = folder.getFilesByName(name);
      const file = matches.hasNext() ? matches.next() : null;
      const digest = digest_(run);
      if (file) {
        require_(file.getSize() <= MAX_BODY, 'invalid_existing_archive');
        const stored = JSON.parse(Utilities.ungzip(file.getBlob()).getDataAsString('UTF-8'));
        const previous = stored.run;
        require_(previous && previous.run_id === run.run_id, 'invalid_existing_archive');
        for (const field of ['started_at', 'game_version', 'rules_version', 'build_id', 'environment', 'size', 'mode', 'difficulty', 'first_player']) {
          require_(previous[field] === run[field], 'run_id_conflict');
        }
        require_(JSON.stringify(previous.device) === JSON.stringify(run.device), 'run_id_conflict');
        if (previous.revision > run.revision) continue;
        if (previous.revision === run.revision) {
          require_(stored.payload_sha256 === digest, 'revision_conflict'); continue;
        }
        require_(previous.outcome === 'in_progress', 'run_already_finished');
        require_(Date.parse(run.updated_at) >= Date.parse(previous.updated_at), 'invalid_revision');
        for (const field of ['elapsed_ms', 'foreground_ms']) require_(run[field] >= previous[field], 'invalid_revision');
        require_(run.moves.length >= previous.moves.length, 'invalid_revision');
        for (let i = 0; i < previous.moves.length; i++) require_(JSON.stringify(run.moves[i]) === JSON.stringify(previous.moves[i]), 'invalid_revision');
        for (const field of ['decisions', 'search_ms', 'nodes', 'budget_hits', 'random_moves']) require_(run.ai[field] >= previous.ai[field], 'invalid_revision');
      }
      const archive = { schema_version: 1, game: 'sos', received_at: new Date(now).toISOString(),
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
    console.log('SOS analytics ready: ' + folder.getName());
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
  require_(object_(input) && input.schema_version === 1 && input.game === 'sos', 'invalid_schema');
  require_(id_(input.batch_id) && timestamp_(input.sent_at) && Date.parse(input.sent_at) <= Date.now() + 86400000, 'invalid_batch');
  require_(Array.isArray(input.runs) && input.runs.length > 0 && input.runs.length <= 20, 'invalid_runs');
  const ids = new Set();
  return { batch_id: input.batch_id, runs: input.runs.map(run => {
    require_(object_(run) && run.schema_version === 1 && run.game === 'sos' && id_(run.run_id) && !ids.has(run.run_id), 'invalid_run');
    ids.add(run.run_id);
    const result = { schema_version: 1, game: 'sos', run_id: run.run_id };
    require_(integer_(run.revision, 10000000) && run.revision > 0, 'invalid_revision'); result.revision = run.revision;
    require_(typeof run.game_version === 'string' && /^[A-Za-z0-9][A-Za-z0-9._+-]{0,79}$/.test(run.game_version), 'invalid_version');
    require_(run.rules_version === 'per-player-limit-v1', 'invalid_rules');
    result.game_version = run.game_version; result.rules_version = run.rules_version;
    require_([4, 6, 8, 10].includes(run.size) && ['computer', 'local'].includes(run.mode) &&
      (run.mode === 'computer' ? ['easy', 'medium', 'hard'].includes(run.difficulty) : run.difficulty === null) &&
      [0, 1].includes(run.first_player), 'invalid_setting');
    for (const field of ['size', 'mode', 'difficulty', 'first_player']) result[field] = run[field];
    require_(['production', 'preview', 'development', 'unknown'].includes(run.environment), 'invalid_environment'); result.environment = run.environment;
    require_(run.build_id === 'unknown' || typeof run.build_id === 'string' && /^sha256-[a-f0-9]{16}$/.test(run.build_id), 'invalid_build'); result.build_id = run.build_id;
    require_(object_(run.device) && ['desktop', 'mobile', 'tablet', 'unknown'].includes(run.device.category) &&
      ['mouse', 'touch', 'mixed', 'unknown'].includes(run.device.input) && ['small', 'medium', 'large', 'unknown'].includes(run.device.viewport), 'invalid_device');
    result.device = { category: run.device.category, input: run.device.input, viewport: run.device.viewport };
    require_(timestamp_(run.started_at) && timestamp_(run.updated_at) && Date.parse(run.updated_at) >= Date.parse(run.started_at) && Date.parse(run.updated_at) <= Date.now() + 86400000, 'invalid_time');
    result.started_at = run.started_at; result.updated_at = run.updated_at;
    require_(['in_progress', 'completed', 'restarted'].includes(run.outcome), 'invalid_outcome'); result.outcome = run.outcome;
    require_(run.outcome === 'in_progress' ? run.ended_at === null : run.ended_at === run.updated_at, 'invalid_ended_at'); result.ended_at = run.ended_at;
    for (const field of ['elapsed_ms', 'foreground_ms']) {
      require_(integer_(run[field], MAX_DURATION), 'invalid_duration'); result[field] = run[field];
    }
    require_(run.foreground_ms <= run.elapsed_ms, 'invalid_duration');
    require_(Array.isArray(run.moves) && run.moves.length <= run.size * run.size, 'invalid_moves');
    let time = 0;
    result.moves = run.moves.map(move => {
      require_(Array.isArray(move) && move.length === 3 && integer_(move[0], run.size * run.size - 1) &&
        [0, 1].includes(move[1]) && integer_(move[2], run.elapsed_ms) && move[2] >= time, 'invalid_move');
      time = move[2]; return [move[0], move[1], move[2]];
    });
    const replay = replay_(result);
    require_(run.outcome === 'completed' ? replay.full : !replay.full, 'invalid_completion');
    require_(object_(run.ai), 'invalid_ai'); result.ai = {};
    for (const [field, max] of [['decisions', 100], ['search_ms', MAX_DURATION], ['nodes', 100000000], ['budget_hits', 100], ['random_moves', 100]]) {
      require_(integer_(run.ai[field], max), 'invalid_ai'); result.ai[field] = run.ai[field];
    }
    require_(run.ai.decisions === (run.mode === 'computer' ? replay.moves[1] : 0) &&
      run.ai.budget_hits <= run.ai.decisions && run.ai.random_moves <= run.ai.decisions &&
      (run.mode !== 'local' || Object.keys(result.ai).every(field => result.ai[field] === 0)), 'invalid_ai');
    // Unknown fields (including names and free text) are never archived.
    return result;
  }) };
}

// Mirrors per-player-limit-v1. Keep synthetic replay parity tests with browser rules.
// Internal consistency checks do not authenticate client-reported gameplay.
function replay_(run) {
  const size = run.size, cells = Array(size * size).fill(''), scores = [0, 0], moves = [0, 0];
  const streaks = [{ letter: '', count: 0 }, { letter: '', count: 0 }];
  let player = run.first_player;
  for (const move of run.moves) {
    const index = move[0], letter = move[1] === 0 ? 'S' : 'O', streak = streaks[player];
    require_(!cells[index] && !(streak.letter === letter && streak.count >= 2), 'illegal_move');
    cells[index] = letter; moves[player]++;
    streak.count = streak.letter === letter ? streak.count + 1 : 1; streak.letter = letter;
    let gain = 0;
    const row = Math.floor(index / size), col = index % size;
    for (const direction of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      for (let offset = -2; offset <= 0; offset++) {
        let word = '';
        for (let k = 0; k < 3; k++) {
          const r = row + (offset + k) * direction[0], c = col + (offset + k) * direction[1];
          if (r >= 0 && r < size && c >= 0 && c < size) word += cells[r * size + c] || '.';
        }
        if (word === 'SOS') gain++;
      }
    }
    scores[player] += gain;
    if (!gain) player = 1 - player;
  }
  return { scores, moves, player, full: run.moves.length === size * size };
}
