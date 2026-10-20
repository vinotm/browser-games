/* Editor-only setup for a new, empty destination. Never call from a web handler. */
function initializeNewAnalyticsBudget() {
  const lock = LockService.getScriptLock();
  require_(lock.tryLock(5000), 'busy');
  try {
    const properties = PropertiesService.getScriptProperties();
    require_(properties.getProperty('INGEST_ENABLED') === 'false', 'disable_ingestion_first');
    // Never reset an existing ledger, even if it is corrupt or its folder was emptied.
    require_(properties.getProperty(BUDGET_KEY) === null, 'budget_already_exists');
    const folderId = receiverFolderId_();
    require_(folderId, 'not_configured');
    const folder = DriveApp.getFolderById(folderId);
    require_(!folder.getFiles().hasNext() && !folder.getFolders().hasNext(), 'destination_not_empty');
    const now = Date.now();
    properties.setProperty(BUDGET_KEY, JSON.stringify({ version: 1, folder_id: folderId,
      files: 0, bytes: 0, day_files: 0, day_bytes: 0,
      day: Utilities.formatDate(new Date(now), 'Asia/Jakarta', 'yyyy-MM-dd'),
      tokens: HARDENING.burst, token_at: now }));
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}
