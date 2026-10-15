// Coarse, best-effort device metadata. No raw user agent or exact dimensions stored.
export function classifyDevice({ mobile = null, coarse = false, fine = false,
  touchPoints = 0, width = 0, height = 0 } = {}) {
  const touch = touchPoints > 0;
  const category = mobile ? 'mobile' : coarse && touch
    ? (Math.min(width, height) >= 600 ? 'tablet' : 'mobile') : fine || mobile === false ? 'desktop' : 'unknown';
  return { category, input: touch ? (fine ? 'mixed' : 'touch') : fine ? 'mouse' : 'unknown',
    viewport: width <= 0 ? 'unknown' : width < 600 ? 'small' : width < 1024 ? 'medium' : 'large' };
}

export function describeDevice(environment = globalThis) {
  return classifyDevice({ mobile: environment.navigator?.userAgentData?.mobile ?? null,
    coarse: environment.matchMedia?.('(pointer: coarse)').matches ?? false,
    fine: environment.matchMedia?.('(pointer: fine)').matches ?? false,
    touchPoints: environment.navigator?.maxTouchPoints ?? 0,
    width: environment.innerWidth ?? 0, height: environment.innerHeight ?? 0 });
}
