// Deployment configuration contains public settings only, never credentials.
export async function loadDeploymentConfig(url, fetcher = globalThis.fetch?.bind(globalThis)) {
  const defaults = { analyticsEndpoint: '', environment: 'unknown', buildId: 'unknown' };
  if (!fetcher) return defaults;
  try {
    const response = await fetcher(url, { cache: 'no-store', credentials: 'same-origin',
      signal: AbortSignal.timeout(2000) });
    if (!response.ok) return defaults;
    const config = await response.json();
    if (!config || typeof config !== 'object') return defaults;
    const settings = { ...defaults };
    if (['development', 'preview', 'production'].includes(config.environment)) settings.environment = config.environment;
    if (typeof config.buildId === 'string' && /^sha256-[a-f0-9]{16}$/.test(config.buildId)) settings.buildId = config.buildId;
    try {
      const endpoint = new URL(config.analyticsEndpoint);
      if (endpoint.protocol === 'https:' && !endpoint.username && !endpoint.password && !endpoint.hash) {
        settings.analyticsEndpoint = endpoint.href;
      }
    } catch { /* Invalid endpoint leaves collection disabled, but keeps build metadata. */ }
    return settings;
  } catch {
    // Missing configuration and offline play must never prevent initialization.
    return defaults;
  }
}
