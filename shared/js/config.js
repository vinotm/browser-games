// Deployment configuration contains public settings only, never credentials.
export async function loadDeploymentConfig(url, fetcher = globalThis.fetch?.bind(globalThis)) {
  const defaults = { analyticsEndpoint: '' };
  if (!fetcher) return defaults;
  try {
    const response = await fetcher(url, { cache: 'no-store', credentials: 'same-origin',
      signal: AbortSignal.timeout(2000) });
    if (!response.ok) return defaults;
    const config = await response.json();
    if (!config || typeof config.analyticsEndpoint !== 'string' || !config.analyticsEndpoint) return defaults;
    const endpoint = new URL(config.analyticsEndpoint);
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.hash) return defaults;
    return { analyticsEndpoint: endpoint.href };
  } catch {
    // Missing configuration and offline play must never prevent initialization.
    return defaults;
  }
}
